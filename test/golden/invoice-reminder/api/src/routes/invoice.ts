// @appspec:generated — do not edit
import { and, count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { db } from "../db/client.js";
import { invoice } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { loadClient } from "../lib/load.js";
import { Invoice, InvoiceCreate, InvoiceUpdate } from "../schemas/invoice.js";

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  // invoices.list
  app.get("/invoices", { preHandler: authenticate }, async (request) => {
    const where = and(eq(invoice.ownerId, request.user.sub));
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const rows = await db.select().from(invoice).where(where).orderBy(desc(invoice.createdAt), desc(invoice.id)).limit(query.limit).offset(query.offset);
    const [counted] = await db.select({ total: count() }).from(invoice).where(where);
    return { items: rows.map((row) => Invoice.parse(row)), total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  });

  // invoices.get
  app.get("/invoices/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.select().from(invoice).where(and(eq(invoice.id, params.id), eq(invoice.ownerId, request.user.sub)));
    if (!row) throw new HttpError(404, "Invoice not found");
    return Invoice.parse(row);
  });

  // invoices.create
  app.post("/invoices", { preHandler: authenticate }, async (request, reply) => {
    const body = InvoiceCreate.parse(request.body);
    if (!(await loadClient(body.clientId, request.user.sub))) throw new HttpError(400, "clientId: Client not found");
    const [row] = await db.insert(invoice).values({ ...body, ownerId: request.user.sub }).returning();
    return reply.status(201).send(Invoice.parse(row));
  });

  // invoices.update
  app.patch("/invoices/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = InvoiceUpdate.parse(request.body);
    if (Object.keys(body).length === 0) throw new HttpError(400, "Nothing to update");
    if (body.clientId != null && !(await loadClient(body.clientId, request.user.sub))) throw new HttpError(400, "clientId: Client not found");
    const [row] = await db.update(invoice).set(body).where(and(eq(invoice.id, params.id), eq(invoice.ownerId, request.user.sub))).returning();
    if (!row) throw new HttpError(404, "Invoice not found");
    return Invoice.parse(row);
  });

  // invoices.delete
  app.delete("/invoices/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.delete(invoice).where(and(eq(invoice.id, params.id), eq(invoice.ownerId, request.user.sub))).returning({ id: invoice.id });
    if (!row) throw new HttpError(404, "Invoice not found");
    return reply.status(204).send();
  });
}
