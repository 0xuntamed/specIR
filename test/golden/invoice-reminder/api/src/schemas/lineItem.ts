// @appspec:generated — do not edit
import { z } from "zod";

// Response shape. Parsing a row through it drops columns clients must not see.
export const LineItem = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  invoiceId: z.uuid(),
  description: z.string(),
  quantity: z.int(),
  unitPrice: z.int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type LineItem = z.infer<typeof LineItem>;

// Request bodies. Unknown keys, readOnly fields and generated columns are rejected.
export const LineItemCreate = z.strictObject({
  invoiceId: z.uuid(),
  description: z.string().min(1),
  quantity: z.int32().optional(),
  unitPrice: z.int(),
});
export const LineItemUpdate = LineItemCreate.partial();
