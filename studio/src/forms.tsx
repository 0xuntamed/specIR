import type { Access } from "../../src/ir/types";
import { renameEndpoint, renameEntity, renameSlot, type EndpointIn, type FieldIn, type RelationIn, type SlotIn, type Spec } from "./edits";
import { Icon } from "./icons";
import { AddButton, Area, Check, Choice, FormHead, ListInput, Text, type Option } from "./ui";

export type Section = "settings" | "entities" | "endpoints" | "pages" | "jobs" | "slots";
export type Selection = { section: Section; index: number };
export type FormProps = { spec: Spec; index: number; set: (update: (spec: Spec) => Spec) => void; select: (selection: Selection) => void };

const FIELD_TYPES = ["string", "text", "int", "bool", "money", "datetime", "date", "uuid", "email", "enum"] as const;
const METHOD_FOR_OP = { list: "GET", get: "GET", create: "POST", update: "PATCH", delete: "DELETE" } as const;

// Clone, mutate, return: the studio's only way of changing the spec.
const mutate = (fn: (draft: Spec) => void) => (spec: Spec) => {
  const draft = structuredClone(spec);
  fn(draft);
  return draft;
};

// Remove one item from a list section and keep the selection in range.
function remover(props: FormProps, section: Exclude<Section, "settings">) {
  return () => {
    props.set(mutate((s) => void (s[section] as unknown[]).splice(props.index, 1)));
    props.select({ section, index: Math.max(0, props.index - 1) });
  };
}

function accessOptions(spec: Spec): Option[] {
  return ["public", "user", ...(spec.auth?.roles ?? []).map((r) => [`role:${r}`, `role: ${r}`] as const)];
}
const accessValue = (a: Access) => (typeof a === "string" ? a : `role:${a.role}`);
const accessFrom = (v: string): Access => (v.startsWith("role:") ? { role: v.slice(5) } : (v as "public" | "user"));

function parseDefault(field: FieldIn, text: string): FieldIn["default"] {
  if (text.trim() === "") return undefined;
  if (field.type === "bool") return text === "true";
  if (field.type === "int" || field.type === "money") return Number.isNaN(Number(text)) ? text : Number(text);
  return text;
}

function FieldRow(props: { field: FieldIn; onChange: (field: FieldIn) => void; onRemove: () => void; param?: boolean }) {
  const { field, onChange } = props;
  // Only enum fields may carry `values`; the schema rejects the key anywhere else.
  const setType = (type: string) => {
    if (type === "enum") return onChange({ ...field, type: "enum", values: field.type === "enum" ? field.values : [] });
    const { values: _values, ...rest } = field as FieldIn & { values?: string[] };
    onChange({ ...rest, type } as FieldIn);
  };
  const label = field.name || "new field";
  return (
    <tr>
      <td>
        <input aria-label="Field name" value={field.name} onChange={(e) => onChange({ ...field, name: e.target.value })} spellCheck={false} placeholder="name" />
      </td>
      <td>
        <Choice aria={`${label} type`} value={field.type} options={FIELD_TYPES} onChange={setType} />
      </td>
      <td>{field.type === "enum" && <ListInput value={field.values} placeholder="A, B, C" onChange={(values) => onChange({ ...field, values })} />}</td>
      <td className="center">
        <input type="checkbox" aria-label={`${label} required`} checked={field.required ?? false} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
      </td>
      {!props.param && (
        <>
          <td className="center">
            <input type="checkbox" aria-label={`${label} unique`} checked={field.unique ?? false} onChange={(e) => onChange({ ...field, unique: e.target.checked })} />
          </td>
          <td className="center">
            <input type="checkbox" aria-label={`${label} read-only`} checked={field.readOnly ?? false} onChange={(e) => onChange({ ...field, readOnly: e.target.checked })} />
          </td>
          <td>
            <input
              key={String(field.default)}
              aria-label={`${label} default`}
              defaultValue={field.default === undefined ? "" : String(field.default)}
              placeholder="none"
              onBlur={(e) => onChange({ ...field, default: parseDefault(field, e.target.value) })}
            />
          </td>
        </>
      )}
      <td>
        <button type="button" className="icon-button remove" title="Remove" aria-label={`Remove ${label}`} onClick={props.onRemove}>
          <Icon name="x" size={15} />
        </button>
      </td>
    </tr>
  );
}

