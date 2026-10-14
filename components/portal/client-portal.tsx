'use client';
import {useState, useEffect, useCallback} from 'react';
import {ERPIcon} from '@/components/erp-icons';
import {money, today} from '@/lib/domain';
import {getWhatsAppUrl} from '@/lib/whatsapp';
import {toast, Toaster} from 'sonner';
import {
  FileText,
  Ticket,
  Send,
  Plus,
  Printer,
  Download,
  Calendar,
  CreditCard,
  Building2,
  Phone,
  LogOut,
  Search,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  MessageCircle,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  Plane
} from 'lucide-react';

type CustomerProfile = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  creditLimit?: number;
};

type BalanceItem = {
  currency: string;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
  isDebit: boolean;
};

type AgencyInfo = {
  name: string;
  phones?: string;
  address?: string;
  email?: string;
  logoKey?: string | null;
  defaultCurrency?: string;
};

type TicketItem = {
  id: string;
  code: string;
  passengerName: string;
  date: string;
  currency: string;
  totalAmount: number;
  receiptNumber?: string;
  pnr?: string;
  airline?: string;
  route?: string;
  class?: string;
  status: string;
  passengers?: {name: string; ticketNo: string}[];
};

type StatementEntry = {
  id: string;
  date: string;
  description: string;
  reference?: string;
  debitMinor: number;
  creditMinor: number;
  movementMinor: number;
  balanceMinor: number;
  opening?: boolean;
};

