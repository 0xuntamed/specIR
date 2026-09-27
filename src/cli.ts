import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generate } from "./generate/index";
import { writeFiles } from "./generate/write";
import { validate } from "./validate/index";

const USAGE = "usage: appspec validate <spec>\n       appspec generate <spec> --out <dir>";
const [command, file, ...rest] = process.argv.slice(2);
const outIndex = rest.indexOf("--out");
const out = outIndex === -1 ? undefined : rest[outIndex + 1];

if (!file || (command !== "validate" && command !== "generate") || (command === "generate" && !out)) {
  console.error(USAGE);
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

if (command === "validate") {
  const counts = (["entities", "endpoints", "jobs", "pages", "slots"] as const)
    .map((key) => `${spec[key].length} ${key}`)
    .join(", ");
  const warnings = diagnostics.length > 0 ? ` (${diagnostics.length} warning(s))` : "";
  console.log(`ok ${file}: ${counts}${warnings}`);
} else {
  const files = generate(spec);
  const result = writeFiles(resolve(out!), files);
  console.log(`generated ${files.size} files into ${out} (${result.written.length} written, ${result.unchanged.length} unchanged)`);
}
