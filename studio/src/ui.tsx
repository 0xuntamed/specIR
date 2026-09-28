import type { ReactNode } from "react";

// Small labelled inputs. Values are plain strings/booleans; forms convert.

export function Text(props: { label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} spellCheck={false} />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

export function Area(props: { label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <textarea rows={props.rows ?? 4} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

export type Option = string | readonly [value: string, label: string];

// `label` renders a visible label; `aria` names an unlabelled select (e.g. in a table).
export function Choice(props: { value: string; options: readonly Option[]; onChange: (value: string) => void; label?: string; aria?: string }) {
  const select = (
    <select value={props.value} aria-label={props.label ? undefined : props.aria} onChange={(e) => props.onChange(e.target.value)}>
      {props.options.map((o) => {
        const [value, label] = typeof o === "string" ? [o, o] : o;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
  if (!props.label) return select;
  return (
    <label className="field">
      <span>{props.label}</span>
      {select}
    </label>
  );
}

export function Check(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

// Comma-separated list, committed on blur so typing ", " isn't reformatted mid-word.
export function ListInput(props: { value: string[]; onChange: (value: string[]) => void; placeholder?: string }) {
  return (
    <input
      key={props.value.join(",")}
      defaultValue={props.value.join(", ")}
      placeholder={props.placeholder}
      spellCheck={false}
      onBlur={(e) => props.onChange(e.target.value.split(",").map((v) => v.trim()).filter(Boolean))}
    />
  );
}

export function FormHead(props: { title: string; onDelete?: () => void; children?: ReactNode }) {
  return (
    <header className="form-head">
      <h2>{props.title}</h2>
      {props.children}
      {props.onDelete && (
        <button className="danger" onClick={props.onDelete}>
          Delete
        </button>
      )}
    </header>
  );
}
