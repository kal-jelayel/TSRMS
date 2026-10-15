import { normalizeAppRole } from "@/lib/auth/roles";
import { contingency } from "@/lib/supabase/contingency.mjs";

const SESSION_USER_KEY = "tsrms-session-user";

/**
 * Persists minimal session info (no password) so client routes like /schedules can return to / without losing login.
 */
export function persistSessionUser(user) {
  if (typeof window === "undefined" || !user) return;
  contingency.setUser(user);
  const safe = {
    id: user.id,
    username: user.username,
    role: normalizeAppRole(user.role) || user.role,
  };
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(safe));
}

export function readSessionUser() {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSessionUser() {
  contingency.clear();
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_USER_KEY);
}
