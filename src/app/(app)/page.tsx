"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowClockwise, CaretRight, Check, WarningCircle } from "@phosphor-icons/react";
import { TOOLKIT_NAMES, TOOLKITS, type Bucket, type Message } from "@/lib/types";
import { ago, BUCKET_LABEL, senderName, SourceLogo } from "@/components/app/bits";
import { useInbox } from "@/components/app/inbox";
import { Reader } from "@/components/app/reader";
import { Button, cx, Skeleton, Spinner } from "@/components/ui";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function InboxPage() {
  const { messages, loadError, connections, selectedId, select, refresh, sync } = useInbox();
  const groups = useMemo(() => {
    const g: Record<Bucket | "unsorted", Message[]> = { important: [], later: [], low: [], unsorted: [] };
    for (const m of messages ?? []) g[m.bucket ?? "unsorted"].push(m);
    return g;
  }, [messages]);
  const selected = messages?.find((m) => m.id === selectedId) ?? null;
  const anyConnected = connections ? TOOLKITS.some((t) => connections.connected[t]) : true;

  let body: React.ReactNode;
  if (loadError && !messages) {
    body = (
      <div role="alert" className="mt-8 rounded-xl bg-danger-soft px-5 py-4 text-[14px] text-ink-2">
        {loadError}
        <Button size="sm" className="ml-3" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  } else if (!messages || (messages.length === 0 && sync.running)) {
    body = (
      <div className="mt-8 space-y-5" aria-label="Loading your inbox">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2.5 h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  } else if (!anyConnected && messages.length === 0) {
    body = <ConnectFirst />;
  } else {
    body = (
      <>
        <Section bucket="important" items={groups.important} />
        <Section bucket="later" items={groups.later} />
        {groups.unsorted.length ? <Section bucket="unsorted" items={groups.unsorted} /> : null}
        <Section bucket="low" items={groups.low} collapsible />
        {messages.length === 0 ? <p className="mt-10 font-serif text-[17px] italic text-muted">Nothing here yet. New messages show up the next time Sift checks.</p> : null}
      </>
    );
  }

  return (
    <div className={cx("xl:grid", selected ? "xl:grid-cols-[minmax(0,1fr)_480px]" : "")}>
      <main className="mx-auto w-full max-w-[880px] px-4 pt-7 pb-24 sm:px-8 sm:pt-10">
        <Briefing groups={groups} anyConnected={anyConnected} />
        {body}
      </main>
      {selected ? <Reader key={selected.id} message={selected} onClose={() => select(null)} /> : null}
    </div>
  );
}

/* ------------------------------ Briefing ------------------------------ */

function Briefing({ groups, anyConnected }: { groups: Record<Bucket | "unsorted", Message[]>; anyConnected: boolean }) {
  const { messages, sync, runSync, lastSyncAt } = useInbox();
  const n = groups.important.length;
  const empty = !messages || (messages.length === 0 && (!!sync.running || !anyConnected));
  const headline = !messages
    ? " "
    : !anyConnected && messages.length === 0
      ? "One inbox for everything."
      : messages.length === 0 && sync.running
        ? "Reading your inbox."
        : n === 0
          ? "Nothing needs you right now."
          : `${n === 1 ? "One thing needs" : `${words(n)} things need`} you.`;
  const lead = groups.important[0];
  return (
    <header className="border-b border-line pb-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.015em] text-ink sm:text-[34px]">{headline}</h1>
          {lead?.summary ? (
            <p className="mt-2 max-w-[60ch] text-[15px] text-ink-2">
              First up: <span className="text-ink">{senderName(lead.from)}</span>. {lead.summary}
            </p>
          ) : null}
          <p className={cx("mt-2 text-[13px] text-muted tabular-nums", empty && "hidden")}>
            {groups.later.length} worth a look · {groups.low.length} low priority
            {lastSyncAt ? ` · checked ${ago(lastSyncAt) === "now" ? "just now" : `${ago(lastSyncAt)} ago`}` : ""}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void runSync()} disabled={!!sync.running} className="mt-1.5">
          {sync.running ? <Spinner /> : <ArrowClockwise size={14} />}
          {sync.running ? "Sorting" : "Check now"}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {sync.running && sync.step ? (
          <motion.p
            key="step"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="mt-4 flex items-center gap-2 text-[13px] text-muted"
            aria-live="polite"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-accent-text" aria-hidden />
            {sync.step}…
          </motion.p>
        ) : null}
      </AnimatePresence>
      {sync.error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-ink-2">
          <WarningCircle size={16} className="mt-px shrink-0 text-danger" />
          <span>
            {sync.error.message}
            {sync.error.topUpUrl ? (
              <a href={sync.error.topUpUrl} target="_blank" rel="noreferrer" className="ml-1.5 font-medium text-accent-text underline-offset-2 hover:underline">
                Top up
              </a>
            ) : null}
          </span>
        </p>
      ) : null}
    </header>
  );
}

