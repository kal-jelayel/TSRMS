import { CANCELLATION_WINDOW_MINUTES } from "@/lib/domain/constants";

export function matchesRoute(schedule, route, date) {
  return (
    schedule.origin.toLowerCase() === route.origin.toLowerCase() &&
    schedule.destination.toLowerCase() === route.destination.toLowerCase() &&
    schedule.departureDate === date
  );
}

export function canCancelSchedule(departureDateTimeISO, now = new Date()) {
  const departure = new Date(departureDateTimeISO);
  const cutoff = new Date(
    departure.getTime() - CANCELLATION_WINDOW_MINUTES * 60 * 1000
  );
  return now <= cutoff;
}

export function hasAvailableSeats(schedule, seats = 1) {
  return schedule.availableSeats >= seats;
}

export function isSchedulePast(departureDateTimeISO, now = new Date()) {
  return new Date(departureDateTimeISO) < now;
}
