// @appspec:generated — do not edit outside @appspec:slot regions
import { z } from "zod";
import type { InvoiceRow } from "../db/schema.js";
import type { SlotContext } from "../lib/context.js";
import { NotImplemented } from "../lib/errors.js";

// @appspec:slot sendInvoice:imports begin
// @appspec:slot sendInvoice:imports end

export const SendInvoiceInput = z.object({
  invoiceId: z.uuid(),
});
export type SendInvoiceInput = z.infer<typeof SendInvoiceInput> & { invoice: InvoiceRow };

// Called by POST /invoices/:invoiceId/send (invoices.send).
// input.invoice is loaded and owner-checked before this runs.
//
// Only a DRAFT invoice can be sent. Render its PDF, email it to the client via Resend, set status
// SENT and sentAt, and create PENDING reminders (e.g. on the due date and every 7 days after) each
// with a unique idempotencyKey, all in one transaction.
export async function sendInvoice(ctx: SlotContext, input: SendInvoiceInput): Promise<InvoiceRow> {
  // @appspec:slot sendInvoice begin
  throw new NotImplemented("sendInvoice");
  // @appspec:slot sendInvoice end
}
