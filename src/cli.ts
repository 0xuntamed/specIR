import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fill } from "./agent/fill";
import { claudeModel, MODEL } from "./agent/model";
import { tscVerifier } from "./agent/verify";
import { generate } from "./generate/index";
import { writeFiles } from "./generate/write";
import { validate } from "./validate/index";

const USAGE = [
  "usage: appspec validate <spec>",
  "       appspec generate <spec> --out <dir>",
  "       appspec fill <spec> --out <dir> [--slot <id>]...",
].join("\n");

// ANTHROPIC_API_KEY etc. may live in a local, gitignored .env.
if (existsSync(".env")) process.loadEnvFile(".env");

const [command, file, ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.flatMap((arg, i) => (arg === name && rest[i + 1] ? [rest[i + 1]!] : []));
const out = flag("--out")[0];

if (!file || !["validate", "generate", "fill"].includes(command ?? "") || (command !== "validate" && !out)) {
  console.error(USAGE);
  process.exit(2);
}

// Specs are TS modules (export default defineSpec(...)) or JSON saved by the studio.
const input: unknown = file.endsWith(".json")
  ? JSON.parse(readFileSync(file, "utf8"))
  : (await import(pathToFileURL(resolve(file)).href)).default;
const { spec, diagnostics } = validate(input);

for (const d of diagnostics) {
  console.log(`${d.level} ${d.code} at ${d.path}: ${d.message}`);
}

const errors = diagnostics.filter((d) => d.level === "error").length;
if (errors > 0 || !spec) {
  console.log(`FAIL ${file}: ${errors} error(s)`);
  process.exit(1);
}

if (command === "validate") {
  const counts = (["entities", "endpoints", "jobs", "pages", "slots"] as const)
    .map((key) => `${spec[key].length} ${key}`)
    .join(", ");
  const warnings = diagnostics.length > 0 ? ` (${diagnostics.length} warning(s))` : "";
  console.log(`ok ${file}: ${counts}${warnings}`);
  process.exit(0);
}

// generate, and fill (which generates first so slot files match the spec)
const outDir = resolve(out!);
const files = generate(spec);
const result = writeFiles(outDir, files);
for (const path of result.deleted) console.log(`deleted ${path} (no longer in the spec)`);
for (const path of result.orphaned) console.log(`warning: kept ${path}: no longer in the spec, but its slot regions hold code`);
const counts = [`${result.written.length} written`, `${result.unchanged.length} unchanged`];
if (result.deleted.length > 0) counts.push(`${result.deleted.length} deleted`);
console.log(`generated ${files.size} files into ${out} (${counts.join(", ")})`);

if (command === "fill") {
  const hasProfile = existsSync(resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config", "anthropic"));
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !hasProfile) {
    console.error("fill needs Anthropic API credentials: put ANTHROPIC_API_KEY=... in a .env file in the repo root (gitignored), or set it in your environment.");
    process.exit(2);
  }
  const only = flag("--slot");
  console.log(`filling slots with ${MODEL}; each must pass typecheck (up to 3 attempts)`);
  const results = await fill({
    outDir,
    spec,
    model: claudeModel(outDir),
    verify: tscVerifier(outDir),
    ...(only.length > 0 ? { only } : {}),
    onProgress: (message) => console.log(`  ${message}`),
  });
  for (const r of results) {
    const attempts = r.attempts > 0 ? ` (${r.attempts} attempt${r.attempts === 1 ? "" : "s"})` : "";
    console.log(`${r.status.padEnd(7)} ${r.id}${attempts}: ${r.detail}`);
  }
  console.log(`logs: ${out}/.appspec/agent/<slot>.json`);
  if (results.some((r) => r.status === "failed")) process.exit(1);
}
