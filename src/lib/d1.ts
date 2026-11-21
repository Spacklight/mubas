/**
 * Cloudflare D1 data layer (server-only).
 *
 * The app is written in Postgres SQL; D1 is SQLite. SQLite already supports
 * RETURNING and ON CONFLICT, so this module only has to:
 *  - turn $1 placeholders into ?1 and bind values (booleans -> 0/1, Date -> text),
 *  - rewrite the few Postgres-only bits (now(), ::casts, ILIKE, interval math,
 *    least/greatest, octet_length),
 *  - convert the Postgres migrations to SQLite and apply them once, atomically.
 *
 * The D1 binding must be named DB.
 */

import { migrationFiles } from "./d1-schema";

export type Row = Record<string, unknown>;

type D1Result = { results?: Row[]; meta?: { changes?: number } };
export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { all(): Promise<D1Result> }; all(): Promise<D1Result> };
  batch(statements: unknown[]): Promise<unknown[]>;
}

export class D1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "D1Error";
  }
}

/** True inside a Cloudflare Worker (where PGLite / a shared pg Pool can't run). */
export function isWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

let cachedDb: D1Like | null = null;

/** The D1 binding named DB, or null when the app isn't running with one. */
export async function getD1(): Promise<D1Like | null> {
  const injected = (globalThis as { __D1__?: D1Like }).__D1__; // tests
  if (injected) return injected;
  if (cachedDb) return cachedDb;
  try {
    const spec = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ spec)) as { env?: Record<string, unknown> };
    const db = mod.env?.DB as D1Like | undefined;
    if (db && typeof db.prepare === "function") {
      cachedDb = db;
      return db;
    }
  } catch {
    // not running on Workers
  }
  return null;
}

// -------------------------------------------------------------- literals ----

const pad = (n: number) => String(n).padStart(2, "0");

/** Same text format as SQLite's CURRENT_TIMESTAMP (UTC). */
export function fmtTs(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new D1Error("Invalid date value");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function bindValue(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return fmtTs(v);
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

// ------------------------------------------------------------- translate ----

/** Postgres -> SQLite syntax, on the SQL template (values are bound, never inlined). */
export function translate(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  s = s.replace(
    /\bnow\(\)\s*-\s*interval\s*'(\d+)\s*(second|minute|hour|day|week)s?'/gi,
    (_m, n: string, u: string) => {
      const unit = u.toLowerCase();
      return unit === "week"
        ? `datetime('now', '-${Number(n) * 7} days')`
        : `datetime('now', '-${n} ${unit}s')`;
    },
  );
  s = s.replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");
  s = s.replace(/::\s*[A-Za-z_]+(\s*\(\s*\d+\s*(,\s*\d+\s*)?\))?(\[\])?/g, "");
  s = s.replace(/\boctet_length\s*\(([^()]*)\)/gi, "length(CAST($1 AS BLOB))");
  s = s.replace(/\bleast\s*\(/gi, "min(").replace(/\bgreatest\s*\(/gi, "max(");
  s = s.replace(/\bilike\b/gi, "LIKE");
  s = s.replace(/\$(\d+)/g, "?$1");
  return s;
}

// ------------------------------------------------------------ results -------

const TS_KEY = /(_at|At|_seen)$/;
const TS_VAL = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

/** SQLite returns timestamps as text; pg returned Date objects. Keep parity. */
function normalize(rows: Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] =
        typeof v === "string" && TS_KEY.test(k) && TS_VAL.test(v)
          ? new Date(`${v.replace(" ", "T")}Z`)
          : v;
    }
    return out;
  });
}

export async function d1Run(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: Row[]; affected: number }> {
  const db = await getD1();
  if (!db) throw new D1Error("No D1 database bound. Bind a D1 database to this Worker with the variable name DB.");
  // Sign-up reaches the login system before any campus page runs, so make sure
  // the tables exist before the first query of every isolate.
  const override = (globalThis as { __D1_SCHEMA__?: Record<string, string> }).__D1_SCHEMA__; // tests
  await ensureD1Schema(db, override ?? migrationFiles());
  const stmt = db.prepare(translate(text));
  const res = await (params.length ? stmt.bind(...params.map(bindValue)) : stmt).all();
  const rows = normalize(res.results ?? []);
  return { rows, affected: res.meta?.changes ?? rows.length };
}

export async function d1Query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await d1Run(text, params)).rows as T[];
}

// ------------------------------------------------------------ migrations ----

function stripComments(sql: string): string {
  let out = "";
  let inLit = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (inLit) {
      out += c;
      if (c === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 1;
        } else inLit = false;
      }
      continue;
    }
    if (c === "'") {
      inLit = true;
      out += c;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }
    out += c;
  }
  return out;
}

export function splitStatements(sql: string): string[] {
  const src = stripComments(sql);
  const out: string[] = [];
  let cur = "";
  let inLit = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inLit) {
      cur += c;
      if (c === "'") {
        if (src[i + 1] === "'") {
          cur += "'";
          i += 1;
        } else inLit = false;
      }
      continue;
    }
    if (c === "'") {
      inLit = true;
      cur += c;
      continue;
    }
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Postgres DDL/seed statement -> SQLite. */
export function toSqlite(stmt: string): string {
  let s = stmt.replace(/\s+/g, " ").trim();
  s = s.replace(/\bserial\s+primary\s+key\b/gi, "integer primary key autoincrement");
  s = s.replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");
  // SQLite needs a WHERE before ON CONFLICT when the insert source is a SELECT.
  if (/^insert\b/i.test(s) && /\bselect\b/i.test(s) && /\bon conflict\b/i.test(s) && !/\bwhere\b/i.test(s)) {
    s = s.replace(/\s+on\s+conflict/i, " where true on conflict");
  }
  return s;
}

// Only a *finished* migration is remembered. In-flight promises must never be shared
// between requests: Workers drops a promise that settles after the request that
// created it has ended, which makes every other request waiting on it fail.
const migrationsDone = new WeakSet<object>();

/** Apply pending migration files once per isolate (idempotent, atomic per file). */
export function ensureD1Schema(db: D1Like, files: Record<string, string>): Promise<void> {
  if (migrationsDone.has(db)) return Promise.resolve();
  return (async () => {
    await db
      .prepare("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)")
      .all();
    const done = new Set(
      ((await db.prepare("SELECT name FROM _migrations").all()).results ?? []).map((r) => String(r.name)),
    );
    const base = (p: string) => p.split("/").pop() ?? p;
    const pending = Object.keys(files)
      .map((path) => ({ path, name: base(path) }))
      .filter((f) => !done.has(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const f of pending) {
      const statements = splitStatements(files[f.path]).map((s) => db.prepare(toSqlite(s)));
      statements.push(db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?1)").bind(f.name) as never);
      await db.batch(statements);
    }
    migrationsDone.add(db);
  })();
}
