// @appspec:generated — do not edit
import { and, count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { db } from "../db/client.js";
import { note } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { Note, NoteCreate, NoteUpdate } from "../schemas/note.js";

export async function noteRoutes(app: FastifyInstance): Promise<void> {
  // notes.list
  app.get("/notes", { preHandler: authenticate }, async (request) => {
    const where = and(eq(note.ownerId, request.user.sub));
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);
    const rows = await db.select().from(note).where(where).orderBy(desc(note.createdAt), desc(note.id)).limit(query.limit).offset(query.offset);
    const [counted] = await db.select({ total: count() }).from(note).where(where);
    return { items: rows.map((row) => Note.parse(row)), total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  });

  // notes.get
  app.get("/notes/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.select().from(note).where(and(eq(note.id, params.id), eq(note.ownerId, request.user.sub)));
    if (!row) throw new HttpError(404, "Note not found");
    return Note.parse(row);
  });

  // notes.create
  app.post("/notes", { preHandler: authenticate }, async (request, reply) => {
    const body = NoteCreate.parse(request.body);
    const [row] = await db.insert(note).values({ ...body, ownerId: request.user.sub }).returning();
    return reply.status(201).send(Note.parse(row));
  });

  // notes.update
  app.patch("/notes/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = NoteUpdate.parse(request.body);
    if (Object.keys(body).length === 0) throw new HttpError(400, "Nothing to update");
    const [row] = await db.update(note).set(body).where(and(eq(note.id, params.id), eq(note.ownerId, request.user.sub))).returning();
    if (!row) throw new HttpError(404, "Note not found");
    return Note.parse(row);
  });

  // notes.delete
  app.delete("/notes/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.uuid() }).parse(request.params);
    const [row] = await db.delete(note).where(and(eq(note.id, params.id), eq(note.ownerId, request.user.sub))).returning({ id: note.id });
    if (!row) throw new HttpError(404, "Note not found");
    return reply.status(204).send();
  });
}
