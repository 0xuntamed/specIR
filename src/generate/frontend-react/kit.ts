import { HEADER, MARKER } from "../names";

// Spec-independent frontend files: field conversions, data hooks, UI kit, CSS.
// Pages are generated as short files that declare fields and wire these up.

export function fieldsModule(): string {
  return `${HEADER}
// How a field is shown, edited and sent. Pages declare FieldDef lists; the
// kit turns them into tables, detail lists and forms.
export type FieldDef = {
  name: string;
  label: string;
  kind: "string" | "text" | "email" | "password" | "uuid" | "int" | "money" | "bool" | "datetime" | "date" | "enum" | "ref";
  required: boolean;
  values?: string[]; // enum
  default?: string | number | boolean;
  options?: () => Promise<{ value: string; label: string }[]>; // ref pickers
};

export type FormValues = Record<string, string | boolean>;

// Money is integer minor units on the wire, shown with 2 decimals.
export function display(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.kind) {
    case "money":
      return (Number(value) / 100).toFixed(2);
    case "bool":
      return value ? "Yes" : "No";
    case "datetime":
      return new Date(String(value)).toLocaleString();
    default:
      return String(value);
  }
}

function toInput(field: FieldDef, value: unknown): string | boolean {
  if (field.kind === "bool") return value === true;
  if (value === null || value === undefined) return "";
  switch (field.kind) {
    case "money":
      return (Number(value) / 100).toFixed(2);
    case "datetime": {
      // datetime-local wants local time without a zone: YYYY-MM-DDTHH:mm
      const date = new Date(String(value));
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    }
    default:
      return String(value);
  }
}

// undefined = leave the field out; null = clear it.
function fromInput(field: FieldDef, input: string | boolean): unknown {
  if (field.kind === "bool") return input === true;
  const text = String(input);
  if (text.trim() === "") return field.required ? undefined : null;
  switch (field.kind) {
    case "int": {
      const n = Number.parseInt(text, 10);
      return Number.isNaN(n) ? text : n;
    }
    case "money": {
      const n = Number.parseFloat(text);
      return Number.isNaN(n) ? text : Math.round(n * 100);
    }
    case "datetime":
      return new Date(text).toISOString();
    default:
      return text;
  }
}

// Form state from a record (edit) or from field defaults (create).
export function initialValues(fields: FieldDef[], record?: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const field of fields) values[field.name] = toInput(field, record ? record[field.name] : field.default);
  return values;
}

export function payload(fields: FieldDef[], values: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = fromInput(field, values[field.name] ?? "");
    if (value !== undefined) body[field.name] = value;
  }
  return body;
}
`;
}

export function hooksModule(): string {
  return `${HEADER}
import { useEffect, useState, type DependencyList } from "react";

// Loads data when deps change; reload() fetches again.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setState((prev) => ({ ...prev, loading: true }));
    load().then(
      (data) => live && setState({ data, loading: false }),
      (error: unknown) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return { ...state, reload: () => setVersion((v) => v + 1) };
}

// Runs a mutation, tracking busy and error for the UI.
export function useAction() {
  const [state, setState] = useState<{ busy: boolean; error?: unknown }>({ busy: false });
  async function run(action: () => Promise<unknown>): Promise<void> {
    setState({ busy: true });
    try {
      await action();
      setState({ busy: false });
    } catch (error) {
      setState({ busy: false, error });
    }
  }
  return { ...state, run };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
`;
}

export function kitModule(): string {
  return `${HEADER}
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
              {issue.path ? \`\${issue.path}: \` : ""}
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
  const id = \`field-\${field.name}\`;
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
`;
}

export function stylesCss(): string {
  return `/* ${MARKER} — do not edit */
:root {
  --bg: #f7f7f5;
  --surface: #ffffff;
  --text: #1c1c1a;
  --muted: #6b6b66;
  --border: #e3e3de;
  --accent: #2f5bea;
  --accent-text: #ffffff;
  --danger: #c2332b;
  --radius: 8px;
  color-scheme: light;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615;
    --surface: #1f1f1d;
    --text: #ececea;
    --muted: #a0a09a;
    --border: #33332f;
    --accent: #7c9bff;
    --accent-text: #0e0e0d;
    --danger: #ff7b72;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: var(--accent); }
h1 { font-size: 1.5rem; margin: 0; }
h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; }

.container { max-width: 960px; margin: 0 auto; padding: 0 16px; }
main.container { padding-top: 24px; padding-bottom: 48px; }
.narrow { max-width: 420px; }

.nav { background: var(--surface); border-bottom: 1px solid var(--border); }
.nav-inner { display: flex; align-items: center; gap: 20px; height: 56px; }
.nav nav { display: flex; gap: 16px; flex: 1; }
.nav a { color: var(--muted); text-decoration: none; }
.nav a.active, .nav a:hover { color: var(--text); }
.nav .brand { color: var(--text); font-weight: 600; }
.nav-end { display: flex; gap: 16px; align-items: center; }

.page-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }

button, .button {
  display: inline-block; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none;
  padding: 8px 14px; border-radius: var(--radius); border: 1px solid var(--accent);
  background: var(--accent); color: var(--accent-text);
}
button:disabled { opacity: 0.6; cursor: default; }
button.secondary, .button.secondary { background: transparent; color: var(--text); border-color: var(--border); }
button.danger { background: transparent; color: var(--danger); border-color: var(--border); }
button.small { padding: 4px 10px; font-size: 0.9em; }
button.link { background: none; border: none; padding: 0; color: var(--muted); }
button.link:hover { color: var(--text); }

table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
th { font-size: 0.85em; color: var(--muted); font-weight: 500; }
tr:last-child td { border-bottom: none; }
td.row-actions { text-align: right; width: 1%; white-space: nowrap; }
.empty { color: var(--muted); }

.details { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 0; }
.details dt { font-size: 0.85em; color: var(--muted); }
.details dd { margin: 2px 0 0; }

.form { display: grid; gap: 16px; max-width: 560px; }
.field { display: grid; gap: 6px; }
.field label { font-weight: 500; }
.field.checkbox { display: flex; flex-direction: row-reverse; justify-content: flex-end; align-items: center; gap: 8px; }
input, textarea, select {
  font: inherit; color: inherit; padding: 8px 10px; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--surface); width: 100%;
}
input[type="checkbox"] { width: auto; }
input:focus, textarea:focus, select:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.error { border: 1px solid var(--danger); color: var(--danger); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 16px; }
.error ul { margin: 6px 0 0; padding-left: 20px; }
.not-implemented { border: 1px dashed var(--border); border-radius: var(--radius); padding: 16px; color: var(--muted); }
.pager { display: flex; align-items: center; gap: 12px; margin-top: 12px; color: var(--muted); }
`;
}
