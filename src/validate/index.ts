import { Spec as SpecSchema } from "../ir/schema";
import type { Spec } from "../ir/types";
import { buildCtx, type Rule } from "./context";
import { authRequired } from "./rules/auth-required";
import { authUserEntity } from "./rules/auth-user-entity";
import { crudMismatch } from "./rules/crud-mismatch";
import { crudMissingId } from "./rules/crud-missing-id";
import { crudPathParam } from "./rules/crud-path-param";
import { customPathParam } from "./rules/custom-path-param";
import { duplicateId } from "./rules/duplicate-id";
import { duplicateRoute } from "./rules/duplicate-route";
import { emptyEnum } from "./rules/empty-enum";
import { hasManyInverse } from "./rules/hasmany-inverse";
import { idempotencyKey } from "./rules/idempotency-key";
import { invalidCron } from "./rules/invalid-cron";
import { ownerScope } from "./rules/owner-scope";
import { publicPageUsesAuthed } from "./rules/public-page-uses-authed";
import { publicWrite } from "./rules/public-write";
import { readOnlyUnsettable } from "./rules/readonly-unsettable";
import { reservedName } from "./rules/reserved-name";
import { setNullRequired } from "./rules/setnull-required";
import { slotRef } from "./rules/slot-ref";
import { unknownEndpoint } from "./rules/unknown-endpoint";
import { unknownEntity } from "./rules/unknown-entity";
import { unknownRelationTarget } from "./rules/unknown-relation-target";
import { unknownRole } from "./rules/unknown-role";

export type Diagnostic = {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

// Numbered rules 1–15 from CLAUDE.md, each followed by the extra rules that
// enforce decisions from the decisions log. Order = report order.
export const rules: Rule[] = [
  duplicateId, // 1
  reservedName,
  unknownRelationTarget, // 2
  hasManyInverse,
  setNullRequired,
  emptyEnum, // 3
  readOnlyUnsettable,
  authUserEntity, // 4
  authRequired, // 5
  unknownRole,
  publicWrite, // 6
  crudMismatch, // 7
  duplicateRoute, // 8
  crudMissingId, // 9
  crudPathParam,
  customPathParam,
  unknownEntity,
  slotRef, // 10
  unknownEndpoint, // 11
  publicPageUsesAuthed, // 12
  invalidCron, // 13
  idempotencyKey, // 14
  ownerScope, // 15
];

// Schema errors stop validation (rules assume a well-formed spec); otherwise
// every rule runs and all findings are reported. `spec` is undefined only when
// the input doesn't match the schema.
export function validate(input: unknown): { spec: Spec | undefined; diagnostics: Diagnostic[] } {
  const parsed = SpecSchema.safeParse(input);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues.map((issue): Diagnostic => ({
      level: "error",
      code: `schema.${issue.code}`,
      path: formatPath(issue.path),
      message: issue.message,
    }));
    return { spec: undefined, diagnostics };
  }

  const spec = parsed.data;
  const ctx = buildCtx(spec);
  const diagnostics = rules.flatMap((rule) =>
    rule.check(spec, ctx).map((f): Diagnostic => ({ level: rule.level, code: rule.code, path: f.path, message: f.message })),
  );
  return { spec, diagnostics };
}

// ["entities", 2, "fields", 0] → "entities[2].fields[0]"
function formatPath(path: PropertyKey[]): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`)).join("");
}
