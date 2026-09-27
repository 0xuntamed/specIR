import type { Finding, Rule } from "../context";

// Implicit columns every entity may get (see src/ir/schema.ts Entity).
const ALWAYS = ["id", "ownerId", "createdAt", "updatedAt", "deletedAt"];

// Names the compiler generates must not be declared: implicit columns (plus
// password/passwordHash/role on the user entity), and `auth.*` endpoint ids.
export const reservedName: Rule = {
  code: "reserved-name",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    spec.entities.forEach((e, i) => {
      const reserved = new Set(ALWAYS);
      if (e.owned) reserved.add("owner"); // the implicit relation behind ownerId
      if (e.name === spec.auth?.userEntity) {
        reserved.add("password").add("passwordHash");
        if (spec.auth.roles.length > 0) reserved.add("role");
      }
      const check = (name: string, path: string) => {
        if (reserved.has(name)) findings.push({ path, message: `"${name}" is reserved in ${e.name}; the compiler generates it` });
      };
      e.fields.forEach((f, j) => check(f.name, `entities[${i}].fields[${j}]`));
      e.relations.forEach((r, j) => {
        check(r.name, `entities[${i}].relations[${j}]`);
        if (r.kind === "belongsTo") check(`${r.name}Id`, `entities[${i}].relations[${j}]`);
      });
    });
    spec.endpoints.forEach((ep, i) => {
      if (ep.id.startsWith("auth.")) {
        findings.push({ path: `endpoints[${i}].id`, message: `endpoint id ${ep.id}: the auth. prefix is reserved for generated auth endpoints` });
      }
    });
    return findings;
  },
};
