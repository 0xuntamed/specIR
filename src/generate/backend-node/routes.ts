import type { Access, Endpoint, Entity, Spec } from "../../ir/types";
import { pathParams } from "../../validate/context";
import { Imports } from "../imports";
import { columnsOf, entityNamed } from "../model";
import { camel, HEADER, pascal } from "../names";

export type CrudEndpoint = Extract<Endpoint, { kind: "crud" }>;

// `{ preHandler: ... }` for an access level, or "" for public.
export function routeOptions(auth: Access, imports: Imports, authPath: string): string {
  if (auth === "public") return "";
  if (auth === "user") {
    imports.add(authPath, "authenticate");
    return "{ preHandler: authenticate }, ";
  }
  imports.add(authPath, "requireRole");
  return `{ preHandler: requireRole(${JSON.stringify(auth.role)}) }, `;
}

// The belongsTo relation behind a crud path param: invoiceId → Invoice.
function parentOf(entity: Entity, param: string): Entity["relations"][number] {
  return entity.relations.find((r) => r.kind === "belongsTo" && `${r.name}Id` === param)!;
}

// Entities that need a loader in src/lib/load.ts: parents of nested crud
// routes, owned targets of foreign keys checked on write, custom endpoint guards.
export function loaderEntities(spec: Spec): string[] {
  const needed = new Set<string>();
  for (const ep of spec.endpoints) {
    if (ep.kind === "custom") {
      if (ep.entity !== undefined) needed.add(ep.entity);
      continue;
    }
    const entity = entityNamed(spec, ep.entity);
    for (const p of pathParams(ep.path)) if (p !== "id") needed.add(parentOf(entity, p).target);
    if (ep.scope === "owner" && (ep.op === "create" || ep.op === "update")) {
      for (const r of entity.relations) {
        if (r.kind === "belongsTo" && entityNamed(spec, r.target).owned) needed.add(r.target);
      }
    }
  }
  return spec.entities.filter((e) => needed.has(e.name)).map((e) => e.name);
}

// src/lib/load.ts
export function loadersModule(spec: Spec): string {
  const imports = new Imports().add("drizzle-orm", "and", "eq").add("../db/client.js", "db");
  const fns = loaderEntities(spec).map((name) => {
    const entity = entityNamed(spec, name);
    const table = camel(name);
    imports.add("../db/schema.js", table, `type ${pascal(name)}Row`);
    const conds = [`eq(${table}.id, id)`];
    if (entity.owned) conds.push(`ownerId === undefined ? undefined : eq(${table}.ownerId, ownerId)`);
    if (entity.softDelete) {
      imports.add("drizzle-orm", "isNull");
      conds.push(`isNull(${table}.deletedAt)`);
    }
    return `export async function load${pascal(name)}(id: string${entity.owned ? ", ownerId?: string" : ""}): Promise<${pascal(name)}Row | undefined> {
  const [row] = await db
    .select()
    .from(${table})
    .where(and(${conds.join(", ")}));
  return row;
}`;
  });
  return [
    HEADER,
    ...imports.render(),
    "",
    "// Load one row by id, or undefined. Given an ownerId, only a row that user owns.",
    "// Soft-deleted rows are never returned.",
    fns.join("\n\n"),
    "",
  ].join("\n");
}