const words = (n: number) => (["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ?? String(n));

/* ------------------------------ Sections ------------------------------ */

const SECTION_NOTE: Record<Bucket | "unsorted", string> = {
  important: "Waiting on you, or matters to you",
  later: "No rush",
  low: "Newsletters, promotions, notifications",
  unsorted: "Sift hasn't sorted these yet",
};

function Section({ bucket, items, collapsible }: { bucket: Bucket | "unsorted"; items: Message[]; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  if (!items.length && bucket !== "important") return null;
  const title = bucket === "unsorted" ? "Not sorted" : BUCKET_LABEL[bucket];
  const lead = bucket === "important";
  return (
    <section className="mt-9" aria-label={title}>
      <button
        onClick={() => collapsible && setOpen((o) => !o)}
        className={cx("flex w-full items-baseline gap-3 text-left", collapsible ? "cursor-pointer" : "cursor-default")}
        aria-expanded={collapsible ? open : undefined}
        tabIndex={collapsible ? 0 : -1}
      >
        {collapsible ? <CaretRight size={12} className={cx("self-center text-muted transition-transform duration-150", open && "rotate-90")} /> : null}
        <h2 className={cx("text-[13px] font-semibold uppercase tracking-[0.06em]", lead ? "text-accent-text" : "text-ink-2")}>{title}</h2>
        <span className="text-[13px] tabular-nums text-faint">{items.length}</span>
        <span className="ml-auto hidden text-[12.5px] text-faint sm:block">{SECTION_NOTE[bucket]}</span>
      </button>
      {lead && !items.length ? <p className="mt-3 font-serif text-[16px] italic text-muted">You&rsquo;re clear. Sift will put anything that needs you here.</p> : null}
      {open ? (
        <ul className={cx("mt-2.5", lead ? "space-y-2" : "divide-y divide-line border-y border-line")}>
          <AnimatePresence initial={false}>
            {items.map((m) => (lead ? <LeadRow key={m.id} m={m} /> : <CompactRow key={m.id} m={m} />))}
          </AnimatePresence>
        </ul>
      ) : null}
    </section>
  );
}

function useRowMotion() {
  const reduce = useReducedMotion();
  return reduce
    ? {}
    : {
        layout: "position" as const,
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
      };
}

function DoneButton({ m }: { m: Message }) {
  const { setDone } = useInbox();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void setDone(m.id, true);
      }}
      aria-label="Mark done"
      title="Mark done"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-[opacity,color,background-color] duration-150 group-hover:opacity-100 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100"
    >
      <Check size={15} />
    </button>
  );
}

function LeadRow({ m }: { m: Message }) {
  const { select, selectedId } = useInbox();
  const motionProps = useRowMotion();
  const active = selectedId === m.id;
  return (
    <motion.li {...motionProps}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => select(m.id)}
        onKeyDown={(e) => e.key === "Enter" && select(m.id)}
        className={cx(
          "group relative grid cursor-pointer grid-cols-[18px_1fr_auto] gap-x-3 rounded-xl border bg-surface px-4 py-3.5 transition-[border-color,background-color] duration-150",
          active ? "border-line-strong shadow-card" : "border-line hover:border-line-strong",
        )}
      >
        <SourceLogo source={m.source} size={15} className="mt-[3px]" />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 text-[13.5px]">
            <span className="truncate font-semibold text-ink">{senderName(m.from)}</span>
            {m.subject ? <span className="truncate text-muted">{m.subject}</span> : null}
            {m.needsReply ? <span className="ml-auto shrink-0 text-[12px] font-medium text-accent-text">Reply needed</span> : null}
          </div>
          <p className="mt-1 text-[15px] leading-snug text-ink">{m.summary ?? m.preview}</p>
          {m.reason ? <Annotation m={m} /> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[12px] tabular-nums text-faint">{ago(m.receivedAt)}</span>
          <DoneButton m={m} />
        </div>
      </div>
    </motion.li>
  );
}

