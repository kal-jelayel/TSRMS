import { supabase } from "@/lib/supabase/client";
import { contingency } from "./contingency.mjs";

const TABLE = "schedules";

/**
 * Maps a Supabase row (snake_case) to the app schedule shape (camelCase).
 */
export function mapRowToSchedule(row) {
  const departureDate = row.departure_date;
  const departureTime =
    row.departure_time ??
    (typeof row.departure_datetime === "string"
      ? row.departure_datetime.slice(11, 16)
      : "00:00");
  const departureDateTime =
    row.departure_datetime != null && typeof row.departure_datetime === "string"
      ? row.departure_datetime.slice(0, 16)
      : `${departureDate}T${departureTime}`;

  return {
    id: row.id,
    trainName: row.train_name,
    origin: row.origin,
    destination: row.destination,
    departureDate,
    departureTime,
    departureDateTime,
    price: Number(row.price),
    totalSeats: Number(row.total_seats),
    availableSeats: Number(row.available_seats),
    status: row.status ?? "ACTIVE",
  };
}

function mapFormToInsertRow(form) {
  const totalSeats = Number(form.totalSeats);
  const time = form.departureTime.length === 5 ? `${form.departureTime}:00` : form.departureTime;
  return {
    train_name: form.trainName.trim(),
    origin: form.origin.trim(),
    destination: form.destination.trim(),
    departure_date: form.departureDate,
    departure_time: form.departureTime,
    departure_datetime: `${form.departureDate}T${time}`,
    price: Number(form.price),
    total_seats: totalSeats,
    available_seats: totalSeats,
    status: "ACTIVE",
  };
}

export async function fetchSchedulesFromSupabase() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("departure_date", { ascending: true })
    .order("departure_time", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRowToSchedule);
}

export async function insertScheduleInSupabase(form) {
  return contingency.runWrite(async (beforeMutation) => {
    const row = mapFormToInsertRow(form);
    beforeMutation();
    const { data, error } = await supabase.from(TABLE).insert(row).select("*").maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Schedule could not be created.");
    return mapRowToSchedule(data);
  });
}

export async function deleteScheduleFromSupabase(id) {
  return contingency.runWrite(async (beforeMutation) => {
    beforeMutation();
    const { data, error } = await supabase.from(TABLE).delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Deletion was not confirmed. Refresh and verify the schedule.");
  });
}
