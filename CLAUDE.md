# Project: AppSpec — a spec-to-app compiler

## Context
I'm building a compiler that turns a typed application spec (an IR) into a small,
runnable full-stack app. Long term there will be a visual canvas that emits the IR
and AI agents that fill custom-logic "slots". NOT in this phase. This phase is the
deterministic core only: IR → validation → code generation. No LLM calls anywhere
in this codebase.

Pipeline for this phase:
  spec (TS file) → Zod-parsed IR → validator (diagnostics) → generators → output repo

## Tech decisions (fixed)
- Compiler (this repo): TypeScript, Node, Zod for the IR schema. Single package,
  no monorepo/workspaces. Run with tsx. Tests with vitest.
- Generated app target: Node + Fastify + TypeScript, PostgreSQL + Drizzle ORM,
  Zod request/response schemas, React + Vite frontend, docker-compose for a small VPS.
- Go will be a second backend target LATER. Keep the IR language-agnostic
  (no Fastify/Drizzle concepts in the IR), but do not build the Go emitter now.
- Generation uses plain template functions (TS functions returning strings).
  No AST builders, no template engine dependency.
- Output must be deterministic: same spec → byte-identical output
  (stable ordering, no timestamps, no random ids).

## Repo structure
```
src/
  ir/          schema.ts (Zod), types.ts (inferred types, defineSpec)
  validate/    rules/*.ts, index.ts → Diagnostic[]
  generate/
    backend-node/   entities, migrations, routes, jobs, server bootstrap
    contract/       openapi.ts, client.ts (typed API client)
    frontend-react/ routes, pages, forms
    infra/          Dockerfile, docker-compose, .env.example
  cli.ts       `appspec validate <spec>` / `appspec generate <spec> --out <dir>`
specs/
  invoice-reminder.ts
  notes.ts
  broken/      intentionally invalid specs, one per validator rule
test/
  golden/      snapshot tests of generated output
```

Commands: `npm run appspec -- validate specs/notes.ts`, `npm test`, `npm run typecheck`.

## IR v0 requirements
Must express:
- app: name, backend target ("node" for now), database ("postgres")
- entities: name, fields, relations, timestamps, softDelete
- field types: string, text, int, bool, money (integer minor units), datetime,
  date, uuid, email, enum (with values); flags: required, unique, default
- relations: belongsTo / hasMany, target entity, onDelete
- ownership: an entity can be owned by the auth user entity (rows scoped per user)
- auth: strategy "email_password_jwt", userEntity, optional roles
- integrations: e.g. { kind: "email", provider: "resend" }
- endpoints: id, method, path, auth ("public" | "user" | role), scope ("owner" | "all"),
  kind "crud" (entity + op: list|get|create|update|delete, pagination for list)
  or kind "custom" (must declare a slot)
- jobs: id, trigger (cron schedule | entity event), must declare a slot,
  retries, optional idempotency key field
- pages: id, route, auth, layout (list | detail | form | custom), uses: endpoint ids
- slots: id + intent (plain-English description of the custom logic) + declared
  inputs/outputs. Slots are where AI agents will plug in later. For now the
  generator emits a typed stub that throws NotImplemented with the intent in a comment.

Anything the reference specs need that the IR can't express cleanly should become
a slot, not a new IR feature. Flag those cases to me.

## Validator rules (each returns { level: error|warning, code, path, message })
One rule = one code = one file in `src/validate/rules/<code>.ts` = one spec in
`specs/broken/<code>.ts`. `test/validate.test.ts` asserts each broken spec fires its own
code and nothing else, and snapshots every message.

1. `duplicate-id` — duplicate entity / endpoint / page / job / slot ids (also field/relation/FK
   names within an entity, enum values, slot inputs)
