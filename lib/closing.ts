import {FinanceRow} from './balances';
import {ticketSupplierDue, ticketSupplierName} from './tickets';

export interface CurrencyClosingSummary {
  currency: string;
  ticketCount: number;
  ticketIncomeMinor: number;
  ticketSalesMinor: number;
  serviceCount: number;
  serviceIncomeMinor: number;
  visaCount: number;
  visaIncomeMinor: number;
  otherIncomeMinor: number;
  totalIncomeMinor: number; // إجمالي الإيرادات
  operatingExpensesMinor: number; // المصروفات التشغيلية والإدارية
  brokerCommissionsMinor: number; // عمولات المسوقين/البروكرز
  totalExpensesMinor: number; // إجمالي المصروفات
  netProfitMinor: number; // صافي أرباح/خسائر الفترة
  cashReceiptsMinor: number;
  cashPaymentsMinor: number;
  bankReceiptsMinor: number;
  bankPaymentsMinor: number;
}

export interface PeriodFinancials {
  fromDate: string;
  toDate: string;
  year: number;
  month?: number;
  periodLabel: string;
  isLocked: boolean;
  postingLockedUntil: string;
  currencies: CurrencyClosingSummary[];
  totalOperations: number;
  unpostedStagedCount: number;
  expenseCategories: { category: string; currency: string; amountMinor: number }[];
  cashBalancesEnding: { id: string; name: string; currency: string; balanceMinor: number }[];
  bankBalancesEnding: { id: string; name: string; currency: string; balanceMinor: number }[];
}

export function getPeriodDates(year: number, month?: number): { fromDate: string; toDate: string; label: string } {
  if (month && month >= 1 && month <= 12) {
    const mStr = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const lStr = String(lastDay).padStart(2, '0');
    const monthNames = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return {
      fromDate: `${year}-${mStr}-01`,
      toDate: `${year}-${mStr}-${lStr}`,
      label: `شهر ${monthNames[month - 1]} (${mStr}/${year})`
    };
  }
  return {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    label: `السنة المالية الكاملة ${year}`
  };
}

