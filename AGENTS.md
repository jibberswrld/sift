<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## publik API
- Base URL: https://publikhq.com/api/v1 (OpenAI Chat Completions, Responses, Anthropic Messages)
- Models: publik-fast, publik-balanced, publik-smart only; never a vendor model name
- Sift is a hosted web app (listing outputType "hosted_web"), deployed on Vercel project `sift` with Neon Postgres
- Sign in with publik: the gate (`src/lib/server/gate.ts`, UI `src/components/app/gate.tsx`) runs before any app screen. Every browser session gets its own install key (POST /api/v1/installs), stored encrypted in `sessions.publik_key_enc` with APP_SECRET, never sent to the browser
- Usage telemetry (app_opened / active_session) goes out with each session's own key, so each signed-in person counts (`src/lib/server/publik.ts`)
- AI calls are paid by the developer's fellowship credits: PUBLIK_CREDITS_KEY. People never pick a plan
- App token: PUBLIK_APP_TOKEN env (server only)
- 402: show error.message plus error.top_up_url only
- Never print or log a key
- Docs: https://publikhq.com/llms.txt, https://publikhq.com/developers, https://publikhq.com/skills/api.md
