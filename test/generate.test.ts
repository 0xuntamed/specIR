import { describe, expect, it } from "vitest";
import { generate } from "../src/generate/index";
import { MARKER } from "../src/generate/names";
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
  expect(invoiceFiles.filter((p) => p.startsWith("api/src/slots/"))).toEqual([
    "api/src/slots/markInvoicePaid.ts",
    "api/src/slots/processDueReminders.ts",
    "api/src/slots/renderInvoicePdf.ts",
    "api/src/slots/sendInvoice.ts",
  ]);
});
