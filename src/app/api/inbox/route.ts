import type { Inbox } from "@/lib/types";
import { handle, json } from "@/lib/server/http";
import { loadInbox } from "@/lib/server/inbox";
import { requireReady } from "@/lib/server/session";

export const GET = handle(async () => {
  const { user } = await requireReady();
  const body: Inbox = { messages: await loadInbox(user.id), lastSyncAt: user.last_sync_at ? new Date(user.last_sync_at).toISOString() : null };
  return json(body);
});
