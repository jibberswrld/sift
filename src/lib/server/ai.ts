import type { Row } from "./db";
import { HttpError } from "./http";
import { DEFAULT_BASE_URL, MODELS, topUpUrlFrom402 } from "./publik";
import { sessionKey } from "./session";

const MAX_BYTES = 4 * 1024 * 1024;

export interface Provider {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** The developer's fellowship credits pay (PUBLIK_CREDITS_KEY). Without it (local tests), this session's own key does. */
export function resolveProvider(session: Row): Provider {
  const apiKey = process.env.PUBLIK_CREDITS_KEY || sessionKey(session);
  if (!apiKey) throw new HttpError(401, "gate", "Sign in with publik to continue.");
  return { baseURL: DEFAULT_BASE_URL, apiKey, model: MODELS.balanced };
}

export type ChatContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export class AiRequestError extends HttpError {
  constructor(status: number, code: string, message: string, public detail: string, topUpUrl: string | null = null) {
    super(status, code, message, topUpUrl);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One OpenAI-compatible chat completion. Returns the assistant text. Throws HttpError with a user-facing message. */
export async function chat(p: Provider, messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const body = JSON.stringify({
    model: p.model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1800,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  if (Buffer.byteLength(body) > MAX_BYTES) {
    throw new HttpError(413, "too_large", "That's too big to read in one go. Try a smaller file or paste the important part.");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${p.baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      if (attempt === 0) { await sleep(1500); continue; }
      throw new HttpError(503, "ai_unreachable", "publik is not reachable. Check your connection.");
    }
    const text = await res.text();
    let parsed: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { parsed = JSON.parse(text); } catch { /* non-JSON error page */ }
    if (res.ok) {
      const content = parsed.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) return content.map((c: { text?: string }) => c.text ?? "").join("");
      throw new HttpError(502, "ai_error", "The AI returned an empty answer. Please try again.");
    }
    if (res.status === 402) {
      const t = topUpUrlFrom402(parsed);
      throw new AiRequestError(402, "payment_required", t.message, text.slice(0, 500), t.url);
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) { await sleep(1500); continue; }
    const detail = parsed.error?.message ?? text.slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new AiRequestError(401, "gate", "Sign in with publik to continue.", detail);
    if (res.status === 429) throw new AiRequestError(429, "rate_limited", "Too many requests right now. Wait a few seconds and try again.", detail);
    if (res.status >= 500) throw new AiRequestError(503, "ai_unavailable", "The AI is having trouble right now. Please try again in a minute.", detail);
    throw new AiRequestError(502, "ai_error", "The AI couldn't process this. Please try again.", detail);
  }
  throw new HttpError(503, "ai_unavailable", "The AI is having trouble right now. Please try again in a minute.");
}

/** Pull the first JSON object out of a model reply (tolerates code fences and chatter). */
export function parseJsonObject(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf("{");
  if (start < 0) throw new Error("no JSON object");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error("unterminated JSON object");
}
