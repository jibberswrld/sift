import { createHash, randomUUID } from "node:crypto";
import { sql } from "./db";
import { HttpError } from "./http";

export const DAILY_CALLS = 200;
export const DAILY_RESORTS = 20;
// A conservative backstop even when wallet accounting is unavailable or cached.
export const GLOBAL_DAILY_CALLS = 2_000;

export const aiPaused = () => new HttpError(503, "ai_paused", "Sift's free AI is paused for today. Your messages are still here; sorting resumes tomorrow.");
export const dailyLimit = () => new HttpError(429, "daily_limit", "You've reached today's limit for AI sorting and drafts. It resets tomorrow.");

/** One expiring lease across instances, shared by sync, re-sort, drafts and deletion. */
export async function acquireWork(userId: string): Promise<string> {
  const token = randomUUID();
  const rows = await sql`
    update users set ai_lock_token = ${token}, ai_lock_until = now() + interval '6 minutes'
    where id = ${userId} and (ai_lock_until is null or ai_lock_until < now()) returning id`;
  if (!rows.length) throw new HttpError(409, "busy", "Sift is already working on your inbox. Please try again shortly.");
  return token;
}

export async function releaseWork(userId: string, token: string): Promise<void> {
  await sql`update users set ai_lock_token = null, ai_lock_until = null where id = ${userId} and ai_lock_token = ${token}`;
}

type WalletCheck = { expires: number; check: Promise<boolean> };
const g = globalThis as unknown as { __siftWalletChecks?: Map<string, WalletCheck> };

/** Short-lived wallet cache; errors fall back to the atomic global call ceiling. */
async function walletPaused(p: { baseURL: string; apiKey: string }): Promise<boolean> {
  const cache = g.__siftWalletChecks ??= new Map();
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const key = createHash("sha256").update(p.baseURL).update(p.apiKey).update(day).digest("hex");
  const old = cache.get(key);
  if (old && old.expires > now) return old.check;
  for (const [id, value] of cache) if (value.expires <= now) cache.delete(id);
  const check = (async () => {
    try {
      const res = await fetch(`${p.baseURL.replace(/\/$/, "")}/wallet`, {
        headers: { authorization: `Bearer ${p.apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(5_000),
      });
      const b = await res.json();
      if (res.status === 402 || (res.status === 429 && (b.error?.type === "daily_cap_reached" || b.error?.code === "daily_cap_reached"))) return true;
      if (!res.ok) return false;
      return (typeof b.balance_micros === "number" && b.balance_micros <= 0)
        || (typeof b.spent_today_micros === "number" && typeof b.daily_cap_micros === "number"
          && b.daily_cap_micros > 0 && b.spent_today_micros >= b.daily_cap_micros * 0.75);
    } catch {
      return false;
    }
  })();
  cache.set(key, { expires: now + 60_000, check });
  return check;
}

/** Reserve BEFORE every paid attempt, including retries and isolated injection checks. */
export async function reserveCall(userId: string, p: { baseURL: string; apiKey: string }): Promise<void> {
  if (await walletPaused(p)) throw aiPaused();
  const [r] = await sql`
    with personal as (
      insert into ai_daily_usage (user_id, day, calls) values (${userId}, (now() at time zone 'UTC')::date, 1)
      on conflict (user_id, day) do update set calls = ai_daily_usage.calls + 1
      where ai_daily_usage.calls < ${DAILY_CALLS} returning calls
    ), shared as (
      insert into ai_daily_global (day, calls)
      select (now() at time zone 'UTC')::date, 1 from personal
      on conflict (day) do update set calls = ai_daily_global.calls + 1
      where ai_daily_global.calls < ${GLOBAL_DAILY_CALLS} returning calls
    ) select exists(select 1 from personal) as personal, exists(select 1 from shared) as shared`;
  if (!r.personal) throw dailyLimit();
  if (!r.shared) throw aiPaused();
}

export async function reserveResort(userId: string): Promise<void> {
  const rows = await sql`
    insert into ai_daily_usage (user_id, day, resorts) values (${userId}, (now() at time zone 'UTC')::date, 1)
    on conflict (user_id, day) do update set resorts = ai_daily_usage.resorts + 1
    where ai_daily_usage.resorts < ${DAILY_RESORTS} returning resorts`;
  if (!rows.length) throw dailyLimit();
}
