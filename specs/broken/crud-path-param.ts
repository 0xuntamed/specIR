import { defineSpec } from "../../src/ir/types";

// :groupId isn't a relation of Thing, and a list can't take :id.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [] }],
  endpoints: [
    { id: "things.byGroup", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/groups/:groupId/things", auth: "public", scope: "all" },
    { id: "things.list", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/things/:id", auth: "public", scope: "all" },
  ],
});
