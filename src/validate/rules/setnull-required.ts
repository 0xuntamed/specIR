import type { Finding, Rule } from "../context";

// ON DELETE SET NULL on a NOT NULL column only fails at delete time.
export const setNullRequired: Rule = {
  code: "setnull-required",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    spec.entities.forEach((e, i) =>
      e.relations.forEach((r, j) => {
        if (r.kind === "belongsTo" && r.required && r.onDelete === "setNull") {
          findings.push({
            path: `entities[${i}].relations[${j}].onDelete`,
            message: `${e.name}.${r.name} is required, so onDelete can't be setNull`,
          });
        }
      }),
    );
    return findings;
  },
};
