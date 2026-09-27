import { defineSpec } from "../../src/ir/types";

// The endpoint requires a role that auth.roles doesn't declare.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User", roles: ["admin"] },
  entities: [
    { name: "User", fields: [{ name: "email", type: "email", required: true, unique: true }] },
    { name: "Thing", fields: [] },
  ],
  endpoints: [
    { id: "things.list", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/things", auth: { role: "editor" }, scope: "all" },
  ],
});
