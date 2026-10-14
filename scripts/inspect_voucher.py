import sqlite3, glob, json

files = [f for f in glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not f.endswith('metadata.sqlite')]
conn = sqlite3.connect(files[0])
cur = conn.cursor()
cur.execute("SELECT id, kind, module, code, name, date, currency, amount, payload FROM records WHERE id LIKE '%ef07ab76%' OR code='00000001'")
for row in cur.fetchall():
    print("ID:", row[0], "KIND:", row[1], "CURR:", row[6], "AMT:", row[7])
    print(json.dumps(json.loads(row[8]), indent=2, ensure_ascii=False))
