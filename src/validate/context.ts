import { AUTH_ENDPOINTS } from "../ir/implicit";
import type { Access, Entity, Slot, Spec } from "../ir/types";

export type Finding = { path: string; message: string };

// One rule = one diagnostic code = one spec in specs/broken/<code>.ts.
export type Rule = {
  code: string;
  level: "error" | "warning";
  check: (spec: Spec, ctx: Ctx) => Finding[];
};

// Lookups shared by rules. First occurrence wins; duplicates are rule 1's job.
export type Ctx = {
  entities: Map<string, Entity>;
  slots: Map<string, Slot>;
  // Declared endpoints plus the implicit auth endpoints when auth is on.
  endpoints: Map<string, { method: string; path: string; auth: Access }>;
};

export function buildCtx(spec: Spec): Ctx {
  const implicit = spec.auth ? AUTH_ENDPOINTS : [];
  return {
    entities: firstBy(spec.entities, (e) => e.name),
    slots: firstBy(spec.slots, (s) => s.id),
    endpoints: firstBy([...implicit, ...spec.endpoints], (ep) => ep.id),
  };
}

function firstBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(key(item))) map.set(key(item), item);
  return map;
}

// "/invoices/:invoiceId/send" → ["invoiceId"]
export const pathParams = (path: string): string[] =>
  path
    .split("/")
    .filter((s) => s.startsWith(":"))
    .map((s) => s.slice(1));

// The path param a custom endpoint's `entity` is loaded from: LineItem → lineItemId.
export const entityParam = (entity: string): string => `${entity[0]!.toLowerCase()}${entity.slice(1)}Id`;
