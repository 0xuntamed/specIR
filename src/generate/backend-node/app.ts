import type { Spec } from "../../ir/types";
import { Imports } from "../imports";
import { camel, HEADER, MARKER } from "../names";
import { backendSlots } from "./slots";

// Pinned ranges; the generated app has no lockfile yet.
const VERSIONS = {
  "@fastify/jwt": "^10.2.2",
  "@types/node": "^22.20.4",
  "@types/pg": "^8.23.1",
  croner: "^10.0.1",
  "drizzle-orm": "^0.45.3",
  fastify: "^5.12.5",
  pg: "^8.23.0",
  tsx: "^4.23.15",
  typescript: "^7.0.2",
  zod: "^4.6.5",
};
const pick = (names: string[]) => Object.fromEntries(names.sort().map((n) => [n, VERSIONS[n as keyof typeof VERSIONS]]));

export function packageJson(spec: Spec): string {
  const deps = ["drizzle-orm", "fastify", "pg", "zod"];
  if (spec.auth) deps.push("@fastify/jwt");
  if (spec.jobs.length > 0) deps.push("croner");
  const pkg = {
    "//": `${MARKER} — do not edit`,
    name: spec.app.name,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { build: "tsc", start: "node dist/server.js", typecheck: "tsc --noEmit" },
    dependencies: pick(deps),
    devDependencies: pick(["@types/node", "@types/pg", "tsx", "typescript"]),
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function tsconfig(): string {
  return `${HEADER}
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
`;
}

export function envModule(spec: Spec): string {
  const vars = ["    DATABASE_URL: z.string().min(1),"];
  if (spec.auth) vars.push('    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),');
  vars.push("    PORT: z.coerce.number().int().default(3000),");
  if (spec.integrations.some((i) => i.kind === "email")) {
    vars.push("    RESEND_API_KEY: z.string().optional(),", "    EMAIL_FROM: z.string().optional(),");
  }
  return `${HEADER}
import { z } from "zod";

// Fails at boot, not on first use, when configuration is missing.
export const env = z
  .object({
${vars.join("\n")}
  })
  .parse(process.env);
`;
}

export function errorsModule(): string {
  return `${HEADER}
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Thrown by slot stubs until the slot is implemented; routes answer 501.
export class NotImplemented extends Error {
  constructor(slot: string) {
    super(\`Slot \${slot} is not implemented yet\`);
  }
}
`;
}

export function emailModule(): string {
  return `${HEADER}
import { env } from "../env.js";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
};

// Sends through Resend's HTTP API. With an idempotencyKey, a retried send
// returns the original result instead of emailing twice.
export async function sendEmail(message: EmailMessage, options: { idempotencyKey?: string } = {}): Promise<{ id: string }> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set to send email");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${env.RESEND_API_KEY}\`,
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  if (!response.ok) throw new Error(\`Resend responded \${response.status}: \${await response.text()}\`);
  return (await response.json()) as { id: string };
}
`;
}

// src/lib/context.ts: what slots receive. Only generated when there are backend slots.
export function contextModule(spec: Spec): string {
  const slots = backendSlots(spec);
  const email = spec.integrations.some((i) => i.kind === "email");
  const imports = new Imports().add("fastify", "type FastifyBaseLogger").add("../db/client.js", "db", "type Db");
  if (spec.auth) imports.add("../auth.js", "type AuthUser");
  if (email) imports.add("../integrations/email.js", "sendEmail");

  const fields = ["  db: Db;", "  log: FastifyBaseLogger;", `  user: ${spec.auth ? "AuthUser | null" : "null"};`];
  if (email) fields.push("  email: { send: typeof sendEmail };");
  const shared = email ? "db, log, email: { send: sendEmail }" : "db, log";

  const out = [
    HEADER,
    ...imports.render(),
    "",
    "// Everything a slot may use. Slots never check access: routes authenticate the",
    "// user and load + owner-check guarded rows before calling them.",
    "export type SlotContext = {",
    ...fields,
    "};",
  ];
  if (slots.some((s) => "endpoint" in s)) {
    out.push(
      "",
      `export function slotContext(log: FastifyBaseLogger, user: ${spec.auth ? "AuthUser | null" : "null"}): SlotContext {`,
      `  return { ${shared}, user };`,
      "}",
    );
  }
  if (spec.jobs.length > 0) {
    out.push(
      "",
      'export type JobContext = Omit<SlotContext, "user"> & {',
      "  job: { id: string; attempt: number; retries: number };",
      "};",
      "",
      'export function jobContext(log: FastifyBaseLogger, job: JobContext["job"]): JobContext {',
      `  return { ${shared}, job };`,
      "}",
    );
  }
  return `${out.join("\n")}\n`;
}

// src/server.ts: plugins, error mapping, routes, migrations, jobs, shutdown.
export function serverModule(spec: Spec, routeEntities: string[]): string {
  const hasCustom = spec.endpoints.some((ep) => ep.kind === "custom");
  const hasJobs = spec.jobs.length > 0;
  const imports = new Imports()
    .add("fastify", "type FastifyError")
    .add("zod", "ZodError")
    .add("./db/client.js", "pool")
    .add("./db/migrate.js", "migrate")
    .add("./env.js", "env")
    .add("./lib/errors.js", "HttpError", "NotImplemented");
  const registrations: string[] = [];
  if (spec.auth) {
    imports.add("./auth.js", "authRoutes");
    registrations.push("await app.register(authRoutes);");
  }
  for (const name of routeEntities) {
    imports.add(`./routes/${camel(name)}.js`, `${camel(name)}Routes`);
    registrations.push(`await app.register(${camel(name)}Routes);`);
  }
  if (hasCustom) {
    imports.add("./routes/custom.js", "customRoutes");
    registrations.push("await app.register(customRoutes);");
  }
  if (hasJobs) imports.add("./jobs.js", "startJobs");

  return `${HEADER}
${spec.auth ? 'import jwt from "@fastify/jwt";\n' : ""}import Fastify from "fastify";
${imports.render().join("\n")}

const app = Fastify({ logger: true });
${spec.auth ? "await app.register(jwt, { secret: env.JWT_SECRET });\n" : ""}
app.setErrorHandler((err: FastifyError, request, reply) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
    return reply.status(400).send({ error: "Invalid request", issues });
  }
  if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message });
  if (err instanceof NotImplemented) return reply.status(501).send({ error: err.message });
  const code = postgresCode(err);
  if (code === "23505") return reply.status(409).send({ error: "Already exists" });
  if (code === "23503") return reply.status(409).send({ error: "Conflicts with related records" });
  if (err.statusCode !== undefined && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
  request.log.error(err);
  return reply.status(500).send({ error: "Internal server error" });
});

// node-postgres errors carry a 5-character SQLSTATE; Drizzle may wrap them in \`cause\`.
function postgresCode(err: unknown): string | undefined {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

${registrations.join("\n")}

await migrate(pool);
await app.listen({ host: "0.0.0.0", port: env.PORT });
${hasJobs ? "const jobs = startJobs(app.log);\n" : ""}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
${hasJobs ? "    for (const job of jobs) job.stop();\n" : ""}    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}
`;
}
