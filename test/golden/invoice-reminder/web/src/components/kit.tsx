// @appspec:generated — do not edit
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { ApiError } from "../api";
import { display, payload, type FieldDef, type FormValues } from "../lib/fields";
import { useAction, useLoad } from "../lib/hooks";

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const issues = error instanceof ApiError ? (error.body?.issues ?? []) : [];
  return (
    <div className="error" role="alert">
      <strong>{message}</strong>
      {issues.length > 0 && (
        <ul>
          {issues.map((issue) => (
            <li key={issue.path + issue.message}>
              {issue.path ? `${issue.path}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Row = { id: string } & Record<string, unknown>;

export function Table<T extends Row>(props: { fields: FieldDef[]; rows: T[]; link?: (row: T) => string; onDelete?: (row: T) => void }) {
  const { fields, rows, link, onDelete } = props;
  if (rows.length === 0) return <p className="empty">Nothing here yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          {fields.map((field) => (
            <th key={field.name}>{field.label}</th>
          ))}
          {onDelete && <th aria-label="Actions" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {fields.map((field, i) => (
              <td key={field.name}>{i === 0 && link ? <Link to={link(row)}>{display(field, row[field.name])}</Link> : display(field, row[field.name])}</td>
            ))}
            {onDelete && (
              <td className="row-actions">
                <button className="danger small" onClick={() => confirm("Delete this row?") && onDelete(row)}>
                  Delete
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Details({ fields, record }: { fields: FieldDef[]; record: Record<string, unknown> }) {
  return (
    <dl className="details">
      {fields.map((field) => (
        <div key={field.name}>
          <dt>{field.label}</dt>
          <dd>{display(field, record[field.name])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pager(props: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  const { total, limit, offset, onChange } = props;
  if (offset === 0 && total <= limit) return null;
  return (
    <div className="pager">
      <button className="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        Previous
      </button>
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <button className="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
        Next
      </button>
    </div>
  );
}

export function Form(props: { fields: FieldDef[]; initial: FormValues; submitLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const { fields, initial, submitLabel, onSubmit } = props;
  const [values, setValues] = useState(initial);
  const action = useAction();
  function submit(event: FormEvent) {
    event.preventDefault();
    void action.run(() => onSubmit(payload(fields, values)));
  }
  return (
    <form className="form" onSubmit={submit}>
      <ErrorBanner error={action.error} />
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name] ?? (field.kind === "bool" ? false : "")}
          onChange={(value) => setValues((prev) => ({ ...prev, [field.name]: value }))}
        />
      ))}
      <div>
        <button type="submit" disabled={action.busy}>
          {action.busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

const INPUT_TYPES: Partial<Record<FieldDef["kind"], string>> = {
  string: "text",
  email: "email",
  password: "password",
  uuid: "text",
  int: "number",
  money: "number",
  datetime: "datetime-local",
  date: "date",
};

function FieldInput({ field, value, onChange }: { field: FieldDef; value: string | boolean; onChange: (value: string | boolean) => void }) {
  const id = `field-${field.name}`;
  const text = typeof value === "string" ? value : "";
  let control: ReactNode;
  if (field.kind === "bool") {
    control = <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  } else if (field.kind === "text") {
    control = <textarea id={id} rows={6} value={text} required={field.required} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.kind === "enum") {
    control = (
      <select id={id} value={text} required={field.required} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.required ? "Choose…" : "—"}</option>
        {field.values?.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === "ref") {
    control = <OptionsSelect id={id} field={field} value={text} onChange={onChange} />;
  } else {
    control = (
      <input
        id={id}
        type={INPUT_TYPES[field.kind]}
        step={field.kind === "money" ? "0.01" : undefined}
        value={text}
        required={field.required}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <div className={field.kind === "bool" ? "field checkbox" : "field"}>
      <label htmlFor={id}>
        {field.label}
        {field.required || field.kind === "bool" ? "" : " (optional)"}
      </label>
      {control}
    </div>
  );
}

function OptionsSelect({ id, field, value, onChange }: { id: string; field: FieldDef; value: string; onChange: (value: string) => void }) {
  const options = useLoad(() => field.options?.() ?? Promise.resolve([]), [field]);
  return (
    <select id={id} value={value} required={field.required} onChange={(e) => onChange(e.target.value)}>
      <option value="">{options.loading ? "Loading…" : field.required ? "Choose…" : "—"}</option>
      {options.data?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// Custom pages render this until their slot is implemented.
export function NotImplemented({ slot, intent }: { slot: string; intent: string }) {
  return (
    <div className="not-implemented">
      <strong>Slot {slot} is not implemented yet.</strong>
      <p>{intent}</p>
    </div>
  );
}
