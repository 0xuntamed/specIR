import type { SpecInput } from "../../src/ir/types";

// Pure spec edits used by the studio. Each returns a new spec.

export type Spec = SpecInput;
export type EntityIn = Spec["entities"][number];
export type FieldIn = EntityIn["fields"][number];
export type RelationIn = NonNullable<EntityIn["relations"]>[number];
export type EndpointIn = NonNullable<Spec["endpoints"]>[number];
export type PageIn = NonNullable<Spec["pages"]>[number];
export type JobIn = NonNullable<Spec["jobs"]>[number];
export type SlotIn = NonNullable<Spec["slots"]>[number];

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// Starting point for a new app: auth, a User, and login/register pages.
export function newSpec(name: string): Spec {
  return {
    app: { name, backend: "node", database: "postgres" },
    auth: { strategy: "email_password_jwt", userEntity: "User" },
    entities: [{ name: "User", fields: [{ name: "email", type: "email", required: true, unique: true }] }],
    endpoints: [],
    pages: [
      { id: "login", route: "/login", auth: "public", layout: "form", uses: ["auth.login"] },
      { id: "register", route: "/register", auth: "public", layout: "form", uses: ["auth.register"] },
    ],
    slots: [],
    jobs: [],
  };
}

// A starting guess the user can correct (Person → persons, not people).
export function pluralOf(entity: string): string {
  const word = camel(entity);
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

export type ResourceOptions = { name: string; plural: string; fields: FieldIn[]; owned: boolean; pages: boolean };

// An entity plus its five CRUD endpoints and, optionally, list/new/edit
// pages: everything specs/notes.ts spells out by hand for Note.
export function addResource(spec: Spec, o: ResourceOptions): Spec {
  const base = `/${kebab(o.plural)}`;
  const scope = o.owned ? ("owner" as const) : ("all" as const);
  const crud = (op: "list" | "get" | "create" | "update" | "delete", method: EndpointIn["method"], path: string): EndpointIn => ({
    id: `${o.plural}.${op}`,
    kind: "crud",
    entity: o.name,
    op,
    method,
    path,
    auth: "user",
    scope,
    ...(op === "list" ? { pagination: { defaultLimit: 20, maxLimit: 100 } } : {}),
  });
  const endpoints: EndpointIn[] = [
    crud("list", "GET", base),
    crud("get", "GET", `${base}/:id`),
    crud("create", "POST", base),
    crud("update", "PATCH", `${base}/:id`),
    crud("delete", "DELETE", `${base}/:id`),
  ];
  const id = (op: string) => `${o.plural}.${op}`;
  const pages: PageIn[] = o.pages
    ? [
        { id: o.plural, route: base, auth: "user", layout: "list", uses: [id("list"), id("delete")] },
        { id: `${camel(o.name)}New`, route: `${base}/new`, auth: "user", layout: "form", uses: [id("create")] },
        { id: `${camel(o.name)}Edit`, route: `${base}/:id/edit`, auth: "user", layout: "form", uses: [id("get"), id("update")] },
      ]
    : [];
  return {
    ...spec,
    entities: [...spec.entities, { name: o.name, owned: o.owned, fields: o.fields }],
    endpoints: [...(spec.endpoints ?? []), ...endpoints],
    pages: [...(spec.pages ?? []), ...pages],
  };
}

// Renames keep references pointing at the renamed thing.

export function renameEntity(spec: Spec, from: string, to: string): Spec {
  const next = structuredClone(spec);
  for (const e of next.entities) {
    if (e.name === from) e.name = to;
    for (const r of e.relations ?? []) if (r.target === from) r.target = to;
  }
  if (next.auth?.userEntity === from) next.auth.userEntity = to;
  for (const ep of next.endpoints ?? []) if (ep.entity === from) ep.entity = to;
  for (const s of next.slots ?? []) if (s.output?.kind === "entity" && s.output.entity === from) s.output.entity = to;
  for (const j of next.jobs ?? []) if (j.idempotencyKey?.startsWith(`${from}.`)) j.idempotencyKey = to + j.idempotencyKey.slice(from.length);
  return next;
}

export function renameEndpoint(spec: Spec, from: string, to: string): Spec {
  const next = structuredClone(spec);
  for (const ep of next.endpoints ?? []) if (ep.id === from) ep.id = to;
  for (const p of next.pages ?? []) p.uses = (p.uses ?? []).map((u) => (u === from ? to : u));
  return next;
}

export function renameSlot(spec: Spec, from: string, to: string): Spec {
  const next = structuredClone(spec);
  for (const s of next.slots ?? []) if (s.id === from) s.id = to;
  for (const ep of next.endpoints ?? []) if (ep.kind === "custom" && ep.slot === from) ep.slot = to;
  for (const j of next.jobs ?? []) if (j.slot === from) j.slot = to;
  for (const p of next.pages ?? []) if (p.slot === from) p.slot = to;
  return next;
}
