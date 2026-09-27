// @appspec:generated — do not edit
import { useNavigate } from "react-router";
import { type ClientCreate, api } from "../api";
import { Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";

const fields: FieldDef[] = [
  { name: "name", label: "Name", kind: "string", required: true },
  { name: "email", label: "Email", kind: "email", required: true },
];

export function ClientNewPage() {
  const navigate = useNavigate();
  return (
    <section>
      <h1>New client</h1>
      <Form
        fields={fields}
        initial={initialValues(fields)}
        submitLabel="Create"
        onSubmit={async (body) => {
          await api.clients.create(body as ClientCreate);
          navigate("/clients");
        }}
      />
    </section>
  );
}
