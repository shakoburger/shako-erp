import {portalContext} from '@/lib/portal';
import {accountBalances} from '@/lib/balances';
import {today} from '@/lib/domain';

export async function GET(req: Request) {
  try {
    const {customer, agency, settings, database} = await portalContext(req);

    // Load active records to compute balances
    const records = await database.prepare("SELECT * FROM records ORDER BY date DESC, created_at DESC").all<any>();
    const unpacked = (records.results || []).map((r: any) => ({
      ...r,
      payload: JSON.parse(r.payload),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    const allBalances = accountBalances(unpacked, today(), settings.modules);
    const customerBalances = allBalances.filter(b => b.accountId === customer.id);

    // Extract credit limits
    const p = customer.payload || {};
    const creditLimit = p.creditLimit || 0;

    return Response.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: p.phone || '',
        email: p.email || '',
        address: p.address || '',
        creditLimit
      },
      balances: customerBalances.map(b => ({
        currency: b.currency,
        debitMinor: b.debitMinor,
        creditMinor: b.creditMinor,
        balanceMinor: b.balanceMinor,
        isDebit: b.balanceMinor > 0
      })),
      agency: {
        name: settings.companyName || agency.name,
        phones: settings.phones || '',
        address: settings.address || '',
        email: settings.agencyEmail || '',
        logoKey: settings.logoKey || null,
        defaultCurrency: settings.defaultCurrency || 'USD'
      }
    });
  } catch (err: any) {
    return Response.json({ error: err.message || 'غير مصرح به' }, { status: 401 });
  }
}
