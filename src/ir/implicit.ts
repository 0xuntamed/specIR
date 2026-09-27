import type { Access } from "./types";

// Endpoints every spec with an `auth` block gets without declaring them.
// The `auth.` id prefix is reserved for these.
export const AUTH_ENDPOINTS: { id: string; method: "GET" | "POST"; path: string; auth: Access }[] = [
  { id: "auth.register", method: "POST", path: "/auth/register", auth: "public" },
  { id: "auth.login", method: "POST", path: "/auth/login", auth: "public" },
  { id: "auth.me", method: "GET", path: "/auth/me", auth: "user" },
];
