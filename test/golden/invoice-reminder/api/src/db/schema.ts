// @appspec:generated — do not edit
// Drizzle tables for queries. migrations/*.sql is the source of truth for
// constraints and indexes; this file only describes columns and relations.
import { relations } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";

export const user = pg.pgTable("user", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  email: pg.text("email").notNull(),
  name: pg.text("name"),
  passwordHash: pg.text("password_hash").notNull(),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type UserRow = typeof user.$inferSelect;

export const client = pg.pgTable("client", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  ownerId: pg.uuid("owner_id").notNull(),
  name: pg.text("name").notNull(),
  email: pg.text("email").notNull(),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: pg.timestamp("deleted_at", { withTimezone: true }),
});
export type ClientRow = typeof client.$inferSelect;

export const clientRelations = relations(client, ({ one, many }) => ({
  owner: one(user, { fields: [client.ownerId], references: [user.id] }),
  invoices: many(invoice),
}));

export const invoice = pg.pgTable("invoice", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  ownerId: pg.uuid("owner_id").notNull(),
  clientId: pg.uuid("client_id").notNull(),
  number: pg.text("number").notNull(),
  status: pg.text("status", { enum: ["DRAFT", "SENT", "PAID", "CANCELLED"] }).notNull().default("DRAFT"),
  currency: pg.text("currency").notNull().default("USD"),
  issueDate: pg.date("issue_date").notNull(),
  dueDate: pg.date("due_date").notNull(),
  notes: pg.text("notes"),
  sentAt: pg.timestamp("sent_at", { withTimezone: true }),
  paidAt: pg.timestamp("paid_at", { withTimezone: true }),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type InvoiceRow = typeof invoice.$inferSelect;

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  owner: one(user, { fields: [invoice.ownerId], references: [user.id] }),
  client: one(client, { fields: [invoice.clientId], references: [client.id] }),
  lineItems: many(lineItem),
  reminders: many(reminder),
}));

export const lineItem = pg.pgTable("line_item", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  ownerId: pg.uuid("owner_id").notNull(),
  invoiceId: pg.uuid("invoice_id").notNull(),
  description: pg.text("description").notNull(),
  quantity: pg.integer("quantity").notNull().default(1),
  unitPrice: pg.bigint("unit_price", { mode: "number" }).notNull(),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type LineItemRow = typeof lineItem.$inferSelect;

export const lineItemRelations = relations(lineItem, ({ one }) => ({
  owner: one(user, { fields: [lineItem.ownerId], references: [user.id] }),
  invoice: one(invoice, { fields: [lineItem.invoiceId], references: [invoice.id] }),
}));

export const reminder = pg.pgTable("reminder", {
  id: pg.uuid("id").primaryKey().defaultRandom(),
  invoiceId: pg.uuid("invoice_id").notNull(),
  scheduledAt: pg.timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: pg.text("status", { enum: ["PENDING", "SENT", "FAILED", "SKIPPED"] }).notNull().default("PENDING"),
  attempts: pg.integer("attempts").notNull().default(0),
  lastError: pg.text("last_error"),
  sentAt: pg.timestamp("sent_at", { withTimezone: true }),
  idempotencyKey: pg.text("idempotency_key").notNull(),
  createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: pg.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type ReminderRow = typeof reminder.$inferSelect;

export const reminderRelations = relations(reminder, ({ one }) => ({
  invoice: one(invoice, { fields: [reminder.invoiceId], references: [invoice.id] }),
}));
