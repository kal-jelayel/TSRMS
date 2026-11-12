import { requestTsrms } from "@/lib/application/tsrmsApi";
import { contingency } from "@/lib/supabase/contingency.mjs";

export async function signInWithUsersTable(username, password) {
  const user = await requestTsrms("/api/session", { method: "POST", body: { username, password } });
  contingency.setUser(user);
  return user;
}

export async function readSessionUser() {
  try {
    return await requestTsrms("/api/session");
  } catch (error) {
    if (error.status !== 401) throw error;
    contingency.clear();
    return null;
  }
}

export async function clearSessionUser() {
  await requestTsrms("/api/session", { method: "DELETE" });
  contingency.clear();
}