export function calculatePeriodClosing(
  rows: FinanceRow[],
  fromDate: string,
  toDate: string,
  year: number,
  month?: number,
  postingLockedUntil = '',
  unpostedStagedCount = 0
): PeriodFinancials {
  const periodLabel = getPeriodDates(year, month).label;
  const isLocked = !!postingLockedUntil && toDate <= postingLockedUntil;

  const currMap = new Map<string, CurrencyClosingSummary>();

  function getCurr(c: string): CurrencyClosingSummary {
    const cur = c || 'USD';
    let entry = currMap.get(cur);
    if (!entry) {
      entry = {
        currency: cur,
        ticketCount: 0,
        ticketIncomeMinor: 0,
        ticketSalesMinor: 0,
        serviceCount: 0,
        serviceIncomeMinor: 0,
        visaCount: 0,
        visaIncomeMinor: 0,
        otherIncomeMinor: 0,
        totalIncomeMinor: 0,
        operatingExpensesMinor: 0,
        brokerCommissionsMinor: 0,
        totalExpensesMinor: 0,
        netProfitMinor: 0,
        cashReceiptsMinor: 0,
        cashPaymentsMinor: 0,
        bankReceiptsMinor: 0,
        bankPaymentsMinor: 0
      };
      currMap.set(cur, entry);
    }
    return entry;
  }

  let totalOperations = 0;
  const expenseCatMap = new Map<string, number>();

  // Filter rows within period
  for (const r of rows) {
    const p = r.payload || {};
    if (p.archived || (p.status && p.status !== 'active')) continue;

    const inPeriod = r.date >= fromDate && r.date <= toDate;

    // Tickets
    if (r.kind === 'ticket' && inPeriod) {
      totalOperations++;
      const c = getCurr(r.currency);
      c.ticketCount++;
      c.ticketSalesMinor += r.amount;
      const income = p.incomeMinor !== undefined ? Number(p.incomeMinor) : 0;
      c.ticketIncomeMinor += income;
      c.totalIncomeMinor += income;

      const broker = p.flags?.Broker ? (p.brokerCommissionMinor ?? Math.round(Number(p.brokerCommission || 0) * 100)) : 0;
      if (broker > 0) {
        c.brokerCommissionsMinor += broker;
        c.totalExpensesMinor += broker;
      }
    }

    // Services
    if (r.kind === 'service' && inPeriod) {
      totalOperations++;
      const c = getCurr(r.currency);
      c.serviceCount++;
      const qty = Number(p.quantity || 1);
      const unitCost = Number(p.cost || 0);
      const totalCostMinor = Math.round(unitCost * qty * 100);
      const supplierDue = p.supplierDueMinor !== undefined ? Number(p.supplierDueMinor) : totalCostMinor;
      const broker = p.flags?.Broker ? (p.brokerCommissionMinor ?? Math.round(Number(p.brokerCommission || 0) * 100)) : 0;
      const inc = r.amount - (p.supplierId ? supplierDue : 0) - broker;
      c.serviceIncomeMinor += inc;
      c.totalIncomeMinor += inc;
      if (broker > 0) {
        c.brokerCommissionsMinor += broker;
        c.totalExpensesMinor += broker;
      }
    }

    // Visas
    if (r.kind === 'visa' && inPeriod) {
      totalOperations++;
      const c = getCurr(r.currency);
      c.visaCount++;
      c.visaIncomeMinor += r.amount;
      c.totalIncomeMinor += r.amount;
    }

    // Expenses
    if (r.kind === 'expense' && inPeriod) {
      totalOperations++;
      const c = getCurr(r.currency);
      const expMinor = Math.abs(r.amount);
      c.operatingExpensesMinor += expMinor;
      c.totalExpensesMinor += expMinor;

      const catKey = `${r.name}__${r.currency}`;
      expenseCatMap.set(catKey, (expenseCatMap.get(catKey) || 0) + expMinor);
    }

    // Cash movements in period
    if (r.kind === 'cash' && inPeriod) {
      totalOperations++;
      const c = getCurr(r.currency);
      if (p.direction === 'receipt' || r.amount > 0) {
        c.cashReceiptsMinor += Math.abs(r.amount);
      } else {
        c.cashPaymentsMinor += Math.abs(r.amount);
      }
    }

    // Bank movements in period
    if (r.kind === 'bank' && inPeriod) {
      totalOperations++;
      const c = getCurr(r.currency);
      if (p.direction === 'deposit' || p.direction === 'receipt' || r.amount > 0) {
        c.bankReceiptsMinor += Math.abs(r.amount);
      } else {
        c.bankPaymentsMinor += Math.abs(r.amount);
      }
    }
  }

  // Calculate Net Profit for each currency
  for (const c of currMap.values()) {
    c.netProfitMinor = c.totalIncomeMinor - c.totalExpensesMinor;
  }

  // Ending Cash and Bank account balances up to toDate
  const cashAccounts = rows.filter(r => r.kind === 'cash-account' && !r.payload?.archived);
  const bankAccounts = rows.filter(r => r.kind === 'bank-account' && !r.payload?.archived);

  const cashEndingMap = new Map<string, { id: string; name: string; currency: string; balanceMinor: number }>();
  for (const a of cashAccounts) {
    cashEndingMap.set(a.id, { id: a.id, name: a.name, currency: a.currency, balanceMinor: a.amount || 0 });
  }

  const bankEndingMap = new Map<string, { id: string; name: string; currency: string; balanceMinor: number }>();
  for (const b of bankAccounts) {
    bankEndingMap.set(b.id, { id: b.id, name: b.name, currency: b.currency, balanceMinor: b.amount || 0 });
  }

  // Accumulate movements up to toDate
  for (const r of rows) {
    if (r.date > toDate || r.payload?.status === 'voided' || r.payload?.archived) continue;
    const tid = r.payload?.treasuryId;
    if (r.kind === 'cash' && tid && cashEndingMap.has(tid)) {
      cashEndingMap.get(tid)!.balanceMinor += r.amount;
    }
    if (r.kind === 'bank' && tid && bankEndingMap.has(tid)) {
      bankEndingMap.get(tid)!.balanceMinor += r.amount;
    }
  }

  const expenseCategories = Array.from(expenseCatMap.entries()).map(([key, amountMinor]) => {
    const [category, currency] = key.split('__');
    return { category, currency, amountMinor };
  }).sort((a, b) => b.amountMinor - a.amountMinor);

  return {
    fromDate,
    toDate,
    year,
    month,
    periodLabel,
    isLocked,
    postingLockedUntil,
    currencies: Array.from(currMap.values()),
    totalOperations,
    unpostedStagedCount,
    expenseCategories,
    cashBalancesEnding: Array.from(cashEndingMap.values()),
    bankBalancesEnding: Array.from(bankEndingMap.values())
  };
}
