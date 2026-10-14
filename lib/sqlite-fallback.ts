import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defaults } from './domain';

const require = createRequire(import.meta.url);

let cachedD1: any = null;
let sqlPromise: Promise<any> | null = null;
let dbInstance: any = null;

const dbPath = process.env.SQLITE_PATH || (process.env.VERCEL ? '/tmp/shako.sqlite' : './shako.sqlite');

function persistDb(instance: any) {
  try {
    if (instance?.type === 'sqljs' && !instance?.inTransaction && dbPath && dbPath !== ':memory:') {
      const data = instance.db.export();
      const dir = path.dirname(dbPath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dbPath, Buffer.from(data));
    }
  } catch (err) {
    console.warn('Could not persist database to disk:', err);
  }
}

function initDdl(instance: any) {
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

  if (instance.type === 'node') {
    instance.db.exec(ddl);
    const existing = instance.db.prepare('SELECT id FROM system_settings WHERE id = 1').get();
    if (!existing) {
      seedDefaultData(instance);
    }
  } else if (instance.type === 'sqljs') {
    instance.db.run(ddl);
    const res = instance.db.exec('SELECT id FROM system_settings WHERE id = 1');
    if (!res || !res.length || !res[0].values.length) {
      seedDefaultData(instance);
    }
  }
}

function seedDefaultData(instance: any) {
  const now = new Date().toISOString();
  const ownerUserId = 'owner_usr_' + crypto.randomUUID().slice(0, 8);
  const sysSettingsPayload = JSON.stringify(defaults);

  if (instance.type === 'node') {
    instance.db.prepare('INSERT INTO system_settings (id, owner_id, payload, revision, updated_at) VALUES (1, ?, ?, 1, ?)').run(ownerUserId, sysSettingsPayload, now);
    instance.db.prepare('INSERT OR IGNORE INTO platform_settings (id, owner_id) VALUES (1, ?)').run(ownerUserId);
    instance.db.prepare(`INSERT OR IGNORE INTO platform_agencies (
      id, name, namespace, admin_email, state, payment_status, fee_minor, currency, paid_on, due_on, notes, revision, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'وكالة SHAKO للسفر والسياحة', 'legacy', 'owner@shako.com', 'active', 'paid', 0, 'USD', '', '', '', 1, ?, ?
    )`).run(now, now);
    instance.db.prepare(`INSERT OR IGNORE INTO members (
      email, user_id, active, created_at, name, role, permissions, revision, force_password_change
    ) VALUES (
      'admin@shako.com', 'agency_admin_user', 1, ?, 'مدير الوكالة', 'admin', null, 1, 0
    )`).run(now);
  } else if (instance.type === 'sqljs') {
    instance.db.run('INSERT INTO system_settings (id, owner_id, payload, revision, updated_at) VALUES (1, ?, ?, 1, ?)', [ownerUserId, sysSettingsPayload, now]);
    instance.db.run('INSERT OR IGNORE INTO platform_settings (id, owner_id) VALUES (1, ?)', [ownerUserId]);
    instance.db.run(`INSERT OR IGNORE INTO platform_agencies (
      id, name, namespace, admin_email, state, payment_status, fee_minor, currency, paid_on, due_on, notes, revision, created_at, updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000001', 'وكالة SHAKO للسفر والسياحة', 'legacy', 'owner@shako.com', 'active', 'paid', 0, 'USD', '', '', '', 1, ?, ?
    )`, [now, now]);
    instance.db.run(`INSERT OR IGNORE INTO members (
      email, user_id, active, created_at, name, role, permissions, revision, force_password_change
    ) VALUES (
      'admin@shako.com', 'agency_admin_user', 1, ?, 'مدير الوكالة', 'admin', null, 1, 0
    )`, [now]);
    persistDb(instance);
  }
}

