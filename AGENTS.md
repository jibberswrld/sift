<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## publik API
- Base URL: https://publikhq.com/api/v1 (OpenAI Chat Completions, Responses, Anthropic Messages)
- Models: publik-fast, publik-balanced, publik-smart only; never a vendor model name
- Sift is a hosted web app (listing outputType "hosted_web"), deployed on Vercel project `sift` with Neon Postgres
- Sign in with publik: the gate (`src/lib/server/gate.ts`, UI `src/components/app/gate.tsx`) runs before any app screen. GET /api/gate never creates anything; the Sign in click (POST /api/gate) creates the session and its own install key (POST /api/v1/installs), stored encrypted in `sessions.publik_key_enc` with APP_SECRET, never sent to the browser. Keep it that way so page loads and bots don't make installs
- Usage telemetry (app_opened / active_session) goes out with each session's own key, so each signed-in person counts (`src/lib/server/publik.ts`)
- AI calls are paid by the developer's fellowship credits: PUBLIK_CREDITS_KEY. People never pick a plan
- App token: PUBLIK_APP_TOKEN env (server only)
- The developer's wallet pays for everyone, so never show users a top-up link. AI unavailable for everyone (wallet empty/capped, global limit): HTTP 503 `{"error":{"code":"ai_paused","message":"..."}}`; the UI shows one calm "paused for today" notice (`AI_PAUSED_MESSAGE` in `src/components/app/api.ts`) and also treats any 402 or top-up link that way. One user over their own allowance: 429 `daily_limit`, shown with the server's message
- Gmail / Outlook / Slack go through Composio from Sift's own server (`src/lib/server/connector.ts`). `CONNECTOR_ORIGIN` points at `scripts/mock-connector.mjs` in tests only; there is no separate connector deployment
- Never print or log a key
- Docs: https://publikhq.com/llms.txt, https://publikhq.com/developers, https://publikhq.com/skills/api.md
