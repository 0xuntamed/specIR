// @appspec:generated — do not edit outside @appspec:slot regions
import { z } from "zod";
import type { InvoiceRow } from "../db/schema.js";
import type { SlotContext } from "../lib/context.js";
import { NotImplemented } from "../lib/errors.js";

// @appspec:slot renderInvoicePdf:imports begin
// @appspec:slot renderInvoicePdf:imports end

export const RenderInvoicePdfInput = z.object({
  invoiceId: z.uuid(),
});
export type RenderInvoicePdfInput = z.infer<typeof RenderInvoicePdfInput> & { invoice: InvoiceRow };

// Called by GET /invoices/:invoiceId/pdf (invoices.pdf).
// input.invoice is loaded and owner-checked before this runs.
//
// Render the invoice as a PDF: client details, line items (quantity × unitPrice), and the total,
// formatted in the invoice currency from minor units.
export async function renderInvoicePdf(ctx: SlotContext, input: RenderInvoicePdfInput): Promise<Buffer> {
  // @appspec:slot renderInvoicePdf begin
  throw new NotImplemented("renderInvoicePdf");
  // @appspec:slot renderInvoicePdf end
}
