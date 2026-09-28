import { describe, expect, it } from "vitest";
import { generate } from "../src/generate/index";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";
import notes from "../specs/notes";
import { addResource, newSpec, pluralOf, renameEndpoint, renameEntity, renameSlot } from "../studio/src/edits";

const errors = (input: unknown) => validate(input).diagnostics.filter((d) => d.level === "error");

describe("studio edits", () => {
  it("starts new apps from a valid spec", () => {
    expect(errors(newSpec("todo"))).toEqual([]);
  });

  it("adds a resource that validates and generates, like the hand-written Notes spec", () => {
    const spec = addResource(newSpec("notes"), {
      name: "Note",
      plural: "notes",
      owned: true,
      pages: true,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "body", type: "text" },
        { name: "pinned", type: "bool", required: true, default: false },
      ],
    });
    expect(errors(spec)).toEqual([]);
    // Same endpoints and pages as specs/notes.ts, so the same generated app.
    const parsed = validate(spec).spec!;
    const reference = validate(notes).spec!;
    expect(parsed.endpoints).toEqual(reference.endpoints);
    expect(parsed.pages).toEqual(reference.pages);
    expect([...generate(parsed).keys()]).toEqual([...generate(reference).keys()]);
  });

  it("guesses plurals the user can override", () => {
    expect(["Task", "Category", "Box", "LineItem"].map(pluralOf)).toEqual(["tasks", "categories", "boxes", "lineItems"]);
  });

  it("keeps references valid across renames", () => {
    let spec = renameEntity(invoiceReminder, "Client", "Customer");
    spec = renameEntity(spec, "Reminder", "Nudge");
    spec = renameEndpoint(spec, "invoices.get", "invoices.show");
    spec = renameSlot(spec, "sendInvoice", "sendBill");
    expect(errors(spec)).toEqual([]);
    expect(validate(spec).spec!.jobs[0]!.idempotencyKey).toBe("Nudge.idempotencyKey");
  });

  it("leaves naming conventions for the validator to point out, rather than rewriting URLs", () => {
    // Custom endpoints load their row from :<entity>Id, so renaming Invoice needs new paths.
    const codes = errors(renameEntity(invoiceReminder, "Invoice", "Bill")).map((d) => d.code);
    expect(new Set(codes)).toEqual(new Set(["custom-path-param", "page-layout"]));
  });
});
