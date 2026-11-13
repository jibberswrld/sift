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
- Your inbox is stored on this computer (PGlite in your app-data folder). Message text goes to the AI only to sort it and to write drafts you ask for.

## Run it

Node.js 22+ and pnpm:

```sh
pnpm install && pnpm build
pnpm start          # http://127.0.0.1:3017
```

### Without real accounts

```sh
node scripts/mock-connector.mjs   # fake Gmail, Outlook and Slack on :4666
node scripts/mock-publik.mjs      # fake publik on :4555 (set MOCK_UPSTREAM_* to reach a real model)
PUBLIK_ORIGIN=http://localhost:4555 PUBLIK_APP_TOKEN=pat_mocktoken CONNECTOR_ORIGIN=http://localhost:4666 SIFT_DATA_DIR=/tmp/sift pnpm start
```

`GET localhost:4666/mock/arrive` drops a new email into the fake Gmail; `GET /mock/calls` lists every reply the app sent.

## How it fits together

- `src/lib/server/sources.ts`: reading from and replying through Gmail, Outlook and Slack.
- `src/lib/server/triage.ts`: the sorter prompt (your context + your corrections + the messages).
- `src/lib/server/inbox.ts`: sync, re-sort, moving messages, drafts and sending.
- `src/app/api/connector/*`: the hosted connector. It holds the Composio key, so the app on your computer never does, and it runs only the five allowlisted tools.
- `src/lib/server/publik.ts`, `gate.ts`: Sign in with publik and usage counting. AI runs on `publik-balanced`, or your own OpenAI-compatible key.

## License

MIT
