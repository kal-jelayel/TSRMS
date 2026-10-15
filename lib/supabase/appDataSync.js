import { mapBookingRow } from "@/lib/supabase/reservations";
import { fetchSchedulesFromSupabase } from "@/lib/supabase/schedules";
import { supabase } from "@/lib/supabase/client";
import { classifyFailure } from "./contingency.mjs";

/**
 * Loads schedules, reservations, and passengers from Supabase in parallel.
 * Passenger `bookingHistory` is derived from reservation rows (newest first).
 */
export async function fetchSupabaseAppSnapshot() {
  const results = await Promise.allSettled([
    fetchSchedulesFromSupabase(),
    supabase.from("reservations").select("*").order("created_at", { ascending: false }),
    supabase.from("passengers").select("*").order("created_at", { ascending: false }),
  ]);

  // Inspect every result so a parallel network error cannot hide an access denial.
  const errors = results.flatMap((result) => result.status === "rejected"
    ? [result.reason] : result.value?.error ? [result.value.error] : []);
  if (errors.length) throw errors.find((error) => classifyFailure(error) === "authorization")
    ?? errors.find((error) => classifyFailure(error) === "other") ?? errors[0];
  const [schedules, reservationsResult, passengersResult] = results.map((result) => result.value);

  const { data: resRows, error: resErr } = reservationsResult;
  if (resErr) throw resErr;
  const { data: paxRows, error: paxErr } = passengersResult;
  if (paxErr) throw paxErr;

  const rows = resRows ?? [];
  const bookings = rows.map(mapBookingRow);

  const historyByPassenger = new Map();
  for (const row of rows) {
    const pid = row.passenger_id;
    if (!historyByPassenger.has(pid)) historyByPassenger.set(pid, []);
    historyByPassenger.get(pid).push(row.id);
  }

  const passengers = (paxRows ?? []).map((row) => ({
    id: row.id,
    nationalId: row.national_id,
    fullName: row.full_name,
    phone: row.phone,
    bookingHistory: historyByPassenger.get(row.id) ?? [],
  }));

  return { schedules, passengers, bookings };
}
