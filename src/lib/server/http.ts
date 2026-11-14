import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { SyncEvent } from "@/lib/types";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public topUpUrl: string | null = null) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, ...(e.topUpUrl ? { topUpUrl: e.topUpUrl } : {}) } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "invalid_request", message: e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") } }, { status: 400 });
  }
  console.error("[api]", e);
  return NextResponse.json({ error: { code: "server_error", message: "Something went wrong on our side. Please try again." } }, { status: 500 });
}

/** Wrap a route handler so thrown HttpErrors / validation errors become ApiError JSON. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      const req = args[0];
      if (req instanceof Request && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.get("origin");
        if (origin !== null && origin !== new URL(req.url).origin) {
          throw new HttpError(403, "invalid_origin", "This request must come from Sift.");
        }
      }
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

/** Buffer until AI completes so quota failures can still set HTTP status. Saved mail/results survive errors. */
export async function ndjson(events: AsyncGenerator<SyncEvent>): Promise<Response> {
  const lines: string[] = [];
  let failure: HttpError | undefined;
  for await (const event of events) {
    if (event.type === "error" && ["ai_paused", "daily_limit", "busy"].includes(event.code)) {
      const status = event.code === "ai_paused" ? 503 : event.code === "daily_limit" ? 429 : 409;
      failure ??= new HttpError(status, event.code, event.message);
    }
    lines.push(JSON.stringify(event));
  }
  if (failure) return errorResponse(failure);
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
