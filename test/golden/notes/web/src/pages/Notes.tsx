// @appspec:generated — do not edit
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { ErrorBanner, Pager, Table } from "../components/kit";
import type { FieldDef } from "../lib/fields";
import { useAction, useLoad } from "../lib/hooks";

const fields: FieldDef[] = [
  { name: "title", label: "Title", kind: "string", required: true },
  { name: "pinned", label: "Pinned", kind: "bool", required: true },
];

export function NotesPage() {
  const [offset, setOffset] = useState(0);
  const list = useLoad(() => api.notes.list({ offset }), [offset]);
  const action = useAction();
  return (
    <section>
      <header className="page-header">
        <h1>Notes</h1>
        <Link className="button" to={"/notes/new"}>New note</Link>
      </header>
      <ErrorBanner error={list.error ?? action.error} />
      {list.data && (
        <>
          <Table fields={fields} rows={list.data.items} link={(row) => `/notes/${row.id}/edit`} onDelete={(row) => void action.run(async () => { await api.notes.delete(row.id); list.reload(); })} />
          <Pager total={list.data.total} limit={list.data.limit} offset={offset} onChange={setOffset} />
        </>
      )}
    </section>
  );
}
