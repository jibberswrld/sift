import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";

export const metadata: Metadata = { title: "Privacy" };

const SECTIONS: [string, string[]][] = [
  [
    "What Sift stores",
    [
      "New messages from the accounts you connect (sender, subject, text and a link back to the original), with the summary and pile Sift gave each one.",
      "Message text, senders and subjects are stored unencrypted in Sift's database until you delete them. Access to the database is limited to Sift's server.",
      "What you wrote on the What matters page, the corrections you made, and reply drafts.",
      "It is kept in Sift's database, linked to your publik account and visible only to you.",
      "Your publik handle and time zone, and an encrypted publik key for each browser you sign in on.",
      "Simple usage events (for example \"the inbox was sorted\") without any message content.",
    ],
  ],
  [
    "How your messages are processed",
    [
      "To sort messages and write drafts, their sender, subject and text are sent through publik API to the AI provider that runs the model. Sift pays for it. publik does not train on requests.",
      "Message content is treated as data. Instructions inside a message can't make Sift do anything.",
      "Gmail, Outlook and Slack connect through Composio. Your sign-in tokens for those accounts are held by Composio, not by Sift.",
      "Sift reads new messages each time it checks, and sends a reply only after you press Send and confirm. It never deletes, archives or changes anything in your accounts. You can disconnect in Settings.",
      "Connecting Slack lets Sift search the whole workspace you can see, including your direct messages and private channels. Sift stores the recent messages that search returns.",
    ],
  ],
  [
    "Deleting your data",
    [
      "Remove any correction from the What matters page.",
      "Settings → Delete everything permanently deletes your Sift account and everything Sift stored for it: messages, summaries, drafts, what you taught it, usage events and sign-in sessions. It also disconnects Gmail, Outlook and Slack from Sift.",
      "Anonymous daily AI allowance counters remain after deletion so signing in again cannot reset the limit. They contain a secret-keyed account hash, date and counts, with no messages or handle.",
      "It does not touch anything in your Gmail, Outlook or Slack accounts themselves.",
    ],
  ],
  [
    "Sign in",
    [
      "Sift uses Sign in with publik. publik counts that you used the app this week; it does not receive your messages except as AI requests.",
    ],
  ],
];

export default function Privacy() {
  return (
    <div className="mx-auto max-w-[680px] px-5 py-10 sm:px-8 sm:py-14">
      <Wordmark />
      <h1 className="mt-12 text-[36px] font-semibold tracking-[-0.03em]">Privacy</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">Plain-language summary of what happens to what you give Sift.</p>
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
      </div>
      <p className="mt-12 text-[14px] text-muted">
        Read the <Link className="text-accent-text underline underline-offset-2" href="/terms">terms</Link> or{" "}
        <Link className="text-accent-text underline underline-offset-2" href="/">go back home</Link>.
      </p>
    </div>
  );
}
