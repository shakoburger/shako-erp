'use client';
import {useEffect,useState} from 'react';
import {Building2,ShieldCheck,Plus,RefreshCw,Download,Settings,Archive,ExternalLink,KeyRound,Copy,Check,CheckCircle2,Clock,Crown,Power,DollarSign,Eye} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Toaster,toast} from 'sonner';
import {api,download} from './erp-system';
import {moduleLabels,defaults,today,getEndOfMonth,getEndOfNextMonth,money} from '@/lib/domain';
import {currencyDefaults} from '@/lib/cash';

const states:any={active:'مفعلة',suspended:'موقوفة',archived:'مؤرشفة'},payments:any={paid:'مسدد',partial:'مسدد جزئيًا',unpaid:'غير مسدد'};

const fresh=()=>({
  name:'',
  state:'suspended',
  paymentStatus:'unpaid',
  fee:0,
  currency:'USD',
  paidOn:'',
  dueOn:'',
  notes:'',
  adminEmail:'',
  adminName:'',
  temporaryPassword:'',
  forcePasswordChange:true,
  enabledCurrencies:['USD'],
  defaultCurrency:'USD',
  modules:Object.fromEntries(Object.keys(moduleLabels).map(k=>[k,true])),
  ownerBackupAllowed:true
});

export function PlatformPanel(){
  const [data,setData]=useState<any>(null),
        [error,setError]=useState(''),
        [busy,setBusy]=useState(false),
        [draft,setDraft]=useState<any>(null),
        [query,setQuery]=useState(''),
        [filter,setFilter]=useState('all'),
        [copiedPass,setCopiedPass]=useState(false);

  async function load(){
    try{
      const b=await api('/api/platform');
      setData(b);
      setError('');
    }catch(e:any){
      setError(e.message);
    }
  }

  useEffect(()=>{load()},[]);

  async function save(e:any){
    e.preventDefault();
    setBusy(true);
    try{
      const values={
        name:draft.name,
        state:draft.state,
        paymentStatus:draft.paymentStatus,
        fee:Number(draft.fee),
        currency:draft.currency,
        paidOn:draft.paidOn,
        dueOn:draft.dueOn,
        notes:draft.notes,
        modules:draft.modules||defaults.modules
      };

      if(draft.id){
        await api('/api/platform',{
          method:'PUT',
          body:JSON.stringify({
            ...values,
            id:draft.id,
            revision:draft.revision,
            adminEmail:draft.adminEmail||undefined,
            adminName:draft.adminName||undefined,
            resetPassword:draft.resetPassword||undefined,
            forcePasswordChange:draft.forcePasswordChange,
            ownerBackupAllowed:draft.ownerBackupAllowed
          })
        });
        toast.success(draft.resetPassword?'تم حفظ إعدادات الوكالة وتعيين كلمة مرور المدير بنجاح':'تم حفظ الوكالة والاشتراك بنجاح');
      }else{
        await api('/api/platform',{
          method:'POST',
          body:JSON.stringify({
            ...values,
            adminEmail:draft.adminEmail,
            adminName:draft.adminName,
            temporaryPassword:draft.temporaryPassword,
            forcePasswordChange:draft.forcePasswordChange,
            enabledCurrencies:draft.enabledCurrencies,
            defaultCurrency:draft.defaultCurrency
          })
        });
        toast.success('تم إنشاء الوكالة وتسجيل المدير بنجاح');
      }

      setDraft(null);
      await load();
    }catch(e:any){
      toast.error(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function quickActivate(a:any){
    setBusy(true);
    try{
      await api('/api/platform',{
        method:'PUT',
        body:JSON.stringify({
          id:a.id,
          revision:a.revision,
          name:a.name,
          state:'active',
          paymentStatus:'paid',
          fee:a.fee_minor/100,
          currency:a.currency,
          paidOn:today(),
          dueOn:getEndOfNextMonth(today()),
          notes:a.notes||'',
          modules:a.modules||defaults.modules,
          ownerBackupAllowed:a.backupAllowed
        })
      });
      toast.success('تم تفعيل وكالة «'+a.name+'» بنجاح وتمديد الاستحقاق لنهاية الشهر القادم');
      await load();
    }catch(e:any){
      toast.error(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function openAgency(a:any){
    setBusy(true);
    try{
      await api('/api/agencies',{method:'POST',body:JSON.stringify({agencyId:a.id})});
      window.location.assign('/?preview=agency');
    }catch(e:any){
      toast.error(e.message);
      setBusy(false);
    }
  }

  async function backup(a:any){
    setBusy(true);
    try{
      const b=await api('/api/platform?backup='+encodeURIComponent(a.id));
      download(JSON.stringify(b,null,2),a.name+'-backup-'+new Date().toISOString().slice(0,10)+'.json');
      toast.success('تم تنزيل نسخة بيانات الوكالة وشعارها بنجاح');
    }catch(e:any){
      toast.error(e.message);
    }finally{
      setBusy(false);
    }
  }

  const edit=(a:any)=>setDraft({
    ...a,
    adminEmail:a.admin_email||a.adminEmail||'',
    adminName:'',
    resetPassword:'',
    forcePasswordChange:true,
    ownerBackupAllowed:a.backupAllowed!==false,
    paymentStatus:a.payment_status,
    fee:a.fee_minor/100,
    paidOn:a.paid_on,
    dueOn:a.due_on,
    modules:{
      stagedOps:true,
      ...(a.modules||defaults.modules)
    }
  });

  const openQuickPassword=(a:any)=>{
    edit(a);
    setTimeout(()=>{
      setDraft((d:any)=>d?{...d,resetPassword:'Shako@2026',forcePasswordChange:true}:d);
    },10);
  };

  function copyPassword(text:string){
    if(!text)return;
    navigator.clipboard?.writeText(text);
    setCopiedPass(true);
    toast.info('تم نسخ كلمة المرور للحافظة');
    setTimeout(()=>setCopiedPass(false),2000);
  }

  async function handleLogout(){
    try{
      await fetch('/api/auth/logout',{method:'POST'});
    }catch{}
    window.location.assign('/login');
  }

  if(error)return (
    <main className="platform-shell" dir="rtl">
      <Toaster richColors/>
      <section className="settings-card" style={{maxWidth:'550px',margin:'80px auto',textAlign:'center',padding:'36px'}}>
        <ShieldCheck size={48} color="#dc2626" style={{margin:'0 auto 16px'}}/>
        <h1 style={{fontSize:'22px',fontWeight:800,marginBottom:'8px'}}>لوحة مالك المنصة المركزية</h1>
        <p role="alert" style={{color:'#64748b',lineHeight:1.7,marginBottom:'24px'}}>{error}</p>
        <div style={{display:'flex',justifyContent:'center',gap:'10px'}}>
          <button className="blue-button" onClick={load}>إعادة المحاولة</button>
          <a href="/" className="plain-button">العودة للوكالة</a>
          <button className="plain-button" onClick={handleLogout}>تسجيل الخروج</button>
        </div>
      </section>
    </main>
  );

  if(!data)return <main className="platform-shell" dir="rtl"><p className="empty-row">جارٍ تحميل منصة المالك والوكالات…</p></main>;

  const agencies=data.agencies.filter((a:any)=>
    (a.name+' '+(a.admin_email||a.adminEmail||'')).toLowerCase().includes(query.toLowerCase())&&
    (filter==='all'||filter==='overdue'&&a.overdue||a.state===filter||a.payment_status===filter)
  );

  const activeAgencies = data.agencies.filter((a:any)=>a.state==='active');
  const totalUSD = activeAgencies.reduce((acc:number,a:any)=>acc+(a.currency==='USD'?(a.fee_minor||0)/100:0),0);
  const totalEGP = activeAgencies.reduce((acc:number,a:any)=>acc+(a.currency==='EGP'?(a.fee_minor||0)/100:0),0);

  return (
    <main className="platform-shell" dir="rtl" style={{padding:'24px 28px',maxWidth:'1600px',margin:'0 auto'}}>
      <Toaster position="top-center" richColors dir="rtl"/>

      {/* Executive SuperAdmin Top Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0b1329 0%, #172554 60%, #1e3a8a 100%)',
        color: '#ffffff',
        borderRadius: '18px',
        padding: '24px 28px',
        marginBottom: '24px',
        boxShadow: '0 20px 45px -15px rgba(11, 19, 41, 0.45), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px',flexWrap:'wrap'}}>
            <span style={{
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '9999px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Crown size={15}/> منصة المالك المركزية | SHAKO SuperAdmin
            </span>
            <span style={{fontSize:'12px',color:'#94a3b8'}}>
              الحساب: <strong style={{color:'#f8fafc'}}>{data.owner?.name || 'مالك النظام'}</strong> ({data.owner?.email || 'owner@shako.com'})
            </span>
          </div>
          <h1 style={{margin:'0 0 6px 0',fontSize:'26px',fontWeight:800,letterSpacing:'-0.5px',color:'#ffffff'}}>
            إدارة الوكالات والاشتراكات والتراخيص
          </h1>
          <p style={{margin:0,fontSize:'13.5px',color:'#cbd5e1',lineHeight:1.6}}>
            لوحة الإدارة العليا المستقلة لمالك النظام — تفعيل وإيقاف الوكالات، مراقبة الاشتراكات، تعيين التراخيص، والنسخ الاحتياطي العام.
          </p>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          <a
            href="/?preview=agency"
            className="plain-button"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="الانتقال إلى واجهة الوكالة لمعاينتها كما يراها العميل المشترك"
          >
            <Eye size={16}/> معاينة شاشة العميل (الوكالة المشتركة)
          </a>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
            title="تسجيل الخروج من المنصة"
          >
            <Power size={16}/> تسجيل الخروج
          </button>
        </div>
      </div>

      <div className="platform-stats" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:'14px',marginBottom:'22px'}}>
        <section className="settings-card" style={{padding:'18px 20px',borderRadius:'12px',border:'1px solid #e2e8f0',background:'#ffffff'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontSize:'13px',color:'#64748b',fontWeight:600}}>كل الوكالات</span>
            <Building2 size={20} color="#0284c7"/>
          </div>
          <strong style={{fontSize:'26px',fontWeight:800,color:'#0f172a'}}>{data.agencies.length}</strong>
        </section>

        <section className="settings-card" style={{padding:'18px 20px',borderRadius:'12px',border:'1px solid #e2e8f0',background:'#ffffff'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontSize:'13px',color:'#64748b',fontWeight:600}}>الوكالات المفعلة</span>
            <CheckCircle2 size={20} color="#16a34a"/>
          </div>
          <strong style={{fontSize:'26px',fontWeight:800,color:'#16a34a'}}>{activeAgencies.length}</strong>
        </section>

        <section className="settings-card" style={{padding:'18px 20px',borderRadius:'12px',border:'1px solid #e2e8f0',background:'#ffffff'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontSize:'13px',color:'#64748b',fontWeight:600}}>الموقوفة أو المتأخرة</span>
            <Clock size={20} color="#d97706"/>
          </div>
          <strong style={{fontSize:'26px',fontWeight:800,color:'#d97706'}}>
            {data.agencies.filter((a:any)=>(a.payment_status!=='paid'||a.overdue)&&a.state!=='archived').length}
          </strong>
        </section>

        <section className="settings-card" style={{padding:'18px 20px',borderRadius:'12px',border:'1px solid #e2e8f0',background:'#ffffff'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontSize:'13px',color:'#64748b',fontWeight:600}}>الدخل الشهري المحصل</span>
            <DollarSign size={20} color="#059669"/>
          </div>
          <strong style={{fontSize:'18px',fontWeight:800,color:'#059669'}} dir="ltr">
            {totalUSD>0?`$${totalUSD.toLocaleString()}`:''} {totalEGP>0?`${totalEGP.toLocaleString()} EGP`:''} {totalUSD===0&&totalEGP===0?'0.00':''}
          </strong>
        </section>
      </div>

      <section className="settings-card">
        <div className="toolbar">
          <h2>سجل الوكالات</h2>
          <input
            aria-label="بحث عن وكالة"
            placeholder="اسم الوكالة أو بريد مديرها"
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
          <select aria-label="تصفية الوكالات" value={filter} onChange={e=>setFilter(e.target.value)}>
            {[
              ['all','كل الوكالات'],
              ['active','مفعلة'],
              ['suspended','موقوفة'],
              ['archived','مؤرشفة'],
              ['paid','مسددة'],
              ['unpaid','غير مسددة'],
              ['partial','مسددة جزئيًا'],
              ['overdue','متأخرة']
            ].map(([v,l])=>(
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className="blue-button" disabled={busy} onClick={()=>setDraft(fresh())}>
            <Plus size={17}/>إضافة وكالة
          </button>
          <button className="plain-button" aria-label="تحديث الوكالات" onClick={load}>
            <RefreshCw size={18}/>
          </button>
        </div>

        <div className="data-table">
          <table className="platform-table">
            <thead>
              <tr>
                {['الوكالة','التفعيل','الاشتراك','القيمة','الاستحقاق','النسخ الاحتياطي','الإدارة'].map(h=>(
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agencies.map((a:any)=>(
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                    <small className="cell-secondary">{a.companyName!==a.name?a.companyName:''}</small>
                    <small className="cell-secondary" dir="ltr" style={{fontWeight:600,color:'#0f766e'}}>
                      {a.admin_email||a.adminEmail||'الوكالة المحلية الحالية'}
                    </small>
                  </td>
                  <td>
                    <span className={'status-chip '+(a.state==='archived'?'cancelled':'')}>
                      {states[a.state]}
                    </span>
                  </td>
                  <td>
                    {a.payment_status==='paid'?(
                      <span className="status-chip" style={{background:'#dcfce7',color:'#15803d',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700}}>
                        مسدد
                      </span>
                    ):a.subscription?.isAutoLocked?(
                      <span className="status-chip" style={{background:'#fee2e2',color:'#991b1b',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:750}} title="تم قفل النظام آلياً لتجاوز فترة السماح">
                        🔒 مقفل آلياً (تجاوز السماح)
                      </span>
                    ):a.subscription?.inGracePeriod?(
                      <span className="status-chip" style={{background:'#fef3c7',color:'#92400e',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700}} title="في فترة السماح">
                        ⏳ فترة سماح (متبقي {a.subscription.daysRemaining} يوم)
                      </span>
                    ):(
                      <span className="status-chip" style={{background:'#fee2e2',color:'#b91c1c',padding:'3px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:700}}>
                        غير مسدد
                      </span>
                    )}
                  </td>
                  <td dir="ltr">
                    {(a.fee_minor/100).toLocaleString('en-US',{minimumFractionDigits:2})} {a.currency}
                  </td>
                  <td dir="ltr">{a.due_on||'—'}</td>
                  <td>
                    {a.backupAllowed ? (
                      <span className="status-chip" style={{background:'#dcfce7',color:'#15803d',padding:'2px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:600}}>
                        مصرح من الوكالة
                      </span>
                    ) : (
                      <span className="status-chip" style={{background:'#f1f5f9',color:'#475569',padding:'2px 8px',borderRadius:'4px',fontSize:'11px',fontWeight:600}}>
                        بطلب الوكالة (متاح)
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {((a.payment_status!=='paid'||a.state!=='active')&&a.state!=='archived')&&(
                        <button className="plain-button" style={{color:'#059669',fontWeight:700}} disabled={busy} onClick={()=>quickActivate(a)} title="تفعيل الوكالة الآن وتمديد الاستحقاق للشهر القادم">
                          <CheckCircle2 size={17}/>تفعيل
                        </button>
                      )}
                      <button className="plain-button" disabled={busy} onClick={()=>openAgency(a)} title={'دخول وكالة '+a.name}>
                        <ExternalLink size={17}/>فتح
                      </button>
                      <button className="plain-button" disabled={busy} onClick={()=>edit(a)} title={'تعديل اشتراك وأقسام '+a.name}>
                        <Settings size={17}/>اشتراك
                      </button>
                      <button className="plain-button" disabled={busy} onClick={()=>openQuickPassword(a)} title="تعيين أو إعادة ضبط كلمة مرور مدير الوكالة">
                        <KeyRound size={17}/>كلمة المرور
                      </button>
                      <button className="plain-button" disabled={busy} onClick={()=>backup(a)} title={'تنزيل نسخة احتياطية لـ '+a.name}>
                        <Download size={17}/>نسخة
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!agencies.length&&<p className="empty-row">لا توجد وكالات مطابقة.</p>}
        </div>
        <p className="field-note">
          الأرشفة توقف دخول الوكالة وتحفظ بياناتها بالكامل. يمكن استعادة الوكالة إلى «مفعلة» من خيار الاشتراك. يمكن تنزيل نسخة احتياطية لأي وكالة في أي وقت.
        </p>
      </section>

      <section className="settings-card">
        <h2>سجل إدارة المنصة</h2>
        <div className="platform-audit">
          {data.audit.map((a:any,i:number)=>(
            <div key={i}>
              <strong>{a.action}</strong>
              <span>{data.agencies.find((v:any)=>v.id===a.agency_id)?.name||'وكالة'}</span>
              <small dir="ltr">{a.created_at.slice(0,19).replace('T',' ')} · {a.actor}</small>
            </div>
          ))}
          {!data.audit.length&&<p>لا توجد إجراءات بعد.</p>}
        </div>
      </section>

      {/* Subscription & Agency Control Modal */}
      <Dialog open={!!draft} onOpenChange={v=>!v&&setDraft(null)}>
        <DialogContent className="platform-dialog" dir="rtl" style={{maxWidth:'760px',maxHeight:'90vh',overflowY:'auto'}}>
          <DialogTitle>{draft?.id ? 'الاشتراك والتفعيل وإدارة الوكالة' : 'إضافة وكالة جديدة'}</DialogTitle>
          <DialogDescription>
            تحكم كامل في الوكالة: بيانات الاشتراك، تفعيل الأقسام والعمليات المعلقة، بريد وكلمة مرور المدير، والنسخ الاحتياطي.
          </DialogDescription>
          {draft && (
            <form onSubmit={save}>
              <div className="settings-fields">
                <label>
                  اسم الوكالة
                  <input required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/>
                </label>
                <label>
                  حالة النظام
                  <select value={draft.state} onChange={e=>setDraft({...draft,state:e.target.value})}>
                    {Object.entries(states).map(([v,l]:any)=>(
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  حالة السداد
                  <select value={draft.paymentStatus} onChange={e=>setDraft({...draft,paymentStatus:e.target.value})}>
                    {Object.entries(payments).map(([v,l]:any)=>(
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  قيمة الاشتراك
                  <input type="number" required min="0" step="0.01" value={draft.fee} onChange={e=>setDraft({...draft,fee:e.target.value})}/>
                </label>
                <label>
                  عملة الاشتراك
                  <select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value})}>
                    {currencyDefaults.map(c=>(
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </label>
                <label>
                  آخر سداد
                  <input type="date" value={draft.paidOn||''} onChange={e=>setDraft({...draft,paidOn:e.target.value})}/>
                </label>
                <label>
                  الاستحقاق التالي
                  <input type="date" value={draft.dueOn||''} onChange={e=>setDraft({...draft,dueOn:e.target.value})}/>
                  <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>
                    <button type="button" className="plain-button" style={{fontSize:'11px',padding:'3px 6px'}} onClick={()=>setDraft({...draft,dueOn:getEndOfMonth()})}>
                      نهاية الشهر الحالي
                    </button>
                    <button type="button" className="plain-button" style={{fontSize:'11px',padding:'3px 6px'}} onClick={()=>setDraft({...draft,dueOn:getEndOfNextMonth()})}>
                      نهاية الشهر القادم
                    </button>
                  </div>
                </label>

                {/* Auto-lock & Grace Period Rules */}
                <div style={{gridColumn:'1/-1',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'14px',display:'flex',flexDirection:'column',gap:'10px',marginTop:'4px'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
                    <strong style={{color:'#0f172a',display:'flex',alignItems:'center',gap:'6px'}}>
                      <Clock size={16} color="#2563eb"/> دورة الاشتراك والقفل التلقائي (آخر كل شهر + 5 أيام سماح)
                    </strong>
                  </div>
                  <p style={{fontSize:'12px',color:'#475569',margin:0,lineHeight:1.6}}>
                    يتم قفل النظام آلياً في حال عدم السداد بعد انتهاء فترة السماح (<b>5 أيام</b>) من تاريخ الاستحقاق المحدد. تظهر قيمة الاشتراك كـ «غير مسدد» في الشريط السفلي لدى الوكالة، وإذا انتهت فترة السماح دون سداد يُمنع مستخدمو الوكالة من العمل تلقائياً حتى قيامك بتفعيل الوكالة بعد استلام الدفع.
                  </p>
                  {draft.id&&(
                    <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',marginTop:'4px'}}>
                      {draft.paymentStatus!=='paid'?(
                        <button
                          type="button"
                          className="blue-button"
                          style={{fontSize:'12px',padding:'6px 14px',background:'#059669',borderColor:'#059669'}}
                          onClick={()=>{
                            setDraft({
                              ...draft,
                              paymentStatus:'paid',
                              state:'active',
                              paidOn:today(),
                              dueOn:getEndOfNextMonth()
                            });
                            toast.success('تم تعيين الحالة كـ «مسدد»، تفعيل الوكالة، وتمديد الاستحقاق لنهاية الشهر القادم');
                          }}
                        >
                          <CheckCircle2 size={16}/> ✅ استلام الدفع (تفعيل الوكالة وتمديد للشهر القادم)
                        </button>
                      ):(
                        <button
                          type="button"
                          className="plain-button"
                          style={{fontSize:'12px',padding:'6px 12px',color:'#dc2626'}}
                          onClick={()=>setDraft({...draft,paymentStatus:'unpaid'})}
                        >
                          ⚠️ تحديد كـ «غير مسدد»
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* NEW AGENCY: Admin info & temporary password */}
                {!draft.id && (
                  <>
                    <label>
                      اسم مدير الوكالة
                      <input required value={draft.adminName} onChange={e=>setDraft({...draft,adminName:e.target.value})}/>
                    </label>
                    <label>
                      بريد مدير الوكالة (البريد الإلكتروني) *
                      <input type="email" required dir="ltr" value={draft.adminEmail} onChange={e=>setDraft({...draft,adminEmail:e.target.value})}/>
                    </label>
                    <div className="span-two" style={{background:'#f8fafc',padding:'12px',borderRadius:'8px',border:'1px solid #e2e8f0'}}>
                      <label style={{display:'block',marginBottom:'6px'}}>
                        كلمة مرور مؤقتة للمدير (10 أحرف على الأقل) *
                        <input
                          type="text"
                          dir="ltr"
                          required
                          minLength={6}
                          value={draft.temporaryPassword}
                          onChange={e=>setDraft({...draft,temporaryPassword:e.target.value})}
                          placeholder="مثال: Shako@2026"
                        />
                      </label>
                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginTop:'6px'}}>
                        <button
                          type="button"
                          className="plain-button"
                          style={{fontSize:'12px',background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe'}}
                          onClick={()=>setDraft({...draft,temporaryPassword:'Shako@2026'})}
                        >
                          🔑 كلمة افتراضية (Shako@2026)
                        </button>
                        <button
                          type="button"
                          className="plain-button"
                          style={{fontSize:'12px',background:'#f8fafc',border:'1px solid #cbd5e1'}}
                          onClick={()=>{
                            const rand='Shako@'+Math.floor(100000+Math.random()*900000);
                            setDraft({...draft,temporaryPassword:rand});
                          }}
                        >
                          🎲 توليد كلمة عشوائية
                        </button>
                        <label style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',fontWeight:600,color:'#334155',marginRight:'auto'}}>
                          <input
                            type="checkbox"
                            checked={draft.forcePasswordChange??true}
                            onChange={e=>setDraft({...draft,forcePasswordChange:e.target.checked})}
                          />
                          <span>إلزام المدير بتغيير كلمة المرور عند أول دخول</span>
                        </label>
                      </div>
                    </div>

                    <label>
                      عملة الوكالة الافتراضية
                      <select value={draft.defaultCurrency} onChange={e=>setDraft({...draft,defaultCurrency:e.target.value})}>
                        {draft.enabledCurrencies.map((c:string)=>(
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="span-two">
                      <legend>العملات المستخدمة داخل الوكالة</legend>
                      {currencyDefaults.map(c=>(
                        <label key={c.code} className="currency-check">
                          <input
                            type="checkbox"
                            checked={draft.enabledCurrencies.includes(c.code)}
                            onChange={e=>{
                              const values=e.target.checked?[...draft.enabledCurrencies,c.code]:draft.enabledCurrencies.filter((v:string)=>v!==c.code);
                              setDraft({
                                ...draft,
                                enabledCurrencies:values,
                                defaultCurrency:values.includes(draft.defaultCurrency)?draft.defaultCurrency:values[0]||''
                              });
                            }}
                          />
                          {c.name} · {c.code}
                        </label>
                      ))}
                    </fieldset>
                  </>
                )}

                {/* EXISTING AGENCY: Manager email and password reset management */}
                {draft.id && (
                  <div className="span-two" style={{background:'#f8fafc',padding:'14px',borderRadius:'8px',border:'1px solid #e2e8f0',margin:'6px 0'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                      <h3 style={{fontSize:'14px',fontWeight:700,color:'#0f766e',display:'flex',alignItems:'center',gap:'6px',margin:0}}>
                        <KeyRound size={17}/> بيانات مدير الوكالة وكلمة المرور
                      </h3>
                      <span style={{fontSize:'11px',color:'#64748b'}}>تحكم المالك المباشر بحساب المدير</span>
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'10px'}}>
                      <label>
                        <span>بريد مدير الوكالة (البريد الإلكتروني)</span>
                        <input
                          type="email"
                          dir="ltr"
                          placeholder="admin@example.com"
                          value={draft.adminEmail||''}
                          onChange={e=>setDraft({...draft,adminEmail:e.target.value})}
                        />
                      </label>
                      <label>
                        <span>تعيين كلمة مرور جديدة / مؤقتة للمدير</span>
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="اتركه فارغاً للإبقاء على الحالية"
                          value={draft.resetPassword||''}
                          onChange={e=>setDraft({...draft,resetPassword:e.target.value})}
                        />
                      </label>
                    </div>

                    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:'8px',background:'#fff',padding:'8px 12px',borderRadius:'6px',border:'1px solid #cbd5e1'}}>
                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                        <button
                          type="button"
                          className="plain-button"
                          style={{fontSize:'12px',background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe'}}
                          onClick={()=>setDraft({...draft,resetPassword:'Shako@2026',forcePasswordChange:true})}
                        >
                          🔑 كلمة افتراضية (Shako@2026)
                        </button>
                        <button
                          type="button"
                          className="plain-button"
                          style={{fontSize:'12px',background:'#f8fafc',border:'1px solid #cbd5e1'}}
                          onClick={()=>{
                            const rand='Shako@'+Math.floor(100000+Math.random()*900000);
                            setDraft({...draft,resetPassword:rand,forcePasswordChange:true});
                          }}
                        >
                          🎲 توليد كلمة عشوائية
                        </button>
                        {draft.resetPassword && (
                          <button
                            type="button"
                            className="plain-button"
                            style={{fontSize:'12px',color:'#dc2626'}}
                            onClick={()=>setDraft({...draft,resetPassword:''})}
                          >
                            إلغاء التعيين
                          </button>
                        )}
                      </div>

                      <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',fontWeight:600,color:'#334155'}}>
                        <input
                          type="checkbox"
                          checked={draft.forcePasswordChange??true}
                          onChange={e=>setDraft({...draft,forcePasswordChange:e.target.checked})}
                        />
                        <span>إلزام المدير بتغيير كلمة المرور عند أول دخول</span>
                      </label>
                    </div>

                    {draft.resetPassword && (
                      <div style={{fontSize:'12px',color:'#b45309',background:'#fffbeb',border:'1px solid #fde68a',padding:'8px 12px',borderRadius:'6px',marginTop:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span>
                          ⚠️ سيتم تعيين كلمة المرور إلى: <b dir="ltr" style={{fontFamily:'monospace',fontSize:'13px',fontWeight:700}}>{draft.resetPassword}</b> وإنهاء جميع الجلسات القديمة للمدير.
                        </span>
                        <button
                          type="button"
                          className="plain-button"
                          style={{fontSize:'11px',gap:'4px'}}
                          onClick={()=>copyPassword(draft.resetPassword)}
                        >
                          {copiedPass?<Check size={14} color="#16a34a"/>:<Copy size={14}/>}
                          <span>{copiedPass?'تم النسخ':'نسخ'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* MODULES SELECTION (تفعيل أقسام الوكالة) - Includes Staged Operations (العمليات المعلقة) */}
                {draft.modules && (
                  <fieldset className="span-two" style={{background:'#fdfefe',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'12px'}}>
                    <legend style={{fontWeight:700,color:'#0f766e',padding:'0 6px'}}>تفعيل أقسام الوكالة (قفل وفتح الأقسام والعمليات المعلقة)</legend>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(135px, 1fr))',gap:'8px',marginTop:'6px'}}>
                      {Object.entries(moduleLabels).map(([key,label])=>(
                        <label
                          className="currency-check"
                          key={key}
                          style={{
                            display:'flex',
                            alignItems:'center',
                            gap:'6px',
                            cursor:'pointer',
                            background:(draft.modules[key]??true)?'#f0fdf4':'#fef2f2',
                            padding:'6px 10px',
                            borderRadius:'6px',
                            border:'1px solid '+((draft.modules[key]??true)?'#bbf7d0':'#fecaca'),
                            fontWeight:600
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={draft.modules[key]??true}
                            onChange={e=>setDraft({
                              ...draft,
                              modules:{...draft.modules,[key]:e.target.checked}
                            })}
                          />
                          <span style={{color:(draft.modules[key]??true)?'#166534':'#991b1b'}}>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {/* BACKUP SECTION IN MODAL */}
                {draft.id && (
                  <div className="span-two" style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'12px 14px',marginTop:'4px',flexWrap:'wrap',gap:'8px'}}>
                    <div>
                      <strong style={{color:'#166534',fontSize:'13px',display:'block'}}>النسخ الاحتياطي لبيانات الوكالة</strong>
                      <small style={{color:'#15803d'}}>تنزيل فوري لملف JSON يحتوي على السجلات والإعدادات وكشوفات الحسابات والشعار.</small>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',cursor:'pointer',color:'#166534',fontWeight:600}}>
                        <input
                          type="checkbox"
                          checked={draft.ownerBackupAllowed!==false}
                          onChange={e=>setDraft({...draft,ownerBackupAllowed:e.target.checked})}
                        />
                        <span>تصريح النسخ الاحتياطي التلقائي</span>
                      </label>
                      <button
                        type="button"
                        className="plain-button"
                        style={{background:'#fff',border:'1px solid #86efac',color:'#15803d',fontWeight:600,gap:'6px'}}
                        onClick={()=>backup(draft)}
                        disabled={busy}
                      >
                        <Download size={16}/> تنزيل نسخة احتياطية فورية الآن
                      </button>
                    </div>
                  </div>
                )}

                <label className="span-two">
                  ملاحظات خاصة بالمالك
                  <textarea value={draft.notes||''} maxLength={1000} onChange={e=>setDraft({...draft,notes:e.target.value})}/>
                </label>
              </div>

              {draft.state==='archived'&&<p className="security-note"><Archive size={18}/>ستُحفظ بيانات الوكالة مع إيقاف دخول مستخدميها.</p>}

              <div className="save-bar" style={{marginTop:'16px',display:'flex',justifyContent:'flex-end',gap:'8px'}}>
                <button type="button" className="plain-button" onClick={()=>setDraft(null)}>رجوع</button>
                <button className="blue-button" disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ الإعدادات'}</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
