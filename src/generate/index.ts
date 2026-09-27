import type { Spec } from "../ir/types";
import { authModule } from "./backend-node/auth";
import { contextModule, emailModule, envModule, errorsModule, packageJson, serverModule, tsconfig } from "./backend-node/app";
import { dbClient, dbMigrate, drizzleSchema, migrationSql } from "./backend-node/db";
import { crudRoutesModule, loaderEntities, loadersModule, type CrudEndpoint } from "./backend-node/routes";
import { entitySchemas } from "./backend-node/schemas";
import { backendSlots, customRoutesModule, jobsModule, slotModule } from "./backend-node/slots";
import { dockerCompose, dockerfile, envExample, ignoreFile } from "./infra/index";
import { camel } from "./names";

// Spec (already validated) → output files, keyed by path and sorted, so the
// same spec always yields byte-identical output.
export function generate(spec: Spec): Map<string, string> {
  const files = new Map<string, string>();
  const add = (path: string, content: string) => files.set(path, content);

  add("package.json", packageJson(spec));
  add("tsconfig.json", tsconfig());
  add("Dockerfile", dockerfile());
  add("docker-compose.yml", dockerCompose(spec));
  add(".env.example", envExample(spec));
  add(".dockerignore", ignoreFile(["node_modules", "dist", ".env"]));
  add(".gitignore", ignoreFile(["node_modules", "dist", ".env"]));

  add("migrations/0000_init.sql", migrationSql(spec));
  add("src/db/schema.ts", drizzleSchema(spec));
  add("src/db/client.ts", dbClient());
  add("src/db/migrate.ts", dbMigrate());
  add("src/env.ts", envModule(spec));
  add("src/lib/errors.ts", errorsModule());
  for (const entity of spec.entities) add(`src/schemas/${camel(entity.name)}.ts`, entitySchemas(spec, entity));

  if (spec.auth) add("src/auth.ts", authModule(spec));
  if (loaderEntities(spec).length > 0) add("src/lib/load.ts", loadersModule(spec));

  const routeEntities: string[] = [];
  for (const entity of spec.entities) {
    const endpoints = spec.endpoints.filter((ep): ep is CrudEndpoint => ep.kind === "crud" && ep.entity === entity.name);
    if (endpoints.length === 0) continue;
    routeEntities.push(entity.name);
    add(`src/routes/${camel(entity.name)}.ts`, crudRoutesModule(spec, entity, endpoints));
  }

  const slots = backendSlots(spec);
  if (slots.length > 0) add("src/lib/context.ts", contextModule(spec));
  for (const item of slots) add(`src/slots/${item.slot.id}.ts`, slotModule(item));
  if (spec.endpoints.some((ep) => ep.kind === "custom")) add("src/routes/custom.ts", customRoutesModule(spec));
  if (spec.jobs.length > 0) add("src/jobs.ts", jobsModule(spec));
  if (spec.integrations.some((i) => i.kind === "email")) add("src/integrations/email.ts", emailModule());

  add("src/server.ts", serverModule(spec, routeEntities));

  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
