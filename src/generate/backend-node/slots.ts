import type { Endpoint, Job, Slot, Spec } from "../../ir/types";
import { pathParams } from "../../validate/context";
import { Imports } from "../imports";
import { requestZod } from "../model";
import { camel, HEADER, MARKER, pascal, wrap } from "../names";
import { routeOptions } from "./routes";

type CustomEndpoint = Extract<Endpoint, { kind: "custom" }>;

// Slot regions: the only parts of a generated file the writer preserves.
export const regionBegin = (id: string) => `// @appspec:slot ${id} begin`;
export const regionEnd = (id: string) => `// @appspec:slot ${id} end`;

// Each backend slot has exactly one caller (rule 10). Page slots are frontend.
export type BackendSlot = { slot: Slot } & ({ endpoint: CustomEndpoint } | { job: Job });

export function backendSlots(spec: Spec): BackendSlot[] {
  const slot = (id: string | undefined) => spec.slots.find((s) => s.id === id)!;
  return [
    ...spec.endpoints.flatMap((ep) => (ep.kind === "custom" ? [{ slot: slot(ep.slot), endpoint: ep }] : [])),
    ...spec.jobs.map((job) => ({ slot: slot(job.slot), job })),
  ];
}

// Endpoint input sources: path params and query strings arrive as text.
function inputFromString(ep: CustomEndpoint, name: string): boolean {
  return pathParams(ep.path).includes(name) || ep.method === "GET" || ep.method === "DELETE";
}

function outputType(slot: Slot, imports: Imports): string {
  switch (slot.output.kind) {
    case "void":
      return "void";
    case "binary":
      return "Buffer";
    case "entity":
      imports.add("../db/schema.js", `type ${pascal(slot.output.entity)}Row`);
      return `${pascal(slot.output.entity)}Row`;
  }
}

// src/slots/<id>.ts: typed contract (regenerated) + slot regions (preserved).
export function slotModule(item: BackendSlot): string {
  const { slot } = item;
  const Name = pascal(slot.id);
  const imports = new Imports().add("../lib/errors.js", "NotImplemented");
  const doc: string[] = [];
  let signature: string;
  const contract: string[] = [];

  if ("endpoint" in item) {
    const ep = item.endpoint;
    imports.add("../lib/context.js", "type SlotContext").add("zod", "z");
    doc.push(`// Called by ${ep.method} ${ep.path} (${ep.id}).`);
    let loaded = "";
    if (ep.entity !== undefined) {
      imports.add("../db/schema.js", `type ${pascal(ep.entity)}Row`);
      loaded = ` & { ${camel(ep.entity)}: ${pascal(ep.entity)}Row }`;
      doc.push(`// input.${camel(ep.entity)} is loaded and owner-checked before this runs.`);
    }
    contract.push(
      `export const ${Name}Input = z.object({`,
      ...slot.inputs.map((p) => {
        const zod = requestZod(p, inputFromString(ep, p.name));
        return `  ${p.name}: ${p.required ? zod : `${zod}.optional()`},`;
      }),
      "});",
      `export type ${Name}Input = z.infer<typeof ${Name}Input>${loaded};`,
      "",
    );
    signature = `(ctx: SlotContext, input: ${Name}Input): Promise<${outputType(slot, imports)}>`;
  } else {
    const { job } = item;
    imports.add("../lib/context.js", "type JobContext");
    const key = job.idempotencyKey ? ` Idempotency key: ${job.idempotencyKey}.` : "";
    doc.push(`// Called by job ${job.id} on cron "${job.trigger.schedule}", retried up to ${job.retries} times (ctx.job).${key}`);
    signature = "(ctx: JobContext): Promise<void>";
  }

  return [
    `// ${MARKER} — do not edit outside @appspec:slot regions`,
    ...imports.render(),
    "",
    regionBegin(`${slot.id}:imports`),
    regionEnd(`${slot.id}:imports`),
    "",
    ...contract,
    ...doc,
    "//",
    ...wrap(slot.intent, "// "),
    `export async function ${slot.id}${signature} {`,
    `  ${regionBegin(slot.id)}`,
    `  throw new NotImplemented(${JSON.stringify(slot.id)});`,
    `  ${regionEnd(slot.id)}`,
    "}",
    "",
  ].join("\n");
}

