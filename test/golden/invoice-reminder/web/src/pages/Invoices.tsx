// @appspec:generated — do not edit
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { ErrorBanner, Pager, Table } from "../components/kit";
import type { FieldDef } from "../lib/fields";
import { useAction, useLoad } from "../lib/hooks";

const fields: FieldDef[] = [
  { name: "number", label: "Number", kind: "string", required: true },
  { name: "status", label: "Status", kind: "enum", required: true, values: ["DRAFT", "SENT", "PAID", "CANCELLED"] },
  { name: "currency", label: "Currency", kind: "string", required: true },
  { name: "issueDate", label: "Issue date", kind: "date", required: true },
  { name: "dueDate", label: "Due date", kind: "date", required: true },
  { name: "sentAt", label: "Sent at", kind: "datetime", required: false },
  { name: "paidAt", label: "Paid at", kind: "datetime", required: false },
];

export function InvoicesPage() {
  const [offset, setOffset] = useState(0);
  const list = useLoad(() => api.invoices.list({ offset }), [offset]);
  const action = useAction();
  return (
    <section>
      <header className="page-header">
        <h1>Invoices</h1>
        <Link className="button" to={"/invoices/new"}>New invoice</Link>
      </header>
      <ErrorBanner error={list.error ?? action.error} />
      {list.data && (
        <>
          <Table fields={fields} rows={list.data.items} link={(row) => `/invoices/${row.id}`} onDelete={(row) => void action.run(async () => { await api.invoices.delete(row.id); list.reload(); })} />
          <Pager total={list.data.total} limit={list.data.limit} offset={offset} onChange={setOffset} />
        </>
      )}
    </section>
  );
}
