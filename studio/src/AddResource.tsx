import { useState } from "react";
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

  return (
    <div className="dialog-backdrop" onClick={props.onCancel}>
      <div className="dialog" role="dialog" aria-label="Add resource" onClick={(e) => e.stopPropagation()}>
        <h2>Add resource</h2>
        <p className="muted">An entity plus list / view / create / edit / delete endpoints{pages ? " and list, new and edit pages" : ""}.</p>
        <div className="row">
          <Text label="Entity name" value={name} placeholder="Task" hint="PascalCase" onChange={setName} />
          <Text label="Plural" value={effectivePlural} placeholder="tasks" hint="Names endpoints (tasks.list) and URLs (/tasks)" onChange={setPlural} />
        </div>
        <h3>Fields</h3>
        <FieldTable fields={fields} onChange={setFields} />
        <div className="row">
          <Check label="Each user sees only their own rows" checked={owned} onChange={setOwned} />
          <Check label="Add pages" checked={pages} onChange={setPages} />
        </div>
        <footer className="dialog-actions">
          <button className="secondary" onClick={props.onCancel}>
            Cancel
          </button>
          <button disabled={!valid} onClick={() => props.onAdd(addResource(props.spec, { name, plural: effectivePlural, fields, owned, pages }), props.spec.entities.length)}>
            Add {name || "resource"}
          </button>
        </footer>
      </div>
    </div>
  );
}
