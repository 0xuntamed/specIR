import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SpecInput } from "../src/ir/types";
import { generate } from "../src/generate/index";
import { regionsOf } from "../src/generate/regions";
import { writeFiles } from "../src/generate/write";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";

const build = (input: SpecInput) => generate(validate(input).spec!);
const tempDir = () => mkdtempSync(join(tmpdir(), "appspec-"));

// Edits a file the way a person or agent would.
function edit(dir: string, path: string, change: (text: string) => string): string {
  const next = change(readFileSync(join(dir, path), "utf8"));
  writeFileSync(join(dir, path), next);
  return next;
}
const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");

// v2 of the spec: a new Invoice field, a reworded slot intent, and the
// pdf + mark-paid endpoints (and their slots) removed.
function specV2(): SpecInput {
  const spec = structuredClone(invoiceReminder);
  spec.entities.find((e) => e.name === "Invoice")!.fields.push({ name: "poNumber", type: "string" });
  spec.slots!.find((s) => s.id === "sendInvoice")!.intent = "Send the invoice by email with the PDF attached (reworded in v2).";
  const removed = ["invoices.pdf", "invoices.markPaid"];
  spec.endpoints = spec.endpoints!.filter((ep) => !removed.includes(ep.id));
  spec.slots = spec.slots!.filter((s) => s.id !== "renderInvoicePdf" && s.id !== "markInvoicePaid");
  const detail = spec.pages!.find((p) => p.id === "invoiceDetail")!;
  detail.uses = detail.uses!.filter((id) => !removed.includes(id));
  return spec;
}

describe("regenerating after the spec changes", () => {
  const dir = tempDir();
  writeFiles(dir, build(invoiceReminder));

  // Implement two backend slots and the frontend slot; add user-owned files.
  const implement = (slot: string) => (text: string) =>
    text
      .replace(`// @appspec:slot ${slot}:imports end`, `import { eq } from "drizzle-orm";\n// @appspec:slot ${slot}:imports end`)
      .replace(`  throw new NotImplemented("${slot}");\n`, `  void eq;\n  return input.invoice; // ${slot}, implemented\n`);
  const sendInvoice = edit(dir, "api/src/slots/sendInvoice.ts", implement("sendInvoice"));
  edit(dir, "api/src/slots/markInvoicePaid.ts", implement("markInvoicePaid"));
  const editor = edit(dir, "web/src/slots/invoiceEditor.tsx", (text) =>
    text.replace(/(invoiceEditor begin\n)[\s\S]*?(\s+\/\/ @appspec:slot invoiceEditor end)/, "$1  return <p>Editing {params.id}</p>;$2"),
  );
  writeFileSync(join(dir, "api/src/lib/pdf.ts"), "export const renderPdf = () => Buffer.from('');\n");
  // The documented setup copies .env.example, generated marker and all.
  const env = `${read(dir, ".env.example")}JWT_SECRET=${"x".repeat(40)}\n`;
  writeFileSync(join(dir, ".env"), env);
  writeFileSync(join(dir, "api/migrations/0001_indexes.sql"), "CREATE INDEX reminder_due_idx ON reminder (scheduled_at);\n");

  const result = writeFiles(dir, build(specV2()));

  it("keeps slot code exactly, while regenerating around it", () => {
    const now = read(dir, "api/src/slots/sendInvoice.ts");
    expect(regionsOf(now)).toEqual(regionsOf(sendInvoice));
    expect(now).toContain("reworded in v2");
    expect(regionsOf(read(dir, "web/src/slots/invoiceEditor.tsx"))).toEqual(regionsOf(editor));
  });

  it("applies the spec change everywhere it belongs", () => {
    expect(read(dir, "api/src/schemas/invoice.ts")).toContain("poNumber");
    expect(read(dir, "api/migrations/0000_init.sql")).toContain('"po_number" text');
    expect(read(dir, "contract/client.ts")).toContain("poNumber");
    expect(read(dir, "api/src/routes/custom.ts")).not.toContain("markInvoicePaid");
  });

  it("deletes the removed slot that was still a stub", () => {
    expect(result.deleted).toContain("api/src/slots/renderInvoicePdf.ts");
    expect(existsSync(join(dir, "api/src/slots/renderInvoicePdf.ts"))).toBe(false);
  });

  it("keeps and reports the removed slot that holds code", () => {
    expect(result.orphaned).toEqual(["api/src/slots/markInvoicePaid.ts"]);
    expect(read(dir, "api/src/slots/markInvoicePaid.ts")).toContain("markInvoicePaid, implemented");
  });

  it("never touches user-owned files, even ones copied from generated files", () => {
    expect(read(dir, ".env")).toBe(env);
    expect(read(dir, "api/src/lib/pdf.ts")).toBe("export const renderPdf = () => Buffer.from('');\n");
    expect(read(dir, "api/migrations/0001_indexes.sql")).toContain("reminder_due_idx");
    expect(result.deleted.filter((p) => !p.startsWith("api/src/slots/"))).toEqual([]);
  });

  it("is idempotent", () => {
    const again = writeFiles(dir, build(specV2()));
    expect(again.written).toEqual([]);
    expect(again.deleted).toEqual([]);
    expect(again.orphaned).toEqual(["api/src/slots/markInvoicePaid.ts"]);
  });
});

describe("writeFiles refuses to lose work", () => {
  it("won't overwrite a file without the generated marker", () => {
    const dir = tempDir();
    writeFiles(dir, build(invoiceReminder));
    writeFileSync(join(dir, "api/src/server.ts"), "// my own server\n");
    expect(() => writeFiles(dir, build(invoiceReminder))).toThrow(/api\/src\/server\.ts/);
    expect(read(dir, "api/src/server.ts")).toBe("// my own server\n");
  });

  it("won't drop a slot region that holds code, and writes nothing", () => {
    const dir = tempDir();
    writeFiles(dir, build(invoiceReminder));
    const planted = edit(dir, "api/src/env.ts", (text) => `${text}// @appspec:slot stray begin\nconst mine = 1;\n// @appspec:slot stray end\n`);
    const before = read(dir, "api/src/slots/sendInvoice.ts");
    expect(() => writeFiles(dir, build(specV2()))).toThrow(/api\/src\/env\.ts \(stray\)/);
    expect(read(dir, "api/src/env.ts")).toBe(planted);
    expect(read(dir, "api/src/slots/sendInvoice.ts")).toBe(before);
  });
});
