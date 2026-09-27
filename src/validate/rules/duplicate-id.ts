import type { Finding, Rule } from "../context";

// Rule 1. Ids are unique per kind. Within an entity, fields, relations and
// belongsTo foreign keys (`<relation>Id`) share one namespace. Enum values and
// slot input names are unique too.
export const duplicateId: Rule = {
  code: "duplicate-id",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    const scope = (what: string, where = "") => {
      const seen = new Map<string, string>();
      return (name: string, path: string, note?: string) => {
        const first = seen.get(name);
        if (first === undefined) seen.set(name, path);
        else {
          const tail = note ? `${note}; first at ${first}` : `first at ${first}`;
          findings.push({ path, message: `duplicate ${what} "${name}"${where} (${tail})` });
        }
      };
    };

    const entityName = scope("entity");
    spec.entities.forEach((e, i) => {
      entityName(e.name, `entities[${i}]`);
      const member = scope("name", ` in ${e.name}`);
      e.fields.forEach((f, j) => {
        member(f.name, `entities[${i}].fields[${j}]`);
        if (f.type === "enum") {
          const value = scope("value", ` in ${e.name}.${f.name}`);
          f.values.forEach((v, k) => value(v, `entities[${i}].fields[${j}].values[${k}]`));
        }
      });
      e.relations.forEach((r, j) => {
        member(r.name, `entities[${i}].relations[${j}]`);
        if (r.kind === "belongsTo") member(`${r.name}Id`, `entities[${i}].relations[${j}]`, `foreign key of relation ${r.name}`);
      });
    });

    const endpointId = scope("endpoint id");
    spec.endpoints.forEach((ep, i) => endpointId(ep.id, `endpoints[${i}]`));
    const pageId = scope("page id");
    spec.pages.forEach((p, i) => pageId(p.id, `pages[${i}]`));
    const jobId = scope("job id");
    spec.jobs.forEach((j, i) => jobId(j.id, `jobs[${i}]`));
    const slotId = scope("slot id");
    spec.slots.forEach((s, i) => {
      slotId(s.id, `slots[${i}]`);
      const input = scope("input", ` of slot ${s.id}`);
      s.inputs.forEach((p, j) => input(p.name, `slots[${i}].inputs[${j}]`));
    });

    return findings;
  },
};
