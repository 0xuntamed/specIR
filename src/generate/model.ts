import type { Entity, Field, Param, Spec } from "../ir/types";
import { snake } from "./names";

// One physical column, explicit or implicit. The SQL, Drizzle and Zod
// generators all read this, so they can't disagree about an entity's shape.
export type Column = {
  prop: string; // TS property, e.g. clientId
  sql: string; // column name, e.g. client_id
  kind: Field["type"];
  values: string[]; // enum values
  notNull: boolean;
  unique: boolean;
  default?: string | number | boolean;
  generated?: "uuid" | "now"; // database-side default
  onUpdateNow?: boolean;
  references?: { entity: string; onDelete: "cascade" | "restrict" | "setNull" };
  writable: boolean; // accepted in create/update bodies
  hidden: boolean; // never sent to clients
};

// Order: id, ownerId, foreign keys, declared fields, auth columns, timestamps.
export function columnsOf(spec: Spec, entity: Entity): Column[] {
  const base = { values: [], unique: false, writable: false, hidden: false };
  const cols: Column[] = [{ ...base, prop: "id", sql: "id", kind: "uuid", notNull: true, generated: "uuid" }];

  if (entity.owned && spec.auth) {
    cols.push({ ...base, prop: "ownerId", sql: "owner_id", kind: "uuid", notNull: true, references: { entity: spec.auth.userEntity, onDelete: "cascade" } });
  }
  for (const r of entity.relations) {
    if (r.kind !== "belongsTo") continue;
    const prop = `${r.name}Id`;
    cols.push({ ...base, prop, sql: snake(prop), kind: "uuid", notNull: r.required, references: { entity: r.target, onDelete: r.onDelete }, writable: true });
  }
  for (const f of entity.fields) {
    cols.push({
      ...base,
      prop: f.name,
      sql: snake(f.name),
      kind: f.type,
      values: f.type === "enum" ? f.values : [],
      notNull: f.required,
      unique: f.unique,
      default: f.default,
      writable: !f.readOnly,
    });
  }
  if (entity.name === spec.auth?.userEntity) {
    cols.push({ ...base, prop: "passwordHash", sql: "password_hash", kind: "text", notNull: true, hidden: true });
    if (spec.auth.roles.length > 0) {
      cols.push({ ...base, prop: "role", sql: "role", kind: "enum", values: spec.auth.roles, notNull: true, default: spec.auth.roles[0] });
    }
  }
  if (entity.timestamps) {
    cols.push({ ...base, prop: "createdAt", sql: "created_at", kind: "datetime", notNull: true, generated: "now" });
    cols.push({ ...base, prop: "updatedAt", sql: "updated_at", kind: "datetime", notNull: true, generated: "now", onUpdateNow: true });
  }
  if (entity.softDelete) {
    cols.push({ ...base, prop: "deletedAt", sql: "deleted_at", kind: "datetime", notNull: false, hidden: true });
  }
  return cols;
}

export function entityNamed(spec: Spec, name: string): Entity {
  const entity = spec.entities.find((e) => e.name === name);
  if (!entity) throw new Error(`unknown entity ${name}; validate before generating`);
  return entity;
}

// The field users log in with: the first required unique email (rule 4).
export function loginField(spec: Spec): string {
  const user = entityNamed(spec, spec.auth!.userEntity);
  return user.fields.find((f) => f.type === "email" && f.required && f.unique)!.name;
}

// Zod for a value arriving in a request. `fromString` = path or query string,
// where numbers and booleans arrive as text.
export function requestZod(p: Pick<Param, "type" | "required"> & { values?: string[] }, fromString: boolean): string {
  switch (p.type) {
    case "uuid":
      return "z.uuid()";
    case "string":
    case "text":
      return p.required ? "z.string().min(1)" : "z.string()";
    case "email":
      return "z.email()";
    case "int":
      return fromString ? "z.coerce.number().pipe(z.int32())" : "z.int32()";
    case "money":
      return fromString ? "z.coerce.number().pipe(z.int())" : "z.int()";
    case "bool":
      return fromString ? "z.stringbool()" : "z.boolean()";
    case "datetime":
      return "z.iso.datetime({ offset: true }).transform((s) => new Date(s))";
    case "date":
      return "z.iso.date()";
    case "enum":
      return `z.enum([${(p.values ?? []).map((v) => JSON.stringify(v)).join(", ")}])`;
  }
}
