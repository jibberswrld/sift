import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";

export const metadata: Metadata = { title: "Terms" };

const SECTIONS: [string, string[]][] = [
  [
    "A free service, as it is",
    [
      "Sift is free to use. It is provided as it is, without any warranty, and it may change, pause or stop at any time.",
      "To the extent the law allows, Sift is not liable for any loss that comes from using it, including missed or mis-sorted messages.",
    ],
  ],
  [
    "The AI can be wrong",
    [
      "Sift sorts and summarizes messages with AI. It can put a message in the wrong pile or describe it wrongly. Check anything important in your own inbox.",
      "Drafts are suggestions. You are responsible for every reply you send, including what Sift drafted for you.",
    ],
  ],
  [
    "Daily limits",
    [
      "Sift pays for the AI, so it is limited per person per day. When the free AI runs out for the day, sorting and drafts pause until the next day. Your messages stay where they are.",
    ],
  ],
  [
    "Acceptable use",
    [
      "Use Sift only with accounts you are allowed to use.",
      "Don't use it to send spam or harassment, to break the law, or to get around its limits, overload it, or break into it.",
      "Access can be removed for anyone who does.",
    ],
  ],
  [
    "Your data",
    [
      "What Sift stores and how to delete it is in the privacy summary. You can delete everything from Settings at any time.",
    ],
  ],
];

export default function Terms() {
  return (
    <div className="mx-auto max-w-[680px] px-5 py-10 sm:px-8 sm:py-14">
      <Wordmark />
      <h1 className="mt-12 text-[36px] font-semibold tracking-[-0.03em]">Terms</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">The short version of the rules for using Sift.</p>
      <div className="mt-10 space-y-10">
        {SECTIONS.map(([h, items]) => (
          <section key={h}>
            <h2 className="text-[18px] font-semibold">{h}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-2">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
        <section>
          <h2 className="text-[18px] font-semibold">Contact</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Questions or problems: reach the developer from{" "}
            <a className="text-accent-text underline underline-offset-2" href="https://publikhq.com/sift" target="_blank" rel="noreferrer">
              Sift&rsquo;s page on publik
            </a>
            .
          </p>
        </section>
      </div>
      <p className="mt-12 text-[14px] text-muted">
        Read the <Link className="text-accent-text underline underline-offset-2" href="/privacy">privacy summary</Link> or{" "}
        <Link className="text-accent-text underline underline-offset-2" href="/">go back home</Link>.
      </p>
    </div>
  );
}
