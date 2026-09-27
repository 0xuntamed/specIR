// @appspec:generated — do not edit
import { createApiClient } from "../../contract/client";
import { session } from "./session";

export type * from "../../contract/client";
export { ApiError } from "../../contract/client";

// Same origin: nginx (and the Vite dev server) proxy /api to the backend.
export const api = createApiClient({
  baseUrl: "/api",
  token: () => session.token(),
  // A rejected token signs the user out; RequireAuth then redirects to login.
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 401 && session.token()) session.set(null);
    return response;
  },
});
