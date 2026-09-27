// @appspec:generated — do not edit
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { slotContext } from "../lib/context.js";
import { HttpError } from "../lib/errors.js";
import { loadInvoice } from "../lib/load.js";
import { Invoice } from "../schemas/invoice.js";
import { MarkInvoicePaidInput, markInvoicePaid } from "../slots/markInvoicePaid.js";
import { RenderInvoicePdfInput, renderInvoicePdf } from "../slots/renderInvoicePdf.js";
import { SendInvoiceInput, sendInvoice } from "../slots/sendInvoice.js";

export async function customRoutes(app: FastifyInstance): Promise<void> {
  // invoices.send → slot sendInvoice
  app.post("/invoices/:invoiceId/send", { preHandler: authenticate }, async (request) => {
    const input = SendInvoiceInput.parse({ ...(request.params as object), ...(request.body as object) });
    const invoice = await loadInvoice(input.invoiceId, request.user.sub);
    if (!invoice) throw new HttpError(404, "Invoice not found");
    return Invoice.parse(await sendInvoice(slotContext(request.log, { id: request.user.sub }), { ...input, invoice }));
  });

  // invoices.pdf → slot renderInvoicePdf
  app.get("/invoices/:invoiceId/pdf", { preHandler: authenticate }, async (request, reply) => {
    const input = RenderInvoicePdfInput.parse({ ...(request.params as object), ...(request.query as object) });
    const invoice = await loadInvoice(input.invoiceId, request.user.sub);
    if (!invoice) throw new HttpError(404, "Invoice not found");
    const result = await renderInvoicePdf(slotContext(request.log, { id: request.user.sub }), { ...input, invoice });
    return reply.type("application/pdf").send(result);
  });

  // invoices.markPaid → slot markInvoicePaid
  app.post("/invoices/:invoiceId/mark-paid", { preHandler: authenticate }, async (request) => {
    const input = MarkInvoicePaidInput.parse({ ...(request.params as object), ...(request.body as object) });
    const invoice = await loadInvoice(input.invoiceId, request.user.sub);
    if (!invoice) throw new HttpError(404, "Invoice not found");
    return Invoice.parse(await markInvoicePaid(slotContext(request.log, { id: request.user.sub }), { ...input, invoice }));
  });
}
