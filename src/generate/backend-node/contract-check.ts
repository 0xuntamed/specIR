import type { Spec } from "../../ir/types";
import { writeSchemas } from "./schemas";
import { Imports } from "../imports";
import { camel, HEADER, pascal } from "../names";

// api/contract.check.ts: compile-time proof that contract/client.ts matches
// this backend's Zod schemas. `npm run typecheck` fails on any drift.
export function contractCheckModule(spec: Spec): string {
  const imports = new Imports().add("zod", "type z");
  const checks: string[] = [];
  for (const entity of spec.entities) {
    const name = pascal(entity.name);
    const from = `./src/schemas/${camel(entity.name)}.js`;
    imports.add(from, `type ${name}`);
    checks.push(`  Assert<Same<Api.${name}, Wire<z.output<typeof ${name}>>>>,`);
    const writes = writeSchemas(spec, entity);
    for (const variant of ["Create", "Update"] as const) {
      if (!writes[variant === "Create" ? "create" : "update"]) continue;
      imports.add(from, `type ${name}${variant}`);
      checks.push(`  Assert<Same<Api.${name}${variant}, z.input<typeof ${name}${variant}>>>,`);
    }
  }
  if (spec.auth) {
    imports.add("./src/auth.js", "type LoginBody", "type RegisterBody");
    checks.push(
      "  Assert<Same<Api.RegisterRequest, z.input<typeof RegisterBody>>>,",
      "  Assert<Same<Api.LoginRequest, z.input<typeof LoginBody>>>,",
    );
  }

  return `${HEADER}
// Compile-time proof that contract/client.ts matches this backend. If the client
// and the Zod schemas ever drift, \`npm run typecheck\` fails on the line below.
import type * as Api from "../contract/client.js";
${imports.render().join("\n")}

// Mutual assignability catches type, required-vs-optional and nullability
// differences; comparing keys also catches an extra optional field, which
// assignability alone lets through ({ a } and { a, b? } accept each other).
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Same<A, B> = Mutual<A, B> extends true ? Mutual<keyof A, keyof B> : false;
// What JSON serialization makes of a response: Dates become ISO strings.
type Wire<T> = T extends Date ? string : T extends (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
type Assert<T extends true> = T;

export type ContractChecks = [
${checks.join("\n")}
];
`;
}
