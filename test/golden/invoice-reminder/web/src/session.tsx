// @appspec:generated — do not edit
import { useSyncExternalStore, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export const HOME = "/clients";
const KEY = "invoice-reminder.token";
const listeners = new Set<() => void>();
let token = read();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// The bearer token, kept in localStorage so a reload stays signed in.
export const session = {
  token: (): string | null => token,
  set(next: string | null): void {
    token = next;
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable (private mode): the session lasts until reload.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useToken(): string | null {
  return useSyncExternalStore(session.subscribe, session.token);
}

// Only same-app paths, so ?next= can't send users elsewhere.
export function nextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : HOME;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useToken();
  const location = useLocation();
  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={"/login" + "?next=" + next} replace />;
  }
  return children;
}
