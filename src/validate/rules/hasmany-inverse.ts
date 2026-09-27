import type { Finding, Rule } from "../context";

// A hasMany reads the foreign key of the one belongsTo on the target that
// points back. Zero or several such belongsTo means there's no single FK.
export const hasManyInverse: Rule = {
  code: "hasmany-inverse",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.entities.forEach((e, i) =>
      e.relations.forEach((r, j) => {
        const target = ctx.entities.get(r.target);
        if (r.kind !== "hasMany" || !target) return;
        const back = target.relations.filter((b) => b.kind === "belongsTo" && b.target === e.name);
        if (back.length === 1) return;
        findings.push({
          path: `entities[${i}].relations[${j}]`,
          message:
            back.length === 0
              ? `hasMany ${e.name}.${r.name} needs a belongsTo ${e.name} on ${target.name}`
              : `hasMany ${e.name}.${r.name} is ambiguous: ${target.name} has ${back.length} belongsTo ${e.name} relations`,
        });
      }),
    );
    return findings;
  },
};
