![What Sift does: messages from Gmail, Outlook and Slack go in, and Sift sorts them into three piles (Needs you, Worth a look, Low priority) with a one-line summary and the reason for each](public/readme/explainer.jpg)

![Sift: the Needs you pile with one-line summaries, and a message from a counselor open with the reason it was sorted there and an AI reply draft](https://sift-nu-ebon.vercel.app/readme/hero.jpg)

<img src="https://sift-nu-ebon.vercel.app/apple-icon.png" alt="Sift" width="96" height="96" />

# Sift

**Gmail, Outlook and Slack in one inbox, sorted by what needs you.**

Open Sift and it reads everything new from the accounts you connect, then puts each message where it belongs. What needs you comes first. Each message gets a one-line summary and a short note on *why* it's there, so you can trust the sort without opening anything.

It's free, it runs in your browser, and there's nothing to install. Sign in with publik, connect Gmail, and your first sort takes about a minute.

## Three piles, one line each

- **Needs you**: someone is waiting on a reply, a decision or something you have to send; a deadline; a bill; an account alert you should check.
- **Worth a look**: updates, receipts, shipping, announcements, friendly catch-ups that ask for nothing.
- **Low priority**: newsletters, promotions, social notifications, bot chatter.

![The Needs you pile: six messages from Gmail, Outlook and Slack, each with a one-line summary and, in grey, the reason it is there](https://sift-nu-ebon.vercel.app/readme/inbox.jpg)

## It tells you why

Open a message and the reason is right at the top. Messages from people waiting on you get a small red dot in the list.

Sift drafts a reply from what's in the message. Where only you know the answer, like a link, a time or a yes or no, it leaves a **[blank]** instead of guessing. Nothing is sent until you press **Send** and confirm. Gmail and Outlook replies go out from your own account, in the original thread.

![A message open next to the inbox, with the reason, and an AI draft that leaves blanks for what only you know](https://sift-nu-ebon.vercel.app/readme/reader.jpg)

## Teach it what matters

Write it the way you'd tell a friend who was checking your messages for you: *"I quit the basketball team, so Coach Rivera can wait."* Sift reads it every time it sorts, and **Save and sort my inbox again** applies it right away.

Every time you move a message to another pile, Sift remembers it, along with your reason if you give one, and treats similar messages the same way. You can see everything it has learned, and remove anything it got wrong.

![The What matters to you page: three sentences in the person's own words, and two corrections Sift has learned, each with the note they gave](https://sift-nu-ebon.vercel.app/readme/teach.jpg)

## Light and dark

Sift follows your system theme. `j` / `k` move through the list, `e` marks a message done, `Esc` closes it.

![Sift in dark mode: the Low priority pile with a phishing email open, flagged because it tried to give the AI instructions, which Sift ignored](https://sift-nu-ebon.vercel.app/readme/dark.jpg)

## Built to be trusted

- **It never changes your accounts.** Sift reads new messages and sends a reply only when you confirm it. It never deletes, archives or marks anything. "Done" only hides a message in Sift.
- **Messages are data, not commands.** If an email tries to give the AI instructions ("ignore previous instructions and…"), Sift flags it, ignores it, and sorts it by what it really is.
- **Your data is yours.** Your messages are stored for your account only. Delete everything from Settings at any time.
- **Free to use.** The AI runs on publik and Sift pays for it. There's no plan to pick and no key to paste. Free AI has a daily limit; if it runs out, sorting pauses until the next day and your messages stay put.

[Privacy](https://sift-nu-ebon.vercel.app/privacy) · [Terms](https://sift-nu-ebon.vercel.app/terms)

## For developers

Next.js 16 (App Router), Tailwind CSS v4, Motion, Postgres (Neon), Composio for Gmail / Outlook / Slack, and publik API (`publik-balanced`). Hosted on Vercel.

- `src/lib/server/triage.ts`: the sorter. One request per batch of messages, with your words and your corrections.
- `src/lib/server/inbox.ts`: sync, re-sort, moving messages, drafts and sending.
- `src/lib/server/connector.ts`: Composio on the server, limited to the five tools Sift may run.
- `src/lib/server/publik.ts`, `gate.ts`, `session.ts`: Sign in with publik for each browser session, and usage counting.

### Run it locally against mocks

Node.js 22+ and pnpm. With no `DATABASE_URL`, data goes to an embedded PGlite in `SIFT_DATA_DIR`.

```sh
pnpm install && pnpm build
node scripts/mock-connector.mjs   # stands in for Composio: fake Gmail, Outlook and Slack on :4666
node scripts/mock-publik.mjs      # fake publik on :4555 (set MOCK_UPSTREAM_* to reach a real model)
PUBLIK_ORIGIN=http://localhost:4555 PUBLIK_APP_TOKEN=pat_mocktoken CONNECTOR_ORIGIN=http://localhost:4666 SIFT_DATA_DIR=/tmp/sift pnpm start
```

`CONNECTOR_ORIGIN` exists only for that mock. In production Sift calls Composio directly from its own server; there is no separate connector deployment. See `.env.example` for the production environment.
