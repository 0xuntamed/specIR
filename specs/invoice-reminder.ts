import { defineSpec } from "../src/ir/types";

// Primary test case. Deterministic parts: entities, owner-scoped CRUD, pages.
// Everything else (email, PDF, reminder worker, invoice editor) is a slot.
export default defineSpec({
  app: { name: "invoice-reminder", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },
  integrations: [{ kind: "email", provider: "resend" }],

  entities: [
    {
      name: "User",
      fields: [
        { name: "email", type: "email", required: true, unique: true },
        { name: "name", type: "string" },
      ],
    },
    {
      name: "Client",
      owned: true,
      softDelete: true,
      fields: [
        { name: "name", type: "string", required: true },
        { name: "email", type: "email", required: true },
      ],
      relations: [{ name: "invoices", kind: "hasMany", target: "Invoice" }],
    },
    {
      name: "Invoice",
      owned: true,
      fields: [
        // Entered by the user: per-owner uniqueness and auto-numbering
        // aren't expressible in the IR.
        { name: "number", type: "string", required: true },
        // Lifecycle fields are readOnly: only the send / mark-paid slots change them.
        { name: "status", type: "enum", values: ["DRAFT", "SENT", "PAID", "CANCELLED"], required: true, default: "DRAFT", readOnly: true },
        { name: "currency", type: "string", required: true, default: "USD" },
        { name: "issueDate", type: "date", required: true },
        { name: "dueDate", type: "date", required: true },
        { name: "notes", type: "text" },
        { name: "sentAt", type: "datetime", readOnly: true },
        { name: "paidAt", type: "datetime", readOnly: true },
      ],
      relations: [
        { name: "client", kind: "belongsTo", target: "Client", required: true, onDelete: "restrict" },
        { name: "lineItems", kind: "hasMany", target: "LineItem" },
        { name: "reminders", kind: "hasMany", target: "Reminder" },
      ],
    },
    {
      name: "LineItem",
      owned: true,
      fields: [
        { name: "description", type: "string", required: true },
        { name: "quantity", type: "int", required: true, default: 1 },
        { name: "unitPrice", type: "money", required: true },
      ],
      relations: [{ name: "invoice", kind: "belongsTo", target: "Invoice", required: true, onDelete: "cascade" }],
    },
    {
      // Not exposed over HTTP, so not owned: rows are written by slots only.
      name: "Reminder",
      fields: [
        { name: "scheduledAt", type: "datetime", required: true },
        { name: "status", type: "enum", values: ["PENDING", "SENT", "FAILED", "SKIPPED"], required: true, default: "PENDING" },
        { name: "attempts", type: "int", required: true, default: 0 },
        { name: "lastError", type: "text" },
        { name: "sentAt", type: "datetime" },
        { name: "idempotencyKey", type: "string", required: true, unique: true },
      ],
      relations: [{ name: "invoice", kind: "belongsTo", target: "Invoice", required: true, onDelete: "cascade" }],
    },
  ],

  endpoints: [
    // Clients
    {
      id: "clients.list",
      kind: "crud",
      entity: "Client",
      op: "list",
      method: "GET",
      path: "/clients",
      auth: "user",
      scope: "owner",
      pagination: { defaultLimit: 20, maxLimit: 100 },
    },
    { id: "clients.get", kind: "crud", entity: "Client", op: "get", method: "GET", path: "/clients/:id", auth: "user", scope: "owner" },
    { id: "clients.create", kind: "crud", entity: "Client", op: "create", method: "POST", path: "/clients", auth: "user", scope: "owner" },
    { id: "clients.update", kind: "crud", entity: "Client", op: "update", method: "PATCH", path: "/clients/:id", auth: "user", scope: "owner" },
    { id: "clients.delete", kind: "crud", entity: "Client", op: "delete", method: "DELETE", path: "/clients/:id", auth: "user", scope: "owner" },

    // Invoices
    {
      id: "invoices.list",
      kind: "crud",
      entity: "Invoice",
      op: "list",
      method: "GET",
      path: "/invoices",
      auth: "user",
      scope: "owner",
      pagination: { defaultLimit: 20, maxLimit: 100 },
    },
    { id: "invoices.get", kind: "crud", entity: "Invoice", op: "get", method: "GET", path: "/invoices/:id", auth: "user", scope: "owner" },
    { id: "invoices.create", kind: "crud", entity: "Invoice", op: "create", method: "POST", path: "/invoices", auth: "user", scope: "owner" },
    { id: "invoices.update", kind: "crud", entity: "Invoice", op: "update", method: "PATCH", path: "/invoices/:id", auth: "user", scope: "owner" },
    { id: "invoices.delete", kind: "crud", entity: "Invoice", op: "delete", method: "DELETE", path: "/invoices/:id", auth: "user", scope: "owner" },

    // Line items: collection routes nested under the invoice, member routes flat.
    { id: "lineItems.list", kind: "crud", entity: "LineItem", op: "list", method: "GET", path: "/invoices/:invoiceId/line-items", auth: "user", scope: "owner" },
    { id: "lineItems.create", kind: "crud", entity: "LineItem", op: "create", method: "POST", path: "/invoices/:invoiceId/line-items", auth: "user", scope: "owner" },
    { id: "lineItems.update", kind: "crud", entity: "LineItem", op: "update", method: "PATCH", path: "/line-items/:id", auth: "user", scope: "owner" },
    { id: "lineItems.delete", kind: "crud", entity: "LineItem", op: "delete", method: "DELETE", path: "/line-items/:id", auth: "user", scope: "owner" },

    // Custom: `entity` makes the handler load + owner-check the invoice before the slot runs.
    { id: "invoices.send", kind: "custom", method: "POST", path: "/invoices/:invoiceId/send", auth: "user", entity: "Invoice", slot: "sendInvoice" },
    { id: "invoices.pdf", kind: "custom", method: "GET", path: "/invoices/:invoiceId/pdf", auth: "user", entity: "Invoice", slot: "renderInvoicePdf" },
    { id: "invoices.markPaid", kind: "custom", method: "POST", path: "/invoices/:invoiceId/mark-paid", auth: "user", entity: "Invoice", slot: "markInvoicePaid" },
  ],

  jobs: [
    {
      id: "reminderWorker",
      trigger: { kind: "cron", schedule: "*/5 * * * *" },
      slot: "processDueReminders",
      retries: 3,
      idempotencyKey: "Reminder.idempotencyKey",
    },
  ],

  pages: [
    { id: "login", route: "/login", auth: "public", layout: "form", uses: ["auth.login"] },
    { id: "register", route: "/register", auth: "public", layout: "form", uses: ["auth.register"] },

    { id: "clients", route: "/clients", auth: "user", layout: "list", uses: ["clients.list", "clients.delete"] },
    { id: "clientNew", route: "/clients/new", auth: "user", layout: "form", uses: ["clients.create"] },
    { id: "clientEdit", route: "/clients/:id/edit", auth: "user", layout: "form", uses: ["clients.get", "clients.update"] },

    { id: "invoices", route: "/invoices", auth: "user", layout: "list", uses: ["invoices.list", "invoices.delete"] },
    // clients.list feeds the client picker for the `client` relation.
    { id: "invoiceNew", route: "/invoices/new", auth: "user", layout: "form", uses: ["invoices.create", "clients.list"] },
    {
      id: "invoiceDetail",
      route: "/invoices/:id",
      auth: "user",
      layout: "detail",
      uses: ["invoices.get", "lineItems.list", "invoices.send", "invoices.pdf", "invoices.markPaid"],
    },
    {
      id: "invoiceEditor",
      route: "/invoices/:id/edit",
      auth: "user",
      layout: "custom",
      slot: "invoiceEditor",
      uses: ["invoices.get", "invoices.update", "clients.list", "lineItems.list", "lineItems.create", "lineItems.update", "lineItems.delete"],
    },
  ],

  slots: [
    {
      id: "sendInvoice",
      intent:
        "Only a DRAFT invoice can be sent. Render its PDF, email it to the client via Resend, " +
        "set status SENT and sentAt, and create PENDING reminders (e.g. on the due date and every 7 days after) " +
        "each with a unique idempotencyKey, all in one transaction.",
      inputs: [{ name: "invoiceId", type: "uuid", required: true }],
      output: { kind: "entity", entity: "Invoice" },
    },
    {
      id: "renderInvoicePdf",
      intent:
        "Render the invoice as a PDF: client details, line items " +
        "(quantity × unitPrice), and the total, formatted in the invoice currency from minor units.",
      inputs: [{ name: "invoiceId", type: "uuid", required: true }],
      output: { kind: "binary", contentType: "application/pdf" },
    },
    {
      id: "markInvoicePaid",
      intent:
        "Mark a SENT invoice as PAID and set paidAt. " +
        "Its PENDING reminders become SKIPPED.",
      inputs: [{ name: "invoiceId", type: "uuid", required: true }],
      output: { kind: "entity", entity: "Invoice" },
    },
    {
      id: "processDueReminders",
      intent:
        "Postgres is the source of truth; no queue. Claim due PENDING reminders (scheduledAt <= now) with " +
        "SELECT ... FOR UPDATE SKIP LOCKED. Immediately before sending, re-check the invoice: if PAID or CANCELLED, " +
        "mark the reminder SKIPPED. Otherwise send via Resend using idempotencyKey as the provider idempotency key, " +
        "then set SENT and sentAt. On failure increment attempts and store lastError; after the job's retries, mark FAILED.",
      output: { kind: "void" },
    },
    {
      id: "invoiceEditor",
      intent:
        "Edit an invoice's fields and its line items inline on one screen (add, edit, remove rows), " +
        "showing a running total computed from quantity × unitPrice.",
    },
  ],
});