// src/routes/<entity>.ts: one handler per crud endpoint of the entity.
export function crudRoutesModule(spec: Spec, entity: Entity, endpoints: CrudEndpoint[]): string {
  const table = camel(entity.name);
  const Schema = pascal(entity.name);
  const cols = columnsOf(spec, entity);
  const imports = new Imports()
    .add("fastify", "type FastifyInstance")
    .add("../db/client.js", "db")
    .add("../db/schema.js", table)
    .add(`../schemas/${table}.js`, Schema);
  const orm = (...names: string[]) => imports.add("drizzle-orm", ...names);
  const httpError = () => imports.add("../lib/errors.js", "HttpError");
  const loader = (name: string) => {
    imports.add("../lib/load.js", `load${pascal(name)}`);
    return `load${pascal(name)}`;
  };

  const handlers = endpoints.map((ep) => {
    const opts = routeOptions(ep.auth, imports, "../auth.js");
    const owner = ep.scope === "owner";
    const params = pathParams(ep.path);
    const parents = params.filter((p) => p !== "id");
    const body: string[] = [];

    if (params.length > 0) {
      imports.add("zod", "z");
      body.push(`const params = z.object({ ${params.map((p) => `${p}: z.uuid()`).join(", ")} }).parse(request.params);`);
    }
    // A nested list/create 404s unless the parent exists (and is the user's).
    if (ep.op === "list" || ep.op === "create") {
      for (const p of parents) {
        const target = entityNamed(spec, parentOf(entity, p).target);
        const ownerArg = owner && target.owned ? ", request.user.sub" : "";
        httpError();
        body.push(`if (!(await ${loader(target.name)}(params.${p}${ownerArg}))) throw new HttpError(404, "${target.name} not found");`);
      }
    }

    // WHERE conditions shared by every op but create.
    const conds: string[] = [];
    if (ep.op !== "list" && ep.op !== "create") conds.push(`eq(${table}.id, params.id)`);
    for (const p of parents) conds.push(`eq(${table}.${p}, params.${p})`);
    if (owner) conds.push(`eq(${table}.ownerId, request.user.sub)`);
    if (entity.softDelete) {
      orm("isNull");
      conds.push(`isNull(${table}.deletedAt)`);
    }
    if (conds.length > 0) orm("and", "eq");
    const where = `and(${conds.join(", ")})`;

    // Writes may only point foreign keys at rows the user owns.
    const fkChecks = (optional: boolean) => {
      if (!owner) return;
      for (const r of entity.relations) {
        const fk = `${r.name}Id`;
        if (r.kind !== "belongsTo" || parents.includes(fk) || !entityNamed(spec, r.target).owned) continue;
        const guard = optional || !r.required ? `body.${fk} != null && ` : "";
        httpError();
        body.push(`if (${guard}!(await ${loader(r.target)}(body.${fk}, request.user.sub))) throw new HttpError(400, "${fk}: ${r.target} not found");`);
      }
    };

    let reply = false;
    switch (ep.op) {
      case "list": {
        const order = entity.timestamps ? `desc(${table}.createdAt), desc(${table}.id)` : `${table}.id`;
        if (entity.timestamps) orm("desc");
        body.push(`const where = ${where};`);
        if (ep.pagination) {
          const { defaultLimit, maxLimit } = ep.pagination;
          imports.add("zod", "z");
          orm("count");
          body.push(
            "const query = z",
            "  .object({",
            `    limit: z.coerce.number().int().min(1).max(${maxLimit}).default(${defaultLimit}),`,
            "    offset: z.coerce.number().int().min(0).default(0),",
            "  })",
            "  .parse(request.query);",
            `const rows = await db.select().from(${table}).where(where).orderBy(${order}).limit(query.limit).offset(query.offset);`,
            `const [counted] = await db.select({ total: count() }).from(${table}).where(where);`,
            `return { items: rows.map((row) => ${Schema}.parse(row)), total: counted?.total ?? 0, limit: query.limit, offset: query.offset };`,
          );
        } else {
          body.push(
            `const rows = await db.select().from(${table}).where(where).orderBy(${order});`,
            `return { items: rows.map((row) => ${Schema}.parse(row)) };`,
          );
        }
        break;
      }
      case "get":
        httpError();
        body.push(
          `const [row] = await db.select().from(${table}).where(${where});`,
          `if (!row) throw new HttpError(404, "${entity.name} not found");`,
          `return ${Schema}.parse(row);`,
        );
        break;
      case "create": {
        imports.add(`../schemas/${table}.js`, `${Schema}Create`);
        const omit = parents.length > 0 ? `.omit({ ${parents.map((p) => `${p}: true`).join(", ")} })` : "";
        body.push(`const body = ${Schema}Create${omit}.parse(request.body);`);
        fkChecks(false);
        const values = ["...body", ...parents.map((p) => `${p}: params.${p}`)];
        if (cols.some((c) => c.prop === "ownerId")) values.push("ownerId: request.user.sub");
        body.push(
          `const [row] = await db.insert(${table}).values({ ${values.join(", ")} }).returning();`,
          `return reply.status(201).send(${Schema}.parse(row));`,
        );
        reply = true;
        break;
      }
      case "update":
        imports.add(`../schemas/${table}.js`, `${Schema}Update`);
        httpError();
        body.push(
          `const body = ${Schema}Update.parse(request.body);`,
          'if (Object.keys(body).length === 0) throw new HttpError(400, "Nothing to update");',
        );
        fkChecks(true);
        body.push(
          `const [row] = await db.update(${table}).set(body).where(${where}).returning();`,
          `if (!row) throw new HttpError(404, "${entity.name} not found");`,
          `return ${Schema}.parse(row);`,
        );
        break;
      case "delete":
        httpError();
        body.push(
          entity.softDelete
            ? `const [row] = await db.update(${table}).set({ deletedAt: new Date() }).where(${where}).returning({ id: ${table}.id });`
            : `const [row] = await db.delete(${table}).where(${where}).returning({ id: ${table}.id });`,
          `if (!row) throw new HttpError(404, "${entity.name} not found");`,
          "return reply.status(204).send();",
        );
        reply = true;
        break;
    }

    const args = reply ? "request, reply" : "request";
    return [
      `  // ${ep.id}`,
      `  app.${ep.method.toLowerCase()}(${JSON.stringify(ep.path)}, ${opts}async (${args}) => {`,
      ...body.map((line) => `    ${line}`),
      "  });",
    ].join("\n");
  });

  return [
    HEADER,
    ...imports.render(),
    "",
    `export async function ${table}Routes(app: FastifyInstance): Promise<void> {`,
    handlers.join("\n\n"),
    "}",
    "",
  ].join("\n");
}
