import { defineSpec } from "../../src/ir/types";

// Child has no belongsTo Parent, so Parent.children has no foreign key to read.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [
    { name: "Parent", fields: [], relations: [{ name: "children", kind: "hasMany", target: "Child" }] },
    { name: "Child", fields: [] },
  ],
});
