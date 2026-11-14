"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Check, Copy, Sparkle, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { TOOLKIT_NAMES, type Bucket, type Message, type MessageDetail } from "@/lib/types";
import { Button, cx, IconButton, Skeleton } from "../ui";
import { AI_PAUSED_MESSAGE, api, ApiFailure, isAiPaused } from "./api";
import { BUCKET_LABEL, senderName, SourceLogo } from "./bits";
import { useInbox } from "./inbox";

const BUCKETS: Bucket[] = ["important", "later", "low"];

export function Reader({ message: m, onClose }: { message: Message; onClose: () => void }) {
  const { setDone } = useInbox();
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    void api<MessageDetail>(`/api/messages/${m.id}`).then(setDetail).catch(() => setDetail(null));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("input, textarea") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [m.id, onClose]);

  const when = new Date(m.receivedAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const address = m.from.match(/<([^>]+)>/)?.[1];

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
      aria-label="Message"
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-bg lg:sticky lg:top-14 lg:z-auto lg:h-[calc(100dvh-3.5rem)] lg:border-l lg:border-line"
    >
      <div className="flex items-center gap-1 px-4 pt-3 sm:px-6">
        <IconButton label="Close (Esc)" onClick={onClose} className="-ml-2 size-8">
          <X size={16} />
        </IconButton>
        <span className="flex-1" />
        {m.url ? (
          <a href={m.url} target="_blank" rel="noreferrer" title={`Open in ${TOOLKIT_NAMES[m.source]}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink">
            <ArrowSquareOut size={16} />
          </a>
        ) : null}
        <IconButton label="Mark done (E)" onClick={() => void setDone(m.id, true)} className="size-8">
          <Check size={16} />
        </IconButton>
      </div>

      <div className="flex-1 px-6 pt-4 pb-6 sm:px-8">
        <h2 className="text-[20px] font-[560] leading-snug tracking-[-0.015em]">{m.subject ?? m.summary ?? "Message"}</h2>
        <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          <SourceLogo source={m.source} size={13} />
          <span className="shrink-0 whitespace-nowrap font-medium text-ink-2">{senderName(m.from)}</span>
          {address ? <span className="min-w-0 truncate text-faint">{address}</span> : null}
          <span className="ml-auto shrink-0 text-faint">{when}</span>
        </p>

        <Sorting m={m} />

        {m.injection ? (
          <p className="mt-4 text-[13px] text-warn">This message contains instructions aimed at an AI. Sift ignored them.</p>
        ) : null}

        <div className="mt-6">
          {detail ? (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-ink-2">{detail.body}</div>
          ) : (
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
        </div>
      </div>

      <Reply m={m} />
    </motion.aside>
  );
}

/** Why Sift put it here, and a quiet way to correct it. Corrections are remembered for later sorts. */
function Sorting({ m }: { m: Message }) {
  const { move } = useInbox();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="mt-5 border-l-2 border-accent-text/70 pl-3.5">
      <p className="font-serif text-[16px] italic leading-snug text-ink-2">{m.reason ?? "Not sorted yet."}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-[12.5px] text-faint">
        <span>{m.movedByYou ? "You put this in" : "Sorted into"}</span>
        <span className="font-medium text-ink-2">{m.bucket ? BUCKET_LABEL[m.bucket] : "nothing yet"}</span>
        <span className="mx-1">·</span>
        <span>Move to</span>
        {BUCKETS.filter((b) => b !== m.bucket).map((b, i) => (
          <span key={b} className="inline-flex gap-1">
            {i ? <span>or</span> : null}
            <button
              onClick={() => {
                void move(m.id, b);
                setAsking(true);
                setNote("");
              }}
              className="text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink hover:decoration-ink"
            >
              {BUCKET_LABEL[b]}
            </button>
          </span>
        ))}
      </p>
      {asking ? (
        <form
          className="mt-2.5 flex gap-2"
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
            onKeyDown={(e) => e.key === "Escape" && setAsking(false)}
            maxLength={300}
            placeholder="Tell Sift why (optional)"
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
  const { update, notePaused } = useInbox();
  const [text, setText] = useState(m.draft ?? "");
  const [busy, setBusy] = useState<"draft" | "waiting" | "send" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const canSend = m.source !== "slack";

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(320, Math.max(44, el.scrollHeight)) + "px";
  }, [text]);

  if (m.sentAt) return <p className="px-8 pb-6 text-[13px] text-ok">Reply sent with {TOOLKIT_NAMES[m.source]}.</p>;

  const draft = async () => {
    setBusy("draft");
    try {
      let r: Message;
      try {
        r = await api<Message>(`/api/messages/${m.id}/draft`, { method: "POST" });
      } catch (e) {
        if (!(e instanceof ApiFailure) || e.code !== "busy") throw e;
        setBusy("waiting");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setBusy("draft");
        r = await api<Message>(`/api/messages/${m.id}/draft`, { method: "POST" });
      }
      setText(r.draft ?? "");
      update(r);
    } catch (e) {
      if (e instanceof ApiFailure && isAiPaused(e)) {
        notePaused();
        toast(AI_PAUSED_MESSAGE);
      } else toast.error(e instanceof ApiFailure ? e.message : "Couldn't write a draft.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    try {
      update(await api<Message>(`/api/messages/${m.id}/send`, { method: "POST", json: { body: text, confirm: true } }));
      toast.success(`Sent with ${TOOLKIT_NAMES[m.source]}`);
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : "Your reply was not sent.");
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  };

  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-6 pb-4 sm:px-6">
      <div className="rounded-xl border border-line-strong bg-surface shadow-card transition-colors focus-within:border-ink/30">
        <textarea
          ref={ta}
          aria-label="Your reply"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setConfirm(false);
          }}
          disabled={busy === "draft" || busy === "waiting"}
          placeholder={busy === "waiting" ? "Waiting a moment…" : busy === "draft" ? "Writing a draft…" : `Reply to ${senderName(m.from)}…`}
          className="block w-full resize-none bg-transparent px-4 pt-3 text-[14.5px] leading-relaxed text-ink outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <button
            onClick={() => void draft()}
            disabled={!!busy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-accent-text transition-colors hover:bg-accent-soft disabled:opacity-50"
          >
            <Sparkle size={13} weight="fill" />
            {busy === "waiting" ? "Waiting…" : busy === "draft" ? "Writing…" : text ? "Rewrite" : "Draft with AI"}
          </button>
          {text ? (
            <button
              onClick={() => void navigator.clipboard.writeText(text).then(() => toast("Copied"))}
              className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-ink/[0.05] hover:text-ink"
              aria-label="Copy"
              title="Copy"
            >
              <Copy size={14} />
            </button>
          ) : null}
          <span className="flex-1" />
          {!canSend ? (
            <span className="pr-2 text-[12px] text-faint">Copy it, then reply in Slack</span>
          ) : (
            <Button
              size="sm"
              variant={confirm ? "primary" : "secondary"}
              loading={busy === "send"}
              disabled={!text.trim() || busy === "draft" || busy === "waiting"}
              onClick={() => (confirm ? void send() : setConfirm(true))}
              className={cx("h-7 px-2.5 text-[12.5px]", confirm && "bg-accent-text text-white hover:bg-accent-text/90")}
            >
              {confirm ? `Send to ${senderName(m.from)}?` : "Send"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