2. `unknown-relation-target` — relation target entity doesn't exist
3. `empty-enum` — enum field (or slot input) with no values
4. `auth-user-entity` — auth userEntity missing, or lacks a required unique email field
5. `auth-required` — non-public endpoint/page, or owned entity, but no auth block defined
6. `public-write` — public write endpoint (POST/PUT/PATCH/DELETE)
7. `crud-mismatch` — crud entity missing, op doesn't match HTTP method, or pagination on non-list
8. `duplicate-route` — duplicate method + path (param names ignored; includes auth endpoints
   and page routes)
9. `crud-missing-id` — get/update/delete crud path missing :id param
10. `slot-ref` — custom endpoint, custom page or job without an existing slot; slot on a non-custom
    page; a slot with more than one caller
11. `unknown-endpoint` — page uses an endpoint id that doesn't exist
12. `public-page-uses-authed` — public page uses an authed endpoint (warning)
13. `invalid-cron` — invalid cron expression (basic 5-field numeric check; no MON/JAN names)
14. `idempotency-key` — job idempotency key entity/field missing or not unique
15. `owner-scope` — scope "owner" on an entity that isn't owned, or on a public endpoint; a public
    custom endpoint that loads an owned entity

Extra rules enforcing the decisions log:
- `reserved-name` — field/relation/FK named like a generated column (or `owner` on an owned
  entity); `auth.*` endpoint ids
- `hasmany-inverse` — hasMany target needs exactly one belongsTo pointing back
- `setnull-required` — onDelete setNull on a required belongsTo
- `readonly-unsettable` — required readOnly field with no default on an entity created over HTTP
- `unknown-role` — `{ role }` access naming a role not in auth.roles
- `crud-path-param` — :id on list/create, or a crud param that isn't a belongsTo FK
- `custom-path-param` — custom path param not a slot input, or missing the `:<entity>Id` param
- `unknown-entity` — custom endpoint `entity` or slot output entity doesn't exist
- `page-layout` — a page's endpoints don't fit its layout (see `src/ir/pages.ts`)

Schema (Zod) errors stop validation and are reported as `schema.<zod issue code>`.

## Reference spec 1: Invoice Reminder (primary test case)
Entities: User, Client, Invoice, LineItem, Reminder.
- Money is integer minor units + currency.
- Invoice status enum: DRAFT, SENT, PAID, CANCELLED.
- Reminder: invoice relation, scheduledAt, status (PENDING, SENT, FAILED, SKIPPED),
  attempts, lastError, sentAt, unique idempotencyKey.
- CRUD for clients and invoices (owner-scoped), line items under invoices.
- Custom endpoints (slots): send invoice (email + PDF, schedule reminders),
  get invoice PDF, mark paid.
- Job (slot): reminder worker on cron. Postgres is the source of truth; claim due
  reminders with row locking (FOR UPDATE SKIP LOCKED), re-check PAID/CANCELLED
  immediately before sending, idempotent delivery, retries.
- Email via Resend. No Redis, Kafka, queues, or microservices.
- Pages: login, register, clients list/form, invoices list/detail/editor.

## Reference spec 2: Notes (simplicity check)
User with auth, Note entity (title, body, pinned), owner-scoped CRUD, list + editor pages.
The IR must describe this with zero slots.

## File ownership (important for later regeneration)
- Fully generated files start with: `// @appspec:generated — do not edit`
- Slot regions are wrapped in `// @appspec:slot <id> begin` / `// @appspec:slot <id> end`
- Anything outside those is user-owned. The generator must never overwrite
  user-owned files; on regenerate it rewrites generated files and preserves
  slot bodies.

## Milestones (stop after each one, show me the file tree and key files, wait for my OK)
1. IR schema + both reference specs parse → verify: `appspec validate` passes both
2. Validator + broken specs → verify: every rule has a failing-spec test
3. Backend generator: Drizzle schema, migrations, Fastify CRUD routes with Zod,
   auth, owner scoping, slot stubs, job runner scaffold
   → verify: generated Notes app boots via docker-compose and CRUD works via curl;
     generated Invoice Reminder boots with slots returning NotImplemented
