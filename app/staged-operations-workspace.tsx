'use client';
import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {api} from './erp-system';
import {parseTicketText} from '@/lib/tickets';
import {analyzeTicketDocument} from '@/lib/ticket-extractor';
import {money, today, currencies, type RecordRow, type Settings} from '@/lib/domain';
import {useWorkspaceWindow, WindowControls} from '@/components/workspace-window';
import {Search, Plus, Trash2, Pencil, RefreshCw, Upload, Eye, FileText, Download, Check, Sparkles, AlertCircle, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Ticket, Undo2, Ban, Sliders} from 'lucide-react';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction} from '@/components/ui/alert-dialog';
import {Table, TableHeader, TableBody, TableRow, TableHead, TableCell} from '@/components/ui/table';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/components/ui/select';
import {toast} from 'sonner';

type StagedItem = {
  id: string;
  kind: string;
  code: string;
  name: string;
  date: string;
  currency: string;
  amount: number;
  payload: any;
  createdAt?: string;
  updatedAt?: string;
};

const opTypes = [
  {value: 'ticket-new', label: 'تذكرة جديدة', icon: Ticket, color: '#0369a1', bg: '#e0f2fe'},
  {value: 'ticket-refund', label: 'تذكرة مستردة (Refund)', icon: Undo2, color: '#c2410c', bg: '#ffedd5'},
  {value: 'ticket-void', label: 'تذكرة ملغاة (Void)', icon: Ban, color: '#b91c1c', bg: '#fee2e2'},
  {value: 'bank-transfer', label: 'تحويل بنكي', icon: ArrowLeftRight, color: '#4338ca', bg: '#e0e7ff'},
  {value: 'bank-withdraw', label: 'سحب بنكي', icon: ArrowUpRight, color: '#be185d', bg: '#fce7f3'},
  {value: 'bank-deposit', label: 'إيداع بنكي', icon: ArrowDownLeft, color: '#15803d', bg: '#dcfce7'},
  {value: 'cash-receipt', label: 'إستلام نقد', icon: ArrowDownLeft, color: '#047857', bg: '#d1fae5'},
  {value: 'cash-payment', label: 'صرف نقد', icon: ArrowUpRight, color: '#9a3412', bg: '#ffedd5'}
];

const defaultStagedFields: Record<string, boolean> = {
  person: true,
  code: true,
  date: true,
  currency: true,
  airline: true,
  route: true,
  class: true,
  sellingPrice: true,
  supplierPrice: true,
  penalties: true,
  refundComm: true,
  treasury: true,
  crossCurrency: true,
  notes: true,
  attachment: true
};

const stagedFieldLabels: {key: string; label: string; desc: string}[] = [
  {key: 'person', label: 'اسم الراكب / المستفيد', desc: 'إدخال اسم الراكب للتذاكر أو المستفيد'},
  {key: 'code', label: 'رقم التذكرة / المرجع', desc: 'يُولّد آلياً في حال تركه فارغاً'},
  {key: 'date', label: 'التاريخ', desc: 'تاريخ العملية'},
  {key: 'currency', label: 'العملة', desc: 'عملة المعاملة'},
  {key: 'airline', label: 'الخطوط / المورد', desc: 'شركة الطيران أو المورد'},
  {key: 'route', label: 'خط السير (Route)', desc: 'محطات الرحلة'},
  {key: 'class', label: 'درجة السفر', desc: 'سياحية / أولى'},
  {key: 'sellingPrice', label: 'سعر البيع (للعميل)', desc: 'قيمة التذكرة أو البيع'},
  {key: 'supplierPrice', label: 'سعر التكلفة (المورد)', desc: 'سعر الشراء من الخطوط'},
  {key: 'penalties', label: 'الغرامات ورسوم الإلغاء', desc: 'غرامات التذاكر المستردة والملغاة'},
  {key: 'refundComm', label: 'عمولة الاسترداد', desc: 'رسوم الوكالة عند الاسترداد'},
  {key: 'treasury', label: 'الخزنة / الحساب البنكي', desc: 'تحديد الخزينة أو البنك للعمليات المالية'},
  {key: 'crossCurrency', label: 'التسوية وتغطية العملات', desc: 'السداد بعملة لتغطية عملة أخرى'},
  {key: 'notes', label: 'الملاحظات والبيان', desc: 'ملاحظات إضافية'},
  {key: 'attachment', label: 'المرفقات (PDF، وورد، صور)', desc: 'قبول أي حجم ملف'}
];

