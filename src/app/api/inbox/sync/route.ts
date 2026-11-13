import { handle, ndjson } from "@/lib/server/http";
import { syncInbox } from "@/lib/server/inbox";
import { requireReady } from "@/lib/server/session";

export const maxDuration = 300;

/** Fetch new messages from every connected account and sort them. Streams SyncEvents as NDJSON. */
export const POST = handle(async () => ndjson(syncInbox(await requireReady())));
