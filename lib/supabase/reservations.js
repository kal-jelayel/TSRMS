import { BOOKING_STATUS } from "@/lib/domain/constants";
import { canCancelSchedule } from "@/lib/domain/validators";
import { supabase } from "@/lib/supabase/client";

function buildConfirmationCode() {
  return `CNF-${Date.now().toString().slice(-6)}`;
}

function scheduleDepartureDateTime(row) {
  if (row.departure_datetime != null && typeof row.departure_datetime === "string") {
    return row.departure_datetime.slice(0, 16);
  }
  const d = row.departure_date;
  const t = row.departure_time ?? "00:00";
  return `${d}T${t.length === 5 ? t : t.slice(0, 5)}`;
}

export function mapBookingRow(row) {
  return {
    id: row.id,
    confirmationCode: row.confirmation_code,
    scheduleId: row.schedule_id,
    passengerId: row.passenger_id,
    seats: Number(row.seats),
    totalPrice: Number(row.total_price),
    status: row.status ?? BOOKING_STATUS.CONFIRMED,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    passengerFullName: row.full_name ?? "",
    passengerNationalId: row.national_id ?? "",
    passengerPhone: row.phone ?? "",
  };
}

function requirePassengerFields(passenger) {
  const nationalId = String(passenger.nationalId ?? "").trim();
  const fullName = String(passenger.fullName ?? "").trim();
  const phone = String(passenger.phone ?? "").trim();
  if (!nationalId || !fullName || !phone) {
    throw new Error("Passenger full name, national ID, and phone are required.");
  }
  return { nationalId, fullName, phone };
}

/**
 * Inserts passenger, inserts reservation (with denormalized passenger fields), then decrements
 * available_seats only after the reservation row exists (no seat change on failed insert).
 */
export async function completeReservationInSupabase({ scheduleId, seats, passenger }) {
  const seatsNum = Number(seats);
  if (!Number.isFinite(seatsNum) || seatsNum < 1) {
    throw new Error("Invalid seats.");
  }

  const { nationalId, fullName, phone } = requirePassengerFields(passenger);

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, available_seats, price, status, departure_date, departure_time, departure_datetime")
    .eq("id", scheduleId)
    .maybeSingle();

  if (scheduleError) throw scheduleError;
  if (!scheduleRow) throw new Error("No active schedule found.");
  if (scheduleRow.status !== "ACTIVE") throw new Error("No active schedule found.");
  if (Number(scheduleRow.available_seats) < seatsNum) {
    throw new Error("Insufficient seats.");
  }

  const { data: existingPassenger, error: findPassengerError } = await supabase
    .from("passengers")
    .select("id")
    .eq("national_id", nationalId)
    .maybeSingle();

  if (findPassengerError) throw findPassengerError;

  let passengerId;
  if (existingPassenger?.id) {
    passengerId = existingPassenger.id;
    const { error: updatePassengerError } = await supabase
      .from("passengers")
      .update({ full_name: fullName, phone })
      .eq("id", passengerId);
    if (updatePassengerError) throw updatePassengerError;
  } else {
    const { data: insertedPassenger, error: insertPassengerError } = await supabase
      .from("passengers")
      .insert({ national_id: nationalId, full_name: fullName, phone })
      .select("id")
      .maybeSingle();
    if (insertPassengerError) throw insertPassengerError;
    if (!insertedPassenger?.id) {
      throw new Error("Failed to register passenger.");
    }
    passengerId = insertedPassenger.id;
  }

  const totalPrice = seatsNum * Number(scheduleRow.price);
  const confirmationCode = buildConfirmationCode();

  const insertPayload = {
    schedule_id: scheduleId,
    passenger_id: passengerId,
    full_name: fullName,
    national_id: nationalId,
    phone,
    seats: seatsNum,
    total_price: totalPrice,
    confirmation_code: confirmationCode,
    status: BOOKING_STATUS.CONFIRMED,
  };

  const { data: reservationRow, error: reservationError } = await supabase
    .from("reservations")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();

  if (reservationError) {
    throw reservationError;
  }
  if (!reservationRow) {
    throw new Error("Reservation could not be created.");
  }

  const previousAvailable = Number(scheduleRow.available_seats);
  const newAvailable = previousAvailable - seatsNum;

  const { data: updatedSchedules, error: updateSeatsError } = await supabase
    .from("schedules")
    .update({ available_seats: newAvailable })
    .eq("id", scheduleId)
    .eq("available_seats", previousAvailable)
    .select("id, available_seats");

  if (updateSeatsError) {
    await supabase.from("reservations").delete().eq("id", reservationRow.id);
    throw updateSeatsError;
  }

  if (!updatedSchedules?.length) {
    await supabase.from("reservations").delete().eq("id", reservationRow.id);
    throw new Error("Seat availability changed. Please try again.");
  }

  return {
    booking: mapBookingRow(reservationRow),
    passenger: {
      id: passengerId,
      nationalId,
      fullName,
      phone,
    },
    newAvailableSeats: newAvailable,
  };
}

async function restoreSeatsForConfirmedBooking(scheduleId, seatsToRestore) {
  const { data: sch, error: schErr } = await supabase
    .from("schedules")
    .select("id, available_seats")
    .eq("id", scheduleId)
    .maybeSingle();
  if (schErr) throw schErr;
  if (!sch) throw new Error("Schedule not found.");
  const prev = Number(sch.available_seats);
  const next = prev + seatsToRestore;
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

export async function cancelReservationByConfirmationInSupabase(confirmationCode, reason = "") {
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

  await restoreSeatsForConfirmedBooking(booking.schedule_id, Number(booking.seats));

  return { confirmationCode: code, bookingId: booking.id };
}
