import type { Finding, Rule } from "../context";

const METHOD_FOR_OP = { list: "GET", get: "GET", create: "POST", update: "PATCH", delete: "DELETE" } as const;

// Rule 7. Also: pagination only makes sense on list.
export const crudMismatch: Rule = {
  code: "crud-mismatch",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.kind !== "crud") return;
      if (!ctx.entities.has(ep.entity)) {
        findings.push({ path: `endpoints[${i}].entity`, message: `endpoint ${ep.id} uses unknown entity "${ep.entity}"` });
      }
      const expected = METHOD_FOR_OP[ep.op];
      if (ep.method !== expected) {
        findings.push({ path: `endpoints[${i}].method`, message: `endpoint ${ep.id}: op ${ep.op} must use ${expected}, not ${ep.method}` });
      }
      if (ep.pagination && ep.op !== "list") {
        findings.push({ path: `endpoints[${i}].pagination`, message: `endpoint ${ep.id}: pagination only applies to op list` });
      }
    });
    return findings;
  },
};
