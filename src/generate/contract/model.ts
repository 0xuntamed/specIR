import type { Access, Endpoint, Field, Param, Spec } from "../../ir/types";
import { pathParams } from "../../validate/context";
import { writeSchemas } from "../backend-node/schemas";
import { backendSlots } from "../backend-node/slots";
import { columnsOf, entityNamed, loginField, type Column } from "../model";
import { pascal } from "../names";

// The API contract, derived once from the IR and rendered twice: as OpenAPI
// and as the typed client. Keeping one model means the two can't disagree.

export type Prop = {
  name: string;
  type: Field["type"] | "ref";
  ref?: string; // schema name when type is "ref"
  values: string[]; // enum values
  nullable: boolean;
  optional: boolean;
  minLength?: number;
};

export type Schema = { name: string; props: Prop[]; closed: boolean; minProperties?: number };

export type Body = { kind: "schema"; name: string; omit: string[] } | { kind: "inputs"; props: Prop[] };

export type Response =
  | { kind: "schema"; name: string }
  | { kind: "list"; item: string; pagination?: { defaultLimit: number; maxLimit: number } }
  | { kind: "binary"; contentType: string }
  | { kind: "empty" };

export type Operation = {
  id: string;
  method: Endpoint["method"];
  path: string; // IR form: /invoices/:id
  auth: Access;
  description?: string;
  pathParams: Prop[];
  query: Prop[];
  body?: Body;
  status: 200 | 201 | 204;
  response: Response;
  errors: number[];
};

export type Contract = { title: string; schemas: Schema[]; operations: Operation[] };

function columnProp(c: Column, mode: "response" | "create" | "update"): Prop {
  const request = mode !== "response";
  return {
    name: c.prop,
    type: c.kind,
    values: c.values,
    nullable: !c.notNull,
    optional: mode === "update" || (mode === "create" && (!c.notNull || c.default !== undefined)),
    ...(request && c.notNull && (c.kind === "string" || c.kind === "text") ? { minLength: 1 } : {}),
  };
}

function paramProp(p: Param): Prop {
  return {
    name: p.name,
    type: p.type,
    values: p.type === "enum" ? p.values : [],
    nullable: false,
    optional: !p.required,
    ...(p.required && (p.type === "string" || p.type === "text") ? { minLength: 1 } : {}),
  };
}

const uuidParam = (name: string): Prop => ({ name, type: "uuid", values: [], nullable: false, optional: false });

// 401/403 follow from access; everything else is passed in.
function errorsFor(auth: Access, ...codes: number[]): number[] {
  const all = new Set(codes);
  if (auth !== "public") all.add(401);
  if (typeof auth === "object") all.add(403);
  return [...all].sort((a, b) => a - b);
}

function schemasOf(spec: Spec): Schema[] {
  const schemas: Schema[] = [];
  for (const entity of spec.entities) {
    const name = pascal(entity.name);
    const cols = columnsOf(spec, entity);
    schemas.push({ name, props: cols.filter((c) => !c.hidden).map((c) => columnProp(c, "response")), closed: false });
    const writes = writeSchemas(spec, entity);
    const writable = cols.filter((c) => c.writable);
    if (writes.create) schemas.push({ name: `${name}Create`, props: writable.map((c) => columnProp(c, "create")), closed: true });
    if (writes.update) {
      schemas.push({ name: `${name}Update`, props: writable.map((c) => columnProp(c, "update")), closed: true, minProperties: 1 });
    }
  }
  if (spec.auth) {
    const user = pascal(spec.auth.userEntity);
    const create = schemas.find((s) => s.name === `${user}Create`)!;
    const password = (minLength?: number): Prop => ({ name: "password", type: "string", values: [], nullable: false, optional: false, ...(minLength ? { minLength } : {}) });
    const email = loginField(spec);
    schemas.push(
      { name: "RegisterRequest", props: [...create.props, password(8)], closed: true },
      { name: "LoginRequest", props: [{ name: email, type: "email", values: [], nullable: false, optional: false }, password()], closed: true },
      {
        name: "AuthResponse",
        props: [
          { name: "token", type: "string", values: [], nullable: false, optional: false },
          { name: "user", type: "ref", ref: user, values: [], nullable: false, optional: false },
        ],
        closed: false,
      },
    );
  }
  return schemas;
}

