"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { GearSix, Tray, Lightbulb, type Icon } from "@phosphor-icons/react";
import { TOOLKIT_NAMES, TOOLKITS, type Toolkit } from "@/lib/types";
import { Wordmark } from "../brand";
import { cx } from "../ui";
import { api } from "./api";
import { SourceLogo } from "./bits";
import { useInbox } from "./inbox";

const NAV: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Inbox", icon: Tray },
  { href: "/teach", label: "What matters", icon: Lightbulb },
];

const navCls = "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium transition-colors duration-150";

function AccountRow({ t }: { t: Toolkit }) {
  const { connections: c, linking, connect } = useInbox();
  const on = !!c?.connected[t];
  return (
    <li className="flex h-8 items-center gap-2.5 px-2.5 text-[14px] text-ink-2">
      <SourceLogo source={t} size={14} />
      <span className="font-medium">{TOOLKIT_NAMES[t]}</span>
      {on ? (
        <span className="ml-auto size-1.5 rounded-full bg-ok" aria-label="Connected" />
      ) : (
        <button
          onClick={() => void connect(t)}
          disabled={!c || !c.available || !!linking}
          className="ml-auto rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-accent-text transition-colors hover:bg-accent-soft disabled:text-faint disabled:hover:bg-transparent"
        >
          {linking === t ? "Waiting…" : "Connect"}
        </button>
      )}
    </li>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { messages } = useInbox();
  const important = messages?.filter((m) => m.bucket === "important").length ?? 0;
  usePublikPresence();

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col border-r border-line bg-sidebar px-3 py-5 lg:flex">
        <Wordmark className="px-2.5" />
        <nav className="mt-7 space-y-px" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cx(navCls, isActive(n.href) ? "bg-ink/[0.065] text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink")}
            >
              <n.icon size={16} weight={isActive(n.href) ? "fill" : "regular"} />
              {n.label}
              {n.href === "/" && important ? <span className="ml-auto text-[12px] tabular-nums text-accent-text">{important}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="mt-8 px-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">Accounts</div>
        <ul className="mt-1.5">
          {TOOLKITS.map((t) => (
            <AccountRow key={t} t={t} />
          ))}
        </ul>

        <div className="mt-auto">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className={cx(navCls, isActive("/settings") ? "bg-ink/[0.065] text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink")}
          >
            <GearSix size={16} />
            Settings
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-13 items-center gap-1 border-b border-line bg-bg/90 px-4 backdrop-blur-md lg:hidden">
          <Wordmark className="mr-auto" />
          {[...NAV, { href: "/settings", label: "Settings", icon: GearSix }].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-label={n.label}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cx("inline-flex size-9 items-center justify-center rounded-lg", isActive(n.href) ? "bg-ink/[0.065] text-ink" : "text-muted")}
            >
              <n.icon size={19} weight={isActive(n.href) ? "fill" : "regular"} />
            </Link>
          ))}
        </header>
        {children}
      </div>
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
