// @appspec:generated — do not edit
import { z } from "zod";

// Response shape. Parsing a row through it drops columns clients must not see.
export const Client = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  name: z.string(),
  email: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Client = z.infer<typeof Client>;

// Request bodies. Unknown keys, readOnly fields and generated columns are rejected.
export const ClientCreate = z.strictObject({
  name: z.string().min(1),
  email: z.email(),
});
export const ClientUpdate = ClientCreate.partial();
