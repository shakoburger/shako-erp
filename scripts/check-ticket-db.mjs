import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');

for (const r of db.prepare("SELECT id, code, name, currency, amount, payload FROM records WHERE kind='ticket'").all()) {
  console.log(r);
}
