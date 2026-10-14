import sqlite3, glob, json

files = [f for f in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not f.endswith('metadata.sqlite')]
conn = sqlite3.connect(files[0])
cur = conn.cursor()
cur.execute("SELECT kind, module, code, name, currency, amount, payload FROM records WHERE module IN ('banks', 'financial') ORDER BY rowid DESC LIMIT 10")
for row in cur.fetchall():
    print(row[0], row[1], row[2], row[3], row[4], row[5])
    print(json.dumps(json.loads(row[6]), indent=2, ensure_ascii=False))
