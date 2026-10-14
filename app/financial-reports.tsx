'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Search, Printer, Eye, ChevronDown, Check, Pencil } from 'lucide-react';
import { WhatsAppDialog } from '@/components/whatsapp-dialog';
import { buildStatementWhatsAppMessage, buildTicketWhatsAppMessage } from '@/lib/whatsapp';
import { ERPIcon } from '@/components/erp-icons';
import { SearchablePicker } from '@/components/searchable-picker';
import { AgencyLetterhead, AgencyReportFooter } from '@/components/agency-letterhead';
import { ReportExports, permittedExport } from '@/components/report-export';
import { AccountStatement, accountStatementData, openRecordWorkspace } from '@/components/account-statement';
import { useWorkspaceWindow } from '@/components/workspace-window';
import { accountBalances } from '@/lib/balances';
import { statementReport, dailySales, type SalesSummary } from '@/lib/financial-reports';
import { money, today, moduleEnabled, type Settings, type RecordRow } from '@/lib/domain';
import { api } from './erp-system';
import { ticketSupplierName, ticketSupplierDue } from '@/lib/tickets';
import { getAgencyBranches } from '@/lib/branches';
import type { ReportData } from '@/lib/export-reports';

const heads = [
  'الخطوط / المورد',
  'العملة',
  'العدد',
  'السعر',
  'الضرائب',
  'سعر التذاكر الأساسي',
  'حساب الركاب',
  'حساب المورد',
  'العمولة قبل البروكر',
  'الخصم',
  'عمولة البروكر',
  'صافي دخل المكتب',
];

const salesValues = (g: SalesSummary) => [
  g.supplier,
  g.currency,
  g.quantity,
  g.fareMinor / 100,
  g.taxMinor / 100,
  g.baseMinor / 100,
  g.customerMinor / 100,
  g.supplierMinor / 100,
  g.commissionMinor / 100,
  g.discountMinor / 100,
  g.brokerMinor / 100,
  g.incomeMinor / 100,
];

