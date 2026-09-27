import { HEADER } from "../names";
import type { Contract, Operation, Prop } from "./model";

function tsType(p: Prop): string {
  const base =
    p.type === "ref"
      ? p.ref!
      : p.type === "enum"
        ? p.values.map((v) => JSON.stringify(v)).join(" | ")
        : { uuid: "string", string: "string", text: "string", email: "string", date: "string", datetime: "string", int: "number", money: "number", bool: "boolean" }[p.type];
  return p.nullable ? `${base} | null` : base;
}

const objectType = (props: Prop[], indent: string) =>
  props.length === 0 ? "Record<string, never>" : `{\n${props.map((p) => `${indent}  ${p.name}${p.optional ? "?" : ""}: ${tsType(p)};`).join("\n")}\n${indent}}`;

// One client method: path params positional, then a body or query object.
function method(op: Operation): string {
  const args = op.pathParams.map((p) => `${p.name}: ${tsType(p)}`);
  const init: string[] = [];

  if (op.body?.kind === "schema") {
    const type = op.body.omit.length > 0 ? `Omit<${op.body.name}, ${op.body.omit.map((n) => JSON.stringify(n)).join(" | ")}>` : op.body.name;
    args.push(`body: ${type}`);
    init.push("body");
  } else if (op.body?.kind === "inputs") {
    args.push(`body: ${objectType(op.body.props, "    ")}`);
    init.push("body");
  }
  if (op.query.length > 0) {
    const optional = op.query.every((p) => p.optional);
    args.push(`query: ${objectType(op.query, "    ")}${optional ? " = {}" : ""}`);
    init.push("query");
  }
  if (op.response.kind === "list" && op.response.pagination) {
    args.push("query: { limit?: number; offset?: number } = {}");
    init.push("query");
  }
  if (op.response.kind === "binary") init.push("binary: true");

  const path = op.path.replace(/:([A-Za-z0-9]+)/g, "${encodeURIComponent($1)}");
  const url = path.includes("${") ? `\`${path}\`` : JSON.stringify(path);
  const options = init.length > 0 ? `, { ${init.join(", ")} }` : "";
  return `(${args.join(", ")}) => call(${JSON.stringify(op.method)}, ${url}${options}) as Promise<${resultType(op)}>`;
}

function resultType(op: Operation): string {
  switch (op.response.kind) {
    case "schema":
      return op.response.name;
    case "list":
      return `${op.response.pagination ? "Paginated" : "Listed"}<${op.response.item}>`;
    case "binary":
      return "Blob";
    case "empty":
      return "void";
  }
}

// Endpoint ids become nested methods: "invoices.markPaid" → api.invoices.markPaid().
type Tree = Map<string, Tree | Operation>;

function treeOf(ops: Operation[]): Tree {
  const root: Tree = new Map();
  for (const op of ops) {
    const parts = op.id.split(".");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const next = node.get(part) ?? new Map();
      if (!(next instanceof Map)) throw new Error(`endpoint id ${op.id} nests under endpoint ${part}`);
      node.set(part, next);
      node = next;
    }
    const leaf = parts[parts.length - 1]!;
    if (node.has(leaf)) throw new Error(`endpoint id ${op.id} is also a namespace`);
    node.set(leaf, op);
  }
  return root;
}

function renderTree(tree: Tree, indent: string): string {
  return [...tree]
    .map(([key, value]) =>
      value instanceof Map ? `${indent}${key}: {\n${renderTree(value, `${indent}  `)}\n${indent}},` : `${indent}${key}: ${method(value)},`,
    )
    .join("\n");
}

// contract/client.ts: zero-dependency typed client over fetch.
export function clientModule(contract: Contract): string {
  const types = contract.schemas.map((s) => `export type ${s.name} = ${objectType(s.props, "")};`);
  const hasPaginated = contract.operations.some((op) => op.response.kind === "list" && op.response.pagination);
  const hasListed = contract.operations.some((op) => op.response.kind === "list" && !op.response.pagination);

  return `${HEADER}
// Typed client for the ${contract.title} API. No dependencies: runs in browsers and Node 18+.
// Generated from the same spec as the backend and contract/openapi.json.

// Schemas, in JSON wire format: dates and datetimes are ISO strings, money is integer minor units.
${types.join("\n\n")}

export type ErrorResponse = { error: string; issues?: { path: string; message: string }[] };
${hasPaginated ? "export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };\n" : ""}${hasListed ? "export type Listed<T> = { items: T[] };\n" : ""}
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorResponse | null;

  constructor(status: number, body: ErrorResponse | null) {
    super(body?.error ?? \`HTTP \${status}\`);
    this.status = status;
    this.body = body;
  }
}

export type ApiClientOptions = {
  // Prefix for every path, e.g. "http://localhost:3000". Defaults to same origin.
  baseUrl?: string;
  // Returns the bearer token to send, if any.
  token?: () => string | null | undefined;
  fetch?: typeof fetch;
};

type Query = Record<string, string | number | boolean | undefined>;

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const doFetch = options.fetch ?? fetch;

  // Non-2xx responses throw ApiError carrying the server's ErrorResponse.
  async function call(method: string, path: string, init: { body?: unknown; query?: Query; binary?: boolean } = {}): Promise<unknown> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(init.query ?? {})) if (value !== undefined) search.set(key, String(value));
    const qs = search.toString();
    const headers: Record<string, string> = {};
    const token = options.token?.();
    if (token) headers.authorization = \`Bearer \${token}\`;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const response = await doFetch(\`\${baseUrl}\${path}\${qs ? \`?\${qs}\` : ""}\`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => null)) as ErrorResponse | null);
    if (response.status === 204) return undefined;
    return init.binary ? response.blob() : response.json();
  }

  return {
${renderTree(treeOf(contract.operations), "    ")}
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
`;
}
