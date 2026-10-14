'use client';
import {AgencyLetterhead,AgencyReportFooter} from '@/components/agency-letterhead';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useWorkspaceWindow,WindowControls} from '@/components/workspace-window';
import {useAgencyAccess} from '@/components/access-context';
import {ReportExports,permittedExport} from '@/components/report-export';
import {SearchablePicker} from '@/components/searchable-picker';
import {ERPIcon} from '@/components/erp-icons';
import {
 Search,RefreshCw,Printer,Download,UploadCloud,CheckCircle2,
 AlertCircle,HelpCircle,Clock,ArrowUpRight,ArrowDownLeft,FileSpreadsheet,
 PlusCircle,Link2,Unlink2,Eye,FileText,Check,X,Info
} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {money,today,type Settings,type RecordRow} from '@/lib/domain';
import {api} from './erp-system';

export type BankStatementRow = {
 id: string;
 date: string;
 description: string;
 reference: string;
 debit: number; // سحب (outflow)
 credit: number; // إيداع (inflow)
 balance?: number;
 rawRowIndex?: number;
};

export type SystemTransaction = {
 id: string;
 date: string;
 code: string;
 name: string;
 type: string; // deposit, withdraw, transfer, cheque-issue, cheque-receive, ticket, etc.
 amountMinor: number; // positive = inflow/receipt, negative = outflow/payment
 amount: number;
 currency: string;
 notes: string;
 counterpartyName: string;
 chequeNumber?: string;
};

export type MatchedPair = {
 statementId: string;
 systemId: string;
 matchType: 'exact' | 'suggested' | 'manual';
 diffDays: number;
 score: number;
};

