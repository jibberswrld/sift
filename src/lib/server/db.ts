import { readFileSync } from "node:fs";
import { join } from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

type Runner = { query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }> };

// Hosted: Postgres (Neon) from DATABASE_URL. Local tests without it: embedded PGlite in a data folder.
// One handle per process, kept on globalThis across module copies; the schema runs once per process (idempotent).
const g = globalThis as unknown as { __siftDb?: Promise<Runner> };

async function open(): Promise<Runner> {
  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    // Idle Neon connections may disappear. Never let their error event crash the process
    // or log a connection string / other provider error details.
    pool.on("error", () => console.error("[db] An idle database connection closed; the pool will reconnect."));
    await pool.query(schema);
    return { query: (text, params) => pool.query(text, params as unknown[]) };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { dataDir } = await import("./local");
  const pg = await PGlite.create(join(dataDir(), "db"));
  await pg.exec(schema);
  return { query: (text, params) => pg.query<Row>(text, params) };
}

function db(): Promise<Runner> {
  g.__siftDb ??= open().catch((e) => {
    g.__siftDb = undefined;
    throw e;
  });
  return g.__siftDb;
}

/** Tagged-template query: values are always sent as parameters. */
export async function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
  const text = strings.reduce((acc, s, i) => acc + (i ? `$${i}` : "") + s, "");
  return query(text, values);
}

/** Parameterized query with $1..$n placeholders. */
export async function query(text: string, params: unknown[]): Promise<Row[]> {
  return (await (await db()).query(text, params.map(param))).rows;
}

/** Arrays become Postgres array literals (for `= any($1::uuid[])`); other objects become JSON. */
function param(v: unknown): unknown {
  if (Array.isArray(v)) return `{${v.map((x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
  if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}
