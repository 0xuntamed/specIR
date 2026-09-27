// @appspec:generated — do not edit
import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { db } from "../db/client.js";
import { client } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { Client, ClientCreate, ClientUpdate } from "../schemas/client.js";

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  // clients.list
  app.get("/clients", { preHandler: authenticate }, async (request) => {
    const where = and(eq(client.ownerId, request.user.sub), isNull(client.deletedAt));
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const rows = await db.select().from(client).where(where).orderBy(desc(client.createdAt), desc(client.id)).limit(query.limit).offset(query.offset);
    const [counted] = await db.select({ total: count() }).from(client).where(where);
    return { items: rows.map((row) => Client.parse(row)), total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  });

  // clients.get
  app.get("/clients/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.select().from(client).where(and(eq(client.id, params.id), eq(client.ownerId, request.user.sub), isNull(client.deletedAt)));
    if (!row) throw new HttpError(404, "Client not found");
    return Client.parse(row);
  });

  // clients.create
  app.post("/clients", { preHandler: authenticate }, async (request, reply) => {
    const body = ClientCreate.parse(request.body);
    const [row] = await db.insert(client).values({ ...body, ownerId: request.user.sub }).returning();
    return reply.status(201).send(Client.parse(row));
  });

  // clients.update
  app.patch("/clients/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = ClientUpdate.parse(request.body);
    if (Object.keys(body).length === 0) throw new HttpError(400, "Nothing to update");
    const [row] = await db.update(client).set(body).where(and(eq(client.id, params.id), eq(client.ownerId, request.user.sub), isNull(client.deletedAt))).returning();
    if (!row) throw new HttpError(404, "Client not found");
    return Client.parse(row);
  });

  // clients.delete
  app.delete("/clients/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.update(client).set({ deletedAt: new Date() }).where(and(eq(client.id, params.id), eq(client.ownerId, request.user.sub), isNull(client.deletedAt))).returning({ id: client.id });
    if (!row) throw new HttpError(404, "Client not found");
    return reply.status(204).send();
  });
}
