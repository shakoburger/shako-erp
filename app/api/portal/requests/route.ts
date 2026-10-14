import {portalContext} from '@/lib/portal';
import {today} from '@/lib/domain';

export async function POST(req: Request) {
  try {
    const {customer, database} = await portalContext(req);
    const body = (await req.json()) as any;

    const requestType = body.type || 'ticket-new'; // 'ticket-new' or 'cash-receipt'
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const date = body.date || today();
    const code = `B2B-${id.slice(0, 6).toUpperCase()}`;

    let amount = 0;
    let currency = body.currency || 'USD';
    let payload: Record<string, any> = {
      type: requestType,
      source: 'b2b-portal',
      status: 'pending',
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.payload?.phone || '',
      submittedAt: now,
      notes: body.notes || ''
    };

    if (requestType === 'cash-receipt') {
      amount = Number(body.amount || 0);
      currency = body.currency || 'USD';
      payload = {
        ...payload,
        amount,
        sellingPrice: amount,
        currency,
        bankName: body.bankName || '',
        bankTxId: body.bankTxId || '',
        attachment: body.attachment || null, // { name, type, size, data }
        person: customer.name,
        notes: body.notes ? `إشعار تحويل من البوابة: ${body.notes}` : `إشعار سداد بنكي من بوابة العميل ${customer.name}`
      };
    } else {
      // Booking request
      const paxList = body.passengers && Array.isArray(body.passengers) ? body.passengers : [{ name: body.passengerName || customer.name, ticketNo: '' }];
      payload = {
        ...payload,
        passengers: paxList,
        passenger: paxList[0]?.name || customer.name,
        person: paxList[0]?.name || customer.name,
        route: body.route || '',
        flightDate: body.flightDate || date,
        airline: body.airline || '',
        attachment: body.attachment || null,
        notes: body.notes ? `طلب حجز من البوابة: ${body.notes}` : `طلب حجز تذكرة من بوابة العميل ${customer.name}`
      };
    }

    const titleName = requestType === 'cash-receipt' 
      ? `إشعار تحويل: ${customer.name} (${amount} ${currency})` 
      : `طلب حجز: ${payload.passenger || customer.name}`;

    await database.prepare(`
      INSERT INTO records (id, kind, module, code, name, date, currency, amount, payload, created_at, updated_at)
      VALUES (?, 'staged-op', 'tickets', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      code,
      titleName,
      date,
      currency,
      Math.round(amount * 100),
      JSON.stringify(payload),
      now,
      now
    ).run();

    return Response.json({
      success: true,
      id,
      code,
      message: requestType === 'cash-receipt'
        ? 'تم إرسال إشعار السداد بنجاح إلى فريق المحاسبة بالوكالة لمطابقته واعتماده.'
        : 'تم إرسال طلب الحجز بنجاح إلى فريق العمل بالوكالة وجارٍ تنفيذه.'
    });
  } catch (err: any) {
    console.error('Portal request error:', err);
    return Response.json({ error: err.message || 'فشل إرسال الطلب' }, { status: 400 });
  }
}
