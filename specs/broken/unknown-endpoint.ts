import { defineSpec } from "../../src/ir/types";

// Rule 11: things.list doesn't exist, and auth.login only exists with an auth block.
export default defineSpec({
  app: { name: "broken", backend: "node", database: "postgres" },
  entities: [],
  pages: [{ id: "login", route: "/login", auth: "public", layout: "form", uses: ["auth.login", "things.list"] }],
});
