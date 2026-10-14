import {platformDB, legacyAgencyId, Agency} from '@/lib/platform';
import {tenantDB} from '@/lib/tenant-db';
import {cleanWhatsAppPhone} from '@/lib/whatsapp';
import {createPortalToken, portalCookieHeader, clearPortalCookieHeader} from '@/lib/portal';
import {defaults, Settings} from '@/lib/domain';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as any;
    const phoneInput = String(body.phone || '').trim();
    const codeInput = String(body.code || '').trim();
    const requestedAgencyId = body.agencyId || legacyAgencyId;

    if (!phoneInput || !codeInput) {
      return Response.json({ error: 'الرجاء إدخال رقم الهاتف ورمز الدخول (PIN)' }, { status: 400 });
    }

    const rawDB = platformDB();
    // Resolve agency
    let agencyRow = await rawDB.prepare('SELECT * FROM platform_agencies WHERE id = ?').bind(requestedAgencyId).first<Agency>();
    if (!agencyRow) {
      agencyRow = await rawDB.prepare("SELECT * FROM platform_agencies WHERE state = 'active' LIMIT 1").first<Agency>();
    }
    if (!agencyRow) {
      return Response.json({ error: 'لا توجد وكالة نشطة متاحة' }, { status: 404 });
    }

    const db = tenantDB(rawDB, agencyRow.namespace);
    const sysRow = await db.prepare('SELECT payload FROM system_settings WHERE id = 1').first<any>();
    const settings: Settings = sysRow ? { ...defaults, ...JSON.parse(sysRow.payload) } : defaults;

    // Search for customer by phone number
    const customers = await db.prepare("SELECT * FROM records WHERE kind = 'customer'").all<any>();
    const cleanedSearchPhone = cleanWhatsAppPhone(phoneInput);
    const searchDigits = phoneInput.replace(/\D/g, '');

    const matched = (customers.results || []).find((c: any) => {
      try {
        const p = JSON.parse(c.payload);
        if (p.archived || p.status === 'voided') return false;
        const cPhone = p.phone || '';
        const cClean = cleanWhatsAppPhone(cPhone);
        const cDigits = cPhone.replace(/\D/g, '');
        // Match either cleaned full international, or raw digits, or last 9 digits
        return (
          (cleanedSearchPhone && cClean && cClean === cleanedSearchPhone) ||
          (searchDigits && cDigits && (cDigits === searchDigits || cDigits.endsWith(searchDigits) || searchDigits.endsWith(cDigits)))
        );
      } catch {
        return false;
      }
    });

    if (!matched) {
      return Response.json({ error: 'رقم الهاتف غير مسجل لدى الوكالة. يرجى التواصل مع الوكالة لفتح حساب.' }, { status: 404 });
    }

    const p = JSON.parse(matched.payload);
    // Check if portal is explicitly disabled
    if (p.portalEnabled === false) {
      return Response.json({ error: 'بوابة العملاء غير مفعلة لهذا الحساب؛ يرجى مراجعة إدارة الوكالة' }, { status: 403 });
    }

    // Expected code:
    // 1. Explicitly configured portalCode
    // 2. Or fallback: last 4 digits of phone, or "1234"
    const cPhoneDigits = (p.phone || '').replace(/\D/g, '');
    const fallbackPin = cPhoneDigits.length >= 4 ? cPhoneDigits.slice(-4) : '1234';
    const expectedCode = String(p.portalCode || fallbackPin).trim();

    if (codeInput !== expectedCode) {
      return Response.json({ error: 'رمز الدخول (PIN) غير صحيح' }, { status: 401 });
    }

    const token = await createPortalToken({
      customerId: matched.id,
      customerName: matched.name,
      phone: p.phone || phoneInput,
      agencyId: agencyRow.id
    });

    return new Response(
      JSON.stringify({
        success: true,
        token,
        customer: {
          id: matched.id,
          name: matched.name,
          phone: p.phone || phoneInput,
          email: p.email || '',
          address: p.address || '',
          creditLimit: p.creditLimit || 0
        },
        agency: {
          name: settings.companyName || agencyRow.name,
          phones: settings.phones || '',
          address: settings.address || '',
          logoKey: settings.logoKey || null
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': portalCookieHeader(token, req)
        }
      }
    );
  } catch (err: any) {
    console.error('Portal auth error:', err);
    return Response.json({ error: err.message || 'حدث خطأ أثناء تسجيل الدخول' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearPortalCookieHeader(req)
    }
  });
}
