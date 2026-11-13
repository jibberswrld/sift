// Reading from and replying through each connected account. Every call goes through the hosted connector
// (connector.ts), which holds the Composio key and allowlists exactly these tools.
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

export const MAX_PER_SOURCE = 25;
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

type Fetched = ConnectorResult<Incoming[]>;

async function gmail(since: Date): Promise<Fetched> {
  const query = `in:inbox after:${Math.floor(since.getTime() / 1000)}`;
  const r = await connectorRun("GMAIL_FETCH_EMAILS", { query, max_results: MAX_PER_SOURCE, include_payload: true, verbose: true });
  if (!r.ok) return r;
  const raw = Array.isArray(r.data.data?.messages) ? (r.data.data.messages as Obj[]) : [];
  return {
    ok: true,
    data: raw.filter((m) => str(m.messageId)).map((m) => ({
      source: "gmail" as const,
      externalId: str(m.messageId),
      threadId: str(m.threadId) || null,
      sender: str(m.sender) || "Unknown sender",
      subject: str(m.subject) || "(no subject)",
      body: plainText(str(m.messageText)) || str(obj(m.preview).body),
      receivedAt: date(m.messageTimestamp),
      url: str(m.display_url) || null,
    })),
  };
}

async function outlook(since: Date): Promise<Fetched> {
  const r = await connectorRun("OUTLOOK_LIST_MESSAGES", {
    folder: "inbox",
    top: MAX_PER_SOURCE,
    received_date_time_gt: since.toISOString(),
    select: ["id", "subject", "from", "receivedDateTime", "body", "bodyPreview", "conversationId", "webLink"],
  });
  if (!r.ok) return r;
  const raw = Array.isArray(r.data.data?.value) ? (r.data.data.value as Obj[]) : [];
  return {
    ok: true,
    data: raw.filter((m) => str(m.id)).map((m) => {
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
    }),
  };
}

async function slack(since: Date): Promise<Fetched> {
  // Slack's after: is a whole UTC day and exclusive, so ask from the day before and filter by ts below.
  const day = new Date(since.getTime() - 86_400_000).toISOString().slice(0, 10);
  const r = await connectorRun("SLACK_SEARCH_MESSAGES", { query: `after:${day}`, sort: "timestamp", sort_dir: "desc", count: MAX_PER_SOURCE });
  if (!r.ok) return r;
  const raw = Array.isArray(obj(r.data.data?.messages).matches) ? (obj(r.data.data?.messages).matches as Obj[]) : [];
  return {
    ok: true,
    data: raw
      .filter((m) => str(m.ts) && str(m.text) && Number(m.ts) * 1000 > since.getTime())
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
      }),
  };
}

export const FETCH: Record<Toolkit, (since: Date) => Promise<Fetched>> = { gmail, outlook, slack };

/** The address inside "Name <a@b.co>" or a bare "a@b.co"; null for a name with no address. */
export function emailAddress(s: string | null | undefined): string | null {
  return /[^\s<>@,;:"'()]+@[^\s<>@,;:"'()]+\.[^\s<>@,;:"'()]+/.exec(s ?? "")?.[0] ?? null;
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
