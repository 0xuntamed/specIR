import type { Finding, Rule } from "../context";

// Rule 3. Applies to entity fields and slot inputs.
export const emptyEnum: Rule = {
  code: "empty-enum",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    spec.entities.forEach((e, i) =>
      e.fields.forEach((f, j) => {
        if (f.type === "enum" && f.values.length === 0) {
          findings.push({ path: `entities[${i}].fields[${j}].values`, message: `enum ${e.name}.${f.name} has no values` });
        }
      }),
    );
    spec.slots.forEach((s, i) =>
      s.inputs.forEach((p, j) => {
        if (p.type === "enum" && p.values.length === 0) {
          findings.push({ path: `slots[${i}].inputs[${j}].values`, message: `enum input ${s.id}.${p.name} has no values` });
        }
      }),
    );
    return findings;
  },
};
