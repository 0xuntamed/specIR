// @appspec:generated — do not edit
import { useNavigate, useParams } from "react-router";
import { type ClientUpdate, api } from "../api";
import { ErrorBanner, Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";
import { useLoad } from "../lib/hooks";

const fields: FieldDef[] = [
  { name: "name", label: "Name", kind: "string", required: true },
  { name: "email", label: "Email", kind: "email", required: true },
];

export function ClientEditPage() {
  const navigate = useNavigate();
  const params = useParams() as { id: string };
  const record = useLoad(() => api.clients.get(params.id), [params.id]);
  return (
    <section>
      <h1>Edit client</h1>
      <ErrorBanner error={record.error} />
      {record.data && (
        <Form
          fields={fields}
          initial={initialValues(fields, record.data)}
          submitLabel="Save"
          onSubmit={async (body) => {
            await api.clients.update(params.id, body as ClientUpdate);
            navigate("/clients");
          }}
        />
      )}
    </section>
  );
}