export function ClientPortal() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  
  // Auth Form State
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'statement' | 'tickets' | 'booking' | 'payment' | 'contact'>('statement');

  // Statement Filters & State
  const [stmtFrom, setStmtFrom] = useState(today().slice(0, 8) + '01');
  const [stmtTo, setStmtTo] = useState(today());
  const [stmtCurrency, setStmtCurrency] = useState('');
  const [stmtAll, setStmtAll] = useState(false);
  const [statementData, setStatementData] = useState<{
    openingMinor: number;
    closingMinor: number;
    debitMinor: number;
    creditMinor: number;
    entries: StatementEntry[];
  } | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);

  // Tickets State
  const [ticketsList, setTicketsList] = useState<TicketItem[]>([]);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicketVoucher, setSelectedTicketVoucher] = useState<TicketItem | null>(null);

  // Booking Request Form State
  const [bookingForm, setBookingForm] = useState({
    passengerName: '',
    route: '',
    flightDate: today(),
    airline: '',
    notes: '',
    attachment: null as any
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Payment Request Form State
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    currency: 'USD',
    bankName: '',
    bankTxId: '',
    notes: '',
    attachment: null as any
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Check initial session
  const checkSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch('/api/portal/me');
      if (res.ok) {
        const data: any = await res.json();
        setCustomer(data.customer);
        setAgency(data.agency);
        setBalances(data.balances || []);
        if (data.balances?.length > 0 && !stmtCurrency) {
          setStmtCurrency(data.balances[0].currency);
        } else if (data.agency?.defaultCurrency && !stmtCurrency) {
          setStmtCurrency(data.agency.defaultCurrency);
        }
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    } finally {
      setSessionLoading(false);
    }
  }, [stmtCurrency]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Handle Login
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !code) {
      toast.error('يرجى كتابة رقم الهاتف ورمز الدخول');
      return;
    }
    setLoginBusy(true);
    try {
      const res = await fetch('/api/portal/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ phone, code })
      });
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول');
      }
      toast.success(`مرحباً بك، ${data.customer.name}`);
      await checkSession();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoginBusy(false);
    }
  }

  // Handle Logout
  async function handleLogout() {
    try {
      await fetch('/api/portal/auth', { method: 'DELETE' });
      setCustomer(null);
      setStatementData(null);
      setTicketsList([]);
      toast.info('تم تسجيل الخروج بنجاح');
    } catch {
      setCustomer(null);
    }
  }

  // Load Statement
  const loadStatement = useCallback(async () => {
    if (!customer) return;
    setStmtLoading(true);
    try {
      const cur = stmtCurrency || balances[0]?.currency || agency?.defaultCurrency || 'USD';
      const q = new URLSearchParams({
        from: stmtFrom,
        to: stmtTo,
        currency: cur,
        all: String(stmtAll)
      });
      const res = await fetch('/api/portal/statement?' + q.toString());
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل كشف الحساب');
      setStatementData(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setStmtLoading(false);
    }
  }, [customer, stmtCurrency, stmtFrom, stmtTo, stmtAll, balances, agency]);

  // Load Tickets
  const loadTickets = useCallback(async () => {
    if (!customer) return;
    setTicketsLoading(true);
    try {
      const res = await fetch('/api/portal/tickets');
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل التذاكر');
      setTicketsList(data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTicketsLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    if (customer) {
      if (activeTab === 'statement') loadStatement();
      if (activeTab === 'tickets') loadTickets();
    }
  }, [customer, activeTab, loadStatement, loadTickets]);

  // File Upload Handlers
  function handleFileAttachment(file: File, callback: (att: any) => void) {
    const reader = new FileReader();
    reader.onload = () => {
      callback({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: reader.result as string
      });
      toast.success(`تم إرفاق الملف: ${file.name}`);
    };
    reader.onerror = () => toast.error('فشل قراءة الملف المرفق');
    reader.readAsDataURL(file);
  }

  // Submit Booking Request
  async function submitBookingRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!bookingForm.passengerName || !bookingForm.route) {
      toast.error('يرجى إدخال اسم المسافر وخط السير');
      return;
    }
    setBookingSubmitting(true);
    try {
      const res = await fetch('/api/portal/requests', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          type: 'ticket-new',
          ...bookingForm
        })
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إرسال الطلب');
      toast.success(data.message || 'تم إرسال طلب الحجز بنجاح!');
      setBookingForm({
        passengerName: '',
        route: '',
        flightDate: today(),
        airline: '',
        notes: '',
        attachment: null
      });
      setActiveTab('tickets');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBookingSubmitting(false);
    }
  }

  // Submit Payment Receipt
  async function submitPaymentRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      toast.error('يرجى إدخال مبلغ التحويل');
      return;
    }
    setPaymentSubmitting(true);
    try {
      const res = await fetch('/api/portal/requests', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          type: 'cash-receipt',
          ...paymentForm
        })
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إرسال الإشعار');
      toast.success(data.message || 'تم إرسال إشعار السداد بنجاح!');
      setPaymentForm({
        amount: '',
        currency: 'USD',
        bankName: '',
        bankTxId: '',
        notes: '',
        attachment: null
      });
      setActiveTab('statement');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPaymentSubmitting(false);
    }
  }

  if (sessionLoading) {
    return (
      <div style={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'inherit'}} dir="rtl">
        <div style={{textAlign: 'center', color: '#0f766e'}}>
          <ERPIcon name="gds-tickets" size={48}/>
          <p style={{marginTop: '12px', fontWeight: 600}}>جارٍ تحميل بوابة العملاء…</p>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!customer) {
    return (
      <div style={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #0f766e 100%)', padding: '20px', fontFamily: 'inherit'}} dir="rtl">
        <Toaster position="top-center" richColors dir="rtl"/>
        <div style={{maxWidth: '440px', width: '100%', background: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', padding: '36px 32px', textAlign: 'center'}}>
          <div style={{display: 'inline-flex', padding: '14px', background: '#f0fdf4', borderRadius: '50%', color: '#0f766e', marginBottom: '16px'}}>
            <Building2 size={36}/>
          </div>
          <h1 style={{fontSize: '22px', fontWeight: 800, color: '#0f172a', marginBottom: '6px'}}>بوابة الشركات والعملاء</h1>
          <p style={{fontSize: '13px', color: '#64748b', marginBottom: '28px'}}>متابعة كشف الحساب، طباعة التذاكر والإيصالات، وتقديم طلبات الحجز والسداد</p>

          <form onSubmit={handleLogin} style={{display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'right'}}>
            <div>
              <label style={{display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px'}}>رقم الهاتف أو كود العميل المسجل لدى الوكالة</label>
              <div style={{position: 'relative'}}>
                <input
                  type="text"
                  dir="ltr"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="رقم الهاتف (مثال: 01556949413) أو كود العميل"
                  required
                  style={{width: '100%', padding: '12px 14px 12px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none'}}
                />
                <Phone size={18} style={{position: 'absolute', left: '12px', top: '13px', color: '#94a3b8'}}/>
              </div>
            </div>

            <div>
              <label style={{display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px'}}>رمز الدخول (PIN)</label>
              <div style={{position: 'relative'}}>
                <input
                  type="password"
                  dir="ltr"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="••••"
                  required
                  style={{width: '100%', padding: '12px 14px 12px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', letterSpacing: '3px'}}
                />
                <Lock size={18} style={{position: 'absolute', left: '12px', top: '13px', color: '#94a3b8'}}/>
              </div>
              <small style={{display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '4px'}}>
                💡 الرمز الافتراضي هو آخر 4 أرقام من هاتفك (أو 1234 أو الرمز المخصص المسلّم لك من الوكالة)
              </small>
            </div>

            <button
              type="submit"
              disabled={loginBusy}
              style={{
                marginTop: '10px',
                padding: '13px',
                borderRadius: '8px',
                background: '#0f766e',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '15px',
                border: 'none',
                cursor: loginBusy ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {loginBusy ? 'جارٍ التحقق…' : 'تسجيل الدخول إلى حسابي'}
            </button>
          </form>

          <div style={{marginTop: '28px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', fontSize: '12px', color: '#64748b'}}>
            <span>نسيت رمز الدخول أو ترغب في فتح حساب لشركتك؟</span>
            <div style={{marginTop: '6px'}}>
              <a
                href={agency?.phones ? getWhatsAppUrl(agency.phones, 'مرحباً، أود الحصول على رمز الدخول لبوابة العملاء الخاصة بشركتي.') : '#'}
                target="_blank"
                rel="noreferrer"
                style={{color: '#15803d', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none'}}
              >
                <MessageCircle size={15}/> تواصل معنا عبر WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AUTHENTICATED PORTAL VIEW
  const primaryBal = balances.find(b => b.currency === (stmtCurrency || balances[0]?.currency)) || balances[0];

  return (
    <div style={{minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: 'inherit'}} dir="rtl">
      <Toaster position="top-center" richColors dir="rtl"/>

      {/* Top Navbar */}
      <header style={{background: '#ffffff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 30}}>
        <div style={{maxWidth: '1200px', margin: '0 auto', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            <div style={{background: '#0f766e', color: '#ffffff', padding: '8px', borderRadius: '10px', display: 'flex'}}>
              <Building2 size={24}/>
            </div>
            <div>
              <div style={{fontSize: '16px', fontWeight: 800, color: '#0f172a'}}>{agency?.name || 'وكالة السفر'}</div>
              <div style={{fontSize: '12px', color: '#64748b'}}>بوابة العملاء والشركات</div>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
            <div style={{textAlign: 'left'}}>
              <span style={{display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a'}}>{customer.name}</span>
              <span style={{display: 'block', fontSize: '11px', color: '#64748b'}} dir="ltr">{customer.phone}</span>
            </div>
            <button
              onClick={handleLogout}
              style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#ffffff', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer'}}
              title="تسجيل الخروج"
            >
              <LogOut size={15}/> خروج
            </button>
          </div>
        </div>
      </header>

      {/* Hero KPI Summary */}
      <div style={{background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)', color: '#ffffff', padding: '28px 20px 40px'}}>
        <div style={{maxWidth: '1200px', margin: '0 auto'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px'}}>
            <div>
              <h2 style={{fontSize: '20px', fontWeight: 800, margin: 0}}>مرحباً بك، {customer.name}</h2>
              <p style={{fontSize: '13px', opacity: 0.9, marginTop: '4px', margin: 0}}>موجز الأرصدة والحد الائتماني المعتمد لحسابك</p>
            </div>
            <div style={{display: 'flex', gap: '8px'}}>
              <button
                onClick={() => setActiveTab('booking')}
                style={{padding: '8px 14px', borderRadius: '8px', background: '#ffffff', color: '#0f766e', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}
              >
                <Plane size={16}/> طلب حجز جديد
              </button>
              <button
                onClick={() => setActiveTab('payment')}
                style={{padding: '8px 14px', borderRadius: '8px', background: '#22c55e', color: '#ffffff', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}
              >
                <ArrowDownLeft size={16}/> إشعار تحويل / سداد
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px'}}>
            {balances.map(b => (
              <div key={b.currency} style={{background: 'rgba(255, 255, 255, 0.12)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.2)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                  <span style={{fontSize: '12px', opacity: 0.85}}>رصيد {b.currency}</span>
                  <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: b.balanceMinor > 0 ? '#fef2f2' : b.balanceMinor < 0 ? '#f0fdf4' : '#f8fafc', color: b.balanceMinor > 0 ? '#b91c1c' : b.balanceMinor < 0 ? '#15803d' : '#475569', fontWeight: 700}}>
                    {b.balanceMinor > 0 ? 'مستحق عليك' : b.balanceMinor < 0 ? 'رصيد لصالحك' : 'متزن'}
                  </span>
                </div>
                <div style={{fontSize: '22px', fontWeight: 800}} dir="ltr">
                  {money(Math.abs(b.balanceMinor))} {b.currency}
                </div>
              </div>
            ))}

            {customer.creditLimit ? (
              <div style={{background: 'rgba(255, 255, 255, 0.12)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.2)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                  <span style={{fontSize: '12px', opacity: 0.85}}>سقف الحساب المعتمد</span>
                  <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700}}>ائتمان</span>
                </div>
                <div style={{fontSize: '22px', fontWeight: 800}} dir="ltr">
                  {Number(customer.creditLimit).toLocaleString()}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{maxWidth: '1200px', margin: '-20px auto 0', padding: '0 20px'}}>
        <div style={{background: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', padding: '6px', display: 'flex', gap: '6px', overflowX: 'auto', border: '1px solid #e2e8f0'}}>
          {[
            {id: 'statement', label: 'كشف الحساب المالي', icon: FileText},
            {id: 'tickets', label: 'التذاكر والحجوزات', icon: Ticket},
            {id: 'booking', label: 'طلب حجز جديد', icon: Plane},
            {id: 'payment', label: 'إشعار تحويل بنكي', icon: ArrowDownLeft},
            {id: 'contact', label: 'بيانات الوكالة والتواصل', icon: Phone}
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: active ? '#0f766e' : 'transparent',
                  color: active ? '#ffffff' : '#64748b',
                  fontWeight: active ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={16}/> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents */}
      <main style={{maxWidth: '1200px', margin: '20px auto', padding: '0 20px 40px'}}>
        {/* TAB 1: STATEMENT */}
        {activeTab === 'statement' && (
          <div style={{background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px'}}>
              <h3 style={{fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>
                <FileText size={20} color="#0f766e"/> كشف الحساب المالي المفصل
              </h3>
              <div style={{display: 'flex', gap: '8px'}}>
                <button
                  onClick={() => window.print()}
                  style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#1e293b', fontSize: '13px', fontWeight: 600, cursor: 'pointer'}}
                >
                  <Printer size={16}/> طباعة / PDF
                </button>
                {agency?.phones && (
                  <a
                    href={getWhatsAppUrl(agency.phones, `مرحباً، أود مراجعة كشف حسابي (${customer.name}) للفترة من ${stmtFrom} إلى ${stmtTo}.`)}
                    target="_blank"
                    rel="noreferrer"
                    style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', fontSize: '13px', fontWeight: 600, textDecoration: 'none'}}
                  >
                    <MessageCircle size={16}/> استفسار WhatsApp
                  </a>
                )}
              </div>
            </div>

            {/* Filter Toolbar */}
            <div style={{background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '20px'}}>
              <div>
                <label style={{display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px'}}>العملة</label>
                <select
                  value={stmtCurrency}
                  onChange={e => setStmtCurrency(e.target.value)}
                  style={{padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff'}}
                >
                  {balances.map(b => (
                    <option key={b.currency} value={b.currency}>{b.currency}</option>
                  ))}
                  {!balances.length && <option value="USD">USD</option>}
                </select>
              </div>

              <div>
                <label style={{display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px'}}>من تاريخ</label>
                <input
                  type="date"
                  value={stmtFrom}
                  disabled={stmtAll}
                  onChange={e => setStmtFrom(e.target.value)}
                  style={{padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: stmtAll ? '#e2e8f0' : '#ffffff'}}
                />
              </div>

              <div>
                <label style={{display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px'}}>إلى تاريخ</label>
                <input
                  type="date"
                  value={stmtTo}
                  onChange={e => setStmtTo(e.target.value)}
                  style={{padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#ffffff'}}
                />
              </div>

              <div style={{marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer'}}>
                  <input type="checkbox" checked={stmtAll} onChange={e => setStmtAll(e.target.checked)}/>
                  <span>كل الفترات</span>
                </label>
              </div>

              <button
                onClick={loadStatement}
                disabled={stmtLoading}
                style={{marginTop: '16px', padding: '7px 16px', borderRadius: '6px', background: '#0f766e', color: '#ffffff', fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer'}}
              >
                {stmtLoading ? 'جارٍ التحديث…' : 'تحديث الكشف'}
              </button>
            </div>

            {/* Statement Table */}
            {stmtLoading ? (
              <div style={{padding: '40px', textAlign: 'center', color: '#64748b'}}>جارٍ جلب البيانات…</div>
            ) : statementData ? (
              <div>
                {/* Summary bar */}
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '16px'}}>
                  <div>
                    <span style={{fontSize: '12px', color: '#166534'}}>الرصيد الافتتاحي:</span>
                    <b style={{display: 'block', fontSize: '16px', color: '#15803d'}} dir="ltr">{money(statementData.openingMinor)} {stmtCurrency}</b>
                  </div>
                  <div>
                    <span style={{fontSize: '12px', color: '#166534'}}>إجمالي المطالبات (مدين):</span>
                    <b style={{display: 'block', fontSize: '16px', color: '#0f766e'}} dir="ltr">{money(statementData.debitMinor)} {stmtCurrency}</b>
                  </div>
                  <div>
                    <span style={{fontSize: '12px', color: '#166534'}}>إجمالي السدادات (دائن):</span>
                    <b style={{display: 'block', fontSize: '16px', color: '#2563eb'}} dir="ltr">{money(statementData.creditMinor)} {stmtCurrency}</b>
                  </div>
                  <div>
                    <span style={{fontSize: '12px', color: '#166534'}}>الرصيد الختامي:</span>
                    <b style={{display: 'block', fontSize: '18px', color: statementData.closingMinor > 0 ? '#b91c1c' : '#15803d'}} dir="ltr">
                      {money(statementData.closingMinor)} {stmtCurrency}
                    </b>
                  </div>
                </div>

                <div style={{overflowX: 'auto'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px'}}>
                    <thead>
                      <tr style={{background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569'}}>
                        <th style={{padding: '10px 12px'}}>التاريخ</th>
                        <th style={{padding: '10px 12px'}}>البيان</th>
                        <th style={{padding: '10px 12px'}}>رقم المرجع / الإيصال</th>
                        <th style={{padding: '10px 12px', textAlign: 'left'}}>مدين</th>
                        <th style={{padding: '10px 12px', textAlign: 'left'}}>دائن</th>
                        <th style={{padding: '10px 12px', textAlign: 'left'}}>الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.entries.map((e, idx) => (
                        <tr key={idx} style={{borderBottom: '1px solid #e2e8f0', background: e.opening ? '#fafaf9' : 'transparent'}}>
                          <td style={{padding: '10px 12px'}} dir="ltr">{e.date}</td>
                          <td style={{padding: '10px 12px', fontWeight: e.opening ? 700 : 400}}>{e.description}</td>
                          <td style={{padding: '10px 12px', color: '#64748b'}} dir="ltr">{e.reference || '—'}</td>
                          <td style={{padding: '10px 12px', textAlign: 'left', color: e.debitMinor > 0 ? '#b91c1c' : '#94a3b8'}} dir="ltr">
                            {e.debitMinor > 0 ? money(e.debitMinor) : '—'}
                          </td>
                          <td style={{padding: '10px 12px', textAlign: 'left', color: e.creditMinor > 0 ? '#15803d' : '#94a3b8'}} dir="ltr">
                            {e.creditMinor > 0 ? money(e.creditMinor) : '—'}
                          </td>
                          <td style={{padding: '10px 12px', textAlign: 'left', fontWeight: 700}} dir="ltr">
                            {money(e.balanceMinor)}
                          </td>
                        </tr>
                      ))}
                      {!statementData.entries.length && (
                        <tr>
                          <td colSpan={6} style={{padding: '30px', textAlign: 'center', color: '#94a3b8'}}>
                            لا توجد حركات مالية مسجلة خلال الفترة المحددة.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 2: TICKETS */}
        {activeTab === 'tickets' && (
          <div style={{background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px'}}>
              <h3 style={{fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>
                <Ticket size={20} color="#0f766e"/> تذاكر الطيران والحجوزات الصادرة
              </h3>
              <div style={{position: 'relative', width: '280px'}}>
                <input
                  type="text"
                  placeholder="بحث برقم التذكرة أو المسافر…"
                  value={ticketSearch}
                  onChange={e => setTicketSearch(e.target.value)}
                  style={{width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px'}}
                />
                <Search size={16} style={{position: 'absolute', left: '10px', top: '10px', color: '#94a3b8'}}/>
              </div>
            </div>

            {ticketsLoading ? (
              <div style={{padding: '40px', textAlign: 'center', color: '#64748b'}}>جارٍ جلب التذاكر…</div>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px'}}>
                {ticketsList
                  .filter(t => {
                    if (!ticketSearch.trim()) return true;
                    const q = ticketSearch.toLowerCase();
                    return t.code.toLowerCase().includes(q) || t.passengerName.toLowerCase().includes(q) || (t.route && t.route.toLowerCase().includes(q));
                  })
                  .map(t => (
                    <div key={t.id} style={{border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', background: '#fafaf9', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                      <div>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px'}}>
                          <div>
                            <span style={{fontSize: '11px', color: '#64748b'}}>رقم التذكرة:</span>
                            <b style={{display: 'block', fontSize: '15px', color: '#0f766e'}} dir="ltr">{t.code}</b>
                          </div>
                          <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: t.status === 'active' ? '#dcfce7' : '#fee2e2', color: t.status === 'active' ? '#166534' : '#b91c1c', fontWeight: 600}}>
                            {t.status === 'active' ? 'نشطة' : t.status === 'refunded' ? 'مستردة' : 'ملغاة'}
                          </span>
                        </div>

                        <div style={{fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '6px'}}>
                          👤 {t.passengerName}
                        </div>

                        {t.route && (
                          <div style={{fontSize: '12px', color: '#475569', marginBottom: '4px'}}>
                            🗺️ <b>خط السير:</b> {t.route}
                          </div>
                        )}

                        {t.airline && (
                          <div style={{fontSize: '12px', color: '#475569', marginBottom: '4px'}}>
                            🛫 <b>الخطوط:</b> {t.airline}
                          </div>
                        )}

                        <div style={{fontSize: '12px', color: '#64748b', marginBottom: '10px'}}>
                          📅 <b>التاريخ:</b> <span dir="ltr">{t.date}</span>
                          {t.receiptNumber && <span> · إيصال رقم <b>{t.receiptNumber}</b></span>}
                        </div>
                      </div>

                      <div style={{borderTop: '1px dashed #cbd5e1', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                          <span style={{fontSize: '11px', color: '#64748b'}}>القيمة: </span>
                          <b style={{fontSize: '16px', color: '#0f766e'}} dir="ltr">{money(t.totalAmount * 100)} {t.currency}</b>
                        </div>
                        <button
                          onClick={() => setSelectedTicketVoucher(t)}
                          style={{display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f766e', fontSize: '12px', fontWeight: 600, cursor: 'pointer'}}
                        >
                          <Printer size={14}/> طباعة الإيصال
                        </button>
                      </div>
                    </div>
                  ))}

                {!ticketsList.length && (
                  <div style={{gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94a3b8'}}>
                    لا توجد تذاكر صادرة لحسابك حتى الآن.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: NEW BOOKING REQUEST */}
        {activeTab === 'booking' && (
          <div style={{maxWidth: '680px', margin: '0 auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '28px'}}>
            <h3 style={{fontSize: '18px', fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f766e'}}>
              <Plane size={22}/> تقديم طلب حجز تذكرة جديد
            </h3>
            <p style={{fontSize: '13px', color: '#64748b', marginBottom: '24px'}}>
              سيتم إرسال الطلب مباشرة إلى فريق الحجوزات بالوكالة ومراجعته وإدراجه في جدول المعلقات لإصداره.
            </p>

            <form onSubmit={submitBookingRequest} style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>اسم المسافر (كما في الجواز) *</label>
                <input
                  type="text"
                  value={bookingForm.passengerName}
                  onChange={e => setBookingForm({...bookingForm, passengerName: e.target.value})}
                  placeholder="MR / MRS FIRSTNAME LASTNAME"
                  required
                  style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                />
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <div>
                  <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>خط السير المطلوب *</label>
                  <input
                    type="text"
                    value={bookingForm.route}
                    onChange={e => setBookingForm({...bookingForm, route: e.target.value})}
                    placeholder="مثال: الخرطوم – القاهرة – الخرطوم"
                    required
                    style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>تاريخ السفر المفضل *</label>
                  <input
                    type="date"
                    value={bookingForm.flightDate}
                    onChange={e => setBookingForm({...bookingForm, flightDate: e.target.value})}
                    required
                    style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                  />
                </div>
              </div>

              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>شركة الطيران المفضلة (اختياري)</label>
                <input
                  type="text"
                  value={bookingForm.airline}
                  onChange={e => setBookingForm({...bookingForm, airline: e.target.value})}
                  placeholder="مثال: مصر للطيران / تاركو / بدر / الخطوط السعودية"
                  style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                />
              </div>

              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>إرفاق صورة الجواز أو التأشيرة (اختياري)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileAttachment(f, att => setBookingForm({...bookingForm, attachment: att}));
                  }}
                  style={{fontSize: '13px'}}
                />
                {bookingForm.attachment && (
                  <span style={{display: 'block', fontSize: '12px', color: '#15803d', marginTop: '4px'}}>
                    ✓ تم إرفاق: {bookingForm.attachment.name}
                  </span>
                )}
              </div>

              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>ملاحظات إضافية</label>
                <textarea
                  rows={3}
                  value={bookingForm.notes}
                  onChange={e => setBookingForm({...bookingForm, notes: e.target.value})}
                  placeholder="أي متطلبات خاصة (وزن إضافي، وجبة، مقعد، درجة رجال أعمال...)"
                  style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                />
              </div>

              <button
                type="submit"
                disabled={bookingSubmitting}
                style={{padding: '12px', borderRadius: '8px', background: '#0f766e', color: '#ffffff', fontWeight: 700, fontSize: '14px', border: 'none', cursor: bookingSubmitting ? 'not-allowed' : 'pointer'}}
              >
                {bookingSubmitting ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الحجز للوكالة ✈️'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: PAYMENT NOTIFICATION */}
        {activeTab === 'payment' && (
          <div style={{maxWidth: '680px', margin: '0 auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '28px'}}>
            <h3 style={{fontSize: '18px', fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534'}}>
              <ArrowDownLeft size={22}/> إشعار تحويل بنكي / شحن رصيد
            </h3>
            <p style={{fontSize: '13px', color: '#64748b', marginBottom: '24px'}}>
              عند قيامك بتحويل بنكي أو سداد نقدي، أرفق صورة الإشعار هنا ليقوم المحاسب بمطابقته وقيده في حسابك فوراً.
            </p>

            <form onSubmit={submitPaymentRequest} style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px'}}>
                <div>
                  <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>المبلغ المحول *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
                    placeholder="0.00"
                    required
                    style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>العملة *</label>
                  <select
                    value={paymentForm.currency}
                    onChange={e => setPaymentForm({...paymentForm, currency: e.target.value})}
                    style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#ffffff'}}
                  >
                    {balances.map(b => (
                      <option key={b.currency} value={b.currency}>{b.currency}</option>
                    ))}
                    {!balances.length && <option value="USD">USD</option>}
                    <option value="SDG">SDG</option>
                    <option value="EGP">EGP</option>
                    <option value="SAR">SAR</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <div>
                  <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>البنك المحول إليه</label>
                  <input
                    type="text"
                    value={paymentForm.bankName}
                    onChange={e => setPaymentForm({...paymentForm, bankName: e.target.value})}
                    placeholder="مثال: بنك الخرطوم (بنكك) / الأهلي / الراجحي"
                    style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>رقم الإشعار / المعاملة</label>
                  <input
                    type="text"
                    value={paymentForm.bankTxId}
                    onChange={e => setPaymentForm({...paymentForm, bankTxId: e.target.value})}
                    placeholder="رقم المرجع البنكي"
                    style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                  />
                </div>
              </div>

              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>إرفاق صورة إشعار التحويل البنكي (مستحسن) 📎</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileAttachment(f, att => setPaymentForm({...paymentForm, attachment: att}));
                  }}
                  style={{fontSize: '13px'}}
                />
                {paymentForm.attachment && (
                  <span style={{display: 'block', fontSize: '12px', color: '#15803d', marginTop: '4px'}}>
                    ✓ تم إرفاق: {paymentForm.attachment.name}
                  </span>
                )}
              </div>

              <div>
                <label style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px'}}>ملاحظات أو بيان</label>
                <textarea
                  rows={2}
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder="سداد دفعة من الحساب..."
                  style={{width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px'}}
                />
              </div>

              <button
                type="submit"
                disabled={paymentSubmitting}
                style={{padding: '12px', borderRadius: '8px', background: '#16a34a', color: '#ffffff', fontWeight: 700, fontSize: '14px', border: 'none', cursor: paymentSubmitting ? 'not-allowed' : 'pointer'}}
              >
                {paymentSubmitting ? 'جارٍ الإرسال…' : 'إرسال إشعار السداد 💰'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: CONTACT & SUPPORT */}
        {activeTab === 'contact' && (
          <div style={{maxWidth: '680px', margin: '0 auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '28px'}}>
            <h3 style={{fontSize: '18px', fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f766e'}}>
              <Building2 size={22}/> بيانات الوكالة والتواصل المباشر
            </h3>

            <div style={{display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px'}}>
                <Building2 size={20} color="#0f766e"/>
                <div>
                  <span style={{fontSize: '12px', color: '#64748b'}}>اسم الوكالة:</span>
                  <div style={{fontWeight: 700, color: '#0f172a'}}>{agency?.name || 'وكالة السفر والسياحة'}</div>
                </div>
              </div>

              {agency?.phones && (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                    <Phone size={20} color="#15803d"/>
                    <div>
                      <span style={{fontSize: '12px', color: '#166534'}}>أرقام التواصل:</span>
                      <div style={{fontWeight: 700, color: '#15803d'}} dir="ltr">{agency.phones}</div>
                    </div>
                  </div>
                  <a
                    href={getWhatsAppUrl(agency.phones, `مرحباً، استفسار بخصوص حساب ${customer.name}.`)}
                    target="_blank"
                    rel="noreferrer"
                    style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: '#22c55e', color: '#ffffff', fontWeight: 700, fontSize: '13px', textDecoration: 'none'}}
                  >
                    <MessageCircle size={16}/> محادثة WhatsApp
                  </a>
                </div>
              )}

              {agency?.address && (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px'}}>
                  <div style={{color: '#0f766e'}}>📍</div>
                  <div>
                    <span style={{fontSize: '12px', color: '#64748b'}}>العنوان:</span>
                    <div style={{fontWeight: 600, color: '#334155'}}>{agency.address}</div>
                  </div>
                </div>
              )}

              {agency?.email && (
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px'}}>
                  <div style={{color: '#0f766e'}}>✉️</div>
                  <div>
                    <span style={{fontSize: '12px', color: '#64748b'}}>البريد الإلكتروني:</span>
                    <div style={{fontWeight: 600, color: '#334155'}} dir="ltr">{agency.email}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Ticket Voucher Modal */}
      {selectedTicketVoucher && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}} onClick={() => setSelectedTicketVoucher(null)}>
          <div style={{background: '#ffffff', borderRadius: '12px', padding: '28px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f766e', paddingBottom: '12px', marginBottom: '16px'}}>
              <div>
                <h3 style={{fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f766e'}}>إيصال حجز تذكرة طيران</h3>
                <span style={{fontSize: '12px', color: '#64748b'}}>{agency?.name}</span>
              </div>
              <button onClick={() => window.print()} style={{display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', fontSize: '12px', fontWeight: 600}}>
                <Printer size={14}/> طباعة
              </button>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', marginBottom: '16px'}}>
              <div><span style={{color: '#64748b'}}>رقم التذكرة:</span> <b dir="ltr" style={{color: '#0f766e'}}>{selectedTicketVoucher.code}</b></div>
              {selectedTicketVoucher.pnr && <div><span style={{color: '#64748b'}}>رمز الحجز (PNR):</span> <b dir="ltr">{selectedTicketVoucher.pnr}</b></div>}
              <div><span style={{color: '#64748b'}}>المسافر:</span> <b>{selectedTicketVoucher.passengerName}</b></div>
              <div><span style={{color: '#64748b'}}>تاريخ الإصدار:</span> <span dir="ltr">{selectedTicketVoucher.date}</span></div>
              {selectedTicketVoucher.airline && <div><span style={{color: '#64748b'}}>شركة الطيران:</span> <b>{selectedTicketVoucher.airline}</b></div>}
              {selectedTicketVoucher.route && <div><span style={{color: '#64748b'}}>خط السير:</span> <b>{selectedTicketVoucher.route}</b></div>}
              <div><span style={{color: '#64748b'}}>القيمة الإجمالية:</span> <b dir="ltr" style={{fontSize: '15px', color: '#15803d'}}>{money(selectedTicketVoucher.totalAmount * 100)} {selectedTicketVoucher.currency}</b></div>
              {selectedTicketVoucher.receiptNumber && <div><span style={{color: '#64748b'}}>رقم الإيصال:</span> <b>{selectedTicketVoucher.receiptNumber}</b></div>}
            </div>

            <div style={{borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end'}}>
              <button
                onClick={() => setSelectedTicketVoucher(null)}
                style={{padding: '8px 18px', borderRadius: '6px', background: '#e2e8f0', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer'}}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientPortal;
