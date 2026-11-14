import type { Me } from "@/lib/types";
import { sql } from "@/lib/server/db";
import { handle, json } from "@/lib/server/http";
import { clearCookie, requireReady } from "@/lib/server/session";

export const GET = handle(async () => {
  const { user } = await requireReady();
  const me: Me = { handle: user.publik_handle ?? null, timezone: user.timezone ?? null };
  return json(me);
});

/** Delete the account and everything in it: messages, corrections, analytics events, sessions. */
export const DELETE = handle(async () => {
  const { user } = await requireReady();
  await sql`delete from users where id = ${user.id}`; // cascades to messages, corrections, events, sessions
  await clearCookie();
  return json({ ok: true });
});
