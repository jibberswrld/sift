import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { loadMessageRow, sendReply, toMessage } from "@/lib/server/inbox";
import { requireReady } from "@/lib/server/session";

export const maxDuration = 60;

/** Send the reply exactly as the person approved it, with their own Gmail or Outlook. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(10_000), confirm: z.literal(true) }).parse(await readJson(req));
  const ctx = await requireReady();
  return json(toMessage(await sendReply(ctx, await loadMessageRow(ctx.user.id, (await params).id), body)));
});
