// @appspec:generated — do not edit
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { ZodError } from "zod";
import { authRoutes } from "./auth.js";
import { pool } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { env } from "./env.js";
import { startJobs } from "./jobs.js";
import { HttpError, NotImplemented } from "./lib/errors.js";
import { clientRoutes } from "./routes/client.js";
import { customRoutes } from "./routes/custom.js";
import { invoiceRoutes } from "./routes/invoice.js";
import { lineItemRoutes } from "./routes/lineItem.js";

const app = Fastify({ logger: true });
await app.register(jwt, { secret: env.JWT_SECRET });

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

// node-postgres errors carry a 5-character SQLSTATE; Drizzle may wrap them in `cause`.
function postgresCode(err: unknown): string | undefined {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

await app.register(authRoutes);
await app.register(clientRoutes);
await app.register(invoiceRoutes);
await app.register(lineItemRoutes);
await app.register(customRoutes);

await migrate(pool);
await app.listen({ host: "0.0.0.0", port: env.PORT });
const jobs = startJobs(app.log);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    for (const job of jobs) job.stop();
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}
