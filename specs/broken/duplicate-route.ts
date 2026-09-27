import { defineSpec } from "../../src/ir/types";

// Rule 8: /things/:id and /things/:thingId are the same route to a router;
// two pages share /things.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [] }],
  endpoints: [
    { id: "things.get", kind: "crud", entity: "Thing", op: "get", method: "GET", path: "/things/:id", auth: "public", scope: "all" },
    { id: "things.peek", kind: "custom", method: "GET", path: "/things/:thingId", auth: "public", slot: "peek" },
  ],
  pages: [
    { id: "first", route: "/things", auth: "public", layout: "list" },
    { id: "second", route: "/things", auth: "public", layout: "list" },
  ],
  slots: [{ id: "peek", intent: "Return a thing without counting a view.", inputs: [{ name: "thingId", type: "uuid", required: true }] }],
});
