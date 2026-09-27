import type { Finding, Rule } from "../context";

// Rule 5. Anything that needs a logged-in user needs an auth block, including
// owned entities (their ownerId points at the auth user entity).
export const authRequired: Rule = {
  code: "auth-required",
  level: "error",
  check(spec) {
    if (spec.auth) return [];
    const findings: Finding[] = [];
    spec.entities.forEach((e, i) => {
      if (e.owned) findings.push({ path: `entities[${i}].owned`, message: `${e.name} is owned, which needs an auth block` });
    });
    spec.endpoints.forEach((ep, i) => {
      if (ep.auth !== "public") findings.push({ path: `endpoints[${i}].auth`, message: `endpoint ${ep.id} requires auth but there is no auth block` });
    });
    spec.pages.forEach((p, i) => {
      if (p.auth !== "public") findings.push({ path: `pages[${i}].auth`, message: `page ${p.id} requires auth but there is no auth block` });
    });
    return findings;
  },
};
