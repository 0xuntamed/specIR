import { useState } from "react";
import { Dialog } from "./dialogs";
import { addResource, pluralOf, type FieldIn, type Spec } from "./edits";
import { FieldTable } from "./forms";
import { Check, Text } from "./ui";

// The "standard CRUD resource" preset: one form instead of an entity, five
// endpoints and three pages.
export function AddResource(props: { spec: Spec; onAdd: (spec: Spec, entityIndex: number) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [plural, setPlural] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldIn[]>([{ name: "title", type: "string", required: true }]);
  const [owned, setOwned] = useState(props.spec.auth !== undefined);
  const [pages, setPages] = useState(true);
  const effectivePlural = plural ?? (name ? pluralOf(name) : "");
  const valid = /^[A-Z][a-zA-Z0-9]*$/.test(name) && /^[a-z][a-zA-Z0-9]*$/.test(effectivePlural);
  const add = () => valid && props.onAdd(addResource(props.spec, { name, plural: effectivePlural, fields, owned, pages }), props.spec.entities.length);

  return (
    <Dialog
      wide
      title="Add resource"
      description={`An entity with list, view, create, edit and delete endpoints${pages ? ", plus list, new and edit pages" : ""}.`}
      onClose={props.onCancel}
      onSubmit={add}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Add {name || "resource"}
          </button>
        </>
      }
    >
      <div className="row">
        <Text label="Entity name" value={name} placeholder="Task" hint="PascalCase" onChange={setName} />
        <Text label="Plural" value={effectivePlural} placeholder="tasks" hint="Names endpoints (tasks.list) and URLs (/tasks)" onChange={setPlural} />
      </div>
      <h3>Fields</h3>
      <FieldTable fields={fields} onChange={setFields} />
      <div className="row checks-row">
        <Check label="Each user sees only their own rows" checked={owned} onChange={setOwned} />
        <Check label="Add pages" checked={pages} onChange={setPages} />
      </div>
    </Dialog>
  );
}