async function getDb(): Promise<any> {
  if (dbInstance) return dbInstance;
  if (!sqlPromise) {
    sqlPromise = (async () => {
      // 1. Try native node:sqlite
      try {
        const mod = require('node:sqlite');
        if (mod && mod.DatabaseSync) {
          const instance = { type: 'node', db: new mod.DatabaseSync(dbPath), inTransaction: false };
          initDdl(instance);
          return instance;
        }
      } catch {}

      // 2. Fallback to sql.js (pure WASM, works across any Node version)
      const initSqlJs = (await import('sql.js')).default;
      let wasmBinary: Buffer | undefined;
      try {
        const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
        if (fs.existsSync(wasmPath)) {
          wasmBinary = fs.readFileSync(wasmPath);
        }
      } catch (err) {
        console.warn('Could not read sql-wasm.wasm directly:', err);
      }

      const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : undefined);
      let sqljsDb: any;
      if (fs.existsSync(dbPath)) {
        try {
          const filebuf = fs.readFileSync(dbPath);
          sqljsDb = new SQL.Database(filebuf);
        } catch {
          sqljsDb = new SQL.Database();
        }
      } else {
        sqljsDb = new SQL.Database();
      }
      const instance = { type: 'sqljs', db: sqljsDb, inTransaction: false };
      initDdl(instance);
      return instance;
    })();
  }
  dbInstance = await sqlPromise;
  return dbInstance;
}

export function getSqliteD1Database(): any {
  if (cachedD1) return cachedD1;

  function wrapStatement(sql: string, boundParams: any[] = []): any {
    return {
      bind(...values: any[]) {
        return wrapStatement(sql, values);
      },
      async first<T = unknown>(col?: string): Promise<T | null> {
        const instance = await getDb();
        if (instance.type === 'node') {
          const stmt = instance.db.prepare(sql);
          const row = stmt.get(...boundParams) as any;
          if (!row) return null;
          if (col !== undefined) return row[col];
          return row as T;
        } else {
          const stmt = instance.db.prepare(sql);
          try {
            if (boundParams.length) stmt.bind(boundParams);
            if (stmt.step()) {
              const row = stmt.getAsObject();
              if (col !== undefined) return row[col];
              return row as T;
            }
            return null;
          } finally {
            stmt.free();
          }
        }
      },
      async all<T = unknown>(): Promise<{ results: T[] }> {
        const instance = await getDb();
        if (instance.type === 'node') {
          const stmt = instance.db.prepare(sql);
          const rows = stmt.all(...boundParams) as T[];
          return { results: rows };
        } else {
          const stmt = instance.db.prepare(sql);
          const results: any[] = [];
          try {
            if (boundParams.length) stmt.bind(boundParams);
            while (stmt.step()) {
              results.push(stmt.getAsObject());
            }
            return { results };
          } finally {
            stmt.free();
          }
        }
      },
      async run<T = unknown>(): Promise<{ meta: { changes: number } }> {
        const instance = await getDb();
        if (instance.type === 'node') {
          const stmt = instance.db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { meta: { changes: Number(info.changes || 0) } };
        } else {
          try {
            if (boundParams.length) {
              instance.db.run(sql, boundParams);
            } else {
              instance.db.run(sql);
            }
            const changes = instance.db.getRowsModified();
            persistDb(instance);
            return { meta: { changes } };
          } catch (e) {
            console.error('SQL run error on query:', sql, e);
            throw e;
          }
        }
      },
      async raw<T = unknown>(): Promise<T[]> {
        const res = await this.all();
        return res.results as T[];
      }
    };
  }

  cachedD1 = {
    prepare(sql: string) {
      return wrapStatement(sql);
    },
    async batch<T = unknown>(statements: any[]): Promise<any[]> {
      const instance = await getDb();
      const results: any[] = [];
      if (instance.type === 'node') {
        instance.db.exec('BEGIN');
        try {
          for (const s of statements) {
            const runRes = await s.run();
            results.push(runRes);
          }
          instance.db.exec('COMMIT');
        } catch (e) {
          try {
            instance.db.exec('ROLLBACK');
          } catch {}
          throw e;
        }
      } else {
        instance.inTransaction = true;
        instance.db.run('BEGIN');
        try {
          for (const s of statements) {
            const runRes = await s.run();
            results.push(runRes);
          }
          instance.db.run('COMMIT');
          instance.inTransaction = false;
          persistDb(instance);
        } catch (e) {
          try {
            instance.db.run('ROLLBACK');
          } catch {}
          instance.inTransaction = false;
          throw e;
        }
      }
      return results;
    },
    exec(sql: string) {
      return wrapStatement(sql).run();
    }
  };

  return cachedD1;
}
