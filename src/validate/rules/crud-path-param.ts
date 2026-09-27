import { pathParams, type Finding, type Rule } from "../context";

// In crud paths, :id is the entity's own id (get/update/delete only) and any
// other param must be a belongsTo foreign key, e.g. :invoiceId for `invoice`.
export const crudPathParam: Rule = {
  code: "crud-path-param",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.endpoints.forEach((ep, i) => {
      if (ep.kind !== "crud") return;
      const entity = ctx.entities.get(ep.entity);
      if (!entity) return; // rule 7
      const foreignKeys = new Set(entity.relations.filter((r) => r.kind === "belongsTo").map((r) => `${r.name}Id`));
      for (const param of pathParams(ep.path)) {
        if (param === "id") {
          if (ep.op === "list" || ep.op === "create") {
            findings.push({ path: `endpoints[${i}].path`, message: `endpoint ${ep.id}: op ${ep.op} can't take :id` });
          }
        } else if (!foreignKeys.has(param)) {
          findings.push({ path: `endpoints[${i}].path`, message: `endpoint ${ep.id}: :${param} isn't a belongsTo relation of ${entity.name}` });
        }
      }
    });
    return findings;
  },
};
