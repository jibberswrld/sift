// Shared contract between the API routes (src/app/api/**) and the UI. Dates are ISO 8601 strings in JSON.

/** Where a message came from. Each one is a Composio toolkit the user connects through the Sift connector. */
export type Toolkit = "gmail" | "outlook" | "slack";
export const TOOLKITS: Toolkit[] = ["gmail", "outlook", "slack"];
export const TOOLKIT_NAMES: Record<Toolkit, string> = { gmail: "Gmail", outlook: "Outlook", slack: "Slack" };

/** important: needs the person. later: worth a look, no rush. low: newsletters, promotions, notifications. */
export type Bucket = "important" | "later" | "low";

export interface Message {
  id: string;
  source: Toolkit;
  from: string; // "Name <a@b.co>" for email, the user's name for Slack
  subject: string | null; // null for Slack
  preview: string; // first ~200 chars of the body
  receivedAt: string;
  url: string | null; // open the original in Gmail / Outlook / Slack
  bucket: Bucket | null; // null until sorted
  summary: string | null; // one line: what this is
  reason: string | null; // one line: why it's in this bucket
  needsReply: boolean;
  injection: boolean; // the message contained instructions aimed at an AI; they were ignored
  movedByYou: boolean; // the person put it in this bucket themselves
  done: boolean;
  draft: string | null;
  sentAt: string | null;
}

export interface MessageDetail extends Message {
  body: string;
}

export interface Correction {
  id: string;
  from: string;
  subject: string | null;
  fromBucket: Bucket | null;
  toBucket: Bucket;
  note: string | null;
  createdAt: string;
}

// GET  /api/inbox                     -> Inbox
export interface Inbox {
  messages: Message[]; // not done, newest first
  lastSyncAt: string | null;
}
// POST /api/inbox/sync                -> NDJSON stream of SyncEvent (fetch new messages from every connected source, sort them)
// POST /api/inbox/resort              -> NDJSON stream of SyncEvent (sort recent messages again with the latest context)
export type SyncEvent =
  | { type: "step"; text: string }
  | { type: "sorted"; messages: Message[] }
  | { type: "done"; added: number; sorted: number; partial?: boolean }
  | { type: "error"; code: string; message: string; topUpUrl?: string | null };

// GET  /api/messages/:id              -> MessageDetail
// POST /api/messages/:id {bucket, note?} | {done} -> Message   (moving a message records a Correction)
// POST /api/messages/:id/draft        -> Message (draft filled)
// POST /api/messages/:id/send {body, confirm: true} -> Message (sent with Gmail / Outlook, then marked done)

// GET  /api/context                   -> Context
// PUT  /api/context {text}            -> Context
// DELETE /api/context?correction=<id> -> Context
export interface Context {
  text: string; // what matters to the person, in their words
  corrections: Correction[]; // newest first
}

// ---- Sign in with publik gate ----
export type GateState =
  | "not_configured" // server has no PUBLIK_APP_TOKEN
  | "unreachable" // publik did not answer
  | "sign_in" // install exists, not claimed yet
  | "ready";

export interface GateInfo {
  state: GateState;
  title: string;
  body: string;
  note: string | null;
  claimUrl: string | null;
  handle: string | null;
}

export interface Me {
  handle: string | null;
  timezone: string | null;
}

// Every API error is { error: { code, message, topUpUrl? } } with a non-2xx status.
export interface ApiError {
  error: { code: string; message: string; topUpUrl?: string | null };
}

// ---- Connected accounts (through Composio, via the Sift connector service) ----
export interface Connections {
  available: boolean; // false when the connector service is not configured or unreachable
  message: string | null; // why it is unavailable, in plain words
  connected: Record<Toolkit, boolean>;
}
// GET  /api/connections                      -> Connections
// POST /api/connections/link {toolkit}       -> { url }   (open in a new tab; then poll GET /api/connections)
// POST /api/connections/disconnect {toolkit} -> Connections
