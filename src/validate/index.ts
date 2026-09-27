import { Spec as SpecSchema } from "../ir/schema";
import type { Spec } from "../ir/types";

export type Diagnostic = {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

// Parses the raw spec, then (from milestone 2) runs the semantic rules.
// `spec` is undefined when the input doesn't match the schema.
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
  return { spec: parsed.data, diagnostics: [] };
}

// ["entities", 2, "fields", 0] → "entities[2].fields[0]"
function formatPath(path: PropertyKey[]): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`)).join("");
}
