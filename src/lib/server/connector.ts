// Gmail, Outlook and Slack through Composio, on the server (COMPOSIO_API_KEY never reaches a browser).
// Each Sift user is one Composio user. With CONNECTOR_ORIGIN set (tests), the same four calls go to
// scripts/mock-connector.mjs instead. Nothing here throws for an account service that is down.
import { Composio } from "@composio/core";
import { TOOLKIT_NAMES, TOOLKITS, type Toolkit } from "@/lib/types";
import type { Row } from "./db";
import { HttpError } from "./http";

/** The only actions Sift will ever run. The server decides this, not a model and not the caller. */
const ALLOWED_TOOLS: Record<string, Toolkit> = {
  GMAIL_FETCH_EMAILS: "gmail",
  GMAIL_REPLY_TO_THREAD: "gmail",
  OUTLOOK_LIST_MESSAGES: "outlook",
  OUTLOOK_REPLY_EMAIL: "outlook",
  SLACK_SEARCH_MESSAGES: "slack",
};

export const UNAVAILABLE = "Account connections aren't available right now. Try again in a moment.";
const BODY_LIMIT = 20_000;

export type ConnectorResult<T> =
  | { ok: true; data: T }
  /** unavailable: unreachable or not configured. `maybeDone`: the request may have gone through before the failure. */
  | { ok: false; kind: "unavailable" | "not_connected" | "error"; code: string; message: string; maybeDone: boolean };

const fail = (kind: "unavailable" | "not_connected" | "error", code: string, message: string, maybeDone = false) =>
  ({ ok: false as const, kind, code, message, maybeDone });

const composioUser = (user: Row) => (user.publik_handle ? `sift_${user.publik_handle}` : `sift_user_${user.id}`);

/** A Composio session for this user, scoped to the three toolkits. */
async function session(user: Row) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  const composio = new Composio({ apiKey });
  return { composio, s: await composio.create(composioUser(user), { toolkits: TOOLKITS }) };
}

function upstream(e: unknown, maybeDone = false) {
  console.error("[connector]", e instanceof Error ? `${e.name}: ${e.message}` : e);
  return fail("unavailable", "unavailable", UNAVAILABLE, maybeDone);
}

async function connected(s: NonNullable<Awaited<ReturnType<typeof session>>>["s"]): Promise<Record<Toolkit, boolean>> {
  const { items } = await s.toolkits({ toolkits: TOOLKITS });
  const on = (t: Toolkit) => items.some((i) => i.slug.toLowerCase() === t && i.connection?.isActive === true);
  return { gmail: on("gmail"), outlook: on("outlook"), slack: on("slack") };
}

