"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowSquareOut, Check, Copy, PaperPlaneTilt, Sparkle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { TOOLKIT_NAMES, type Bucket, type Message, type MessageDetail } from "@/lib/types";
import { Button, cx, IconButton, Skeleton, Textarea } from "../ui";
import { api, ApiFailure } from "./api";
import { BUCKET_LABEL, senderName, SourceLogo } from "./bits";
import { useInbox } from "./inbox";

const BUCKETS: Bucket[] = ["important", "later", "low"];

export function Reader({ message: m, onClose }: { message: Message; onClose: () => void }) {
  const { setDone } = useInbox();
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    void api<MessageDetail>(`/api/messages/${m.id}`).then(setDetail).catch(() => setDetail(null));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [m.id, onClose]);

  const when = new Date(m.receivedAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } }}
      aria-label="Message"
      className="fixed inset-0 z-40 overflow-y-auto bg-bg xl:sticky xl:top-0 xl:z-auto xl:h-[100dvh] xl:border-l xl:border-line xl:bg-surface"
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-bg px-4 py-2.5 xl:bg-surface">
        <SourceLogo source={m.source} size={14} />
        <span className="ml-1.5 text-[13px] text-muted">{TOOLKIT_NAMES[m.source]}</span>
        <span className="ml-auto" />
        {m.url ? (
          <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-ink-2 hover:bg-surface-2">
            Open in {TOOLKIT_NAMES[m.source]} <ArrowSquareOut size={13} />
          </a>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void setDone(m.id, true)}>
          <Check size={14} /> Done
        </Button>
        <IconButton label="Close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-6 py-6">
        <p className="text-[13.5px] text-muted">
          <span className="font-semibold text-ink">{senderName(m.from)}</span>
          {m.from.includes("<") ? <span className="ml-1.5">{m.from.match(/<([^>]+)>/)?.[1]}</span> : null}
        </p>
        <h2 className="mt-1.5 text-[21px] font-[560] leading-snug tracking-[-0.015em]">{m.subject ?? m.summary ?? "Message"}</h2>
        <p className="mt-1 text-[12.5px] text-faint">{when}</p>

        <Sorting m={m} />

        {m.injection ? (
          <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-ink-2">
            This message contains instructions aimed at an AI. Sift ignored them and sorted it by what it actually is.
          </p>
        ) : null}

        <div className="mt-6 border-t border-line pt-5">
          {detail ? (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.65] text-ink-2">{detail.body}</div>
          ) : (
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
        </div>

        <Reply m={m} />
      </div>
    </motion.aside>
  );
}

/** Where Sift put it and why, and the person's chance to correct it. Corrections are remembered. */
function Sorting({ m }: { m: Message }) {
  const { move } = useInbox();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  const pick = (b: Bucket) => {
    if (b === m.bucket) return;
    void move(m.id, b);
    setAsking(true);
    setNote("");
  };

  return (
    <div className="mt-5 rounded-xl border border-line bg-bg/60 p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Sort this message" className="inline-flex rounded-lg bg-surface-2 p-0.5">
          {BUCKETS.map((b) => (
            <button
              key={b}
              role="radio"
              aria-checked={m.bucket === b}
              onClick={() => pick(b)}
              className={cx(
                "h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors duration-150",
                m.bucket === b ? cx("bg-surface shadow-card", b === "important" ? "text-accent-text" : "text-ink") : "text-muted hover:text-ink",
              )}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
        {m.movedByYou ? <span className="text-[12px] text-faint">Sorted by you</span> : null}
      </div>
      {m.reason ? <p className="mt-2.5 font-serif text-[15px] italic leading-snug text-muted">{m.reason}</p> : null}
      {asking ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim() || !m.bucket) return;
            void move(m.id, m.bucket, note.trim());
            setAsking(false);
            toast.success("Got it. Sift will remember that.");
          }}
        >
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Why? Sift remembers it next time (optional)"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] placeholder:text-faint focus:border-accent-text focus:outline-none"
          />
          <Button size="sm" variant="primary" type="submit" disabled={!note.trim()}>
            Teach
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Reply({ m }: { m: Message }) {
  const { update } = useInbox();
  const [text, setText] = useState(m.draft ?? "");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const canSend = m.source !== "slack";

  if (m.sentAt) return <p className="mt-8 border-t border-line pt-5 text-[13.5px] text-ok">Reply sent with {TOOLKIT_NAMES[m.source]}.</p>;

  const draft = async () => {
    setBusy("draft");
    try {
      const r = await api<Message>(`/api/messages/${m.id}/draft`, { method: "POST" });
      setText(r.draft ?? "");
      update(r);
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : "Couldn't write a draft.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    try {
      const r = await api<Message>(`/api/messages/${m.id}/send`, { method: "POST", json: { body: text, confirm: true } });
      update(r);
      toast.success(`Sent with ${TOOLKIT_NAMES[m.source]}`);
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : "Your reply was not sent.");
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  };

  return (
    <div className="mt-8 border-t border-line pt-5">
      {!text && busy !== "draft" ? (
        <Button size="sm" onClick={() => void draft()}>
          <Sparkle size={14} /> Draft a reply
        </Button>
      ) : (
        <>
          <label htmlFor="reply" className="text-[12.5px] font-medium text-muted">
            Your reply {busy === "draft" ? "· writing…" : "· nothing is sent until you press Send"}
          </label>
          <Textarea id="reply" rows={7} value={text} onChange={(e) => setText(e.target.value)} disabled={busy === "draft"} className="mt-2 text-[14.5px]" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {canSend ? (
              confirm ? (
                <Button size="sm" variant="primary" loading={busy === "send"} onClick={() => void send()}>
                  <PaperPlaneTilt size={14} /> Send to {senderName(m.from)}
                </Button>
              ) : (
                <Button size="sm" variant="primary" disabled={!text.trim() || !!busy} onClick={() => setConfirm(true)}>
                  Send with {TOOLKIT_NAMES[m.source]}
                </Button>
              )
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={!text.trim()}
              onClick={() => void navigator.clipboard.writeText(text).then(() => toast("Copied"))}
            >
              <Copy size={14} /> Copy
            </Button>
            {confirm ? (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void draft()}>
                Rewrite
              </Button>
            )}
            {!canSend ? <span className="text-[12.5px] text-faint">Copy it, then reply in Slack.</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
