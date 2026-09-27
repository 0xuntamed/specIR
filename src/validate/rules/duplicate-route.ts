import { AUTH_ENDPOINTS } from "../../ir/implicit";
import type { Finding, Rule } from "../context";

// A router can't tell /things/:id from /things/:thingId.
const shape = (path: string) => path.replace(/:[^/]+/g, ":");

// Rule 8. Covers the implicit auth endpoints, and page routes too.
export const duplicateRoute: Rule = {
  code: "duplicate-route",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];

    const routes = new Map<string, string>();
    for (const ep of spec.auth ? AUTH_ENDPOINTS : []) routes.set(`${ep.method} ${shape(ep.path)}`, `${ep.id} (generated)`);
    spec.endpoints.forEach((ep, i) => {
      const key = `${ep.method} ${shape(ep.path)}`;
      const first = routes.get(key);
      if (first === undefined) routes.set(key, ep.id);
      else findings.push({ path: `endpoints[${i}].path`, message: `endpoint ${ep.id}: ${ep.method} ${ep.path} is already taken by ${first}` });
    });

    const pageRoutes = new Map<string, string>();
    spec.pages.forEach((p, i) => {
      const key = shape(p.route);
      const first = pageRoutes.get(key);
      if (first === undefined) pageRoutes.set(key, p.id);
      else findings.push({ path: `pages[${i}].route`, message: `page ${p.id}: route ${p.route} is already taken by page ${first}` });
    });

    return findings;
  },
};
