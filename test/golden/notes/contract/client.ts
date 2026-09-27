// @appspec:generated — do not edit
// Typed client for the notes API. No dependencies: runs in browsers and Node 18+.
// Generated from the same spec as the backend and contract/openapi.json.

// Schemas, in JSON wire format: dates and datetimes are ISO strings, money is integer minor units.
export type User = {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type UserCreate = {
  email: string;
};

export type Note = {
  id: string;
  ownerId: string;
  title: string;
  body: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteCreate = {
  title: string;
  body?: string | null;
  pinned?: boolean;
};

export type NoteUpdate = {
  title?: string;
  body?: string | null;
  pinned?: boolean;
};

export type RegisterRequest = {
  email: string;
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
    notes: {
      list: (query: { limit?: number; offset?: number } = {}) => call("GET", "/notes", { query }) as Promise<Paginated<Note>>,
      get: (id: string) => call("GET", `/notes/${encodeURIComponent(id)}`) as Promise<Note>,
      create: (body: NoteCreate) => call("POST", "/notes", { body }) as Promise<Note>,
      update: (id: string, body: NoteUpdate) => call("PATCH", `/notes/${encodeURIComponent(id)}`, { body }) as Promise<Note>,
      delete: (id: string) => call("DELETE", `/notes/${encodeURIComponent(id)}`) as Promise<void>,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
