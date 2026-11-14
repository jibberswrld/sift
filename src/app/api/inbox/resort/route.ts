import { handle, ndjson } from "@/lib/server/http";
import { resortInbox } from "@/lib/server/inbox";
import { requireReady } from "@/lib/server/session";

export const maxDuration = 300;

/** Sort the last week again with the latest context. Streams SyncEvents as NDJSON. */
export const POST = handle(async () => {
  const signal = AbortSignal.timeout(240_000);
  return ndjson(resortInbox(await requireReady(), signal));
});
