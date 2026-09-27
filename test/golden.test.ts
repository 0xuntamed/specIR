import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generate } from "../src/generate/index";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";
import notes from "../specs/notes";

// Every generated file is pinned under test/golden/<spec>/<path>, so a
// generator change shows up as a reviewable diff of real output files.
// Update after an intended change: npx vitest run -u (then delete any golden
// files the stale-file test reports).
const goldenRoot = fileURLToPath(new URL("./golden/", import.meta.url));

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

describe.each([
  ["notes", notes],
  ["invoice-reminder", invoiceReminder],
])("golden output: %s", (name, input) => {
  const files = generate(validate(input).spec!);

  it.each([...files.keys()])("%s", async (path) => {
    await expect(files.get(path)).toMatchFileSnapshot(`./golden/${name}/${path}`);
  });

  it("has no golden files the generator no longer produces", () => {
    expect(filesUnder(join(goldenRoot, name)).filter((path) => !files.has(path))).toEqual([]);
  });
});
