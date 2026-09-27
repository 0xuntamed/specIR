// @appspec:generated — do not edit outside @appspec:slot regions
import type { JobContext } from "../lib/context.js";
import { NotImplemented } from "../lib/errors.js";

// @appspec:slot processDueReminders:imports begin
// @appspec:slot processDueReminders:imports end

// Called by job reminderWorker on cron "*/5 * * * *", retried up to 3 times (ctx.job). Idempotency key: Reminder.idempotencyKey.
//
// Postgres is the source of truth; no queue. Claim due PENDING reminders (scheduledAt <= now) with
// SELECT ... FOR UPDATE SKIP LOCKED. Immediately before sending, re-check the invoice: if PAID or
// CANCELLED, mark the reminder SKIPPED. Otherwise send via Resend using idempotencyKey as the
// provider idempotency key, then set SENT and sentAt. On failure increment attempts and store
// lastError; after the job's retries, mark FAILED.
export async function processDueReminders(ctx: JobContext): Promise<void> {
  // @appspec:slot processDueReminders begin
  throw new NotImplemented("processDueReminders");
  // @appspec:slot processDueReminders end
}
