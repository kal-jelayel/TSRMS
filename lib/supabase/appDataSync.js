import { requestTsrms } from "@/lib/application/tsrmsApi";
import { fetchSchedulesFromSupabase } from "@/lib/supabase/schedules";
import { classifyFailure } from "./contingency.mjs";

export async function fetchSupabaseAppSnapshot(user) {
  const results = await Promise.allSettled([
    fetchSchedulesFromSupabase(),
    requestTsrms("/api/bookings", { accountId: user.id }),
  ]);
  // A parallel network failure must not hide an expired session.
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw errors.find((error) => classifyFailure(error) === "authorization")
    ?? errors.find((error) => classifyFailure(error) === "other") ?? errors[0];
  const [schedules, records] = results.map((result) => result.value);
  return { schedules, ...records };
}
