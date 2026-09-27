// @appspec:generated — do not edit
import { z } from "zod";

// Response shape. Parsing a row through it drops columns clients must not see.
export const Invoice = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  clientId: z.uuid(),
  number: z.string(),
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]),
  currency: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  notes: z.string().nullable(),
  sentAt: z.date().nullable(),
  paidAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Invoice = z.infer<typeof Invoice>;

// Request bodies. Unknown keys, readOnly fields and generated columns are rejected.
export const InvoiceCreate = z.strictObject({
  clientId: z.uuid(),
  number: z.string().min(1),
  currency: z.string().min(1).optional(),
  issueDate: z.iso.date(),
  dueDate: z.iso.date(),
  notes: z.string().nullable().optional(),
});
export const InvoiceUpdate = InvoiceCreate.partial();
