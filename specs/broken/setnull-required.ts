import { defineSpec } from "../../src/ir/types";

// A required foreign key can't be set to null when its parent is deleted.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [
    { name: "Parent", fields: [] },
    {
      name: "Child",
      fields: [],
      relations: [{ name: "parent", kind: "belongsTo", target: "Parent", required: true, onDelete: "setNull" }],
    },
  ],
});
