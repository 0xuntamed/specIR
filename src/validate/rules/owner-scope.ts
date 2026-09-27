import type { Finding, Rule } from "../context";

// Rule 15. Also: owner checks need a logged-in user, so neither owner scope nor
// a custom endpoint guarding an owned entity can be public.
export const ownerScope: Rule = {
  code: "owner-scope",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.kind === "custom") {
        if (ep.entity !== undefined && ctx.entities.get(ep.entity)?.owned && ep.auth === "public") {
          findings.push({ path: `endpoints[${i}].auth`, message: `endpoint ${ep.id} loads owned ${ep.entity} rows, so it can't be public` });
        }
        return;
      }
      if (ep.scope !== "owner") return;
      const entity = ctx.entities.get(ep.entity);
      if (entity && !entity.owned) {
        findings.push({ path: `endpoints[${i}].scope`, message: `endpoint ${ep.id}: scope owner needs ${entity.name} to be owned` });
      }
      if (ep.auth === "public") {
        findings.push({ path: `endpoints[${i}].scope`, message: `endpoint ${ep.id}: scope owner needs a logged-in user, but auth is public` });
      }
    });
    return findings;
  },
};
