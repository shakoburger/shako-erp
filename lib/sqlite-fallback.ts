import { defaults } from './domain';

let cachedD1: any = null;

export function getSqliteD1Database(): any {
  if (cachedD1) return cachedD1;

  let DatabaseSync: any;
  try {
    const mod = require('node:sqlite');
    DatabaseSync = mod.DatabaseSync;
  } catch (err) {
    console.warn('node:sqlite is not available in this environment:', err);
    return null;
  }

  const dbPath = process.env.SQLITE_PATH || (process.env.VERCEL ? '/tmp/shako.sqlite' : './shako.sqlite');
  const db = new DatabaseSync(dbPath);

  // Initialize schema
  const ddl = `
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY,
      owner_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY,
      owner_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_agencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      namespace TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      state TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      fee_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      paid_on TEXT NOT NULL,
      due_on TEXT NOT NULL,
      notes TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_audit (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      agency_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_value TEXT,
      after_value TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_memberships (
      id TEXT PRIMARY KEY,
      agency_id TEXT NOT NULL,
      email TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      email TEXT PRIMARY KEY,
      user_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'viewer',
      permissions TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT,
      password_salt TEXT,
      password_version INTEGER NOT NULL DEFAULT 0,
      force_password_change INTEGER NOT NULL DEFAULT 1,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS agency_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      password_version INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      module TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS records_kind_code ON records (kind, code);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      before_value TEXT NOT NULL,
      after_value TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `;

  db.exec(ddl);

  // Initialize initial owner row if empty
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM system_settings WHERE id = 1').get();
  if (!existing) {
    const ownerUserId = 'owner_usr_' + crypto.randomUUID().slice(0, 8);
    db.prepare('INSERT INTO system_settings (id, owner_id, payload, revision, updated_at) VALUES (1, ?, ?, 1, ?)').run(
      ownerUserId,
      JSON.stringify(defaults),
      now
    );
    db.prepare('INSERT OR IGNORE INTO platform_settings (id, owner_id) VALUES (1, ?)').run(ownerUserId);
    db.prepare(`INSERT OR IGNORE INTO platform_agencies (
      id, name, namespace, admin_email, state, payment_status, fee_minor, currency, paid_on, due_on, notes, revision, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'وكالة SHAKO للسفر والسياحة', 'legacy', 'owner@shako.com', 'active', 'paid', 0, 'USD', '', '', '', 1, ?, ?
    )`).run(now, now);
  }

  function wrapStatement(sql: string, boundParams: any[] = []): any {
    return {
      bind(...values: any[]) {
        return wrapStatement(sql, values);
      },
      async first<T = unknown>(col?: string): Promise<T | null> {
        const stmt = db.prepare(sql);
        const row = stmt.get(...boundParams) as any;
        if (!row) return null;
        if (col !== undefined) return row[col];
        return row as T;
      },
      async all<T = unknown>(): Promise<{ results: T[] }> {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...boundParams) as T[];
        return { results: rows };
      },
      async run<T = unknown>(): Promise<{ meta: { changes: number } }> {
        const stmt = db.prepare(sql);
        const info = stmt.run(...boundParams);
        return { meta: { changes: Number(info.changes || 0) } };
      },
      async raw<T = unknown>(): Promise<T[]> {
        const stmt = db.prepare(sql);
        return stmt.all(...boundParams) as T[];
      }
    };
  }

  cachedD1 = {
    prepare(sql: string) {
      return wrapStatement(sql);
    },
    async batch<T = unknown>(statements: any[]): Promise<any[]> {
      const results: any[] = [];
      db.exec('BEGIN');
      try {
        for (const s of statements) {
          const runRes = await s.run();
          results.push(runRes);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return results;
    },
    exec(sql: string) {
      return db.exec(sql);
    }
  };

  return cachedD1;
}
