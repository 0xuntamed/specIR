import { defineSpec } from "../../src/ir/types";

// Rule 13: not 5 fields, and hour 25.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [],
  jobs: [
    { id: "often", trigger: { kind: "cron", schedule: "every 5 minutes" }, slot: "tick" },
    { id: "late", trigger: { kind: "cron", schedule: "0 25 * * *" }, slot: "tock" },
  ],
  slots: [
    { id: "tick", intent: "Do frequent work." },
    { id: "tock", intent: "Do late-night work." },
  ],
});
