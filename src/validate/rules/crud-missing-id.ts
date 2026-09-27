import { pathParams, type Finding, type Rule } from "../context";

// Rule 9.
export const crudMissingId: Rule = {
  code: "crud-missing-id",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.kind !== "crud" || ep.op === "list" || ep.op === "create") return;
      if (!pathParams(ep.path).includes("id")) {
        findings.push({ path: `endpoints[${i}].path`, message: `endpoint ${ep.id}: op ${ep.op} needs an :id param in ${ep.path}` });
      }
    });
    return findings;
  },
};
