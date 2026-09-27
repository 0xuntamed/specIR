import { defineSpec } from "../../src/ir/types";

// Rule 7: delete over GET, pagination on a get, and an unknown entity.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Thing", fields: [] }],
  endpoints: [
    { id: "things.remove", kind: "crud", entity: "Thing", op: "delete", method: "GET", path: "/things/:id", auth: "public", scope: "all" },
    {
      id: "things.view",
      kind: "crud",
      entity: "Thing",
      op: "get",
      method: "GET",
      path: "/things/:id/view",
      auth: "public",
      scope: "all",
      pagination: { defaultLimit: 20, maxLimit: 100 },
    },
    { id: "ghosts.list", kind: "crud", entity: "Ghost", op: "list", method: "GET", path: "/ghosts", auth: "public", scope: "all" },
  ],
});
