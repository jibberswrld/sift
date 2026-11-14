"use client";

import type { ApiError } from "@/lib/types";

export class ApiFailure extends Error {
  code: string;
  status: number;
  topUpUrl: string | null;
  constructor(status: number, code: string, message: string, topUpUrl: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.topUpUrl = topUpUrl;
  }
}

/** The developer's wallet pays for everyone's AI, so when it runs dry people see this and never a top-up link. */
export const AI_PAUSED_MESSAGE = "Sift's free AI is paused for today. Your messages are still here; sorting resumes tomorrow.";

/** ai_paused (503), or what an older backend sends for an empty wallet: any 402 or a top-up link. */
export function isAiPaused(e: { status?: number; code?: string | null; topUpUrl?: string | null }): boolean {
  return e.code === "ai_paused" || e.code === "payment_required" || e.status === 402 || !!e.topUpUrl;
}

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Fetch a Sift API route. Throws ApiFailure with the server's readable message. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        "x-timezone": timezone(),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure(0, "network", "You're offline or Sift can't be reached. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) {
    const e = body?.error;
    throw new ApiFailure(
      res.status,
      e?.code ?? "error",
      e?.message ?? `Something went wrong (${res.status}). Try again.`,
      e?.topUpUrl ?? (e as { top_up_url?: string } | undefined)?.top_up_url ?? null,
    );
  }
  return body as T;
}
