import {context, handled, json, body, sameOrigin, gate, manage, agencyAbility, APIError, authSQL} from '@/lib/server';
import {getPeriodDates, calculatePeriodClosing} from '@/lib/closing';
import {today} from '@/lib/domain';

export async function GET(req: Request) {
  return handled(async () => {
    const c = await context();
    gate(c, 'accounts');

    const url = new URL(req.url);
    const currentYear = c.rawSettings.financialYear || new Date().getFullYear();
    const year = Number(url.searchParams.get('year') || currentYear);
    const monthParam = url.searchParams.get('month');
    const month = monthParam && monthParam !== 'all' ? Number(monthParam) : undefined;

    const {fromDate, toDate, label} = getPeriodDates(year, month);

    // Fetch all financial records
    const q = await c.database.prepare(
      "SELECT id, kind, name, code, date, currency, amount, payload, created_at FROM records WHERE module IN ('accounts', 'customers', 'cash', 'banks', 'tickets', 'reports')"
    ).all<any>();

    const rows = (q.results || []).map((r: any) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload || {})
    }));

    // Check pending staged operations in this period
    let unpostedStagedCount = 0;
    try {
      const stagedQ = await c.database.prepare(
        "SELECT COUNT(*) as cnt FROM records WHERE kind = 'staged-op' AND date >= ? AND date <= ? AND (json_extract(payload, '$.status') = 'pending' OR json_extract(payload, '$.status') IS NULL)"
      ).bind(fromDate, toDate).first<any>();
      unpostedStagedCount = Number(stagedQ?.cnt || 0);
    } catch {}

    const postingLockedUntil = c.rawSettings.postingLockedUntil || '';
    const financials = calculatePeriodClosing(rows, fromDate, toDate, year, month, postingLockedUntil, unpostedStagedCount);

    // Audit logs for closing actions
    const auditQ = await c.database.prepare(
      "SELECT actor, action, created_at, after_value FROM audit_log WHERE action LIKE '%إقفال%' OR action LIKE '%الفترة المحاسبية%' ORDER BY created_at DESC LIMIT 10"
    ).all<any>();

    return json({
      financials,
      agency: {
        companyName: c.rawSettings.companyName,
        defaultCurrency: c.rawSettings.defaultCurrency || 'USD',
        financialYear: c.rawSettings.financialYear || currentYear,
        postingLockedUntil
      },
      auditHistory: auditQ.results || []
    });
  });
}