export function FinancialReport({ mode, settings }: { mode: string; settings: Settings }) {
  const w = useWorkspaceWindow();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [all, setAll] = useState(false);
  const [account, setAccount] = useState('');
  const [currency, setCurrency] = useState('all');
  const [ticketId, setTicketId] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [whatsAppModal, setWhatsAppModal] = useState<{
    title: string;
    name: string;
    phone: string;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api('/api/records?kind=all'));
      setError('');
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (w.active) load();
  }, [load, w.active, w.refreshKey]);

  // Branches & Multi-Branch Check
  const branches = getAgencyBranches(settings);
  const hasMultipleBranches = Boolean(branches && branches.length > 1);

  // Allowed rows according to branch & permissions
  const allowed = useMemo(() => {
    return rows.filter((r) => {
      if (branchId !== 'all') {
        const rb = r.payload?.branchId || 'main';
        if (rb !== branchId) return false;
      }
      return moduleEnabled(settings, r.module);
    });
  }, [rows, branchId, settings]);

  const balances = useMemo(() => {
    return accountBalances(allowed, '9999-12-31', settings.modules);
  }, [allowed, settings.modules]);

  const codes = useMemo(() => {
    return [...new Set(balances.map((b) => b.currency).concat(allowed.map((r) => r.currency)))]
      .filter((c) => c && c !== 'MULTI')
      .sort();
  }, [balances, allowed]);

  // Labels for account types
  const kindLabels: Record<string, string> = {
    customer: 'عميل',
    'bank-account': 'حساب بنكي',
    bank: 'حساب بنكي',
    'cash-account': 'خزينة',
    cash: 'خزينة',
    account: 'حساب عام',
    expense: 'مصروفات',
    employee: 'موظف',
    supplier: 'مورد',
  };

  // Full Entity Directory: Customers, Suppliers, Airlines, Banks, Cash boxes, Expenses, Employees
  const entityList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; kind: string; typeLabel: string }>();

    for (const r of allowed.filter((r) =>
      ['customer', 'account', 'expense', 'employee', 'cash-account', 'bank-account', 'cash', 'bank'].includes(r.kind)
    )) {
      let tLabel = 'حساب عام';
      if (r.kind === 'customer') {
        const at = r.payload?.accountType;
        if (at === 'airline') tLabel = 'خط طيران';
        else if (at === 'supplier') tLabel = 'مورد';
        else tLabel = 'عميل';
      } else if (r.kind === 'account' || r.kind === 'expense') {
        const at = r.payload?.accountType;
        if (at === 'expense' || r.kind === 'expense') tLabel = 'مصروفات';
        else if (at === 'commission') tLabel = 'عمولة';
        else if (at === 'revenue') tLabel = 'إيرادات';
        else tLabel = 'حساب عام';
      } else if (r.kind === 'bank-account' || r.kind === 'bank') {
        tLabel = 'حساب بنكي';
      } else if (r.kind === 'cash-account' || r.kind === 'cash') {
        tLabel = 'خزينة';
      } else if (r.kind === 'employee') {
        tLabel = 'موظف';
      }
      map.set(r.id, { id: r.id, name: r.name, kind: r.kind, typeLabel: tLabel });
    }

    for (const b of balances) {
      if (!map.has(b.accountId)) {
        let tLabel = kindLabels[b.kind] || 'حساب مالي';
        if (b.kind === 'customer') tLabel = 'عميل';
        else if (b.kind === 'bank-account') tLabel = 'حساب بنكي';
        else if (b.kind === 'cash-account') tLabel = 'خزينة';
        else if (b.kind === 'employee') tLabel = 'موظف';
        map.set(b.accountId, { id: b.accountId, name: b.name, kind: b.kind, typeLabel: tLabel });
      }
    }

    const kindOrder: Record<string, number> = {
      customer: 1,
      'bank-account': 2,
      bank: 2,
      'cash-account': 3,
      cash: 3,
      account: 4,
      expense: 5,
      employee: 6,
      supplier: 7,
    };

    return [...map.values()].sort(
      (a, b) => (kindOrder[a.kind] || 99) - (kindOrder[b.kind] || 99) || a.name.localeCompare(b.name)
    );
  }, [allowed, balances]);

  // Account options for SearchablePicker including "جميع الحسابات"
  const accountOptions = useMemo(() => {
    return [
      { value: 'all', label: '📊 جميع الحسابات (كشف شامل لكافة الحسابات)' },
      ...entityList.map((e) => ({
        value: e.id,
        label: `${e.name} · ${e.typeLabel}`,
      })),
    ];
  }, [entityList]);

  // Active Selected Entity ID
  const selectedEntityId = account.startsWith('[')
    ? (() => {
        try {
          return JSON.parse(account)[0];
        } catch {
          return account;
        }
      })()
    : account;

  const isAllAccounts = mode === 'statement' && selectedEntityId === 'all';
  const selectedEntity = isAllAccounts ? null : entityList.find((e) => e.id === selectedEntityId);

  // Available Currencies for Selected Entity or All Accounts
  const entityCurrs = useMemo(() => {
    if (isAllAccounts) return codes;
    if (!selectedEntityId) return codes;
    const entityBalances = balances.filter((b) => b.accountId === selectedEntityId);
    const relatedRecords = allowed.filter(
      (r) =>
        r.payload?.customerId === selectedEntityId ||
        r.payload?.counterpartyId === selectedEntityId ||
        r.id === selectedEntityId
    );
    const currs = [
      ...new Set([...entityBalances.map((b) => b.currency), ...relatedRecords.map((r) => r.currency)]),
    ]
      .filter(Boolean)
      .filter((c) => c !== 'MULTI')
      .sort();
    return currs.length ? currs : codes;
  }, [isAllAccounts, selectedEntityId, balances, allowed, codes]);

  const statementCurrencies = entityCurrs.length ? entityCurrs : codes;
  const statementCurrsToShow =
    currency === 'all'
      ? entityCurrs.length
        ? entityCurrs
        : [settings.defaultCurrency || codes[0] || 'USD']
      : [currency];

  // 1. Single Account Statement Sections
  const statementSections = useMemo(() => {
    if (!selectedEntity || isAllAccounts) return [];
    return statementCurrsToShow.map((curr) => {
      const curKey = JSON.stringify([selectedEntityId, curr]);
      const curSelected = balances.find((b) => b.key === curKey) || {
        key: curKey,
        accountId: selectedEntityId,
        kind: selectedEntity.kind,
        name: selectedEntity.name,
        currency: curr,
        debitMinor: 0,
        creditMinor: 0,
        balanceMinor: 0,
      };
      const curLedger = statementReport(allowed, curKey, from, to, all, settings.modules);
      const curBalance =
        accountBalances(allowed, today(), settings.modules).find((a) => a.key === curKey)?.balanceMinor || 0;
      const curData = accountStatementData({
        selected: curSelected,
        master: allowed.find((r) => r.id === selectedEntityId),
        currentBalanceMinor: curBalance,
        from,
        to,
        all,
        ledger: curLedger,
        settings,
      });
      return { curr, data: curData, ledger: curLedger };
    });
  }, [selectedEntity, isAllAccounts, statementCurrsToShow, selectedEntityId, balances, allowed, from, to, all, settings]);

  // 2. All Accounts Comprehensive Statement Sections
  const allAccountsSections = useMemo(() => {
    if (!isAllAccounts) return [];
    const currs = currency === 'all' ? (codes.length ? codes : [settings.defaultCurrency || 'USD']) : [currency];

    return currs.map((curr) => {
      const accountRows = entityList
        .map((ent) => {
          const curKey = JSON.stringify([ent.id, curr]);
          const curLedger = statementReport(allowed, curKey, from, to, all, settings.modules);
          const curBalance =
            accountBalances(allowed, today(), settings.modules).find((a) => a.key === curKey)?.balanceMinor || 0;
          return {
            account: ent,
            ledger: curLedger,
            currentBalance: curBalance,
            hasMovement:
              curLedger.openingMinor !== 0 ||
              curLedger.debitMinor !== 0 ||
              curLedger.creditMinor !== 0 ||
              curLedger.closingMinor !== 0 ||
              curLedger.entries.length !== 0,
          };
        })
        .filter((a) => a.hasMovement);

      const totalOpening = accountRows.reduce((s, a) => s + a.ledger.openingMinor, 0);
      const totalDebits = accountRows.reduce((s, a) => s + a.ledger.debitMinor, 0);
      const totalCredits = accountRows.reduce((s, a) => s + a.ledger.creditMinor, 0);
      const totalClosing = accountRows.reduce((s, a) => s + a.ledger.closingMinor, 0);

      // Chronological all entries
      const allEntries = accountRows
        .flatMap((a) =>
          a.ledger.entries.map((e) => ({
            ...e,
            accountName: a.account.name,
            accountId: a.account.id,
            accountType: a.account.typeLabel,
          }))
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.sortAt.localeCompare(b.sortAt) ||
            a.reference.localeCompare(b.reference)
        );

      const reportData: ReportData = {
        title: `كشف حساب شامل — لجميع الحسابات (${curr})`,
        subtitle: `${settings.companyName} · الهاتف: ${settings.phones}`,
        orientation: 'landscape',
        sections: [
          {
            title: 'ملخص كشف الحساب العام',
            items: [
              { label: 'نوع الكشف', value: 'كشف شامل لجميع الحسابات' },
              { label: 'الفترة', value: all ? 'كل الفترات' : `${from} إلى ${to}` },
              { label: 'عدد الحسابات النشطة', value: String(accountRows.length) },
              { label: 'العملة', value: curr },
            ],
          },
        ],
        opening: { label: 'إجمالي الأرصدة الافتتاحية', value: totalOpening / 100 },
        headers: [
          '#',
          'الحساب',
          'نوع الحساب',
          'الرصيد الافتتاحي',
          'إجمالي المدين (مطالبات)',
          'إجمالي الدائن (سداد)',
          'صافي الحركة',
          'الرصيد الختامي',
        ],
        amountColumns: [3, 4, 5, 6, 7],
        rows: accountRows.map((a, idx) => [
          idx + 1,
          a.account.name,
          a.account.typeLabel,
          a.ledger.openingMinor / 100,
          a.ledger.debitMinor / 100,
          a.ledger.creditMinor / 100,
          (a.ledger.closingMinor - a.ledger.openingMinor) / 100,
          a.ledger.closingMinor / 100,
        ]),
        totals: [
          'الإجمالي العام',
          '',
          '',
          totalOpening / 100,
          totalDebits / 100,
          totalCredits / 100,
          (totalClosing - totalOpening) / 100,
          totalClosing / 100,
        ],
        closing: { label: 'إجمالي الأرصدة الختامية', value: totalClosing / 100 },
        notes: [
          `الفترة: ${all ? 'كل الفترات' : `${from} إلى ${to}`} · العملة: ${curr}`,
          'المطالبات مدينة والسداد دائن؛ الرصيد الموجب مدين والسالب دائن.',
        ],
      };

      return {
        curr,
        accountRows,
        totalOpening,
        totalDebits,
        totalCredits,
        totalClosing,
        allEntries,
        reportData,
      };
    });
  }, [isAllAccounts, currency, codes, settings, entityList, allowed, from, to, all]);

  const primaryStatement = statementSections[0]?.data;
  const primaryAllAccountsReportData = allAccountsSections[0]?.reportData;

  // Each currency is kept completely independent — never merged into a single table
  const statementReports = useMemo(() => {
    if (mode !== 'statement' || !selectedEntity) return [];
    return statementSections.map((s) => s.data);
  }, [mode, selectedEntity, statementSections]);

  const statement = mode === 'statement';
  const ticketMode = ['ticket-receipt', 'refunded-tickets', 'economy-tickets'].includes(mode);
  const receipt = mode === 'ticket-receipt';
  const title = statement
    ? isAllAccounts
      ? 'كشف حساب شامل — لجميع الحسابات'
      : 'كشف حساب'
    : ({
        'economy-sales': 'تقرير مبيعات السفر الاقتصادي',
        'airline-sales': 'مبيعات الخطوط',
        'ticket-receipt': 'إيصال التذاكر',
        'refunded-tickets': 'التذاكر المستردة',
        'economy-tickets': 'تذاكر السفر الاقتصادي',
      } as Record<string, string>)[mode] || 'تقرير المبيعات اليومية';

  const invalid = from > to && (!statement || !all);

  const sales = dailySales(allowed, from, to, currency, mode === 'economy-sales');
  const summary = codes
    .map((code) => {
      const group = sales.filter((g) => g.currency === code);
      if (!group.length) return null;
      return group.reduce(
        (a, g) => {
          for (const k of [
            'quantity',
            'fareMinor',
            'taxMinor',
            'baseMinor',
            'customerMinor',
            'supplierMinor',
            'commissionMinor',
            'discountMinor',
            'brokerMinor',
            'incomeMinor',
          ] as const)
            a[k] += g[k];
          return a;
        },
        {
          ...group[0],
          key: 'total:' + code,
          supplier: 'الإجمالي',
          quantity: 0,
          fareMinor: 0,
          taxMinor: 0,
          baseMinor: 0,
          customerMinor: 0,
          supplierMinor: 0,
          commissionMinor: 0,
          discountMinor: 0,
          brokerMinor: 0,
          incomeMinor: 0,
        }
      );
    })
    .filter((g): g is SalesSummary => !!g);

  const ticketOptions = allowed.filter(
    (r) =>
      r.kind === 'ticket' &&
      r.date >= from &&
      r.date <= to &&
      (currency === 'all' || r.currency === currency) &&
      (mode === 'refunded-tickets'
        ? r.payload.status === 'refunded'
        : mode === 'economy-tickets'
        ? r.payload.flags?.['Non IATA'] && (!r.payload.status || r.payload.status === 'active')
        : true)
  );

  const ticketRows = receipt ? ticketOptions.filter((t) => t.id === ticketId) : ticketOptions;

  const ticketData: ReportData = {
    title: title + (receipt && ticketRows.length ? ' · ' + ticketRows[0].code : ''),
    subtitle: settings.companyName,
    headers: mode === 'refunded-tickets' ? [
      'تاريخ الاسترداد',
      'رقم التذكرة',
      'المسافر',
      'العميل',
      'الخطوط / المورد',
      'العملة',
      'السعر الأصلي',
      'غرامة الخطوط',
      'عمولة المورد',
      'المسترد من المورد',
      'عمولة المكتب',
      'المسترد للراكب',
      'الحالة',
    ] : [
      'التاريخ',
      'رقم التذكرة',
      'المسافر',
      'العميل',
      'الخطوط / المورد',
      'العملة',
      'سعر التذكرة الأساسي',
      'حساب المورد',
      'حساب الراكب',
      'عمولة البروكر',
      'صافي دخل المكتب',
      'الحالة',
    ],
    rows: ticketRows.map((t) => {
      const p = t.payload;
      if (mode === 'refunded-tickets') {
        const origSell = (p.originalSellMinor ?? (p.originalAmount ? Math.round(Number(p.originalAmount) * 100) : (p.ticketBaseMinor ?? t.amount))) / 100;
        const pen = Number(p.penalties || 0);
        const supComm = Number(p.supplierComm || p.brokerCommission || 0);
        const supRefund = (p.supplierRefundMinor ?? ticketSupplierDue(t)) / 100;
        const refComm = Number(p.refundComm || (p.incomeMinor ? p.incomeMinor / 100 : 0));
        const custRefund = (p.customerRefundMinor ?? t.amount) / 100;
        return [
          p.refundDate || t.date,
          t.code,
          t.name,
          p.customerName || '',
          ticketSupplierName(p),
          t.currency,
          origSell,
          pen,
          supComm,
          supRefund,
          refComm,
          custRefund,
          'مستردة'
        ];
      }
      return [
        t.date,
        t.code,
        t.name,
        p.customerName || '',
        ticketSupplierName(p),
        t.currency,
        (p.ticketBaseMinor ??
          Math.round(Number(p.fare || 0) * 100) +
            Object.values(p.taxes || {}).reduce<number>((a, v) => a + Math.round(Number(v || 0) * 100), 0)) / 100,
        ticketSupplierDue(t) / 100,
        t.amount / 100,
        (p.brokerCommissionMinor || 0) / 100,
        (p.incomeMinor || 0) / 100,
        p.status === 'refunded' ? 'مستردة' : p.status === 'cancelled' ? 'ملغاة' : 'نشطة',
      ];
    }),
    notes: [
      `الفترة: ${from} إلى ${to}`,
      mode === 'refunded-tickets'
        ? 'تقرير التذاكر المستردة: يوضح تفاصيل غرامة الإلغاء وعمولة المورد والمبالغ المستردة للمكتب والراكب.'
        : 'المبالغ هي القيم المحفوظة وقت الإصدار؛ التذكرة المستردة أو الملغاة تظهر للتوثيق ولا تدخل في المبيعات أو الأرصدة.',
    ],
  };

  const data: ReportData | undefined = statement
    ? isAllAccounts
      ? primaryAllAccountsReportData
      : primaryStatement
    : ticketMode
    ? ticketData
    : {
        title,
        subtitle: settings.companyName,
        headers: heads,
        rows: [...sales, ...summary].map(salesValues),
        notes: [
          `الفترة: ${from} إلى ${to}`,
          'العمولة قبل البروكر = حساب الركاب ناقص حساب المورد؛ صافي دخل المكتب بعد خصم عمولة البروكر. العملات مستقلة، والتذاكر الملغاة والمستردة مستبعدة.',
        ],
      };

  return (
    <div className="report-view" dir="rtl">
      {/* 1. Organized Filter Bar */}
      <div
        className="toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '16px',
        }}
      >
        {/* Account Picker */}
        {statement && (
          <div style={{ flex: '2 1 280px', minWidth: '260px' }}>
            <SearchablePicker
              label="الحساب"
              value={selectedEntityId || ''}
              onChange={setAccount}
              options={accountOptions}
              placeholder="اختر الحساب أو جميع الحسابات..."
              searchPlaceholder="ابحث باسم الحساب، العميل، الخطوط، الخزينة..."
              dir="rtl"
            />
          </div>
        )}

        {/* Currency Dropdown (Crisp, solid 42px box) */}
        <div style={{ flex: '1 1 140px', minWidth: '130px', maxWidth: '170px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: '#475569' }}>العملة</span>
            <select
              aria-label="العملة"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="report-select"
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                padding: '0 12px',
                fontSize: '13px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all">كل العملات</option>
              {(statement ? statementCurrencies : codes).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Ticket Picker for Ticket Receipt Mode */}
        {receipt && (
          <div style={{ flex: '2 1 260px', minWidth: '240px' }}>
            <SearchablePicker
              label="التذكرة"
              value={ticketId || ''}
              onChange={setTicketId}
              options={ticketOptions.map((t) => ({
                value: t.id,
                label: `${t.code} · ${t.name}${
                  t.payload?.receiptNumber ? ` · إيصال ${t.payload.receiptNumber}` : ''
                } · ${t.currency}`,
              }))}
              placeholder="اختر التذكرة"
              searchPlaceholder="ابحث برقم التذكرة أو المسافر أو الإيصال..."
              dir="rtl"
            />
          </div>
        )}

        {/* Branch Dropdown — Display ONLY when branches are added (multiple branches) */}
        {hasMultipleBranches && (
          <div style={{ flex: '1 1 150px', minWidth: '140px', maxWidth: '185px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 650, color: '#475569' }}>الفرع</span>
              <select
                aria-label="الفرع"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="report-select"
                style={{
                  width: '100%',
                  height: '42px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  padding: '0 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* From Date */}
        <div style={{ flex: '1 1 140px', minWidth: '135px', maxWidth: '175px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: '#475569' }}>من تاريخ</span>
            <input
              aria-label="من تاريخ"
              type="date"
              value={from}
              disabled={statement && all}
              onChange={(e) => setFrom(e.target.value)}
              className="report-date-input"
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: statement && all ? '#f1f5f9' : '#ffffff',
                color: '#0f172a',
                padding: '0 10px',
                fontSize: '13px',
                outline: 'none',
                cursor: statement && all ? 'not-allowed' : 'auto',
              }}
            />
          </label>
        </div>

        {/* To Date */}
        <div style={{ flex: '1 1 140px', minWidth: '135px', maxWidth: '175px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: '#475569' }}>إلى تاريخ</span>
            <input
              aria-label="إلى تاريخ"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="report-date-input"
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                padding: '0 10px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </label>
        </div>

        {/* All Periods Checkbox Badge */}
        {statement && (
          <div style={{ display: 'flex', alignItems: 'center', height: '42px' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: 650,
                color: all ? '#1d4ed8' : '#334155',
                cursor: 'pointer',
                padding: '0 12px',
                height: '42px',
                borderRadius: '8px',
                background: all ? '#eff6ff' : '#ffffff',
                border: all ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
              />
              كل الفترات
            </label>
          </div>
        )}

        {/* Search / Refresh Button */}
        <button
          type="button"
          className="search-button"
          aria-label="تحديث التقرير"
          onClick={load}
          style={{
            height: '42px',
            width: '44px',
            borderRadius: '8px',
            background: '#0f766e',
            color: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
          title="تحديث بيانات التقرير"
        >
          <Search size={18} />
        </button>
      </div>

      {/* 2. Action Toolbar (Print / Exports / WhatsApp) */}
      <div className="report-toolbar">
        <button
          disabled={
            loading ||
            !!error ||
            invalid ||
            (statement && !selectedEntity && !isAllAccounts) ||
            (receipt && !ticketRows.length)
          }
          onClick={() => permittedExport(() => window.print())}
        >
          <Printer size={17} />
          طباعة
        </button>

        <ReportExports
          data={data}
          reports={
            statement
              ? isAllAccounts
                ? allAccountsSections.map((s) => s.reportData)
                : statementReports
              : data
              ? [data]
              : undefined
          }
          disabled={
            loading ||
            !!error ||
            invalid ||
            (statement && !selectedEntity && !isAllAccounts) ||
            (receipt && !ticketRows.length)
          }
        />

        {statement && (selectedEntity || isAllAccounts) && (
          <button
            disabled={loading || !!error || invalid}
            onClick={() => {
              if (selectedEntity) {
                const entRow = allowed.find((r) => r.id === selectedEntityId);
                const phone = entRow?.payload?.phone || '';
                const primarySection = statementSections[0];
                const msg = buildStatementWhatsAppMessage({
                  customerName: selectedEntity.name,
                  from,
                  to,
                  balanceMinor: primarySection?.ledger?.closingMinor || 0,
                  currency: primarySection?.curr || settings.defaultCurrency || 'USD',
                  debitMinor: primarySection?.ledger?.debitMinor,
                  creditMinor: primarySection?.ledger?.creditMinor,
                  settings,
                });
                setWhatsAppModal({
                  title: 'إرسال كشف الحساب عبر WhatsApp 📲',
                  name: selectedEntity.name,
                  phone,
                  message: msg,
                });
              } else if (isAllAccounts) {
                const sec = allAccountsSections[0];
                const curr = sec?.curr || settings.defaultCurrency || 'USD';
                const msg = [
                  `📊 *كشف حساب شامل — كافة الحسابات* 📊`,
                  `🏢 *${settings.companyName || 'وكالة السفر'}*`,
                  `📅 *الفترة:* من ${all ? 'بداية العمليات' : from} إلى ${to}`,
                  `💱 *العملة:* ${curr}`,
                  `👥 *عدد الحسابات النشطة:* ${sec?.accountRows?.length || 0}`,
                  `──────────────────`,
                  `📈 *إجمالي المطالبات (مدين):* ${money(sec?.totalDebits || 0)} ${curr}`,
                  `📉 *إجمالي السداد (دائن):* ${money(sec?.totalCredits || 0)} ${curr}`,
                  `💰 *صافي الأرصدة الختامية:* ${money(sec?.totalClosing || 0)} ${curr}`,
                  `──────────────────`,
                  `للاستفسار: ${settings.phones}`,
                ].join('\n');
                setWhatsAppModal({
                  title: 'إرسال ملخص كشف الحساب العام عبر WhatsApp 📲',
                  name: 'الإدارة والمحاسبة',
                  phone: '',
                  message: msg,
                });
              }
            }}
            style={{ color: '#15803d', fontWeight: 600 }}
            title="إرسال كشف الحساب مباشرة عبر WhatsApp"
          >
            <ERPIcon name="whatsapp" size={17} /> إرسال عبر WhatsApp
          </button>
        )}

        {receipt && ticketRows.length > 0 && (
          <button
            disabled={loading || !!error || invalid}
            onClick={() => {
              const t = ticketRows[0];
              const p = t.payload || {};
              const cust = allowed.find((r) => r.id === p.customerId);
              const phone = cust?.payload?.phone || p.phone || '';
              const msg = buildTicketWhatsAppMessage({
                ticketCode: t.code,
                passengerName: t.name,
                customerName: p.customerName,
                airline: ticketSupplierName(p),
                route: p.route,
                flightDate: t.date,
                totalAmount: t.amount / 100,
                currency: t.currency,
                receiptNumber: p.receiptNumber,
                pnr: p.pnr,
                settings,
              });
              setWhatsAppModal({
                title: 'إرسال إيصال التذكرة عبر WhatsApp 📲',
                name: p.customerName || t.name,
                phone,
                message: msg,
              });
            }}
            style={{ color: '#15803d', fontWeight: 600 }}
            title="إرسال إيصال التذكرة مباشرة عبر WhatsApp"
          >
            <ERPIcon name="whatsapp" size={17} /> إرسال عبر WhatsApp
          </button>
        )}
      </div>

      {/* 3. States & Canvas */}
      {error ? (
        <div className="empty-row error-text">
          {error}
          <button onClick={load}>إعادة المحاولة</button>
        </div>
      ) : invalid ? (
        <div className="empty-row error-text">تاريخ البداية يجب أن يسبق تاريخ النهاية.</div>
      ) : loading ? (
        <div className="empty-row">جارٍ تحميل التقرير…</div>
      ) : statement && !selectedEntity && !isAllAccounts ? (
        <div className="empty-row">اختر الحساب لعرض حركاته وأرصدته، أو اختر "جميع الحسابات" لعرض كشف شامل لكافة الحسابات.</div>
      ) : receipt && !ticketRows.length ? (
        <div className="empty-row">اختر التذكرة لعرض إيصالها.</div>
      ) : (
        <div className="report-canvas">
          <article className={'report-paper detailed-financial-paper' + (statement ? ' statement-paper' : '')}>
            <AgencyLetterhead />
            <h1>{title}</h1>
            {!statement && (
              <p>
                {currency === 'all' ? 'كل العملات — إجمالي مستقل لكل عملة' : currency} · {from + ' إلى ' + to}
              </p>
            )}

            {/* STATEMENT REPORT VIEW */}
            {statement ? (
              isAllAccounts ? (
                /* ALL ACCOUNTS STATEMENT */
                allAccountsSections.map(
                  ({
                    curr,
                    accountRows,
                    totalOpening,
                    totalDebits,
                    totalCredits,
                    totalClosing,
                    allEntries,
                  }) => (
                    <div
                      key={curr}
                      className="statement-all-accounts-section"
                      style={{ marginBottom: allAccountsSections.length > 1 ? '36px' : 0 }}
                    >
                      {allAccountsSections.length > 1 && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            marginBottom: '14px',
                            flexWrap: 'wrap',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <strong style={{ color: '#15803d', fontSize: '17px' }}>العملة: {curr}</strong>
                            <span style={{ fontSize: '13px', color: '#166534' }}>
                              صافي الأرصدة الختامية: <b dir="ltr">{money(totalClosing)}</b> {curr}
                            </span>
                          </div>
                          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#475569' }}>تصدير كشف {curr}:</span>
                            <ReportExports data={allAccountsSections.find((s) => s.curr === curr)?.reportData} />
                          </div>
                        </div>
                      )}

                      {/* KPI Summary Cards */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '12px',
                          marginBottom: '18px',
                        }}
                      >
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                            عدد الحسابات النشطة
                          </small>
                          <strong style={{ fontSize: '18px', color: '#0f172a' }}>{accountRows.length}</strong>
                        </div>

                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                            الرصيد الافتتاحي العام
                          </small>
                          <strong dir="ltr" style={{ fontSize: '16px', color: '#334155' }}>
                            {money(totalOpening)}
                          </strong>
                        </div>

                        <div
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <small style={{ color: '#1e40af', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                            إجمالي المدين (مطالبات)
                          </small>
                          <strong dir="ltr" style={{ fontSize: '16px', color: '#1d4ed8' }}>
                            {money(totalDebits)}
                          </strong>
                        </div>

                        <div
                          style={{
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <small style={{ color: '#166534', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                            إجمالي الدائن (سداد)
                          </small>
                          <strong dir="ltr" style={{ fontSize: '16px', color: '#15803d' }}>
                            {money(totalCredits)}
                          </strong>
                        </div>

                        <div
                          style={{
                            background: totalClosing >= 0 ? '#eff6ff' : '#fff7ed',
                            border: totalClosing >= 0 ? '1px solid #bfdbfe' : '1px solid #ffedd5',
                            borderRadius: '8px',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <small
                            style={{
                              color: totalClosing >= 0 ? '#1e40af' : '#c2410c',
                              fontSize: '11px',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            صافي الأرصدة الختامية
                          </small>
                          <strong
                            dir="ltr"
                            style={{
                              fontSize: '18px',
                              color: totalClosing >= 0 ? '#1e40af' : '#c2410c',
                            }}
                          >
                            {money(totalClosing)}
                          </strong>
                        </div>
                      </div>

                      {/* Master Summary Table of All Accounts */}
                      <div className="financial-table-scroll" style={{ marginBottom: '22px' }}>
                        <table
                          className="statement-table"
                          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
                        >
                          <thead>
                            <tr style={{ background: '#1e3a8a', color: '#ffffff' }}>
                              <th style={{ width: '35px', textAlign: 'center', padding: '8px' }}>#</th>
                              <th style={{ textAlign: 'right', padding: '8px 10px' }}>اسم الحساب</th>
                              <th style={{ textAlign: 'center', padding: '8px', width: '90px' }}>النوع</th>
                              <th style={{ textAlign: 'left', padding: '8px 10px', width: '110px' }}>
                                الرصيد الافتتاحي
                              </th>
                              <th style={{ textAlign: 'left', padding: '8px 10px', width: '110px' }}>
                                المدين (مطالبات)
                              </th>
                              <th style={{ textAlign: 'left', padding: '8px 10px', width: '110px' }}>
                                الدائن (سداد)
                              </th>
                              <th style={{ textAlign: 'left', padding: '8px 10px', width: '110px' }}>صافي الحركة</th>
                              <th style={{ textAlign: 'left', padding: '8px 10px', width: '120px' }}>
                                الرصيد الختامي
                              </th>
                              <th style={{ textAlign: 'center', padding: '8px', width: '90px' }} className="no-print">
                                إجراء
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {accountRows.map((a, idx) => {
                              const net = a.ledger.closingMinor - a.ledger.openingMinor;
                              return (
                                <tr
                                  key={a.account.id}
                                  style={{
                                    background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                    borderBottom: '1px solid #e2e8f0',
                                  }}
                                >
                                  <td style={{ textAlign: 'center', padding: '8px 6px', color: '#64748b' }}>
                                    {idx + 1}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                    <button
                                      type="button"
                                      onClick={() => setAccount(a.account.id)}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#1e40af',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        textAlign: 'right',
                                        padding: 0,
                                      }}
                                      title="انقر لعرض كشف الحساب التفصيلي لهذا الحساب"
                                    >
                                      {a.account.name}
                                    </button>
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: '#e2e8f0',
                                        color: '#334155',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {a.account.typeLabel}
                                    </span>
                                  </td>
                                  <td dir="ltr" style={{ textAlign: 'left', padding: '8px 10px' }}>
                                    {money(a.ledger.openingMinor)}
                                  </td>
                                  <td
                                    dir="ltr"
                                    style={{ textAlign: 'left', padding: '8px 10px', color: '#1d4ed8' }}
                                  >
                                    {money(a.ledger.debitMinor)}
                                  </td>
                                  <td
                                    dir="ltr"
                                    style={{ textAlign: 'left', padding: '8px 10px', color: '#15803d' }}
                                  >
                                    {money(a.ledger.creditMinor)}
                                  </td>
                                  <td
                                    dir="ltr"
                                    style={{
                                      textAlign: 'left',
                                      padding: '8px 10px',
                                      fontWeight: 600,
                                      color: net >= 0 ? '#1e40af' : '#ea580c',
                                    }}
                                  >
                                    {money(net)}
                                  </td>
                                  <td
                                    dir="ltr"
                                    style={{
                                      textAlign: 'left',
                                      padding: '8px 10px',
                                      fontWeight: 700,
                                      color: a.ledger.closingMinor >= 0 ? '#0f172a' : '#c2410c',
                                    }}
                                  >
                                    {money(a.ledger.closingMinor)}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '6px' }} className="no-print">
                                    <button
                                      type="button"
                                      className="plain-button"
                                      onClick={() => setAccount(a.account.id)}
                                      style={{
                                        fontSize: '11px',
                                        padding: '4px 8px',
                                        minHeight: 'auto',
                                        borderRadius: '4px',
                                        color: '#2563eb',
                                        fontWeight: 600,
                                      }}
                                    >
                                      عرض الكشف
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            {accountRows.length === 0 && (
                              <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                                  لا توجد حركات أو أرصدة مسجلة في أي حساب لهذه العملة خلال الفترة المحددة.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {accountRows.length > 0 && (
                            <tfoot>
                              <tr style={{ background: '#1e3a8a', color: '#ffffff', fontWeight: 700 }}>
                                <td colSpan={3} style={{ padding: '10px', textAlign: 'right' }}>
                                  الإجمالي العام لكافة الحسابات ({curr})
                                </td>
                                <td dir="ltr" style={{ textAlign: 'left', padding: '10px' }}>
                                  {money(totalOpening)}
                                </td>
                                <td dir="ltr" style={{ textAlign: 'left', padding: '10px', color: '#93c5fd' }}>
                                  {money(totalDebits)}
                                </td>
                                <td dir="ltr" style={{ textAlign: 'left', padding: '10px', color: '#86efac' }}>
                                  {money(totalCredits)}
                                </td>
                                <td dir="ltr" style={{ textAlign: 'left', padding: '10px' }}>
                                  {money(totalClosing - totalOpening)}
                                </td>
                                <td
                                  dir="ltr"
                                  style={{
                                    textAlign: 'left',
                                    padding: '10px',
                                    color: '#fde047',
                                    fontSize: '14px',
                                    fontWeight: 800,
                                  }}
                                >
                                  {money(totalClosing)}
                                </td>
                                <td className="no-print" />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>

                      {/* Detailed Transactions Journal across all accounts */}
                      {allEntries.length > 0 && (
                        <div style={{ marginTop: '26px' }}>
                          <h3
                            style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#1e3a8a',
                              marginBottom: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span>سجل الحركات المالي المفصل لجميع الحسابات ({allEntries.length} حركة)</span>
                          </h3>
                          <div className="financial-table-scroll">
                            <table
                              className="statement-table"
                              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}
                            >
                              <thead>
                                <tr style={{ background: '#334155', color: '#ffffff' }}>
                                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '35px' }}>#</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'center', width: '105px', minWidth: '105px', whiteSpace: 'nowrap' }}>التاريخ</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'right', width: '140px' }}>الحساب</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'right', width: '100px' }}>
                                    المرجع / الإيصال
                                  </th>
                                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>البيان والتفاصيل</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'center', width: '60px' }}>R.O.E</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'left', width: '95px' }}>مدين</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'left', width: '95px' }}>دائن</th>
                                  <th className="no-print" style={{ padding: '7px 8px', textAlign: 'center', width: '65px' }}>إجراء</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allEntries.map((e, idx) => (
                                  <tr
                                    key={`${e.id}-${idx}`}
                                    className="statement-interactive-row"
                                    onClick={() => openRecordWorkspace(e)}
                                    title="اضغط للانتقال إلى شاشة العملية ومراجعتها أو تعديلها"
                                    style={{
                                      background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                      borderBottom: '1px solid #e2e8f0',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <td style={{ textAlign: 'center', padding: '6px', color: '#64748b' }}>
                                      {idx + 1}
                                    </td>
                                    <td dir="ltr" style={{ padding: '6px 10px', textAlign: 'center', width: '105px', minWidth: '105px', whiteSpace: 'nowrap' }}>
                                      {e.date}
                                    </td>
                                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{e.accountName}</td>
                                    <td dir="ltr" style={{ padding: '6px 10px', textAlign: 'right' }}>
                                      {e.reference}
                                    </td>
                                    <td style={{ padding: '6px 10px' }}>{e.description}</td>
                                    <td dir="ltr" style={{ padding: '6px', textAlign: 'center' }}>
                                      {e.rate ?? '—'}
                                    </td>
                                    <td dir="ltr" style={{ padding: '6px 10px', textAlign: 'left', color: '#1d4ed8' }}>
                                      {e.debitMinor ? money(e.debitMinor) : '—'}
                                    </td>
                                    <td dir="ltr" style={{ padding: '6px 10px', textAlign: 'left', color: '#15803d' }}>
                                      {e.creditMinor ? money(e.creditMinor) : '—'}
                                    </td>
                                    <td className="no-print" style={{ textAlign: 'center', padding: '4px' }}>
                                      <button
                                        type="button"
                                        className="statement-row-action-btn"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          openRecordWorkspace(e);
                                        }}
                                        title="الانتقال إلى شاشة العملية للتعديل"
                                      >
                                        <Pencil size={12} />
                                        <span>تعديل</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )
              ) : (
                /* SINGLE ACCOUNT STATEMENT */
                statementSections.map(({ curr, data: sData, ledger: sLedger }) => (
                  <div
                    key={curr}
                    className="statement-currency-section"
                    style={{ marginBottom: statementSections.length > 1 ? '32px' : 0 }}
                  >
                    {statementSections.length > 1 && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '8px',
                          padding: '10px 16px',
                          marginBottom: '14px',
                          flexWrap: 'wrap',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <strong style={{ color: '#15803d', fontSize: '16px' }}>العملة: {curr}</strong>
                          <span style={{ fontSize: '13px', color: '#166534' }}>
                            الرصيد الختامي: <b dir="ltr">{money(sLedger.closingMinor)}</b> {curr}
                          </span>
                        </div>
                        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#475569' }}>تصدير كشف {curr}:</span>
                          <ReportExports data={sData} />
                        </div>
                      </div>
                    )}
                    <AccountStatement data={sData} ledger={sLedger} />
                  </div>
                ))
              )
            ) : ticketMode ? (
              <>
                <div className="financial-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {ticketData.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ticketData.rows.map((row, i) => (
                        <tr key={ticketRows[i].id}>
                          {row.map((v, j) => (
                            <td key={j} dir={typeof v === 'number' ? 'ltr' : 'auto'}>
                              {typeof v === 'number' ? money(v * 100) : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!ticketRows.length && <p>لا توجد تذاكر مطابقة للفترة والفلاتر.</p>}
              </>
            ) : (
              <>
                <div className="financial-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {heads.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...sales, ...summary].map((g) => (
                        <tr key={g.key} className={g.key.startsWith('total:') ? 'sales-total' : ''}>
                          {salesValues(g).map((v, i) => (
                            <td key={i} dir={i ? 'ltr' : 'auto'}>
                              {typeof v === 'number' && i > 2 ? money(v * 100) : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!sales.length && <p>لا توجد مبيعات تذاكر نشطة خلال الفترة المحددة.</p>}
              </>
            )}

            {(data?.notes || []).slice(-1).map((n) => (
              <p className="report-footnote" key={n}>
                {n}
              </p>
            ))}
            {Object.values(settings.modules).some((v) => !v) && <p>تقرير جزئي؛ الأقسام الموقوفة مستبعدة.</p>}
            <AgencyReportFooter />
          </article>
        </div>
      )}

      {/* WhatsApp Dialog */}
      {whatsAppModal && (
        <WhatsAppDialog
          open={!!whatsAppModal}
          onOpenChange={(v) => !v && setWhatsAppModal(null)}
          title={whatsAppModal.title}
          recipientName={whatsAppModal.name}
          initialPhone={whatsAppModal.phone}
          initialMessage={whatsAppModal.message}
        />
      )}
    </div>
  );
}
