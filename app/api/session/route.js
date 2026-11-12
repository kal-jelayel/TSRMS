import { requireStaffSession, signIn, signOut } from "@/lib/auth/staffSession";
import { apiFailure, json, readJson } from "@/lib/server/apiResponse";

export async function GET() {
  try {
    const { user } = await requireStaffSession();
    return json(user);
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    return json(await signIn(body?.username, body?.password));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE() {
  await signOut();
  return json({ signedOut: true });
}
