import { defineSpec } from "../../src/ir/types";

// Rule 6.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [] }],
  endpoints: [
    { id: "things.create", kind: "crud", entity: "Thing", op: "create", method: "POST", path: "/things", auth: "public", scope: "all" },
  ],
});
