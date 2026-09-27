import type { Finding, Rule } from "../context";

// Rule 14. A key that isn't unique can't dedupe deliveries.
export const idempotencyKey: Rule = {
  code: "idempotency-key",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.jobs.forEach((j, i) => {
      if (j.idempotencyKey === undefined) return;
      const path = `jobs[${i}].idempotencyKey`;
      const [entityName, fieldName] = j.idempotencyKey.split(".");
      const entity = ctx.entities.get(entityName!);
      const field = entity?.fields.find((f) => f.name === fieldName);
      if (!entity) findings.push({ path, message: `job ${j.id}: unknown entity "${entityName}"` });
      else if (!field) findings.push({ path, message: `job ${j.id}: ${entity.name} has no field "${fieldName}"` });
      else if (!field.unique) findings.push({ path, message: `job ${j.id}: ${j.idempotencyKey} must be unique to serve as an idempotency key` });
    });
    return findings;
  },
};
