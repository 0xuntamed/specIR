import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { generate } from "../../src/generate/index";
import { validate } from "../../src/validate/index";
import { AddResource } from "./AddResource";
import { Dialog, NameDialog } from "./dialogs";
import { newSpec, type Spec } from "./edits";
import { EndpointForm, EntityForm, JobForm, PageForm, SettingsForm, SlotForm, type FormProps, type Section, type Selection } from "./forms";
import { Icon, Logo, type IconName } from "./icons";
import { Diagram, Files, Problems, selectionFor } from "./panels";

type SpecFile = { name: string; format: "json" | "ts" };
type Open = SpecFile & { saved: string }; // saved = JSON as last loaded/saved, for the unsaved marker
type Status = { kind: "ok" | "error"; text: string; command?: string; transient?: boolean };
type Tab = "problems" | "files" | "diagram";

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

type ListSection = Exclude<Section, "settings">;

const SECTIONS: { section: ListSection; title: string; singular: string; label: (spec: Spec, i: number) => string }[] = [
  { section: "entities", title: "Entities", singular: "entity", label: (s, i) => s.entities[i]!.name || "Untitled entity" },
  { section: "endpoints", title: "Endpoints", singular: "endpoint", label: (s, i) => s.endpoints![i]!.id || "Untitled endpoint" },
  { section: "pages", title: "Pages", singular: "page", label: (s, i) => s.pages![i]!.route || "No route" },
  { section: "jobs", title: "Jobs", singular: "job", label: (s, i) => s.jobs![i]!.id || "Untitled job" },
  { section: "slots", title: "Slots", singular: "slot", label: (s, i) => s.slots![i]!.id || "Untitled slot" },
];

