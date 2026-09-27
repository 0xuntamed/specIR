// @appspec:generated — do not edit
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { ErrorBanner, Pager, Table } from "../components/kit";
import type { FieldDef } from "../lib/fields";
import { useAction, useLoad } from "../lib/hooks";

const fields: FieldDef[] = [
  { name: "name", label: "Name", kind: "string", required: true },
  { name: "email", label: "Email", kind: "email", required: true },
];

export function ClientsPage() {
  const [offset, setOffset] = useState(0);
  const list = useLoad(() => api.clients.list({ offset }), [offset]);
  const action = useAction();
  return (
    <section>
      <header className="page-header">
        <h1>Clients</h1>
        <Link className="button" to={"/clients/new"}>New client</Link>
      </header>
      <ErrorBanner error={list.error ?? action.error} />
      {list.data && (
        <>
          <Table fields={fields} rows={list.data.items} link={(row) => `/clients/${row.id}/edit`} onDelete={(row) => void action.run(async () => { await api.clients.delete(row.id); list.reload(); })} />
          <Pager total={list.data.total} limit={list.data.limit} offset={offset} onChange={setOffset} />
        </>
      )}
    </section>
  );
}
