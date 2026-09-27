// @appspec:generated — do not edit
import { z } from "zod";

// Response shape. Parsing a row through it drops columns clients must not see.
export const User = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof User>;

// Request bodies. Unknown keys, readOnly fields and generated columns are rejected.
export const UserCreate = z.strictObject({
  email: z.email(),
  name: z.string().nullable().optional(),
});
