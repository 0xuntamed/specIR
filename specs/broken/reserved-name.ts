import { defineSpec } from "../../src/ir/types";

// A field named like a generated column, a relation whose FK would be
// `ownerId`, and an endpoint in the reserved auth. namespace.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [
    {
      name: "Thing",
      fields: [{ name: "createdAt", type: "datetime" }],
      relations: [{ name: "owner", kind: "belongsTo", target: "Thing" }],
    },
  ],
  endpoints: [{ id: "auth.logout", kind: "custom", method: "GET", path: "/logout", auth: "public", slot: "logout" }],
  slots: [{ id: "logout", intent: "Log the user out." }],
});
