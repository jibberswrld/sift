import Link from "next/link";
import { cx } from "./ui";

/** Three bars, longest first: a sorted pile. The top one is the one accent: what needs you. */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cx("shrink-0", className)}>
      <rect x="3" y="5" width="18" height="3.2" rx="1.6" fill="var(--accent-text)" />
      <rect x="3" y="10.4" width="13" height="3.2" rx="1.6" fill="currentColor" opacity="0.72" />
      <rect x="3" y="15.8" width="8" height="3.2" rx="1.6" fill="currentColor" opacity="0.38" />
    </svg>
  );
}

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-2 rounded-lg text-ink", className)} aria-label="Sift home">
      <LogoMark />
      <span className="font-serif text-[21px] font-medium leading-none tracking-[-0.02em]">Sift</span>
    </Link>
  );
}