const emptyForm = () => ({
  id: '',
  category: 'ticket' as 'ticket' | 'financial',
  type: 'ticket-new',
  financialDirection: 'deposit' as 'deposit' | 'withdraw',
  financialChannel: 'bank' as 'bank' | 'cash',
  commType: 'internal' as 'internal' | 'external',
  docTotal: '',
  autoDetectedComm: false,
  name: '',
  code: '',
  date: today(),
  currency: 'USD',
  amount: '',
  customerId: '',
  customerName: '',
  airline: '',
  vendor: '',
  fare: '',
  sellingPrice: '',
  supplierPrice: '',
  commAmount: '',
  commPct: '',
  penalties: '',
  refundComm: '',
  route: '',
  class: '',
  person: '',
  treasuryId: '',
  counterpartyId: '',
  crossCurrency: false,
  settlementCurrency: 'SDG',
  settlementTreasuryId: '',
  settlementAmount: '',
  coveredCurrency: 'USD',
  coveredAmount: '',
  conversionRate: '1',
  notes: '',
  taxes: Object.fromEntries(['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t=>[t,0])),
  attachment: null as {name: string; type: string; size: number; data: string} | null
});

function AccountSelectorInput({
  label,
  color = '#1d4ed8',
  value,
  onChange,
  customers,
  placeholder = 'اختر أو اكتب اسم العميل أو الحساب المالي...',
  required = false
}: {
  label: string;
  color?: string;
  value: string;
  onChange: (name: string, id: string) => void;
  customers: RecordRow[];
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 40);
  }, [customers, value]);

  return (
    <div ref={containerRef} style={{position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: '3px'}} dir="rtl">
      <span style={{fontSize: '12px', fontWeight: 700, color: '#1e293b', textAlign: 'right'}}>{label}</span>
      <label className="input-group" style={{margin: 0, width: '100%', direction: 'rtl'}}>
        <span style={{background: color, color: '#fff', textAlign: 'right', direction: 'rtl'}}>{label}</span>
        <input
          dir="rtl"
          style={{direction: 'rtl', textAlign: 'right', fontWeight: 600, width: '100%'}}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={e => {
            const val = e.target.value;
            const matched = customers.find(c => c.name === val);
            onChange(val, matched?.id || '');
            setOpen(true);
          }}
          placeholder={placeholder}
          required={required}
        />
      </label>

      {open && filtered.length > 0 && (
        <div
          dir="rtl"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            left: 0,
            background: '#ffffff',
            border: '1.5px solid #3b82f6',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 1000,
            marginTop: '4px',
            padding: '4px',
            direction: 'rtl',
            textAlign: 'right'
          }}
        >
          {filtered.map(c => {
            const accType = c.payload?.accountType;
            const typeLabel = accType === 'airline' ? 'خط طيران' : accType === 'supplier' ? 'مورد' : accType === 'service' ? 'خدمة' : 'عميل';
            const badgeBg = accType === 'airline' ? '#e0f2fe' : accType === 'supplier' ? '#ffedd5' : accType === 'service' ? '#f3e8ff' : '#dcfce7';
            const badgeColor = accType === 'airline' ? '#0369a1' : accType === 'supplier' ? '#c2410c' : accType === 'service' ? '#7e22ce' : '#15803d';

            return (
              <div
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(c.name, c.id);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'right',
                  direction: 'rtl',
                  background: c.name === value ? '#eff6ff' : 'transparent',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = c.name === value ? '#eff6ff' : 'transparent')}
              >
                <div style={{fontWeight: 700, fontSize: '13px', color: '#1e293b', textAlign: 'right', direction: 'rtl'}}>
                  {c.name}
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: badgeBg,
                  color: badgeColor
                }}>
                  {typeLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StagedOperationsWorkspace({
  settings,
  onNavigate
}: {
  settings: Settings;
  onNavigate?: (target: string, preload?: any) => void;
}) {
  const w = useWorkspaceWindow();
  const [items, setItems] = useState<StagedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('all');
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const pricingLeadRef = useRef<'comm'|'sell'|'supplier'|'none'>('none');
  const [remove, setRemove] = useState<StagedItem | null>(null);
  const [customers, setCustomers] = useState<RecordRow[]>([]);
  const [banks, setBanks] = useState<RecordRow[]>([]);
  const [cashboxes, setCashboxes] = useState<RecordRow[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);
  const [customizingFields, setCustomizingFields] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<Record<string, boolean>>(() => {
    let saved: any = null;
    try {
      saved = JSON.parse(localStorage.getItem('shako_staged_fields') || 'null');
    } catch {}
    return {...defaultStagedFields, ...(settings.stagedOpsFields || {}), ...(saved || {})};
  });

  useEffect(() => {
    if (settings.stagedOpsFields) {
      setFieldConfig(prev => ({...defaultStagedFields, ...settings.stagedOpsFields}));
    }
  }, [settings.stagedOpsFields]);

  function toggleField(key: string, val: boolean) {
    const updated = {...fieldConfig, [key]: val};
    setFieldConfig(updated);
    try {
      localStorage.setItem('shako_staged_fields', JSON.stringify(updated));
    } catch {}
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/staged-operations?status=pending');
      setItems(data);
      setError('');
    } catch (e: any) {
      setError(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (w.active) {
      load();
      api('/api/records?kind=customer').then(setCustomers).catch(() => setCustomers([]));
      api('/api/banks').then(b => setBanks(b.accounts || [])).catch(() => setBanks([]));
      api('/api/cash').then(c => setCashboxes(c.accounts || [])).catch(() => setCashboxes([]));
    }
  }, [load, w.active, w.refreshKey]);

  function openAdd(type = 'ticket-new') {
    pricingLeadRef.current = 'none';
    const isTicket = type.startsWith('ticket-');
    const dir = (type === 'bank-deposit' || type === 'cash-receipt') ? 'deposit' : 'withdraw';
    const chan = type.startsWith('cash-') ? 'cash' : 'bank';
    setForm({
      ...emptyForm(),
      category: isTicket ? 'ticket' : 'financial',
      type,
      financialDirection: dir,
      financialChannel: chan,
      commType: 'internal',
      currency: settings.defaultCurrency || 'USD'
    });
  }

  function openEdit(item: StagedItem) {
    pricingLeadRef.current = 'none';
    const p = item.payload || {};
    const isTicket = (p.type || item.kind || '').startsWith('ticket-');
    const type = p.type || 'ticket-new';
    const dir = p.financialDirection || ((type === 'bank-deposit' || type === 'cash-receipt') ? 'deposit' : 'withdraw');
    const chan = p.financialChannel || (type.startsWith('cash-') ? 'cash' : 'bank');
    setForm({
      id: item.id,
      category: p.category || (isTicket ? 'ticket' : 'financial'),
      type,
      financialDirection: dir,
      financialChannel: chan,
      commType: p.commType || 'internal',
      name: item.name,
      code: item.code,
      date: item.date,
      currency: item.currency,
      amount: item.amount ? (item.amount > 2000 ? item.amount / 100 : item.amount) : (p.amount || ''),
      customerId: p.customerId || '',
      customerName: p.customerName || (isTicket ? '' : item.name) || '',
      airline: p.airline || '',
      vendor: p.vendor || '',
      fare: p.fare || '',
      sellingPrice: p.sellingPrice || (isTicket ? (item.amount > 2000 ? item.amount / 100 : item.amount) : '') || '',
      supplierPrice: p.supplierPrice || '',
      commAmount: p.commAmount !== undefined ? String(p.commAmount) : '',
      commPct: p.commPct || '',
      docTotal: p.docTotal || p.sellingPrice || '',
      autoDetectedComm: false,
      penalties: p.penalties || '',
      refundComm: p.refundComm || '',
      route: p.route || '',
      class: p.class || '',
      person: p.person || '',
      treasuryId: p.treasuryId || '',
      counterpartyId: p.counterpartyId || '',
      crossCurrency: !!p.crossCurrency,
      settlementCurrency: p.settlementCurrency || p.currency || 'SDG',
      settlementTreasuryId: p.settlementTreasuryId || p.treasuryId || '',
      settlementAmount: p.settlementAmount || '',
      coveredCurrency: p.coveredCurrency || 'USD',
      coveredAmount: p.coveredAmount || '',
      conversionRate: p.conversionRate || '1',
      notes: p.notes || '',
      taxes: p.taxes || Object.fromEntries(['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t=>[t,0])),
      attachment: p.attachment || null
    });
  }


  function triggerNavigate(item: StagedItem) {
    const p = item.payload || {};
    if (p.type.startsWith('ticket-')) {
      onNavigate?.('ticket', item);
      toast.info(`جارٍ إنزال بيانات التذكرة: ${item.code || item.name}`);
    } else if (p.type.startsWith('bank-')) {
      const sub = p.type === 'bank-transfer' ? 'transfer' : p.type === 'bank-deposit' ? 'deposit' : 'withdraw';
      onNavigate?.('bank-work:' + sub, item);
      toast.info(`جارٍ إنزال بيانات العملية البنكية: ${p.customerName || item.name || item.code}`);
    } else if (p.type.startsWith('cash-')) {
      const sub = p.type === 'cash-receipt' ? 'receipt' : 'payment';
      onNavigate?.('cash-work:' + sub, item);
      toast.info(`جارٍ إنزال بيانات العملية النقدية: ${p.customerName || item.name || item.code}`);
    }
  }
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.info('جارٍ قراءة الملف واستخراج البيانات آلياً بالذكاء الاصطناعي والـ OCR...');
    try {
      const extracted = await analyzeTicketDocument(file);
      const reader = new FileReader();
      reader.onload = () => {
        const resultData = reader.result as string;
        setForm((f: any) => {
          const next = {
            ...f,
            attachment: {
              name: file.name,
              type: file.type || 'application/octet-stream',
              size: file.size,
              data: resultData
            },
            passengers: extracted.passengers || []
          };
          const validPaxList = (extracted.allPassengers || []).map((p: string) => p.trim()).filter(Boolean);
          const validTktList = (extracted.allTicketNos || []).map((t: string) => t.trim()).filter(Boolean);
          const primaryTkt = (extracted.ticketNo || validTktList[0] || '').replace(/\D/g, '');
          const primaryPax = (extracted.passenger || validPaxList[0] || '').trim();

          const paxObjects = (extracted.passengers && extracted.passengers.length > 0)
            ? extracted.passengers
            : validPaxList.map((p: string, i: number) => ({
                name: p,
                ticketNo: (validTktList[i] || validTktList[0] || '').replace(/\D/g, '')
              }));
          next.passengers = paxObjects;
          
          // Detect whether document is a flight ticket or financial transaction
          const isTicketDoc = (validTktList.length > 0 && validTktList.some((t: string) => /^\d{10,14}$/.test(t.replace(/\D/g, '')))) || !!primaryPax || !!extracted.route || !!extracted.airline;
          const isFinancialDoc = !isTicketDoc && (!!extracted.financialDirection || !!extracted.referenceCode || !!extracted.financialNotes);

          if (isTicketDoc) {
            next.category = 'ticket';
            if (!next.type.startsWith('ticket-')) next.type = 'ticket-new';
          } else if (isFinancialDoc) {
            next.category = 'financial';
            if (next.type.startsWith('ticket-')) {
              next.type = (extracted.financialDirection === 'withdraw') ? 'bank-withdraw' : 'bank-deposit';
            }
          }

          // ==============================================================
          // CRITICAL: NEVER AUTO-FILL CUSTOMER NAME! ("المستخدم هو اللي يحدده")
          // Customer name is NEVER populated from extracted data / OCR.
          // The user MUST choose or type it manually.
          // ==============================================================

          // 1. AMOUNT (المبلغ): يملأ آلياً من الصورة المرفقة
          const extractedAmount = (extracted.total && extracted.total > 0)
            ? String(extracted.total)
            : (extracted.fare && extracted.fare > 0 ? String(extracted.fare) : '');
          if (extractedAmount) {
            next.amount = extractedAmount;
            next.sellingPrice = extractedAmount;
            next.docTotal = extractedAmount;
          }

          // 2. CURRENCY (العملة): تملأ آلياً من الصورة المرفقة
          if (extracted.currency) {
            next.currency = extracted.currency;
          }

          // 3. TICKET CODE vs FINANCIAL REFERENCE CODE (رقم التذكرة أو المرجع):
          // في خانة رقم التذكرة يكتب رقم التذكرة الصافي فقط (أرقام فقط)
          if (next.category === 'ticket') {
            if (primaryTkt) {
              next.code = primaryTkt;
            } else if (extracted.pnr) {
              next.code = extracted.pnr.trim();
            } else if (extracted.referenceCode) {
              next.code = extracted.referenceCode.trim();
            }
          } else {
            // للعمليات المالية: رقم المرجع أو الإشعار
            if (extracted.referenceCode) {
              next.code = extracted.referenceCode.trim();
            } else if (primaryTkt) {
              next.code = primaryTkt;
            }
          }

          // 4. DATE (تاريخ إصدار التذكرة أو تاريخ المعاملة المالية):
          if (extracted.date) {
            next.date = extracted.date;
          }

          // 5. DIRECTION & NOTES (نوع الحركة والبيان للعمليات المالية):
          if (extracted.financialDirection && next.category === 'financial') {
            next.financialDirection = extracted.financialDirection;
            const isDep = extracted.financialDirection === 'deposit';
            const isCash = next.financialChannel === 'cash';
            next.type = isCash ? (isDep ? 'cash-receipt' : 'cash-payment') : (isDep ? 'bank-deposit' : 'bank-withdraw');
          }
          if (extracted.financialNotes && !next.notes) {
            next.notes = extracted.financialNotes;
          }

          // 6. TICKET FIELDS: اسم الراكب، خط السير، الخطوط، الدرجة
          if (primaryPax) {
            next.person = primaryPax;
            if (next.category === 'ticket') {
              next.name = primaryPax;
            }
          }
          if (extracted.route) next.route = extracted.route;
          if (extracted.class) next.class = extracted.class;
          if (extracted.airline) next.airline = extracted.airline;

          // عمولة التذكرة المستخرجة: لا نملأ العمولة بكامل قيمة التذكرة أبداً!
          const rawComm = (extracted as any).commission;
          if (rawComm && Number(rawComm) > 0) {
            const extComm = Number(rawComm);
            next.commAmount = String(extComm);
            next.commType = 'internal';
            if (extractedAmount && Number(extractedAmount) > 0) {
              next.supplierPrice = String(Math.max(0, Math.round((Number(extractedAmount) - extComm) * 100) / 100));
            }
          } else {
            // نترك العمولة وسعر المورد فارغين ليحددهما المستخدم بدقة
            next.commAmount = '';
            next.supplierPrice = '';
            next.commType = 'internal';
          }
          next.autoDetectedComm = false;
          return next;
        });

        if (extracted.allPassengers?.length || extracted.passenger || extracted.ticketNo) {
          toast.success(`تم استخراج اسم الراكب (${extracted.passenger || extracted.allPassengers?.[0] || '—'}) ورقم التذكرة وتاريخ الإصدار (${extracted.date || '—'}) بنجاح. يرجى اختيار اسم العميل.`);
        } else if (extracted.financialDirection || extracted.referenceCode) {
          toast.success(`تم استخراج تاريخ المعاملة (${extracted.date || '—'}) والمبلغ (${extracted.total || extracted.fare || '—'} ${extracted.currency || ''}) بنجاح. يرجى اختيار اسم العميل.`);
        } else {
          toast.success(`تم إرفاق المستند بنجاح (${file.name}). يرجى تحديد اسم العميل والمبلغ.`);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error('تعذر تحليل الملف آلياً: ' + (err.message || ''));
    }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    const custName = form.customerName?.trim();
    if (!custName) {
      toast.error('يرجى إدخال أو اختيار اسم العميل لحفظ المعاملة');
      return;
    }

    const isFinancial = form.category === 'financial' || !form.type.startsWith('ticket-');

    let derivedType = form.type;
    if (isFinancial) {
      if (form.type === 'bank-transfer') {
        derivedType = 'bank-transfer';
      } else {
        const isDep = form.financialDirection === 'deposit';
        const isCash = form.financialChannel === 'cash';
        derivedType = isCash ? (isDep ? 'cash-receipt' : 'cash-payment') : (isDep ? 'bank-deposit' : 'bank-withdraw');
      }
    }

    let finalAmount = 0;
    if (isFinancial) {
      finalAmount = Number(form.amount || 0);
      if (!finalAmount || finalAmount <= 0) {
        toast.error('يرجى إدخال مبلغ الحركة المالية');
        return;
      }
      if (!form.notes?.trim()) {
        toast.error('يرجى كتابة البيان لتوضيح تفاصيل وسبب السحب أو الإيداع');
        return;
      }
    } else {
      finalAmount = Number(form.sellingPrice || form.amount || 0);
    }

    const sellNum = Number(form.sellingPrice || 0);
    const supNum = Number(form.supplierPrice || 0);
    const autoDiff = (sellNum > 0 || supNum > 0) ? Math.max(0, Math.round((sellNum - supNum) * 100) / 100) : 0;
    const commNum = (form.commAmount !== '' && form.commAmount !== undefined && !isNaN(Number(form.commAmount)))
      ? Number(form.commAmount)
      : autoDiff;

    setBusy(true);
    try {
      const customerObj = customers.find(c => c.id === form.customerId || c.name === custName);
      const cleanDigitsCode = (form.code || '').replace(/\D/g, '');
      const finalCode = isFinancial
        ? (form.code?.trim() || `OP-${Date.now().toString().slice(-6)}`)
        : (cleanDigitsCode || form.code?.trim() || `TKT-${Date.now().toString().slice(-6)}`);
      const finalName = isFinancial
        ? (custName + (form.notes ? ` - ${form.notes.slice(0, 30)}` : ''))
        : (form.person?.trim() || form.name?.trim() || custName);
      const finalDate = form.date || today();
      const finalCurrency = form.currency || settings.defaultCurrency || 'USD';

      await api('/api/staged-operations', {
        method: 'POST',
        body: JSON.stringify({
          id: form.id || undefined,
          type: derivedType,
          name: finalName,
          code: finalCode,
          date: finalDate,
          currency: finalCurrency,
          amount: finalAmount,
          payload: {
            ...form,
            category: form.category,
            type: derivedType,
            name: finalName,
            code: finalCode,
            date: finalDate,
            currency: finalCurrency,
            amount: finalAmount,
            customerId: customerObj?.id || form.customerId || '',
            customerName: custName,
            commType: form.commType || 'internal',
            commAmount: isFinancial ? 0 : commNum,
            financialDirection: form.financialDirection,
            financialChannel: form.financialChannel,
            notes: form.notes || '',
            status: 'pending'
          }
        })
      });

      toast.success(form.id ? 'تم تعديل العملية المعلقة بنجاح' : 'تمت إضافة العملية المعلقة إلى قائمة الانتظار');
      setForm(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem() {
    if (!remove) return;
    setBusy(true);
    try {
      await api('/api/staged-operations?id=' + remove.id, {method: 'DELETE'});
      toast.success('تم حذف العملية المعلقة');
      setRemove(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    return items.filter(i => {
      const p = i.payload || {};
      const matchType = filterType === 'all' || p.type === filterType;
      const matchCurr = currency === 'all' || i.currency === currency;
      const query = (i.name + ' ' + i.code + ' ' + (p.customerName || '') + ' ' + (p.airline || '')).toLowerCase();
      const matchSearch = query.includes(search.toLowerCase());
      return matchType && matchCurr && matchSearch;
    });
  }, [items, filterType, currency, search]);

  const registeredAirlines = customers.filter(c => !c.payload?.archived && c.payload?.accountType === 'airline').map(c => c.name);
  const allAirlines = registeredAirlines;

  return (
    <div className="record-manager staged-workspace" dir="rtl">
      {/* Top action toolbar */}
      <div className="toolbar" style={{flexWrap: 'wrap', gap: '8px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
          <Sparkles size={20} color="#0f766e" />
          <h1 style={{fontSize: '18px', margin: 0, color: '#0f766e'}}>العمليات والتذاكر المعلقة</h1>
        </div>

        <div className="search-input">
          <Search size={18} />
          <input
            placeholder="بحث برقم التذكرة أو المسافر أو العميل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="بحث في المعلقات"
          />
        </div>

        {/* Currency Filter */}
        <div className="input-group" style={{minWidth: '120px'}}>
          <span>العملة</span>
          <select value={currency} onChange={e => setCurrency(e.target.value)} aria-label="فلتر العملة">
            <option value="all">كل العملات</option>
            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Add Operation Buttons */}
        <div style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
          <button className="blue-button" onClick={() => openAdd('ticket-new')}>
            <Ticket size={16} /> إضافة تذكرة معلقة
          </button>
          <button
            type="button"
            className="plain-button"
            onClick={() => openAdd('bank-deposit')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#eff6ff',
              color: '#2563eb',
              borderColor: '#bfdbfe',
              fontWeight: 700
            }}
          >
            <ArrowLeftRight size={16} /> إضافة حركة مالية (سحب/إيداع)
          </button>
        </div>

        <button className="plain-button" onClick={() => setCustomizingFields(true)} title="تخصيص الحقول الظاهرة">
          <Sliders size={16} /> تخصيص الحقول
        </button>

        <button className="plain-button" onClick={load} aria-label="تحديث البيانات">
          <RefreshCw size={17} />
        </button>
      </div>

      {/* Category Filter Pills */}
      <div style={{display: 'flex', gap: '6px', overflowX: 'auto', padding: '6px 0', borderBottom: '1px solid #e2e8f0', marginBottom: '10px'}}>
        <button
          type="button"
          className={`plain-button ${filterType === 'all' ? 'active-pill' : ''}`}
          style={{
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            background: filterType === 'all' ? '#0f766e' : '#f1f5f9',
            color: filterType === 'all' ? '#fff' : '#334155'
          }}
          onClick={() => setFilterType('all')}
        >
          الكل ({items.length})
        </button>
        {opTypes.map(ot => {
          const count = items.filter(i => i.payload?.type === ot.value).length;
          const active = filterType === ot.value;
          return (
            <button
              key={ot.value}
              type="button"
              className="plain-button"
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                background: active ? ot.color : ot.bg,
                color: active ? '#fff' : ot.color,
                border: `1px solid ${ot.color}33`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              onClick={() => setFilterType(ot.value)}
            >
              <ot.icon size={13} />
              {ot.label} {count > 0 ? `(${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Main Table */}
      <div className="data-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>النوع</TableHead>
              <TableHead>الاسم / المسافر</TableHead>
              <TableHead>الرقم / التذكرة</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>الخطوط / الجهة</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>العمولة / الغرامات</TableHead>
              <TableHead>المرفق</TableHead>
              <TableHead>التحكم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(item => {
              const p = item.payload || {};
              const ot = opTypes.find(t => t.value === p.type) || opTypes[0];
              const att = p.attachment;
              return (
                <TableRow
                  key={item.id}
                  style={{cursor: 'pointer'}}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, a, input')) return;
                    triggerNavigate(item);
                  }}
                  title="اضغط على هذا الصف لإنزال بيانات العملية فوراً في شاشة الإدخال"
                >
                  <TableCell>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: ot.color,
                      background: ot.bg,
                      padding: '3px 8px',
                      borderRadius: '4px'
                    }}>
                      <ot.icon size={13} />
                      {ot.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <strong>{item.name}</strong>
                    {p.person && p.type?.startsWith('ticket-') && (
                      <small style={{display: 'block', color: '#0284c7', fontWeight: 600}}>المسافر: {p.person}</small>
                    )}
                    {p.notes && !p.type?.startsWith('ticket-') && (
                      <small style={{display: 'block', color: '#64748b', fontSize: '11px'}}>البيان: {p.notes}</small>
                    )}
                  </TableCell>
                  <TableCell dir="ltr">
                    <b>{item.code}</b>
                  </TableCell>
                  <TableCell dir="ltr">{item.date}</TableCell>
                  <TableCell dir="rtl" style={{textAlign: 'right', fontWeight: 600}}>{p.customerName || '—'}</TableCell>
                  <TableCell dir="rtl" style={{textAlign: 'right'}}>{p.airline || p.vendor || p.counterpartyName || '—'}</TableCell>
                  <TableCell dir="ltr">
                    <b style={{color: '#0f766e'}}>{money(item.amount)} {item.currency}</b>
                    {p.crossCurrency && p.coveredAmount && (
                      <small style={{display: 'block', color: '#7c3aed'}}>
                        يغطي: {money(Number(p.coveredAmount) * 100)} {p.coveredCurrency}
                      </small>
                    )}
                  </TableCell>
                  <TableCell dir="ltr">
                    {p.commAmount ? (
                      <span style={{
                        color: p.commType === 'external' ? '#2563eb' : '#059669',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: p.commType === 'external' ? '#eff6ff' : '#ecfdf5',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${p.commType === 'external' ? '#bfdbfe' : '#a7f3d0'}`
                      }}>
                        {p.commType === 'external' ? '➕ خارجية: ' : '🏢 داخلية: '}
                        {p.commAmount}
                      </span>
                    ) : null}
                    {p.penalties ? <span style={{color: '#dc2626', display: 'block'}}>غرامة: {p.penalties}</span> : null}
                    {!p.commAmount && !p.penalties && '—'}
                  </TableCell>
                  <TableCell>
                    {att ? (
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(att)}
                        className="plain-button"
                        style={{
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: '#4f46e5',
                          background: '#eef2ff',
                          padding: '3px 8px',
                          borderRadius: '4px'
                        }}
                        title="معاينة المرفق"
                      >
                        <Eye size={13} /> {att.name?.split('.').pop()?.toUpperCase() || 'مرفق'}
                      </button>
                    ) : (
                      <span style={{color: '#94a3b8', fontSize: '12px'}}>لا يوجد</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="row-actions" style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
                      {/* Direct jump to workspace button */}
                      <button
                        type="button"
                        className="blue-button"
                        style={{padding: '3px 10px', fontSize: '11px'}}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerNavigate(item);
                        }}
                        title="الانتقال إلى الشاشة وتنزيل البيانات في مكانها"
                      >
                        تنزيل الآن
                      </button>
                      <button className="plain-button" onClick={() => openEdit(item)} title="تعديل">
                        <Pencil size={15} />
                      </button>
                      <button className="danger-text" onClick={() => setRemove(item)} title="حذف">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {!visible.length && (
          <div className="empty-row">
            {loading ? 'جارٍ تحميل العمليات المعلقة…' : error || 'لا توجد عمليات معلقة حالياً.'}
          </div>
        )}
      </div>

      <p className="table-summary">
        إجمالي المعلقات: <b>{visible.length}</b> عملية
      </p>

      {/* Add / Edit Modal */}
      <Dialog open={!!form && w.active} onOpenChange={v => !v && setForm(null)}>
        <DialogContent dir="rtl" className="record-dialog" style={{maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto'}}>
          <div className="window-title record-window-title">
            <DialogTitle>
              {form?.id ? 'تعديل العملية المعلقة' : 'إضافة عملية معلقة جديدة'}
            </DialogTitle>
            <WindowControls refresh={load} close={() => setForm(null)} />
          </div>
          <DialogDescription>
            سجل بيانات التذكرة أو الحركة المالية مع المرفقات لتظهر للموظف المختص لتنزيلها بضغطة واحدة.
          </DialogDescription>

          {form && (
            <form onSubmit={saveItem} className="record-form" style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
              {/* Mode Switcher Tabs */}
              <div style={{display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '6px'}}>
                <button
                  type="button"
                  onClick={() => {
                    setForm((f: any) => ({
                      ...f,
                      category: 'ticket',
                      type: f.type.startsWith('ticket-') ? f.type : 'ticket-new'
                    }));
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: (form.category === 'ticket' || form.type.startsWith('ticket-')) ? '#ffffff' : 'transparent',
                    color: (form.category === 'ticket' || form.type.startsWith('ticket-')) ? '#0f766e' : '#64748b',
                    boxShadow: (form.category === 'ticket' || form.type.startsWith('ticket-')) ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <Ticket size={17} />
                  <span>معاملة تذكرة طيران (Ticket)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setForm((f: any) => ({
                      ...f,
                      category: 'financial',
                      type: !f.type.startsWith('ticket-') ? f.type : 'bank-deposit',
                      financialDirection: f.financialDirection || 'deposit',
                      financialChannel: f.financialChannel || 'bank'
                    }));
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: (form.category === 'financial' || !form.type.startsWith('ticket-')) ? '#ffffff' : 'transparent',
                    color: (form.category === 'financial' || !form.type.startsWith('ticket-')) ? '#2563eb' : '#64748b',
                    boxShadow: (form.category === 'financial' || !form.type.startsWith('ticket-')) ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <ArrowLeftRight size={17} />
                  <span>حركة مالية (سحب / إيداع)</span>
                </button>
              </div>

              {/* ======================================================== */}
              {/* TOP ATTACHMENT CARD: Auto-Fill Amount & Currency from Image */}
              {/* ======================================================== */}
              <div style={{
                background: form.attachment ? '#f0fdf4' : '#f8fafc',
                border: form.attachment ? '1.5px solid #86efac' : '1.5px dashed #0f766e',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <strong style={{fontSize: '13px', color: form.attachment ? '#15803d' : '#0f766e', display: 'flex', alignItems: 'center', gap: '6px'}}>
                    <Upload size={16} color={form.attachment ? '#16a34a' : '#0f766e'} />
                    <span>{form.attachment ? 'المستند المرفق (تم استخراج المبلغ والعملة منه)' : 'إرفاق صورة الإيصال أو الإشعار أو التذكرة (لقراءة المبلغ والعملة آلياً)'}</span>
                  </strong>
                  {form.attachment && (
                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(form.attachment)}
                        className="plain-button"
                        style={{fontSize: '12px', color: '#4f46e5', display: 'inline-flex', alignItems: 'center', gap: '4px'}}
                      >
                        <Eye size={14}/> معاينة
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f: any) => ({...f, attachment: null}))}
                        className="danger-text"
                        style={{fontSize: '12px'}}
                      >
                        إزالة المرفق
                      </button>
                    </div>
                  )}
                </div>

                {form.attachment ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0'
                  }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                      <FileText size={22} color="#15803d" />
                      <div>
                        <div style={{fontSize: '12px', fontWeight: 700, color: '#14532d'}}>
                          {form.attachment.name}
                        </div>
                        <small style={{color: '#16a34a', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600}}>
                          <Check size={12} /> تم استخراج المبلغ والعملة آلياً من الصورة. حدد اسم العميل بنفسك.
                        </small>
                      </div>
                    </div>
                    <label
                      htmlFor="staged-file-input"
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#0f766e',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        background: '#f0fdf4',
                        borderRadius: '4px',
                        border: '1px solid #a7f3d0'
                      }}
                    >
                      استبدال الصورة
                    </label>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      id="staged-file-input"
                      style={{display: 'none'}}
                      accept="*/*"
                      onChange={handleFileSelect}
                    />
                    <label
                      htmlFor="staged-file-input"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '12px',
                        cursor: 'pointer',
                        color: '#0f766e',
                        background: '#ffffff',
                        borderRadius: '8px',
                        border: '1.5px dashed #0f766e',
                        fontWeight: 700,
                        fontSize: '13px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Upload size={18} />
                      <span>اضغط هنا لاختيار أو رفع صورة الإيصال / الإشعار البنكي / التذكرة</span>
                      <span style={{fontSize: '11px', color: '#64748b', fontWeight: 400}}>
                        (يملأ المبلغ والعملة فوراً ويبقى اسم العميل لتحدده بنفسك)
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* ======================================================== */}
              {/* MODE 1: FINANCIAL OPERATION (سحب / إيداع - الحقول الـ 5) */}
              {/* ======================================================== */}
              {(form.category === 'financial' || !form.type.startsWith('ticket-')) ? (
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  {/* Core Financial Box */}
                  <div style={{background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <strong style={{color: '#1d4ed8', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <Sparkles size={16} /> البيانات الأساسية للحركة المالية (الـ 5 حقول المطلوبة)
                      </strong>
                      <span style={{fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 600}}>
                        معاملة نقدية / بنكية
                      </span>
                    </div>

                    {/* 1. نوع الحركة: سحب أو إيداع */}
                    <div style={{background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#334155'}}>
                        1. نوع الحركة (سحب أو إيداع) *
                      </span>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f: any) => ({
                              ...f,
                              financialDirection: 'deposit',
                              type: f.financialChannel === 'cash' ? 'cash-receipt' : 'bank-deposit'
                            }));
                          }}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            border: form.financialDirection === 'deposit' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                            background: form.financialDirection === 'deposit' ? '#dcfce7' : '#f8fafc',
                            color: form.financialDirection === 'deposit' ? '#15803d' : '#64748b'
                          }}
                        >
                          <ArrowDownLeft size={18} />
                          <span>🟢 إيداع / قبض (وارد)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setForm((f: any) => ({
                              ...f,
                              financialDirection: 'withdraw',
                              type: f.financialChannel === 'cash' ? 'cash-payment' : 'bank-withdraw'
                            }));
                          }}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            border: form.financialDirection === 'withdraw' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                            background: form.financialDirection === 'withdraw' ? '#fee2e2' : '#f8fafc',
                            color: form.financialDirection === 'withdraw' ? '#b91c1c' : '#64748b'
                          }}
                        >
                          <ArrowUpRight size={18} />
                          <span>🔴 سحب / صرف (صادر)</span>
                        </button>
                      </div>

                      {/* طريقة التنفيذ: بنك أو خزينة */}
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0'}}>
                        <span style={{fontSize: '11px', color: '#64748b', fontWeight: 600}}>طريقة التنفيذ:</span>
                        <div style={{display: 'flex', gap: '6px', flex: 1}}>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((f: any) => ({
                                ...f,
                                financialChannel: 'bank',
                                type: f.financialDirection === 'deposit' ? 'bank-deposit' : 'bank-withdraw'
                              }));
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: form.financialChannel === 'bank' && form.type !== 'bank-transfer' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                              background: form.financialChannel === 'bank' && form.type !== 'bank-transfer' ? '#eff6ff' : '#fff',
                              color: form.financialChannel === 'bank' && form.type !== 'bank-transfer' ? '#1d4ed8' : '#64748b'
                            }}
                          >
                            🏦 حساب بنكي
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((f: any) => ({
                                ...f,
                                financialChannel: 'cash',
                                type: f.financialDirection === 'deposit' ? 'cash-receipt' : 'cash-payment'
                              }));
                            }}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: form.financialChannel === 'cash' ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                              background: form.financialChannel === 'cash' ? '#f0fdf4' : '#fff',
                              color: form.financialChannel === 'cash' ? '#0f766e' : '#64748b'
                            }}
                          >
                            💵 خزينة نقدية
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((f: any) => ({
                                ...f,
                                type: 'bank-transfer'
                              }));
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: form.type === 'bank-transfer' ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                              background: form.type === 'bank-transfer' ? '#f5f3ff' : '#fff',
                              color: form.type === 'bank-transfer' ? '#6d28d9' : '#64748b'
                            }}
                          >
                            🔁 تحويل بنكي
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 2. اسم العميل / الحساب */}
                    <AccountSelectorInput
                      label="2. اسم العميل / الحساب *"
                      color="#1d4ed8"
                      value={form.customerName}
                      onChange={(name, id) => setForm({...form, customerName: name, customerId: id})}
                      customers={customers}
                      placeholder="اختر أو اكتب اسم العميل أو الحساب المالي المرتبط بالحركة..."
                      required
                    />

                    {/* 3 & 4. المبلغ والعملة */}
                    <div style={{display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px'}}>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#1e3a8a'}}>3. المبلغ *:</span>
                        <label className="input-group" style={{margin: 0}}>
                          <span style={{background: '#1d4ed8', color: '#fff'}}>المبلغ</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={form.amount}
                            onChange={e => setForm({...form, amount: e.target.value})}
                            placeholder="أدخل مبلغ العملية..."
                            style={{fontSize: '15px', fontWeight: 700}}
                            required
                          />
                        </label>
                      </div>

                      <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#1e3a8a'}}>4. العملة *:</span>
                        <div className="input-group" style={{margin: 0}}>
                          <span style={{background: '#1d4ed8', color: '#fff'}}>العملة</span>
                          <select
                            value={form.currency}
                            onChange={e => setForm({...form, currency: e.target.value})}
                            style={{fontWeight: 700}}
                          >
                            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* 5. البيان / شرح الحركة */}
                    <label className="stack-label" style={{margin: 0}}>
                      <span style={{fontWeight: 700, color: '#1e3a8a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                        5. البيان / تفاصيل الحركة المالية *
                      </span>
                      <textarea
                        value={form.notes}
                        onChange={e => setForm({...form, notes: e.target.value})}
                        placeholder="اكتب بيان وتفاصيل السحب أو الإيداع (مثال: دفعة من حساب تذاكر / سداد رصيد نقدي / إشعار تحويل بنك الخرطوم)..."
                        rows={2}
                        required
                        style={{border: '1.5px solid #93c5fd', borderRadius: '6px', padding: '8px'}}
                      />
                    </label>
                  </div>

                  {/* حقول اختيارية للعملية المالية */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>تاريخ المعاملة:</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span>التاريخ</span>
                        <input
                          type="date"
                          value={form.date}
                          onChange={e => setForm({...form, date: e.target.value})}
                        />
                      </label>
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>رقم السند / المرجع (اختياري):</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span>رقم المرجع</span>
                        <input
                          dir="ltr"
                          value={form.code}
                          onChange={e => setForm({...form, code: e.target.value})}
                          placeholder="تلقائي إن ترك فارغاً"
                        />
                      </label>
                    </div>
                  </div>

                  {/* اختيار الخزينة أو البنك المحدد (اختياري) */}
                  <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                    <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>تحديد الخزينة أو البنك (اختياري):</span>
                    <div className="input-group" style={{margin: 0}}>
                      <span>الخزينة / البنك</span>
                      <select
                        value={form.treasuryId}
                        onChange={e => setForm({...form, treasuryId: e.target.value})}
                      >
                        <option value="">-- اختياري: سيحدد الموظف الحساب عند التنزيل --</option>
                        {form.financialChannel === 'cash' ? (
                          cashboxes.map(c => <option key={c.id} value={c.id}>{c.name} · خزينة ({c.currency})</option>)
                        ) : (
                          banks.map(b => <option key={b.id} value={b.id}>{b.name} · بنك ({b.currency})</option>)
                        )}
                      </select>
                    </div>
                  </div>

                  {/* السداد بعملة لتغطية عملة أخرى (Cross-Currency) */}
                  <div style={{background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1'}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155'}}>
                      <input
                        type="checkbox"
                        checked={form.crossCurrency}
                        onChange={e => setForm({...form, crossCurrency: e.target.checked})}
                      />
                      سداد بعملة لتغطية عملة أخرى (Cross-Currency Settlement)
                    </label>

                    {form.crossCurrency && (
                      <div style={{marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#f0fdf4', padding: '10px', borderRadius: '6px', border: '1px solid #86efac'}}>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                            <span style={{fontSize: '12px', fontWeight: 700, color: '#166534'}}>عملة السداد (العملة الأخرى):</span>
                            <div className="input-group" style={{margin: 0}}>
                              <span>عملة السداد</span>
                              <select
                                value={form.settlementCurrency || 'SDG'}
                                onChange={e => setForm({...form, settlementCurrency: e.target.value, settlementTreasuryId: ''})}
                              >
                                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                            <span style={{fontSize: '12px', fontWeight: 700, color: '#166534'}}>حساب الخزنة / البنك (بالعملة الأخرى):</span>
                            <div className="input-group" style={{margin: 0}}>
                              <span>حساب الخزنة / البنك</span>
                              <select
                                value={form.settlementTreasuryId || ''}
                                onChange={e => setForm({...form, settlementTreasuryId: e.target.value})}
                              >
                                <option value="">-- اختر الحساب بالعملة الأخرى --</option>
                                {(() => {
                                  const isCash = form.type?.startsWith('cash-') || form.financialChannel === 'cash';
                                  const rawList = isCash 
                                    ? cashboxes.map(c => ({...c, typeLabel: 'خزينة'}))
                                    : banks.map(b => ({...b, typeLabel: 'بنك'}));
                                  return rawList.map(a => <option key={a.id} value={a.id}>{a.name} · {a.typeLabel} ({a.currency})</option>);
                                })()}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px'}}>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                            <span style={{fontSize: '12px', fontWeight: 700, color: '#166534'}}>المبلغ الفعلي المدفوع:</span>
                            <label className="input-group" style={{margin: 0}}>
                              <span>المبلغ المدفوع ({form.settlementCurrency || 'SDG'})</span>
                              <input
                                type="number"
                                step="any"
                                min="0.01"
                                value={form.settlementAmount || ''}
                                onChange={e => {
                                  const sAmt = Number(e.target.value || 0);
                                  const cov = Number(form.coveredAmount || form.amount || 0);
                                  setForm({
                                    ...form,
                                    settlementAmount: e.target.value,
                                    ...(cov > 0 && sAmt > 0 ? {conversionRate: (sAmt / cov).toFixed(4)} : {})
                                  });
                                }}
                              />
                            </label>
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                            <span style={{fontSize: '12px', fontWeight: 700, color: '#166534'}}>سعر الصرف *:</span>
                            <label className="input-group" style={{margin: 0}}>
                              <span>سعر الصرف</span>
                              <input
                                type="number"
                                step="any"
                                min="0.00000001"
                                value={form.conversionRate}
                                onChange={e => {
                                  const r = e.target.value;
                                  const cov = Number(form.coveredAmount || form.amount || 0);
                                  setForm({
                                    ...form,
                                    conversionRate: r,
                                    ...(Number(r) > 0 && cov > 0 ? {settlementAmount: (cov * Number(r)).toFixed(2)} : {})
                                  });
                                }}
                              />
                            </label>
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                            <span style={{fontSize: '12px', fontWeight: 700, color: '#166534'}}>المبلغ المغطى ({form.coveredCurrency || form.currency || 'USD'}):</span>
                            <label className="input-group" style={{margin: 0}}>
                              <span>المبلغ المغطى</span>
                              <input
                                type="number"
                                step="0.01"
                                value={form.coveredAmount || form.amount}
                                onChange={e => {
                                  const cov = Number(e.target.value || 0);
                                  const r = Number(form.conversionRate || 1);
                                  setForm({
                                    ...form,
                                    coveredAmount: e.target.value,
                                    ...(r > 0 && cov > 0 ? {settlementAmount: (cov * r).toFixed(2)} : {})
                                  });
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ======================================================== */
                /* MODE 2: TICKET OPERATION (تذاكر طيران والعمولة داخلي/خارجي) */
                /* ======================================================== */
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                  {/* Core Ticket Box: اسم العميل والعمولة المنفصلان */}
                  <div style={{background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <strong style={{color: '#15803d', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <Sparkles size={16} /> البيانات الأساسية للتذكرة (اسم العميل وخيار العمولة)
                      </strong>
                      <button
                        type="button"
                        onClick={() => setCustomizingFields(true)}
                        className="plain-button"
                        style={{fontSize: '11px', color: '#0f766e'}}
                      >
                        <Sliders size={13} /> تخصيص الحقول الاختيارية
                      </button>
                    </div>

                    {/* اسم العميل (حساب العميل - منفصل تماماً عن اسم المسافر) */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#15803d'}}>اسم حساب العميل (العميل فقط - حدده بنفسك) *:</span>
                      <AccountSelectorInput
                        label="اسم العميل *"
                        color="#15803d"
                        value={form.customerName}
                        onChange={(name, id) => setForm({...form, customerName: name, customerId: id})}
                        customers={customers.filter(c => !c.payload?.accountType || c.payload?.accountType === 'customer')}
                        placeholder="اختر أو اكتب اسم حساب العميل..."
                        required
                      />
                    </div>

                    {/* اختيار نوع العمولة: داخلية أو خارجية + قيمة العمولة */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '8px', background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: form.commType === 'external' ? '1.5px solid #93c5fd' : '1.5px solid #86efac', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#1e293b'}}>خيار نوع العمولة:</span>
                        {form.autoDetectedComm && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: form.commType === 'external' ? '#dbeafe' : '#dcfce7',
                            color: form.commType === 'external' ? '#1d4ed8' : '#15803d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            ✨ تم التحديد تلقائياً: {form.commType === 'external' ? 'عمولة خارجية' : 'عمولة داخلية'}
                          </span>
                        )}
                      </div>

                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'}}>
                        {/* زر عمولة داخلية */}
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f: any) => {
                              const sell = Number(f.sellingPrice || f.amount || 0);
                              const comm = Number(f.commAmount || 0);
                              const sup = Number(f.supplierPrice || 0);
                              let newSup = f.supplierPrice;
                              let newSell = f.sellingPrice;
                              // القاعدة: لو عمولة داخلية يخصم قيمة العمولة من المجموع الكلي ويكون هو سعر التكلفة من المورد
                              if (sell > 0 && comm > 0) {
                                newSup = String(Math.max(0, Math.round((sell - comm) * 100) / 100));
                              } else if (sup > 0 && comm > 0 && (!sell || sell === 0)) {
                                newSell = String(Math.round((sup + comm) * 100) / 100);
                              } else if (sell > 0 && sup > 0 && (!comm || comm === 0)) {
                                const calculated = Math.max(0, Math.round((sell - sup) * 100) / 100);
                                return {...f, commType: 'internal', commAmount: String(calculated), autoDetectedComm: false};
                              }
                              return {
                                ...f,
                                commType: 'internal',
                                supplierPrice: newSup,
                                sellingPrice: newSell || f.sellingPrice,
                                autoDetectedComm: false
                              };
                            });
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '3px',
                            transition: 'all 0.15s ease',
                            border: form.commType !== 'external' ? '2px solid #0f766e' : '1px solid #cbd5e1',
                            background: form.commType !== 'external' ? '#f0fdf4' : '#f8fafc',
                            color: form.commType !== 'external' ? '#0f766e' : '#64748b',
                            boxShadow: form.commType !== 'external' ? '0 2px 6px rgba(15,118,110,0.15)' : 'none'
                          }}
                        >
                          <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                            <span>🏢 عمولة داخلية</span>
                            {form.commType !== 'external' && <Check size={14} strokeWidth={2.5} />}
                          </div>
                          <small style={{fontSize: '10px', opacity: 0.9}}>مخصومة من المورد (سعر المورد = الإجمالي - العمولة)</small>
                        </button>

                        {/* زر عمولة خارجية */}
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f: any) => {
                              const sup = Number(f.supplierPrice || 0);
                              const comm = Number(f.commAmount || 0);
                              const sell = Number(f.sellingPrice || f.amount || 0);
                              let newSell = f.sellingPrice;
                              let newSup = f.supplierPrice;
                              // القاعدة: واذ خارجية يضاف على سعر المورد ويكون ده السعر الإجمالي
                              if (sup > 0 && comm > 0) {
                                newSell = String(Math.round((sup + comm) * 100) / 100);
                              } else if (sell > 0 && comm > 0 && (!sup || sup === 0)) {
                                newSup = String(Math.max(0, Math.round((sell - comm) * 100) / 100));
                              } else if (sell > 0 && sup > 0 && (!comm || comm === 0)) {
                                const calculated = Math.max(0, Math.round((sell - sup) * 100) / 100);
                                return {...f, commType: 'external', commAmount: String(calculated), autoDetectedComm: false};
                              }
                              return {
                                ...f,
                                commType: 'external',
                                sellingPrice: newSell || f.sellingPrice,
                                amount: newSell || f.amount,
                                supplierPrice: newSup,
                                autoDetectedComm: false
                              };
                            });
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '3px',
                            transition: 'all 0.15s ease',
                            border: form.commType === 'external' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: form.commType === 'external' ? '#eff6ff' : '#f8fafc',
                            color: form.commType === 'external' ? '#1d4ed8' : '#64748b',
                            boxShadow: form.commType === 'external' ? '0 2px 6px rgba(37,99,235,0.15)' : 'none'
                          }}
                        >
                          <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                            <span>➕ عمولة خارجية</span>
                            {form.commType === 'external' && <Check size={14} strokeWidth={2.5} />}
                          </div>
                          <small style={{fontSize: '10px', opacity: 0.9}}>مضافة فوق المورد (السعر الإجمالي = المورد + العمولة)</small>
                        </button>
                      </div>

                      {/* حقل قيمة العمولة */}
                      <div style={{display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#1e293b'}}>قيمة ومبلغ العمولة:</span>
                        <label className="input-group" style={{margin: 0}}>
                          <span style={{background: form.commType === 'external' ? '#2563eb' : '#0f766e', color: '#fff', fontWeight: 700}}>
                            {form.commType === 'external' ? 'العمولة الخارجية (مضافة للعميل)' : 'العمولة الداخلية (مخصومة من المورد)'}
                          </span>
                          <input
                            type="number"
                            step="any"
                            value={form.commAmount}
                            onChange={e => {
                              const cVal = e.target.value;
                              pricingLeadRef.current = cVal !== '' ? 'comm' : 'none';
                              const c = Number(cVal || 0);
                              const sup = Number(form.supplierPrice || 0);
                              const sell = Number(form.sellingPrice || form.amount || 0);

                              if (cVal === '') {
                                setForm({...form, commAmount: '', autoDetectedComm: false});
                                return;
                              }

                              if (form.commType === 'external') {
                                // عمولة خارجية: يضاف على سعر المورد ويكون ده السعر الإجمالي
                                if (sup > 0) {
                                  const newSell = String(Math.round((sup + c) * 100) / 100);
                                  setForm({
                                    ...form,
                                    commAmount: cVal,
                                    sellingPrice: newSell,
                                    amount: newSell,
                                    autoDetectedComm: false
                                  });
                                } else if (sell > 0 && c > 0) {
                                  const newSup = String(Math.max(0, Math.round((sell - c) * 100) / 100));
                                  setForm({
                                    ...form,
                                    commAmount: cVal,
                                    supplierPrice: newSup,
                                    autoDetectedComm: false
                                  });
                                } else {
                                  setForm({...form, commAmount: cVal, autoDetectedComm: false});
                                }
                              } else {
                                // عمولة داخلية: يخصم قيمة العمولة من المجموع الكلي ويكون هو ده سعر التكلفة من المورد
                                if (sell > 0) {
                                  const newSup = String(Math.max(0, Math.round((sell - c) * 100) / 100));
                                  setForm({
                                    ...form,
                                    commAmount: cVal,
                                    supplierPrice: newSup,
                                    autoDetectedComm: false
                                  });
                                } else if (sup > 0 && c > 0) {
                                  const newSell = String(Math.round((sup + c) * 100) / 100);
                                  setForm({
                                    ...form,
                                    commAmount: cVal,
                                    sellingPrice: newSell,
                                    amount: newSell,
                                    autoDetectedComm: false
                                  });
                                } else {
                                  setForm({...form, commAmount: cVal, autoDetectedComm: false});
                                }
                              }
                            }}
                            placeholder={form.commType === 'external' ? 'أدخل العمولة لتضاف فوق التكلفة...' : 'أدخل العمولة لتخصم من المجموع الكلي للمورد...'}
                          />
                        </label>
                      </div>

                      {/* شريط توضيح الحسبة والربح */}
                      <div style={{fontSize: '11px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0'}}>
                        <span style={{fontWeight: 600}}>
                          {form.commType === 'external' 
                            ? `💡 الحسبة: السعر الإجمالي (${form.sellingPrice || 0}) = سعر المورد (${form.supplierPrice || 0}) + العمولة (${form.commAmount || 0})`
                            : `💡 الحسبة: سعر المورد (${form.supplierPrice || 0}) = المجموع الكلي (${form.sellingPrice || 0}) - العمولة (${form.commAmount || 0})`}
                        </span>
                        <span style={{fontWeight: 800, fontSize: '12px', color: form.commType === 'external' ? '#1d4ed8' : '#0f766e'}}>
                          {form.commAmount ? `الربح: ${form.commAmount} ${form.currency}` : 'بدون عمولة (0)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* نوع التذكرة */}
                  <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                    <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>نوع حركة التذكرة:</span>
                    <div className="input-group" style={{margin: 0}}>
                      <span>نوع التذكرة</span>
                      <select
                        value={form.type}
                        onChange={e => setForm({...form, type: e.target.value})}
                      >
                        <option value="ticket-new">تذكرة جديدة</option>
                        <option value="ticket-refund">تذكرة مستردة (Refund)</option>
                        <option value="ticket-void">تذكرة ملغاة (Void)</option>
                      </select>
                    </div>
                  </div>

                  {/* اسم المسافر (PAX) ورقم التذكرة (TKT No) */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#0369a1'}}>اسم المسافر (الراكب فقط):</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span style={{background: '#0369a1', color: '#fff'}}>اسم المسافر</span>
                        <input
                          value={form.person || form.name}
                          onChange={e => setForm({...form, person: e.target.value, name: e.target.value})}
                          placeholder="اسم المسافر / الراكب (PAX) فقط"
                        />
                      </label>
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#0369a1'}}>رقم التذكرة (أرقام فقط):</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span>رقم التذكرة</span>
                        <input
                          dir="ltr"
                          value={form.code}
                          onChange={e => setForm({...form, code: e.target.value.replace(/\D/g, '')})}
                          placeholder="0651234567890"
                        />
                      </label>
                    </div>
                  </div>

                  {/* جدول وقائمة الركاب المتعددين مرصوصين تحت بعض كما بالتذكرة */}
                  {form.passengers && form.passengers.length > 0 && (
                    <div style={{background: '#f8fafc', border: '1.5px solid #94a3b8', borderRadius: '8px', padding: '10px', marginTop: '2px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px'}}>
                          <span>📋 قائمة الركاب وأرقام التذاكر ({form.passengers.length} ركاب - مرصوصين تحت بعض كما بالتذكرة):</span>
                        </span>
                        <span style={{fontSize: '11px', color: '#64748b'}}>كل راكب جنبه رقم تذكرته الصافي</span>
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                        {form.passengers.map((pax: any, idx: number) => {
                          const cleanTkt = (pax.ticketNo || '').replace(/\D/g, '');
                          const isCurrent = (form.person === pax.name || form.code === cleanTkt);
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1.5fr 1.5fr auto',
                                gap: '8px',
                                alignItems: 'center',
                                background: isCurrent ? '#eff6ff' : '#ffffff',
                                border: isCurrent ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                padding: '6px 10px',
                                borderRadius: '6px'
                              }}
                            >
                              <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                <span style={{fontSize: '11px', fontWeight: 700, color: '#64748b'}}>#{idx + 1}</span>
                                <span style={{fontSize: '12px', fontWeight: 700, color: '#1e293b'}}>{pax.name || '—'}</span>
                              </div>
                              <div style={{display: 'flex', alignItems: 'center', gap: '4px'}} dir="ltr">
                                <span style={{fontSize: '11px', color: '#64748b'}}>TKT:</span>
                                <code style={{fontSize: '12px', fontWeight: 700, color: '#0369a1'}}>{cleanTkt}</code>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setForm({
                                    ...form,
                                    person: pax.name,
                                    name: pax.name,
                                    code: cleanTkt
                                  });
                                  toast.info(`تم تحديد الراكب: ${pax.name}`);
                                }}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: isCurrent ? '#2563eb' : '#e0f2fe',
                                  color: isCurrent ? '#ffffff' : '#0369a1',
                                  border: isCurrent ? '1px solid #1d4ed8' : '1px solid #bae6fd',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                {isCurrent ? 'الرئيسي الحالي ✓' : 'تحديد كالرئيسي'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* التاريخ والعملة */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>تاريخ إصدار التذكرة:</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span>التاريخ</span>
                        <input
                          type="date"
                          value={form.date}
                          onChange={e => setForm({...form, date: e.target.value})}
                        />
                      </label>
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>عملة التذكرة:</span>
                      <div className="input-group" style={{margin: 0}}>
                        <span>العملة</span>
                        <select
                          value={form.currency}
                          onChange={e => setForm({...form, currency: e.target.value})}
                        >
                          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* الخطوط أو المورد وخط السير */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    <AccountSelectorInput
                      label="الخطوط أو المورد"
                      color="#475569"
                      value={form.airline}
                      onChange={(name) => setForm({...form, airline: name})}
                      customers={customers.filter(c => c.payload?.accountType === 'airline' || c.payload?.accountType === 'supplier')}
                      placeholder="اختر أو اكتب اسم الخطوط أو المورد..."
                    />

                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>خط السير (Route):</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span>خط السير</span>
                        <input
                          dir="ltr"
                          value={form.route}
                          onChange={e => setForm({...form, route: e.target.value})}
                          placeholder="CAI - KRT"
                        />
                      </label>
                    </div>
                  </div>

                  {/* سعر التكلفة وسعر البيع بالحساب التبادلي الديناميكي حسب أسبقية الإدخال */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    {/* سعر التكلفة (المورد) */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#7c6ba3'}}>سعر التكلفة (المورد) *:</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span style={{background: '#7c6ba3', color: '#fff', fontWeight: 700}}>سعر المورد</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.supplierPrice}
                          onChange={e => {
                            const supValStr = e.target.value;
                            const sup = Number(supValStr || 0);
                            const commVal = Number(form.commAmount || 0);
                            const sellVal = Number(form.sellingPrice || form.amount || 0);

                            if (supValStr === '') {
                              setForm({...form, supplierPrice: ''});
                              return;
                            }

                            // القاعدة 2: إذا كتبت العمولة أولاً ثم كتب سعر المورد:
                            // احسب واكتب السعر الإجمالي آلياً: السعر الإجمالي = سعر المورد + العمولة
                            if (pricingLeadRef.current === 'comm' && form.commAmount !== '' && form.commAmount !== undefined) {
                              const newSell = String(Math.round((sup + commVal) * 100) / 100);
                              setForm({
                                ...form,
                                supplierPrice: supValStr,
                                sellingPrice: newSell,
                                amount: newSell,
                                autoDetectedComm: false
                              });
                              return;
                            }

                            // القاعدة 3: إذا لم تكتب العمولة أولاً، كتب سعر المورد:
                            pricingLeadRef.current = 'supplier';
                            if (sellVal > 0) {
                              // كلاهما موجود (سعر المورد وسعر الإجمالي) -> احسب العمولة آلياً
                              const diff = Math.round((sellVal - sup) * 100) / 100;
                              const absComm = Math.max(0, diff);
                              setForm({
                                ...form,
                                supplierPrice: supValStr,
                                commAmount: String(absComm),
                                autoDetectedComm: true
                              });
                            } else {
                              setForm({
                                ...form,
                                supplierPrice: supValStr
                              });
                            }
                          }}
                          placeholder="أدخل سعر التكلفة للمورد..."
                        />
                      </label>
                    </div>

                    {/* سعر البيع (للعميل) */}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                      <span style={{fontSize: '12px', fontWeight: 700, color: '#0f766e'}}>سعر البيع الإجمالي (للعميل) *:</span>
                      <label className="input-group" style={{margin: 0}}>
                        <span style={{background: '#0f766e', color: '#fff', fontWeight: 700}}>سعر البيع</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.sellingPrice}
                          onChange={e => {
                            const sVal = e.target.value;
                            const sell = Number(sVal || 0);
                            const commVal = Number(form.commAmount || 0);
                            const supVal = Number(form.supplierPrice || 0);

                            if (sVal === '') {
                              setForm({...form, sellingPrice: '', amount: ''});
                              return;
                            }

                            // القاعدة 1: إذا كتبت العمولة أولاً ثم كتب السعر الإجمالي:
                            // احسب واكتب سعر المورد آلياً: سعر المورد = السعر الإجمالي - العمولة
                            if (pricingLeadRef.current === 'comm' && form.commAmount !== '' && form.commAmount !== undefined) {
                              const newSup = String(Math.max(0, Math.round((sell - commVal) * 100) / 100));
                              setForm({
                                ...form,
                                sellingPrice: sVal,
                                amount: sVal,
                                supplierPrice: newSup,
                                autoDetectedComm: false
                              });
                              return;
                            }

                            // القاعدة 3: إذا لم تكتب العمولة أولاً، كتب سعر البيع:
                            pricingLeadRef.current = 'sell';
                            if (supVal > 0) {
                              // كلاهما موجود (سعر المورد وسعر الإجمالي) -> احسب العمولة آلياً
                              const diff = Math.round((sell - supVal) * 100) / 100;
                              const absComm = Math.max(0, diff);
                              setForm({
                                ...form,
                                sellingPrice: sVal,
                                amount: sVal,
                                commAmount: String(absComm),
                                autoDetectedComm: true
                              });
                            } else {
                              setForm({
                                ...form,
                                sellingPrice: sVal,
                                amount: sVal
                              });
                            }
                          }}
                          placeholder="أدخل السعر الإجمالي للعميل..."
                        />
                      </label>
                    </div>
                  </div>

                  {/* الغرامات في حالة المستردة أو الملغاة */}
                  {['ticket-refund', 'ticket-void'].includes(form.type) && (
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#fff1f2', padding: '10px', borderRadius: '6px', border: '1px solid #fecdd3'}}>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#e11d48'}}>الغرامات / رسوم الإلغاء:</span>
                        <label className="input-group" style={{margin: 0}}>
                          <span style={{background: '#e11d48', color: '#fff'}}>الغرامة</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.penalties}
                            onChange={e => setForm({...form, penalties: e.target.value})}
                            placeholder="قيمة الغرامة"
                          />
                        </label>
                      </div>

                      <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                        <span style={{fontSize: '12px', fontWeight: 700, color: '#475569'}}>عمولة الاسترداد (رسوم الوكالة):</span>
                        <label className="input-group" style={{margin: 0}}>
                          <span>عمولة الاسترداد</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.refundComm}
                            onChange={e => setForm({...form, refundComm: e.target.value})}
                            placeholder="رسوم الوكالة"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* بيان وملاحظات التذكرة */}
                  <label className="stack-label">
                    <span style={{fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px'}}>ملاحظات / بيان العملية:</span>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm({...form, notes: e.target.value})}
                      placeholder="ملاحظات توضيحية لتظهر للموظف عند تنزيل التذكرة..."
                      rows={2}
                    />
                  </label>
                </div>
              )}



              {/* Buttons */}
              <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px'}}>
                <button type="button" className="gray-button" onClick={() => setForm(null)}>
                  إلغاء
                </button>
                <button type="submit" className="blue-button" disabled={busy}>
                  {busy ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'إضافة إلى المعلقات'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Field Customization Dialog */}
      <Dialog open={customizingFields} onOpenChange={setCustomizingFields}>
        <DialogContent dir="rtl" style={{maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto'}}>
          <div className="window-title">
            <DialogTitle style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <Sliders size={18} color="#0f766e" /> تخصيص حقول العمليات المعلقة
            </DialogTitle>
            <WindowControls refresh={() => {}} close={() => setCustomizingFields(false)} />
          </div>
          <DialogDescription>
            تحكم في إظهار أو إخفاء أي جزء من بيانات العمليات المعلقة. اسم العميل والعمولة حقول أساسية للحفظ دائماً، وبقية الحقول يمكنك تعطيلها أو تفعيلها بحسب احتياجك.
          </DialogDescription>

          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px'}}>
            <div style={{background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={{fontWeight: 600, color: '#15803d'}}>اسم العميل والعمولة (البيانات الأساسية)</span>
              <span style={{fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 600}}>إلزامي دائماً</span>
            </div>

            {stagedFieldLabels.map(({key, label, desc}) => {
              const active = fieldConfig[key] !== false;
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: active ? '#ffffff' : '#f1f5f9',
                    border: `1px solid ${active ? '#cbd5e1' : '#e2e8f0'}`
                  }}
                >
                  <div>
                    <span style={{color: active ? '#0f172a' : '#64748b', fontWeight: 500, display: 'block'}}>
                      {label}
                    </span>
                    <small style={{color: '#94a3b8', fontSize: '11px'}}>{desc}</small>
                  </div>
                  <label style={{display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '6px'}}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={e => toggleField(key, e.target.checked)}
                      style={{width: '18px', height: '18px'}}
                    />
                    <span style={{fontSize: '12px', color: active ? '#0f766e' : '#94a3b8', fontWeight: 600}}>
                      {active ? 'مفعل' : 'مخفي'}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px'}}>
            <button
              type="button"
              className="plain-button"
              onClick={() => {
                const allActive = Object.fromEntries(stagedFieldLabels.map(f => [f.key, true]));
                setFieldConfig(allActive);
                try { localStorage.setItem('shako_staged_fields', JSON.stringify(allActive)); } catch {}
                toast.success('تم استعادة تفعيل جميع الحقول');
              }}
              style={{fontSize: '12px'}}
            >
              تفعيل جميع الحقول
            </button>
            <button
              type="button"
              className="blue-button"
              onClick={() => setCustomizingFields(false)}
            >
              تم وحفظ الإعدادات
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!remove && w.active} onOpenChange={v => !v && setRemove(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogTitle>حذف العملية المعلقة</AlertDialogTitle>
          <AlertDialogDescription>
            هل تريد بالتأكيد حذف «{remove?.name}» (رقم: {remove?.code}) من قائمة المعلقات؟
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>رجوع</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} disabled={busy}>
              حذف العملية
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Attachment Preview Modal */}
      <Dialog open={!!previewAttachment} onOpenChange={v => !v && setPreviewAttachment(null)}>
        <DialogContent dir="rtl" style={{maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
            <DialogTitle>معاينة المرفق: {previewAttachment?.name}</DialogTitle>
            {previewAttachment?.data && (
              <a
                href={previewAttachment.data}
                download={previewAttachment.name}
                className="blue-button"
                style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: '12px'}}
              >
                <Download size={14}/> تنزيل الملف
              </a>
            )}
          </div>
          <DialogDescription className="sr-only">معاينة مرفق العملية</DialogDescription>
          {previewAttachment && (
            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px'}}>
              {previewAttachment.type?.startsWith('image/') || previewAttachment.data?.startsWith('data:image/') ? (
                <img
                  src={previewAttachment.data}
                  alt={previewAttachment.name}
                  style={{maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                />
              ) : previewAttachment.type === 'application/pdf' || previewAttachment.name?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewAttachment.data}
                  title={previewAttachment.name}
                  style={{width: '100%', height: '65vh', border: 'none', borderRadius: '6px'}}
                />
              ) : (
                <div style={{textAlign: 'center', padding: '30px 10px'}}>
                  <FileText size={48} style={{margin: '0 auto 12px', color: '#64748b'}} />
                  <p style={{fontSize: '14px', color: '#1e293b', marginBottom: '10px'}}>
                    مستند Word أو ملف مرفق: <b>{previewAttachment.name}</b>
                  </p>
                  <a
                    href={previewAttachment.data}
                    download={previewAttachment.name}
                    className="blue-button"
                    style={{display: 'inline-flex', alignItems: 'center', gap: '6px'}}
                  >
                    <Download size={16}/> اضغط لتحميل الملف وفتحه على جهازك
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
