import type { Finding, Rule } from "../context";

// Rule 2.
export const unknownRelationTarget: Rule = {
  code: "unknown-relation-target",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.entities.forEach((e, i) =>
      e.relations.forEach((r, j) => {
        if (!ctx.entities.has(r.target)) {
          findings.push({
            path: `entities[${i}].relations[${j}].target`,
            message: `relation ${e.name}.${r.name} targets unknown entity "${r.target}"`,
          });
        }
      }),
    );
    return findings;
  },
};
