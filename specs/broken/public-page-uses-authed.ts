import { defineSpec } from "../../src/ir/types";

// Rule 12 (warning): a public page calling a declared and an implicit authed endpoint.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },
  entities: [
    { name: "User", fields: [{ name: "email", type: "email", required: true, unique: true }] },
    { name: "Thing", fields: [] },
  ],
  endpoints: [{ id: "things.list", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/things", auth: "user", scope: "all" }],
  pages: [{ id: "home", route: "/", auth: "public", layout: "list", uses: ["things.list", "auth.me"] }],
});
