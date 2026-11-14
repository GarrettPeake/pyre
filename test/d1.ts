import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS = new URL("../migrations/", import.meta.url).pathname;

/** A fresh in-memory database with every migration applied verbatim, FKs on like D1. */
export function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(MIGRATIONS + f, "utf8"));
  }
  return db;
}

/**
 * Just enough of D1's API for the accounts code and Better Auth (which recognises D1 by
 * prepare/batch/exec and sends every query, writes included, through all()).
 */
export function d1(sqlite: DatabaseSync): D1Database {
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => {
      const s = sqlite.prepare(sql);
      if (s.columns().length > 0) return { results: s.all(...(args as any[])), meta: { changes: 0 } };
      const r = s.run(...(args as any[]));
      return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    first: async (column?: string) => {
      const row = (sqlite.prepare(sql).get(...(args as any[])) as Record<string, unknown> | undefined) ?? null;
      return column && row ? (row[column] ?? null) : row;
    },
    raw: async () => sqlite.prepare(sql).all(...(args as any[])).map((r: any) => Object.values(r)),
    run: async () => {
      const r = sqlite.prepare(sql).run(...(args as any[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    batch: async (stmts: any[]) => {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
}

