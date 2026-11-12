import "server-only";
import { randomInt } from "node:crypto";
import { BOOKING_STATUS } from "@/lib/domain/constants";
import { decryptPhone, encryptPhone, readPhoneEncryptionKey } from "@/lib/security/phoneEncryption";
import { ApiError } from "./apiResponse";

export async function readBookings(db) {
  const key = readPhoneEncryptionKey();
  const [reservations, profiles] = await Promise.all([
    db.from("reservations")
      .select("id, confirmation_code, schedule_id, passenger_id, seats, total_price, status, created_at, cancelled_at, cancellation_reason, full_name, national_id")
      .order("created_at", { ascending: false }),
    db.from("passengers").select("id, national_id, full_name, phone")
      .order("created_at", { ascending: false }),
  ]);
  if (reservations.error) throw reservations.error;
  if (profiles.error) throw profiles.error;

  const history = new Map();
  const bookings = reservations.data.map((row) => {
    if (!history.has(row.passenger_id)) history.set(row.passenger_id, []);
    history.get(row.passenger_id).push(row.id);
    return {
      id: row.id,
      confirmationCode: row.confirmation_code,
      scheduleId: row.schedule_id,
      passengerId: row.passenger_id,
      seats: Number(row.seats),
      totalPrice: Number(row.total_price),
      status: row.status ?? BOOKING_STATUS.CONFIRMED,
      createdAt: row.created_at,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      passengerFullName: row.full_name ?? "",
      passengerNationalId: row.national_id ?? "",
    };
  });

  const passengers = profiles.data.map((row) => ({
    id: row.id,
    nationalId: row.national_id,
    fullName: row.full_name,
    phone: row.phone == null ? "" : decryptPhone(row.phone, key),
    bookingHistory: history.get(row.id) ?? [],
  }));
  return { bookings, passengers };
}

export async function createBooking(db, body) {
  const { scheduleId, seats, passenger } = body ?? {};
  if (!Number.isInteger(seats) || seats < 1 || seats > 2147483647) {
    throw new ApiError(400, "Invalid seats.");
  }
  if (typeof scheduleId !== "string" || !scheduleId.trim()) {
    throw new ApiError(400, "Select a schedule first.");
  }
  const nationalId = typeof passenger?.nationalId === "string" ? passenger.nationalId.trim() : "";
  const fullName = typeof passenger?.fullName === "string" ? passenger.fullName.trim() : "";
  const phone = typeof passenger?.phone === "string" ? passenger.phone.trim() : "";
  if (!nationalId || !fullName || !phone) {
    throw new ApiError(400, "Passenger full name, national ID, and phone are required.");
  }
  const key = readPhoneEncryptionKey();
  const { data: confirmationCode, error } = await db.rpc("tsrms_create_reservation", {
    p_schedule_id: scheduleId.trim(),
    p_seats: seats,
    p_national_id: nationalId,
    p_full_name: fullName,
    p_passenger_phone: encryptPhone(phone, key),
    p_reservation_phone: encryptPhone(phone, key),
    p_code: `CNF-${String(randomInt(1_000_000)).padStart(6, "0")}`,
  });
  if (error?.code === "PT400") throw new ApiError(400, "Invalid seats.");
  if (error?.code === "PT409") throw new ApiError(409, error.message);
  if (error?.code === "23505") throw new ApiError(409, "Could not assign a booking code. Please try again.");
  if (error || !confirmationCode) throw error ?? new Error("Reservation not confirmed.");
  return { booking: { confirmationCode } };
}
