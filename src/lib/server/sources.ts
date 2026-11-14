// Reading from and replying through each connected account. Every call goes through connector.ts,
// which holds the Composio key on the server and allowlists exactly these tools.
import type { Toolkit } from "@/lib/types";
import { connectorRun, type ConnectorResult } from "./connector";
import type { Row } from "./db";

export interface Incoming {
  source: Toolkit;
  externalId: string;
  threadId: string | null;
  sender: string;
  subject: string | null;
  body: string;
  receivedAt: Date;
  url: string | null;
}

export const MAX_PER_SOURCE = 150;
const PAGE_SIZE = 25;
const BODY_LIMIT = 8_000;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Email bodies often arrive as HTML. The sorter and the reader need plain text. */
export function plainText(s: string): string {
  let t = s.replace(/\r\n/g, "\n");
  if (/<(html|body|div|p|br|table|span|a)\b/i.test(t)) {
    t = t
      .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
  }
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, BODY_LIMIT);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const date = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

type Fetched = ConnectorResult<{ messages: Incoming[]; cursor: string | null }>;

// Persist the continuation at the ceiling: an oldest-message watermark alone would
// keep fetching the same newest messages and never drain a large backlog.
export interface SyncPage { since: string; until: string; cursor: string }

async function gmail(user: Row, since: Date, until: Date, cursor = "", signal?: AbortSignal): Promise<Fetched> {
  const query = `in:inbox after:${Math.floor(since.getTime() / 1000)} before:${Math.ceil(until.getTime() / 1000)}`;
  const raw: Obj[] = [];
  let pages = 0;
  do {
    if (signal?.aborted) break;
    pages++;
    let r;
    try {
      r = await connectorRun(user, "GMAIL_FETCH_EMAILS", { query, max_results: PAGE_SIZE, include_payload: true, verbose: true, ...(cursor ? { page_token: cursor } : {}) }, signal);
    } catch (e) {
      if (!signal?.aborted) throw e;
      break;
    }
    if (!r.ok) return r;
    raw.push(...(Array.isArray(r.data.data?.messages) ? r.data.data.messages as Obj[] : []));
    const next = str(r.data.data?.nextPageToken);
    if (next && next === cursor) throw new Error("Gmail repeated its pagination token.");
    cursor = next;
  } while (cursor && raw.length < MAX_PER_SOURCE && pages < MAX_PER_SOURCE / PAGE_SIZE && !signal?.aborted);
  return {
    ok: true,
    data: { cursor: cursor || null, messages: raw.filter((m) => str(m.messageId)).map((m) => ({
      source: "gmail" as const,
      externalId: str(m.messageId),
      threadId: str(m.threadId) || null,
      sender: str(m.sender) || "Unknown sender",
      subject: str(m.subject) || "(no subject)",
      body: plainText(str(m.messageText)) || str(obj(m.preview).body),
      receivedAt: date(m.messageTimestamp),
      url: str(m.display_url) || null,
    })) },
  };
}

async function outlook(user: Row, since: Date, until: Date, cursor = "", signal?: AbortSignal): Promise<Fetched> {
  const raw: Obj[] = [];
  let pages = 0;
  do {
    if (signal?.aborted) break;
    pages++;
    let r;
    try {
      r = await connectorRun(user, "OUTLOOK_LIST_MESSAGES", {
        folder: "inbox", top: PAGE_SIZE,
        filter: `receivedDateTime gt ${since.toISOString()} and receivedDateTime lt ${until.toISOString()}`,
        select: ["id", "subject", "from", "receivedDateTime", "body", "bodyPreview", "conversationId", "webLink"],
        ...(cursor ? { page_token: cursor } : {}),
      }, signal);
    } catch (e) {
      if (!signal?.aborted) throw e;
      break;
    }
    if (!r.ok) return r;
    raw.push(...(Array.isArray(r.data.data?.value) ? r.data.data.value as Obj[] : []));
    // Composio's opaque token carries Graph's nextLink. Older results expose the link directly.
    const next = str(r.data.data?.next_page_token) || str(r.data.data?.["@odata.nextLink"]);
    if (next && next === cursor) throw new Error("Outlook repeated its pagination token.");
    cursor = next;
  } while (cursor && raw.length < MAX_PER_SOURCE && pages < MAX_PER_SOURCE / PAGE_SIZE && !signal?.aborted);
  return {
    ok: true,
    data: { cursor: cursor || null, messages: raw.filter((m) => str(m.id)).map((m) => {
      const from = obj(obj(m.from).emailAddress);
      const name = str(from.name), address = str(from.address);
      return {
        source: "outlook" as const,
        externalId: str(m.id),
        threadId: str(m.conversationId) || null,
        sender: name && address ? `${name} <${address}>` : name || address || "Unknown sender",
        subject: str(m.subject) || "(no subject)",
        body: plainText(str(obj(m.body).content)) || str(m.bodyPreview),
        receivedAt: date(m.receivedDateTime),
        url: str(m.webLink) || null,
      };
    }) },
  };
}

