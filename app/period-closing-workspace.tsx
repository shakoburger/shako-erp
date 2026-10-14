'use client';
import {AgencyLetterhead, AgencyReportFooter} from '@/components/agency-letterhead';
import {useCallback, useEffect, useState} from 'react';
import {useWorkspaceWindow, WindowControls} from '@/components/workspace-window';
import {useAgencyAccess} from '@/components/access-context';
import {ReportExports, permittedExport} from '@/components/report-export';
import {SearchablePicker} from '@/components/searchable-picker';
import {ERPIcon} from '@/components/erp-icons';
import {
  Lock, Unlock, ShieldAlert, CheckCircle2, AlertTriangle, Printer,
  RefreshCw, Calendar, TrendingUp, TrendingDown, DollarSign,
  FileText, History, HelpCircle, AlertCircle, ArrowRight
} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {money, today, type Settings} from '@/lib/domain';
import {api} from './erp-system';
import type {PeriodFinancials} from '@/lib/closing';

export function PeriodClosingWorkspace({
  settings,
  onUpdated,
  onClose
}: {
  settings: Settings;
  onUpdated?: () => void;
  onClose?: () => void;
}) {
  const w = useWorkspaceWindow();
  const access = useAgencyAccess();
  const canManage = access.modules.accounts === 'manage' || access.manageSettings;

  const currentYear = settings.financialYear || new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;

  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number | 'all'>(currentMonthNum);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ financials: PeriodFinancials; agency: any; auditHistory: any[] } | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'treasuries' | 'expenses' | 'audit'>('summary');

  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [settleConfirmOpen, setSettleConfirmOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [rollForwardConfirmOpen, setRollForwardConfirmOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const [unlockReason, setUnlockReason] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        year: String(year),
        month: String(month)
      });
      const res = await api('/api/closing?' + q.toString());
      setData(res);
    } catch (err: any) {
      toast.error(err.message || 'فشل تحميل بيانات الفترة');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (w.active) {
      loadData();
    }
  }, [loadData, w.active, w.refreshKey]);

  // Execute lock only
  async function handleLock() {
    setBusy(true);
    try {
      const res = await api('/api/closing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action: 'lock', year, month })
      });
      toast.success(res.message);
      setLockConfirmOpen(false);
      await loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Execute full settlement and close
  async function handleSettleAndClose() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await api('/api/closing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'settle_close',
          year,
          month,
          notes: settlementNotes,
          currenciesSummary: data.financials.currencies
        })
      });
      toast.success(res.message);
      setSettleConfirmOpen(false);
      await loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Execute unlock
  async function handleUnlock() {
    if (!unlockReason.trim()) {
      toast.error('يرجى ذكر سبب فك إقفال الفترة');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/api/closing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'unlock',
          reason: unlockReason
        })
      });
      toast.success(res.message);
      setUnlockModalOpen(false);
      setUnlockReason('');
      await loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Execute roll-forward (Annual)
  async function handleRollForward() {
    setBusy(true);
    try {
      const res = await api('/api/closing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ action: 'roll_forward', year })
      });
      toast.success(res.message);
      setRollForwardConfirmOpen(false);
      setYear(res.financialYear);
      await loadData();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const fin = data?.financials;
  const isPeriodLocked = !!fin?.isLocked;
  const cutoff = data?.agency?.postingLockedUntil;

  const monthOptions = [
    { value: 'all', label: 'كامل السنة المالية' },
    { value: '1', label: 'يناير (01)' },
    { value: '2', label: 'فبراير (02)' },
    { value: '3', label: 'مارس (03)' },
    { value: '4', label: 'أبريل (04)' },
    { value: '5', label: 'مايو (05)' },
    { value: '6', label: 'يونيو (06)' },
    { value: '7', label: 'يوليو (07)' },
    { value: '8', label: 'أغسطس (08)' },
    { value: '9', label: 'سبتمبر (09)' },
    { value: '10', label: 'أكتوبر (10)' },
    { value: '11', label: 'نوفمبر (11)' },
    { value: '12', label: 'ديسمبر (12)' }
  ];

  return (
    <div className="period-closing-workspace" dir="rtl" style={{padding:'20px',background:'#f8fafc',minHeight:'100%',display:'flex',flexDirection:'column',gap:'20px'}}>
      {/* Top Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'15px',background:'#fff',padding:'16px 20px',borderRadius:'12px',border:'1px solid #e2e8f0',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{width:'46px',height:'46px',borderRadius:'10px',background:'#eff6ff',color:'#2563eb',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <ERPIcon name="accounts" size={26}/>
          </div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <h1 style={{fontSize:'18px',fontWeight:700,margin:0,color:'#0f172a'}}>إقفال الفترات المحاسبية والأرباح والخسائر</h1>
              {isPeriodLocked ? (
                <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 10px',borderRadius:'20px',background:'#fee2e2',color:'#b91c1c',fontSize:'12px',fontWeight:700}}>
                  <Lock size={13}/> فترة مقفلة
                </span>
              ) : (
                <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 10px',borderRadius:'20px',background:'#dcfce7',color:'#15803d',fontSize:'12px',fontWeight:700}}>
                  <Unlock size={13}/> قيود مفتوحة
                </span>
              )}
            </div>
            <p style={{fontSize:'12px',color:'#64748b',margin:'3px 0 0'}}>
              احتساب الأرباح والخسائر، قيود التسوية، وقفل الحركات المالية لمنع التعديل إلا بصلاحية مدير
            </p>
          </div>
        </div>

        {/* Filters and Controls */}
        <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'12px',fontWeight:600,color:'#475569'}}>السنة:</span>
            <select aria-label="السنة المالية" value={year} onChange={e=>setYear(Number(e.target.value))} style={{padding:'7px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',background:'#fff',fontSize:'13px',fontWeight:600}}>
              {[2023, 2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'12px',fontWeight:600,color:'#475569'}}>الفترة:</span>
            <select aria-label="الفترة المحاسبية" value={String(month)} onChange={e=>setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{padding:'7px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',background:'#fff',fontSize:'13px',fontWeight:600}}>
              {monthOptions.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <button type="button" className="plain-button" onClick={loadData} disabled={loading} style={{padding:'8px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',display:'flex',alignItems:'center',gap:'6px'}} title="تحديث البيانات">
            <RefreshCw size={15} className={loading?'spin':''}/>
            تحديث
          </button>

          <button type="button" className="plain-button" onClick={()=>setPrintModalOpen(true)} disabled={!fin} style={{padding:'8px 14px',borderRadius:'8px',border:'1px solid #cbd5e1',background:'#fff',display:'flex',alignItems:'center',gap:'6px',fontWeight:600}}>
            <Printer size={15}/>
            محضر الإقفال
          </button>
        </div>
      </div>

      {/* Lock Cutoff Banner */}
      {cutoff && (
        <div style={{padding:'10px 16px',background:isPeriodLocked?'#fef2f2':'#f8fafc',border:`1px solid ${isPeriodLocked?'#fecaca':'#e2e8f0'}`,borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'13px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',color:isPeriodLocked?'#991b1b':'#334155'}}>
            <Lock size={16}/>
            <span>
              الحركات المالية والقيود مقفلة حتى تاريخ: <strong dir="ltr">{cutoff}</strong>. أي حركة بتاريخ سابق يمنع إضافتها أو تعديلها.
            </span>
          </div>
          {canManage && (
            <button type="button" onClick={()=>setUnlockModalOpen(true)} style={{background:'none',border:'none',color:'#2563eb',fontWeight:700,fontSize:'12px',cursor:'pointer',textDecoration:'underline'}}>
              تعديل أو فك تاريخ الإقفال (صلاحية مدير)
            </button>
          )}
        </div>
      )}

      {/* Pending Staged Ops Warning */}
      {fin && fin.unpostedStagedCount > 0 && (
        <div style={{padding:'12px 16px',background:'#fffbeb',border:'1px solid #fef3c7',borderRadius:'10px',display:'flex',alignItems:'center',gap:'10px',color:'#92400e',fontSize:'13px'}}>
          <AlertTriangle size={18} style={{color:'#d97706',flexShrink:0}}/>
          <div>
            <strong>تنبيه عمليات معلقة: </strong>
            يوجد <strong>{fin.unpostedStagedCount}</strong> عملية معلقة (تذاكر أو تحويلات) خلال هذه الفترة لم يتم ترحيلها بعد. يوصى بترحيلها أو إلغائها قبل إقفال الفترة للحصول على أرقام ختامية دقيقة.
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      {fin && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:'15px'}}>
          {/* Operations Card */}
          <div style={{background:'#fff',padding:'18px',borderRadius:'12px',border:'1px solid #e2e8f0',boxShadow:'0 1px 3px rgba(0,0,0,0.03)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'#64748b',fontSize:'13px',marginBottom:'6px'}}>
              <span>إجمالي العمليات المسجلة</span>
              <FileText size={18} style={{color:'#3b82f6'}}/>
            </div>
            <div style={{fontSize:'24px',fontWeight:700,color:'#0f172a'}}>
              {fin.totalOperations} <small style={{fontSize:'13px',fontWeight:500,color:'#64748b'}}>حركة</small>
            </div>
            <div style={{fontSize:'12px',color:'#64748b',marginTop:'6px'}}>
              خلال الفترة: <span dir="ltr">{fin.fromDate}</span> إلى <span dir="ltr">{fin.toDate}</span>
            </div>
          </div>

          {/* Primary Currency P&L Cards */}
          {(fin.currencies.length > 0 ? fin.currencies.slice(0, 3) : [{currency: settings.defaultCurrency||'USD', totalIncomeMinor: 0, totalExpensesMinor: 0, netProfitMinor: 0}]).map(c => {
            const isProfit = (c.netProfitMinor || 0) >= 0;
            return (
              <div key={c.currency} style={{background:'#fff',padding:'18px',borderRadius:'12px',border:`1px solid ${isProfit ? '#bbf7d0' : '#fecaca'}`,boxShadow:'0 1px 3px rgba(0,0,0,0.03)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'#64748b',fontSize:'13px',marginBottom:'6px'}}>
                  <span>صافي النتيجة ({c.currency})</span>
                  {isProfit ? <TrendingUp size={18} style={{color:'#16a34a'}}/> : <TrendingDown size={18} style={{color:'#dc2626'}}/>}
                </div>
                <div style={{fontSize:'22px',fontWeight:700,color:isProfit?'#15803d':'#b91c1c',direction:'ltr',textAlign:'right'}}>
                  {money(c.netProfitMinor || 0)} {c.currency}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',color:'#64748b',marginTop:'8px',borderTop:'1px dashed #e2e8f0',paddingTop:'6px'}}>
                  <span>إيرادات: <b style={{color:'#15803d'}} dir="ltr">{money(c.totalIncomeMinor || 0)}</b></span>
                  <span>مصروفات: <b style={{color:'#b91c1c'}} dir="ltr">{money(c.totalExpensesMinor || 0)}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action Bar (Closing & Locking Controls) */}
      <div style={{background:'#fff',padding:'16px 20px',borderRadius:'12px',border:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'14px',fontWeight:700,color:'#1e293b'}}>إجراءات إقفال الفترة:</span>
          <span style={{fontSize:'12px',color:'#64748b'}}>«{fin?.periodLabel}»</span>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          {/* Quick Lock Button */}
          <button type="button" className="plain-button" disabled={!canManage || isPeriodLocked} onClick={()=>setLockConfirmOpen(true)} style={{padding:'9px 16px',borderRadius:'8px',border:'1px solid #cbd5e1',background:'#fff',color:'#1e293b',fontWeight:600,display:'flex',alignItems:'center',gap:'6px'}} title="منع إضافة وتعديل الحركات حتى نهاية الفترة">
            <Lock size={16} style={{color:'#f59e0b'}}/>
            قفل الفترة فقط
          </button>

          {/* Settle & Close Button */}
          <button type="button" className="blue-button" disabled={!canManage} onClick={()=>{
            setSettlementNotes(`قيد تسوية وإقفال أرباح وخسائر ${fin?.periodLabel}`);
            setSettleConfirmOpen(true);
          }} style={{padding:'9px 18px',borderRadius:'8px',background:'#2563eb',color:'#fff',fontWeight:700,display:'flex',alignItems:'center',gap:'6px'}}>
            <CheckCircle2 size={16}/>
            إقفال مالي وترحيل قيود التسوية
          </button>

          {/* Annual Roll-Forward Button (Available when full year is selected) */}
          {month === 'all' && (
            <button type="button" className="plain-button" disabled={!canManage} onClick={()=>setRollForwardConfirmOpen(true)} style={{padding:'9px 16px',borderRadius:'8px',border:'1px solid #7c3aed',background:'#f5f3ff',color:'#6d28d9',fontWeight:700,display:'flex',alignItems:'center',gap:'6px'}}>
              <Calendar size={16}/>
              إقفال وترحيل السنة المالية
            </button>
          )}
        </div>
      </div>

      {/* Tabs Header */}
      <div style={{display:'flex',gap:'8px',borderBottom:'1px solid #e2e8f0',paddingBottom:'2px'}}>
        {[
          { key: 'summary', label: '📊 ملخص الأرباح والإيرادات بالعملات' },
          { key: 'treasuries', label: '🏦 أرصدة الخزائن والبنوك نهاية الفترة' },
          { key: 'expenses', label: '📑 تفصيل المصروفات والعمولات' },
          { key: 'audit', label: '📜 سجل عمليات الإقفال السابقة' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding:'10px 16px',
              border:'none',
              background: activeTab === tab.key ? '#fff' : 'transparent',
              color: activeTab === tab.key ? '#2563eb' : '#64748b',
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize:'13px',
              cursor:'pointer',
              borderRadius:'8px 8px 0 0',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : 'none',
              boxShadow: activeTab === tab.key ? '0 -1px 3px rgba(0,0,0,0.03)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Currencies Summary */}
      {activeTab === 'summary' && (
        <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e2e8f0',overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid #f1f5f9',fontWeight:700,fontSize:'14px',color:'#334155'}}>
            جدول إيرادات ومصروفات وصافي نتائج الفترة حسب العملة
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px',textAlign:'right'}}>
              <thead>
                <tr style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0',color:'#475569'}}>
                  <th style={{padding:'12px 16px'}}>العملة</th>
                  <th style={{padding:'12px 16px'}}>عمولات التذاكر</th>
                  <th style={{padding:'12px 16px'}}>دخل الخدمات</th>
                  <th style={{padding:'12px 16px'}}>دخل التأشيرات</th>
                  <th style={{padding:'12px 16px'}}>إجمالي الإيرادات</th>
                  <th style={{padding:'12px 16px'}}>المصروفات التشغيلية</th>
                  <th style={{padding:'12px 16px'}}>عمولات البروكرز</th>
                  <th style={{padding:'12px 16px'}}>إجمالي المصروفات</th>
                  <th style={{padding:'12px 16px',fontWeight:700}}>صافي الربح / الخسارة</th>
                </tr>
              </thead>
              <tbody>
                {fin?.currencies.map(c => {
                  const isProf = c.netProfitMinor >= 0;
                  return (
                    <tr key={c.currency} style={{borderBottom:'1px solid #f1f5f9'}}>
                      <td style={{padding:'12px 16px',fontWeight:700,color:'#0f172a'}}>{c.currency}</td>
                      <td style={{padding:'12px 16px'}} dir="ltr">{money(c.ticketIncomeMinor)} <small style={{color:'#64748b'}}>({c.ticketCount} تذكرة)</small></td>
                      <td style={{padding:'12px 16px'}} dir="ltr">{money(c.serviceIncomeMinor)} <small style={{color:'#64748b'}}>({c.serviceCount} خدمة)</small></td>
                      <td style={{padding:'12px 16px'}} dir="ltr">{money(c.visaIncomeMinor)} <small style={{color:'#64748b'}}>({c.visaCount} تأشيرة)</small></td>
                      <td style={{padding:'12px 16px',fontWeight:700,color:'#15803d'}} dir="ltr">{money(c.totalIncomeMinor)}</td>
                      <td style={{padding:'12px 16px',color:'#b91c1c'}} dir="ltr">{money(c.operatingExpensesMinor)}</td>
                      <td style={{padding:'12px 16px',color:'#b91c1c'}} dir="ltr">{money(c.brokerCommissionsMinor)}</td>
                      <td style={{padding:'12px 16px',fontWeight:700,color:'#b91c1c'}} dir="ltr">{money(c.totalExpensesMinor)}</td>
                      <td style={{padding:'12px 16px',fontWeight:800,color:isProf?'#15803d':'#b91c1c'}} dir="ltr">
                        {money(c.netProfitMinor)} {c.currency}
                      </td>
                    </tr>
                  );
                })}
                {(!fin || fin.currencies.length === 0) && (
                  <tr>
                    <td colSpan={9} style={{padding:'30px',textAlign:'center',color:'#94a3b8'}}>
                      لا توجد حركات مالية مسجلة خلال هذه الفترة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Ending Treasuries Balances */}
      {activeTab === 'treasuries' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:'15px'}}>
          {/* Cash Accounts */}
          <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e2e8f0',padding:'16px'}}>
            <h3 style={{fontSize:'14px',fontWeight:700,color:'#334155',margin:'0 0 12px',display:'flex',alignItems:'center',gap:'8px'}}>
              <ERPIcon name="cash-account" size={18}/>
              أرصدة الخزائن النقدية (نهاية {fin?.toDate})
            </h3>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead>
                <tr style={{borderBottom:'1px solid #e2e8f0',color:'#64748b',textAlign:'right'}}>
                  <th style={{padding:'8px'}}>اسم الخزينة</th>
                  <th style={{padding:'8px'}}>العملة</th>
                  <th style={{padding:'8px'}}>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {fin?.cashBalancesEnding.map(a => (
                  <tr key={a.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{padding:'8px',fontWeight:600}}>{a.name}</td>
                    <td style={{padding:'8px'}}>{a.currency}</td>
                    <td style={{padding:'8px',fontWeight:700}} dir="ltr">{money(a.balanceMinor)}</td>
                  </tr>
                ))}
                {(!fin || fin.cashBalancesEnding.length === 0) && (
                  <tr><td colSpan={3} style={{padding:'15px',textAlign:'center',color:'#94a3b8'}}>لا توجد خزائن نقدية مسجلة</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bank Accounts */}
          <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e2e8f0',padding:'16px'}}>
            <h3 style={{fontSize:'14px',fontWeight:700,color:'#334155',margin:'0 0 12px',display:'flex',alignItems:'center',gap:'8px'}}>
              <ERPIcon name="banks" size={18}/>
              أرصدة الحسابات البنكية (نهاية {fin?.toDate})
            </h3>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead>
                <tr style={{borderBottom:'1px solid #e2e8f0',color:'#64748b',textAlign:'right'}}>
                  <th style={{padding:'8px'}}>اسم الحساب البنكي</th>
                  <th style={{padding:'8px'}}>العملة</th>
                  <th style={{padding:'8px'}}>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {fin?.bankBalancesEnding.map(b => (
                  <tr key={b.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{padding:'8px',fontWeight:600}}>{b.name}</td>
                    <td style={{padding:'8px'}}>{b.currency}</td>
                    <td style={{padding:'8px',fontWeight:700}} dir="ltr">{money(b.balanceMinor)}</td>
                  </tr>
                ))}
                {(!fin || fin.bankBalancesEnding.length === 0) && (
                  <tr><td colSpan={3} style={{padding:'15px',textAlign:'center',color:'#94a3b8'}}>لا توجد حسابات بنكية مسجلة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Expense Categories */}
      {activeTab === 'expenses' && (
        <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e2e8f0',padding:'16px'}}>
          <h3 style={{fontSize:'14px',fontWeight:700,color:'#334155',margin:'0 0 14px'}}>
            بنود المصروفات المسجلة خلال الفترة
          </h3>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px',textAlign:'right'}}>
            <thead>
              <tr style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0',color:'#475569'}}>
                <th style={{padding:'10px 14px'}}>بند المصروف</th>
                <th style={{padding:'10px 14px'}}>العملة</th>
                <th style={{padding:'10px 14px'}}>المبلغ الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {fin?.expenseCategories.map(e => (
                <tr key={`${e.category}-${e.currency}`} style={{borderBottom:'1px solid #f1f5f9'}}>
                  <td style={{padding:'10px 14px',fontWeight:600}}>{e.category}</td>
                  <td style={{padding:'10px 14px'}}>{e.currency}</td>
                  <td style={{padding:'10px 14px',fontWeight:700,color:'#b91c1c'}} dir="ltr">{money(e.amountMinor)}</td>
                </tr>
              ))}
              {(!fin || fin.expenseCategories.length === 0) && (
                <tr><td colSpan={3} style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>لا توجد مصروفات مسجلة في هذه الفترة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Audit History */}
      {activeTab === 'audit' && (
        <div style={{background:'#fff',borderRadius:'12px',border:'1px solid #e2e8f0',padding:'16px'}}>
          <h3 style={{fontSize:'14px',fontWeight:700,color:'#334155',margin:'0 0 14px',display:'flex',alignItems:'center',gap:'8px'}}>
            <History size={18}/>
            سجل عمليات إقفال وتعديل الفترات المحاسبية
          </h3>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px',textAlign:'right'}}>
            <thead>
              <tr style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0',color:'#475569'}}>
                <th style={{padding:'10px 14px'}}>الوقت والتاريخ</th>
                <th style={{padding:'10px 14px'}}>المستخدم</th>
                <th style={{padding:'10px 14px'}}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {data?.auditHistory.map((a, idx) => (
                <tr key={idx} style={{borderBottom:'1px solid #f1f5f9'}}>
                  <td style={{padding:'10px 14px'}} dir="ltr">{a.created_at ? new Date(a.created_at).toLocaleString('ar-EG') : '—'}</td>
                  <td style={{padding:'10px 14px',fontWeight:600}}>{a.actor}</td>
                  <td style={{padding:'10px 14px',color:'#1e293b'}}>{a.action}</td>
                </tr>
              ))}
              {(!data || data.auditHistory.length === 0) && (
                <tr><td colSpan={3} style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>لا توجد سجلات إقفال سابقة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Lock Only Confirm Dialog */}
      <Dialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <DialogContent dir="rtl" style={{maxWidth:'450px'}}>
          <DialogTitle>تأكيد قفل الفترة المحاسبية</DialogTitle>
          <DialogDescription>
            سيتم قفل جميع الحركات والقيود حتى تاريخ <strong>{fin?.toDate}</strong>.
            لن يتمكن المحاسبون من إضافة أو تعديل أي حركة بتاريخ سابق.
          </DialogDescription>
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',marginTop:'20px'}}>
            <button type="button" className="plain-button" onClick={()=>setLockConfirmOpen(false)}>إلغاء</button>
            <button type="button" className="blue-button" disabled={busy} onClick={handleLock}>
              {busy ? 'جارٍ القفل…' : 'تأكيد قفل الفترة'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settle & Close Confirm Dialog */}
      <Dialog open={settleConfirmOpen} onOpenChange={setSettleConfirmOpen}>
        <DialogContent dir="rtl" style={{maxWidth:'520px'}}>
          <DialogTitle>تأكيد الإقفال المالي وترحيل قيود التسوية</DialogTitle>
          <DialogDescription>
            سيقوم النظام بإصدار قيد تسوية ختامي لصافي الأرباح والخسائر عن فترة <strong>{fin?.periodLabel}</strong>، وقفل الفترة حتى تاريخ <strong>{fin?.toDate}</strong>.
          </DialogDescription>
          <div style={{margin:'15px 0'}}>
            <label style={{display:'block',fontSize:'13px',fontWeight:600,marginBottom:'6px'}}>
              ملاحظات أو بيان قيد الإقفال:
            </label>
            <textarea
              aria-label="ملاحظات قيد الإقفال"
              value={settlementNotes}
              onChange={e=>setSettlementNotes(e.target.value)}
              style={{width:'100%',padding:'8px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',minHeight:'70px',fontSize:'13px'}}
            />
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}>
            <button type="button" className="plain-button" onClick={()=>setSettleConfirmOpen(false)}>إلغاء</button>
            <button type="button" className="blue-button" disabled={busy} onClick={handleSettleAndClose} style={{background:'#15803d'}}>
              {busy ? 'جارٍ الترحيل…' : 'تأكيد الإقفال وترحيل القيد'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unlock / Override Modal */}
      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent dir="rtl" style={{maxWidth:'480px'}}>
          <DialogTitle>فك إقفال الفترة المحاسبية (صلاحية مدير)</DialogTitle>
          <DialogDescription>
            يتطلب فك إقفال الفترة أو تعديل تاريخ القفل ذكر سبب التعديل لتوثيقه في سجل الرقابة المالي (Audit Log).
          </DialogDescription>
          <div style={{margin:'15px 0'}}>
            <label style={{display:'block',fontSize:'13px',fontWeight:600,marginBottom:'6px'}}>
              سبب فتح الفترة المحاسبية:
            </label>
            <textarea
              aria-label="سبب فتح الفترة المحاسبية"
              placeholder="مثال: تعديل قيد تسوية بتوجيه من الإدارة المالية..."
              value={unlockReason}
              onChange={e=>setUnlockReason(e.target.value)}
              style={{width:'100%',padding:'8px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',minHeight:'80px',fontSize:'13px'}}
            />
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}>
            <button type="button" className="plain-button" onClick={()=>setUnlockModalOpen(false)}>إلغاء</button>
            <button type="button" className="danger-button" disabled={busy} onClick={handleUnlock} style={{background:'#dc2626',color:'#fff',padding:'8px 16px',borderRadius:'8px',fontWeight:600}}>
              {busy ? 'جارٍ الفتح…' : 'تأكيد فك الإقفال'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Annual Roll-Forward Confirm Dialog */}
      <Dialog open={rollForwardConfirmOpen} onOpenChange={setRollForwardConfirmOpen}>
        <DialogContent dir="rtl" style={{maxWidth:'500px'}}>
          <DialogTitle>تأكيد ترحيل وإقفال السنة المالية {year}</DialogTitle>
          <DialogDescription>
            سيتم قفل جميع حركات عام {year} حتى تاريخ {year}-12-31، وترحيل السنة المالية الرسمية للوكالة إلى عام <strong>{year + 1}</strong>.
          </DialogDescription>
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',marginTop:'20px'}}>
            <button type="button" className="plain-button" onClick={()=>setRollForwardConfirmOpen(false)}>إلغاء</button>
            <button type="button" className="blue-button" disabled={busy} onClick={handleRollForward} style={{background:'#7c3aed'}}>
              {busy ? 'جارٍ الترحيل…' : `ترحيل وإقفال عام ${year}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Printable Closing Statement Modal */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent dir="rtl" className="printable-dialog" style={{maxWidth:'850px',maxHeight:'90vh',overflowY:'auto',background:'#fff',padding:'30px'}}>
          <div className="printable-content" style={{fontFamily:'Cairo, sans-serif'}}>
            <AgencyLetterhead />
            <div style={{textAlign:'center',margin:'20px 0',borderBottom:'2px solid #0f172a',paddingBottom:'10px'}}>
              <h2 style={{fontSize:'20px',fontWeight:800,margin:0,color:'#0f172a'}}>محضر إقفال الفترة المالية والأرباح والخسائر</h2>
              <p style={{fontSize:'13px',color:'#475569',margin:'5px 0 0'}}>
                عن فترة: <strong>{fin?.periodLabel}</strong> (من <span dir="ltr">{fin?.fromDate}</span> إلى <span dir="ltr">{fin?.toDate}</span>)
              </p>
            </div>

            {/* Summary Table */}
            <div style={{marginBottom:'20px'}}>
              <h4 style={{fontSize:'14px',fontWeight:700,marginBottom:'8px',color:'#1e293b'}}>أولاً: ملخص الإيرادات والمصروفات وصافي النتيجة:</h4>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px',border:'1px solid #cbd5e1',textAlign:'right'}}>
                <thead>
                  <tr style={{background:'#f1f5f9',borderBottom:'1px solid #cbd5e1'}}>
                    <th style={{padding:'8px',border:'1px solid #cbd5e1'}}>العملة</th>
                    <th style={{padding:'8px',border:'1px solid #cbd5e1'}}>إجمالي الإيرادات</th>
                    <th style={{padding:'8px',border:'1px solid #cbd5e1'}}>المصروفات التشغيلية</th>
                    <th style={{padding:'8px',border:'1px solid #cbd5e1'}}>عمولات البروكرز</th>
                    <th style={{padding:'8px',border:'1px solid #cbd5e1'}}>إجمالي المصروفات</th>
                    <th style={{padding:'8px',border:'1px solid #cbd5e1',fontWeight:700}}>صافي الأرباح / (الخسائر)</th>
                  </tr>
                </thead>
                <tbody>
                  {fin?.currencies.map(c => (
                    <tr key={c.currency} style={{borderBottom:'1px solid #cbd5e1'}}>
                      <td style={{padding:'8px',border:'1px solid #cbd5e1',fontWeight:700}}>{c.currency}</td>
                      <td style={{padding:'8px',border:'1px solid #cbd5e1'}} dir="ltr">{money(c.totalIncomeMinor)}</td>
                      <td style={{padding:'8px',border:'1px solid #cbd5e1'}} dir="ltr">{money(c.operatingExpensesMinor)}</td>
                      <td style={{padding:'8px',border:'1px solid #cbd5e1'}} dir="ltr">{money(c.brokerCommissionsMinor)}</td>
                      <td style={{padding:'8px',border:'1px solid #cbd5e1'}} dir="ltr">{money(c.totalExpensesMinor)}</td>
                      <td style={{padding:'8px',border:'1px solid #cbd5e1',fontWeight:800}} dir="ltr">
                        {money(c.netProfitMinor)} {c.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Treasuries Table */}
            <div style={{marginBottom:'25px'}}>
              <h4 style={{fontSize:'14px',fontWeight:700,marginBottom:'8px',color:'#1e293b'}}>ثانياً: أرصدة الخزائن والبنوك عند نهاية الفترة:</h4>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'15px'}}>
                <div>
                  <h5 style={{fontSize:'12px',fontWeight:600,margin:'0 0 4px'}}>الخزائن النقدية:</h5>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px',border:'1px solid #cbd5e1'}}>
                    <tbody>
                      {fin?.cashBalancesEnding.map(a => (
                        <tr key={a.id} style={{borderBottom:'1px solid #cbd5e1'}}>
                          <td style={{padding:'6px',border:'1px solid #cbd5e1'}}>{a.name}</td>
                          <td style={{padding:'6px',border:'1px solid #cbd5e1'}} dir="ltr">{money(a.balanceMinor)} {a.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h5 style={{fontSize:'12px',fontWeight:600,margin:'0 0 4px'}}>الحسابات البنكية:</h5>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px',border:'1px solid #cbd5e1'}}>
                    <tbody>
                      {fin?.bankBalancesEnding.map(b => (
                        <tr key={b.id} style={{borderBottom:'1px solid #cbd5e1'}}>
                          <td style={{padding:'6px',border:'1px solid #cbd5e1'}}>{b.name}</td>
                          <td style={{padding:'6px',border:'1px solid #cbd5e1'}} dir="ltr">{money(b.balanceMinor)} {b.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Official Signatures */}
            <div style={{marginTop:'40px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'20px',textAlign:'center',paddingTop:'20px',borderTop:'1px solid #cbd5e1'}}>
              <div>
                <p style={{fontSize:'13px',fontWeight:700,margin:'0 0 40px'}}>المحاسب المسؤول</p>
                <div style={{borderBottom:'1px dashed #94a3b8',margin:'0 20px'}}></div>
              </div>
              <div>
                <p style={{fontSize:'13px',fontWeight:700,margin:'0 0 40px'}}>المراجع الداخلي</p>
                <div style={{borderBottom:'1px dashed #94a3b8',margin:'0 20px'}}></div>
              </div>
              <div>
                <p style={{fontSize:'13px',fontWeight:700,margin:'0 0 40px'}}>المدير العام / المفوض</p>
                <div style={{borderBottom:'1px dashed #94a3b8',margin:'0 20px'}}></div>
              </div>
            </div>

            <AgencyReportFooter />
          </div>

          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',marginTop:'20px'}} className="no-print">
            <button type="button" className="plain-button" onClick={()=>setPrintModalOpen(false)}>إغلاق</button>
            <button type="button" className="blue-button" onClick={()=>window.print()} style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <Printer size={16}/>
              طباعة المحضر (A4)
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
