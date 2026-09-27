import { defineSpec } from "../../src/ir/types";

// Rule 2.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [
    {
      name: "Thing",
      fields: [],
      relations: [{ name: "parent", kind: "belongsTo", target: "Missing" }],
    },
  ],
});
