import { computeGate, signInGate } from "@/lib/server/gate";
import { handle, json } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

/** The Sign in with publik gate. Read-only: a visitor without a session gets the sign-in screen and nothing is created. */
export const GET = handle(async () => {
  const s = await getSession(false);
  return json(s ? await computeGate(s) : signInGate());
});

/** The Sign in click: creates this browser's session and publik install, and returns the claim link. */
export const POST = handle(async () => {
  const s = (await getSession(true))!;
  return json(await computeGate(s, true));
});
