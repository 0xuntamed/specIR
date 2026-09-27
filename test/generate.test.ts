import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generate } from "../src/generate/index";
import { MARKER } from "../src/generate/names";
import { writeFiles } from "../src/generate/write";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";
import notes from "../specs/notes";

const parse = (input: unknown) => validate(input).spec!;

describe.each([
  ["notes", notes],
  ["invoice-reminder", invoiceReminder],
])("generate %s", (_, input) => {
  it("is deterministic", () => {
    expect([...generate(parse(input))]).toEqual([...generate(parse(structuredClone(input)))]);
  });

  it("marks every file as generated", () => {
    for (const [path, content] of generate(parse(input))) {
      expect(content.split("\n", 3).some((line) => line.includes(MARKER)), path).toBe(true);
    }
  });
});

it("emits slot, job and custom-route files only when the spec has them", () => {
  const notesFiles = [...generate(parse(notes)).keys()];
  expect(notesFiles.filter((p) => /slots\/|jobs\.ts|custom\.ts|context\.ts/.test(p))).toEqual([]);

  const invoiceFiles = [...generate(parse(invoiceReminder)).keys()];
  expect(invoiceFiles.filter((p) => p.startsWith("src/slots/"))).toEqual([
    "src/slots/markInvoicePaid.ts",
    "src/slots/processDueReminders.ts",
    "src/slots/renderInvoicePdf.ts",
    "src/slots/sendInvoice.ts",
  ]);
});

describe("writeFiles", () => {
  const files = () => generate(parse(invoiceReminder));

  it("preserves slot bodies when regenerating", () => {
    const dir = mkdtempSync(join(tmpdir(), "appspec-"));
    writeFiles(dir, files());
    const slot = join(dir, "src/slots/sendInvoice.ts");
    const implemented = readFileSync(slot, "utf8")
      .replace('  throw new NotImplemented("sendInvoice");\n', "  return input.invoice; // implemented\n")
      .replace("// @appspec:slot sendInvoice:imports end", 'import { sql } from "drizzle-orm";\n// @appspec:slot sendInvoice:imports end');
    writeFileSync(slot, implemented);

    const result = writeFiles(dir, files());
    expect(readFileSync(slot, "utf8")).toBe(implemented);
    expect(result.written).toEqual([]);
  });

  it("refuses to overwrite a file without the generated marker", () => {
    const dir = mkdtempSync(join(tmpdir(), "appspec-"));
    writeFiles(dir, files());
    writeFileSync(join(dir, "src/server.ts"), "// my own server\n");
    expect(() => writeFiles(dir, files())).toThrow(/src\/server\.ts/);
    expect(readFileSync(join(dir, "src/server.ts"), "utf8")).toBe("// my own server\n");
  });
});
