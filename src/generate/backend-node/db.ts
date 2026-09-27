import type { Spec } from "../../ir/types";
import { columnsOf, type Column } from "../model";
import { camel, HEADER, MARKER, pascal, snake } from "../names";

const q = (id: string) => `"${id}"`;
const lit = (v: string | number | boolean) => (typeof v === "string" ? `'${v.replaceAll("'", "''")}'` : String(v));

const SQL_TYPE: Record<Column["kind"], string> = {
  uuid: "uuid",
  string: "text",
  text: "text",
  email: "text",
  enum: "text",
  int: "integer",
  money: "bigint",
  bool: "boolean",
  datetime: "timestamptz",
  date: "date",
};
const ON_DELETE = { cascade: "CASCADE", restrict: "RESTRICT", setNull: "SET NULL" } as const;

// migrations/0000_init.sql: the whole schema. Tables first, then foreign keys
// (so declaration order never matters), then indexes on foreign keys.
// Until spec diffs produce ALTER migrations, a schema change means resetting the database.
export function migrationSql(spec: Spec): string {
  const tables: string[] = [];
  const foreignKeys: string[] = [];
  const indexes: string[] = [];

  for (const entity of spec.entities) {
    const table = snake(entity.name);
    const cols = columnsOf(spec, entity);
    const defs = cols.map((c) => {
      let def = `  ${q(c.sql)} ${SQL_TYPE[c.kind]}`;
      if (c.prop === "id") def += " PRIMARY KEY";
      else if (c.notNull) def += " NOT NULL";
      if (c.generated === "uuid") def += " DEFAULT gen_random_uuid()";
      if (c.generated === "now") def += " DEFAULT now()";
      if (c.default !== undefined) def += ` DEFAULT ${lit(c.default)}`;
      return def;
    });
    for (const c of cols) {
      if (c.unique) defs.push(`  CONSTRAINT ${q(`${table}_${c.sql}_key`)} UNIQUE (${q(c.sql)})`);
      if (c.kind === "enum") {
        defs.push(`  CONSTRAINT ${q(`${table}_${c.sql}_check`)} CHECK (${q(c.sql)} IN (${c.values.map(lit).join(", ")}))`);
      }
      if (c.references) {
        foreignKeys.push(
          `ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(`${table}_${c.sql}_fkey`)} FOREIGN KEY (${q(c.sql)}) ` +
            `REFERENCES ${q(snake(c.references.entity))} ("id") ON DELETE ${ON_DELETE[c.references.onDelete]};`,
        );
        indexes.push(`CREATE INDEX ${q(`${table}_${c.sql}_idx`)} ON ${q(table)} (${q(c.sql)});`);
      }
    }
    tables.push(`CREATE TABLE ${q(table)} (\n${defs.join(",\n")}\n);`);
  }

  const sections = [`-- ${MARKER} — do not edit\n-- Initial schema for ${spec.app.name}.`, tables.join("\n\n")];
  if (foreignKeys.length > 0) sections.push(foreignKeys.join("\n"));
  if (indexes.length > 0) sections.push(indexes.join("\n"));
  return `${sections.join("\n\n")}\n`;
}

function drizzleColumn(c: Column): string {
  const name = JSON.stringify(c.sql);
  const builder = {
    uuid: `pg.uuid(${name})`,
    string: `pg.text(${name})`,
    text: `pg.text(${name})`,
    email: `pg.text(${name})`,
    enum: `pg.text(${name}, { enum: [${c.values.map((v) => JSON.stringify(v)).join(", ")}] })`,
    int: `pg.integer(${name})`,
    money: `pg.bigint(${name}, { mode: "number" })`,
    bool: `pg.boolean(${name})`,
    datetime: `pg.timestamp(${name}, { withTimezone: true })`,
    date: `pg.date(${name})`,
  }[c.kind];
  let chain = builder;
  if (c.prop === "id") chain += ".primaryKey()";
  else if (c.notNull) chain += ".notNull()";
  if (c.generated === "uuid") chain += ".defaultRandom()";
  if (c.generated === "now") chain += ".defaultNow()";
  if (c.default !== undefined) chain += `.default(${JSON.stringify(c.default)})`;
  if (c.onUpdateNow) chain += ".$onUpdate(() => new Date())";
  return `  ${c.prop}: ${chain},`;
}

// src/db/schema.ts: Drizzle tables and relations, for queries only.
export function drizzleSchema(spec: Spec): string {
  const blocks: string[] = [];
  for (const entity of spec.entities) {
    const table = camel(entity.name);
    const cols = columnsOf(spec, entity);
    blocks.push(
      [
        `export const ${table} = pg.pgTable(${JSON.stringify(snake(entity.name))}, {`,
        ...cols.map(drizzleColumn),
        "});",
        `export type ${pascal(entity.name)}Row = typeof ${table}.$inferSelect;`,
      ].join("\n"),
    );

    const rels: string[] = [];
    for (const c of cols) {
      if (!c.references) continue;
      const target = camel(c.references.entity);
      const name = c.prop.slice(0, -"Id".length); // ownerId → owner, clientId → client
      rels.push(`  ${name}: one(${target}, { fields: [${table}.${c.prop}], references: [${target}.id] }),`);
    }
    for (const r of entity.relations) {
      if (r.kind === "hasMany") rels.push(`  ${r.name}: many(${camel(r.target)}),`);
    }
    if (rels.length > 0) {
      const helpers = [rels.some((r) => r.includes(": one(")) && "one", rels.some((r) => r.includes(": many(")) && "many"].filter(Boolean);
      blocks.push([`export const ${table}Relations = relations(${table}, ({ ${helpers.join(", ")} }) => ({`, ...rels, "}));"].join("\n"));
    }
  }

  const usesRelations = blocks.some((b) => b.includes("= relations("));
  return [
    HEADER,
    "// Drizzle tables for queries. migrations/*.sql is the source of truth for",
    "// constraints and indexes; this file only describes columns and relations.",
    ...(usesRelations ? ['import { relations } from "drizzle-orm";'] : []),
    'import * as pg from "drizzle-orm/pg-core";',
    "",
    blocks.join("\n\n"),
    "",
  ].join("\n");
}

export function dbClient(): string {
  return `${HEADER}
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type Db = typeof db;
`;
}

export function dbMigrate(): string {
  return `${HEADER}
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

// Resolves to <app>/migrations from both src/db (tsx) and dist/db (node).
const dir = new URL("../../migrations/", import.meta.url);

// Applies migrations/*.sql in name order, each once, each in a transaction.
// The advisory lock keeps two booting instances from racing. Hand-written
// migrations (e.g. 0001_indexes.sql, without the generated header) are applied too.
export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(72746)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS appspec_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = await client.query<{ name: string }>("SELECT name FROM appspec_migrations");
    const applied = new Set(done.rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(new URL(file, dir), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO appspec_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(72746)").catch(() => {});
    client.release();
  }
}
`;
}
