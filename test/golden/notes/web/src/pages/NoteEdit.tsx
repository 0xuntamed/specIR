// @appspec:generated — do not edit
import { useNavigate, useParams } from "react-router";
import { type NoteUpdate, api } from "../api";
import { ErrorBanner, Form } from "../components/kit";
import { type FieldDef, initialValues } from "../lib/fields";
import { useLoad } from "../lib/hooks";

const fields: FieldDef[] = [
  { name: "title", label: "Title", kind: "string", required: true },
  { name: "body", label: "Body", kind: "text", required: false },
  { name: "pinned", label: "Pinned", kind: "bool", required: true, default: false },
];

export function NoteEditPage() {
  const navigate = useNavigate();
  const params = useParams() as { id: string };
  const record = useLoad(() => api.notes.get(params.id), [params.id]);
  return (
    <section>
      <h1>Edit note</h1>
      <ErrorBanner error={record.error} />
      {record.data && (
        <Form
          fields={fields}
          initial={initialValues(fields, record.data)}
          submitLabel="Save"
          onSubmit={async (body) => {
            await api.notes.update(params.id, body as NoteUpdate);
            navigate("/notes");
          }}
        />
      )}
    </section>
  );
}
