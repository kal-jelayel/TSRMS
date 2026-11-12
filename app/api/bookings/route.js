import { requireStaffSession } from "@/lib/auth/staffSession";
import { apiFailure, json, readJson } from "@/lib/server/apiResponse";
import { createBooking, readBookings } from "@/lib/server/bookings";

export async function GET(request) {
  try {
    const { db } = await requireStaffSession(request.headers.get("x-tsrms-account"));
    return json(await readBookings(db));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { db } = await requireStaffSession(request.headers.get("x-tsrms-account"));
    return json(await createBooking(db, await readJson(request)), 201);
  } catch (error) {
    return apiFailure(error);
  }
}
