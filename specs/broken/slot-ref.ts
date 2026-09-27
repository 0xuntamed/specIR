import { defineSpec } from "../../src/ir/types";

// Rule 10: a custom endpoint and a custom page without slots, a job naming a
// slot that doesn't exist, two jobs sharing one slot, and a list page that has a slot.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [],
  endpoints: [{ id: "reports.run", kind: "custom", method: "GET", path: "/reports", auth: "public" }],
  jobs: [
    { id: "nightly", trigger: { kind: "cron", schedule: "0 3 * * *" }, slot: "nightlyCleanup" },
    { id: "hourly", trigger: { kind: "cron", schedule: "0 * * * *" }, slot: "cleanup" },
    { id: "daily", trigger: { kind: "cron", schedule: "0 0 * * *" }, slot: "cleanup" },
  ],
  slots: [{ id: "cleanup", intent: "Delete expired rows." }],
  pages: [
    { id: "dashboard", route: "/", auth: "public", layout: "custom" },
    { id: "reports", route: "/reports", auth: "public", layout: "list", slot: "reportsTable", uses: ["reports.run"] },
  ],
});
