import { handle, json } from "@/lib/server/http";
import { draftReply, loadMessageRow, toMessage } from "@/lib/server/inbox";
import { requireReady } from "@/lib/server/session";

export const maxDuration = 60;

/** Write a reply for the person to review. Nothing is sent. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireReady();
  return json(toMessage(await draftReply(ctx, await loadMessageRow(ctx.user.id, (await params).id))));
});
