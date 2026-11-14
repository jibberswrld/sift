// Unit-style checks against an isolated PGlite. No app env files or external services.
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";

assert(!process.env.DATABASE_URL, "Run with DATABASE_URL unset");
const dir = mkdtempSync(resolve(tmpdir(), "sift-backend-unit-"));
process.env.SIFT_DATA_DIR = dir;
process.env.APP_SECRET = "unit-test-only-secret-with-at-least-32-characters";
const require = createRequire(import.meta.url);
// Only this test process transpiles server TS; production still uses Next's compiler.
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(this, name.startsWith("@/") ? resolve("src", name.slice(2)) : name, ...args);
};

try {
  const { emailAddress, replyCall } = require("../src/lib/server/sources.ts");
  assert.equal(emailAddress('"ceo@company.com" <attacker@evil.example>'), "attacker@evil.example");
  assert.equal(emailAddress("Name <real@example.com>"), "real@example.com");
  assert.equal(emailAddress("real@example.com"), "real@example.com");
  assert.equal(emailAddress('"ceo@company.com" <invalid>'), null);
  assert.equal(emailAddress("no address"), null);
  assert.equal(replyCall({ source: "gmail", sender: '"ceo@company.com" <attacker@evil.example>', thread_id: "t" }, "reply").args.recipient_email, "attacker@evil.example");
  console.log("PASS sender parsing prefers the envelope address, including the actual reply call");

  // Stub the SDK itself to cover native deletion semantics without contacting Composio.
  const nativeLoad = Module._load;
  let deleteSuccess = false;
  const deleted = [];
  Module._load = function (name, ...args) {
    if (name === "@composio/core") return { Composio: class {
      connectedAccounts = {
        list: async ({ cursor }) => cursor ? { items: [{ id: "second" }], nextCursor: null } : { items: [{ id: "first" }], nextCursor: "page-2" },
        delete: async (id) => { deleted.push(id); return { success: deleteSuccess }; },
      };
      create = async () => ({});
    } };
    return nativeLoad.call(this, name, ...args);
  };
  process.env.COMPOSIO_API_KEY = "mock-only";
  delete process.env.CONNECTOR_ORIGIN;
  delete require.cache[require.resolve("../src/lib/server/connector.ts")];
  const { connectorDisconnect } = require("../src/lib/server/connector.ts");
  assert.equal((await connectorDisconnect({ publik_handle: "unit" }, "gmail")).ok, false);
  deleteSuccess = true;
  deleted.length = 0;
  assert.equal((await connectorDisconnect({ publik_handle: "unit" }, "gmail")).ok, true);
  assert.deepEqual(deleted, ["first", "second"]);
  Module._load = nativeLoad;
  delete process.env.COMPOSIO_API_KEY;
  console.log("PASS native connector checks success:false and deletes every page of account records (SDK stub only)");

  const { sql } = require("../src/lib/server/db.ts");
  const { reserveCall, reserveResort, acquireWork, releaseWork, GLOBAL_DAILY_CALLS } = require("../src/lib/server/usage.ts");
  const { HttpError, handle, ndjson } = require("../src/lib/server/http.ts");
  const [u] = await sql`insert into users (publik_handle) values ('unit') returning *`;
  const [v] = await sql`insert into users (publik_handle) values ('unit-other') returning *`;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  const provider = { baseURL: "http://unit.invalid", apiKey: "mock-only" };
  await sql`insert into ai_daily_usage (user_id, day, calls) values (${u.id}, (now() at time zone 'UTC')::date, 199)`;
  const quota = await Promise.allSettled(Array.from({ length: 50 }, () => reserveCall(u.id, provider)));
  assert.equal(quota.filter((r) => r.status === "fulfilled").length, 1);
  assert(quota.filter((r) => r.status === "rejected").every((r) => r.reason.code === "daily_limit"));
  assert.equal((await sql`select calls from ai_daily_usage where user_id = ${u.id}`)[0].calls, 200);
  console.log("PASS atomic 200-call allowance: 1 of 50 reservations succeeds at 199; rejected reservations do not consume global calls");

  await sql`update ai_daily_global set calls = ${GLOBAL_DAILY_CALLS - 1}`;
  const shared = await Promise.allSettled(Array.from({ length: 50 }, () => reserveCall(v.id, provider)));
  assert.equal(shared.filter((r) => r.status === "fulfilled").length, 1);
  assert(shared.filter((r) => r.status === "rejected").every((r) => r.reason.code === "ai_paused"));
  assert.equal((await sql`select calls from ai_daily_global`)[0].calls, GLOBAL_DAILY_CALLS);
  console.log("PASS atomic global fallback: 1 of 50 reservations succeeds at 1,999; 49 pause at 2,000");

  const resort = await Promise.allSettled(Array.from({ length: 50 }, () => reserveResort(v.id)));
  assert.equal(resort.filter((r) => r.status === "fulfilled").length, 20);
  console.log("PASS atomic 20 re-sort/day allowance");

  const leases = await Promise.allSettled(Array.from({ length: 50 }, () => acquireWork(u.id)));
  const lease = leases.find((r) => r.status === "fulfilled").value;
  assert.equal(leases.filter((r) => r.status === "fulfilled").length, 1);
  await sql`update users set ai_lock_until = now() - interval '1 second' where id = ${u.id}`;
  const newLease = await acquireWork(u.id);
  await releaseWork(u.id, lease);
  await assert.rejects(acquireWork(u.id), (e) => e.code === "busy");
  await releaseWork(u.id, newLease);
  console.log("PASS expiring cross-request lease, including stale-owner release protection");

  const handler = handle(async () => new Response("ok"));
  assert.equal((await handler(new Request("https://sift.example/api/me", { method: "DELETE", headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await handler(new Request("https://sift.example/api/me", { method: "DELETE", headers: { origin: "https://sift.example" } }))).status, 200);
  const response = await ndjson((async function* () { yield { type: "error", code: "ai_paused", message: "paused" }; })());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: "ai_paused", message: "paused" } });
  assert(new HttpError(429, "daily_limit", "limit") instanceof Error);
  console.log("PASS Origin rejection and buffered NDJSON HTTP error status");
  globalThis.fetch = fetchOriginal;

  // Re-apply against the existing tables: the upgrade is additive and idempotent.
  const { PGlite } = await import("@electric-sql/pglite");
  const migrationDb = new PGlite();
  const schema = readFileSync("db/schema.sql", "utf8");
  await migrationDb.exec(schema.replace(/^alter table users.*$/gm, ""));
  await migrationDb.exec("insert into users (publik_handle) values ('existing')");
  await migrationDb.exec(schema);
  await migrationDb.exec(schema);
  assert.equal((await migrationDb.query("select publik_handle, sync_pending, ai_lock_token from users")).rows[0].publik_handle, "existing");
  await migrationDb.close();
  console.log("PASS additive schema upgrades existing users and can be reapplied without losing rows");
  process.env.VERCEL = "1";
  delete process.env.APP_SECRET;
  delete require.cache[require.resolve("../src/lib/server/local.ts")];
  assert.throws(() => require("../src/lib/server/local.ts"), /APP_SECRET with at least 32 characters/);
  delete process.env.VERCEL;
  console.log("PASS Vercel rejects missing APP_SECRET when the server module initializes");
} finally {
  // Close only our embedded database before removing our own temporary files.
  // The process exits below because the local PGlite handle is intentionally process-scoped.
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
