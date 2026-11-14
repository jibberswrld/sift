import type { GateInfo } from "@/lib/types";
import { encrypt } from "./crypto";
import { sql, type Row } from "./db";
import { gateWords, isConfigured, provision, PublikUnreachable, readWallet, type Wallet } from "./publik";
import { requestTimezone, resetSession, sessionKey } from "./session";
import { track } from "./track";

function info(state: GateInfo["state"], w: Wallet | null, extra: Partial<GateInfo> = {}): GateInfo {
  return { state, title: "Sign in with publik", body: "", note: null, claimUrl: null, handle: w?.account?.handle ?? null, ...extra };
}

/** This browser session's publik key: the stored one, or a new install for this session. */
async function ensureKey(s: Row): Promise<string> {
  const existing = sessionKey(s);
  if (existing) return existing;
  const inst = await provision(s.install_id);
  s.claim_url = inst.claim_url;
  await sql`update sessions set publik_key_enc = ${encrypt(inst.key)}, install_id = ${inst.install_id}, claim_url = ${inst.claim_url} where id = ${s.id}`;
  return inst.key;
}

/** Link a claimed session to its Sift user (keyed by publik handle, so data follows the person across devices). */
async function linkUser(s: Row, w: Wallet): Promise<Row> {
  const tz = await requestTimezone();
  const handle = w.account?.handle ?? null;
  let user: Row | undefined;
  if (handle) {
    user = (await sql`
      insert into users (publik_handle, timezone) values (${handle}, ${tz})
      on conflict (publik_handle) do update set last_seen_at = now(), timezone = coalesce(${tz}, users.timezone)
      returning *`)[0];
  } else if (s.user_id) {
    user = (await sql`select * from users where id = ${s.user_id}`)[0];
  }
  if (!user) user = (await sql`insert into users (timezone) values (${tz}) returning *`)[0];
  const wasClaimed = s.claim_state === "claimed" && s.user_id === user.id;
  await sql`update sessions set user_id = ${user.id}, claim_state = 'claimed', wallet_checked_at = now() where id = ${s.id}`;
  if (!wasClaimed) await track("signin_completed", { userId: user.id, sessionId: s.id });
  s.user_id = user.id;
  s.claim_state = "claimed";
  return user;
}

/** Before a session has a publik install: the sign-in screen, with no claim link yet. */
export function signInGate(): GateInfo {
  if (!isConfigured()) {
    return info("not_configured", null, { body: "Sift is not connected to publik yet. Please try again later." });
  }
  return info("sign_in", null, gateWords("sign_in"));
}

/**
 * The gate, one step per call. The client polls GET /api/gate every 3 s while the sign-in screen is up.
 * Only `provision` (POST, the Sign in click) creates a publik install, so page loads and bots never do.
 */
export async function computeGate(s: Row, provision = false): Promise<GateInfo> {
  if (!isConfigured()) return signInGate();
  let w: Wallet | null = null;
  try {
    for (let attempt = 0; ; attempt++) {
      if (!provision && !sessionKey(s)) return signInGate();
      const r = await readWallet(await ensureKey(s));
      if (r.status === 401 && attempt === 0) {
        // A revoked key: this session provisions again (on the next Sign in click when this is a GET).
        await resetSession(s);
        s.publik_key_enc = null;
        continue;
      }
      if (!r.wallet) return info("unreachable", null, gateWords("unreachable", r.message ?? undefined));
      w = r.wallet;
      break;
    }
  } catch (e) {
    return info("unreachable", null, gateWords("unreachable", e instanceof PublikUnreachable ? undefined : e instanceof Error ? e.message : String(e)));
  }

  if (w.claim_state !== "claimed") {
    if (s.claim_state === "claimed") await sql`update sessions set claim_state = 'anonymous', user_id = null where id = ${s.id}`;
    return info("sign_in", w, { ...gateWords("sign_in"), claimUrl: w.claim_url ?? s.claim_url ?? null });
  }

  await linkUser(s, w);
  return info("ready", w, { title: "You're signed in", body: "" });
}
