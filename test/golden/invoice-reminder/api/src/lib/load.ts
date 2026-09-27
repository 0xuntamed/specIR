// @appspec:generated — do not edit
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { type ClientRow, type InvoiceRow, client, invoice } from "../db/schema.js";

// Load one row by id, or undefined. Given an ownerId, only a row that user owns.
// Soft-deleted rows are never returned.
export async function loadClient(id: string, ownerId?: string): Promise<ClientRow | undefined> {
  const [row] = await db
    .select()
    .from(client)
    .where(and(eq(client.id, id), ownerId === undefined ? undefined : eq(client.ownerId, ownerId), isNull(client.deletedAt)));
  return row;
}

export async function loadInvoice(id: string, ownerId?: string): Promise<InvoiceRow | undefined> {
  const [row] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, id), ownerId === undefined ? undefined : eq(invoice.ownerId, ownerId)));
  return row;
}
