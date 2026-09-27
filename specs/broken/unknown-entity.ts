import { defineSpec } from "../../src/ir/types";

// A custom endpoint guard and a slot output name an entity that doesn't exist.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [],
  endpoints: [
    { id: "ghosts.haunt", kind: "custom", method: "GET", path: "/ghosts/:ghostId/haunt", auth: "public", entity: "Ghost", slot: "haunt" },
  ],
  slots: [
    {
      id: "haunt",
      intent: "Haunt a ghost.",
      inputs: [{ name: "ghostId", type: "uuid", required: true }],
      output: { kind: "entity", entity: "Ghost" },
    },
  ],
});
