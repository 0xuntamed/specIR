import { describe, expect, it } from "vitest";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";
import notes from "../specs/notes";

describe("reference specs", () => {
  it.each([
    ["notes", notes],
    ["invoice-reminder", invoiceReminder],
  ])("%s parses with no diagnostics", (_, spec) => {
    expect(validate(spec).diagnostics).toEqual([]);
  });

  it("notes needs zero slots", () => {
    expect(validate(notes).spec?.slots).toEqual([]);
  });
});

describe("schema", () => {
  it("rejects unknown keys, so typos don't silently drop flags", () => {
    const spec = structuredClone(notes) as any;
    spec.entities[1].fields[0].requried = true;
    expect(validate(spec).diagnostics).toEqual([
      expect.objectContaining({ code: "schema.unrecognized_keys", path: "entities[1].fields[0]" }),
    ]);
  });

  it("rejects identifiers that would break generated code", () => {
    const spec = structuredClone(notes) as any;
    spec.entities[1].fields[0].name = "note title";
    expect(validate(spec).diagnostics).toEqual([
      expect.objectContaining({ code: "schema.invalid_format", path: "entities[1].fields[0].name" }),
    ]);
  });

  it("applies defaults so generators see explicit flags", () => {
    const note = validate(notes).spec!.entities[1]!;
    expect(note).toMatchObject({ timestamps: true, softDelete: false, relations: [] });
    expect(note.fields[1]).toMatchObject({ name: "body", required: false, unique: false });
  });
});
