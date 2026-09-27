import type { Finding, Rule } from "../context";

// Rule 6. The implicit auth.register / auth.login endpoints aren't in
// spec.endpoints, so they're exempt by construction.
export const publicWrite: Rule = {
  code: "public-write",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.auth === "public" && ep.method !== "GET") {
        findings.push({ path: `endpoints[${i}].auth`, message: `endpoint ${ep.id} is a public ${ep.method}; write endpoints need auth` });
      }
    });
    return findings;
  },
};
