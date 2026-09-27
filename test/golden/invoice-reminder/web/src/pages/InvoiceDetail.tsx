// @appspec:generated — do not edit
import { Link, useParams } from "react-router";
import { api } from "../api";
import { Details, ErrorBanner, Table } from "../components/kit";
import type { FieldDef } from "../lib/fields";
import { saveBlob, useAction, useLoad } from "../lib/hooks";

const fields: FieldDef[] = [
  { name: "number", label: "Number", kind: "string", required: true },
  { name: "status", label: "Status", kind: "enum", required: true, values: ["DRAFT", "SENT", "PAID", "CANCELLED"] },
  { name: "currency", label: "Currency", kind: "string", required: true },
  { name: "issueDate", label: "Issue date", kind: "date", required: true },
  { name: "dueDate", label: "Due date", kind: "date", required: true },
  { name: "notes", label: "Notes", kind: "text", required: false },
  { name: "sentAt", label: "Sent at", kind: "datetime", required: false },
  { name: "paidAt", label: "Paid at", kind: "datetime", required: false },
];

const lineItemsFields: FieldDef[] = [
  { name: "description", label: "Description", kind: "string", required: true },
  { name: "quantity", label: "Quantity", kind: "int", required: true },
  { name: "unitPrice", label: "Unit price", kind: "money", required: true },
];

export function InvoiceDetailPage() {
  const params = useParams() as { id: string };
  const record = useLoad(() => api.invoices.get(params.id), [params.id]);
  const action = useAction();
  const lineItems = useLoad(() => api.lineItems.list(params.id), [params.id]);
  return (
    <section>
      <header className="page-header">
        <h1>Invoice {record.data?.number}</h1>
        <div className="actions">
          <Link className="button secondary" to={`/invoices/${params.id}/edit`}>Invoice editor</Link>
          <button disabled={action.busy} onClick={() => void action.run(async () => { await api.invoices.send(params.id); record.reload(); })}>Send</button>
          <button disabled={action.busy} onClick={() => void action.run(async () => saveBlob(await api.invoices.pdf(params.id), `invoice-${params.id}.pdf`))}>Pdf</button>
          <button disabled={action.busy} onClick={() => void action.run(async () => { await api.invoices.markPaid(params.id); record.reload(); })}>Mark paid</button>
        </div>
      </header>
      <ErrorBanner error={record.error ?? action.error} />
      {record.data && <Details fields={fields} record={record.data} />}
      <h2>Line items</h2>
      <ErrorBanner error={lineItems.error} />
      {lineItems.data && <Table fields={lineItemsFields} rows={lineItems.data.items} />}
    </section>
  );
}
