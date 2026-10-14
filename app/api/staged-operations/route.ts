import {manage,context,handled,json,body,sameOrigin,gate,APIError} from '@/lib/server';
import {today} from '@/lib/domain';

const unpack = (r: any) => ({
  ...r,
  payload: JSON.parse(r.payload),
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export async function GET(req: Request) {
  return handled(async () => {
    const c = await context();
    gate(c, 'tickets');
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status') || 'pending';

    let query = "SELECT * FROM records WHERE kind = 'staged-op'";
    const params: any[] = [];

    if (type) {
      query += " AND json_extract(payload, '$.type') = ?";
      params.push(type);
    }
    if (status && status !== 'all') {
      query += " AND json_extract(payload, '$.status') = ?";
      params.push(status);
    }

    query += " ORDER BY date DESC, created_at DESC";

    const stmt = params.length > 0 
      ? c.database.prepare(query).bind(...params)
      : c.database.prepare(query);

    const r = await stmt.all();
    return json(r.results.map(unpack));
  });
}

export async function POST(req: Request) {
  return handled(async () => {
    sameOrigin(req);
    const c = await context();
    manage(c, 'tickets');
    const raw = await body(req);

    const id = raw.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const date = raw.date || raw.payload?.date || today();
    const customerName = (raw.customerName || raw.payload?.customerName || '').trim();
    const name = (raw.name || raw.payload?.name || '').trim() || customerName || 'عملية معلقة';
    const code = (raw.code || raw.payload?.code || '').trim() || `OP-${id.slice(0, 8).toUpperCase()}`;
    const currency = raw.currency || raw.payload?.currency || 'USD';
    const commAmount = Number(raw.commAmount ?? raw.payload?.commAmount ?? 0);
    const amount = Number(raw.amount ?? raw.payload?.sellingPrice ?? raw.payload?.amount ?? commAmount ?? 0);

    const payload = {
      type: raw.type || raw.payload?.type || 'ticket-new',
      status: raw.status || raw.payload?.status || 'pending',
      customerId: raw.customerId || raw.payload?.customerId,
      customerName: customerName || raw.payload?.customerName,
      airline: raw.airline || raw.payload?.airline || '',
      vendor: raw.vendor || raw.payload?.vendor || '',
      fare: Number(raw.fare ?? raw.payload?.fare ?? 0),
      sellingPrice: Number(raw.sellingPrice ?? raw.payload?.sellingPrice ?? amount),
      supplierPrice: Number(raw.supplierPrice ?? raw.payload?.supplierPrice ?? 0),
      commAmount,
      commPct: Number(raw.commPct ?? raw.payload?.commPct ?? 0),
      penalties: Number(raw.penalties ?? raw.payload?.penalties ?? 0),
      refundComm: Number(raw.refundComm ?? raw.payload?.refundComm ?? 0),
      taxes: raw.taxes || raw.payload?.taxes || {},
      route: raw.route || raw.payload?.route || '',
      class: raw.class || raw.payload?.class || '',
      person: raw.person || raw.payload?.person || '',
      treasuryId: raw.treasuryId || raw.payload?.treasuryId,
      treasuryName: raw.treasuryName || raw.payload?.treasuryName,
      counterpartyId: raw.counterpartyId || raw.payload?.counterpartyId,
      counterpartyName: raw.counterpartyName || raw.payload?.counterpartyName,
      crossCurrency: !!(raw.crossCurrency || raw.payload?.crossCurrency),
      coveredCurrency: raw.coveredCurrency || raw.payload?.coveredCurrency,
      coveredAmount: Number(raw.coveredAmount ?? raw.payload?.coveredAmount ?? 0),
      conversionRate: Number(raw.conversionRate ?? raw.payload?.conversionRate ?? 1),
      notes: raw.notes || raw.payload?.notes || '',
      attachment: raw.attachment || raw.payload?.attachment || null,
      createdBy: raw.payload?.createdBy || c.user.displayName || c.user.email
    };

    const existing = raw.id 
      ? await c.database.prepare("SELECT * FROM records WHERE id = ? AND kind = 'staged-op'").bind(id).first() 
      : null;

    if (existing) {
      await c.database.prepare(
        "UPDATE records SET name = ?, code = ?, date = ?, currency = ?, amount = ?, payload = ?, updated_at = ? WHERE id = ? AND kind = 'staged-op'"
      ).bind(name, code, date, currency, Math.round(amount * 100), JSON.stringify(payload), now, id).run();
    } else {
      await c.database.prepare(
        "INSERT INTO records (id, kind, module, code, name, date, currency, amount, payload, created_at, updated_at) VALUES (?, 'staged-op', 'tickets', ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, code, name, date, currency, Math.round(amount * 100), JSON.stringify(payload), now, now).run();
    }

    const saved = await c.database.prepare("SELECT * FROM records WHERE id = ?").bind(id).first();
    return json(unpack(saved), existing ? 200 : 201);
  });
}

export async function DELETE(req: Request) {
  return handled(async () => {
    sameOrigin(req);
    const c = await context();
    manage(c, 'tickets');
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) throw new APIError(400, 'حدد العملية المراد حذفها');

    await c.database.prepare("DELETE FROM records WHERE id = ? AND kind = 'staged-op'").bind(id).run();
    return json({ ok: true, deletedId: id });
  });
}
