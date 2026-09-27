// @appspec:generated — do not edit
import type { FastifyBaseLogger } from "fastify";
import type { AuthUser } from "../auth.js";
import { type Db, db } from "../db/client.js";
import { sendEmail } from "../integrations/email.js";

// Everything a slot may use. Slots never check access: routes authenticate the
// user and load + owner-check guarded rows before calling them.
export type SlotContext = {
  db: Db;
  log: FastifyBaseLogger;
  user: AuthUser | null;
  email: { send: typeof sendEmail };
};

export function slotContext(log: FastifyBaseLogger, user: AuthUser | null): SlotContext {
  return { db, log, email: { send: sendEmail }, user };
}

export type JobContext = Omit<SlotContext, "user"> & {
  job: { id: string; attempt: number; retries: number };
};

export function jobContext(log: FastifyBaseLogger, job: JobContext["job"]): JobContext {
  return { db, log, email: { send: sendEmail }, job };
}
