import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { generate } from "../src/generate/index";
import { writeFiles } from "../src/generate/write";
import { validate } from "../src/validate/index";

const repo = fileURLToPath(new URL("..", import.meta.url));
const specsDir = join(repo, "specs");
// Names become file paths, so only plain kebab-case is accepted.
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

type SpecFile = { name: string; format: "json" | "ts" };

function listSpecs(): SpecFile[] {
  return readdirSync(specsDir)
    .flatMap((file): SpecFile[] => {
      const match = /^(.+)\.(json|ts)$/.exec(file);
      return match && NAME.test(match[1]!) ? [{ name: match[1]!, format: match[2] as SpecFile["format"] }] : [];
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
  const [, , resource, name] = (req.url ?? "").split("?")[0]!.split("/"); // /__studio/<resource>/<name>
  if (req.method === "GET" && resource === "specs" && !name) return send(res, 200, listSpecs());
  if (!name || !NAME.test(name)) return send(res, 400, { error: "spec names are kebab-case, e.g. my-app" });

  if (req.method === "GET" && resource === "specs") {
    const file = listSpecs().find((s) => s.name === name);
    if (!file) return send(res, 404, { error: `no spec named ${name}` });
    const path = join(specsDir, `${name}.${file.format}`);
    // TypeScript specs are loaded through Vite, which compiles them on the fly.
    const spec = file.format === "json" ? JSON.parse(readFileSync(path, "utf8")) : (await server.ssrLoadModule(path)).default;
    return send(res, 200, { ...file, spec });
  }

  if (req.method === "PUT" && resource === "specs") {
    if (existsSync(join(specsDir, `${name}.ts`))) return send(res, 409, { error: `${name}.ts is a hand-written spec; save under another name` });
    writeFileSync(join(specsDir, `${name}.json`), `${JSON.stringify(await readBody(req), null, 2)}\n`);
    return send(res, 200, { name, format: "json" });
  }

  if (req.method === "POST" && resource === "generate") {
    const { spec, diagnostics } = validate(await readBody(req));
    if (!spec || diagnostics.some((d) => d.level === "error")) return send(res, 422, { error: "the spec has errors" });
    const outDir = join(repo, "out", name);
    const result = writeFiles(outDir, generate(spec));
    return send(res, 200, { outDir: `out/${name}`, ...result });
  }
  return send(res, 404, { error: "unknown studio request" });
}

// Local-only API for the studio: list, read and save specs; generate into out/.
function studioApi(): Plugin {
  return {
    name: "appspec-studio-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__studio/")) return next();
        handle(server, req, res).catch((err: unknown) => send(res, 500, { error: err instanceof Error ? err.message : String(err) }));
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), studioApi()],
  server: { fs: { allow: [repo] } },
});
