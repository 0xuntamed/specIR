// @appspec:generated — do not edit
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
