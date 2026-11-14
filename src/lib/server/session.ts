import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { decrypt, randomToken, sha256 } from "./crypto";
import { sql, type Row } from "./db";
import { HttpError } from "./http";
import { PublikUnreachable, readWallet } from "./publik";
import { track } from "./track";

export const COOKIE = "sift_sid";
const WALLET_RECHECK_MS = 10 * 60_000;

export interface Ctx {
  session: Row;
  user: Row;
}

/** The current browser session row. With create, makes one (and sets the cookie) when missing. */
export async function getSession(create: boolean): Promise<Row | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    const rows = await sql`update sessions set last_seen_at = now() where id = ${sha256(raw)} returning *`;
    if (rows[0]) return rows[0];
  }
  if (!create) return null;
  const token = randomToken();
  const rows = await sql`
    insert into sessions (id, install_id)
    values (${sha256(token)}, ${randomUUID()})
    returning *`;
  jar.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !!process.env.VERCEL, path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return rows[0];
}

export async function clearCookie() {
  (await cookies()).delete(COOKIE);
}

/** This browser session's own publik key (decrypted), or null before it has one. */
export function sessionKey(s: Row): string | null {
  try {
    return s.publik_key_enc ? decrypt(s.publik_key_enc) : null;
  } catch {
    return null; // APP_SECRET changed: the session signs in again
  }
}

/** Forget this session's sign-in: the gate provisions and asks again. */
export async function resetSession(s: Row) {
  await sql`update sessions set claim_state = 'anonymous', user_id = null, publik_key_enc = null, claim_url = null where id = ${s.id}`;
}

/** IANA timezone from the x-timezone header, validated. */
export async function requestTimezone(): Promise<string | null> {
  const tz = (await headers()).get("x-timezone");
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function gateError(): never {
  throw new HttpError(401, "gate", "Sign in with publik to continue.");
}

/** Every data route: the session must have passed the publik gate. */
export async function requireReady(): Promise<Ctx> {
  const session = await getSession(false);
  if (!session || session.claim_state !== "claimed" || !session.user_id) gateError();

  // Re-verify the claim with publik at most every 10 minutes. If publik is unreachable, keep going.
  const checked = session.wallet_checked_at ? new Date(session.wallet_checked_at).getTime() : 0;
  if (Date.now() - checked > WALLET_RECHECK_MS) {
    const key = sessionKey(session);
    if (!key) gateError();
    try {
      const r = await readWallet(key);
      if (r.status === 401 || (r.wallet && r.wallet.claim_state !== "claimed")) {
        await resetSession(session);
        gateError();
      }
      await sql`update sessions set wallet_checked_at = now() where id = ${session.id}`;
    } catch (e) {
      if (!(e instanceof PublikUnreachable)) throw e;
    }
  }

  const tz = await requestTimezone();
  const users = tz
    ? await sql`update users set last_seen_at = now(), timezone = ${tz} where id = ${session.user_id} returning *`
    : await sql`update users set last_seen_at = now() where id = ${session.user_id} returning *`;
  const user = users[0];
  if (!user) gateError();

  // Return-behaviour metric: one day_active per user per calendar day (user's timezone).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone || "UTC" }).format(new Date());
  const lastDay = user.last_active_day ? new Date(user.last_active_day).toISOString().slice(0, 10) : null;
  if (lastDay !== today) {
    const updated = await sql`update users set last_active_day = ${today} where id = ${user.id} and (last_active_day is distinct from ${today}::date) returning id`;
    if (updated[0]) {
      const created = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone || "UTC" }).format(new Date(user.created_at));
      await track("day_active", { userId: user.id, sessionId: session.id, props: { returning: created !== today } });
    }
  }
  return { session, user };
}
