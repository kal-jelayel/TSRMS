import { requestTsrms } from "@/lib/application/tsrmsApi";
import { BOOKING_STATUS } from "@/lib/domain/constants";
import { canCancelSchedule } from "@/lib/domain/validators";
import { supabase } from "@/lib/supabase/client";
import { contingency } from "./contingency.mjs";

function scheduleDepartureDateTime(row) {
  if (row.departure_datetime != null && typeof row.departure_datetime === "string") {
    return row.departure_datetime.slice(0, 16);
  }
  const d = row.departure_date;
  const t = row.departure_time ?? "00:00";
  return `${d}T${t.length === 5 ? t : t.slice(0, 5)}`;
}

export function completeReservationInSupabase(payload, accountId) {
  return contingency.runWrite((beforeMutation) => {
    beforeMutation();
    return requestTsrms("/api/bookings", { method: "POST", body: payload, accountId });
  });
}

async function restoreSeatsForConfirmedBooking(scheduleId, seatsToRestore, beforeMutation) {
  const { data: sch, error: schErr } = await supabase
    .from("schedules")
    .select("id, available_seats")
    .eq("id", scheduleId)
    .maybeSingle();
  if (schErr) throw schErr;
  if (!sch) throw new Error("Schedule not found.");
  const prev = Number(sch.available_seats);
  const next = prev + seatsToRestore;
  beforeMutation();
  const { data: updated, error: updErr } = await supabase
    .from("schedules")
    .update({ available_seats: next })
    .eq("id", scheduleId)
    .eq("available_seats", prev)
    .select("id, available_seats");
  if (updErr) throw updErr;
  if (!updated?.length) {
    throw new Error("Could not update seat count. Refresh and try again.");
  }
}

export function cancelReservationByConfirmationInSupabase(confirmationCode, reason = "") {
  return contingency.runWrite((beforeMutation) => cancelReservation(confirmationCode, reason, beforeMutation));
}

async function cancelReservation(confirmationCode, reason, beforeMutation) {
  const code = String(confirmationCode ?? "").trim();
  if (!code) throw new Error("Confirmation code required.");

  const { data: booking, error: bErr } = await supabase
    .from("reservations")
    .select("id, schedule_id, seats, status, confirmation_code")
    .eq("confirmation_code", code)
    .eq("status", BOOKING_STATUS.CONFIRMED)
    .maybeSingle();

  if (bErr) throw bErr;
  if (!booking) throw new Error("Booking not found.");

  const { data: sch, error: sErr } = await supabase
    .from("schedules")
    .select("id, departure_date, departure_time, departure_datetime")
    .eq("id", booking.schedule_id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!sch) throw new Error("Schedule not found.");

  const departureDateTime = scheduleDepartureDateTime(sch);
  if (!canCancelSchedule(departureDateTime)) {
    throw new Error("Cancellation period expired (less than 30 minutes).");
  }

  beforeMutation();
  const { data: updatedRows, error: updBook } = await supabase
    .from("reservations")
    .update({
      status: BOOKING_STATUS.CANCELLED,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason?.trim() || "No reason provided",
    })
    .eq("id", booking.id)
    .eq("status", BOOKING_STATUS.CONFIRMED)
    .select("id");

  if (updBook) throw updBook;
  if (!updatedRows?.length) {
    throw new Error("Booking not found or already cancelled.");
  }

  await restoreSeatsForConfirmedBooking(booking.schedule_id, Number(booking.seats), beforeMutation);

  return { confirmationCode: code, bookingId: booking.id };
}
