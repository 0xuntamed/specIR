import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "./icons";

// A native modal <dialog>: focus trap, Escape and the top layer come from the browser.
export function Dialog(props: { title: string; description?: ReactNode; onClose: () => void; onSubmit: () => void; footer: ReactNode; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    // showModal focuses the first button (Close); start on the first field, else the safe action.
    dialog.querySelector<HTMLElement>(".dialog-body :is(input, select, textarea), .dialog-actions button")?.focus();
    return () => dialog.close();
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit();
  };
  return (
    <dialog
      ref={ref}
      className={props.wide ? "dialog wide" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(e) => e.target === ref.current && props.onClose()}
    >
      <form onSubmit={submit}>
        <header className="dialog-head">
          <div>
            <h2 id={titleId}>{props.title}</h2>
            {props.description && <p>{props.description}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={props.onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className="dialog-body">{props.children}</div>
        <footer className="dialog-actions">{props.footer}</footer>
      </form>
    </dialog>
  );
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// Asks for a spec name (it becomes specs/<name>.json and out/<name>).
export function NameDialog(props: { title: string; description: ReactNode; initial?: string; confirm: string; taken: string[]; onConfirm: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(props.initial ?? "");
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const trimmed = name.trim();
  const error = !KEBAB.test(trimmed)
    ? "Use lowercase words joined by hyphens, like task-tracker."
    : props.taken.includes(trimmed)
      ? `A spec named ${trimmed} already exists.`
      : null;
  const shown = touched && trimmed !== "" ? error : null;
  return (
    <Dialog
      title={props.title}
      description={props.description}
      onClose={props.onCancel}
      onSubmit={() => (error ? setTouched(true) : props.onConfirm(trimmed))}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={trimmed === ""}>
            {props.confirm}
          </button>
        </>
      }
    >
      <label className="field" htmlFor={inputId}>
        <span>Name</span>
        <input
          id={inputId}
          value={name}
          placeholder="task-tracker"
          spellCheck={false}
          aria-invalid={shown ? true : undefined}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {shown ? <small className="field-error">{shown}</small> : <small>Saved as specs/{trimmed || "name"}.json</small>}
      </label>
    </Dialog>
  );
}
