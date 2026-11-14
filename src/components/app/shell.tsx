"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { GearSix, Lightbulb } from "@phosphor-icons/react";
import { Wordmark } from "../brand";
import { cx } from "../ui";
import { api } from "./api";
import { ago } from "./bits";
import { useInbox } from "./inbox";

/** One quiet top bar. The inbox page puts its pile tabs in it; everything else is two icons. */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { sync, lastSyncAt, runSync } = useInbox();
  usePublikPresence();

  const icon = (href: string, label: string, Icon: typeof GearSix) => (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={path.startsWith(href) ? "page" : undefined}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
        path.startsWith(href) ? "bg-ink/[0.07] text-ink" : "text-muted hover:bg-ink/[0.05] hover:text-ink",
      )}
    >
      <Icon size={17} weight={path.startsWith(href) ? "fill" : "regular"} />
    </Link>
  );

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Wordmark />
          <span className="flex-1" />
          <button
            onClick={() => void runSync()}
            disabled={!!sync.running}
            className="hidden items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] tabular-nums text-faint transition-colors hover:text-ink disabled:hover:text-faint sm:inline-flex"
            title="Check for new messages"
          >
            <span className={cx("size-1.5 rounded-full", sync.running ? "animate-pulse bg-accent-text" : "bg-ok/70")} aria-hidden />
            {sync.running ? `${sync.step ?? "Checking"}…` : lastSyncAt ? `Checked ${ago(lastSyncAt) === "now" ? "just now" : `${ago(lastSyncAt)} ago`}` : "Check now"}
          </button>
          {icon("/teach", "What matters to you", Lightbulb)}
          {icon("/settings", "Settings", GearSix)}
        </div>
      </header>
      {children}
    </div>
  );
}

/** Usage counting for publik: app_opened once, active_session heartbeats while the tab is visible. */
function usePublikPresence() {
  useEffect(() => {
    void api("/api/publik/opened", { method: "POST" }).catch(() => {});
    const beat = () => {
      if (document.visibilityState === "visible") void api("/api/publik/heartbeat", { method: "POST" }).catch(() => {});
    };
    const id = setInterval(beat, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
}