function operationsOf(spec: Spec): Operation[] {
  const ops: Operation[] = [];

  if (spec.auth) {
    const user = pascal(spec.auth.userEntity);
    const post = { method: "POST" as const, auth: "public" as const, pathParams: [], query: [] };
    ops.push(
      { ...post, id: "auth.register", path: "/auth/register", body: { kind: "schema", name: "RegisterRequest", omit: [] }, status: 201, response: { kind: "schema", name: "AuthResponse" }, errors: [400, 409] },
      { ...post, id: "auth.login", path: "/auth/login", body: { kind: "schema", name: "LoginRequest", omit: [] }, status: 200, response: { kind: "schema", name: "AuthResponse" }, errors: [400, 401] },
      { id: "auth.me", method: "GET", path: "/auth/me", auth: "user", pathParams: [], query: [], status: 200, response: { kind: "schema", name: user }, errors: [401, 404] },
    );
  }

  const slots = backendSlots(spec);
  for (const ep of spec.endpoints) {
    const params = pathParams(ep.path);
    if (ep.kind === "crud") {
      const name = pascal(entityNamed(spec, ep.entity).name);
      const parents = params.filter((p) => p !== "id");
      const base = { id: ep.id, method: ep.method, path: ep.path, auth: ep.auth, pathParams: params.map(uuidParam), query: [] };
      const nested = parents.length > 0 ? [404] : [];
      switch (ep.op) {
        case "list":
          ops.push({ ...base, status: 200, response: { kind: "list", item: name, ...(ep.pagination ? { pagination: ep.pagination } : {}) }, errors: errorsFor(ep.auth, ...(ep.pagination || parents.length ? [400] : []), ...nested) });
          break;
        case "get":
          ops.push({ ...base, status: 200, response: { kind: "schema", name }, errors: errorsFor(ep.auth, 400, 404) });
          break;
        case "create":
          ops.push({ ...base, body: { kind: "schema", name: `${name}Create`, omit: parents }, status: 201, response: { kind: "schema", name }, errors: errorsFor(ep.auth, 400, 409, ...nested) });
          break;
        case "update":
          ops.push({ ...base, body: { kind: "schema", name: `${name}Update`, omit: [] }, status: 200, response: { kind: "schema", name }, errors: errorsFor(ep.auth, 400, 404, 409) });
          break;
        case "delete":
          ops.push({ ...base, status: 204, response: { kind: "empty" }, errors: errorsFor(ep.auth, 400, 404, 409) });
          break;
      }
      continue;
    }

    const slot = slots.find((s) => "endpoint" in s && s.endpoint.id === ep.id)!.slot;
    const inputs = slot.inputs.map(paramProp);
    const rest = inputs.filter((p) => !params.includes(p.name));
    const inQuery = ep.method === "GET" || ep.method === "DELETE";
    const output = slot.output;
    ops.push({
      id: ep.id,
      method: ep.method,
      path: ep.path,
      auth: ep.auth,
      description: slot.intent,
      pathParams: params.map((p) => inputs.find((i) => i.name === p)!),
      query: inQuery ? rest : [],
      ...(!inQuery && rest.length > 0 ? { body: { kind: "inputs" as const, props: rest } } : {}),
      status: output.kind === "void" ? 204 : 200,
      response:
        output.kind === "entity"
          ? { kind: "schema", name: pascal(output.entity) }
          : output.kind === "binary"
            ? { kind: "binary", contentType: output.contentType }
            : { kind: "empty" },
      errors: errorsFor(ep.auth, 400, ...(ep.entity ? [404] : []), 501),
    });
  }
  return ops;
}

export function contractOf(spec: Spec): Contract {
  return { title: spec.app.name, schemas: schemasOf(spec), operations: operationsOf(spec) };
}
