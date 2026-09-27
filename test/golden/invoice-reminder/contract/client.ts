// @appspec:generated — do not edit
// Typed client for the invoice-reminder API. No dependencies: runs in browsers and Node 18+.
// Generated from the same spec as the backend and contract/openapi.json.

// Schemas, in JSON wire format: dates and datetimes are ISO strings, money is integer minor units.
export type User = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserCreate = {
  email: string;
  name?: string | null;
};

export type Client = {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientCreate = {
  name: string;
  email: string;
};

export type ClientUpdate = {
  name?: string;
  email?: string;
};

export type Invoice = {
  id: string;
  ownerId: string;
  clientId: string;
  number: string;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
  currency: string;
  issueDate: string;
  dueDate: string;
  notes: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceCreate = {
  clientId: string;
  number: string;
  currency?: string;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
};

export type InvoiceUpdate = {
  clientId?: string;
  number?: string;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string | null;
};

export type LineItem = {
  id: string;
  ownerId: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  createdAt: string;
  updatedAt: string;
};

export type LineItemCreate = {
  invoiceId: string;
  description: string;
  quantity?: number;
  unitPrice: number;
};

export type LineItemUpdate = {
  invoiceId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
};

export type Reminder = {
  id: string;
  invoiceId: string;
  scheduledAt: string;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type RegisterRequest = {
  email: string;
  name?: string | null;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type ErrorResponse = { error: string; issues?: { path: string; message: string }[] };
export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };
export type Listed<T> = { items: T[] };

export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorResponse | null;

  constructor(status: number, body: ErrorResponse | null) {
    super(body?.error ?? `HTTP ${status}`);
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
    if (token) headers.authorization = `Bearer ${token}`;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const response = await doFetch(`${baseUrl}${path}${qs ? `?${qs}` : ""}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => null)) as ErrorResponse | null);
    if (response.status === 204) return undefined;
    return init.binary ? response.blob() : response.json();
  }

  return {
    auth: {
      register: (body: RegisterRequest) => call("POST", "/auth/register", { body }) as Promise<AuthResponse>,
      login: (body: LoginRequest) => call("POST", "/auth/login", { body }) as Promise<AuthResponse>,
      me: () => call("GET", "/auth/me") as Promise<User>,
    },
    clients: {
      list: (query: { limit?: number; offset?: number } = {}) => call("GET", "/clients", { query }) as Promise<Paginated<Client>>,
      get: (id: string) => call("GET", `/clients/${encodeURIComponent(id)}`) as Promise<Client>,
      create: (body: ClientCreate) => call("POST", "/clients", { body }) as Promise<Client>,
      update: (id: string, body: ClientUpdate) => call("PATCH", `/clients/${encodeURIComponent(id)}`, { body }) as Promise<Client>,
      delete: (id: string) => call("DELETE", `/clients/${encodeURIComponent(id)}`) as Promise<void>,
    },
    invoices: {
      list: (query: { limit?: number; offset?: number } = {}) => call("GET", "/invoices", { query }) as Promise<Paginated<Invoice>>,
      get: (id: string) => call("GET", `/invoices/${encodeURIComponent(id)}`) as Promise<Invoice>,
      create: (body: InvoiceCreate) => call("POST", "/invoices", { body }) as Promise<Invoice>,
      update: (id: string, body: InvoiceUpdate) => call("PATCH", `/invoices/${encodeURIComponent(id)}`, { body }) as Promise<Invoice>,
      delete: (id: string) => call("DELETE", `/invoices/${encodeURIComponent(id)}`) as Promise<void>,
      send: (invoiceId: string) => call("POST", `/invoices/${encodeURIComponent(invoiceId)}/send`) as Promise<Invoice>,
      pdf: (invoiceId: string) => call("GET", `/invoices/${encodeURIComponent(invoiceId)}/pdf`, { binary: true }) as Promise<Blob>,
      markPaid: (invoiceId: string) => call("POST", `/invoices/${encodeURIComponent(invoiceId)}/mark-paid`) as Promise<Invoice>,
    },
    lineItems: {
      list: (invoiceId: string) => call("GET", `/invoices/${encodeURIComponent(invoiceId)}/line-items`) as Promise<Listed<LineItem>>,
      create: (invoiceId: string, body: Omit<LineItemCreate, "invoiceId">) => call("POST", `/invoices/${encodeURIComponent(invoiceId)}/line-items`, { body }) as Promise<LineItem>,
      update: (id: string, body: LineItemUpdate) => call("PATCH", `/line-items/${encodeURIComponent(id)}`, { body }) as Promise<LineItem>,
      delete: (id: string) => call("DELETE", `/line-items/${encodeURIComponent(id)}`) as Promise<void>,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
