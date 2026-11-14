// Run after pnpm build. Starts/stops only local mocks + the built app, with an
// allowlisted environment and a disposable PGlite directory. Never loads env files.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

assert(!existsSync(".env.local"), "Refusing to start Next where .env.local could be loaded");
assert(![".env", ".env.production", ".env.production.local"].some(existsSync), "Refusing to load app env files");
const dir = mkdtempSync(resolve(tmpdir(), "sift-backend-e2e-"));
const children = new Set();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
const [publikPort, connectorPort, appPort] = await Promise.all([freePort(), freePort(), freePort()]);
const publik = `http://localhost:${publikPort}`;
const connector = `http://localhost:${connectorPort}`;
const app = `http://localhost:${appPort}`;
const env = {
  PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  APP_SECRET: "mock-only-app-secret-at-least-32-characters", SIFT_DATA_DIR: dir,
  PUBLIK_ORIGIN: publik, PUBLIK_APP_TOKEN: "pat_mocktoken", CONNECTOR_ORIGIN: connector,
  MOCK_PUBLIK_PORT: String(publikPort), MOCK_CONNECTOR_PORT: String(connectorPort), MOCK_AI_FIXTURE: "1",
};
function start(file, args = []) {
  const child = spawn(process.execPath, [file, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.on("exit", () => children.delete(child));
  let logs = "";
  const collect = (s) => { logs = (logs + s).slice(-8000); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.logs = () => logs.replace(/pk_\S+/g, "[redacted]");
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), pause(4000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await once(child, "exit"); }
}
async function ready(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Local server exited: ${child.logs()}`);
    try { if ((await fetch(url)).status < 500) return; } catch { /* starting */ }
    await pause(100);
  }
  throw new Error(`Local server did not start: ${child.logs()}`);
}
async function json(url, options) {
  const res = await fetch(url, options);
  return { status: res.status, body: await res.json(), headers: res.headers };
}
async function signIn(handle) {
  let cookie = "";
  const call = async (path, method = "GET", body, extraHeaders = {}) => {
    const res = await fetch(`${app}${path}`, { method, headers: { cookie, origin: app, "content-type": "application/json", ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const c of res.headers.getSetCookie()) cookie = c.split(";")[0];
    const text = await res.text();
    const ndjson = res.headers.get("content-type")?.includes("ndjson");
    return { status: res.status, body: ndjson ? text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(text) };
  };
  // The install is created by the Sign in click (POST), not by loading the gate.
  const gate = await call("/api/gate", "POST");
  assert.equal(gate.body.state, "sign_in");
  await fetch(`${gate.body.claimUrl}?handle=${handle}`);
  assert.equal((await call("/api/gate")).body.state, "ready");
  return call;
}
async function connect(call, toolkit) {
  const link = await call("/api/connections/link", "POST", { toolkit });
  assert.equal(link.status, 200);
  await fetch(link.body.url);
}
const paused = { error: { code: "ai_paused", message: "Sift's free AI is paused for today. Your messages are still here; sorting resumes tomorrow." } };
const limited = { error: { code: "daily_limit", message: "You've reached today's limit for AI sorting and drafts. It resets tomorrow." } };
let appChild;
try {
  const mockPublik = start("scripts/mock-publik.mjs");
  const mockConnector = start("scripts/mock-connector.mjs");
  await Promise.all([ready(`${publik}/mock/stats`, mockPublik), ready(`${connector}/mock/calls`, mockConnector)]);
  // All test users' calls use one developer mock wallet, just like the hosted app.
  const install = await json(`${publik}/api/v1/installs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app_token: "pat_mocktoken", install_id: "developer-test-wallet" }) });
  await fetch(install.body.claim_url + "?handle=developer");
  env.PUBLIK_CREDITS_KEY = install.body.key;
  async function restart() {
    if (appChild) await stop(appChild);
    appChild = start("node_modules/next/dist/bin/next", ["start", "-H", "127.0.0.1", "-p", String(appPort)]);
    await ready(app, appChild);
  }
  await restart();
  const main = await signIn("first-sync");
  for (const t of ["gmail", "outlook", "slack"]) await connect(main, t);
  const sync = await main("/api/inbox/sync", "POST");
  assert.equal(sync.status, 200);
  assert(sync.body.some((e) => e.type === "done" && e.added === 15 && e.sorted === 15));
  const inbox = (await main("/api/inbox")).body.messages;
  assert.equal(inbox.length, 15);
  assert(inbox.every((m) => m.bucket !== null));
  const injection = inbox.find((m) => m.injection);
  assert(injection);
  const firstChats = (await json(`${publik}/mock/stats`)).body.chats;
  assert(firstChats.some((c) => c.ids.length === 1 && c.ids[0] === injection.id));
  console.log("PASS built app: sign-in, three account connections, 15 fetched + sorted, flagged injection re-sorted alone");

  await fetch(`${publik}/mock/control?delay=250`);
  const id = inbox.find((m) => m.source === "gmail").id;
  const before = (await json(`${publik}/mock/stats`)).body.chats.length;
  const burst = await Promise.all(Array.from({ length: 50 }, () => main(`/api/messages/${id}/draft`, "POST")));
  const accepted = burst.filter((r) => r.status === 200).length;
  const busy = burst.filter((r) => r.status === 409 && r.body.error.code === "busy").length;
  assert(accepted > 0 && accepted <= 3);
  assert.equal(accepted + busy, 50);
  assert.equal((await json(`${publik}/mock/stats`)).body.chats.length - before, accepted);
  console.log(`PASS 50 parallel drafts: ${accepted} model call(s), ${busy} HTTP 409 busy responses`);
  await fetch(`${publik}/mock/control?delay=0`);

  let limitResponse;
  for (let i = 0; i < 201; i++) {
    const r = await main(`/api/messages/${id}/draft`, "POST");
    if (r.status === 429) { limitResponse = r; break; }
    assert.equal(r.status, 200);
  }
  assert(limitResponse);
  assert.deepEqual(limitResponse.body, limited);
  assert.equal((await json(`${publik}/mock/stats`)).body.chats.length, 200);
  console.log("PASS per-user allowance: exactly 200 total model attempts, then HTTP 429 daily_limit with exact JSON");

  for (const code of [402, 429]) {
    const call = await signIn(`paused-${code}`);
    await connect(call, "gmail");
    await fetch(`${publik}/mock/${code}/on`);
    const beforeCalls = (await json(`${publik}/mock/stats`)).body.chats.length;
    const r = await call("/api/inbox/sync", "POST");
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, paused);
    const fetched = (await call("/api/inbox")).body.messages;
    assert(fetched.length >= 9 && fetched.every((m) => m.bucket === null));
    const attempted = (await json(`${publik}/mock/stats`)).body.chats.length - beforeCalls;
    assert.equal(attempted, Math.ceil(fetched.length / 5)); // no retry, one per already-started batch
    await fetch(`${connector}/mock/arrive`);
    assert.equal((await call("/api/inbox/sync", "POST")).status, 503);
    assert.equal((await call("/api/inbox")).body.messages.length, fetched.length + 1);
    assert.equal((await call(`/api/messages/${fetched[0].id}/draft`, "POST")).status, 503);
    await fetch(`${publik}/mock/${code}/off`);
    console.log(`PASS mock ${code}: HTTP 503 ai_paused, no retries/top-up link, new mail remains stored with bucket:null`);
  }

  await fetch(`${publik}/mock/control?spent=150000000`);
  await restart(); // discard the intentionally 60s process wallet cache
  const walletCall = await signIn("wallet-threshold");
  await connect(walletCall, "gmail");
  const walletBefore = (await json(`${publik}/mock/stats`)).body.chats.length;
  assert.deepEqual((await walletCall("/api/inbox/sync", "POST")).body, paused);
  assert.equal((await json(`${publik}/mock/stats`)).body.chats.length, walletBefore);
  assert((await walletCall("/api/inbox")).body.messages.length > 0);
  console.log("PASS developer wallet at 75%: AI pauses before any model call; sync still stores mail");
  await fetch(`${publik}/mock/control?spent=0`);
  await restart();

  for (const toolkit of ["gmail", "outlook"]) {
    await fetch(`${connector}/mock/bulk?toolkit=${toolkit}&count=180`);
    const call = await signIn(`paging-${toolkit}`);
    await connect(call, toolkit);
    assert.equal((await call("/api/inbox/sync", "POST")).status, 200);
    assert.equal((await call("/api/inbox")).body.messages.length, 150);
    assert.equal((await call("/api/inbox/sync", "POST")).status, 200);
    const count = (await call("/api/inbox")).body.messages.length;
    assert.equal(count, toolkit === "gmail" ? 191 : 183); // original fixtures + arrived messages
    const after = (await call("/api/inbox/sync", "POST")).body;
    assert(after.some((e) => e.type === "done" && e.added === 0));
    console.log(`PASS ${toolkit} pagination: 150 first sync, ${count} after continuation, no duplicates on next sync`);
    if (toolkit === "gmail") {
      const reSort = await call("/api/inbox/resort", "POST");
      assert(reSort.body.some((e) => e.type === "done" && e.sorted === 100));
      console.log("PASS sort-again run is capped at 100 messages");
    }
  }
  await fetch(`${connector}/mock/bulk?toolkit=outlook&count=30&opaque=1`);
  const opaque = await signIn("outlook-opaque");
  await connect(opaque, "outlook");
  assert.equal((await opaque("/api/inbox/sync", "POST")).status, 200);
  assert.equal((await opaque("/api/inbox")).body.messages.length, 33);
  console.log("PASS Outlook next_page_token path as well as @odata.nextLink path");

  await fetch(`${connector}/mock/bulk?toolkit=gmail&count=30&marker=FAIL_BATCH`);
  await fetch(`${publik}/mock/control?failBatch=1`);
  const partial = await signIn("partial-batches");
  await connect(partial, "gmail");
  const callsBefore = (await json(`${publik}/mock/stats`)).body.chats.length;
  await partial("/api/inbox/sync", "POST");
  const partialInbox = (await partial("/api/inbox")).body.messages;
  assert(partialInbox.some((m) => m.bucket !== null));
  assert(partialInbox.some((m) => m.bucket === null));
  const failedIds = partialInbox.filter((m) => m.subject?.startsWith("Bulk message") && Number(m.subject.split(" ").at(-1)) < 5).map((m) => m.id);
  const attempts = (await json(`${publik}/mock/stats`)).body.chats.slice(callsBefore);
  for (const failed of failedIds) assert.equal(attempts.filter((c) => c.ids.includes(failed)).length, 2);
  console.log("PASS failed batch keeps successful sibling classifications and stops at two attempts");
  await fetch(`${publik}/mock/control?failBatch=0&malformed=1`);
  const malformedBefore = (await json(`${publik}/mock/stats`)).body.chats.length;
  await partial("/api/inbox/sync", "POST");
  const malformedCalls = (await json(`${publik}/mock/stats`)).body.chats.slice(malformedBefore);
  for (const c of malformedCalls) for (const messageId of c.ids) assert.equal(malformedCalls.filter((other) => other.ids.includes(messageId)).length, 2);
  await fetch(`${publik}/mock/control?malformed=0`);
  console.log("PASS malformed JSON also stops at two attempts, including the retry budget");

  const deleteCall = await signIn("delete-account");
  for (const t of ["gmail", "outlook", "slack"]) await connect(deleteCall, t);
  await fetch(`${connector}/mock/disconnect-fail?toolkit=outlook`);
  assert.equal((await deleteCall("/api/me", "DELETE")).status, 502);
  assert.equal((await deleteCall("/api/me")).status, 200);
  await fetch(`${connector}/mock/disconnect-fail`);
  assert.equal((await deleteCall("/api/me", "DELETE")).status, 200);
  const again = await signIn("delete-account");
  assert.deepEqual((await again("/api/connections")).body.connected, { gmail: false, outlook: false, slack: false });
  assert.equal((await again("/api/inbox")).body.messages.length, 0);
  console.log("PASS failed disconnect preserves account; retry deletes; signing in again shows zero connections/data");
  assert.equal((await again("/api/context", "PUT", { text: "bad" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await again("/api/context")).body.text, "");
  console.log("PASS built app rejects foreign Origin before changing state");
  const reSortLimit = await signIn("resort-limit");
  for (let i = 0; i < 20; i++) assert.equal((await reSortLimit("/api/inbox/resort", "POST")).status, 200);
  const reSortDenied = await reSortLimit("/api/inbox/resort", "POST");
  assert.equal(reSortDenied.status, 429);
  assert.deepEqual(reSortDenied.body, limited);
  console.log("PASS built app allows 20 re-sort runs, then returns exact HTTP 429 daily_limit");

  const fallback = await signIn("global-fallback");
  await connect(fallback, "gmail");
  await stop(appChild);
  const { PGlite } = await import("@electric-sql/pglite");
  const localDb = await PGlite.create(resolve(dir, "db"));
  await localDb.exec("insert into ai_daily_global(day, calls) values ((now() at time zone 'UTC')::date, 2000) on conflict(day) do update set calls = 2000");
  await localDb.close();
  await fetch(`${publik}/mock/control?walletUnavailable=1`);
  await restart();
  const fallbackBefore = (await json(`${publik}/mock/stats`)).body.chats.length;
  const fallbackResponse = await fallback("/api/inbox/sync", "POST");
  assert.equal(fallbackResponse.status, 503);
  assert.deepEqual(fallbackResponse.body, paused);
  assert.equal((await json(`${publik}/mock/stats`)).body.chats.length, fallbackBefore);
  assert((await fallback("/api/inbox")).body.messages.length > 0);
  console.log("PASS built app global counter at 2,000 pauses with HTTP 503 when wallet is unavailable; mail still syncs");
  console.log("ALL BUILT-APP MOCK CHECKS PASSED (no real Publik, Composio, database or email)");
  if (process.argv.includes("--browser")) {
    await stop(appChild);
    const browserDb = await PGlite.create(resolve(dir, "db"));
    await browserDb.exec("update ai_daily_global set calls = 0");
    await browserDb.close();
    await fetch(`${publik}/mock/control?walletUnavailable=0`);
    await fetch(`${connector}/mock/reset`);
    await restart();
    console.log(`BROWSER_APP=${app} MOCK_PUBLIK=${publik}`);
    console.log("Waiting for browser verification; SIGINT cleans up all local children/data.");
    await once(process, "SIGINT");
  }
} catch (e) {
  if (appChild) console.error(appChild.logs());
  throw e;
} finally {
  await Promise.all([...children].map(stop));
  rmSync(dir, { recursive: true, force: true });
}
