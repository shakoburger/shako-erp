import Database from 'better-sqlite3';
import fs from 'fs';

const files = fs.readdirSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject').filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
if (files.length > 0) {
  const db = new Database('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/' + files[0]);
  const rows = db.prepare("SELECT type, code, name, amount, currency, payload FROM entities WHERE type = 'ticket' ORDER BY rowid DESC LIMIT 5").all();
  console.log(JSON.stringify(rows.map(r => ({ type: r.type, code: r.code, name: r.name, amount: r.amount, currency: r.currency, payload: JSON.parse(r.payload) })), null, 2));
} else {
  console.log('No miniflare sqlite files found');
}
