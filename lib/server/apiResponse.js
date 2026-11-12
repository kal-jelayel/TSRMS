import { classifyFailure } from "@/lib/supabase/contingency.mjs";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function readJson(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new ApiError(415, "Expected a JSON request.");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Invalid request.");
  }
}

export function apiFailure(error) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (classifyFailure(error) === "connectivity") {
    return json({ error: "The database connection is unavailable." }, 503);
  }
  return json({ error: "The server could not complete the request." }, 500);
}