export function FieldTable(props: { fields: FieldIn[]; onChange: (fields: FieldIn[]) => void; param?: boolean }) {
  const { fields, onChange } = props;
  return (
    <>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Enum values</th>
              <th>Req.</th>
              {!props.param && (
                <>
                  <th>Unique</th>
                  <th>Read-only</th>
                  <th>Default</th>
                </>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 && (
              <tr>
                <td className="empty-row" colSpan={props.param ? 5 : 8}>
                  {props.param ? "No inputs. The slot gets only what its caller passes in." : "No fields yet. Add the columns this entity stores."}
                </td>
              </tr>
            )}
            {fields.map((f, i) => (
              <FieldRow
                key={i}
                field={f}
                param={props.param}
                onChange={(next) => onChange(fields.map((old, j) => (j === i ? next : old)))}
                onRemove={() => onChange(fields.filter((_, j) => j !== i))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <AddButton label={props.param ? "Add input" : "Add field"} onClick={() => onChange([...fields, { name: "", type: "string" }])} />
    </>
  );
}

function RelationRow(props: { relation: RelationIn; entities: string[]; onChange: (r: RelationIn) => void; onRemove: () => void }) {
  const { relation: r, onChange } = props;
  const setKind = (kind: string) =>
    onChange(kind === "hasMany" ? { name: r.name, kind: "hasMany", target: r.target } : { name: r.name, kind: "belongsTo", target: r.target, required: true, onDelete: "restrict" });
  return (
    <tr>
      <td>
        <input aria-label="Relation name" value={r.name} onChange={(e) => onChange({ ...r, name: e.target.value })} spellCheck={false} placeholder="name" />
      </td>
      <td>
        <Choice aria={`${r.name || "relation"} kind`} value={r.kind} options={["belongsTo", "hasMany"]} onChange={setKind} />
      </td>
      <td>
        <Choice aria={`${r.name || "relation"} target`} value={r.target} options={props.entities} onChange={(target) => onChange({ ...r, target })} />
      </td>
      <td className="center">
        {r.kind === "belongsTo" && (
          <input type="checkbox" aria-label={`${r.name || "relation"} required`} checked={r.required ?? false} onChange={(e) => onChange({ ...r, required: e.target.checked })} />
        )}
      </td>
      <td>
        {r.kind === "belongsTo" && (
          <Choice aria={`${r.name || "relation"} on delete`} value={r.onDelete ?? "restrict"} options={["restrict", "cascade", "setNull"]} onChange={(v) => onChange({ ...r, onDelete: v as "restrict" })} />
        )}
      </td>
      <td>
        <button type="button" className="icon-button remove" title="Remove" aria-label={`Remove ${r.name || "relation"}`} onClick={props.onRemove}>
          <Icon name="x" size={15} />
        </button>
      </td>
    </tr>
  );
}

export function EntityForm(props: FormProps) {
  const { spec, index, set } = props;
  const entity = spec.entities[index]!;
  const edit = (fn: (e: Spec["entities"][number]) => void) => set(mutate((s) => fn(s.entities[index]!)));
  const names = spec.entities.map((e) => e.name);
  const relations = entity.relations ?? [];
  return (
    <div className="form">
      <FormHead title={entity.name || "Untitled entity"} kind="Entity" icon="entity" onDelete={remover(props, "entities")} />
      <Text label="Name" value={entity.name} hint="PascalCase, e.g. LineItem. References follow renames." onChange={(v) => set((s) => renameEntity(s, entity.name, v))} />
      <div className="row">
        <Check label="Owned by the signed-in user" checked={entity.owned ?? false} onChange={(v) => edit((e) => void (e.owned = v))} />
        <Check label="Timestamps" checked={entity.timestamps ?? true} onChange={(v) => edit((e) => void (e.timestamps = v))} />
        <Check label="Soft delete" checked={entity.softDelete ?? false} onChange={(v) => edit((e) => void (e.softDelete = v))} />
      </div>
      <h3>Fields</h3>
      <FieldTable fields={entity.fields} onChange={(fields) => edit((e) => void (e.fields = fields))} />
      <h3>Relations</h3>
      {relations.length === 0 && <p className="empty-note">No relations. Link this entity to another with belongsTo, and name the way back with hasMany.</p>}
      {relations.length > 0 && (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Target</th>
                <th>Req.</th>
                <th>On delete</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {relations.map((r, i) => (
                <RelationRow
                  key={i}
                  relation={r}
                  entities={names}
                  onChange={(next) => edit((e) => void (e.relations![i] = next))}
                  onRemove={() => edit((e) => void e.relations!.splice(i, 1))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddButton label="Add relation" onClick={() => edit((e) => void (e.relations = [...(e.relations ?? []), { name: "", kind: "belongsTo", target: names[0]!, required: true }]))} />
    </div>
  );
}

function SlotPicker(props: FormProps & { value: string | undefined; suggested: string; onChange: (slot: string | undefined) => void }) {
  const slots = (props.spec.slots ?? []).map((s) => s.id);
  const create = () => {
    const id = slots.includes(props.suggested) ? `${props.suggested}${slots.length + 1}` : props.suggested;
    props.set(mutate((s) => void (s.slots = [...(s.slots ?? []), { id, intent: "" }])));
    props.onChange(id);
  };
  return (
    <div className="row">
      <Choice label="Slot" value={props.value ?? ""} options={[["", "(none)"], ...slots]} onChange={(v) => props.onChange(v || undefined)} />
      {!props.value && (
        <span className="row-action">
          <AddButton label="New slot" onClick={create} />
        </span>
      )}
    </div>
  );
}

export function EndpointForm(props: FormProps) {
  const { spec, index, set } = props;
  const ep = spec.endpoints![index]!;
  const edit = (fn: (e: EndpointIn) => void) => set(mutate((s) => fn(s.endpoints![index]!)));
  const replace = (next: EndpointIn) => set(mutate((s) => void (s.endpoints![index] = next)));
  const entities = spec.entities.map((e) => e.name);
  const base = { id: ep.id, method: ep.method, path: ep.path, auth: ep.auth };
  const setKind = (kind: string) =>
    replace(kind === "custom" ? { ...base, kind: "custom" } : { ...base, kind: "crud", entity: entities[0]!, op: "list", method: "GET", scope: "all" });
  return (
    <div className="form">
      <FormHead title={ep.id || "Untitled endpoint"} kind="Endpoint" icon="endpoint" onDelete={remover(props, "endpoints")} />
      <div className="row">
        <Text label="Id" value={ep.id} hint="dotted, e.g. invoices.send" onChange={(v) => set((s) => renameEndpoint(s, ep.id, v))} />
        <Choice label="Kind" value={ep.kind} options={[["crud", "crud (generated)"], ["custom", "custom (slot)"]]} onChange={setKind} />
      </div>
      <div className="row">
        <Choice label="Method" value={ep.method} options={["GET", "POST", "PUT", "PATCH", "DELETE"]} onChange={(v) => edit((e) => void (e.method = v as "GET"))} />
        <Text label="Path" value={ep.path} placeholder="/invoices/:id" onChange={(v) => edit((e) => void (e.path = v))} />
        <Choice label="Access" value={accessValue(ep.auth)} options={accessOptions(spec)} onChange={(v) => edit((e) => void (e.auth = accessFrom(v)))} />
      </div>
      {ep.kind === "crud" ? (
        <>
          <div className="row">
            <Choice label="Entity" value={ep.entity} options={entities} onChange={(v) => edit((e) => void (e.entity = v))} />
            <Choice
              label="Operation"
              value={ep.op}
              options={["list", "get", "create", "update", "delete"]}
              onChange={(v) =>
                edit((e) => {
                  if (e.kind !== "crud") return;
                  e.op = v as "list";
                  e.method = METHOD_FOR_OP[e.op];
                  if (e.op !== "list") delete e.pagination;
                })
              }
            />
            <Choice label="Rows" value={ep.scope} options={[["owner", "only the user's own"], ["all", "all rows"]]} onChange={(v) => edit((e) => void (e.kind === "crud" && (e.scope = v as "all")))} />
          </div>
          {ep.op === "list" && (
            <Check
              label="Paginate (20 per page, up to 100)"
              checked={ep.pagination !== undefined}
              onChange={(on) => edit((e) => void (e.kind === "crud" && (on ? (e.pagination = { defaultLimit: 20, maxLimit: 100 }) : delete e.pagination)))}
            />
          )}
        </>
      ) : (
        <>
          <Choice
            label="Loads (and owner-checks) a row of"
            value={ep.entity ?? ""}
            options={[["", "(nothing)"], ...entities]}
            onChange={(v) => edit((e) => void (e.kind === "custom" && (v ? (e.entity = v) : delete e.entity)))}
          />
          <SlotPicker {...props} value={ep.slot} suggested={ep.id.split(".").reverse().join("_").replace(/_(.)/g, (_, c: string) => c.toUpperCase())} onChange={(slot) => edit((e) => void (e.kind === "custom" && (e.slot = slot)))} />
        </>
      )}
    </div>
  );
}

export function PageForm(props: FormProps) {
  const { spec, index, set } = props;
  const page = spec.pages![index]!;
  const edit = (fn: (p: NonNullable<Spec["pages"]>[number]) => void) => set(mutate((s) => fn(s.pages![index]!)));
  const endpointIds = [...(spec.auth ? ["auth.register", "auth.login", "auth.me"] : []), ...(spec.endpoints ?? []).map((e) => e.id)];
  const uses = page.uses ?? [];
  return (
    <div className="form">
      <FormHead title={page.route || page.id || "Untitled page"} kind="Page" icon="page" onDelete={remover(props, "pages")} />
      <div className="row">
        <Text label="Id" value={page.id} onChange={(v) => edit((p) => void (p.id = v))} />
        <Text label="Route" value={page.route} placeholder="/invoices/:id" onChange={(v) => edit((p) => void (p.route = v))} />
      </div>
      <div className="row">
        <Choice label="Access" value={accessValue(page.auth)} options={accessOptions(spec)} onChange={(v) => edit((p) => void (p.auth = accessFrom(v)))} />
        <Choice label="Layout" value={page.layout} options={["list", "detail", "form", "custom"]} onChange={(v) => edit((p) => void (p.layout = v as "list"))} />
      </div>
      {page.layout === "custom" && <SlotPicker {...props} value={page.slot} suggested={page.id} onChange={(slot) => edit((p) => void (p.slot = slot))} />}
      <h3>Endpoints it uses</h3>
      <div className="checks">
        {endpointIds.map((id) => (
          <Check key={id} label={id} checked={uses.includes(id)} onChange={(on) => edit((p) => void (p.uses = on ? [...uses, id] : uses.filter((u) => u !== id)))} />
        ))}
      </div>
    </div>
  );
}

export function JobForm(props: FormProps) {
  const { spec, index, set } = props;
  const job = spec.jobs![index]!;
  const edit = (fn: (j: NonNullable<Spec["jobs"]>[number]) => void) => set(mutate((s) => fn(s.jobs![index]!)));
  return (
    <div className="form">
      <FormHead title={job.id || "Untitled job"} kind="Job" icon="job" onDelete={remover(props, "jobs")} />
      <div className="row">
        <Text label="Id" value={job.id} onChange={(v) => edit((j) => void (j.id = v))} />
        <Text label="Cron schedule" value={job.trigger.schedule} hint="5 fields, e.g. */5 * * * *" onChange={(v) => edit((j) => void (j.trigger.schedule = v))} />
      </div>
      <div className="row">
        <Text label="Retries" value={String(job.retries ?? 0)} onChange={(v) => edit((j) => void (j.retries = Math.max(0, Number.parseInt(v, 10) || 0)))} />
        <Text label="Idempotency key" value={job.idempotencyKey ?? ""} placeholder="Entity.field" onChange={(v) => edit((j) => void (v ? (j.idempotencyKey = v) : delete j.idempotencyKey))} />
      </div>
      <SlotPicker {...props} value={job.slot} suggested={job.id} onChange={(slot) => edit((j) => void (j.slot = slot))} />
    </div>
  );
}

export function SlotForm(props: FormProps) {
  const { spec, index, set } = props;
  const slot = spec.slots![index]!;
  const edit = (fn: (s: SlotIn) => void) => set(mutate((s) => fn(s.slots![index]!)));
  const output = slot.output ?? { kind: "void" as const };
  const callers = [
    ...(spec.endpoints ?? []).filter((e) => e.kind === "custom" && e.slot === slot.id).map((e) => `endpoint ${e.id}`),
    ...(spec.jobs ?? []).filter((j) => j.slot === slot.id).map((j) => `job ${j.id}`),
    ...(spec.pages ?? []).filter((p) => p.slot === slot.id).map((p) => `page ${p.id}`),
  ];
  return (
    <div className="form">
      <FormHead title={slot.id || "Untitled slot"} kind="Slot" icon="slot" onDelete={remover(props, "slots")} />
      <p className="lede">Custom logic the compiler can't generate. Used by {callers.length > 0 ? callers.join(", ") : "nothing yet"}.</p>
      <Text label="Id" value={slot.id} onChange={(v) => set((s) => renameSlot(s, slot.id, v))} />
      <Area label="Intent" rows={5} value={slot.intent} hint="What the code must do, in plain English. This is the brief an agent implements." onChange={(v) => edit((s) => void (s.intent = v))} />
      <h3>Inputs</h3>
      <FieldTable param fields={(slot.inputs ?? []) as FieldIn[]} onChange={(inputs) => edit((s) => void (s.inputs = inputs))} />
      <h3>Output</h3>
      <div className="row">
        <Choice
          label="Returns"
          value={output.kind}
          options={[["void", "nothing"], ["entity", "a row"], ["binary", "a file"]]}
          onChange={(kind) =>
            edit((s) => {
              s.output = kind === "entity" ? { kind: "entity", entity: spec.entities[0]!.name } : kind === "binary" ? { kind: "binary", contentType: "application/pdf" } : { kind: "void" };
            })
          }
        />
        {output.kind === "entity" && (
          <Choice label="Entity" value={output.entity} options={spec.entities.map((e) => e.name)} onChange={(v) => edit((s) => void (s.output = { kind: "entity", entity: v }))} />
        )}
        {output.kind === "binary" && <Text label="Content type" value={output.contentType} onChange={(v) => edit((s) => void (s.output = { kind: "binary", contentType: v }))} />}
      </div>
    </div>
  );
}

export function SettingsForm(props: FormProps) {
  const { spec, set } = props;
  const edit = (fn: (s: Spec) => void) => set(mutate(fn));
  const email = (spec.integrations ?? []).some((i) => i.kind === "email");
  return (
    <div className="form">
      <FormHead title="App settings" icon="settings" />
      <Text label="App name" value={spec.app.name} hint="kebab-case; names the database and containers" onChange={(v) => edit((s) => void (s.app.name = v))} />
      <h3>Sign-in</h3>
      <Check
        label="Users sign in with email and password"
        checked={spec.auth !== undefined}
        onChange={(on) => edit((s) => void (on ? (s.auth = { strategy: "email_password_jwt", userEntity: s.entities[0]?.name ?? "User" }) : delete s.auth))}
      />
      {spec.auth && (
        <div className="row">
          <Choice label="User entity" value={spec.auth.userEntity} options={spec.entities.map((e) => e.name)} onChange={(v) => edit((s) => void (s.auth!.userEntity = v))} />
          <label className="field">
            <span>Roles</span>
            <ListInput value={spec.auth.roles ?? []} placeholder="member, admin" onChange={(roles) => edit((s) => void (s.auth!.roles = roles))} />
          </label>
        </div>
      )}
      <h3>Integrations</h3>
      <Check label="Email via Resend" checked={email} onChange={(on) => edit((s) => void (s.integrations = on ? [{ kind: "email", provider: "resend" }] : []))} />
    </div>
  );
}
