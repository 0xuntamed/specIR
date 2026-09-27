import { defineSpec } from "../../src/ir/types";

// Rule 3.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [{ name: "kind", type: "enum", values: [] }] }],
});
