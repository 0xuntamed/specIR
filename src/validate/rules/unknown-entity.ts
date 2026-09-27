import type { Finding, Rule } from "../context";

// Entity references no other rule covers: custom endpoint guards and slot
// outputs. (Relations: rule 2, crud: rule 7, auth: rule 4, jobs: rule 14.)
export const unknownEntity: Rule = {
  code: "unknown-entity",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.kind === "custom" && ep.entity !== undefined && !ctx.entities.has(ep.entity)) {
        findings.push({ path: `endpoints[${i}].entity`, message: `endpoint ${ep.id} uses unknown entity "${ep.entity}"` });
      }
    });
    spec.slots.forEach((s, i) => {
      if (s.output.kind === "entity" && !ctx.entities.has(s.output.entity)) {
        findings.push({ path: `slots[${i}].output.entity`, message: `slot ${s.id} returns unknown entity "${s.output.entity}"` });
      }
    });
    return findings;
  },
};