export function BankReconciliationWorkspace({
 mode,
 settings,
 onClose,
 initialStagedOp,
 onStagedConsumed
}:{
 mode: string;
 settings: Settings;
 onClose: () => void;
 initialStagedOp?: any;
 onStagedConsumed?: () => void;
}){
 const w = useWorkspaceWindow();
 const access = useAgencyAccess();
 const canManage = access.modules.banks === 'manage';

 // Backend Bank Data
 const [data, setData] = useState<{
  accounts: RecordRow[];
  currencies: {code: string; name: string; rate: number}[];
  counterparties: {id: string; kind: string; name: string; currency: string}[];
  vouchers: RecordRow[];
  ledger: RecordRow[];
 }>({accounts: [], currencies: [], counterparties: [], vouchers: [], ledger: []});

 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');

 const load = useCallback(async () => {
  try {
   const res: any = await api('/api/banks');
   setData(res);
   setError('');
  } catch (e: any) {
   setError(e.message || 'تعذر تحميل بيانات البنوك');
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => {
  if (w.active) load();
 }, [load, w.active, w.refreshKey]);

 // Filters and Form State
 const [selectedBankId, setSelectedBankId] = useState('');
 const [from, setFrom] = useState(() => today().slice(0, 8) + '01');
 const [to, setTo] = useState(() => today());
 const [statementBalance, setStatementBalance] = useState('');
 const [searchQuery, setSearchQuery] = useState('');
 const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'suggested' | 'unrecorded' | 'outstanding'>('all');
 const [viewMode, setViewMode] = useState<'workspace' | 'memo'>('workspace');

 // Bank Statement Data & Parsing
 const [statementRows, setStatementRows] = useState<BankStatementRow[]>([]);
 const [fileName, setFileName] = useState('');
 const [parsing, setParsing] = useState(false);
 const fileInputRef = useRef<HTMLInputElement>(null);

 // Manual Overrides: statementId -> systemId OR 'unmatched'
 const [manualMatches, setManualMatches] = useState<Record<string, string>>({});

 // Quick Post Dialog State
 const [quickPostRow, setQuickPostRow] = useState<BankStatementRow | null>(null);
 const [quickPostCounterpartyId, setQuickPostCounterpartyId] = useState('');
 const [quickPostNotes, setQuickPostNotes] = useState('');
 const [quickPostSubmitting, setQuickPostSubmitting] = useState(false);

 // Manual Linking Dialog State
 const [manualLinkTarget, setManualLinkTarget] = useState<BankStatementRow | null>(null);

 // Auto-select first bank account when accounts load
 useEffect(() => {
  if (data.accounts.length > 0 && !selectedBankId) {
   setSelectedBankId(data.accounts[0].id);
  }
 }, [data.accounts, selectedBankId]);

 const selectedBank = useMemo(() => {
  return data.accounts.find(a => a.id === selectedBankId);
 }, [data.accounts, selectedBankId]);

 // Calculate system book balance for the selected bank up to 'to' date
 const {systemTransactions, bookBalanceMinor} = useMemo(() => {
  if (!selectedBankId) return {systemTransactions: [], bookBalanceMinor: 0};

  const bankLedger = data.ledger.filter(l => l.payload?.treasuryId === selectedBankId);
  const totalBalance = bankLedger.filter(l => l.date <= to).reduce((sum, l) => sum + (l.amount || 0), 0);

  // System transactions within range
  const txns: SystemTransaction[] = bankLedger
   .filter(l => l.date >= from && l.date <= to)
   .map(l => {
    const voucher = data.vouchers.find(v => v.id === l.payload?.bankVoucherId);
    const p = voucher?.payload || l.payload || {};
    const minor = l.amount || 0;
    return {
     id: l.id,
     date: l.date,
     code: voucher?.code || l.code || '—',
     name: l.name || voucher?.name || 'حركة بنكية',
     type: p.type || (minor > 0 ? 'deposit' : 'withdraw'),
     amountMinor: minor,
     amount: Math.abs(minor) / 100,
     currency: l.currency || selectedBank?.currency || 'USD',
     notes: p.notes || '',
     counterpartyName: p.counterpartyName || p.treasuryName || '—',
     chequeNumber: p.chequeNumber
    };
   });

  return {systemTransactions: txns, bookBalanceMinor: totalBalance};
 }, [selectedBankId, data.ledger, data.vouchers, from, to, selectedBank]);

 const bookBalance = bookBalanceMinor / 100;

 // =========================================================================
 // Excel Template Download Generator
 // =========================================================================
 const downloadSampleStatement = useCallback(async () => {
  try {
   const ExcelJS = (await import('exceljs')).default;
   const workbook = new ExcelJS.Workbook();
   workbook.creator = 'SHAKO ERP';
   const sheet = workbook.addWorksheet('كشف حساب بنكي', {
    views: [{rightToLeft: true}],
    pageSetup: {orientation: 'landscape'}
   });

   // Title and info
   sheet.addRow([`كشف حساب استرشادي - ${selectedBank?.name || 'البنك الأهلي'}`]);
   sheet.addRow([`رقم الحساب: ${selectedBank?.payload?.accountNumber || '1029384756'} | العملة: ${selectedBank?.currency || 'EGP'}`]);
   sheet.addRow([`الفترة: من ${from} إلى ${to}`]);
   sheet.addRow([]);

   const headers = ['التاريخ', 'البيان / الوصف', 'رقم المرجع / الشيك', 'مدين (سحب)', 'دائن (إيداع)', 'الرصيد'];
   const headerRow = sheet.addRow(headers);
   headerRow.font = {bold: true, color: {argb: 'FFFFFFFF'}, size: 12};
   headerRow.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF0F766E'}};
   headerRow.alignment = {vertical: 'middle', horizontal: 'center'};

   const sampleRows = [
    [from, 'رصيد أول المدة الافتتاحي', 'OPEN-BAL', '', '', 50000.00],
    [from, 'تحويل بنكي وارد - العميل شركة الأهرام للسياحة', 'TXN-882190', '', 15000.00, 65000.00],
    [from, 'شيك صادر برقم 5521 لمورد تذاكر الطيران', 'CHQ-5521', 12500.00, '', 52500.00],
    [to, 'خصم مصاريف بنكية وعمولة تحويل إلكتروني', 'BNK-FEE-409', 250.00, '', 52250.00],
    [to, 'إيداع نقدي مباشر بواسطة العضو المنتدب', 'DEP-90112', '', 8000.00, 60250.00],
   ];

   sampleRows.forEach(row => {
    const r = sheet.addRow(row);
    r.getCell(4).numFmt = '#,##0.00';
    r.getCell(5).numFmt = '#,##0.00';
    r.getCell(6).numFmt = '#,##0.00';
   });

   sheet.columns.forEach((c, i) => {
    c.width = i === 1 ? 40 : 18;
    c.alignment = {vertical: 'middle', wrapText: true};
   });

   const buffer = await workbook.xlsx.writeBuffer();
   const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `نموذج_كشف_حساب_استرشادي_${today()}.xlsx`;
   a.click();
   setTimeout(() => URL.revokeObjectURL(url), 5000);
   toast.success('تم تنزيل نموذج كشف الحساب الاسترشادي (Excel) بنجاح');
  } catch (e: any) {
   toast.error('تعذر تنزيل النموذج: ' + (e.message || String(e)));
  }
 }, [selectedBank, from, to]);

 // =========================================================================
 // Bank Statement File Parser (.xlsx, .xls, .csv)
 // =========================================================================
 const parseFile = useCallback(async (file: File) => {
  setParsing(true);
  try {
   let rowsData: (string | number)[][] = [];

   if (file.name.endsWith('.csv')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    rowsData = lines.map(line => {
     // Regex handling quoted CSV
     const matches = line.match(/(".*?"|[^",\t]+)(?=\s*[,|\t]|\s*$)/g) || line.split(/[,;\t]/);
     return matches.map(m => m.replace(/^"(.*)"$/, '$1').trim());
    });
   } else {
    // Excel file (.xlsx / .xls)
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('الملف لا يحتوي على أي صفحات عمل');

    worksheet.eachRow((row) => {
     const rowValues: (string | number)[] = [];
     row.eachCell({includeEmpty: true}, (cell) => {
      let val = cell.value;
      if (val && typeof val === 'object') {
       if (val instanceof Date) {
        val = val.toISOString().slice(0, 10);
       } else if ('result' in val) {
        val = (val as any).result;
       } else if ('text' in val) {
        val = (val as any).text;
       }
      }
      rowValues.push(val as any ?? '');
     });
     if (rowValues.some(v => String(v).trim().length > 0)) {
      rowsData.push(rowValues);
     }
    });
   }

   if (rowsData.length < 2) {
    throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات كافية');
   }

   // Detect Header Row
   let headerRowIndex = -1;
   let dateCol = -1;
   let descCol = -1;
   let refCol = -1;
   let debitCol = -1;
   let creditCol = -1;
   let balanceCol = -1;

   for (let i = 0; i < Math.min(15, rowsData.length); i++) {
    const row = rowsData[i].map(c => String(c).trim().toLowerCase());
    let score = 0;
    let dCol = -1, desCol = -1, rCol = -1, debCol = -1, credCol = -1, balCol = -1;

    row.forEach((col, idx) => {
     if (/تاريخ|التاريخ|date|trans.*date|txn.*date|value.*date/i.test(col)) { dCol = idx; score++; }
     else if (/بيان|البيان|وصف|الوصف|تفاصيل|شرح|description|narration|details|particulars/i.test(col)) { desCol = idx; score++; }
     else if (/مرجع|المرجع|إشعار|شيك|رقم.*شيك|رقم.*مرجع|ref|reference|cheque|chq|txn.*id/i.test(col)) { rCol = idx; score++; }
     else if (/مدين|سحب|منصرف|خصم|سحوبات|debit|dr|withdrawal|out/i.test(col)) { debCol = idx; score++; }
     else if (/دائن|إيداع|وارد|إيداعات|credit|cr|deposit|in/i.test(col)) { credCol = idx; score++; }
     else if (/رصيد|الرصيد|balance|bal/i.test(col)) { balCol = idx; score++; }
    });

    if (score >= 2 && (debCol !== -1 || credCol !== -1 || balCol !== -1)) {
     headerRowIndex = i;
     dateCol = dCol;
     descCol = desCol;
     refCol = rCol;
     debitCol = debCol;
     creditCol = credCol;
     balanceCol = balCol;
     break;
    }
   }

   if (headerRowIndex === -1) {
    // Default fallback columns if header wasn't named standardly
    headerRowIndex = 0;
    dateCol = 0;
    descCol = 1;
    refCol = 2;
    debitCol = 3;
    creditCol = 4;
    balanceCol = 5;
   }

   const parsedList: BankStatementRow[] = [];
   let lastBalance: number | undefined = undefined;

   for (let i = headerRowIndex + 1; i < rowsData.length; i++) {
    const row = rowsData[i];
    if (!row || !row.length) continue;

    // Parse Date
    let rawDate = dateCol !== -1 ? String(row[dateCol] || '').trim() : '';
    let parsedDate = today();
    if (rawDate) {
     if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      parsedDate = rawDate;
     } else if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(rawDate)) {
      const parts = rawDate.split(/[\/-]/);
      parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
     }
    }

    const desc = descCol !== -1 ? String(row[descCol] || '').trim() : '';
    const ref = refCol !== -1 ? String(row[refCol] || '').trim() : '';

    const cleanNum = (val: any) => {
     if (typeof val === 'number') return val;
     const cleaned = String(val || '').replace(/[^0-9.-]/g, '');
     return cleaned ? parseFloat(cleaned) : 0;
    };

    const debit = debitCol !== -1 ? Math.abs(cleanNum(row[debitCol])) : 0;
    const credit = creditCol !== -1 ? Math.abs(cleanNum(row[creditCol])) : 0;
    const bal = balanceCol !== -1 && row[balanceCol] !== undefined ? cleanNum(row[balanceCol]) : undefined;

    if (bal !== undefined && !isNaN(bal)) {
     lastBalance = bal;
    }

    if (debit > 0 || credit > 0 || (desc && desc.length > 2)) {
     parsedList.push({
      id: `stmt-${i}-${Date.now()}`,
      date: parsedDate,
      description: desc || 'حركة بنكية',
      reference: ref,
      debit,
      credit,
      balance: bal,
      rawRowIndex: i + 1
     });
    }
   }

   setStatementRows(parsedList);
   setFileName(file.name);
   setManualMatches({});

   if (lastBalance !== undefined && !isNaN(lastBalance)) {
    setStatementBalance(lastBalance.toFixed(2));
    toast.info(`تم استخراج رصيد كشف الحساب البنكي تلقائياً: ${lastBalance.toFixed(2)} ${selectedBank?.currency || ''}`);
   }

   toast.success(`تم رفع وقراءة كشف الحساب بنجاح: تم استخراج ${parsedList.length} حركة.`);
  } catch (err: any) {
   toast.error('خطأ أثناء قراءة كشف الحساب: ' + (err.message || String(err)));
  } finally {
   setParsing(false);
  }
 }, [selectedBank]);

 // =========================================================================
 // Matching Engine: Compares Statement Rows with System Ledger
 // =========================================================================
 const {
  matchedPairs,
  unrecordedStatementRows,
  outstandingSystemRows,
  suggestedPairs,
  allReconciliationRows
 } = useMemo(() => {
  const matchedList: MatchedPair[] = [];
  const usedSystemIds = new Set<string>();
  const usedStatementIds = new Set<string>();

  // 1. Process manual matches first
  Object.entries(manualMatches).forEach(([stmtId, sysId]) => {
   if (sysId === 'unmatched') {
    usedStatementIds.add(stmtId);
    return;
   }
   const sRow = statementRows.find(s => s.id === stmtId);
   const sysRow = systemTransactions.find(t => t.id === sysId);
   if (sRow && sysRow) {
    matchedList.push({
     statementId: stmtId,
     systemId: sysId,
     matchType: 'manual',
     diffDays: 0,
     score: 100
    });
    usedStatementIds.add(stmtId);
    usedSystemIds.add(sysId);
   }
  });

  // 2. Automated Smart Matching
  statementRows.forEach(sRow => {
   if (usedStatementIds.has(sRow.id)) return;

   const sAmount = sRow.credit > 0 ? sRow.credit : -sRow.debit;
   if (sAmount === 0) return;

   // Candidate system transactions with exact amount and same sign
   const candidates = systemTransactions.filter(t => {
    if (usedSystemIds.has(t.id)) return false;
    const tAmount = t.amountMinor / 100;
    const sameSign = (sAmount > 0 && tAmount > 0) || (sAmount < 0 && tAmount < 0);
    return sameSign && Math.abs(Math.abs(sAmount) - Math.abs(tAmount)) < 0.01;
   });

   if (candidates.length === 0) return;

   // Score candidates
   let bestCandidate: SystemTransaction | null = null;
   let bestScore = -1;
   let bestDiffDays = 999;

   candidates.forEach(cand => {
    let score = 30; // base score for exact amount & direction

    // Date proximity score
    const d1 = new Date(sRow.date).getTime();
    const d2 = new Date(cand.date).getTime();
    const diffDays = Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));

    if (diffDays === 0) score += 40;
    else if (diffDays <= 2) score += 30;
    else if (diffDays <= 5) score += 15;
    else score -= 10;

    // Reference / Cheque match
    if (sRow.reference && cand.chequeNumber && sRow.reference.includes(cand.chequeNumber)) score += 40;
    if (sRow.reference && cand.code && sRow.reference.includes(cand.code)) score += 30;

    // Description match
    const sNorm = sRow.description.toLowerCase();
    const cNorm = (cand.name + ' ' + cand.counterpartyName + ' ' + cand.notes).toLowerCase();
    if (sNorm.length > 3 && cNorm.includes(sNorm.slice(0, 8))) score += 20;

    if (score > bestScore) {
     bestScore = score;
     bestCandidate = cand;
     bestDiffDays = diffDays;
    }
   });

   if (bestCandidate && bestScore >= 45) {
    matchedList.push({
     statementId: sRow.id,
     systemId: (bestCandidate as SystemTransaction).id,
     matchType: bestScore >= 60 ? 'exact' : 'suggested',
     diffDays: bestDiffDays,
     score: bestScore
    });
    usedStatementIds.add(sRow.id);
    usedSystemIds.add((bestCandidate as SystemTransaction).id);
   }
  });

  // 3. Separate categories
  const exactOrConfirmed = matchedList.filter(p => p.matchType === 'exact' || p.matchType === 'manual');
  const suggested = matchedList.filter(p => p.matchType === 'suggested');

  const unrecorded = statementRows.filter(s => !usedStatementIds.has(s.id));
  const outstanding = systemTransactions.filter(t => !usedSystemIds.has(t.id));

  // Build composite rows for the table
  const allRows: any[] = [];

  // Add Matched & Suggested
  matchedList.forEach(p => {
   const stmt = statementRows.find(s => s.id === p.statementId);
   const sys = systemTransactions.find(t => t.id === p.systemId);
   allRows.push({
    id: `pair-${p.statementId}-${p.systemId}`,
    category: p.matchType === 'suggested' ? 'suggested' : 'matched',
    matchType: p.matchType,
    score: p.score,
    diffDays: p.diffDays,
    date: stmt?.date || sys?.date,
    description: stmt?.description || sys?.name,
    reference: stmt?.reference || sys?.chequeNumber || sys?.code,
    amount: stmt ? (stmt.credit > 0 ? stmt.credit : stmt.debit) : sys?.amount,
    direction: (stmt?.credit || 0) > 0 || (sys?.amountMinor || 0) > 0 ? 'in' : 'out',
    stmt,
    sys
   });
  });

  // Add Unrecorded
  unrecorded.forEach(s => {
   allRows.push({
    id: `unrecorded-${s.id}`,
    category: 'unrecorded',
    date: s.date,
    description: s.description,
    reference: s.reference,
    amount: s.credit > 0 ? s.credit : s.debit,
    direction: s.credit > 0 ? 'in' : 'out',
    stmt: s,
    sys: null
   });
  });

  // Add Outstanding
  outstanding.forEach(t => {
   allRows.push({
    id: `outstanding-${t.id}`,
    category: 'outstanding',
    date: t.date,
    description: t.name + ' · ' + t.counterpartyName,
    reference: t.chequeNumber || t.code,
    amount: t.amount,
    direction: t.amountMinor > 0 ? 'in' : 'out',
    stmt: null,
    sys: t
   });
  });

  return {
   matchedPairs: exactOrConfirmed,
   suggestedPairs: suggested,
   unrecordedStatementRows: unrecorded,
   outstandingSystemRows: outstanding,
   allReconciliationRows: allRows
  };
 }, [statementRows, systemTransactions, manualMatches]);

 // =========================================================================
 // Reconciliation Equation Calculations (GAAP / IFRS Bank Rec)
 // =========================================================================
 const parsedStmtBalance = parseFloat(statementBalance) || 0;

 // Deposits in Transit (إيداعات بالدفاتر لم تظهر بالبنك)
 const depositsInTransit = outstandingSystemRows
  .filter(t => t.amountMinor > 0)
  .reduce((sum, t) => sum + t.amount, 0);

 // Outstanding Cheques / Payments (مسحوبات وشيكات بالدفاتر لم تصرف بالبنك)
 const outstandingPayments = outstandingSystemRows
  .filter(t => t.amountMinor < 0)
  .reduce((sum, t) => sum + t.amount, 0);

 // Adjusted Bank Balance
 const adjustedBankBalance = parsedStmtBalance + depositsInTransit - outstandingPayments;

 // Unrecorded Bank Credits (إيداعات بالبنك غير مسجلة بالدفاتر)
 const unrecordedBankCredits = unrecordedStatementRows
  .filter(s => s.credit > 0)
  .reduce((sum, s) => sum + s.credit, 0);

 // Unrecorded Bank Debits (مسحوبات ومصاريف بالبنك غير مسجلة بالدفاتر)
 const unrecordedBankDebits = unrecordedStatementRows
  .filter(s => s.debit > 0)
  .reduce((sum, s) => sum + s.debit, 0);

 // Adjusted Book Balance
 const adjustedBookBalance = bookBalance + unrecordedBankCredits - unrecordedBankDebits;

 // Net Variance (الفرق النهائي)
 const variance = Math.round((adjustedBankBalance - adjustedBookBalance) * 100) / 100;
 const isBalanced = Math.abs(variance) < 0.01;

 // =========================================================================
 // 1-Click Quick Post Modal Handler
 // =========================================================================
 const openQuickPost = (sRow: BankStatementRow) => {
  setQuickPostRow(sRow);
  setQuickPostCounterpartyId('');
  setQuickPostNotes(`تسوية بنكية: ${sRow.description} ${sRow.reference ? `[مرجع ${sRow.reference}]` : ''}`);
 };

 const submitQuickPost = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!quickPostRow || !selectedBankId) return;
  if (!quickPostCounterpartyId) {
   toast.error('يرجى اختيار الحساب المقابل (عميل / مورد / مصروف / حساب عام)');
   return;
  }

  setQuickPostSubmitting(true);
  try {
   const isDeposit = quickPostRow.credit > 0;
   const amount = quickPostRow.credit > 0 ? quickPostRow.credit : quickPostRow.debit;
   const body = {
    action: 'voucher',
    type: isDeposit ? 'deposit' : 'withdraw',
    date: quickPostRow.date,
    treasuryId: selectedBankId,
    counterpartyId: quickPostCounterpartyId,
    amount,
    notes: quickPostNotes.trim() || quickPostRow.description,
    transactionCurrency: selectedBank?.currency || 'USD'
   };

   await api('/api/banks', {
    method: 'POST',
    body: JSON.stringify(body)
   });

   toast.success(`تم حفظ وترحيل ${isDeposit ? 'سند الإيداع' : 'سند السحب'} بنجاح!`);
   setQuickPostRow(null);
   await load(); // Refreshes system ledger so it will match immediately!
  } catch (err: any) {
   toast.error('تعذر تسجيل السند: ' + (err.message || String(err)));
  } finally {
   setQuickPostSubmitting(false);
  }
 };

 // =========================================================================
 // Manual Link/Unlink Action
 // =========================================================================
 const confirmSuggestedMatch = (statementId: string, systemId: string) => {
  setManualMatches(prev => ({...prev, [statementId]: systemId}));
  toast.success('تم تأكيد المطابقة واعتمادها بنجاح.');
 };

 const unlinkMatch = (statementId: string) => {
  setManualMatches(prev => ({...prev, [statementId]: 'unmatched'}));
  toast.info('تم فك الربط بين الحركتين.');
 };

 const executeManualLink = (statementId: string, systemId: string) => {
  setManualMatches(prev => ({...prev, [statementId]: systemId}));
  setManualLinkTarget(null);
  toast.success('تم ربط الحركة البنكية بالحركة الدفترية يدوياً بنجاح.');
 };

 // Filtered rows for display
 const filteredRows = useMemo(() => {
  let list = allReconciliationRows;
  if (activeTab !== 'all') {
   list = list.filter(r => r.category === activeTab);
  }
  if (searchQuery.trim()) {
   const q = searchQuery.trim().toLowerCase();
   list = list.filter(r =>
    (r.description || '').toLowerCase().includes(q) ||
    (r.reference || '').toLowerCase().includes(q) ||
    String(r.amount).includes(q)
   );
  }
  return list;
 }, [allReconciliationRows, activeTab, searchQuery]);

 // Bank Accounts List for SearchablePicker
 const bankPickerOptions = useMemo(() => {
  return data.accounts.map(acc => {
   const bal = data.ledger.filter(l => l.payload?.treasuryId === acc.id).reduce((s, l) => s + (l.amount || 0), 0) / 100;
   return {
    value: acc.id,
    label: `${acc.name} · ${acc.currency} (الرصيد: ${money(bal * 100)})`
   };
  });
 }, [data.accounts, data.ledger]);

 // Counterparty list for quick post
 const counterpartyOptions = useMemo(() => {
  return data.counterparties.map(c => {
   const kindLabel = ({
    customer: 'عميل',
    account: 'حساب مالي',
    expense: 'مصروفات',
    employee: 'موظف',
    'cash-account': 'خزينة'
   } as Record<string, string>)[c.kind] || c.kind;
   return {
    value: c.id,
    label: `${c.name} · ${kindLabel} · ${c.currency}`
   };
  });
 }, [data.counterparties]);

 // Counts
 const matchedCount = matchedPairs.length;
 const suggestedCount = suggestedPairs.length;
 const unrecordedCount = unrecordedStatementRows.length;
 const outstandingCount = outstandingSystemRows.length;
 const totalItems = statementRows.length;
 const matchRate = totalItems > 0 ? Math.round((matchedCount / totalItems) * 100) : 0;

 return (
  <section className="app-window bank-reconciliation-window" dir="rtl">
   {/* Window Title & Controls */}
   <div className="window-title">
    <span className="page-title">
     <ERPIcon name="bank-reconciliation" size={21} />
     المطابقة البنكية الذكية (Smart Bank Reconciliation)
    </span>
    <WindowControls refresh={load} close={onClose} />
   </div>

   <div className="window-body" style={{padding: '16px'}}>
    {/* Top Filter and Configuration Bar */}
    <div className="toolbar" style={{alignItems: 'flex-end', gap: '12px', paddingBottom: '14px'}}>
     {/* Bank Account Selector */}
     <div style={{minWidth: '280px', flex: '1'}}>
      <SearchablePicker
       label="حساب البنك"
       value={selectedBankId}
       onChange={setSelectedBankId}
       options={bankPickerOptions}
       placeholder="اختر حساب البنك للمطابقة"
       searchPlaceholder="ابحث باسم البنك أو العملة..."
      />
     </div>

     {/* Date Range */}
     <label className="input-group" style={{maxWidth: '170px'}}>
      <span>من</span>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
     </label>
     <label className="input-group" style={{maxWidth: '170px'}}>
      <span>إلى</span>
      <input type="date" value={to} onChange={e => setTo(e.target.value)} />
     </label>

     {/* Bank Statement Ending Balance */}
     <label className="input-group" style={{maxWidth: '220px'}}>
      <span>رصيد كشف البنك</span>
      <input
       type="number"
       step="0.01"
       placeholder="0.00"
       value={statementBalance}
       onChange={e => setStatementBalance(e.target.value)}
       dir="ltr"
       style={{fontWeight: 'bold', fontSize: '15px'}}
      />
     </label>

     {/* Action Buttons */}
     <div style={{display: 'flex', gap: '8px'}}>
      <button
       type="button"
       className="blue-button"
       onClick={() => fileInputRef.current?.click()}
       disabled={parsing}
       title="رفع كشف حساب البنك بصيغة Excel أو CSV"
       style={{background: '#0F766E', gap: '6px'}}
      >
       <UploadCloud size={17} />
       {parsing ? 'جارٍ المعالجة…' : 'رفع كشف الحساب (Excel / CSV)'}
      </button>

      <button
       type="button"
       className="plain-button"
       onClick={downloadSampleStatement}
       title="تحميل ملف Excel جاهز بالأعمدة القياسية لتجربة المطابقة"
       style={{gap: '6px'}}
      >
       <FileSpreadsheet size={17} style={{color: '#0F766E'}} />
       نموذج كشف حساب استرشادي
      </button>

      <input
       ref={fileInputRef}
       type="file"
       accept=".xlsx,.xls,.csv"
       style={{display: 'none'}}
       onChange={e => {
        const file = e.target.files?.[0];
        if (file) parseFile(file);
        e.target.value = '';
       }}
      />
     </div>
    </div>

    {/* View Mode Switcher and Print / Export Toolbar */}
    <div className="report-toolbar" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderRadius: '6px'}}>
     <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
      <button
       onClick={() => setViewMode(viewMode === 'workspace' ? 'memo' : 'workspace')}
       style={{fontWeight: 'bold', background: viewMode === 'memo' ? '#0F766E' : 'white', color: viewMode === 'memo' ? 'white' : '#163d66', padding: '6px 14px', borderRadius: '4px', border: '1px solid #3973aa'}}
      >
       {viewMode === 'workspace' ? <><FileText size={16} /> معاينة مذكرة التسوية الرسمية</> : <><Link2 size={16} /> العودة لجدول المطابقة والتسوية</>}
      </button>
      <button onClick={() => permittedExport(() => window.print())}>
       <Printer size={16} /> طباعة مذكرة التسوية
      </button>
     </div>

     {fileName && (
      <div style={{fontSize: '12px', color: '#163d66', display: 'flex', alignItems: 'center', gap: '6px'}}>
       <FileSpreadsheet size={15} style={{color: '#0F766E'}} />
       الملف المرفوع: <strong>{fileName}</strong> ({statementRows.length} حركة)
      </div>
     )}
    </div>

    {/* ========================================================================= */}
    {/* KPI Summary Dashboard: Reconciliation Statement Balance Card */}
    {/* ========================================================================= */}
    <div
     style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '12px',
      marginBottom: '16px'
     }}
    >
     {/* Card 1: Bank Statement Ending Balance */}
     <div style={{background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'}}>
      <span style={{fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px'}}>
       رصيد كشف حساب البنك (الفعلي)
      </span>
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
       <strong style={{fontSize: '20px', color: '#0369a1'}} dir="ltr">
        {money(parsedStmtBalance * 100)}
       </strong>
       <small style={{fontSize: '11px', color: '#64748b'}}>{selectedBank?.currency}</small>
      </div>
      <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '4px'}}>
       كما ورد بكشف حساب البنك حتى {to}
      </div>
     </div>

     {/* Card 2: Book Balance */}
     <div style={{background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'}}>
      <span style={{fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px'}}>
       رصيد البنك بالدفاتر بالنظام
      </span>
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
       <strong style={{fontSize: '20px', color: '#0f766e'}} dir="ltr">
        {money(bookBalanceMinor)}
       </strong>
       <small style={{fontSize: '11px', color: '#64748b'}}>{selectedBank?.currency}</small>
      </div>
      <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '4px'}}>
       رصيد حساب الأستاذ بالبرنامج
      </div>
     </div>

     {/* Card 3: Adjusted Bank Balance */}
     <div style={{background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'}}>
      <span style={{fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px'}}>
       الرصيد البنكي المعدل
      </span>
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
       <strong style={{fontSize: '20px', color: '#334155'}} dir="ltr">
        {money(Math.round(adjustedBankBalance * 100))}
       </strong>
       <small style={{fontSize: '11px', color: '#64748b'}}>{selectedBank?.currency}</small>
      </div>
      <div style={{fontSize: '11px', color: '#64748b', marginTop: '4px'}}>
       (+) إيداعات بالطريق: {money(Math.round(depositsInTransit * 100))} | (-) شيكات معلقة: {money(Math.round(outstandingPayments * 100))}
      </div>
     </div>

     {/* Card 4: Variance / Difference Badge */}
     <div
      style={{
       background: isBalanced ? '#ecfdf5' : '#fef2f2',
       border: `1px solid ${isBalanced ? '#6ee7b7' : '#fca5a5'}`,
       borderRadius: '8px',
       padding: '14px',
       boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}
     >
      <span style={{fontSize: '12px', color: isBalanced ? '#065f46' : '#991b1b', display: 'block', marginBottom: '4px', fontWeight: 'bold'}}>
       {isBalanced ? 'حالة المطابقة: متطابق تماماً ✅' : 'فارق التسوية (الفرق غير المتطابق) ⚠️'}
      </span>
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
       <strong style={{fontSize: '22px', color: isBalanced ? '#059669' : '#dc2626'}} dir="ltr">
        {money(Math.round(variance * 100))}
       </strong>
       <small style={{fontSize: '11px', color: isBalanced ? '#065f46' : '#991b1b'}}>{selectedBank?.currency}</small>
      </div>
      <div style={{fontSize: '11px', color: isBalanced ? '#047857' : '#b91c1c', marginTop: '4px'}}>
       {isBalanced
        ? 'تمت المطابقة بنجاح بنسبة 100% دون أي فروقات'
        : `يوجد فارق قدره ${money(Math.round(variance * 100))} بحاجة لتسجيل الفروقات أو مراجعتها`}
      </div>
     </div>
    </div>

    {/* Matching Progress Banner */}
    {statementRows.length > 0 && (
     <div
      style={{
       background: '#f8fafc',
       border: '1px solid #e2e8f0',
       borderRadius: '6px',
       padding: '10px 14px',
       marginBottom: '16px',
       display: 'flex',
       alignItems: 'center',
       justifyContent: 'space-between',
       flexWrap: 'wrap',
       gap: '12px'
      }}
     >
      <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
       <span style={{fontSize: '13px', color: '#334155'}}>
        معدل المطابقة: <strong>{matchRate}%</strong> ({matchedCount} من إجمالي {totalItems} حركة بنكية)
       </span>
       <div style={{width: '140px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden'}}>
        <div style={{width: `${matchRate}%`, height: '100%', background: matchRate === 100 ? '#10b981' : '#0ea5e9'}} />
       </div>
      </div>

      <div style={{display: 'flex', gap: '16px', fontSize: '12px'}}>
       <span style={{color: '#059669', display: 'flex', alignItems: 'center', gap: '4px'}}>
        <CheckCircle2 size={14} /> مطابقة تامة: <strong>{matchedCount}</strong>
       </span>
       {suggestedCount > 0 && (
        <span style={{color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px'}}>
         <HelpCircle size={14} /> مقترحة للمراجعة: <strong>{suggestedCount}</strong>
        </span>
       )}
       {unrecordedCount > 0 && (
        <span style={{color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px'}}>
         <AlertCircle size={14} /> غير مسجلة بالدفاتر: <strong>{unrecordedCount}</strong>
        </span>
       )}
       {outstandingCount > 0 && (
        <span style={{color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px'}}>
         <Clock size={14} /> معلقة بالدفاتر: <strong>{outstandingCount}</strong>
        </span>
       )}
      </div>
     </div>
    )}

    {/* ========================================================================= */}
    {/* VIEW 1: Interactive Workspace Table View */}
    {/* ========================================================================= */}
    {viewMode === 'workspace' ? (
     <div>
      {/* Tab Navigation & Search */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px', flexWrap: 'wrap', gap: '8px'}}>
       <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
        {[
         {id: 'all', label: 'الكل', count: allReconciliationRows.length},
         {id: 'matched', label: 'مطابقة تامة', count: matchedCount, color: '#059669'},
         {id: 'suggested', label: 'مقترحة للمراجعة', count: suggestedCount, color: '#d97706'},
         {id: 'unrecorded', label: 'غير مسجلة بالدفاتر (إجراء فوري)', count: unrecordedCount, color: '#dc2626'},
         {id: 'outstanding', label: 'معلقة بالدفاتر (لم تظهر بالبنك)', count: outstandingCount, color: '#6366f1'}
        ].map(tab => (
         <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id as any)}
          style={{
           padding: '6px 12px',
           fontSize: '13px',
           borderRadius: '6px',
           border: '1px solid',
           borderColor: activeTab === tab.id ? (tab.color || '#0F766E') : '#d1d5db',
           background: activeTab === tab.id ? (tab.color || '#0F766E') : '#ffffff',
           color: activeTab === tab.id ? '#ffffff' : '#374151',
           fontWeight: activeTab === tab.id ? 'bold' : 'normal',
           cursor: 'pointer',
           display: 'flex',
           alignItems: 'center',
           gap: '6px'
          }}
         >
          <span>{tab.label}</span>
          <span
           style={{
            fontSize: '11px',
            background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
            color: activeTab === tab.id ? '#ffffff' : '#4b5563',
            padding: '1px 6px',
            borderRadius: '10px'
           }}
          >
           {tab.count}
          </span>
         </button>
        ))}
       </div>

       {/* Search Filter */}
       <div className="search-input" style={{maxWidth: '240px', height: '34px'}}>
        <Search size={16} />
        <input
         type="text"
         placeholder="بحث بالبيان أو المرجع..."
         value={searchQuery}
         onChange={e => setSearchQuery(e.target.value)}
        />
       </div>
      </div>

      {/* Main Reconciliation Table */}
      <div className="financial-table-scroll" style={{maxHeight: '520px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px'}}>
       <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}}>
        <thead style={{position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10}}>
         <tr style={{borderBottom: '2px solid #cbd5e1', textAlign: 'right', color: '#475569'}}>
          <th style={{padding: '10px 12px'}}>الحالة</th>
          <th style={{padding: '10px 12px'}}>التاريخ</th>
          <th style={{padding: '10px 12px'}}>البيان / الوصف</th>
          <th style={{padding: '10px 12px'}}>المرجع / الشيك</th>
          <th style={{padding: '10px 12px', textAlign: 'center'}}>النوع</th>
          <th style={{padding: '10px 12px'}}>المبلغ</th>
          <th style={{padding: '10px 12px'}}>المطابقة المقابلة في النظام / البنك</th>
          <th style={{padding: '10px 12px', textAlign: 'center'}}>الإجراءات الذكية</th>
         </tr>
        </thead>
        <tbody>
         {filteredRows.length === 0 ? (
          <tr>
           <td colSpan={8} style={{textAlign: 'center', padding: '36px', color: '#94a3b8'}}>
            {statementRows.length === 0
             ? 'قم برفع كشف حساب البنك (Excel/CSV) لبدء المطابقة البنكية التلقائية.'
             : 'لا توجد حركات تطابق الفلتر المختار.'}
           </td>
          </tr>
         ) : (
          filteredRows.map((r, idx) => {
           const isMatched = r.category === 'matched';
           const isSuggested = r.category === 'suggested';
           const isUnrec = r.category === 'unrecorded';
           const isOut = r.category === 'outstanding';

           return (
            <tr
             key={r.id || idx}
             style={{
              borderBottom: '1px solid #f1f5f9',
              background: isUnrec
               ? '#fffbfb'
               : isSuggested
               ? '#fffdf7'
               : isOut
               ? '#fafafa'
               : idx % 2 === 0
               ? '#ffffff'
               : '#fcfcfc'
             }}
            >
             {/* Status Badge */}
             <td style={{padding: '8px 12px', whiteSpace: 'nowrap'}}>
              {isMatched && (
               <span style={{background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                <CheckCircle2 size={13} /> {r.matchType === 'manual' ? 'مطابقة يدوية' : 'مطابقة تامة'}
               </span>
              )}
              {isSuggested && (
               <span style={{background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                <HelpCircle size={13} /> مقترحة ({r.diffDays} يوم فارق)
               </span>
              )}
              {isUnrec && (
               <span style={{background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                <AlertCircle size={13} /> غير مسجلة بالدفاتر
               </span>
              )}
              {isOut && (
               <span style={{background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                <Clock size={13} /> معلقة بالدفاتر
               </span>
              )}
             </td>

             {/* Date */}
             <td style={{padding: '8px 12px', whiteSpace: 'nowrap'}} dir="ltr">
              {r.date}
             </td>

             {/* Description */}
             <td style={{padding: '8px 12px', maxWidth: '300px'}}>
              <span style={{fontWeight: isUnrec ? 'bold' : 'normal'}}>{r.description}</span>
              {r.stmt && (
               <span style={{display: 'block', fontSize: '10px', color: '#94a3b8'}}>
                كشف البنك (سطر {r.stmt.rawRowIndex || '—'})
               </span>
              )}
             </td>

             {/* Reference */}
             <td style={{padding: '8px 12px', color: '#64748b'}} dir="ltr">
              {r.reference || '—'}
             </td>

             {/* Direction */}
             <td style={{padding: '8px 12px', textAlign: 'center'}}>
              {r.direction === 'in' ? (
               <span style={{color: '#059669', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '2px'}}>
                <ArrowDownLeft size={13} /> إيداع (وارد)
               </span>
              ) : (
               <span style={{color: '#dc2626', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '2px'}}>
                <ArrowUpRight size={13} /> سحب (صادر)
               </span>
              )}
             </td>

             {/* Amount */}
             <td style={{padding: '8px 12px', fontWeight: 'bold', whiteSpace: 'nowrap'}} dir="ltr">
              <span style={{color: r.direction === 'in' ? '#059669' : '#dc2626'}}>
               {money(Math.round(r.amount * 100))}
              </span>
             </td>

             {/* Paired System Transaction / Bank details */}
             <td style={{padding: '8px 12px', fontSize: '12px', color: '#475569'}}>
              {r.sys ? (
               <div>
                <span style={{fontWeight: 'bold', color: '#0f766e'}}>
                 {r.sys.name}
                </span>
                <span style={{fontSize: '11px', color: '#64748b', display: 'block'}}>
                 سند: {r.sys.code} | بتاريخ: {r.sys.date} | {r.sys.counterpartyName}
                </span>
               </div>
              ) : isUnrec ? (
               <span style={{color: '#dc2626', fontStyle: 'italic', fontSize: '11px'}}>
                ⚠️ حركة بنكية فعلية لم يُسجل لها سند في شيكو بعد
               </span>
              ) : (
               <span style={{color: '#6366f1', fontStyle: 'italic', fontSize: '11px'}}>
                🕒 مسجلة بالدفاتر ولم تظهر في كشف حساب البنك
               </span>
              )}
             </td>

             {/* Actions */}
             <td style={{padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap'}}>
              {/* Unrecorded Action: 1-Click Quick Post */}
              {isUnrec && r.stmt && (
               <div style={{display: 'flex', gap: '6px', justifyContent: 'center'}}>
                <button
                 type="button"
                 onClick={() => openQuickPost(r.stmt!)}
                 style={{
                  background: '#0F766E',
                  color: 'white',
                  border: '0',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                 }}
                 title="تسجيل سند بنكي فوري وترحيله وتأكيد المطابقة"
                >
                 <PlusCircle size={13} /> تسجيل وترحيل فوري
                </button>

                <button
                 type="button"
                 onClick={() => setManualLinkTarget(r.stmt!)}
                 style={{
                  background: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer'
                 }}
                 title="ربط يدوي بحركة دفترية موجودة"
                >
                 <Link2 size={13} /> ربط يدوي
                </button>
               </div>
              )}

              {/* Suggested Match Action: Confirm Match */}
              {isSuggested && r.stmt && r.sys && (
               <div style={{display: 'flex', gap: '6px', justifyContent: 'center'}}>
                <button
                 type="button"
                 onClick={() => confirmSuggestedMatch(r.stmt!.id, r.sys!.id)}
                 style={{
                  background: '#059669',
                  color: 'white',
                  border: '0',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                 }}
                >
                 <Check size={13} /> تأكيد المطابقة
                </button>
                <button
                 type="button"
                 onClick={() => unlinkMatch(r.stmt!.id)}
                 style={{
                  background: '#ffffff',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '11px',
                  cursor: 'pointer'
                 }}
                 title="إلغاء الربط"
                >
                 <X size={13} />
                </button>
               </div>
              )}

              {/* Matched Action: Unlink */}
              {isMatched && r.stmt && (
               <button
                type="button"
                onClick={() => unlinkMatch(r.stmt!.id)}
                style={{
                 background: 'transparent',
                 color: '#64748b',
                 border: '1px solid #e2e8f0',
                 borderRadius: '4px',
                 padding: '3px 8px',
                 fontSize: '11px',
                 cursor: 'pointer'
                }}
                title="فك ارتباط هذه الحركة"
               >
                <Unlink2 size={12} /> فك الربط
               </button>
              )}

              {/* Outstanding Action */}
              {isOut && (
               <span style={{fontSize: '11px', color: '#94a3b8'}}>
                بانتظار الصرف / التحصيل
               </span>
              )}
             </td>
            </tr>
           );
          })
         )}
        </tbody>
       </table>
      </div>
     </div>
    ) : (
     /* ========================================================================= */
     /* VIEW 2: Official Printable Bank Reconciliation Statement Paper */
     /* ========================================================================= */
     <div className="report-canvas" style={{padding: '20px 0'}}>
      <article className="report-paper" style={{maxWidth: '820px', margin: '0 auto', background: 'white', padding: '32px', border: '1px solid #cbd5e1', boxShadow: '0 4px 15px rgba(0,0,0,0.06)'}}>
       <AgencyLetterhead />

       <div style={{textAlign: 'center', borderBottom: '2px solid #0F766E', paddingBottom: '12px', marginBottom: '20px'}}>
        <h1 style={{fontSize: '24px', fontWeight: 'bold', color: '#0F766E', margin: '0 0 6px 0'}}>
         مذكرة تسوية الحساب البنكي
        </h1>
        <p style={{fontSize: '14px', color: '#475569', margin: 0}}>
         Bank Reconciliation Statement
        </p>
       </div>

       {/* Meta details */}
       <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '6px', marginBottom: '24px', fontSize: '13px'}}>
        <div>
         <p style={{margin: '4px 0'}}><strong>اسم البنك:</strong> {selectedBank?.name}</p>
         <p style={{margin: '4px 0'}}><strong>رقم الحساب:</strong> <span dir="ltr">{selectedBank?.payload?.accountNumber || '—'}</span></p>
         <p style={{margin: '4px 0'}}><strong>العملة:</strong> {selectedBank?.currency}</p>
        </div>
        <div>
         <p style={{margin: '4px 0'}}><strong>تاريخ التسوية:</strong> <span dir="ltr">{to}</span></p>
         <p style={{margin: '4px 0'}}><strong>فترة المطابقة:</strong> من {from} إلى {to}</p>
         <p style={{margin: '4px 0'}}><strong>تاريخ الطباعة:</strong> <span dir="ltr">{today()}</span></p>
        </div>
       </div>

       {/* Reconciliation Math Table */}
       <h2 style={{fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '10px', borderRight: '4px solid #0F766E', paddingRight: '8px'}}>
        أولاً: ملخص معادلة تسوية البنك (Reconciliation Summary)
       </h2>

       <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px'}}>
        <tbody>
         <tr style={{borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
          <td style={{padding: '10px'}}><strong>رصيد كشف الحساب البنكي كما في {to}</strong></td>
          <td style={{padding: '10px', textAlign: 'left', fontWeight: 'bold'}} dir="ltr">{money(parsedStmtBalance * 100)}</td>
         </tr>
         <tr style={{borderBottom: '1px solid #e2e8f0'}}>
          <td style={{padding: '10px', color: '#059669'}}><strong>يضاف:</strong> إيداعات في الطريق (سندات مقبوضة بالدفاتر لم تُقيد بالبنك)</td>
          <td style={{padding: '10px', textAlign: 'left', color: '#059669'}} dir="ltr">+{money(Math.round(depositsInTransit * 100))}</td>
         </tr>
         <tr style={{borderBottom: '1px solid #e2e8f0'}}>
          <td style={{padding: '10px', color: '#dc2626'}}><strong>يخصم:</strong> شيكات ومسحوبات لم تقدم للصرف (مسجلة بالدفاتر معلقة)</td>
          <td style={{padding: '10px', textAlign: 'left', color: '#dc2626'}} dir="ltr">-{money(Math.round(outstandingPayments * 100))}</td>
         </tr>
         <tr style={{borderBottom: '2px solid #0F766E', background: '#f0fdf4', fontWeight: 'bold'}}>
          <td style={{padding: '10px'}}>(=) الرصيد البنكي المعدل (Adjusted Bank Balance)</td>
          <td style={{padding: '10px', textAlign: 'left', color: '#0F766E'}} dir="ltr">{money(Math.round(adjustedBankBalance * 100))}</td>
         </tr>

         <tr style={{borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
          <td style={{padding: '10px', paddingTop: '16px'}}><strong>رصيد حساب البنك بدفاتر الأستاذ بالنظام كما في {to}</strong></td>
          <td style={{padding: '10px', paddingTop: '16px', textAlign: 'left', fontWeight: 'bold'}} dir="ltr">{money(bookBalanceMinor)}</td>
         </tr>
         <tr style={{borderBottom: '1px solid #e2e8f0'}}>
          <td style={{padding: '10px', color: '#059669'}}><strong>يضاف:</strong> تحويلات وإيداعات بنكية غير مسجلة بالدفاتر</td>
          <td style={{padding: '10px', textAlign: 'left', color: '#059669'}} dir="ltr">+{money(Math.round(unrecordedBankCredits * 100))}</td>
         </tr>
         <tr style={{borderBottom: '1px solid #e2e8f0'}}>
          <td style={{padding: '10px', color: '#dc2626'}}><strong>يخصم:</strong> مصاريف وعمولات ومسحوبات بنكية غير مسجلة بالدفاتر</td>
          <td style={{padding: '10px', textAlign: 'left', color: '#dc2626'}} dir="ltr">-{money(Math.round(unrecordedBankDebits * 100))}</td>
         </tr>
         <tr style={{borderBottom: '2px solid #0F766E', background: '#f0fdf4', fontWeight: 'bold'}}>
          <td style={{padding: '10px'}}>(=) الرصيد الدفتري المعدل (Adjusted Book Balance)</td>
          <td style={{padding: '10px', textAlign: 'left', color: '#0F766E'}} dir="ltr">{money(Math.round(adjustedBookBalance * 100))}</td>
         </tr>

         <tr style={{background: isBalanced ? '#ecfdf5' : '#fef2f2', fontWeight: 'bold', fontSize: '15px'}}>
          <td style={{padding: '12px', color: isBalanced ? '#065f46' : '#991b1b'}}>
           الفارق النهائي بين الرصيدين (Net Reconciliation Variance)
          </td>
          <td style={{padding: '12px', textAlign: 'left', color: isBalanced ? '#059669' : '#dc2626'}} dir="ltr">
           {money(Math.round(variance * 100))}
          </td>
         </tr>
        </tbody>
       </table>

       {/* Itemized Outstanding List */}
       {outstandingSystemRows.length > 0 && (
        <div style={{marginBottom: '24px'}}>
         <h3 style={{fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px'}}>
          قائمة الحركات الدفترية المعلقة (شيكات صادرة لم تصرف / إيداعات في الطريق):
         </h3>
         <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1'}}>
          <thead style={{background: '#f1f5f9'}}>
           <tr>
            <th style={{padding: '6px', border: '1px solid #cbd5e1'}}>التاريخ</th>
            <th style={{padding: '6px', border: '1px solid #cbd5e1'}}>رقم السند</th>
            <th style={{padding: '6px', border: '1px solid #cbd5e1'}}>المستفيد / العميل</th>
            <th style={{padding: '6px', border: '1px solid #cbd5e1'}}>رقم الشيك</th>
            <th style={{padding: '6px', border: '1px solid #cbd5e1'}}>النوع</th>
            <th style={{padding: '6px', border: '1px solid #cbd5e1'}}>المبلغ</th>
           </tr>
          </thead>
          <tbody>
           {outstandingSystemRows.map(o => (
            <tr key={o.id}>
             <td style={{padding: '6px', border: '1px solid #cbd5e1'}} dir="ltr">{o.date}</td>
             <td style={{padding: '6px', border: '1px solid #cbd5e1'}}>{o.code}</td>
             <td style={{padding: '6px', border: '1px solid #cbd5e1'}}>{o.counterpartyName}</td>
             <td style={{padding: '6px', border: '1px solid #cbd5e1'}} dir="ltr">{o.chequeNumber || '—'}</td>
             <td style={{padding: '6px', border: '1px solid #cbd5e1'}}>{o.amountMinor > 0 ? 'إيداع بالطريق' : 'شيك صادر لم يصرف'}</td>
             <td style={{padding: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold'}} dir="ltr">{money(Math.round(o.amount * 100))}</td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       )}

       {/* Itemized Unrecorded List */}
       {unrecordedStatementRows.length > 0 && (
        <div style={{marginBottom: '24px'}}>
         <h3 style={{fontSize: '14px', fontWeight: 'bold', color: '#b91c1c', marginBottom: '8px'}}>
          قائمة الحركات البنكية غير المسجلة بالدفاتر (تتطلب قيود تسوية):
         </h3>
         <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #fecaca'}}>
          <thead style={{background: '#fef2f2'}}>
           <tr>
            <th style={{padding: '6px', border: '1px solid #fecaca'}}>التاريخ</th>
            <th style={{padding: '6px', border: '1px solid #fecaca'}}>البيان كما ورد بالبنك</th>
            <th style={{padding: '6px', border: '1px solid #fecaca'}}>المرجع</th>
            <th style={{padding: '6px', border: '1px solid #fecaca'}}>النوع</th>
            <th style={{padding: '6px', border: '1px solid #fecaca'}}>المبلغ</th>
           </tr>
          </thead>
          <tbody>
           {unrecordedStatementRows.map(u => (
            <tr key={u.id}>
             <td style={{padding: '6px', border: '1px solid #fecaca'}} dir="ltr">{u.date}</td>
             <td style={{padding: '6px', border: '1px solid #fecaca'}}>{u.description}</td>
             <td style={{padding: '6px', border: '1px solid #fecaca'}} dir="ltr">{u.reference || '—'}</td>
             <td style={{padding: '6px', border: '1px solid #fecaca'}}>{u.credit > 0 ? 'إيداع بنكي' : 'سحب / مصاريف'}</td>
             <td style={{padding: '6px', border: '1px solid #fecaca', fontWeight: 'bold'}} dir="ltr">
              {money(Math.round((u.credit > 0 ? u.credit : u.debit) * 100))}
             </td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       )}

       {/* Formal Signatures Section */}
       <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px dashed #cbd5e1', fontSize: '13px'}}>
        <div style={{textAlign: 'center', width: '220px'}}>
         <p style={{margin: '0 0 40px 0'}}><strong>إعداد المحاسب المسؤول:</strong></p>
         <p style={{margin: 0, borderTop: '1px solid #94a3b8', paddingTop: '6px'}}>التوقيع: ....................................</p>
        </div>

        <div style={{textAlign: 'center', width: '220px'}}>
         <p style={{margin: '0 0 40px 0'}}><strong>مراجعة وتدقيق الحسابات:</strong></p>
         <p style={{margin: 0, borderTop: '1px solid #94a3b8', paddingTop: '6px'}}>التوقيع: ....................................</p>
        </div>

        <div style={{textAlign: 'center', width: '220px'}}>
         <p style={{margin: '0 0 40px 0'}}><strong>اعتماد المدير المالي:</strong></p>
         <p style={{margin: 0, borderTop: '1px solid #94a3b8', paddingTop: '6px'}}>التوقيع: ....................................</p>
        </div>
       </div>

       <AgencyReportFooter />
      </article>
     </div>
    )}
   </div>

   {/* ========================================================================= */}
   {/* DIALOG 1: 1-Click Quick Post Modal for Unrecorded Transactions */}
   {/* ========================================================================= */}
   <Dialog open={!!quickPostRow} onOpenChange={open => !open && setQuickPostRow(null)}>
    <DialogContent className="record-dialog" dir="rtl" style={{maxWidth: '520px'}}>
     <DialogTitle style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#0F766E'}}>
      <PlusCircle size={20} />
      تسجيل وترحيل سند فوري لحركة بنكية غير مسجلة
     </DialogTitle>
     <DialogDescription style={{fontSize: '13px', color: '#64748b'}}>
      سيتم إنشاء وترحيل سند بنكي رسمي وحفظه بالنظام، مما يؤدي لمطابقة الحركة آلياً.
     </DialogDescription>

     {quickPostRow && (
      <form onSubmit={submitQuickPost} style={{display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px'}}>
       <div style={{background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', border: '1px solid #e2e8f0'}}>
        <p style={{margin: '3px 0'}}><strong>نوع الحركة البنكية:</strong> {quickPostRow.credit > 0 ? 'إيداع بنكي وارد (تحصيل)' : 'سحب بنكي صادر (صرف / مصاريف)'}</p>
        <p style={{margin: '3px 0'}}><strong>المبلغ:</strong> <b dir="ltr" style={{color: quickPostRow.credit > 0 ? '#059669' : '#dc2626'}}>{money(Math.round((quickPostRow.credit > 0 ? quickPostRow.credit : quickPostRow.debit) * 100))} {selectedBank?.currency}</b></p>
        <p style={{margin: '3px 0'}}><strong>التاريخ:</strong> <span dir="ltr">{quickPostRow.date}</span></p>
        <p style={{margin: '3px 0'}}><strong>البيان كما ورد بالبنك:</strong> {quickPostRow.description}</p>
       </div>

       <div>
        <SearchablePicker
         label="الحساب المقابل (الطرف الثاني) *"
         value={quickPostCounterpartyId}
         onChange={setQuickPostCounterpartyId}
         options={counterpartyOptions}
         placeholder="اختر العميل أو المورد أو حساب المصروف..."
         searchPlaceholder="ابحث باسم الحساب..."
        />
       </div>

       <label style={{display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px'}}>
        <strong>البيان والملاحظات للسند:</strong>
        <textarea
         rows={3}
         value={quickPostNotes}
         onChange={e => setQuickPostNotes(e.target.value)}
         style={{padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px'}}
        />
       </label>

       <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px'}}>
        <button
         type="button"
         className="plain-button"
         onClick={() => setQuickPostRow(null)}
         disabled={quickPostSubmitting}
        >
         إلغاء
        </button>
        <button
         type="submit"
         className="blue-button"
         disabled={quickPostSubmitting || !quickPostCounterpartyId}
         style={{background: '#0F766E'}}
        >
         {quickPostSubmitting ? 'جارٍ الحفظ والترحيل…' : 'حفظ وترحيل السند فوراً'}
        </button>
       </div>
      </form>
     )}
    </DialogContent>
   </Dialog>

   {/* ========================================================================= */}
   {/* DIALOG 2: Manual Pairing Dialog */}
   {/* ========================================================================= */}
   <Dialog open={!!manualLinkTarget} onOpenChange={open => !open && setManualLinkTarget(null)}>
    <DialogContent className="record-dialog" dir="rtl" style={{maxWidth: '650px'}}>
     <DialogTitle style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#0F766E'}}>
      <Link2 size={20} />
      ربط يدوي بحركة دفترية موجودة بالنظام
     </DialogTitle>
     <DialogDescription style={{fontSize: '13px', color: '#64748b'}}>
      اختر الحركة الدفترية المقابلة من حركات النظام المعلقة لمطابقتها مع الحركة البنكية.
     </DialogDescription>

     {manualLinkTarget && (
      <div style={{marginTop: '12px'}}>
       <div style={{background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', border: '1px solid #e2e8f0', marginBottom: '14px'}}>
        <strong>الحركة البنكية المراد ربطها:</strong>
        <p style={{margin: '3px 0'}}>{manualLinkTarget.description} | {manualLinkTarget.reference || 'بدون مرجع'}</p>
        <p style={{margin: '3px 0'}} dir="ltr"><strong>المبلغ:</strong> {money(Math.round((manualLinkTarget.credit > 0 ? manualLinkTarget.credit : manualLinkTarget.debit) * 100))} {selectedBank?.currency}</p>
       </div>

       <div style={{maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px'}}>
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
         <thead style={{background: '#f1f5f9'}}>
          <tr>
           <th style={{padding: '6px 8px', textAlign: 'right'}}>التاريخ</th>
           <th style={{padding: '6px 8px', textAlign: 'right'}}>السند</th>
           <th style={{padding: '6px 8px', textAlign: 'right'}}>الحساب المقابل</th>
           <th style={{padding: '6px 8px', textAlign: 'right'}}>المبلغ</th>
           <th style={{padding: '6px 8px', textAlign: 'center'}}>إجراء</th>
          </tr>
         </thead>
         <tbody>
          {outstandingSystemRows.length === 0 ? (
           <tr>
            <td colSpan={5} style={{textAlign: 'center', padding: '18px', color: '#94a3b8'}}>
             لا توجد حركات دفترية معلقة متاحة للربط.
            </td>
           </tr>
          ) : (
           outstandingSystemRows.map(sys => (
            <tr key={sys.id} style={{borderBottom: '1px solid #f1f5f9'}}>
             <td style={{padding: '6px 8px'}} dir="ltr">{sys.date}</td>
             <td style={{padding: '6px 8px'}}>{sys.code}</td>
             <td style={{padding: '6px 8px'}}>{sys.counterpartyName}</td>
             <td style={{padding: '6px 8px', fontWeight: 'bold'}} dir="ltr">{money(Math.round(sys.amount * 100))}</td>
             <td style={{padding: '6px 8px', textAlign: 'center'}}>
              <button
               type="button"
               onClick={() => executeManualLink(manualLinkTarget.id, sys.id)}
               style={{
                background: '#0F766E',
                color: 'white',
                border: '0',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer'
               }}
              >
               اختيار ومطابقة
              </button>
             </td>
            </tr>
           ))
          )}
         </tbody>
        </table>
       </div>
      </div>
     )}
    </DialogContent>
   </Dialog>
  </section>
 );
}
