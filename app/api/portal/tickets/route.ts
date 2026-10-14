import {portalContext} from '@/lib/portal';
import {ticketSupplierName} from '@/lib/tickets';

export async function GET(req: Request) {
  try {
    const {customer, database} = await portalContext(req);

    // Find tickets where customerId === customer.id
    const rows = await database.prepare("SELECT * FROM records WHERE kind = 'ticket' ORDER BY date DESC, created_at DESC").all<any>();

    const customerTickets = (rows.results || []).map((r: any) => {
      try {
        const p = JSON.parse(r.payload);
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          date: r.date,
          currency: r.currency,
          amount: r.amount / 100,
          payload: p
        };
      } catch {
        return null;
      }
    }).filter((t: any) => t && (t.payload?.customerId === customer.id || t.id === customer.id));

    return Response.json(
      customerTickets.map((t: any) => {
        const p = t.payload;
        return {
          id: t.id,
          code: t.code,
          passengerName: t.name,
          date: t.date,
          currency: t.currency,
          totalAmount: t.amount,
          receiptNumber: p.receiptNumber || '',
          pnr: p.pnr || '',
          airline: ticketSupplierName(p) || p.airline || '',
          route: p.route || '',
          class: p.class || '',
          status: p.status || 'active',
          passengers: p.passengers || [{ name: t.name, ticketNo: t.code }]
        };
      })
    );
  } catch (err: any) {
    return Response.json({ error: err.message || 'فشل جلب قائمة التذاكر' }, { status: 400 });
  }
}
