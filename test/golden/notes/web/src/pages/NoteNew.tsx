// @appspec:generated — do not edit
import { useNavigate } from "react-router";
import { type NoteCreate, api } from "../api";
import { Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";

const fields: FieldDef[] = [
  { name: "title", label: "Title", kind: "string", required: true },
  { name: "body", label: "Body", kind: "text", required: false },
  { name: "pinned", label: "Pinned", kind: "bool", required: true, default: false },
];

export function NoteNewPage() {
  const navigate = useNavigate();
  return (
    <section>
      <h1>New note</h1>
      <Form
        fields={fields}
        initial={initialValues(fields)}
        submitLabel="Create"
        onSubmit={async (body) => {
          await api.notes.create(body as NoteCreate);
          navigate("/notes");
        }}
      />
    </section>
  );
}
