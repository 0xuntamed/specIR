// @appspec:generated — do not edit
import { z } from "zod";

// Response shape. Parsing a row through it drops columns clients must not see.
export const Reminder = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  scheduledAt: z.date(),
  status: z.enum(["PENDING", "SENT", "FAILED", "SKIPPED"]),
  attempts: z.int(),
  lastError: z.string().nullable(),
  sentAt: z.date().nullable(),
  idempotencyKey: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Reminder = z.infer<typeof Reminder>;
