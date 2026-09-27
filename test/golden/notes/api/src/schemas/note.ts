// @appspec:generated — do not edit
import { z } from "zod";

// Response shape. Parsing a row through it drops columns clients must not see.
export const Note = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string(),
  body: z.string().nullable(),
  pinned: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Note = z.infer<typeof Note>;

// Request bodies. Unknown keys, readOnly fields and generated columns are rejected.
export const NoteCreate = z.strictObject({
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});
export const NoteUpdate = NoteCreate.partial();