4. Contract: OpenAPI from IR + typed client → verify: OpenAPI validates,
   client typechecks against generated backend
5. React frontend from pages + client → verify: Notes app fully usable in browser
6. Golden snapshot tests + regeneration test proving slot bodies survive regenerate

## Working rules
- Ask before assuming anything not specified here. State tradeoffs briefly.
- Simplest thing that works; no abstractions for single-use code; no speculative config.
- Don't add dependencies without saying why.
- Keep the IR small. Pushing back on IR additions is part of the job.

## Decisions log
These refine or override the requirements above.

### 2026-09-27 — before IR v0
1. **Auth endpoints are implicit.** An `auth` block implies `auth.register` (POST /auth/register),
   `auth.login` (POST /auth/login), `auth.me` (GET /auth/me). They are exempt from rule 6, and the
   `auth.` id prefix is reserved. The user entity gets an implicit `passwordHash`, never in the spec
   and never in responses.
2. **Direct ownership.** Every `owned` entity gets its own implicit `ownerId` column (FK → user
   entity, cascade), including children like LineItem. On create/update the generator verifies that
   any belongsTo target which is owned belongs to the same user (no cross-tenant links).
3. **Path params.** In crud paths, `:id` is the entity's own id; any other param must name a
   belongsTo relation (`:invoiceId` ↔ `invoice`). In custom paths, params must be declared slot
   inputs; other inputs come from the body (POST/PUT/PATCH) or query (GET/DELETE).
4. **Job idempotency key** is written `"Entity.field"`.
5. **Cron triggers only** in v0; entity-event triggers dropped (neither spec needs them, and
   without a queue they need an outbox design).
6. **Money** is an integer column of minor units; currency is a separate field. No computed
   fields; derived values (invoice total) are slot territory.
7. **Zod checks structure only** (strict objects, identifier formats). All numbered rules run in
   the validator. Zod issues are reported as Diagnostics with code `schema.<zod issue code>`.
8. **Slot I/O:** inputs are params (field types incl. enum); output is `void | entity | binary`.
   `custom` pages require a (frontend) slot.
9. **Migrations:** the compiler emits SQL itself; drizzle-kit output is nondeterministic (random
   snapshot ids and file names). Drizzle is used for queries only.
10. **update op = PATCH only. List pagination = offset/limit.**
11. **Access** = `"public" | "user" | { role }`.
12. **Specs are plain data** via `defineSpec()`: JSON-serializable, so the canvas can emit the same.
13. Generated-app deps (milestone 3): `node:crypto` scrypt for passwords (no native build),
    `croner` for cron, `@fastify/jwt` or `jose` for JWT.

### 2026-09-27 — IR v0 conventions
- Arrays (not records) for entities/fields/endpoints/etc., so duplicates are detectable (rule 1)
  and order is explicit.
- Implicit per-entity columns: `id` (uuid PK), `ownerId` if owned, `createdAt`/`updatedAt` if
  timestamps (default true), `deletedAt` if softDelete.
- belongsTo creates `<name>Id`. hasMany is the named inverse, kept so generated code gets
  readable names without the compiler guessing plurals.
- Form pages are create-mode (use a create endpoint) or edit-mode (use get + update), never both.
- A belongsTo field on a form is rendered as a picker fed by the target's list endpoint in `uses`.

### 2026-09-27 — after IR v0 review
- **`readOnly` field flag** (added to IR): excluded from create/update request bodies, still in
  responses. Only slots write these fields (Invoice.status/sentAt/paidAt).
- **`entity` on custom endpoints** (added to IR): the generated handler loads the row named by
  `:<entity>Id` (e.g. `:invoiceId`), 404s if missing or not owned by the current user, and passes
  it to the slot. Authorization never depends on slot (agent) code.

### 2026-09-27 — milestone 2
- Page layout rules (form = create xor get+update, list needs a list endpoint, …) are deferred
  to milestone 5, where the React generator defines what it actually needs.