export async function POST(req: Request) {
  return handled(async () => {
    sameOrigin(req);
    const c = await context();
    manage(c, 'accounts');

    const b = (await body(req)) as any;
    const action = b.action; // 'lock' | 'settle_close' | 'unlock' | 'roll_forward'
    const currentYear = c.rawSettings.financialYear || new Date().getFullYear();
    const year = Number(b.year || currentYear);
    const month = b.month && b.month !== 'all' ? Number(b.month) : undefined;
    const {fromDate, toDate, label} = getPeriodDates(year, month);

    const now = new Date().toISOString();

    if (action === 'lock') {
      // Update postingLockedUntil
      agencyAbility(c, 'manageSettings');
      const newSettings = { ...c.rawSettings, postingLockedUntil: toDate };
      const auditAction = `إقفال حركات الفترة المحاسبية حتى ${toDate} (${label})`;

      const result = await c.database.batch([
        c.database.prepare(`UPDATE system_settings SET payload=?, revision=revision+1, updated_at=? WHERE id=1 AND revision=? AND ${authSQL(c)}`).bind(JSON.stringify(newSettings), now, c.revision),
        c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(
          crypto.randomUUID(),
          c.user.email,
          auditAction,
          JSON.stringify({ postingLockedUntil: c.rawSettings.postingLockedUntil }),
          JSON.stringify({ postingLockedUntil: toDate }),
          now
        )
      ]);

      if (!result[0].meta.changes) throw new APIError(409, 'تغيرت إعدادات النظام؛ أعد المحاولة');
      return json({ ok: true, message: `تم إقفال الفترة بنجاح حتى ${toDate}`, postingLockedUntil: toDate });
    }

    if (action === 'settle_close') {
      // Full settlement: Generate closing entry and set lock
      agencyAbility(c, 'manageSettings');
      const entryId = crypto.randomUUID();
      const entryCode = `CLS-${year}${month ? `-${String(month).padStart(2, '0')}` : '-YR'}`;

      // Check if closing entry already exists
      const existingEntry = await c.database.prepare(
        "SELECT id FROM records WHERE code = ? AND kind = 'account'"
      ).bind(entryCode).first<any>();

      const entryPayload = {
        accountType: 'equity',
        closingPeriod: toDate,
        periodLabel: label,
        notes: b.notes || `قيد إقفال وتسوية الأرباح والخسائر عن ${label}`,
        systemGenerated: true,
        closedAt: now,
        closedBy: c.user.email,
        summaryByCurrency: b.currenciesSummary || []
      };

      const newSettings = { ...c.rawSettings, postingLockedUntil: toDate };
      const auditAction = `إقفال مالي وترحيل قيود تسوية أرباح وخسائر ${label} حتى ${toDate}`;

      const statements: any[] = [
        c.database.prepare(`UPDATE system_settings SET payload=?, revision=revision+1, updated_at=? WHERE id=1 AND revision=? AND ${authSQL(c)}`).bind(JSON.stringify(newSettings), now, c.revision),
        c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(
          crypto.randomUUID(),
          c.user.email,
          auditAction,
          JSON.stringify({ postingLockedUntil: c.rawSettings.postingLockedUntil }),
          JSON.stringify({ postingLockedUntil: toDate, entryCode }),
          now
        )
      ];

      if (existingEntry) {
        statements.push(
          c.database.prepare("UPDATE records SET payload = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(entryPayload), now, existingEntry.id)
        );
      } else {
        statements.push(
          c.database.prepare(
            "INSERT INTO records (id, kind, name, code, date, currency, amount, payload, module, created_at, updated_at) VALUES (?, 'account', ?, ?, ?, ?, 0, ?, 'accounts', ?, ?)"
          ).bind(
            entryId,
            `قيد إقفال وتسوية ${label}`,
            entryCode,
            toDate,
            c.rawSettings.defaultCurrency || 'USD',
            JSON.stringify(entryPayload),
            now,
            now
          )
        );
      }

      const result = await c.database.batch(statements);
      if (!result[0].meta.changes) throw new APIError(409, 'تغيرت البيانات؛ يرجى إعادة المحاولة');

      return json({
        ok: true,
        message: `تم إقفال الفترة وترحيل قيد التسوية ${entryCode} بنجاح`,
        postingLockedUntil: toDate,
        entryCode
      });
    }

    if (action === 'unlock') {
      // Reopen or modify lock date (Manager / Owner only)
      agencyAbility(c, 'manageSettings');
      const rollbackDate = b.unlockToDate !== undefined ? String(b.unlockToDate) : '';
      const reason = b.reason || 'إلغاء أو تعديل تاريخ إقفال الفترة بأمر الإدارة';
      const newSettings = { ...c.rawSettings, postingLockedUntil: rollbackDate };
      const auditAction = `فك إقفال الفترة المحاسبية: ${reason}`;

      const result = await c.database.batch([
        c.database.prepare(`UPDATE system_settings SET payload=?, revision=revision+1, updated_at=? WHERE id=1 AND revision=? AND ${authSQL(c)}`).bind(JSON.stringify(newSettings), now, c.revision),
        c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(
          crypto.randomUUID(),
          c.user.email,
          auditAction,
          JSON.stringify({ postingLockedUntil: c.rawSettings.postingLockedUntil }),
          JSON.stringify({ postingLockedUntil: rollbackDate, reason }),
          now
        )
      ]);

      if (!result[0].meta.changes) throw new APIError(409, 'تغيرت إعدادات النظام؛ أعد المحاولة');
      return json({ ok: true, message: `تم فك إقفال الفترة المحاسبية`, postingLockedUntil: rollbackDate });
    }

    if (action === 'roll_forward') {
      // Annual Year-End Close: Increment financialYear and lock ending date
      agencyAbility(c, 'manageSettings');
      const nextYear = year + 1;
      const endOfYear = `${year}-12-31`;
      const newSettings = {
        ...c.rawSettings,
        financialYear: nextYear,
        postingLockedUntil: endOfYear
      };
      const auditAction = `ترحيل السنة المالية وإقفال سنوي من ${year} إلى ${nextYear}`;

      const result = await c.database.batch([
        c.database.prepare(`UPDATE system_settings SET payload=?, revision=revision+1, updated_at=? WHERE id=1 AND revision=? AND ${authSQL(c)}`).bind(JSON.stringify(newSettings), now, c.revision),
        c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(
          crypto.randomUUID(),
          c.user.email,
          auditAction,
          JSON.stringify({ financialYear: year, postingLockedUntil: c.rawSettings.postingLockedUntil }),
          JSON.stringify({ financialYear: nextYear, postingLockedUntil: endOfYear }),
          now
        )
      ]);

      if (!result[0].meta.changes) throw new APIError(409, 'تغيرت إعدادات النظام؛ أعد المحاولة');
      return json({
        ok: true,
        message: `تم ترحيل السنة المالية بنجاح إلى عام ${nextYear} مع إقفال حركات عام ${year}`,
        financialYear: nextYear,
        postingLockedUntil: endOfYear
      });
    }

    throw new APIError(400, 'إجراء غير معروف');
  });
}
