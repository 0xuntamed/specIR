// @appspec:generated — do not edit
// Drizzle tables for queries. migrations/*.sql is the source of truth for
// constraints and indexes; this file only describes columns and relations.
import { relations } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";

export const user = pg.pgTable("user", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  email: pg.text("email").notNull(),
  passwordHash: pg.text("password_hash").notNull(),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type UserRow = typeof user.$inferSelect;

export const note = pg.pgTable("note", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  ownerId: pg.uuid("owner_id").notNull(),
  title: pg.text("title").notNull(),
  body: pg.text("body"),
  pinned: pg.boolean("pinned").notNull().default(false),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type NoteRow = typeof note.$inferSelect;

export const noteRelations = relations(note, ({ one }) => ({
  owner: one(user, { fields: [note.ownerId], references: [user.id] }),
}));