### 2026-09-27 — milestone 3 (backend generator)
`appspec generate <spec> --out <dir>` → `src/generate/`. Generated app (layout as of milestone 4):
```
docker-compose.yml .env.example .gitignore
contract/openapi.json client.ts                       ← language-agnostic, milestone 4
api/package.json tsconfig.json tsconfig.build.json Dockerfile .dockerignore contract.check.ts
api/migrations/0000_init.sql
api/src/server.ts env.ts auth.ts jobs.ts
api/src/db/{schema,client,migrate}.ts   api/src/schemas/<entity>.ts   api/src/routes/<entity>.ts, custom.ts
api/src/lib/{errors,load,context}.ts    api/src/slots/<slotId>.ts      api/src/integrations/email.ts
```
- **Generated-app deps:** fastify, zod, drizzle-orm, pg, @fastify/jwt (auth), croner (jobs).
  No resend SDK (fetch), no type provider (explicit `.parse()`), no bcrypt (node:crypto scrypt),
  no drizzle-kit.
- **Markers per file type:** `//`, `--` (SQL), `#` (Docker/YAML/env), and a `"//"` key in
  package.json. The writer refuses to overwrite any file without one.
- **Slot files** have two preserved regions: `<id>:imports` (module scope: imports, helpers) and
  `<id>` (function body). Everything else in the file is regenerated. Each slot has exactly one
  caller, so its signature is fixed: endpoint slots get `(ctx: SlotContext, input)` where input
  includes the guarded row; job slots get `(ctx: JobContext)`. Slots receive and return Drizzle
  rows (`<Entity>Row`); routes parse responses through the Zod response schema.
- **Database:** singular snake_case tables, always quoted; enum = text + CHECK; money = bigint
  (JS number); datetime = timestamptz ↔ Date; date = `YYYY-MM-DD` string. FKs added after all
  tables, indexed. `0000_init.sql` is regenerated from the full spec, so a schema change means
  resetting the DB until spec-diff migrations exist. Hand-written `migrations/*.sql` (no marker)
  are applied too, in name order.
- **HTTP:** Zod errors → 400 `{ error, issues }`; not found / not owned → 404; FK to a row the
  user doesn't own → 400; unique/FK violations → 409; NotImplemented slot → 501. Lists return
  `{ items }`, paginated lists `{ items, total, limit, offset }`, newest first.
- **Jobs** run in the API process via croner (`protect` prevents overlap). `retries` = whole-run
  retries with exponential backoff; a NotImplemented stub logs a warning and isn't retried.
- **Docker:** node:22-alpine two-stage build, postgres:17-alpine. (Since milestone 5 only `web` is published.)

### 2026-09-27 — milestone 4 (contract)
- **Layout:** backend moved to `api/`, contract in `contract/`, frontend will be `web/`. A Go
  emitter would replace only `api/`; the contract and web stay.
- **One contract model** (`src/generate/contract/model.ts`: schemas + operations) is derived from
  the IR and rendered twice: `contract/openapi.json` (OpenAPI 3.1) and `contract/client.ts`.
  The client is generated from the IR, not from the backend, so it would serve a Go backend too.
- **Client:** zero-dependency, fetch-based, `createApiClient({ baseUrl, token })`. Endpoint ids
  become nested methods (`invoices.markPaid` → `api.invoices.markPaid(invoiceId)`); path params
  positional, then a body or query object. Wire types: dates/datetimes are strings, money is
  integer minor units. Non-2xx throws `ApiError { status, body }`.
- **Contract check:** `api/contract.check.ts` asserts, per entity, that the client's types equal
  the backend's Zod types (response via JSON wire mapping, Create/Update/Register/Login via
  z.input), comparing assignability both ways plus key sets. `npm run typecheck` in `api/`
  compiles it. Custom endpoint inputs aren't covered by the type check (their query/path inputs
  are coerced strings); the e2e covers them.
