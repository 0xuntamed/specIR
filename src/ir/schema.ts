import { z } from "zod";

// Zod checks structure only: shapes, identifier formats, unknown keys (strict
// objects catch typos like `requried`). Cross-references and semantic rules
// live in src/validate so every problem is reported as a coded Diagnostic.
// Fields the validator must check (enum `values`, `slot` refs) are therefore
// left lenient here.

const camel = /^[a-z][a-zA-Z0-9]*$/;
const pascal = /^[A-Z][a-zA-Z0-9]*$/;

const Name = z.string().regex(camel, "must be camelCase, e.g. dueDate");
const EntityName = z.string().regex(pascal, "must be PascalCase, e.g. LineItem");
const Id = z.string().regex(camel, "must be camelCase, e.g. sendInvoice");
const EndpointId = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/, "must be dotted camelCase, e.g. invoices.list");
const AppName = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "must be kebab-case, e.g. invoice-reminder");
const RoleName = z.string().regex(/^[a-z][a-z0-9_]*$/, "must be lower_snake_case, e.g. admin");
const EnumValue = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "must be an identifier, e.g. DRAFT");
// "/", or segments that are kebab-case literals or :camelCase params.
const Path = z
  .string()
  .regex(/^\/$|^(\/([a-z0-9]+(-[a-z0-9]+)*|:[a-z][a-zA-Z0-9]*))+$/, "must look like /invoices/:id/send");

// --- Fields and params ----------------------------------------------------

const ScalarType = z.enum(["string", "text", "int", "bool", "money", "datetime", "date", "uuid", "email"]);

// A param is a typed value: a slot input, and the base of an entity field.
const ScalarParam = z.strictObject({
  name: Name,
  type: ScalarType,
  required: z.boolean().default(false),
});
const EnumParam = z.strictObject({
  name: Name,
  type: z.literal("enum"),
  values: z.array(EnumValue), // may be empty here; rule 3 reports it
  required: z.boolean().default(false),
});
export const Param = z.discriminatedUnion("type", [ScalarParam, EnumParam]);

// money is an integer amount in minor units; currency is a separate field.
// readOnly fields are left out of create/update request bodies (still in
// responses); only slots write them, e.g. Invoice.status.
const FieldExtras = {
  unique: z.boolean().default(false),
  readOnly: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
};
export const Field = z.discriminatedUnion("type", [ScalarParam.extend(FieldExtras), EnumParam.extend(FieldExtras)]);

// --- Entities ---------------------------------------------------------------

// belongsTo owns the foreign key (`<name>Id` column). hasMany is the named
// inverse; it exists so generated code gets a readable name ("lineItems")
// without the compiler guessing plurals.
const BelongsTo = z.strictObject({
  name: Name,
  kind: z.literal("belongsTo"),
  target: EntityName,
  required: z.boolean().default(false),
  onDelete: z.enum(["cascade", "restrict", "setNull"]).default("restrict"),
});
const HasMany = z.strictObject({
  name: Name,
  kind: z.literal("hasMany"),
  target: EntityName,
});
export const Relation = z.discriminatedUnion("kind", [BelongsTo, HasMany]);

// Every entity has an implicit `id` (uuid primary key). `owned` adds an
// implicit `ownerId` → auth user entity. `timestamps` adds createdAt/updatedAt,
// `softDelete` adds deletedAt.
export const Entity = z.strictObject({
  name: EntityName,
  fields: z.array(Field),
  relations: z.array(Relation).default([]),
  owned: z.boolean().default(false),
  timestamps: z.boolean().default(true),
  softDelete: z.boolean().default(false),
});

// --- Auth and integrations --------------------------------------------------

// The auth block implies endpoints auth.register, auth.login, auth.me and an
// implicit passwordHash on the user entity (never in the spec or responses).
export const Auth = z.strictObject({
  strategy: z.literal("email_password_jwt"),
  userEntity: EntityName,
  roles: z.array(RoleName).default([]),
});

export const Integration = z.strictObject({
  kind: z.literal("email"),
  provider: z.literal("resend"),
});

// --- Endpoints --------------------------------------------------------------

export const Access = z.union([z.literal("public"), z.literal("user"), z.strictObject({ role: RoleName })]);

const Method = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// Path params: `:id` is the entity's own id; any other crud param must name a
// belongsTo relation (`:invoiceId` ↔ `invoice`).
const CrudEndpoint = z.strictObject({
  id: EndpointId,
  kind: z.literal("crud"),
  method: Method,
  path: Path,
  auth: Access,
  entity: EntityName,
  op: z.enum(["list", "get", "create", "update", "delete"]),
  scope: z.enum(["owner", "all"]),
  // Offset pagination, list only. Absent → the list returns every row.
  pagination: z.strictObject({ defaultLimit: z.int().positive(), maxLimit: z.int().positive() }).optional(),
});

// Path params must be declared slot inputs; remaining inputs come from the
// body (POST/PUT/PATCH) or the query string (GET/DELETE).
// With `entity`, the generated handler loads the row named by the
// `:<entity>Id` param (e.g. :invoiceId), 404s if it's missing or not owned by
// the current user, and passes it to the slot, so slots never do authz.
const CustomEndpoint = z.strictObject({
  id: EndpointId,
  kind: z.literal("custom"),
  method: Method,
  path: Path,
  auth: Access,
  entity: EntityName.optional(),
  slot: Id.optional(), // required; rule 10 reports it
});

export const Endpoint = z.discriminatedUnion("kind", [CrudEndpoint, CustomEndpoint]);

// --- Jobs, pages, slots -----------------------------------------------------

export const Job = z.strictObject({
  id: Id,
  trigger: z.strictObject({ kind: z.literal("cron"), schedule: z.string() }),
  slot: Id.optional(), // required; rule 10 reports it
  retries: z.int().min(0).default(0),
  // "Entity.field", e.g. "Reminder.idempotencyKey"
  idempotencyKey: z
    .string()
    .regex(/^[A-Z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/, "must be Entity.field, e.g. Reminder.idempotencyKey")
    .optional(),
});

// Form pages are create-mode (use a create endpoint) or edit-mode (use get +
// update), never both. Custom pages render a frontend slot.
export const Page = z.strictObject({
  id: Id,
  route: Path,
  auth: Access,
  layout: z.enum(["list", "detail", "form", "custom"]),
  uses: z.array(EndpointId).default([]),
  slot: Id.optional(),
});

const SlotOutput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("void") }),
  z.strictObject({ kind: z.literal("entity"), entity: EntityName }),
  z.strictObject({ kind: z.literal("binary"), contentType: z.string() }),
]);

// Custom logic the IR can't express. The generator emits a typed stub that
// throws NotImplemented; agents fill it later.
export const Slot = z.strictObject({
  id: Id,
  intent: z.string().min(1),
  inputs: z.array(Param).default([]),
  output: SlotOutput.default({ kind: "void" }),
});

// --- Spec ---------------------------------------------------------------------

export const Spec = z.strictObject({
  app: z.strictObject({
    name: AppName,
    backend: z.literal("node"),
    database: z.literal("postgres"),
  }),
  auth: Auth.optional(),
  integrations: z.array(Integration).default([]),
  entities: z.array(Entity),
  endpoints: z.array(Endpoint).default([]),
  jobs: z.array(Job).default([]),
  pages: z.array(Page).default([]),
  slots: z.array(Slot).default([]),
});
