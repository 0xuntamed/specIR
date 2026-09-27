import type { PagePlan } from "../../ir/pages";
import type { Endpoint, Entity, Spec } from "../../ir/types";
import { pathParams } from "../../validate/context";
import { Imports } from "../imports";
import { columnsOf, entityNamed, loginField } from "../model";
import { HEADER, MARKER, pascal, wrap } from "../names";
import { pageStub, regionBegin, regionEnd } from "../regions";
import { humanize, paramValues, routeExpr, type Site, type SitePage } from "./site";

type Crud = Extract<Endpoint, { kind: "crud" }>;

// The field a row is known by: first string/email field, preferring required ones.
function labelField(entity: Entity): string {
  const text = entity.fields.filter((f) => f.type === "string" || f.type === "email");
  return (text.find((f) => f.required) ?? text[0])?.name ?? "id";
}

const lower = (s: string) => s[0]!.toLowerCase() + s.slice(1);

type FieldLiteral = {
  name: string;
  label: string;
  kind: string;
  required: boolean;
  values?: string[];
  default?: string | number | boolean;
  options?: string; // TS expression
};

function fieldLiteral(def: FieldLiteral): string {
  const json = (v: unknown) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(", ")}]` : JSON.stringify(v));
  const parts = (["name", "label", "kind", "required", "values", "default"] as const)
    .filter((key) => def[key] !== undefined)
    .map((key) => `${key}: ${json(def[key])}`);
  if (def.options) parts.push(`options: ${def.options}`);
  return `  { ${parts.join(", ")} },`;
}

// Declared fields, for tables and detail lists.
function displayFields(entity: Entity, forTable: boolean): string[] {
  return entity.fields
    .filter((f) => !forTable || f.type !== "text")
    .map((f) => fieldLiteral({ name: f.name, label: humanize(f.name), kind: f.type, required: f.required, values: f.type === "enum" ? f.values : undefined }));
}

// Writable columns for create/edit forms; belongsTo keys become pickers when
// the page uses the target's list endpoint.
function formFields(spec: Spec, entity: Entity, omit: string[], pickers: Crud[]): string[] {
  return columnsOf(spec, entity)
    .filter((c) => c.writable && !omit.includes(c.prop))
    .map((c) => {
      const base = { name: c.prop, required: c.notNull, default: c.default };
      if (!c.references) {
        return fieldLiteral({ ...base, label: humanize(c.prop), kind: c.kind, values: c.kind === "enum" ? c.values : undefined });
      }
      const label = humanize(c.prop.slice(0, -"Id".length));
      const picker = pickers.find((ep) => ep.entity === c.references!.entity);
      if (!picker) return fieldLiteral({ ...base, label, kind: "uuid" });
      const shown = labelField(entityNamed(spec, picker.entity));
      const query = picker.pagination ? `{ limit: ${picker.pagination.maxLimit} }` : "";
      const options = `() => api.${picker.id}(${query}).then((r) => r.items.map((row) => ({ value: row.id, label: String(row.${shown} ?? row.id) })))`;
      return fieldLiteral({ ...base, label, kind: "ref", options });
    });
}

const call = (ep: Endpoint, args: string[]) => `api.${ep.id}(${args.join(", ")})`;

function pageModule(imports: Imports, fieldBlocks: [string, string[]][], body: string[]): string {
  const blocks = fieldBlocks.map(([name, fields]) => `const ${name}: FieldDef[] = [\n${fields.join("\n")}\n];`);
  if (blocks.length > 0) imports.add("../lib/fields", "type FieldDef");
  return [HEADER, ...imports.render(), "", ...(blocks.length > 0 ? [blocks.join("\n\n"), ""] : []), ...body, ""].join("\n");
}

function listPage(spec: Spec, site: Site, sp: SitePage, plan: Extract<PagePlan, { kind: "list" }>): string {
  const entity = entityNamed(spec, plan.entity);
  const imports = new Imports().add("../api", "api").add("../components/kit", "ErrorBanner", "Table").add("../lib/hooks", "useLoad");
  const params = paramValues(sp.page.route);
  const hasParams = Object.keys(params).length > 0;
  const lines: string[] = [];
  if (hasParams) {
    imports.add("react-router", "useParams");
    lines.push(`  const params = useParams() as { ${Object.keys(params).map((p) => `${p}: string`).join("; ")} };`);
  }
  const listArgs = pathParams(plan.list.path).map((p) => params[p]!);
  const deps = listArgs.slice();
  if (plan.list.pagination) {
    imports.add("react", "useState").add("../components/kit", "Pager");
    lines.push("  const [offset, setOffset] = useState(0);");
    listArgs.push("{ offset }");
    deps.push("offset");
  }
  lines.push(`  const list = useLoad(() => ${call(plan.list, listArgs)}, [${deps.join(", ")}]);`);
  if (plan.remove) {
    imports.add("../lib/hooks", "useAction");
    lines.push("  const action = useAction();");
  }

  const target = site.pageFor("detail", plan.entity) ?? site.pageFor("edit", plan.entity);
  const link = target && routeExpr(target.page.route, { ...params, id: "row.id" });
  const create = site.pageFor("create", plan.entity);
  const createLink = create && routeExpr(create.page.route, params);
  if (createLink) imports.add("react-router", "Link");

  const tableProps = ["fields={fields}", "rows={list.data.items}"];
  if (link) tableProps.push(`link={(row) => ${link}}`);
  if (plan.remove) {
    tableProps.push(`onDelete={(row) => void action.run(async () => { await ${call(plan.remove, ["row.id"])}; list.reload(); })}`);
  }

  const body = [
    `export function ${sp.component}() {`,
    ...lines,
    "  return (",
    "    <section>",
    '      <header className="page-header">',
    `        <h1>${humanize(sp.page.id)}</h1>`,
    ...(createLink ? [`        <Link className="button" to={${createLink}}>New ${lower(humanize(entity.name))}</Link>`] : []),
    "      </header>",
    `      <ErrorBanner error={list.error${plan.remove ? " ?? action.error" : ""}} />`,
    "      {list.data && (",
    "        <>",
    `          <Table ${tableProps.join(" ")} />`,
    ...(plan.list.pagination ? ["          <Pager total={list.data.total} limit={list.data.limit} offset={offset} onChange={setOffset} />"] : []),
    "        </>",
    "      )}",
    "    </section>",
    "  );",
    "}",
  ];
  return pageModule(imports, [["fields", displayFields(entity, true)]], body);
}

// Where a form goes after saving: the row's detail page, else the list.
function afterSave(site: Site, entity: string, values: Record<string, string>): string | undefined {
  const detail = site.pageFor("detail", entity);
  const list = site.pageFor("list", entity);
  return (detail && routeExpr(detail.page.route, values)) ?? (list && routeExpr(list.page.route, values));
}

function formPage(spec: Spec, site: Site, sp: SitePage, plan: Extract<PagePlan, { kind: "create" | "edit" }>): string {
  const entity = entityNamed(spec, plan.entity);
  const imports = new Imports().add("../api", "api").add("../components/kit", "Form").add("../lib/fields", "initialValues");
  const params = paramValues(sp.page.route);
  const lines: string[] = [];
  if (Object.keys(params).length > 0) {
    imports.add("react-router", "useParams");
    lines.push(`  const params = useParams() as { ${Object.keys(params).map((p) => `${p}: string`).join("; ")} };`);
  }

  const name = pascal(entity.name);
  let fields: string[];
  let submit: string[];
  if (plan.kind === "create") {
    const parents = pathParams(plan.create.path);
    fields = formFields(spec, entity, parents, plan.pickers);
    const bodyType = parents.length > 0 ? `Omit<${name}Create, ${parents.map((p) => JSON.stringify(p)).join(" | ")}>` : `${name}Create`;
    imports.add("../api", `type ${name}Create`);
    const target = afterSave(site, plan.entity, { ...params, id: "created.id" });
    const create = call(plan.create, [...parents.map((p) => params[p]!), `body as ${bodyType}`]);
    submit = target?.includes("created.id") ? [`const created = await ${create};`, `navigate(${target});`] : [`await ${create};`, ...(target ? [`navigate(${target});`] : [])];
  } else {
    fields = formFields(spec, entity, [], plan.pickers);
    imports.add("../api", `type ${name}Update`).add("../components/kit", "ErrorBanner").add("../lib/hooks", "useLoad");
    lines.push(`  const record = useLoad(() => ${call(plan.get, ["params.id"])}, [params.id]);`);
    const target = afterSave(site, plan.entity, params);
    submit = [`await ${call(plan.update, ["params.id", `body as ${name}Update`])};`, ...(target ? [`navigate(${target});`] : [])];
  }
  if (submit.some((line) => line.startsWith("navigate("))) {
    imports.add("react-router", "useNavigate");
    lines.unshift("  const navigate = useNavigate();");
  }

  const form = (initial: string, label: string, indent: string) => [
    `${indent}<Form`,
    `${indent}  fields={fields}`,
    `${indent}  initial={${initial}}`,
    `${indent}  submitLabel="${label}"`,
    `${indent}  onSubmit={async (body) => {`,
    ...submit.map((line) => `${indent}    ${line}`),
    `${indent}  }}`,
    `${indent}/>`,
  ];
  const content =
    plan.kind === "create"
      ? form("initialValues(fields)", "Create", "      ")
      : ["      <ErrorBanner error={record.error} />", "      {record.data && (", ...form("initialValues(fields, record.data)", "Save", "        "), "      )}"];
  const title = `${plan.kind === "create" ? "New" : "Edit"} ${lower(humanize(entity.name))}`;
  const body = [`export function ${sp.component}() {`, ...lines, "  return (", "    <section>", `      <h1>${title}</h1>`, ...content, "    </section>", "  );", "}"];
  return pageModule(imports, [["fields", fields]], body);
}

function authPage(spec: Spec, site: Site, sp: SitePage, kind: "login" | "register"): string {
  const imports = new Imports()
    .add("react-router", "useNavigate")
    .add("../api", "api")
    .add("../components/kit", "Form")
    .add("../lib/fields", "initialValues")
    .add("../session", "session");
  const password = fieldLiteral({ name: "password", label: "Password", kind: "password", required: true });
  let fields: string[];
  let submit: string[];
  let other: string[] = [];
  const lines = ["  const navigate = useNavigate();"];
  if (kind === "login") {
    const email = loginField(spec);
    fields = [fieldLiteral({ name: email, label: humanize(email), kind: "email", required: true }), password];
    imports.add("react-router", "useSearchParams").add("../api", "type LoginRequest").add("../session", "nextPath");
    lines.push("  const [search] = useSearchParams();");
    submit = ["const result = await api.auth.login(body as LoginRequest);", "session.set(result.token);", 'navigate(nextPath(search.get("next")));'];
    if (site.registerRoute) other = ["      <p>", `        No account yet? <Link to=${JSON.stringify(site.registerRoute)}>Create one</Link>`, "      </p>"];
  } else {
    fields = [...formFields(spec, entityNamed(spec, spec.auth!.userEntity), [], []), password];
    imports.add("../api", "type RegisterRequest").add("../session", "HOME");
    submit = ["const result = await api.auth.register(body as RegisterRequest);", "session.set(result.token);", "navigate(HOME);"];
    if (site.loginRoute) other = ["      <p>", `        Already registered? <Link to=${JSON.stringify(site.loginRoute)}>Log in</Link>`, "      </p>"];
  }
  if (other.length > 0) imports.add("react-router", "Link");
  const title = kind === "login" ? "Log in" : "Create account";
  const body = [
    `export function ${sp.component}() {`,
    ...lines,
    "  return (",
    '    <section className="narrow">',
    `      <h1>${title}</h1>`,
    "      <Form",
    "        fields={fields}",
    "        initial={initialValues(fields)}",
    `        submitLabel="${title}"`,
    "        onSubmit={async (body) => {",
    ...submit.map((line) => `          ${line}`),
    "        }}",
    "      />",
    ...other,
    "    </section>",
    "  );",
    "}",
  ];
  return pageModule(imports, [["fields", fields]], body);
}

function detailPage(spec: Spec, site: Site, sp: SitePage, plan: Extract<PagePlan, { kind: "detail" }>): string {
  const entity = entityNamed(spec, plan.entity);
  const imports = new Imports()
    .add("react-router", "useParams")
    .add("../api", "api")
    .add("../components/kit", "Details", "ErrorBanner")
    .add("../lib/hooks", "useLoad");
  const params = paramValues(sp.page.route);
  const lines = [
    `  const params = useParams() as { ${Object.keys(params).map((p) => `${p}: string`).join("; ")} };`,
    `  const record = useLoad(() => ${call(plan.get, ["params.id"])}, [params.id]);`,
  ];
  const fieldBlocks: [string, string[]][] = [["fields", displayFields(entity, false)]];
  const buttons: string[] = [];
  const sections: string[] = [];

  // Links to the edit form and to deeper pages about this row (/invoices/:id/edit).
  const edit = site.pageFor("edit", plan.entity);
  const related = site.pages.filter((p) => p !== sp && (p === edit || p.page.route.startsWith(`${sp.page.route}/`)));
  for (const p of related) {
    const to = routeExpr(p.page.route, params);
    if (!to) continue;
    imports.add("react-router", "Link");
    buttons.push(`<Link className="button secondary" to={${to}}>${p === edit ? "Edit" : humanize(p.page.id)}</Link>`);
  }

  if (plan.actions.length > 0 || plan.remove) {
    imports.add("../lib/hooks", "useAction");
    lines.push("  const action = useAction();");
  }
  for (const ep of plan.actions) {
    const slot = spec.slots.find((s) => s.id === ep.slot)!;
    const run = call(ep, ["params.id"]);
    const label = humanize(ep.id.split(".").pop()!);
    const effect =
      slot.output.kind === "binary"
        ? `saveBlob(await ${run}, \`${lower(entity.name)}-\${params.id}.${slot.output.contentType.split("/")[1]}\`)`
        : `{ await ${run}; record.reload(); }`;
    if (slot.output.kind === "binary") imports.add("../lib/hooks", "saveBlob");
    buttons.push(`<button disabled={action.busy} onClick={() => void action.run(async () => ${effect})}>${label}</button>`);
  }
  if (plan.remove) {
    const list = site.pageFor("list", plan.entity);
    const back = list && routeExpr(list.page.route, params);
    if (back) {
      imports.add("react-router", "useNavigate");
      lines.unshift("  const navigate = useNavigate();");
    }
    const after = back ? ` navigate(${back});` : " record.reload();";
    buttons.push(
      `<button className="danger" disabled={action.busy} onClick={() => confirm("Delete this ${lower(humanize(entity.name))}?") && void action.run(async () => { await ${call(plan.remove, ["params.id"])};${after} })}>Delete</button>`,
    );
  }

  for (const child of plan.children) {
    const name = child.id.split(".")[0]!;
    const childEntity = entityNamed(spec, child.entity);
    fieldBlocks.push([`${name}Fields`, displayFields(childEntity, true)]);
    imports.add("../components/kit", "Table");
    lines.push(`  const ${name} = useLoad(() => ${call(child, ["params.id"])}, [params.id]);`);
    const fk = pathParams(child.path)[0]!;
    const target = site.pageFor("detail", child.entity) ?? site.pageFor("edit", child.entity);
    const link = target && routeExpr(target.page.route, { [fk]: "params.id", id: "row.id" });
    sections.push(
      `      <h2>${humanize(name)}</h2>`,
      `      <ErrorBanner error={${name}.error} />`,
      `      {${name}.data && <Table fields={${name}Fields} rows={${name}.data.items}${link ? ` link={(row) => ${link}}` : ""} />}`,
    );
  }

  const title = labelField(entity) === "id" ? humanize(entity.name) : `${humanize(entity.name)} {record.data?.${labelField(entity)}}`;
  const body = [
    `export function ${sp.component}() {`,
    ...lines,
    "  return (",
    "    <section>",
    '      <header className="page-header">',
    `        <h1>${title}</h1>`,
    ...(buttons.length > 0 ? ['        <div className="actions">', ...buttons.map((b) => `          ${b}`), "        </div>"] : []),
    "      </header>",
    `      <ErrorBanner error={record.error${plan.actions.length > 0 || plan.remove ? " ?? action.error" : ""}} />`,
    "      {record.data && <Details fields={fields} record={record.data} />}",
    ...sections,
    "    </section>",
    "  );",
    "}",
  ];
  return pageModule(imports, fieldBlocks, body);
}

function customPage(sp: SitePage): string {
  const slot = sp.page.slot!;
  const params = pathParams(sp.page.route);
  const imports = new Imports().add(`../slots/${slot}`, pascal(slot));
  const lines: string[] = [];
  if (params.length > 0) {
    imports.add("react-router", "useParams");
    lines.push(`  const params = useParams() as { ${params.map((p) => `${p}: string`).join("; ")} };`);
  }
  const props = params.length > 0 ? "params" : "{}";
  return pageModule(imports, [], [`export function ${sp.component}() {`, ...lines, `  return <${pascal(slot)} params={${props}} />;`, "}"]);
}

// web/src/slots/<id>.tsx: a custom page's component, preserved between the
// slot markers like backend slots.
export function pageSlotModule(spec: Spec, sp: SitePage): string {
  const slot = spec.slots.find((s) => s.id === sp.page.slot)!;
  const params = pathParams(sp.page.route);
  const paramsType = params.length > 0 ? `{ ${params.map((p) => `${p}: string`).join("; ")} }` : "Record<string, never>";
  const uses = sp.page.uses.map((id) => `api.${id}`).join(", ");
  return [
    `// ${MARKER} — do not edit outside @appspec:slot regions`,
    'import { api } from "../api";',
    'import { NotImplemented } from "../components/kit";',
    "",
    regionBegin(`${slot.id}:imports`),
    regionEnd(`${slot.id}:imports`),
    "",
    `// Page ${sp.page.id} at ${sp.page.route}.${uses ? " May call:" : ""}`,
    ...(uses ? wrap(uses, "//   ") : []),
    `const INTENT = ${JSON.stringify(slot.intent)};`,
    "",
    `export function ${pascal(slot.id)}({ params }: { params: ${paramsType} }) {`,
    `  ${regionBegin(slot.id)}`,
    pageStub(slot.id) + `  ${regionEnd(slot.id)}`,
    "}",
    "",
  ].join("\n");
}

export function pageComponentModule(spec: Spec, site: Site, sp: SitePage): string {
  const { plan } = sp;
  switch (plan.kind) {
    case "list":
      return listPage(spec, site, sp, plan);
    case "create":
    case "edit":
      return formPage(spec, site, sp, plan);
    case "login":
    case "register":
      return authPage(spec, site, sp, plan.kind);
    case "detail":
      return detailPage(spec, site, sp, plan);
    case "custom":
      return customPage(sp);
  }
}