// What "+" adds in each section: valid-ish defaults the validator then guides.
function blank(spec: Spec, section: ListSection): Spec {
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

const TABS: { tab: Tab; label: string }[] = [
  { tab: "problems", label: "Problems" },
  { tab: "files", label: "Files" },
  { tab: "diagram", label: "Diagram" },
];

export function App() {
  const [specs, setSpecs] = useState<SpecFile[] | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [selection, select] = useState<Selection>({ section: "settings", index: 0 });
  const [tab, setTab] = useState<Tab>("problems");
  const [dialog, setDialog] = useState<null | "add" | "new" | "saveAs">(null);
  const [discard, setDiscard] = useState<null | { then: () => void }>(null);
  const [busy, setBusy] = useState<null | "save" | "generate">(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<ListSection>>(new Set());

  useEffect(() => {
    api<SpecFile[]>("GET", "specs").then(setSpecs, (e: Error) => {
      setSpecs([]);
      setStatus({ kind: "error", text: `Couldn't list specs: ${e.message}` });
    });
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

  const dirty = open !== null && spec !== null && JSON.stringify(spec) !== open.saved;

  // Unsaved work is never dropped silently: switching specs asks, closing the tab warns.
  const guard = (then: () => void) => (dirty ? setDiscard({ then }) : then());
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!status?.transient) return;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  const load = async (name: string) => {
    try {
      const file = await api<SpecFile & { spec: Spec }>("GET", `specs/${name}`);
      setOpen({ name: file.name, format: file.format, saved: JSON.stringify(file.spec) });
      setSpec(file.spec);
      select({ section: "settings", index: 0 });
      lastGood.current = null;
      setStatus(null);
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't open ${name}: ${(e as Error).message}` });
    }
  };

  const create = (name: string) => {
    setDialog(null);
    setOpen({ name, format: "json", saved: "" });
    setSpec(newSpec(name));
    select({ section: "settings", index: 0 });
    lastGood.current = null;
    setStatus(null);
  };

  const saveAs = async (name: string) => {
    if (!spec) return;
    setDialog(null);
    setBusy("save");
    try {
      await api("PUT", `specs/${name}`, spec);
      setOpen({ name, format: "json", saved: JSON.stringify(spec) });
      setSpecs(await api<SpecFile[]>("GET", "specs"));
      setStatus({ kind: "ok", text: `Saved specs/${name}.json`, transient: true });
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't save: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  // Hand-written .ts specs are read-only: saving makes a JSON copy under a new name.
  const save = () => {
    if (!open || busy) return;
    if (open.format === "ts") setDialog("saveAs");
    else if (dirty) void saveAs(open.name);
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const generateApp = async () => {
    if (!open || !spec) return;
    setBusy("generate");
    try {
      const r = await api<{ outDir: string; written: string[]; unchanged: string[]; deleted: string[] }>("POST", `generate/${open.name}`, spec);
      const deleted = r.deleted.length > 0 ? `, ${r.deleted.length} deleted` : "";
      setStatus({
        kind: "ok",
        text: `Generated ${r.outDir} (${r.written.length} written, ${r.unchanged.length} unchanged${deleted}). To run it, copy .env.example to .env there, set JWT_SECRET, then run`,
        command: "docker compose up --build",
      });
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't generate: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const choose = (s: Selection) => {
    select(s);
    setNavOpen(false);
  };

  const problemCount = (section: Section, index?: number) =>
    errors.filter((d) => {
      const s = selectionFor(d.path);
      return s.section === section && (index === undefined || section === "settings" || s.index === index);
    }).length;

  const toggle = (section: ListSection) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(section)) next.add(section);
      return next;
    });

  const Form = FORMS[selection.section];
  const list = selection.section === "settings" ? null : (spec?.[selection.section] ?? []);
  const selectionValid = selection.section === "settings" || (list !== null && selection.index < list.length);
  const warnings = (result?.diagnostics.length ?? 0) - errors.length;
  const names = (specs ?? []).map((s) => s.name);

  return (
    <div className="app">
      <header className="topbar">
        {spec && (
          <button type="button" className="icon-button menu-toggle" aria-label="Spec contents" aria-expanded={navOpen} aria-controls="spec-nav" onClick={() => setNavOpen((v) => !v)}>
            <Icon name="menu" size={18} />
          </button>
        )}
        <div className="brand">
          <Logo />
          <span className="brand-name">AppSpec Studio</span>
        </div>
        <span className="topbar-divider" />
        <select className="spec-picker" value={open?.name ?? ""} onChange={(e) => e.target.value && guard(() => void load(e.target.value))} aria-label="Open spec">
          {!open && <option value="">Open a spec…</option>}
          {open && !names.includes(open.name) && <option value={open.name}>{open.name} (new)</option>}
          {(specs ?? []).map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}.{s.format}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost" aria-label="New app" onClick={() => guard(() => setDialog("new"))}>
          <Icon name="plus" size={15} />
          <span className="collapse-label">New app</span>
        </button>
        {open && (
          <span className={dirty ? "file-state dirty" : "file-state"} aria-live="polite">
            {dirty ? "Unsaved changes" : open.format === "ts" ? "Read-only TypeScript spec" : "Saved"}
          </span>
        )}
        <span className="spacer" />
        {open && (
          <div className="topbar-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={save}
              disabled={busy !== null || (!dirty && open.format === "json")}
              title={open.format === "ts" ? "Save a JSON copy" : "Save (Ctrl+S)"}
            >
              <Icon name="save" size={15} />
              {busy === "save" ? "Saving…" : open.format === "ts" ? "Save as JSON…" : "Save"}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void generateApp()}
              disabled={busy !== null || errors.length > 0}
              title={errors.length > 0 ? `Fix ${errors.length} problem${errors.length === 1 ? "" : "s"} first` : "Write the app to out/"}
            >
              <Icon name="bolt" size={15} />
              {busy === "generate" ? "Generating…" : "Generate app"}
            </button>
          </div>
        )}
      </header>

      {status && (
        <div className={`banner ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          <Icon name={status.kind === "ok" ? "checkCircle" : "errorCircle"} size={16} className="banner-icon" />
          <p>
            {status.text}
            {status.command && (
              <>
                {" "}
                <code>{status.command}</code>
              </>
            )}
          </p>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setStatus(null)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {!spec ? (
        <main className="welcome">
          <div className="welcome-inner">
            <Logo size={40} />
            <h1>Describe an app, get the code.</h1>
            <p className="welcome-lede">
              A spec lists your data, endpoints, pages and jobs. The Studio checks it as you type and previews every file the compiler will write: a Fastify API, a
              React frontend and a docker-compose setup.
            </p>
            <button type="button" className="btn primary large" onClick={() => setDialog("new")}>
              <Icon name="plus" size={16} />
              New app
            </button>
            <h2 className="welcome-list-title">Open a spec</h2>
            {specs === null ? (
              <p className="welcome-note">Loading specs…</p>
            ) : specs.length === 0 ? (
              <p className="welcome-note">No specs in specs/ yet. Start a new app and save it to create one.</p>
            ) : (
              <ul className="spec-list">
                {specs.map((s) => (
                  <li key={s.name}>
                    <button type="button" onClick={() => void load(s.name)}>
                      <Icon name="file" size={16} className="spec-list-icon" />
                      <span className="spec-list-name">{s.name}</span>
                      <span className="spec-list-format">{s.format === "ts" ? "TypeScript, read-only" : "JSON"}</span>
                      <Icon name="chevronRight" size={16} className="spec-list-go" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      ) : (
        <div className="workspace">
          <nav id="spec-nav" className={navOpen ? "sidebar open" : "sidebar"} aria-label="Spec contents">
            <div className="sidebar-top">
              <button type="button" className="btn secondary block" onClick={() => setDialog("add")}>
                <Icon name="plus" size={15} />
                Add resource
              </button>
            </div>
            <div className="sidebar-scroll">
              <NavItem icon="settings" label="App settings" active={selection.section === "settings"} problems={problemCount("settings")} onClick={() => choose({ section: "settings", index: 0 })} />
              {SECTIONS.map(({ section, title, singular, label }) => {
                const items = spec[section] ?? [];
                const isCollapsed = collapsed.has(section);
                const hidden = isCollapsed ? problemCount(section) : 0;
                return (
                  <section key={section} className="nav-section">
                    <div className="nav-title">
                      <button type="button" className="nav-toggle" aria-expanded={!isCollapsed} onClick={() => toggle(section)}>
                        <Icon name="chevronDown" size={14} className={isCollapsed ? "chevron collapsed" : "chevron"} />
                        <span>{title}</span>
                        <span className="nav-count">{items.length}</span>
                        {hidden > 0 && <span className="badge">{hidden}</span>}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Add ${singular}`}
                        title={`Add ${singular}`}
                        onClick={() => {
                          setSpec(blank(spec, section));
                          setCollapsed((prev) => new Set([...prev].filter((s) => s !== section)));
                          choose({ section, index: items.length });
                        }}
                      >
                        <Icon name="plus" size={15} />
                      </button>
                    </div>
                    {!isCollapsed &&
                      items.map((_, i) => (
                        <NavItem
                          key={i}
                          label={label(spec, i)}
                          method={section === "endpoints" ? spec.endpoints![i]!.method : undefined}
                          active={selection.section === section && selection.index === i}
                          problems={problemCount(section, i)}
                          onClick={() => choose({ section, index: i })}
                        />
                      ))}
                  </section>
                );
              })}
            </div>
          </nav>
          {navOpen && <button type="button" className="scrim" aria-label="Close spec contents" onClick={() => setNavOpen(false)} />}

          <main className="editor">{selectionValid && <Form spec={spec} index={selection.index} set={(update) => setSpec((s) => (s ? update(s) : s))} select={choose} />}</main>

          <aside className="inspector" aria-label="Inspector">
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.tab}
                  type="button"
                  role="tab"
                  id={`tab-${t.tab}`}
                  aria-selected={tab === t.tab}
                  aria-controls="inspector-panel"
                  className="tab"
                  onClick={() => setTab(t.tab)}
                >
                  {t.label}
                  {t.tab === "problems" && result && result.diagnostics.length > 0 && (
                    <span className={errors.length > 0 ? "tab-count error" : "tab-count warning"} aria-label={`${errors.length} errors, ${warnings} warnings`}>
                      {result.diagnostics.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="panel" id="inspector-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === "problems" && result && <Problems diagnostics={result.diagnostics} select={choose} />}
              {tab === "files" && <Files files={files ?? lastGood.current} stale={!files && lastGood.current !== null} />}
              {tab === "diagram" && <Diagram spec={spec} select={choose} />}
            </div>
          </aside>
        </div>
      )}

      {dialog === "add" && spec && (
        <AddResource
          spec={spec}
          onCancel={() => setDialog(null)}
          onAdd={(next, index) => {
            setSpec(next);
            choose({ section: "entities", index });
            setDialog(null);
          }}
        />
      )}
      {dialog === "new" && (
        <NameDialog
          title="New app"
          description="Starts with sign-in and a User entity. Add resources from there."
          confirm="Create app"
          taken={names}
          onConfirm={create}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "saveAs" && open && (
        <NameDialog
          title="Save as JSON"
          description={`${open.name}.ts is hand-written, so the Studio saves a JSON copy you can keep editing.`}
          initial={`${open.name}-copy`}
          confirm="Save copy"
          taken={names}
          onConfirm={(name) => void saveAs(name)}
          onCancel={() => setDialog(null)}
        />
      )}
      {discard && open && (
        <Dialog
          title="Discard unsaved changes?"
          description={`Your changes to ${open.name} haven't been saved.`}
          onClose={() => setDiscard(null)}
          onSubmit={() => {
            setDiscard(null);
            discard.then();
          }}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setDiscard(null)}>
                Keep editing
              </button>
              <button type="submit" className="btn danger-solid">
                Discard changes
              </button>
            </>
          }
        >
          {null}
        </Dialog>
      )}
    </div>
  );
}

const METHOD_TONE: Record<string, string> = { GET: "get", POST: "post", PUT: "patch", PATCH: "patch", DELETE: "delete" };

function NavItem(props: { label: string; icon?: IconName; method?: string; active: boolean; problems: number; onClick: () => void }) {
  return (
    <button type="button" className={props.active ? "nav-item active" : "nav-item"} aria-current={props.active ? "true" : undefined} onClick={props.onClick}>
      {props.icon && <Icon name={props.icon} size={15} className="nav-icon" />}
      {props.method && <span className={`method ${METHOD_TONE[props.method] ?? ""}`}>{props.method === "DELETE" ? "DEL" : props.method}</span>}
      <span className="nav-label">{props.label}</span>
      {props.problems > 0 && (
        <span className="badge" aria-label={`${props.problems} problem${props.problems === 1 ? "" : "s"}`}>
          {props.problems}
        </span>
      )}
    </button>
  );
}
