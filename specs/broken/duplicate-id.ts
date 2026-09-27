import { defineSpec } from "../../src/ir/types";

// Rule 1: a repeated entity, a repeated field, and a field that collides with
// the foreign key of relation `thing`.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [
    { name: "Thing", fields: [] },
    { name: "Thing", fields: [] },
    {
      name: "Item",
      fields: [
        { name: "title", type: "string" },
        { name: "title", type: "text" },
        { name: "thingId", type: "uuid" },
      ],
      relations: [{ name: "thing", kind: "belongsTo", target: "Thing" }],
    },
  ],
});
