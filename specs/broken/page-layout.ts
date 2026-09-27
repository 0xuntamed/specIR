import { defineSpec } from "../../src/ir/types";

// A list page with two lists, a form that both creates and updates, a detail
// page without a get, and a nested list page whose route lacks :groupId.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  auth: { strategy: "email_password_jwt", userEntity: "User" },
  entities: [
    { name: "User", fields: [{ name: "email", type: "email", required: true, unique: true }] },
    { name: "Group", fields: [] },
    { name: "Thing", fields: [], relations: [{ name: "group", kind: "belongsTo", target: "Group" }] },
  ],
  endpoints: [
    { id: "groups.list", kind: "crud", entity: "Group", op: "list", method: "GET", path: "/groups", auth: "user", scope: "all" },
    { id: "things.list", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/things", auth: "user", scope: "all" },
    { id: "things.byGroup", kind: "crud", entity: "Thing", op: "list", method: "GET", path: "/groups/:groupId/things", auth: "user", scope: "all" },
    { id: "things.create", kind: "crud", entity: "Thing", op: "create", method: "POST", path: "/things", auth: "user", scope: "all" },
    { id: "things.update", kind: "crud", entity: "Thing", op: "update", method: "PATCH", path: "/things/:id", auth: "user", scope: "all" },
  ],
  pages: [
    { id: "everything", route: "/everything", auth: "user", layout: "list", uses: ["groups.list", "things.list"] },
    { id: "thingForm", route: "/things/:id/form", auth: "user", layout: "form", uses: ["things.create", "things.update"] },
    { id: "thing", route: "/things/:id", auth: "user", layout: "detail", uses: ["things.list"] },
    { id: "groupThings", route: "/group-things", auth: "user", layout: "list", uses: ["things.byGroup"] },
  ],
});
