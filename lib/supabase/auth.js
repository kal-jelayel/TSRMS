import { normalizeAppRole, ROLE_ADMIN, ROLE_STAFF } from "@/lib/auth/roles";
import { supabase } from "@/lib/supabase/client";

const USERS_TABLE = "users";

/**
 * Authenticates against the public.users table (username + password columns).
 * Fetches by username first, then compares password in-app (trimmed) so it matches
 * Supabase rows reliably (int8 ids, plain-text passwords, etc.).
 * Returns a session-safe user object (no password).
 */
export async function signInWithUsersTable(username, password) {
  const u = String(username ?? "").trim();
  const p = String(password ?? "").trim();
  if (!u || !p) {
    throw new Error("Incorrect username or password.");
  }

  const { data: rows, error } = await supabase
    .schema("public")
    .from(USERS_TABLE)
    .select("id, username, password, role")
    .eq("username", u)
    .limit(1);

  if (error) {
    throw new Error(error.message || "Login failed.");
  }

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    throw new Error("Incorrect username or password.");
  }

  const dbPassword = String(row.password ?? "").trim();
  if (dbPassword !== p) {
    throw new Error("Incorrect username or password.");
  }

  const role = normalizeAppRole(row.role);
  if (role !== ROLE_ADMIN && role !== ROLE_STAFF) {
    throw new Error("Incorrect username or password.");
  }

  return {
    id: row.id,
    username: row.username,
    role,
  };
}
