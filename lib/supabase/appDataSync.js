import { mapBookingRow } from "@/lib/supabase/reservations";
import { fetchSchedulesFromSupabase } from "@/lib/supabase/schedules";
import { supabase } from "@/lib/supabase/client";

/**
 * Loads schedules, reservations, and passengers from Supabase in parallel.
 * Passenger `bookingHistory` is derived from reservation rows (newest first).
 */
export async function fetchSupabaseAppSnapshot() {
  const [schedules, reservationsResult, passengersResult] = await Promise.all([
    fetchSchedulesFromSupabase(),
    supabase.from("reservations").select("*").order("created_at", { ascending: false }),
    supabase.from("passengers").select("*").order("created_at", { ascending: false }),
  ]);

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
