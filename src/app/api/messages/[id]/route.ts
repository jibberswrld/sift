import { z } from "zod";
import { sql } from "@/lib/server/db";
import { handle, json, readJson } from "@/lib/server/http";
import { loadMessageRow, moveMessage, toDetail, toMessage } from "@/lib/server/inbox";
import { requireReady } from "@/lib/server/session";

type Params = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Params) => {
  const { user } = await requireReady();
  return json(toDetail(await loadMessageRow(user.id, (await params).id)));
});

const Body = z.union([
  z.object({ bucket: z.enum(["important", "later", "low"]), note: z.string().trim().max(300).nullish() }),
  z.object({ done: z.boolean() }),
]);

/** Move a message to another bucket (remembered as a correction), or mark it done / not done. */
export const POST = handle(async (req: Request, { params }: Params) => {
  const body = Body.parse(await readJson(req));
  const ctx = await requireReady();
  const row = await loadMessageRow(ctx.user.id, (await params).id);
  if ("done" in body) {
    const r = (await sql`update messages set done_at = ${body.done ? new Date().toISOString() : null} where id = ${row.id} returning *`)[0];
    return json(toMessage(r));
  }
  return json(toMessage(await moveMessage(ctx, row, body.bucket, body.note || null)));
});
