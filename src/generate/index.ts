import type { Spec } from "../ir/types";
import { authModule } from "./backend-node/auth";
import { contextModule, emailModule, envModule, errorsModule, packageJson, serverModule, tsconfig, tsconfigBuild } from "./backend-node/app";
import { contractCheckModule } from "./backend-node/contract-check";
import { dbClient, dbMigrate, drizzleSchema, migrationSql } from "./backend-node/db";
import { crudRoutesModule, loaderEntities, loadersModule, type CrudEndpoint } from "./backend-node/routes";
import { entitySchemas } from "./backend-node/schemas";
import { backendSlots, customRoutesModule, jobsModule, slotModule } from "./backend-node/slots";
import { clientModule } from "./contract/client";
import { contractOf } from "./contract/model";
import { openapiJson } from "./contract/openapi";
import { apiModule, indexHtml, layoutModule, mainModule, nginxConf, sessionModule, viteConfig, webDockerfile, webPackageJson, webTsconfig } from "./frontend-react/app";
import { fieldsModule, hooksModule, kitModule, stylesCss } from "./frontend-react/kit";
import { pageComponentModule, pageSlotModule } from "./frontend-react/pages";
import { siteOf } from "./frontend-react/site";
import { dockerCompose, dockerfile, envExample, ignoreFile } from "./infra/index";
import { camel } from "./names";

// Spec (already validated) → output files, keyed by path and sorted, so the
// same spec always yields byte-identical output.
//
//   docker-compose.yml, .env.example   run everything
//   contract/                          OpenAPI + typed client, language-agnostic
//   api/                               the Node backend (a Go emitter would replace only this)
//   web/                               React + Vite frontend, served by nginx
export function generate(spec: Spec): Map<string, string> {
  const files = new Map<string, string>();
  const add = (path: string, content: string) => files.set(path, content);

  add("docker-compose.yml", dockerCompose(spec));
  add(".env.example", envExample(spec));
  add(".gitignore", ignoreFile(["node_modules", "dist", ".env"]));
  // For the web image, which builds from the root (it needs contract/).
  add(".dockerignore", ignoreFile(["**/node_modules", "**/dist", ".env", "api"]));

  const contract = contractOf(spec);
  add("contract/openapi.json", openapiJson(contract));
  add("contract/client.ts", clientModule(contract));

  add("api/package.json", packageJson(spec));
  add("api/tsconfig.json", tsconfig());
  add("api/tsconfig.build.json", tsconfigBuild());
  add("api/Dockerfile", dockerfile());
  add("api/.dockerignore", ignoreFile(["node_modules", "dist"]));
  add("api/contract.check.ts", contractCheckModule(spec));

  add("api/migrations/0000_init.sql", migrationSql(spec));
  add("api/src/db/schema.ts", drizzleSchema(spec));
  add("api/src/db/client.ts", dbClient());
  add("api/src/db/migrate.ts", dbMigrate());
  add("api/src/env.ts", envModule(spec));
  add("api/src/lib/errors.ts", errorsModule());
  for (const entity of spec.entities) add(`api/src/schemas/${camel(entity.name)}.ts`, entitySchemas(spec, entity));

  if (spec.auth) add("api/src/auth.ts", authModule(spec));
  if (loaderEntities(spec).length > 0) add("api/src/lib/load.ts", loadersModule(spec));

  const routeEntities: string[] = [];
  for (const entity of spec.entities) {
    const endpoints = spec.endpoints.filter((ep): ep is CrudEndpoint => ep.kind === "crud" && ep.entity === entity.name);
    if (endpoints.length === 0) continue;
    routeEntities.push(entity.name);
    add(`api/src/routes/${camel(entity.name)}.ts`, crudRoutesModule(spec, entity, endpoints));
  }

  const slots = backendSlots(spec);
  if (slots.length > 0) add("api/src/lib/context.ts", contextModule(spec));
  for (const item of slots) add(`api/src/slots/${item.slot.id}.ts`, slotModule(item));
  if (spec.endpoints.some((ep) => ep.kind === "custom")) add("api/src/routes/custom.ts", customRoutesModule(spec));
  if (spec.jobs.length > 0) add("api/src/jobs.ts", jobsModule(spec));
  if (spec.integrations.some((i) => i.kind === "email")) add("api/src/integrations/email.ts", emailModule());

  add("api/src/server.ts", serverModule(spec, routeEntities));

  if (spec.pages.length > 0) {
    const site = siteOf(spec);
    add("web/package.json", webPackageJson(spec));
    add("web/tsconfig.json", webTsconfig());
    add("web/vite.config.ts", viteConfig());
    add("web/index.html", indexHtml(spec));
    add("web/Dockerfile", webDockerfile());
    add("web/nginx.conf", nginxConf());
    add("web/src/main.tsx", mainModule(site));
    add("web/src/api.ts", apiModule());
    add("web/src/session.tsx", sessionModule(spec, site));
    add("web/src/styles.css", stylesCss());
    add("web/src/lib/fields.ts", fieldsModule());
    add("web/src/lib/hooks.ts", hooksModule());
    add("web/src/components/kit.tsx", kitModule());
    add("web/src/components/Layout.tsx", layoutModule(spec, site));
    for (const sp of site.pages) {
      add(`web/src/pages/${sp.file}.tsx`, pageComponentModule(spec, site, sp));
      if (sp.plan.kind === "custom") add(`web/src/slots/${sp.page.slot}.tsx`, pageSlotModule(spec, sp));
    }
  }

  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
