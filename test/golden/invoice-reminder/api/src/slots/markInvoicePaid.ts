// @appspec:generated — do not edit outside @appspec:slot regions
import { z } from "zod";
import type { InvoiceRow } from "../db/schema.js";
import type { SlotContext } from "../lib/context.js";
import { NotImplemented } from "../lib/errors.js";

// @appspec:slot markInvoicePaid:imports begin
// @appspec:slot markInvoicePaid:imports end

export const MarkInvoicePaidInput = z.object({
  invoiceId: z.uuid(),
});
export type MarkInvoicePaidInput = z.infer<typeof MarkInvoicePaidInput> & { invoice: InvoiceRow };

// Called by POST /invoices/:invoiceId/mark-paid (invoices.markPaid).
// input.invoice is loaded and owner-checked before this runs.
//
// Mark a SENT invoice as PAID and set paidAt. Its PENDING reminders become SKIPPED.
export async function markInvoicePaid(ctx: SlotContext, input: MarkInvoicePaidInput): Promise<InvoiceRow> {
  // @appspec:slot markInvoicePaid begin
  throw new NotImplemented("markInvoicePaid");
  // @appspec:slot markInvoicePaid end
}