// src/routes/custom.ts: custom endpoints → their slots.
export function customRoutesModule(spec: Spec): string {
  const imports = new Imports().add("fastify", "type FastifyInstance").add("../lib/context.js", "slotContext");
  const roles = (spec.auth?.roles.length ?? 0) > 0;

  const handlers = backendSlots(spec).flatMap((item) => {
    if (!("endpoint" in item)) return [];
    const { endpoint: ep, slot } = item;
    const Name = pascal(slot.id);
    imports.add(`../slots/${slot.id}.js`, slot.id, `${Name}Input`);
    const opts = routeOptions(ep.auth, imports, "../auth.js");
    const source = ep.method === "GET" || ep.method === "DELETE" ? "request.query" : "request.body";
    const user = ep.auth === "public" ? "null" : `{ id: request.user.sub${roles ? ", role: request.user.role" : ""} }`;
    const body = [`const input = ${Name}Input.parse({ ...(request.params as object), ...(${source} as object) });`];
    let args = "input";

    if (ep.entity !== undefined) {
      const entity = spec.entities.find((e) => e.name === ep.entity)!;
      const name = camel(ep.entity);
      const param = `${name}Id`;
      imports.add("../lib/load.js", `load${pascal(ep.entity)}`).add("../lib/errors.js", "HttpError");
      const ownerArg = entity.owned ? ", request.user.sub" : "";
      body.push(
        `const ${name} = await load${pascal(ep.entity)}(input.${param}${ownerArg});`,
        `if (!${name}) throw new HttpError(404, "${ep.entity} not found");`,
      );
      args = `{ ...input, ${name} }`;
    }

    const call = `${slot.id}(slotContext(request.log, ${user}), ${args})`;
    let reply = true;
    switch (slot.output.kind) {
      case "void":
        body.push(`await ${call};`, "return reply.status(204).send();");
        break;
      case "binary":
        body.push(`const result = await ${call};`, `return reply.type(${JSON.stringify(slot.output.contentType)}).send(result);`);
        break;
      case "entity": {
        const Schema = pascal(slot.output.entity);
        imports.add(`../schemas/${camel(slot.output.entity)}.js`, Schema);
        body.push(`return ${Schema}.parse(await ${call});`);
        reply = false;
      }
    }

    return [
      [
        `  // ${ep.id} → slot ${slot.id}`,
        `  app.${ep.method.toLowerCase()}(${JSON.stringify(ep.path)}, ${opts}async (request${reply ? ", reply" : ""}) => {`,
        ...body.map((line) => `    ${line}`),
        "  });",
      ].join("\n"),
    ];
  });

  return [HEADER, ...imports.render(), "", "export async function customRoutes(app: FastifyInstance): Promise<void> {", handlers.join("\n\n"), "}", ""].join(
    "\n",
  );
}

// src/jobs.ts: cron schedule for job slots.
export function jobsModule(spec: Spec): string {
  const imports = new Imports()
    .add("croner", "Cron")
    .add("fastify", "type FastifyBaseLogger")
    .add("./lib/context.js", "jobContext", "type JobContext")
    .add("./lib/errors.js", "NotImplemented");
  const rows = spec.jobs.map((job) => {
    imports.add(`./slots/${job.slot}.js`, job.slot!);
    return `  { id: ${JSON.stringify(job.id)}, schedule: ${JSON.stringify(job.trigger.schedule)}, retries: ${job.retries}, slot: ${job.slot} },`;
  });

  return `${HEADER}
${imports.render().join("\n")}

type Job = { id: string; schedule: string; retries: number; slot: (ctx: JobContext) => Promise<void> };

const JOBS: Job[] = [
${rows.join("\n")}
];

// Runs in the API process. \`protect\` skips a tick while the previous run of
// the same job is still going; SKIP LOCKED in slots handles multiple instances.
export function startJobs(log: FastifyBaseLogger): Cron[] {
  return JOBS.map((job) => {
    log.info(\`job \${job.id} scheduled: \${job.schedule}\`);
    return new Cron(job.schedule, { protect: true }, () => run(job, log));
  });
}

// A failed run is retried up to job.retries times with exponential backoff.
async function run(job: Job, log: FastifyBaseLogger): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await job.slot(jobContext(log, { id: job.id, attempt, retries: job.retries }));
      return;
    } catch (err) {
      if (err instanceof NotImplemented) {
        log.warn(\`job \${job.id}: \${err.message}\`);
        return;
      }
      if (attempt > job.retries) {
        log.error({ err }, \`job \${job.id} failed after \${attempt} attempts\`);
        return;
      }
      log.warn({ err }, \`job \${job.id} attempt \${attempt} failed, retrying\`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
}
`;
}
