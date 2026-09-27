import { defineSpec } from "../../src/ir/types";

// Rule 5: an owned entity, an authed endpoint and an authed page, but no auth block.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [{ name: "Note", owned: true, fields: [] }],
  endpoints: [
    { id: "notes.list", kind: "crud", entity: "Note", op: "list", method: "GET", path: "/notes", auth: "user", scope: "all" },
  ],
  pages: [{ id: "notes", route: "/notes", auth: "user", layout: "list", uses: ["notes.list"] }],
});
