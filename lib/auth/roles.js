export const ROLE_ADMIN = "ADMIN";
export const ROLE_STAFF = "STAFF";

/** Normalizes DB role string to ADMIN | STAFF (legacy AGENT maps to STAFF). */
export function normalizeAppRole(role) {
  if (!role || typeof role !== "string") return null;
  const r = role.trim().toUpperCase();
  if (r === ROLE_ADMIN) return ROLE_ADMIN;
  if (r === ROLE_STAFF || r === "AGENT") return ROLE_STAFF;
  return r;
}

export function isAdminRole(role) {
  return normalizeAppRole(role) === ROLE_ADMIN;
}
