import type { Toolkit } from "@/lib/types";
import { cx } from "../ui";

/** Brand marks for the accounts Sift can connect. Real logos read faster than generic icons. */
export function GmailLogo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 256 193" width={size} height={(size * 193) / 256} aria-hidden className={cx("shrink-0", className)}>
      <path fill="#4285F4" d="M58.182 192.05V93.14L27.507 65.077L0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455z" />
      <path fill="#34A853" d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837l-27.026 25.798z" />
      <path fill="#EA4335" d="m58.182 93.14l-4.174-38.647l4.174-36.989L128 69.868l69.818-52.364l4.669 34.992l-4.669 40.644L128 145.504z" />
      <path fill="#FBBC04" d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945z" />
      <path fill="#C5221F" d="m0 49.504l26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23z" />
    </svg>
  );
}

export function OutlookLogo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cx("shrink-0", className)}>
      <rect x="10" y="5" width="20" height="22" rx="2.5" fill="#1490DF" />
      <path fill="#28A8EA" d="M10 16h20v8.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 10 24.5z" />
      <rect x="2" y="9" width="16" height="16" rx="2.5" fill="#0A5FAB" />
      <ellipse cx="10" cy="17" rx="3.6" ry="4.4" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function SlackLogo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cx("shrink-0", className)}>
      <path fill="#E01E5A" d="M7.2 19.4a3 3 0 1 1-3-3h3zm1.5 0a3 3 0 0 1 6 0v7.4a3 3 0 0 1-6 0z" />
      <path fill="#36C5F0" d="M11.7 7.2a3 3 0 1 1 3-3v3zm0 1.5a3 3 0 0 1 0 6H4.2a3 3 0 0 1 0-6z" />
      <path fill="#2EB67D" d="M23.8 11.7a3 3 0 1 1 3 3h-3zm-1.5 0a3 3 0 0 1-6 0V4.2a3 3 0 0 1 6 0z" />
      <path fill="#ECB22E" d="M19.3 23.8a3 3 0 1 1-3 3v-3zm0-1.5a3 3 0 0 1 0-6h7.5a3 3 0 0 1 0 6z" />
    </svg>
  );
}

export function SourceLogo({ source, size = 16, className }: { source: Toolkit; size?: number; className?: string }) {
  if (source === "gmail") return <GmailLogo size={size} className={className} />;
  if (source === "outlook") return <OutlookLogo size={size} className={className} />;
  return <SlackLogo size={size} className={className} />;
}

/** "City Power <billing@x.com>" -> "City Power" */
export function senderName(from: string | null | undefined): string | null {
  if (!from) return null;
  const name = from.replace(/<[^>]*>/g, "").replace(/"/g, "").trim();
  return name || from.replace(/[<>]/g, "").trim() || null;
}

/** A soft, stable color per sender so the list is scannable by who it came from. */
export function Avatar({ name, size = 32, className }: { name: string | null; size?: number; className?: string }) {
  const n = (name ?? "You").trim();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 select-none items-center justify-center rounded-full font-[560]", className)}
      style={{ width: size, height: size, fontSize: size * 0.42, background: `oklch(0.925 0.045 ${h})`, color: `oklch(0.4 0.1 ${h})` }}
    >
      {(n.match(/[A-Za-z0-9]/)?.[0] ?? "•").toUpperCase()}
    </span>
  );
}

/** "now", "12m", "3h", "Tue", "Nov 4" */
export function ago(isoDate: string, now = Date.now()): string {
  const d = new Date(isoDate);
  const mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 6) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const BUCKET_LABEL = { important: "Needs you", later: "Worth a look", low: "Low priority" } as const;
