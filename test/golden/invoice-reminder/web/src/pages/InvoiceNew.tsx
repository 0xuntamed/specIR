// @appspec:generated — do not edit
import { useNavigate } from "react-router";
import { type InvoiceCreate, api } from "../api";
import { Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";

const fields: FieldDef[] = [
  { name: "clientId", label: "Client", kind: "ref", required: true, options: () => api.clients.list({ limit: 100 }).then((r) => r.items.map((row) => ({ value: row.id, label: String(row.name ?? row.id) }))) },
  { name: "number", label: "Number", kind: "string", required: true },
  { name: "currency", label: "Currency", kind: "string", required: true, default: "USD" },
  { name: "issueDate", label: "Issue date", kind: "date", required: true },
  { name: "dueDate", label: "Due date", kind: "date", required: true },
  { name: "notes", label: "Notes", kind: "text", required: false },
];

export function InvoiceNewPage() {
  const navigate = useNavigate();
  return (
    <section>
      <h1>New invoice</h1>
      <Form
        fields={fields}
        initial={initialValues(fields)}
        submitLabel="Create"
        onSubmit={async (body) => {
          const created = await api.invoices.create(body as InvoiceCreate);
          navigate(`/invoices/${created.id}`);
        }}
      />
    </section>
  );
}
