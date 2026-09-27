import type { Entity, Spec } from "../../ir/types";
import { columnsOf, requestZod, type Column } from "../model";
import { HEADER, pascal } from "../names";

function responseZod(c: Column): string {
  const base = {
    uuid: "z.uuid()",
    string: "z.string()",
    text: "z.string()",
    email: "z.string()",
    enum: `z.enum([${c.values.map((v) => JSON.stringify(v)).join(", ")}])`,
    int: "z.int()",
    money: "z.int()",
    bool: "z.boolean()",
    datetime: "z.date()",
    date: "z.string()",
  }[c.kind];
  return c.notNull ? base : `${base}.nullable()`;
}

// Optional when the database can fill it in; nullable when the column is.
function bodyZod(c: Column): string {
  const base = requestZod({ type: c.kind, required: c.notNull, values: c.values }, false);
  if (!c.notNull) return `${base}.nullable().optional()`;
  return c.default !== undefined ? `${base}.optional()` : base;
}

// Which request schemas an entity needs. Update derives from Create, and the
// user entity always needs Create for register.
export function writeSchemas(spec: Spec, entity: Entity): { create: boolean; update: boolean } {
  const has = (op: string) => spec.endpoints.some((ep) => ep.kind === "crud" && ep.entity === entity.name && ep.op === op);
  const update = has("update");
  return { create: update || has("create") || entity.name === spec.auth?.userEntity, update };
}

// src/schemas/<entity>.ts
export function entitySchemas(spec: Spec, entity: Entity): string {
  const name = pascal(entity.name);
  const cols = columnsOf(spec, entity);
  const out = [
    HEADER,
    'import { z } from "zod";',
    "",
    "// Response shape. Parsing a row through it drops columns clients must not see.",
    `export const ${name} = z.object({`,
    ...cols.filter((c) => !c.hidden).map((c) => `  ${c.prop}: ${responseZod(c)},`),
    "});",
    `export type ${name} = z.infer<typeof ${name}>;`,
  ];
  const writes = writeSchemas(spec, entity);
  if (writes.create) {
    out.push(
      "",
      "// Request bodies. Unknown keys, readOnly fields and generated columns are rejected.",
      `export const ${name}Create = z.strictObject({`,
      ...cols.filter((c) => c.writable).map((c) => `  ${c.prop}: ${bodyZod(c)},`),
      "});",
    );
  }
  if (writes.update) out.push(`export const ${name}Update = ${name}Create.partial();`);
  return `${out.join("\n")}\n`;
}
