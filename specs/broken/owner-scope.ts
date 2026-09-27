import { defineSpec } from "../../src/ir/types";

// Rule 15: owner scope on an entity that isn't owned and on a public endpoint;
// a public custom endpoint loading an owned entity.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },
  entities: [
    { name: "User", fields: [{ name: "email", type: "email", required: true, unique: true }] },
    { name: "Thing", fields: [] },
    { name: "Note", owned: true, fields: [] },
  ],
  endpoints: [
    { id: "things.list", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/things", auth: "user", scope: "owner" },
    { id: "notes.list", kind: "crud", entity: "Note", op: "list", method: "GET", path: "/notes", auth: "public", scope: "owner" },
    { id: "notes.preview", kind: "custom", method: "GET", path: "/notes/:noteId/preview", auth: "public", entity: "Note", slot: "preview" },
  ],
  slots: [{ id: "preview", intent: "Render a note preview.", inputs: [{ name: "noteId", type: "uuid", required: true }] }],
});
