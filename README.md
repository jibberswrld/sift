# Sift

**Gmail, Outlook and Slack in one inbox, sorted by what needs you.**

Every time you open Sift it pulls in what's new from the accounts you connected and sorts each message into one of three piles:

- **Needs you**: a real person waiting on you, a deadline, money, an account problem, or anything you said matters.
- **Worth a look**: updates, receipts, shipping, group threads. No rush.
- **Low priority**: newsletters, promotions, social notifications.

Each message gets a one-line summary and a short note on *why* it landed where it did.

## Teach it

- **What matters** is a page where you write, in your own words, what's important to you ("I quit the team, so Coach Rivera can wait"). Sift reads it on every sort. Save it and Sift re-sorts the last week straight away.
- **Move a message** to another pile and, if you like, say why. Sift keeps that as a correction and treats similar messages the same way next time. You can remove any correction from the What matters page.

## Replies

Open a message and Sift drafts a short reply from what's in it. Where only you know the answer it leaves a `[blank]`. Nothing is sent until you press **Send** and confirm. Gmail and Outlook replies go out from your own account, in the original thread. Slack messages get a draft to copy.

## Built to be trusted

- Sift never deletes, archives or changes anything in your accounts. **Done** only hides a message in Sift.
- Messages are data, never instructions. A message that tries to instruct the AI is flagged and sorted by what it really is.
- Your inbox is stored in Sift's database, only for you. Message text goes to the AI only to sort it and to write drafts you ask for.
- Free to use: the AI runs on Sift's publik credits, so there is no plan to pick and no key to paste.

## Run it

Sift is a hosted web app on Vercel (project `sift`, Neon Postgres). See `.env.example` for the environment it needs.

### Locally, without real accounts

Node.js 22+ and pnpm. With no `DATABASE_URL`, data goes to an embedded PGlite in `SIFT_DATA_DIR`.

```sh
pnpm install && pnpm build
node scripts/mock-connector.mjs   # fake Gmail, Outlook and Slack on :4666
node scripts/mock-publik.mjs      # fake publik on :4555 (set MOCK_UPSTREAM_* to reach a real model)
PUBLIK_ORIGIN=http://localhost:4555 PUBLIK_APP_TOKEN=pat_mocktoken CONNECTOR_ORIGIN=http://localhost:4666 SIFT_DATA_DIR=/tmp/sift pnpm start
```

`GET localhost:4666/mock/arrive` drops a new email into the fake Gmail; `GET /mock/calls` lists every reply the app sent.

## How it fits together

- `src/lib/server/sources.ts`: reading from and replying through Gmail, Outlook and Slack.
- `src/lib/server/connector.ts`: Composio on the server, with an allowlist of the five tools Sift may run.
- `src/lib/server/triage.ts`: the sorter prompt (your context + your corrections + the messages).
- `src/lib/server/inbox.ts`: sync, re-sort, moving messages, drafts and sending.
- `src/lib/server/publik.ts`, `gate.ts`, `session.ts`: Sign in with publik per browser session, usage counting, AI on the developer's credits.

## License

MIT
