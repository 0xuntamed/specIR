import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validate } from "./validate/index";

const [command, file] = process.argv.slice(2);

if (command !== "validate" || !file) {
  console.error("usage: appspec validate <spec>");
  process.exit(2);
}

const mod = await import(pathToFileURL(resolve(file)).href);
const { spec, diagnostics } = validate(mod.default);

for (const d of diagnostics) {
  console.log(`${d.level} ${d.code} at ${d.path}: ${d.message}`);
}

const errors = diagnostics.filter((d) => d.level === "error").length;
if (errors > 0 || !spec) {
  console.log(`FAIL ${file}: ${errors} error(s)`);
  process.exit(1);
}

const counts = (["entities", "endpoints", "jobs", "pages", "slots"] as const)
  .map((key) => `${spec[key].length} ${key}`)
  .join(", ");
const warnings = diagnostics.length > 0 ? ` (${diagnostics.length} warning(s))` : "";
console.log(`ok ${file}: ${counts}${warnings}`);
