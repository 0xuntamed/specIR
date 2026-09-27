import { defineSpec } from "../../src/ir/types";

// Rule 9.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [] }],
  endpoints: [{ id: "things.get", kind: "crud", entity: "Thing", op: "get", method: "GET", path: "/things", auth: "public", scope: "all" }],
});
