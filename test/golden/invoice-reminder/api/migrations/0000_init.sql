-- @appspec:generated — do not edit
-- Initial schema for invoice-reminder.

CREATE TABLE "user" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "name" text,
  "password_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_email_key" UNIQUE ("email")
);

CREATE TABLE "client" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE TABLE "invoice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "number" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "currency" text NOT NULL DEFAULT 'USD',
  "issue_date" date NOT NULL,
  "due_date" date NOT NULL,
  "notes" text,
  "sent_at" timestamptz,
  "paid_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "invoice_status_check" CHECK ("status" IN ('DRAFT', 'SENT', 'PAID', 'CANCELLED'))
);

CREATE TABLE "line_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "description" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "reminder" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" uuid NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "sent_at" timestamptz,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reminder_status_check" CHECK ("status" IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  CONSTRAINT "reminder_idempotency_key_key" UNIQUE ("idempotency_key")
);

ALTER TABLE "client" ADD CONSTRAINT "client_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user" ("id") ON DELETE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user" ("id") ON DELETE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client" ("id") ON DELETE RESTRICT;
ALTER TABLE "line_item" ADD CONSTRAINT "line_item_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user" ("id") ON DELETE CASCADE;
ALTER TABLE "line_item" ADD CONSTRAINT "line_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE CASCADE;
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE CASCADE;

CREATE INDEX "client_owner_id_idx" ON "client" ("owner_id");
CREATE INDEX "invoice_owner_id_idx" ON "invoice" ("owner_id");
CREATE INDEX "invoice_client_id_idx" ON "invoice" ("client_id");
CREATE INDEX "line_item_owner_id_idx" ON "line_item" ("owner_id");
CREATE INDEX "line_item_invoice_id_idx" ON "line_item" ("invoice_id");
CREATE INDEX "reminder_invoice_id_idx" ON "reminder" ("invoice_id");
