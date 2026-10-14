import Database from 'better-sqlite3';
import fs from 'fs';

const files = fs.readdirSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject').filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
const db = new Database('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/' + files[0]);
const rows = db.prepare("SELECT type, code, payload FROM entities WHERE type LIKE '%voucher%' OR type LIKE '%bank%' OR type LIKE '%ledger%' ORDER BY rowid DESC LIMIT 15").all();
console.log(JSON.stringify(rows.map(r => ({ type: r.type, code: r.code, payload: JSON.parse(r.payload) })), null, 2));
