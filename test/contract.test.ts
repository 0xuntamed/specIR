import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validate as validateOpenApi } from "@readme/openapi-parser";
import { describe, expect, it } from "vitest";
import { generate } from "../src/generate/index";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";
import notes from "../specs/notes";

const tsc = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin", "tsc");

describe.each([
  ["notes", notes],
  ["invoice-reminder", invoiceReminder],
])("contract for %s", (_, input) => {
  const files = generate(validate(input).spec!);

  it("is a valid OpenAPI 3.1 document", async () => {
    const result = await validateOpenApi(JSON.parse(files.get("contract/openapi.json")!));
    expect(result.valid ? [] : result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // Browser-only libs: the client must not depend on Node types.
  it("has a client that typechecks on its own", () => {
    const dir = mkdtempSync(join(tmpdir(), "appspec-client-"));
    writeFileSync(join(dir, "client.ts"), files.get("contract/client.ts")!);
    const args = ["--ignoreConfig", "--noEmit", "--strict", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--lib", "ES2022,DOM", "--types", ""];
    const run = () => execFileSync(process.execPath, [tsc, ...args, "client.ts"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
    expect(run).not.toThrow();
  });
});
