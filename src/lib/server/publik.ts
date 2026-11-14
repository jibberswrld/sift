// publik module for Sift, a hosted web app: Sign in with publik, usage counting, and publik API.
// Adapted from https://publikhq.com/sdk/publik.ts.md for a server with many people: every browser session gets its own
// install key (POST /api/v1/installs, with the app token from PUBLIK_APP_TOKEN), kept encrypted in the database and never
// sent to the browser. The gate shows until GET /api/v1/wallet says "claimed"; then app_opened / active_session usage
// events (POST /api/v1/telemetry) go out with that person's key and no content, so each signed-in person counts once.
// AI calls are paid by the developer's fellowship credits (PUBLIK_CREDITS_KEY), so people never have to pick a plan.
import { randomUUID } from "node:crypto";
import type { PublikOS } from "./visitor";
import pkg from "../../../package.json";

export const APP_SLUG = "sift";
export const APP_VERSION: string = pkg.version;
/** Sift calls a model. The developer's credits pay for it, so the gate never asks people how to pay. */
export const USES_AI = true;
export const ORIGIN = process.env.PUBLIK_ORIGIN || "https://publikhq.com"; // PUBLIK_ORIGIN: tests only
export const DEFAULT_BASE_URL = `${ORIGIN}/api/v1`;
/** Ask for a tier, never a vendor model name. */
export const MODELS = { fast: "publik-fast", balanced: "publik-balanced", smart: "publik-smart" } as const;

export interface Wallet {
  claim_state: "anonymous" | "claimed";
  claim_url: string | null;
  account: { handle: string | null } | null;
  plan: { kind: "none" | "plan" | "pack"; label: string | null };
  balance_micros: number;
  top_up_url: string;
  linked_at: string | null;
}

export interface Installed {
  key: string;
  install_id: string;
  claim_url: string | null;
}

export class PublikUnreachable extends Error {}

const appToken = () => process.env.PUBLIK_APP_TOKEN?.trim() ?? "";
export const isConfigured = () => appToken().startsWith("pat_");

function isOffline(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /abort|timeout/i.test(e.name));
}

/** POST /api/v1/installs: a publik key for one browser session. Throws a readable message. */
export async function provision(installId: string, os: PublikOS, deviceName: string): Promise<Installed> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${ORIGIN}/api/v1/installs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          app_token: appToken(), app_slug: APP_SLUG, app_version: APP_VERSION, os,
          device_name: deviceName.slice(0, 120), install_id: installId, disclosure_version: 1, dialects: ["chat_completions"],
        }),
      });
    } catch (e) {
      if (isOffline(e)) throw new PublikUnreachable("publik is not reachable. Check your connection.");
      throw e;
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if ((res.status === 201 || res.status === 200) && body.key) {
      return { key: body.key, install_id: body.install_id ?? installId, claim_url: body.claim_url ?? null };
    }
    // An install ID publik already knows (200 without a key) or a revoked one: start over with a new ID.
    if (res.status === 200 || body.error?.type === "install_revoked") { installId = randomUUID(); continue; }
    throw new Error(body.error?.message ?? `publik could not set up this browser (${res.status}).`);
  }
  throw new Error("publik could not set up this browser.");
}

/** GET /api/v1/wallet. 401: the key is gone (null wallet). Throws PublikUnreachable when publik does not answer. */
export async function readWallet(key: string): Promise<{ status: number; wallet: Wallet | null; message: string | null }> {
  let res: Response;
  try {
    res = await fetch(`${ORIGIN}/api/v1/wallet`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    if (isOffline(e)) throw new PublikUnreachable("publik is not reachable. Check your connection.");
    throw e;
  }
  const b = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!res.ok || typeof b.claim_state !== "string") return { status: res.status, wallet: null, message: b.error?.message ?? null };
  return {
    status: res.status, message: null,
    wallet: { ...b, account: b.account ?? null, plan: b.plan ?? { kind: "none", label: null }, balance_micros: b.balance_micros ?? 0 } as Wallet,
  };
}

/** The words of the gate. The same as every publik module (gateScreen() in publik.ts.md). */
export function gateWords(id: "unreachable" | "sign_in", message?: string): { title: string; body: string } {
  if (id === "unreachable") return { title: "Sign in with publik", body: message ?? "publik is not reachable. Check your connection." };
  return { title: "Sign in with publik", body: "This app uses your publik account. Click Sign in with publik, then sign in in your browser. This window continues when you are signed in." };
}

// ---------- usage counting ----------
function usageOff(): boolean {
  const dnt = (process.env.DO_NOT_TRACK ?? "").trim().toLowerCase();
  if (dnt !== "" && dnt !== "0" && dnt !== "false") return true;
  return ["0", "false", "off"].includes((process.env.PUBLIK_TELEMETRY ?? "").trim().toLowerCase());
}

/** POST /api/v1/telemetry with this person's key and no content. Never throws. */
export async function sendEvent(event: "app_opened" | "active_session", s: { key: string; installId: string; os?: PublikOS }): Promise<number | null> {
  if (usageOff()) return null;
  try {
    const body = { v: 1, app: APP_SLUG, install_id: s.installId.toLowerCase(), event, app_version: APP_VERSION.replace(/^v/i, ""), os: s.os ?? "linux" };
    const res = await fetch(process.env.PUBLIK_TELEMETRY_URL || `${ORIGIN}/api/v1/telemetry`, {
      method: "POST", signal: AbortSignal.timeout(5_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${s.key}` },
      body: JSON.stringify(body),
    });
    if (process.env.PUBLIK_TELEMETRY_DEBUG === "1") process.stderr.write(`publik-telemetry: ${event} -> ${res.status}\n`);
    return res.status;
  } catch {
    return null;
  }
}

/** A 402 renders its message plus exactly ONE link: this one. */
export function topUpUrlFrom402(body: unknown): { message: string; url: string | null } {
  const e = (body as { error?: { message?: string; top_up_url?: string } } | null)?.error;
  return { message: e?.message ?? "Not enough publik API balance.", url: e?.top_up_url ?? null };
}
