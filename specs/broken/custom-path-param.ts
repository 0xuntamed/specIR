import { defineSpec } from "../../src/ir/types";

// :thingId isn't an input of slot `report`; `things.summary` guards entity
// Thing but its path has :id instead of :thingId.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [] }],
  endpoints: [
    { id: "things.report", kind: "custom", method: "GET", path: "/things/:thingId/report", auth: "public", slot: "report" },
    { id: "things.summary", kind: "custom", method: "GET", path: "/things/:id/summary", auth: "public", entity: "Thing", slot: "summary" },
  ],
  slots: [
    { id: "report", intent: "Build a report for a thing." },
    { id: "summary", intent: "Summarize a thing.", inputs: [{ name: "id", type: "uuid", required: true }] },
  ],
});
