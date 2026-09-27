// @appspec:generated — do not edit
import { useParams } from "react-router";
import { InvoiceEditor } from "../slots/invoiceEditor";

export function InvoiceEditorPage() {
  const params = useParams() as { id: string };
  return <InvoiceEditor params={params} />;
}
