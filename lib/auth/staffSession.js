import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { normalizeAppRole, ROLE_ADMIN, ROLE_STAFF } from "@/lib/auth/roles";
import { ApiError } from "@/lib/server/apiResponse";
import { verifyStaffPassword } from "@/lib/security/staffPassword";
import { createServerSupabase } from "@/lib/supabase/server";

const cookieName = "tsrms-staff-session";
const sessionSeconds = 8 * 60 * 60;
const userColumns = "id, username, role, password";

function sign(value) {
  const secret = process.env.TSRMS_SESSION_SECRET;
  if (!/^[a-f0-9]{64}$/i.test(secret ?? "")) {
    throw new Error("TSRMS_SESSION_SECRET must contain 64 hexadecimal characters.");
  }
  return createHmac("sha256", Buffer.from(secret, "hex")).update(value).digest("base64url");
}

function publicUser(row) {
  const role = normalizeAppRole(row?.role);
  if (role !== ROLE_ADMIN && role !== ROLE_STAFF) return null;
  return { id: String(row.id), username: row.username, role };
}

export async function signIn(username, password) {
  const userName = typeof username === "string" ? username.trim() : "";
  const pass = typeof password === "string" ? password.trim() : "";
  const invalid = new ApiError(401, "Incorrect username or password.");
  if (!userName || !pass || userName.length > 256 || pass.length > 256) throw invalid;

  const db = createServerSupabase();
  const { data: row, error } = await db.from("users").select(userColumns)
    .eq("username", userName).limit(1).maybeSingle();
  if (error) throw error;
  const passwordMatches = await verifyStaffPassword(pass, row?.password);
  const user = publicUser(row);
  if (!passwordMatches || !user) throw invalid;

  // A password reset invalidates any sessions issued with the previous password.
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    exp: Math.floor(Date.now() / 1000) + sessionSeconds,
    credential: sign(`password:${row.password}`),
  })).toString("base64url");
  const store = await cookies();
  store.set(cookieName, `${payload}.${sign(`session:${payload}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: sessionSeconds,
  });
  return user;
}

export async function requireStaffSession(expectedId) {
  const invalid = new ApiError(401, "Sign in again to access this data.");
  const token = (await cookies()).get(cookieName)?.value ?? "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) throw invalid;
  const expected = Buffer.from(sign(`session:${payload}`));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalid;

  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (session.exp <= Math.floor(Date.now() / 1000) ||
      (expectedId !== undefined && expectedId !== session.id)) throw invalid;

  const db = createServerSupabase();
  const { data: row, error } = await db.from("users").select(userColumns)
    .eq("id", session.id).maybeSingle();
  if (error) throw error;
  const user = publicUser(row);
  if (!user || session.credential !== sign(`password:${row.password}`)) throw invalid;
  return { db, user };
}

export async function signOut() {
  (await cookies()).delete(cookieName);
}
