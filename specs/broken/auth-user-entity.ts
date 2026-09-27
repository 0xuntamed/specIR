import { defineSpec } from "../../src/ir/types";

// Rule 4: User's email isn't unique, so it can't identify a login.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },
  entities: [{ name: "User", fields: [{ name: "email", type: "email", required: true }] }],
});
