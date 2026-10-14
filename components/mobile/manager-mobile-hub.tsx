'use client';
import {useState, useEffect, useCallback} from 'react';
import {ERPIcon} from '@/components/erp-icons';
import {WhatsAppDialog} from '@/components/whatsapp-dialog';
import {buildTicketWhatsAppMessage, buildStatementWhatsAppMessage, openWhatsAppDirect} from '@/lib/whatsapp';
import {getAgencyBranches, getBranchName, type Branch} from '@/lib/branches';
import {money, today, type Settings} from '@/lib/domain';
import {
  Smartphone, Building2, TrendingUp, DollarSign, Search,
  CheckCircle2, XCircle, Clock, Send, RefreshCw, Lock, Unlock,
  Calendar, Layers, ShieldCheck, ChevronRight, ArrowLeft,
  FileText, ExternalLink, UserCheck
} from 'lucide-react';
import {toast} from 'sonner';

export function ManagerMobileHub() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'home' | 'staged' | 'search' | 'closing'>('home');

  const [balances, setBalances] = useState<any[]>([]);
  const [stagedOps, setStagedOps] = useState<any[]>([]);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [whatsAppModal, setWhatsAppModal] = useState<{title: string; name: string; phone: string; message: string} | null>(null);
  const [busyOpId, setBusyOpId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bootRes, balRes, stagedRes, ticketsRes, custRes]: any[] = await Promise.all([
        fetch('/api/bootstrap').then(r => r.json()).catch(() => ({})),
        fetch('/api/balances').then(r => r.json()).catch(() => ({ balances: [] })),
        fetch('/api/records?kind=staged-op').then(r => r.json()).catch(() => []),
        fetch('/api/records?kind=ticket').then(r => r.json()).catch(() => []),
        fetch('/api/records?kind=customer').then(r => r.json()).catch(() => [])
      ]);

      if (bootRes?.settings) {
        setSettings(bootRes.settings);
        setBranches(getAgencyBranches(bootRes.settings));
      }
      setBalances(balRes?.balances || []);
      setStagedOps(Array.isArray(stagedRes) ? stagedRes.filter((o: any) => o.payload?.status === 'pending' || !o.payload?.status) : []);
      setRecentTickets(Array.isArray(ticketsRes) ? ticketsRes.slice(0, 15) : []);
      setCustomers(Array.isArray(custRes) ? custRes : []);
    } catch {
      toast.error('فشل تحديث بيانات الهاتف');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Search tickets & customers
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const matchedTickets = recentTickets.filter(t =>
      (t.name + ' ' + t.code + ' ' + (t.payload?.customerName || '') + ' ' + (t.payload?.receiptNumber || '')).toLowerCase().includes(q)
    );
    const matchedCusts = customers.filter(c =>
      (c.name + ' ' + (c.payload?.phone || '')).toLowerCase().includes(q)
    );
    setSearchResults([
      ...matchedTickets.map(t => ({ ...t, _type: 'ticket' })),
      ...matchedCusts.map(c => ({ ...c, _type: 'customer' }))
    ]);
  }, [searchQuery, recentTickets, customers]);

  // Quick Approve / Dismiss staged operation
  async function handleDismissStaged(opId: string) {
    setBusyOpId(opId);
    try {
      const op = stagedOps.find(o => o.id === opId);
      if (!op) return;
      await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...op,
          amount: 0,
          payload: { ...op.payload, status: 'voided' }
        })
      });
      toast.info('تم استبعاد العملية المعلقة');
      setStagedOps(prev => prev.filter(o => o.id !== opId));
    } catch (err: any) {
      toast.error(err.message || 'فشل الاستبعاد');
    } finally {
      setBusyOpId(null);
    }
  }

  // Calculate Cash & Bank Totals
  const cashAccounts = balances.filter(b => b.kind === 'cash-account');
  const bankAccounts = balances.filter(b => b.kind === 'bank-account');

  const defaultCurr = settings?.defaultCurrency || 'USD';
  const cutoff = settings?.postingLockedUntil;

  return (
    <div className="manager-mobile-hub" dir="rtl" style={{maxWidth:'500px',margin:'0 auto',minHeight:'100vh',background:'#0f172a',color:'#f8fafc',display:'flex',flexDirection:'column',fontFamily:'Cairo, sans-serif'}}>
      {/* Top Mobile App Header */}
      <header style={{padding:'14px 16px',background:'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',borderBottom:'1px solid #334155',position:'sticky',top:0,zIndex:30}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{width:'38px',height:'38px',borderRadius:'10px',background:'#2563eb',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(37,99,235,0.4)'}}>
              <Smartphone size={20} style={{color:'#fff'}}/>
            </div>
            <div>
              <h1 style={{fontSize:'15px',fontWeight:800,margin:0,color:'#fff'}}>
                {settings?.systemName || 'SHAKO'} <span style={{fontSize:'11px',fontWeight:600,color:'#38bdf8',background:'rgba(56,189,248,0.15)',padding:'2px 6px',borderRadius:'6px'}}>MOBILE HUB</span>
              </h1>
              <p style={{fontSize:'11px',color:'#94a3b8',margin:'2px 0 0'}}>
                إدارة الوكالة والتنقل للمدير
              </p>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',color:'#fff',padding:'6px 10px',borderRadius:'8px',cursor:'pointer'}}
              title="تحديث البيانات"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''}/>
            </button>
            <a
              href="/"
              style={{background:'#2563eb',color:'#fff',padding:'6px 10px',borderRadius:'8px',fontSize:'11px',fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',gap:'4px'}}
            >
              <ExternalLink size={13}/>
              الكمبيوتر
            </a>
          </div>
        </div>

        {/* Branch Selector Bar */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'12px',padding:'8px 12px',background:'rgba(255,255,255,0.05)',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',color:'#cbd5e1'}}>
            <Building2 size={15} style={{color:'#38bdf8'}}/>
            <span>الفرع:</span>
            <strong style={{color:'#fff'}}>{getBranchName(branches, selectedBranch)}</strong>
          </div>
          {branches.length > 1 && (
            <select
              aria-label="تحديد الفرع"
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              style={{background:'#1e293b',color:'#fff',border:'1px solid #475569',borderRadius:'6px',fontSize:'11px',padding:'4px 8px'}}
            >
              <option value="all">جميع الفروع</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Main Mobile Body Content */}
      <main style={{flex:1,padding:'16px',display:'flex',flexDirection:'column',gap:'16px',overflowY:'auto'}}>
        {/* Tab 1: Home Dashboard */}
        {activeTab === 'home' && (
          <>
            {/* Period Lock Status Pill */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:cutoff ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',border:`1px solid ${cutoff ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,padding:'8px 12px',borderRadius:'10px',fontSize:'12px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',color:cutoff ? '#fca5a5' : '#86efac'}}>
                {cutoff ? <Lock size={15}/> : <Unlock size={15}/>}
                <span>
                  {cutoff ? `القيود مقفلة حتى: ${cutoff}` : 'القيود مفتوحة للفترة الحالية'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('closing')}
                style={{background:'none',border:'none',color:'#38bdf8',fontSize:'11px',fontWeight:700,cursor:'pointer'}}
              >
                إدارة الإقفال ←
              </button>
            </div>

            {/* Quick KPI Carousel / Cards */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              {/* Cash Balances */}
              <div style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'12px',padding:'14px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'#94a3b8',fontSize:'11px',marginBottom:'4px'}}>
                  <span>الخزائن النقدية</span>
                  <ERPIcon name="cash-account" size={16}/>
                </div>
                <div style={{fontSize:'18px',fontWeight:800,color:'#fff'}} dir="ltr">
                  {cashAccounts.length > 0 ? money(cashAccounts[0].balanceMinor) : '0.00'}
                  <small style={{fontSize:'11px',marginRight:'4px',color:'#38bdf8'}}>{cashAccounts[0]?.currency || defaultCurr}</small>
                </div>
                <div style={{fontSize:'10px',color:'#64748b',marginTop:'4px'}}>
                  {cashAccounts.length} خزينة نقدية مسجلة
                </div>
              </div>

              {/* Bank Balances */}
              <div style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'12px',padding:'14px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'#94a3b8',fontSize:'11px',marginBottom:'4px'}}>
                  <span>أرصدة البنوك</span>
                  <ERPIcon name="banks" size={16}/>
                </div>
                <div style={{fontSize:'18px',fontWeight:800,color:'#fff'}} dir="ltr">
                  {bankAccounts.length > 0 ? money(bankAccounts[0].balanceMinor) : '0.00'}
                  <small style={{fontSize:'11px',marginRight:'4px',color:'#10b981'}}>{bankAccounts[0]?.currency || defaultCurr}</small>
                </div>
                <div style={{fontSize:'10px',color:'#64748b',marginTop:'4px'}}>
                  {bankAccounts.length} حساب بنكي نشط
                </div>
              </div>
            </div>

            {/* Staged Operations Action Card */}
            {stagedOps.length > 0 && (
              <div style={{background:'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.1) 100%)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:'12px',padding:'14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'6px',color:'#fbbf24',fontSize:'13px',fontWeight:700}}>
                    <Layers size={16}/>
                    <span>العمليات المعلقة ({stagedOps.length})</span>
                  </div>
                  <p style={{fontSize:'11px',color:'#cbd5e1',margin:'4px 0 0'}}>
                    تذاكر وإشعارات تحويل واردة بانتظار الاعتماد.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('staged')}
                  style={{background:'#f59e0b',color:'#000',fontWeight:700,border:'none',padding:'8px 14px',borderRadius:'8px',fontSize:'12px',cursor:'pointer'}}
                >
                  استعراض
                </button>
              </div>
            )}

            {/* Quick Actions Grid */}
            <div style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'12px',padding:'14px'}}>
              <h2 style={{fontSize:'13px',fontWeight:700,color:'#cbd5e1',margin:'0 0 10px'}}>
                ⚡ إجراءات سريعة
              </h2>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <button
                  type="button"
                  onClick={() => setActiveTab('search')}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'12px',color:'#fff',display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',cursor:'pointer'}}
                >
                  <Search size={20} style={{color:'#38bdf8'}}/>
                  <span style={{fontSize:'12px',fontWeight:600}}>بحث عن تذكرة</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (customers.length > 0) {
                      const c = customers[0];
                      const msg = `مرحباً بك عزيزنا ${c.name}، نود تذكيركم بمتابعة كشف حسابكم عبر بوابة الخدمات الذاتية: ${window.location.origin}/portal`;
                      openWhatsAppDirect(c.payload?.phone || '', msg);
                    } else {
                      toast.info('لا يوجد عملاء مسجلون');
                    }
                  }}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'12px',color:'#fff',display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',cursor:'pointer'}}
                >
                  <ERPIcon name="whatsapp" size={20}/>
                  <span style={{fontSize:'12px',fontWeight:600}}>واتساب عميل</span>
                </button>
              </div>
            </div>

            {/* Recent Tickets List */}
            <div style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'12px',padding:'14px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                <h2 style={{fontSize:'13px',fontWeight:700,color:'#cbd5e1',margin:0}}>
                  🎫 أحدث التذاكر الصادرة
                </h2>
                <span style={{fontSize:'11px',color:'#64748b'}}>اليوم وأمس</span>
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {recentTickets.slice(0, 5).map(t => (
                  <div key={t.id} style={{padding:'10px',background:'rgba(255,255,255,0.03)',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontSize:'13px',fontWeight:700,color:'#fff'}}>{t.name}</div>
                      <div style={{fontSize:'11px',color:'#94a3b8'}}>
                        {t.code} · {t.payload?.customerName}
                      </div>
                    </div>
                    <div style={{textAlign:'left'}}>
                      <div style={{fontSize:'13px',fontWeight:700,color:'#38bdf8'}} dir="ltr">
                        {money(t.amount)} {t.currency}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const p = t.payload || {};
                          const cust = customers.find(c => c.id === p.customerId);
                          const phone = cust?.payload?.phone || p.phone || '';
                          const msg = buildTicketWhatsAppMessage({
                            ticketCode: t.code,
                            passengerName: t.name,
                            customerName: p.customerName,
                            airline: p.airline,
                            route: p.route,
                            flightDate: t.date,
                            totalAmount: t.amount / 100,
                            currency: t.currency,
                            receiptNumber: p.receiptNumber,
                            settings: (settings || undefined) as any
                          });
                          setWhatsAppModal({
                            title: 'إرسال إيصال التذكرة عبر WhatsApp',
                            name: p.customerName || t.name,
                            phone,
                            message: msg
                          });
                        }}
                        style={{background:'none',border:'none',color:'#22c55e',fontSize:'11px',cursor:'pointer',fontWeight:600,padding:0,marginTop:'2px'}}
                      >
                        إرسال واتساب 📲
                      </button>
                    </div>
                  </div>
                ))}
                {recentTickets.length === 0 && (
                  <div style={{padding:'20px',textAlign:'center',color:'#64748b',fontSize:'12px'}}>
                    لا توجد تذاكر مسجلة حديثاً
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Staged Operations Review */}
        {activeTab === 'staged' && (
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{fontSize:'14px',fontWeight:700,margin:0,color:'#fff'}}>
                العمليات المعلقة بانتظار الاعتماد ({stagedOps.length})
              </h2>
              <button type="button" onClick={() => setActiveTab('home')} style={{background:'none',border:'none',color:'#38bdf8',fontSize:'12px',cursor:'pointer'}}>
                العودة ←
              </button>
            </div>

            {stagedOps.map(op => {
              const p = op.payload || {};
              const isTkt = p.type === 'ticket-new';
              return (
                <div key={op.id} style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'12px',padding:'14px',display:'flex',flexDirection:'column',gap:'8px'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'12px',background:isTkt?'#0284c7':'#16a34a',color:'#fff',fontWeight:700}}>
                      {isTkt ? 'طلب حجز تذكرة' : 'إشعار سداد بنكي'}
                    </span>
                    <span style={{fontSize:'11px',color:'#94a3b8'}} dir="ltr">{op.date}</span>
                  </div>

                  <div style={{fontSize:'14px',fontWeight:700,color:'#fff'}}>
                    {op.name || p.customerName || p.person || 'عميل'}
                  </div>

                  <div style={{fontSize:'12px',color:'#cbd5e1'}}>
                    {isTkt ? (
                      <>الخطوط: <strong>{p.airline || 'غير محدد'}</strong> · خط السير: <strong>{p.route || 'غير محدد'}</strong></>
                    ) : (
                      <>البنك: <strong>{p.bankName || 'تحويل بنكي'}</strong> · مرجع: <strong>{p.bankTxId || '—'}</strong></>
                    )}
                  </div>

                  {op.amount > 0 && (
                    <div style={{fontSize:'15px',fontWeight:800,color:'#38bdf8'}} dir="ltr">
                      {money(op.amount)} {op.currency}
                    </div>
                  )}

                  {p.notes && (
                    <div style={{fontSize:'11px',color:'#94a3b8',background:'rgba(255,255,255,0.03)',padding:'6px 8px',borderRadius:'6px'}}>
                      {p.notes}
                    </div>
                  )}

                  <div style={{display:'flex',gap:'8px',marginTop:'6px'}}>
                    <button
                      type="button"
                      disabled={busyOpId === op.id}
                      onClick={() => handleDismissStaged(op.id)}
                      style={{flex:1,padding:'8px',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',color:'#fca5a5',borderRadius:'8px',fontSize:'12px',fontWeight:700,cursor:'pointer'}}
                    >
                      استبعاد
                    </button>
                    <a
                      href={`/?section=staged-ops`}
                      style={{flex:1,padding:'8px',background:'#2563eb',color:'#fff',borderRadius:'8px',fontSize:'12px',fontWeight:700,textAlign:'center',textDecoration:'none'}}
                    >
                      ترحيل واعتماد ⚡
                    </a>
                  </div>
                </div>
              );
            })}

            {stagedOps.length === 0 && (
              <div style={{padding:'40px',textAlign:'center',color:'#94a3b8',background:'#1e293b',borderRadius:'12px'}}>
                <CheckCircle2 size={32} style={{color:'#22c55e',marginBottom:'8px'}}/>
                <p style={{margin:0,fontSize:'13px'}}>رائع! لا توجد عمليات معلقة حالياً.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Search View */}
        {activeTab === 'search' && (
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <input
                type="text"
                aria-label="بحث سريع"
                placeholder="ابحث برقم التذكرة أو اسم المسافر أو العميل..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                style={{flex:1,padding:'10px 14px',borderRadius:'10px',background:'#1e293b',border:'1px solid #475569',color:'#fff',fontSize:'13px'}}
              />
              <button type="button" onClick={() => setActiveTab('home')} style={{background:'none',border:'none',color:'#38bdf8',fontSize:'12px',cursor:'pointer'}}>
                إلغاء
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {searchResults.map((r, idx) => (
                <div key={idx} style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'10px',padding:'12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <span style={{fontSize:'10px',padding:'2px 6px',borderRadius:'4px',background:r._type==='ticket'?'#0284c7':'#15803d',color:'#fff',fontWeight:700}}>
                      {r._type === 'ticket' ? 'تذكرة' : 'عميل'}
                    </span>
                    <div style={{fontSize:'13px',fontWeight:700,color:'#fff',marginTop:'4px'}}>{r.name}</div>
                    <div style={{fontSize:'11px',color:'#94a3b8'}}>{r.code || r.payload?.phone || '—'}</div>
                  </div>
                  {r._type === 'ticket' && (
                    <div style={{textAlign:'left'}}>
                      <div style={{fontSize:'13px',fontWeight:700,color:'#38bdf8'}} dir="ltr">
                        {money(r.amount)} {r.currency}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {searchQuery && searchResults.length === 0 && (
                <div style={{padding:'30px',textAlign:'center',color:'#94a3b8',fontSize:'12px'}}>
                  لا توجد نتائج مطابقة لبحثك
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Period Closing Quick View */}
        {activeTab === 'closing' && (
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2 style={{fontSize:'14px',fontWeight:700,margin:0,color:'#fff'}}>
                إقفال الفترات المحاسبية والأرباح
              </h2>
              <button type="button" onClick={() => setActiveTab('home')} style={{background:'none',border:'none',color:'#38bdf8',fontSize:'12px',cursor:'pointer'}}>
                العودة ←
              </button>
            </div>

            <div style={{background:'#1e293b',border:'1px solid #334155',borderRadius:'12px',padding:'16px'}}>
              <div style={{fontSize:'13px',fontWeight:700,color:'#cbd5e1',marginBottom:'8px'}}>
                حالة قفل الحركات المالية:
              </div>
              <p style={{fontSize:'12px',color:'#94a3b8',lineHeight:'1.6',margin:'0 0 14px'}}>
                {cutoff ? (
                  <>النظام مقفل حتى <strong style={{color:'#ef4444'}} dir="ltr">{cutoff}</strong>. أي حركة بتاريخ سابق محظورة لمنع التلاعب في الأرصدة.</>
                ) : (
                  <>جميع الحركات مفتوحة ولا يوجد تاريخ قفل ساري حالياً.</>
                )}
              </p>
              <a
                href="/?section=period-closing"
                style={{display:'block',width:'100%',padding:'10px',background:'#2563eb',color:'#fff',textAlign:'center',borderRadius:'8px',fontSize:'13px',fontWeight:700,textDecoration:'none'}}
              >
                فتح شاشة الإقفال الكاملة 🔒
              </a>
            </div>
          </div>
        )}
      </main>

      {/* WhatsApp Dialog Helper */}
      {whatsAppModal && (
        <WhatsAppDialog
          open={!!whatsAppModal}
          onOpenChange={v => !v && setWhatsAppModal(null)}
          title={whatsAppModal.title}
          recipientName={whatsAppModal.name}
          initialPhone={whatsAppModal.phone}
          initialMessage={whatsAppModal.message}
        />
      )}

      {/* Bottom Sticky Mobile Navigation Bar */}
      <nav style={{padding:'8px 12px',background:'#1e293b',borderTop:'1px solid #334155',display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:'4px',position:'sticky',bottom:0,zIndex:30}}>
        {[
          { key: 'home', label: 'الرئيسية', icon: Smartphone },
          { key: 'staged', label: 'المعلقة', icon: Layers, badge: stagedOps.length },
          { key: 'search', label: 'بحث', icon: Search },
          { key: 'closing', label: 'الإقفال', icon: Lock }
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key as any)}
              style={{
                background:'none',
                border:'none',
                color: isActive ? '#38bdf8' : '#94a3b8',
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                gap:'4px',
                padding:'6px 2px',
                cursor:'pointer',
                position:'relative'
              }}
            >
              <Icon size={18}/>
              <span style={{fontSize:'11px',fontWeight:isActive?700:500}}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span style={{position:'absolute',top:'2px',right:'calc(50% - 16px)',width:'16px',height:'16px',borderRadius:'50%',background:'#ef4444',color:'#fff',fontSize:'10px',fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
export default ManagerMobileHub;