/** The signature: why Sift put it here, as a serif margin note. */
function Annotation({ m }: { m: Message }) {
  return (
    <p className="mt-1.5 flex items-baseline gap-2 font-serif text-[14.5px] italic leading-snug text-muted">
      <span aria-hidden className={cx("inline-block h-px w-3 shrink-0 translate-y-[-4px]", m.bucket === "important" ? "bg-accent-text" : "bg-faint")} />
      <span>{m.reason}</span>
    </p>
  );
}

function CompactRow({ m }: { m: Message }) {
  const { select, selectedId } = useInbox();
  const motionProps = useRowMotion();
  return (
    <motion.li {...motionProps}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => select(m.id)}
        onKeyDown={(e) => e.key === "Enter" && select(m.id)}
        className={cx(
          "group grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 px-1 py-2.5 text-[14px] transition-colors duration-150 sm:grid-cols-[16px_minmax(0,9.5rem)_minmax(0,1fr)_auto]",
          selectedId === m.id ? "bg-ink/[0.045]" : "hover:bg-ink/[0.03]",
        )}
      >
        <SourceLogo source={m.source} size={13} />
        <span className="flex min-w-0 flex-col sm:contents">
          <span className="truncate font-medium text-ink-2">{senderName(m.from)}</span>
          <span className="truncate text-muted">
            <span className="text-ink-2">{m.summary ?? m.subject ?? m.preview}</span>
            {m.reason ? <span className="ml-2 hidden font-serif italic text-faint md:inline">{m.reason}</span> : null}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[12px] tabular-nums text-faint">{ago(m.receivedAt)}</span>
          <DoneButton m={m} />
        </span>
      </div>
    </motion.li>
  );
}

/* ------------------------------ First run ------------------------------ */

function ConnectFirst() {
  const { connections, connect, linking } = useInbox();
  return (
    <div className="mt-10 grid gap-10 md:grid-cols-[1fr_280px]">
      <div>
        <h2 className="font-serif text-[22px] tracking-[-0.01em]">Bring your messages in.</h2>
        <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
          Connect the accounts you check. Each time you open Sift it pulls in what&rsquo;s new and sorts it: what needs you, what can wait, and what you can skip.
        </p>
        {connections && !connections.available ? <p className="mt-4 text-[13.5px] text-danger">{connections.message}</p> : null}
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {TOOLKITS.map((t) => (
            <li key={t} className="flex items-center gap-3 py-3">
              <SourceLogo source={t} size={18} />
              <span className="text-[15px] font-medium">{TOOLKIT_NAMES[t]}</span>
              <span className="text-[13px] text-faint">{t === "slack" ? "DMs and channels" : "Inbox"}</span>
              <Button
                size="sm"
                variant={t === "gmail" ? "primary" : "secondary"}
                className="ml-auto"
                disabled={!connections?.available || !!linking}
                onClick={() => void connect(t)}
              >
                {linking === t ? "Waiting for you…" : "Connect"}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <aside className="border-l border-line pl-6 text-[14px] leading-relaxed text-muted max-md:border-l-0 max-md:border-t max-md:pl-0 max-md:pt-6">
        <p className="font-serif text-[16px] italic text-ink-2">Tell Sift what matters.</p>
        <p className="mt-1.5">
          &ldquo;Anything from my counselor or Coach Rivera is important. I don&rsquo;t care about LinkedIn.&rdquo; It reads this every time it sorts.
        </p>
        <Link href="/teach" className="mt-3 inline-block font-medium text-accent-text underline-offset-2 hover:underline">
          Write yours
        </Link>
      </aside>
    </div>
  );
}
