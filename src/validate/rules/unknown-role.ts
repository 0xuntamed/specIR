import type { Access } from "../../ir/types";
import type { Finding, Rule } from "../context";

// { role } access must name a role from auth.roles. (No auth block at all is
// rule 5's job.)
export const unknownRole: Rule = {
  code: "unknown-role",
  level: "error",
  check(spec) {
    if (!spec.auth) return [];
    const roles = new Set(spec.auth.roles);
    const findings: Finding[] = [];
    const check = (auth: Access, path: string, what: string) => {
      if (typeof auth === "object" && !roles.has(auth.role)) {
        findings.push({ path: `${path}.auth.role`, message: `${what} requires role "${auth.role}", which isn't in auth.roles` });
      }
    };
    spec.endpoints.forEach((ep, i) => check(ep.auth, `endpoints[${i}]`, `endpoint ${ep.id}`));
    spec.pages.forEach((p, i) => check(p.auth, `pages[${i}]`, `page ${p.id}`));
    return findings;
  },
};