async function slack(user: Row, since: Date, until: Date, cursor = "1", signal?: AbortSignal): Promise<Fetched> {
  // Slack date search is day-grained; filter exact timestamps below.
  const day = new Date(since.getTime() - 86_400_000).toISOString().slice(0, 10);
  const endDay = new Date(until.getTime() + 86_400_000).toISOString().slice(0, 10);
  const raw: Obj[] = [];
  let page = Number(cursor) || 1;
  let more = false;
  let pages = 0;
  do {
    if (signal?.aborted) break;
    pages++;
    let r;
    try {
      r = await connectorRun(user, "SLACK_SEARCH_MESSAGES", { query: `after:${day} before:${endDay}`, sort: "timestamp", sort_dir: "desc", count: PAGE_SIZE, page }, signal);
    } catch (e) {
      if (!signal?.aborted) throw e;
      break;
    }
    if (!r.ok) return r;
    const messages = obj(r.data.data?.messages);
    const matches = Array.isArray(messages.matches) ? messages.matches as Obj[] : [];
    raw.push(...matches);
    more = page * PAGE_SIZE < Number(messages.total ?? obj(messages.paging).total ?? 0);
    page++;
  } while (more && raw.length < MAX_PER_SOURCE && pages < MAX_PER_SOURCE / PAGE_SIZE && !signal?.aborted);
  return {
    ok: true,
    data: { cursor: more ? String(page) : null, messages: raw
      .filter((m) => str(m.ts) && str(m.text) && Number(m.ts) * 1000 > since.getTime() && Number(m.ts) * 1000 <= until.getTime())
      .map((m) => {
        const channel = obj(m.channel);
        const where = str(channel.name);
        return {
          source: "slack" as const,
          externalId: `${str(channel.id)}:${str(m.ts)}`,
          threadId: str(channel.id) || null,
          sender: (str(m.username) || str(m.user) || "Someone") + (where && !/^[UD][A-Z0-9]+$/.test(where) ? ` in #${where}` : ""),
          subject: null,
          body: str(m.text).slice(0, BODY_LIMIT),
          receivedAt: new Date(Number(m.ts) * 1000),
          url: str(m.permalink) || null,
        };
      }) },
  };
}

export const FETCH: Record<Toolkit, (user: Row, since: Date, until: Date, cursor?: string, signal?: AbortSignal) => Promise<Fetched>> = { gmail, outlook, slack };

/** The address inside "Name <a@b.co>" or a bare "a@b.co"; null for a name with no address. */
export function emailAddress(s: string | null | undefined): string | null {
  const header = s ?? "";
  // Remove quoted display-name text (including escaped quotes) before finding
  // the final mailbox. A display name must never supply the reply address.
  let outside = "", quoted = false, escaped = false;
  for (const c of header) {
    if (escaped) { escaped = false; continue; }
    if (quoted && c === "\\") { escaped = true; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (!quoted) outside += c;
  }
  const brackets = [...outside.matchAll(/<([^<>]*)>/g)].at(-1);
  const address = /[^\s<>@,;:"'()]+@[^\s<>@,;:"'()]+\.[^\s<>@,;:"'()]+/;
  if (outside.includes("<") || outside.includes(">")) {
    // Invalid angle addresses must not fall back to a spoofed display name.
    const inner = brackets?.[1].trim() ?? "";
    return address.exec(inner)?.[0] === inner && inner ? inner : null;
  }
  return address.exec(outside)?.[0] ?? null;
}

/** The reply call for an email message. Slack replies happen in Slack. */
export function replyCall(m: Row, body: string) {
  if (m.source === "gmail") {
    const to = emailAddress(m.sender);
    if (!to || !m.thread_id) return null;
    return { tool: "GMAIL_REPLY_TO_THREAD", args: { thread_id: m.thread_id, recipient_email: to, message_body: body, is_html: false } };
  }
  if (m.source === "outlook") return { tool: "OUTLOOK_REPLY_EMAIL", args: { message_id: m.external_id, comment: body, is_html: false } };
  return null;
}
