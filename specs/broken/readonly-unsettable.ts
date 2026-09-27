import { defineSpec } from "../../src/ir/types";

// Thing.code is required, readOnly and has no default, but there's a create endpoint.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },
  entities: [
    { name: "User", fields: [{ name: "email", type: "email", required: true, unique: true }] },
    { name: "Thing", fields: [{ name: "code", type: "string", required: true, readOnly: true }] },
  ],
  endpoints: [
    { id: "things.create", kind: "crud", entity: "Thing", op: "create", method: "POST", path: "/things", auth: "user", scope: "all" },
  ],
});
