import { defineSpec } from "../src/ir/types";

// Simplicity check: plain owner-scoped CRUD, zero slots.
export default defineSpec({
  app: { name: "notes", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },

  entities: [
    {
      name: "User",
      fields: [{ name: "email", type: "email", required: true, unique: true }],
    },
    {
      name: "Note",
      owned: true,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "body", type: "text" },
        { name: "pinned", type: "bool", required: true, default: false },
      ],
    },
  ],

  endpoints: [
    {
      id: "notes.list",
      kind: "crud",
      entity: "Note",
      op: "list",
      method: "GET",
      path: "/notes",
      auth: "user",
      scope: "owner",
      pagination: { defaultLimit: 20, maxLimit: 100 },
    },
    { id: "notes.get", kind: "crud", entity: "Note", op: "get", method: "GET", path: "/notes/:id", auth: "user", scope: "owner" },
    { id: "notes.create", kind: "crud", entity: "Note", op: "create", method: "POST", path: "/notes", auth: "user", scope: "owner" },
    { id: "notes.update", kind: "crud", entity: "Note", op: "update", method: "PATCH", path: "/notes/:id", auth: "user", scope: "owner" },
    { id: "notes.delete", kind: "crud", entity: "Note", op: "delete", method: "DELETE", path: "/notes/:id", auth: "user", scope: "owner" },
  ],

  pages: [
    { id: "login", route: "/login", auth: "public", layout: "form", uses: ["auth.login"] },
    { id: "register", route: "/register", auth: "public", layout: "form", uses: ["auth.register"] },
    { id: "notes", route: "/notes", auth: "user", layout: "list", uses: ["notes.list", "notes.delete"] },
    { id: "noteNew", route: "/notes/new", auth: "user", layout: "form", uses: ["notes.create"] },
    { id: "noteEdit", route: "/notes/:id/edit", auth: "user", layout: "form", uses: ["notes.get", "notes.update"] },
  ],
});