- `api/tsconfig.json` is for typechecking (noEmit, includes the check); `tsconfig.build.json`
  builds src/ → dist/.
- OpenAPI's generated marker is an `"x-appspec"` key on line 2 (JSON has no comments).
- Compiler tests validate the OpenAPI with `@readme/openapi-parser` (dev dependency) and
  typecheck the client standalone with DOM libs only.

### 2026-09-27 — milestone 5 (React frontend)
- **Serving:** `web/` builds with Vite and runs in an nginx container that serves the SPA and
  proxies `/api/*` → `api:3000` (prefix stripped). Only `web` is published (`WEB_PORT`, default
  8080); the API and Postgres are internal. The web image builds from the repo root because it
  needs `contract/`.
- **Deps:** react, react-dom, react-router (v8); dev: vite, @vitejs/plugin-react, typescript,
  @types/react*. No data-fetching, form or CSS libraries.
- **Page plans** (`src/ir/pages.ts`, enforced by `page-layout`):
  - list: one list endpoint (+ delete of the same entity); route supplies nested params.
  - form: one create (+ list endpoints of belongsTo targets as pickers), or get + update of one
    entity (+ pickers), or exactly `auth.login` / `auth.register`.
  - detail: one get (+ delete, child lists nested under it, and custom endpoints guarding the
    same entity with no other required input, rendered as action buttons).
  - custom: renders its slot.
- **Navigation is derived:** list rows link to the entity's detail page, else its edit page;
  after create → detail, else list; nav bar = parameterless list pages; home = first authed one.
  A detail page links to its edit form and to deeper routes (`/invoices/:id/edit`).
- **Generated web layout:** `src/pages/<Page>.tsx` (short: FieldDef lists + kit wiring),
  `src/components/kit.tsx` (Form, Table, Details, Pager, ErrorBanner), `src/lib/{fields,hooks}.ts`,
  `src/session.tsx` (token in localStorage, RequireAuth, `?next=` limited to same-app paths),
  `src/api.ts` (client with baseUrl `/api`; a 401 with a token signs out).
- **Frontend slots:** custom pages get `web/src/slots/<id>.tsx` with the same two preserved
  regions as backend slots; the stub renders `<NotImplemented>` with the intent.
- **Money** is shown and edited with 2 decimals (minor units ÷ 100); currencies with other
  exponents would need a slot or a future IR change.

### 2026-09-27 — milestone 6 (golden tests, regeneration)
- **Golden output:** `test/golden/<spec>/<path>` holds every generated file for both reference
  specs (`toMatchFileSnapshot`), plus a test that fails on golden files the generator no longer
  produces. After an intended generator change: `npx vitest run -u`, review the diff, delete any
  reported stale golden files. `tsconfig.json` excludes `test/golden`.
- **Regions and stubs** live in `src/generate/regions.ts`. Stub bodies are exact, id-only strings
  (page slots read their intent from a generated `INTENT` const outside the region), so the writer
  can tell an untouched slot from written code.
- **Writer rules** (`src/generate/write.ts`), all checked before anything is written:
  - a target file without the marker is user-owned → refuse;
  - an existing region that holds code and would disappear → refuse;
  - region bodies are carried over; unchanged files aren't rewritten;
  - files listed in `.appspec/manifest.json` (the last run's output) that the spec no longer
    produces are deleted, unless a region holds code (kept, reported as orphaned, stays in the
    manifest) or the marker was removed (the user took the file over).
- **The marker alone never proves a file is generated:** `cp .env.example .env` copies it. An
  early version deleted `.env` on regenerate; the manifest fixed it, and a regression test covers it.
- `test/regenerate.test.ts` runs the full cycle: implement backend + frontend slots, add
  user-owned files (incl. `.env` and a hand-written migration), change the spec (new field,
  reworded intent, two slots removed), regenerate, and check preservation, propagation,
  deletion, orphan reporting and idempotence.
