import { defineSpec } from "../../src/ir/types";

// Rule 14: Delivery.key isn't unique; Delivery.token doesn't exist.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Delivery", fields: [{ name: "key", type: "string", required: true }] }],
  jobs: [
    { id: "deliver", trigger: { kind: "cron", schedule: "*/5 * * * *" }, slot: "deliver", idempotencyKey: "Delivery.key" },
    { id: "redeliver", trigger: { kind: "cron", schedule: "0 * * * *" }, slot: "deliver", idempotencyKey: "Delivery.token" },
  ],
  slots: [{ id: "deliver", intent: "Deliver pending items." }],
});
