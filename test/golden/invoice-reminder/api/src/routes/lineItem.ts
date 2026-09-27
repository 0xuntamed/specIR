// @appspec:generated — do not edit
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { db } from "../db/client.js";
import { lineItem } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { loadInvoice } from "../lib/load.js";
import { LineItem, LineItemCreate, LineItemUpdate } from "../schemas/lineItem.js";

export async function lineItemRoutes(app: FastifyInstance): Promise<void> {
  // lineItems.list
  app.get("/invoices/:invoiceId/line-items", { preHandler: authenticate }, async (request) => {
    const params = z.object({ invoiceId: z.uuid() }).parse(request.params);
    if (!(await loadInvoice(params.invoiceId, request.user.sub))) throw new HttpError(404, "Invoice not found");
    const where = and(eq(lineItem.invoiceId, params.invoiceId), eq(lineItem.ownerId, request.user.sub));
    const rows = await db.select().from(lineItem).where(where).orderBy(desc(lineItem.createdAt), desc(lineItem.id));
    return { items: rows.map((row) => LineItem.parse(row)) };
  });

  // lineItems.create
  app.post("/invoices/:invoiceId/line-items", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ invoiceId: z.uuid() }).parse(request.params);
    if (!(await loadInvoice(params.invoiceId, request.user.sub))) throw new HttpError(404, "Invoice not found");
    const body = LineItemCreate.omit({ invoiceId: true }).parse(request.body);
    const [row] = await db.insert(lineItem).values({ ...body, invoiceId: params.invoiceId, ownerId: request.user.sub }).returning();
    return reply.status(201).send(LineItem.parse(row));
  });

  // lineItems.update
  app.patch("/line-items/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = LineItemUpdate.parse(request.body);
    if (Object.keys(body).length === 0) throw new HttpError(400, "Nothing to update");
    if (body.invoiceId != null && !(await loadInvoice(body.invoiceId, request.user.sub))) throw new HttpError(400, "invoiceId: Invoice not found");
    const [row] = await db.update(lineItem).set(body).where(and(eq(lineItem.id, params.id), eq(lineItem.ownerId, request.user.sub))).returning();
    if (!row) throw new HttpError(404, "LineItem not found");
    return LineItem.parse(row);
  });

  // lineItems.delete
  app.delete("/line-items/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.delete(lineItem).where(and(eq(lineItem.id, params.id), eq(lineItem.ownerId, request.user.sub))).returning({ id: lineItem.id });
    if (!row) throw new HttpError(404, "LineItem not found");
    return reply.status(204).send();
  });
}
