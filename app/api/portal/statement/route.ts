import {portalContext} from '@/lib/portal';
import {statementReport} from '@/lib/financial-reports';
import {today} from '@/lib/domain';

export async function GET(req: Request) {
  try {
    const {customer, settings, database} = await portalContext(req);
    const url = new URL(req.url);
    const from = url.searchParams.get('from') || today().slice(0, 8) + '01';
    const to = url.searchParams.get('to') || today();
    const currency = url.searchParams.get('currency') || settings.defaultCurrency || 'USD';
    const all = url.searchParams.get('all') === 'true';

    // Fetch records
    const records = await database.prepare("SELECT * FROM records ORDER BY date DESC, created_at DESC").all<any>();
    const unpacked = (records.results || []).map((r: any) => ({
      ...r,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    const accountKey = JSON.stringify([customer.id, currency]);
    const report = statementReport(unpacked, accountKey, from, to, all, settings.modules);

    return Response.json({
      currency,
      from,
      to,
      all,
      openingMinor: report.openingMinor,
      closingMinor: report.closingMinor,
      debitMinor: report.debitMinor,
      creditMinor: report.creditMinor,
      entries: report.entries.map(e => ({
        id: e.id,
        date: e.date,
        description: e.description,
        reference: e.reference,
        debitMinor: e.debitMinor,
        creditMinor: e.creditMinor,
        movementMinor: e.movementMinor,
        balanceMinor: e.balanceMinor,
        opening: e.opening
      }))
    });
  } catch (err: any) {
    return Response.json({ error: err.message || 'فشل جلب كشف الحساب' }, { status: 400 });
  }
}
