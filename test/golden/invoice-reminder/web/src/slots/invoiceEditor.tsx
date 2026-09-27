// @appspec:generated — do not edit outside @appspec:slot regions
import { api } from "../api";
import { NotImplemented } from "../components/kit";

// @appspec:slot invoiceEditor:imports begin
// @appspec:slot invoiceEditor:imports end

// Page invoiceEditor at /invoices/:id/edit. May call:
//   api.invoices.get, api.invoices.update, api.clients.list, api.lineItems.list,
//   api.lineItems.create, api.lineItems.update, api.lineItems.delete
const INTENT = "Edit an invoice's fields and its line items inline on one screen (add, edit, remove rows), showing a running total computed from quantity × unitPrice.";

export function InvoiceEditor({ params }: { params: { id: string } }) {
  // @appspec:slot invoiceEditor begin
  void api;
  void params;
  return <NotImplemented slot="invoiceEditor" intent={INTENT} />;
  // @appspec:slot invoiceEditor end
}
