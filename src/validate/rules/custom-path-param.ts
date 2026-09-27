import { entityParam, pathParams, type Finding, type Rule } from "../context";

// Custom path params must be declared slot inputs, and an endpoint with
// `entity` must have the :<entity>Id param its row is loaded from.
export const customPathParam: Rule = {
  code: "custom-path-param",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.kind !== "custom") return;
      const params = pathParams(ep.path);
      if (ep.entity !== undefined && !params.includes(entityParam(ep.entity))) {
        findings.push({
          path: `endpoints[${i}].path`,
          message: `endpoint ${ep.id}: ${ep.entity} is loaded from :${entityParam(ep.entity)}, which ${ep.path} lacks`,
        });
      }
      const slot = ep.slot === undefined ? undefined : ctx.slots.get(ep.slot);
      if (!slot) return; // rule 10
      const inputs = new Set(slot.inputs.map((p) => p.name));
      for (const param of params) {
        if (!inputs.has(param)) {
          findings.push({ path: `endpoints[${i}].path`, message: `endpoint ${ep.id}: :${param} isn't an input of slot ${slot.id}` });
        }
      }
    });
    return findings;
  },
};
