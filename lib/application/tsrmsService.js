import { BOOKING_STATUS, SCHEDULE_STATUS } from "@/lib/domain/constants";
import { hasAvailableSeats, matchesRoute } from "@/lib/domain/validators";
import { seedData } from "@/lib/infrastructure/seedData";

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function initializeState() {
  return clone(seedData);
}

export function createSchedule(state, payload) {
  const next = clone(state);
  const schedule = {
    id: uid("S"),
    trainName: payload.trainName,
    origin: payload.origin,
    destination: payload.destination,
    departureDate: payload.departureDate,
    departureTime: payload.departureTime,
    departureDateTime: `${payload.departureDate}T${payload.departureTime}`,
    price: Number(payload.price),
    totalSeats: Number(payload.totalSeats),
    availableSeats: Number(payload.totalSeats),
    status: SCHEDULE_STATUS.ACTIVE,
  };
  next.schedules.unshift(schedule);
  return next;
}

export function updateSchedule(state, scheduleId, updates) {
  const next = clone(state);
  const schedule = next.schedules.find((item) => item.id === scheduleId);
  if (!schedule) throw new Error("Schedule not found.");

  const newTotal = Number(updates.totalSeats ?? schedule.totalSeats);
  const booked = schedule.totalSeats - schedule.availableSeats;
  if (newTotal < booked) {
    throw new Error("Total seats cannot be lower than already booked seats.");
  }

  schedule.trainName = updates.trainName ?? schedule.trainName;
  schedule.origin = updates.origin ?? schedule.origin;
  schedule.destination = updates.destination ?? schedule.destination;
  schedule.departureDate = updates.departureDate ?? schedule.departureDate;
  schedule.departureTime = updates.departureTime ?? schedule.departureTime;
  schedule.departureDateTime = `${schedule.departureDate}T${schedule.departureTime}`;
  schedule.price = Number(updates.price ?? schedule.price);
  schedule.totalSeats = newTotal;
  schedule.availableSeats = newTotal - booked;
  return next;
}

export function deleteSchedule(state, scheduleId) {
  const next = clone(state);
  const hasConfirmedBookings = next.bookings.some(
    (item) =>
      item.scheduleId === scheduleId && item.status === BOOKING_STATUS.CONFIRMED
  );
  if (hasConfirmedBookings) {
    throw new Error("Cannot delete schedule with confirmed bookings.");
  }
  next.schedules = next.schedules.filter((item) => item.id !== scheduleId);
  return next;
}

export function registerPassenger(state, payload) {
  const next = clone(state);
  const exists = next.passengers.find((p) => p.nationalId === payload.nationalId);
  if (exists) {
    exists.fullName = payload.fullName;
    exists.phone = payload.phone;
    return { next, passenger: exists };
  }
  const passenger = {
    id: uid("P"),
    nationalId: payload.nationalId,
    fullName: payload.fullName,
    phone: payload.phone,
    bookingHistory: [],
  };
  next.passengers.unshift(passenger);
  return { next, passenger };
}

export function searchSchedules(state, route) {
  return state.schedules.filter(
    (item) =>
      item.status === SCHEDULE_STATUS.ACTIVE && matchesRoute(item, route, route.date)
  );
}

export function reserveTicket(state, payload) {
  const next = clone(state);
  const schedule = next.schedules.find((item) => item.id === payload.scheduleId);
  if (!schedule || schedule.status !== SCHEDULE_STATUS.ACTIVE) {
    throw new Error("No active schedule found.");
  }
  if (!hasAvailableSeats(schedule, payload.seats)) {
    throw new Error("Insufficient seats.");
  }

  const result = registerPassenger(next, payload.passenger);
  const withPassenger = result.next;
  const passenger = result.passenger;
  const editableSchedule = withPassenger.schedules.find(
    (item) => item.id === payload.scheduleId
  );
  editableSchedule.availableSeats -= payload.seats;

  const booking = {
    id: uid("B"),
    confirmationCode: `CNF-${Date.now().toString().slice(-6)}`,
    scheduleId: payload.scheduleId,
    passengerId: passenger.id,
    seats: payload.seats,
    totalPrice: payload.seats * Number(editableSchedule.price),
    status: BOOKING_STATUS.CONFIRMED,
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    cancellationReason: null,
  };
  withPassenger.bookings.unshift(booking);
  passenger.bookingHistory.unshift(booking.id);
  return { next: withPassenger, booking };
}

export function getDashboardStats(state) {
  const totalSchedules = state.schedules.length;
  const activeSchedules = state.schedules.filter(
    (item) => item.status === SCHEDULE_STATUS.ACTIVE
  ).length;
  const confirmedBookings = state.bookings.filter(
    (item) => item.status === BOOKING_STATUS.CONFIRMED
  );
  const cancelledBookings = state.bookings.filter(
    (item) => item.status === BOOKING_STATUS.CANCELLED
  );
  const totalRevenue = confirmedBookings.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalSeats = state.schedules.reduce((sum, item) => sum + item.totalSeats, 0);
  const usedSeats = state.schedules.reduce(
    (sum, item) => sum + (item.totalSeats - item.availableSeats),
    0
  );
  const seatOccupancyRate = totalSeats ? ((usedSeats / totalSeats) * 100).toFixed(1) : "0.0";

  return {
    totalSchedules,
    activeSchedules,
    totalPassengers: state.passengers.length,
    totalBookings: state.bookings.length,
    confirmedBookings: confirmedBookings.length,
    cancelledBookings: cancelledBookings.length,
    totalRevenue,
    seatOccupancyRate,
  };
}
