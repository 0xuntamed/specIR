import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { generate } from "../../src/generate/index";
import { validate } from "../../src/validate/index";
import { AddResource } from "./AddResource";
import { newSpec, type Spec } from "./edits";
import { EndpointForm, EntityForm, JobForm, PageForm, SettingsForm, SlotForm, type FormProps, type Section, type Selection } from "./forms";
import { Diagram, Files, Problems, selectionFor } from "./panels";

type SpecFile = { name: string; format: "json" | "ts" };
type Open = SpecFile & { saved: string }; // saved = JSON as last loaded/saved, for the unsaved marker

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/__studio/${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

const SECTIONS: { section: Exclude<Section, "settings">; title: string; label: (spec: Spec, i: number) => string }[] = [
  { section: "entities", title: "Entities", label: (s, i) => s.entities[i]!.name || "(unnamed)" },
  { section: "endpoints", title: "Endpoints", label: (s, i) => s.endpoints![i]!.id || "(unnamed)" },
  { section: "pages", title: "Pages", label: (s, i) => s.pages![i]!.route || "(no route)" },
  { section: "jobs", title: "Jobs", label: (s, i) => s.jobs![i]!.id || "(unnamed)" },
  { section: "slots", title: "Slots", label: (s, i) => s.slots![i]!.id || "(unnamed)" },
];

// What "+" adds in each section: valid-ish defaults the validator then guides.
function blank(spec: Spec, section: Exclude<Section, "settings">): Spec {
  const next = structuredClone(spec);
  const n = (next[section] ?? []).length + 1;
  const entity = spec.entities[0]?.name ?? "Thing";
  if (section === "entities") next.entities.push({ name: `Entity${n}`, fields: [] });
  if (section === "endpoints") next.endpoints = [...(next.endpoints ?? []), { id: `endpoint${n}.list`, kind: "crud", entity, op: "list", method: "GET", path: `/endpoint-${n}`, auth: "user", scope: "all" }];
  if (section === "pages") next.pages = [...(next.pages ?? []), { id: `page${n}`, route: `/page-${n}`, auth: "user", layout: "list", uses: [] }];
  if (section === "jobs") next.jobs = [...(next.jobs ?? []), { id: `job${n}`, trigger: { kind: "cron", schedule: "0 * * * *" } }];
  if (section === "slots") next.slots = [...(next.slots ?? []), { id: `slot${n}`, intent: "" }];
  return next;
}

const FORMS: Record<Section, (props: FormProps) => ReactNode> = {
  settings: SettingsForm,
  entities: EntityForm,
  endpoints: EndpointForm,
  pages: PageForm,
  jobs: JobForm,
  slots: SlotForm,
};

export function App() {
  const [specs, setSpecs] = useState<SpecFile[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [selection, select] = useState<Selection>({ section: "settings", index: 0 });
  const [tab, setTab] = useState<"problems" | "files" | "diagram">("problems");
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<SpecFile[]>("GET", "specs").then(setSpecs, (e: Error) => setStatus({ kind: "error", text: e.message }));
  }, []);

  // Validate and generate on every edit; deferred so typing stays responsive.
  const deferred = useDeferredValue(spec);
  const result = useMemo(() => (deferred ? validate(deferred) : null), [deferred]);
  const errors = result?.diagnostics.filter((d) => d.level === "error") ?? [];
  const lastGood = useRef<Map<string, string> | null>(null);
  const files = useMemo(() => {
    if (!result?.spec || result.diagnostics.some((d) => d.level === "error")) return null;
    try {
      return generate(result.spec);
    } catch {
      return null;
    }
  }, [result]);
  if (files) lastGood.current = files;

  const load = async (name: string) => {
    const file = await api<SpecFile & { spec: Spec }>("GET", `specs/${name}`);
    setOpen({ name: file.name, format: file.format, saved: JSON.stringify(file.spec) });
    setSpec(file.spec);
    select({ section: "settings", index: 0 });
    lastGood.current = null;
    setStatus(null);
  };

  const create = () => {
    const name = prompt("Name for the new app (kebab-case, e.g. task-tracker)")?.trim();
    if (!name) return;
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return setStatus({ kind: "error", text: "Use kebab-case, e.g. task-tracker" });
    setOpen({ name, format: "json", saved: "" });
    setSpec(newSpec(name));
    select({ section: "settings", index: 0 });
    lastGood.current = null;
  };

  const save = async () => {
    if (!open || !spec) return;
    let name = open.name;
    if (open.format === "ts") {
      name = prompt(`${open.name}.ts is hand-written. Save a JSON copy as:`, `${open.name}-copy`)?.trim() ?? "";
      if (!name) return;
    }
    try {
      await api("PUT", `specs/${name}`, spec);
      setOpen({ name, format: "json", saved: JSON.stringify(spec) });
      setSpecs(await api<SpecFile[]>("GET", "specs"));
      setStatus({ kind: "ok", text: `Saved specs/${name}.json` });
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  };

  const generateApp = async () => {
    if (!open || !spec) return;
    try {
      const r = await api<{ outDir: string; written: string[]; unchanged: string[]; deleted: string[] }>("POST", `generate/${open.name}`, spec);
      setStatus({ kind: "ok", text: `Generated ${r.outDir}: ${r.written.length} written, ${r.unchanged.length} unchanged. Run it: cd ${r.outDir}, copy .env.example to .env, docker compose up --build` });
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  };

  const problemCount = (section: Section, index: number) =>
    errors.filter((d) => {
      const s = selectionFor(d.path);
      return s.section === section && (section === "settings" || s.index === index);
    }).length;

  const dirty = open !== null && spec !== null && JSON.stringify(spec) !== open.saved;
  const Form = FORMS[selection.section];
  const list = selection.section === "settings" ? null : (spec?.[selection.section] ?? []);
  const selectionValid = selection.section === "settings" || (list !== null && selection.index < list.length);

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">AppSpec Studio</strong>
        <select value={open?.name ?? ""} onChange={(e) => e.target.value && void load(e.target.value)} aria-label="Open spec">
          <option value="">Open a spec…</option>
          {specs.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}.{s.format}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={create}>
          New app
        </button>
        {open && (
          <>
            <span className="muted">
              {open.name}.{open.format}
              {dirty ? " · unsaved" : ""}
            </span>
            <span className="spacer" />
            <button className="secondary" onClick={() => void save()} disabled={!dirty && open.format === "json"}>
              {open.format === "ts" ? "Save as JSON…" : "Save"}
            </button>
            <button onClick={() => void generateApp()} disabled={errors.length > 0} title={errors.length > 0 ? "Fix the problems first" : "Write the app to out/"}>
              Generate app
            </button>
          </>
        )}
      </header>
      {status && <div className={`status ${status.kind}`}>{status.text}</div>}

      {!spec ? (
        <main className="empty-state">
          <h1>Describe an app, get the code.</h1>
          <p>Open a spec, or start a new app. Everything you change is checked as you type, and you can preview every file the compiler will write.</p>
          <button onClick={create}>New app</button>
        </main>
      ) : (
        <div className="workspace">
          <nav className="sidebar">
            <button className="primary-action" onClick={() => setAdding(true)}>
              + Add resource
            </button>
            <NavItem label="App settings" active={selection.section === "settings"} problems={problemCount("settings", 0)} onClick={() => select({ section: "settings", index: 0 })} />
            {SECTIONS.map(({ section, title, label }) => (
              <div key={section} className="nav-section">
                <div className="nav-title">
                  {title}
                  <button className="icon" title={`Add to ${title}`} onClick={() => {
                    setSpec(blank(spec, section));
                    select({ section, index: (spec[section] ?? []).length });
                  }}>
                    +
                  </button>
                </div>
                {(spec[section] ?? []).map((_, i) => (
                  <NavItem
                    key={i}
                    label={label(spec, i)}
                    active={selection.section === section && selection.index === i}
                    problems={problemCount(section, i)}
                    onClick={() => select({ section, index: i })}
                  />
                ))}
              </div>
            ))}
          </nav>

          <main className="editor">{selectionValid && <Form spec={spec} index={selection.index} set={(update) => setSpec((s) => (s ? update(s) : s))} select={select} />}</main>

          <aside className="inspector">
            <div className="tabs" role="tablist">
              {(["problems", "files", "diagram"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
                  {t === "problems" ? `Problems${result && result.diagnostics.length > 0 ? ` (${result.diagnostics.length})` : ""}` : t === "files" ? "Files" : "Diagram"}
                </button>
              ))}
            </div>
            {tab === "problems" && result && (
              <Problems
                diagnostics={result.diagnostics}
                select={(s) => {
                  select(s);
                }}
              />
            )}
            {tab === "files" && <Files files={files ?? lastGood.current} stale={!files && lastGood.current !== null} />}
            {tab === "diagram" && <Diagram spec={spec} select={select} />}
          </aside>
        </div>
      )}

      {adding && spec && (
        <AddResource
          spec={spec}
          onCancel={() => setAdding(false)}
          onAdd={(next, index) => {
            setSpec(next);
            select({ section: "entities", index });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function NavItem(props: { label: string; active: boolean; problems: number; onClick: () => void }) {
  return (
    <button className={props.active ? "nav-item active" : "nav-item"} onClick={props.onClick}>
      <span>{props.label}</span>
      {props.problems > 0 && <span className="badge">{props.problems}</span>}
    </button>
  );
}
