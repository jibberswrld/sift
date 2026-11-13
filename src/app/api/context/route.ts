import { z } from "zod";
import type { Context } from "@/lib/types";
import { sql } from "@/lib/server/db";
import { handle, json, readJson } from "@/lib/server/http";
import { requireReady } from "@/lib/server/session";

async function load(userId: string): Promise<Context> {
  const [u] = await sql`select context from users where id = ${userId}`;
  const rows = await sql`select * from corrections where user_id = ${userId} order by created_at desc limit 100`;
  return {
    text: u?.context ?? "",
    corrections: rows.map((c) => ({
      id: c.id, from: c.sender, subject: c.subject ?? null, fromBucket: c.from_bucket ?? null, toBucket: c.to_bucket,
      note: c.note ?? null, createdAt: new Date(c.created_at).toISOString(),
    })),
  };
}

export const GET = handle(async () => json(await load((await requireReady()).user.id)));

/** What matters to the person, in their words. The sorter reads it on every sort. */
export const PUT = handle(async (req: Request) => {
  const { text } = z.object({ text: z.string().max(4_000) }).parse(await readJson(req));
  const { user } = await requireReady();
  await sql`update users set context = ${text.trim()} where id = ${user.id}`;
  return json(await load(user.id));
});

/** Forget one correction. */
export const DELETE = handle(async (req: Request) => {
  const { user } = await requireReady();
  const id = new URL(req.url).searchParams.get("correction") ?? "";
  if (/^[0-9a-f-]{36}$/i.test(id)) await sql`delete from corrections where id = ${id} and user_id = ${user.id}`;
  return json(await load(user.id));
});
