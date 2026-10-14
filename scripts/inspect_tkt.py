import sqlite3, glob, json

files = [f for f in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not f.endswith('metadata.sqlite')]
if files:
    conn = sqlite3.connect(files[0])
    cur = conn.cursor()
    cur.execute("SELECT kind, code, name, currency, amount, payload FROM records WHERE kind = 'ticket' ORDER BY rowid DESC LIMIT 3")
    for row in cur.fetchall():
        print("TICKET:", row[0], row[1], row[2], row[3], row[4])
        print(json.dumps(json.loads(row[5]), indent=2, ensure_ascii=False))