// ---------- tests: the mock connector over HTTP ----------
async function mock<T>(user: Row, path: string, body: unknown | null): Promise<ConnectorResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${process.env.CONNECTOR_ORIGIN!.replace(/\/$/, "")}/api/connector/${path}`, {
      method: body === null ? "GET" : "POST",
      headers: { authorization: `Bearer pk_${composioUser(user)}`, "content-type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
    });
  } catch {
    return fail("unavailable", "unavailable", UNAVAILABLE);
  }
  const parsed = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
  if (res.ok && parsed) return { ok: true, data: parsed };
  const code = parsed?.error?.code ?? "connector_error";
  if (res.status === 409) return fail("not_connected", code, parsed?.error?.message ?? "Not connected.");
  return fail("error", code, parsed?.error?.message ?? UNAVAILABLE, res.status >= 500 && code !== "tool_failed");
}

// ---------- the four calls ----------
export async function connectorStatus(user: Row): Promise<ConnectorResult<Record<Toolkit, boolean>>> {
  if (process.env.CONNECTOR_ORIGIN) return mock(user, "status", null);
  try {
    const c = await session(user);
    if (!c) return fail("unavailable", "not_configured", "Account connections aren't switched on yet.");
    return { ok: true, data: await connected(c.s) };
  } catch (e) {
    return upstream(e);
  }
}

/** A sign-in link to open in a new tab; the person lands on `${origin}/connected` afterwards. */
export async function connectorLink(user: Row, toolkit: Toolkit, origin: string): Promise<ConnectorResult<{ url: string }>> {
  if (process.env.CONNECTOR_ORIGIN) return mock(user, "link", { toolkit });
  try {
    const c = await session(user);
    if (!c) return fail("unavailable", "not_configured", "Account connections aren't switched on yet.");
    const request = await c.s.authorize(toolkit, { callbackUrl: `${origin}/connected?app=${toolkit}` });
    return request.redirectUrl ? { ok: true, data: { url: request.redirectUrl } } : upstream(new Error("no redirectUrl"));
  } catch (e) {
    return upstream(e);
  }
}

export async function connectorDisconnect(user: Row, toolkit: Toolkit): Promise<ConnectorResult<{ ok: true }>> {
  if (process.env.CONNECTOR_ORIGIN) return mock(user, "disconnect", { toolkit });
  try {
    const c = await session(user);
    if (!c) return fail("unavailable", "not_configured", "Account connections aren't switched on yet.");
    const accounts: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await c.composio.connectedAccounts.list({ userIds: [composioUser(user)], toolkitSlugs: [toolkit], limit: 100, cursor });
      accounts.push(...page.items.map((account) => account.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    for (const id of accounts) {
      const result = await c.composio.connectedAccounts.delete(id);
      if (!result.success) return fail("error", "disconnect_failed", `${TOOLKIT_NAMES[toolkit]} could not be disconnected. Please try again.`);
    }
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return upstream(e);
  }
}

/** Run one allowlisted tool, always against this user's own account. */
export async function connectorRun(user: Row, tool: string, args: Record<string, unknown>): Promise<ConnectorResult<{ data: Record<string, unknown> }>> {
  const toolkit = Object.hasOwn(ALLOWED_TOOLS, tool) ? ALLOWED_TOOLS[tool] : null;
  if (!toolkit) return fail("error", "tool_not_allowed", "Sift can't do that.");
  if (process.env.CONNECTOR_ORIGIN) return mock(user, "run", { tool, arguments: args });
  const writes = !/FETCH|LIST|SEARCH/.test(tool);
  try {
    const c = await session(user);
    if (!c) return fail("unavailable", "not_configured", "Account connections aren't switched on yet.");
    if (!(await connected(c.s))[toolkit]) return fail("not_connected", "not_connected", `Connect ${TOOLKIT_NAMES[toolkit]} first.`);
    const result = await c.s.execute(tool, toolkit === "slack" ? args : { ...args, user_id: "me" });
    if (result.resultType !== "completed") {
      console.error("[connector]", tool, result.resultType, result.error);
      return fail("error", "tool_failed", `${TOOLKIT_NAMES[toolkit]} couldn't complete that. Please try again.`);
    }
    return { ok: true, data: { data: slim(tool, result.data) } };
  } catch (e) {
    return upstream(e, writes);
  }
}

/** For routes where a connector failure is the response. */
export function connectorError(r: Extract<ConnectorResult<unknown>, { ok: false }>, toolkit: Toolkit): HttpError {
  if (r.kind === "not_connected") return new HttpError(409, "not_connected", `Connect ${TOOLKIT_NAMES[toolkit]} first.`);
  if (r.kind === "unavailable") return new HttpError(503, "unavailable", r.message);
  return new HttpError(502, r.code, r.message);
}

// ---------- keep fetch results small: full Gmail payloads and Outlook HTML bodies can be huge ----------
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function partText(p: Part | undefined, mime: string): string {
  if (!p) return "";
  if (p.mimeType === mime && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) {
    const t = partText(c, mime);
    if (t) return t;
  }
  return "";
}

function slim(tool: string, data: Record<string, unknown>): Record<string, unknown> {
  if (tool === "GMAIL_FETCH_EMAILS" && Array.isArray(data.messages)) {
    return {
      ...data,
      messages: data.messages.map((m: Record<string, unknown>) => {
        const { payload, ...rest } = m;
        delete rest.attachmentList;
        const own = typeof m.messageText === "string" ? m.messageText : "";
        const text = own.trim() ? own : partText(payload as Part, "text/plain") || partText(payload as Part, "text/html");
        return { ...rest, messageText: text.slice(0, BODY_LIMIT) };
      }),
    };
  }
  if (tool === "OUTLOOK_LIST_MESSAGES" && Array.isArray(data.value)) {
    return {
      ...data,
      value: data.value.map((m: Record<string, unknown>) => {
        const body = m.body as { content?: unknown } | undefined;
        return typeof body?.content === "string" ? { ...m, body: { ...body, content: body.content.slice(0, BODY_LIMIT) } } : m;
      }),
    };
  }
  return data;
}
