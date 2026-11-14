"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Check, WarningCircle } from "@phosphor-icons/react";
import { TOOLKIT_NAMES, TOOLKITS, type Bucket, type Message } from "@/lib/types";
import { ago, BUCKET_LABEL, senderName, SourceLogo } from "@/components/app/bits";
import { useInbox } from "@/components/app/inbox";
import { Reader } from "@/components/app/reader";
import { Button, cx, Skeleton } from "@/components/ui";

const TABS: Bucket[] = ["important", "later", "low"];
const EMPTY: Record<Bucket, string> = {
  important: "Nothing needs you right now.",
  later: "Nothing waiting here.",
  low: "No newsletters or promotions.",
};

/** Today / Yesterday / This week / Earlier, in the person's own time zone. */
function dayGroup(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return "Today";
  if (d.getTime() >= start - 86_400_000) return "Yesterday";
  if (d.getTime() >= start - 6 * 86_400_000) return "This week";
  return "Earlier";
}

export default function InboxPage() {
  const { messages, loadError, connections, selectedId, select, refresh, sync, setDone } = useInbox();
  const [tab, setTab] = useState<Bucket>("important");

  const piles = useMemo(() => {
    const p: Record<Bucket, Message[]> = { important: [], later: [], low: [] };
    for (const m of messages ?? []) p[m.bucket ?? "later"].push(m);
    return p;
  }, [messages]);
  const list = piles[tab];
  const selected = messages?.find((m) => m.id === selectedId) ?? null;
  const anyConnected = connections ? TOOLKITS.some((t) => connections.connected[t]) : true;

  // j / k to move, e to mark done: the inbox is meant to be cleared quickly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea")) return;
      const i = list.findIndex((m) => m.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") select(list[Math.min(list.length - 1, i + 1)]?.id ?? null);
      else if (e.key === "k" || e.key === "ArrowUp") select(list[Math.max(0, i - 1)]?.id ?? null);
      else if (e.key === "e" && selectedId) void setDone(selectedId, true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, selectedId, select, setDone]);

  let body: React.ReactNode;
  if (loadError && !messages) {
    body = (
      <p role="alert" className="px-3 py-10 text-[14px] text-ink-2">
        {loadError}{" "}
        <button onClick={() => void refresh()} className="font-medium text-accent-text hover:underline">
          Try again
        </button>
      </p>
    );
  } else if (!messages || (messages.length === 0 && sync.running)) {
    body = (
      <div className="space-y-4 px-3 py-6" aria-label="Loading your inbox">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-6">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    );
  } else if (!anyConnected && messages.length === 0) {
    body = <ConnectFirst />;
  } else if (!list.length) {
    body = <p className="px-3 py-16 text-center font-serif text-[18px] italic text-muted">{EMPTY[tab]}</p>;
  } else {
    const groups: { label: string; items: Message[] }[] = [];
    for (const m of list) {
      const label = dayGroup(m.receivedAt);
      if (groups.at(-1)?.label === label) groups.at(-1)!.items.push(m);
      else groups.push({ label, items: [m] });
    }
    body = groups.map((g) => (
      <section key={g.label} aria-label={g.label}>
        <h3 className="px-3 pt-5 pb-1.5 text-[12px] font-medium text-faint">{g.label}</h3>
        <ul>
          <AnimatePresence initial={false}>
            {g.items.map((m) => (
              <Row key={m.id} m={m} />
            ))}
          </AnimatePresence>
        </ul>
      </section>
    ));
  }

  return (
    <div className={cx("mx-auto max-w-[1400px] lg:grid", selected ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]" : "")}>
      <main className="min-w-0 px-2 pb-24 sm:px-4">
        <nav aria-label="Piles" className="sticky top-14 z-20 -mx-2 flex items-center gap-1 overflow-x-auto bg-bg/90 px-3 pt-4 pb-3 backdrop-blur-md sm:-mx-4 sm:px-5">
          {TABS.map((b) => (
            <button
              key={b}
              onClick={() => {
                setTab(b);
                select(null);
              }}
              aria-current={tab === b ? "page" : undefined}
              className={cx(
                "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-[14px] transition-colors duration-150",
                tab === b ? "bg-ink text-bg font-medium" : "text-muted hover:bg-ink/[0.05] hover:text-ink",
              )}
            >
              {BUCKET_LABEL[b]}
              <span className={cx("text-[12px] tabular-nums", tab === b ? "text-bg/60" : "text-faint")}>{messages ? piles[b].length : ""}</span>
            </button>
          ))}
        </nav>
        {sync.error ? (
          <p role="alert" className="mx-3 mb-2 flex items-start gap-2 text-[13px] text-ink-2">
            <WarningCircle size={15} className="mt-px shrink-0 text-danger" />
            <span>{sync.error}</span>
          </p>
        ) : null}
        {body}
      </main>
      {selected ? <Reader key={selected.id} message={selected} onClose={() => select(null)} /> : null}
    </div>
  );
}

function Row({ m }: { m: Message }) {
  const { select, selectedId, setDone, sync } = useInbox();
  const reduce = useReducedMotion();
  const active = selectedId === m.id;
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => select(active ? null : m.id)}
        onKeyDown={(e) => e.key === "Enter" && select(m.id)}
        className={cx(
          "group relative grid cursor-pointer grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-3 py-2.5 transition-colors duration-100 sm:grid-cols-[14px_10.5rem_minmax(0,1fr)_auto] sm:py-2",
          active ? "bg-ink/[0.06]" : "hover:bg-ink/[0.035]",
        )}
      >
        <SourceLogo source={m.source} size={13} className="opacity-90" />
        <span className="flex min-w-0 flex-col sm:contents">
          <span className={cx("truncate text-[14px] text-ink", m.needsReply ? "font-semibold" : "font-medium")}>{senderName(m.from)}</span>
          {m.bucket || m.reason ? (
            <span className="min-w-0 truncate text-[14px]">
              <span className="text-ink-2">{m.summary ?? m.subject ?? m.preview}</span>
              {m.reason ? <span className="text-faint"> &nbsp;{m.reason}</span> : null}
            </span>
          ) : (
            // Unsorted: the status never gets truncated away on a narrow screen.
            <span className="flex min-w-0 gap-2 text-[14px]">
              <span className="truncate text-ink-2">{m.summary ?? m.subject ?? m.preview}</span>
              <span className="shrink-0 text-faint">{sync.running ? "Sorting…" : "Not sorted yet"}</span>
            </span>
          )}
        </span>
        <span className="relative flex h-6 min-w-10 items-center justify-end">
          <span className="text-[12px] tabular-nums text-faint transition-opacity group-hover:opacity-0">{ago(m.receivedAt)}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void setDone(m.id, true);
            }}
            aria-label="Mark done"
            title="Mark done (E)"
            className="absolute right-0 inline-flex size-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-ink/[0.07] hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Check size={14} />
          </button>
        </span>
        {m.needsReply ? <span aria-label="Waiting on your reply" className="absolute top-1/2 left-0.5 size-1.5 -translate-y-1/2 rounded-full bg-accent-text" /> : null}
      </div>
    </motion.li>
  );
}

function ConnectFirst() {
  const { connections, connect, linking } = useInbox();
  return (
    <div className="mx-auto max-w-[440px] px-3 py-16">
      <h1 className="font-serif text-[28px] leading-tight tracking-[-0.01em]">Bring your messages in.</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
        Connect what you check. Each time you open Sift it pulls in what&rsquo;s new and sorts it for you.
      </p>
      {connections && !connections.available ? <p className="mt-4 text-[13.5px] text-danger">{connections.message}</p> : null}
      <ul className="mt-7 space-y-1">
        {TOOLKITS.map((t) => (
          <li key={t} className="flex items-center gap-3 rounded-lg py-2">
            <SourceLogo source={t} size={18} />
            <span className="text-[15px] font-medium">{TOOLKIT_NAMES[t]}</span>
            <Button
              size="sm"
              variant={t === "gmail" ? "primary" : "secondary"}
              className="ml-auto"
              disabled={!connections?.available || !!linking}
              onClick={() => void connect(t)}
            >
              {linking === t ? "Waiting…" : "Connect"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
