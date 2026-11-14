import type { Me } from "@/lib/types";
import { TOOLKITS } from "@/lib/types";
import { connectorDisconnect, connectorError } from "@/lib/server/connector";
import { sql } from "@/lib/server/db";
import { handle, json } from "@/lib/server/http";
import { clearCookie, requireReady } from "@/lib/server/session";
import { accountUsageKey, acquireWork, releaseWork } from "@/lib/server/usage";

export const GET = handle(async () => {
  const { user } = await requireReady();
  const me: Me = { handle: user.publik_handle ?? null, timezone: user.timezone ?? null };
  return json(me);
});

/** Delete the account and everything in it: messages, corrections, analytics events, sessions. */
export const DELETE = handle(async () => {
  const { user } = await requireReady();
  const token = await acquireWork(user.id);
  try {
    // Attempt every toolkit, but keep the account/session available to retry any failure.
    const results = await Promise.all(TOOLKITS.map(async (toolkit) => ({ toolkit, result: await connectorDisconnect(user, toolkit) })));
    for (const { toolkit, result } of results) if (!result.ok) throw connectorError(result, toolkit);
    await accountUsageKey(user.id); // preserve legacy allowances before cascading deletion
    await sql`delete from users where id = ${user.id}`; // cascades to messages, corrections, events, sessions (anonymous allowances remain)
    await clearCookie();
    return json({ ok: true });
  } finally {
    await releaseWork(user.id, token);
  }
});
