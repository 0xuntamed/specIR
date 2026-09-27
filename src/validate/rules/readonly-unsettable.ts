import type { Finding, Rule } from "../context";

// readOnly fields are left out of create bodies, so a required one needs a
// default wherever rows are created over HTTP (crud create, or register for
// the user entity).
export const readOnlyUnsettable: Rule = {
  code: "readonly-unsettable",
  level: "error",
  check(spec) {
    const created = new Set<string>();
    for (const ep of spec.endpoints) if (ep.kind === "crud" && ep.op === "create") created.add(ep.entity);
    if (spec.auth) created.add(spec.auth.userEntity);

    const findings: Finding[] = [];
    spec.entities.forEach((e, i) => {
      if (!created.has(e.name)) return;
      e.fields.forEach((f, j) => {
        if (f.readOnly && f.required && f.default === undefined) {
          findings.push({
            path: `entities[${i}].fields[${j}]`,
            message: `${e.name}.${f.name} is required and readOnly with no default, so creating a ${e.name} would fail`,
          });
        }
      });
    });
    return findings;
  },
};
