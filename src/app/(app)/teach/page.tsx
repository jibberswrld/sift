"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Context } from "@/lib/types";
import { api, ApiFailure } from "@/components/app/api";
import { ago, BUCKET_LABEL, senderName } from "@/components/app/bits";
import { useInbox } from "@/components/app/inbox";
import { Button, Skeleton, Textarea } from "@/components/ui";

const PLACEHOLDER = `Anything from my counselor or Coach Rivera is important.
I'm applying to summer programs, so deadlines and recommendation letters matter.
Bills matter. Shipping updates can wait.
I don't care about LinkedIn or store promotions.`;

export default function TeachPage() {
  const { runResort, sync } = useInbox();
  const [ctx, setCtx] = useState<Context | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<Context>("/api/context").then((c) => {
      setCtx(c);
      setText(c.text);
    }).catch(() => toast.error("Couldn't load what Sift knows."));
  }, []);

  const dirty = ctx !== null && text.trim() !== ctx.text;

  const save = async (andResort: boolean) => {
    setSaving(true);
    try {
      if (dirty) setCtx(await api<Context>("/api/context", { method: "PUT", json: { text } }));
      if (andResort) {
        toast("Sorting your inbox again with this");
        void runResort();
      } else toast.success("Saved. Sift uses it from the next sort.");
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const forget = async (id: string) => {
    try {
      setCtx(await api<Context>(`/api/context?correction=${id}`, { method: "DELETE" }));
    } catch {
      toast.error("Couldn't remove that.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 pt-7 pb-24 sm:px-8 sm:pt-10">
      <header className="border-b border-line pb-6">
        <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.015em] sm:text-[34px]">What matters to you.</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] text-ink-2">
          Sift reads this every time it sorts. Write it the way you&rsquo;d tell a friend who was checking your messages for you.
        </p>
      </header>

      <section className="mt-8">
        {ctx ? (
          <Textarea
            aria-label="What matters to you"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            placeholder={PLACEHOLDER}
            className="font-serif text-[17px] leading-[1.6]"
          />
        ) : (
          <Skeleton className="h-44 w-full" />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" loading={saving} disabled={!ctx || !!sync.running || (!dirty && !ctx?.corrections.length && !ctx?.text)} onClick={() => void save(true)}>
            Save and sort my inbox again <ArrowRight size={14} />
          </Button>
          <Button size="sm" variant="ghost" disabled={!dirty || saving} onClick={() => void save(false)}>
            Just save
          </Button>
          {sync.running === "resort" ? <span className="text-[13px] text-muted">{sync.step}…</span> : null}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-2">What Sift has learned from you</h2>
          <span className="text-[13px] tabular-nums text-faint">{ctx?.corrections.length ?? ""}</span>
        </div>
        <p className="mt-1.5 text-[13.5px] text-muted">Every time you move a message, Sift treats similar ones the same way. Remove any it got wrong.</p>
        {ctx && !ctx.corrections.length ? (
          <p className="mt-5 font-serif text-[16px] italic text-muted">Nothing yet. Open a message and move it to teach Sift.</p>
        ) : null}
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {ctx?.corrections.map((c) => (
            <li key={c.id} className="group grid grid-cols-[1fr_auto] gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[14px] text-ink-2">
                  <span className="font-medium text-ink">{senderName(c.from)}</span>
                  {c.subject ? <span className="text-muted"> · {c.subject}</span> : null}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {c.fromBucket ? `${BUCKET_LABEL[c.fromBucket]} → ` : ""}
                  <span className={c.toBucket === "important" ? "text-accent-text" : "text-ink-2"}>{BUCKET_LABEL[c.toBucket]}</span>
                  <span className="text-faint"> · {ago(c.createdAt)}</span>
                </p>
                {c.note ? <p className="mt-1 font-serif text-[15px] italic text-ink-2">&ldquo;{c.note}&rdquo;</p> : null}
              </div>
              <button
                onClick={() => void forget(c.id)}
                aria-label="Forget this"
                title="Forget this"
                className="inline-flex size-7 items-center justify-center self-start rounded-md text-faint opacity-60 transition-opacity hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
