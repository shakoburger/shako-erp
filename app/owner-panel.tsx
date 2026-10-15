'use client';
import {useEffect,useState} from 'react';
import {Switch} from '@/components/ui/switch';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel,AlertDialogAction,AlertDialogFooter} from '@/components/ui/alert-dialog';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {LockKeyhole,ShieldCheck,Save,RefreshCw,Download,KeyRound,Lock,Eye,EyeOff,User,Phone,CheckCircle2} from 'lucide-react';
import {toast} from 'sonner';
import {moduleLabels,type Settings,type ModuleKey} from '@/lib/domain';
import {api} from './erp-system';

export function OwnerPanel({settings,revision,onSave,backup}:{settings:Settings;revision:number;onSave:(s:Settings,r:number)=>void;backup:()=>void}){
 const [draft,setDraft]=useState(settings),[baseRevision,setBaseRevision]=useState(revision),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[detail,setDetail]=useState<any>({members:[],audit:[]}),[email,setEmail]=useState(''),[dirty,setDirty]=useState(false),[detailError,setDetailError]=useState('');

 // Owner security credentials state
 const [ownerCreds, setOwnerCreds] = useState<any>({ username: 'owner', name: '', email: '', phone: '', hasCustomPassword: false });
 const [credsModalOpen, setCredsModalOpen] = useState(false);
 const [credUsername, setCredUsername] = useState('owner');
 const [credName, setCredName] = useState('');
 const [credEmail, setCredEmail] = useState('');
 const [credPhone, setCredPhone] = useState('');
 const [credPassword, setCredPassword] = useState('');
 const [credConfirmPassword, setCredConfirmPassword] = useState('');
 const [showCredPassword, setShowCredPassword] = useState(false);
 const [savingCreds, setSavingCreds] = useState(false);

 async function loadOwnerCreds() {
   try {
     const res = await api('/api/platform/owner-credentials');
     if (res) {
       setOwnerCreds(res);
       setCredUsername(res.username || 'owner');
       setCredName(res.name || '');
       setCredEmail(res.email || '');
       setCredPhone(res.phone || '');
     }
   } catch (e: any) {
     console.warn('Could not load owner credentials:', e);
   }
 }

 useEffect(() => {
   loadOwnerCreds();
 }, []);

 async function handleSaveCreds(e: React.FormEvent) {
   e.preventDefault();
   const u = credUsername.trim();
   if (!u) {
     toast.error('يرجى إدخال اسم مستخدم المالك');
     return;
   }
   if (credPassword && credPassword.length < 6) {
     toast.error('كلمة المرور يجب ألا تقل عن 6 أحرف');
     return;
   }
   if (credPassword && credPassword !== credConfirmPassword) {
     toast.error('كلمة المرور وتأكيدها غير متطابقين');
     return;
   }

   setSavingCreds(true);
   try {
     await api('/api/platform/owner-credentials', {
       method: 'POST',
       body: JSON.stringify({
         username: u,
         password: credPassword || undefined,
         name: credName.trim() || undefined,
         email: credEmail.trim() || undefined,
         phone: credPhone.trim() || undefined,
       }),
     });
     toast.success('تم تحديث بيانات دخول مالك المنظومة بنجاح!');
     setCredsModalOpen(false);
     setCredPassword('');
     setCredConfirmPassword('');
     await loadOwnerCreds();
   } catch (err: any) {
     toast.error(err.message || 'فشل تحديث بيانات الدخول');
   } finally {
     setSavingCreds(false);
   }
 }

 useEffect(()=>{if(!dirty){setDraft(settings);setBaseRevision(revision)}},[settings,revision,dirty]);
 async function loadDetails(){try{setDetail(await api('/api/owner'));setDetailError('')}catch(e:any){setDetailError(e.message)}}
 useEffect(()=>{loadDetails()},[]);
 const update=(key:keyof Settings,value:any)=>{setDraft(d=>({...d,[key]:value}));setDirty(true)};
 async function save(){setBusy(true);try{const b=await api('/api/settings',{method:'PUT',body:JSON.stringify({settings:draft,revision:baseRevision})});onSave(b.settings,b.revision);setBaseRevision(b.revision);setDirty(false);toast.success('تم حفظ إعدادات النظام');loadDetails()}catch(e:any){toast.error(e.message)}finally{setBusy(false);setConfirm(false)}}
 async function member(address:string,active:boolean){setBusy(true);try{await api('/api/owner',{method:'POST',body:JSON.stringify({email:address,active})});setEmail('');loadDetails();toast.success(active?'تم تفعيل الحساب':'تم إيقاف الحساب')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 const newlyLocked=(!settings.globalLocked&&draft.globalLocked)||Object.keys(moduleLabels).some(k=>settings.modules[k as ModuleKey]&&!draft.modules[k as ModuleKey]);

 return <div className="owner-panel" dir="rtl">
  <div className="owner-heading">
   <div>
    <span className="owner-tag"><ShieldCheck size={16}/> إدارة المالك</span>
    <h1>لوحة تحكم النظام</h1>
    <p>إعدادات الهوية والمبلغ والتواصل وصلاحيات التفعيل وبيانات أمان المالك.</p>
   </div>
   <a href="/" className="blue-button" style={{display:'inline-flex',alignItems:'center',gap:'6px'}}>📊 عرض واجهة النظام والحسابات (الرئيسية)</a>
  </div>

  {/* Dedicated Owner Credentials Card */}
  <section className="settings-card" style={{border:'2px solid #f59e0b',background:'linear-gradient(180deg, #fffbeb 0%, #ffffff 100%)',borderRadius:'14px',padding:'20px',marginBottom:'20px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
        <div style={{background:'linear-gradient(135deg, #d97706 0%, #b45309 100%)',color:'#fff',padding:'8px',borderRadius:'10px',display:'inline-flex',boxShadow:'0 4px 12px rgba(217,119,6,0.3)'}}>
          <KeyRound size={22}/>
        </div>
        <div>
          <h2 style={{margin:'0 0 2px 0',fontSize:'17px',fontWeight:800,color:'#92400e'}}>بيانات دخول وأمان مالك المنظومة (System Owner)</h2>
          <small style={{color:'#78350f',fontSize:'12px'}}>يمكنك تعديل اسم مستخدم المالك وكلمة المرور من هنا مع بقاء الحسابات والعمليات محفوظة بشكل دائم.</small>
        </div>
      </div>
      <button
        type="button"
        className="blue-button"
        onClick={() => {
          setCredPassword('');
          setCredConfirmPassword('');
          setCredsModalOpen(true);
        }}
        style={{background:'#d97706',borderColor:'#d97706',display:'inline-flex',alignItems:'center',gap:'6px',fontWeight:700,padding:'8px 16px',boxShadow:'0 4px 12px rgba(217,119,6,0.25)'}}
      >
        <KeyRound size={16}/> تغيير كلمة السر واسم المستخدم
      </button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'12px',background:'#ffffff',padding:'14px 16px',borderRadius:'10px',border:'1px solid #fde68a'}}>
      <div>
        <span style={{fontSize:'12px',color:'#64748b',display:'block',marginBottom:'3px',fontWeight:600}}>اسم مستخدم المالك (Username):</span>
        <strong style={{fontSize:'15px',color:'#0f172a',background:'#f1f5f9',padding:'3px 10px',borderRadius:'6px',fontFamily:'monospace',direction:'ltr',display:'inline-block'}}>
          {ownerCreds.username || 'owner'}
        </strong>
      </div>
      <div>
        <span style={{fontSize:'12px',color:'#64748b',display:'block',marginBottom:'3px',fontWeight:600}}>الاسم المعروض:</span>
        <strong style={{fontSize:'14px',color:'#0f172a'}}>{ownerCreds.name || 'مالك المنصة الأساسي'}</strong>
      </div>
      <div>
        <span style={{fontSize:'12px',color:'#64748b',display:'block',marginBottom:'3px',fontWeight:600}}>البريد الإلكتروني:</span>
        <strong style={{fontSize:'13px',color:'#0f172a',direction:'ltr',display:'inline-block'}}>{ownerCreds.email || 'owner@shako.com'}</strong>
      </div>
      <div>
        <span style={{fontSize:'12px',color:'#64748b',display:'block',marginBottom:'3px',fontWeight:600}}>حالة كلمة المرور:</span>
        <span style={{fontSize:'12.5px',fontWeight:700,display:'inline-flex',alignItems:'center',gap:'4px',color:ownerCreds.hasCustomPassword?'#16a34a':'#d97706'}}>
          {ownerCreds.hasCustomPassword ? '✓ مخصصة ومحمية' : '🔒 الافتراضية (admin123)'}
        </span>
      </div>
    </div>
  </section>

  <div className="owner-grid">
   <section className="settings-card">
    <h2>بيانات النظام</h2>
    <div className="settings-fields">
     <label>اسم النظام<input value={draft.systemName} maxLength={30} onChange={e=>update('systemName',e.target.value)}/></label>
     <label>اسم الشركة<input value={draft.companyName} onChange={e=>update('companyName',e.target.value)}/></label>
     <label>أرقام التواصل<input dir="ltr" value={draft.phones} onChange={e=>update('phones',e.target.value)}/><small>يمكن كتابة أكثر من رقم، مفصولًا بمسافة.</small></label>
     <label>المبلغ الظاهر في واجهة المستخدم<input dir="ltr" type="number" min="0" step="0.01" value={draft.displayAmount} onChange={e=>update('displayAmount',Number(e.target.value))}/></label>
     <label>قيمة النظام المستحقة<input dir="ltr" type="number" min="0" step="0.01" value={draft.licenseAmount} onChange={e=>update('licenseAmount',Number(e.target.value))}/></label>
     <label>السنة المالية<input dir="ltr" type="number" min="2000" max="2100" value={draft.financialYear} onChange={e=>update('financialYear',Number(e.target.value))}/></label>
    </div>
   </section>
   <section className="settings-card">
    <h2>السداد وتفعيل النظام</h2>
    <label className="stack-label">حالة السداد
     <Select value={draft.paymentStatus} onValueChange={v=>update('paymentStatus',v)} dir="rtl">
      <SelectTrigger className="full-select"><SelectValue/></SelectTrigger>
      <SelectContent>
       <SelectItem value="unpaid">غير مسدد</SelectItem>
       <SelectItem value="partial">مسدد جزئيًا</SelectItem>
       <SelectItem value="paid">مسدد بالكامل</SelectItem>
      </SelectContent>
     </Select>
    </label>
    <div className={'global-lock '+(draft.globalLocked?'is-locked':'')}>
     <div><strong><LockKeyhole size={19}/> إيقاف النظام بالكامل</strong><p>عند التفعيل يتوقف وصول المستخدم لجميع الأقسام.</p></div>
     <Switch dir="ltr" aria-label="إيقاف النظام بالكامل" checked={draft.globalLocked} onCheckedChange={v=>update('globalLocked',v)}/>
    </div>
    <label className="stack-label">رسالة الإيقاف للمستخدم<textarea rows={4} maxLength={200} value={draft.lockReason} onChange={e=>update('lockReason',e.target.value)}/></label>
    <p className="field-note">حالة السداد تُسجَّل هنا. الإيقاف وإعادة التفعيل يتمان من المفاتيح التالية ثم حفظ التغييرات.</p>
   </section>
  </div>
  <section className="settings-card">
   <h2>تفعيل الأقسام</h2>
   <div className="module-grid">
    {Object.entries(moduleLabels).map(([key,label])=><div className="module-toggle" key={key}>
     <div><strong>{label}</strong><small>{draft.modules[key as ModuleKey]?'متاح للمستخدم':'موقوف'}</small></div>
     <Switch dir="ltr" aria-label={'تفعيل '+label} checked={draft.modules[key as ModuleKey]} onCheckedChange={v=>update('modules',{...draft.modules,[key]:v})}/>
    </div>)}
   </div>
  </section>
  <div className="save-bar">
   <span>{dirty?'تغييرات غير محفوظة':'الإعدادات محفوظة'}{dirty&&revision!==baseRevision?' · يوجد تحديث من جلسة أخرى':''}</span>
   <button className="plain-button" disabled={busy} onClick={()=>{setDraft(settings);setBaseRevision(revision);setDirty(false)}}>إلغاء التغييرات</button>
   <button className="blue-button" disabled={busy||!dirty} onClick={()=>newlyLocked?setConfirm(true):save()}><Save size={17}/>{busy?'جارٍ الحفظ…':'حفظ التغييرات'}</button>
  </div>
  <section className="settings-card">
   <h2>إدارة الوكالة</h2>
   <p className="field-note">بيانات الوكالة وشعارها والمستخدمون وصلاحياتهم والعملات متاحة في إعدادات الوكالة.</p>
   <a href="/?section=agency-settings" className="blue-button">فتح إعدادات الوكالة</a>
  </section>
  <section className="settings-card">
   <div className="section-heading">
    <h2>سجل الإدارة</h2>
    <button className="plain-button" onClick={loadDetails}><RefreshCw size={16}/>تحديث</button>
    <button className="plain-button" onClick={backup}><Download size={16}/>نسخة احتياطية</button>
   </div>
   <Table>
    <TableHeader>
     <TableRow>
      <TableHead>التاريخ</TableHead>
      <TableHead>المستخدم</TableHead>
      <TableHead>التغيير</TableHead>
     </TableRow>
    </TableHeader>
    <TableBody>
     {detail.audit.map((a:any,i:number)=><TableRow key={i}>
      <TableCell dir="ltr">{new Date(a.created_at).toLocaleString('en-GB',{timeZone:'Africa/Cairo'})}</TableCell>
      <TableCell dir="ltr">{a.actor}</TableCell>
      <TableCell>{a.action}<details><summary>تفاصيل التغيير</summary><pre dir="ltr">{JSON.stringify({before:JSON.parse(a.before_value),after:JSON.parse(a.after_value)},null,2)}</pre></details></TableCell>
     </TableRow>)}
    </TableBody>
   </Table>
   {!detail.audit.length&&<div className="empty-row">سيظهر سجل التغييرات هنا.</div>}
  </section>
  <AlertDialog open={confirm} onOpenChange={setConfirm}>
   <AlertDialogContent dir="rtl">
    <AlertDialogTitle>تأكيد إيقاف الوصول</AlertDialogTitle>
    <AlertDialogDescription>سيتم إيقاف وصول المستخدم إلى {draft.globalLocked?'النظام بالكامل':'الأقسام المحددة'}. تبقى البيانات محفوظة ويمكنك إعادة التفعيل من لوحة المالك.</AlertDialogDescription>
    <AlertDialogFooter>
     <AlertDialogCancel>رجوع</AlertDialogCancel>
     <AlertDialogAction onClick={save}>حفظ وتطبيق الإيقاف</AlertDialogAction>
    </AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>

  {/* Owner Security Credentials Modal */}
  <Dialog open={credsModalOpen} onOpenChange={setCredsModalOpen}>
    <DialogContent dir="rtl" style={{maxWidth:'520px',borderRadius:'16px',padding:'24px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
        <div style={{background:'#d97706',color:'#fff',padding:'8px',borderRadius:'10px'}}>
          <KeyRound size={22}/>
        </div>
        <div>
          <DialogTitle style={{fontSize:'18px',fontWeight:800,color:'#0f172a',margin:0}}>
            تغيير بيانات دخول مالك المنظومة
          </DialogTitle>
          <DialogDescription style={{fontSize:'12.5px',color:'#64748b',marginTop:'2px'}}>
            تحديث اسم المستخدم وكلمة المرور الخاصة بمالك النظام. جميع الحسابات والبيانات والعمليات تبقى محفوظة كما هي.
          </DialogDescription>
        </div>
      </div>

      <form onSubmit={handleSaveCreds} style={{display:'flex',flexDirection:'column',gap:'14px',marginTop:'8px'}}>
        <label style={{display:'flex',flexDirection:'column',gap:'5px',fontSize:'13px',fontWeight:600,color:'#1e293b'}}>
          <span>اسم مستخدم المالك (Username) *</span>
          <input
            type="text"
            dir="ltr"
            required
            value={credUsername}
            onChange={e => setCredUsername(e.target.value)}
            placeholder="owner"
            style={{padding:'10px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',fontSize:'14px',fontFamily:'monospace'}}
          />
          <small style={{fontSize:'11.5px',color:'#64748b',fontWeight:400}}>
            هذا هو الاسم الذي ستستخدمه لتسجيل الدخول في بوابة مالك المنصة.
          </small>
        </label>

        <label style={{display:'flex',flexDirection:'column',gap:'5px',fontSize:'13px',fontWeight:600,color:'#1e293b'}}>
          <span>الاسم المعروض (Display Name)</span>
          <input
            type="text"
            value={credName}
            onChange={e => setCredName(e.target.value)}
            placeholder="مالك المنصة الأساسي"
            style={{padding:'10px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',fontSize:'14px'}}
          />
        </label>

        <label style={{display:'flex',flexDirection:'column',gap:'5px',fontSize:'13px',fontWeight:600,color:'#1e293b'}}>
          <span>البريد الإلكتروني للتعافي والمالك</span>
          <input
            type="email"
            dir="ltr"
            value={credEmail}
            onChange={e => setCredEmail(e.target.value)}
            placeholder="owner@shako.com"
            style={{padding:'10px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',fontSize:'14px'}}
          />
        </label>

        <label style={{display:'flex',flexDirection:'column',gap:'5px',fontSize:'13px',fontWeight:600,color:'#1e293b'}}>
          <span>رقم هاتف المالك والدعم الفني</span>
          <input
            type="tel"
            dir="ltr"
            value={credPhone}
            onChange={e => setCredPhone(e.target.value)}
            placeholder="0100000000"
            style={{padding:'10px 12px',borderRadius:'8px',border:'1px solid #cbd5e1',fontSize:'14px'}}
          />
        </label>

        <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'10px',padding:'14px',display:'flex',flexDirection:'column',gap:'10px'}}>
          <div style={{fontWeight:700,fontSize:'13px',color:'#92400e',display:'flex',alignItems:'center',gap:'6px'}}>
            <Lock size={16}/> تعيين كلمة مرور جديدة للمالك
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:'4px',fontSize:'12.5px',fontWeight:600,color:'#78350f'}}>
            <span>كلمة المرور الجديدة</span>
            <input
              type={showCredPassword ? 'text' : 'password'}
              dir="ltr"
              minLength={6}
              value={credPassword}
              onChange={e => setCredPassword(e.target.value)}
              placeholder="اتركها فارغة للإبقاء على كلمة المرور الحالية"
              style={{padding:'9px 12px',borderRadius:'6px',border:'1px solid #fcd34d',background:'#ffffff',fontSize:'14px'}}
            />
          </label>

          {credPassword && (
            <label style={{display:'flex',flexDirection:'column',gap:'4px',fontSize:'12.5px',fontWeight:600,color:'#78350f'}}>
              <span>تأكيد كلمة المرور الجديدة *</span>
              <input
                type={showCredPassword ? 'text' : 'password'}
                dir="ltr"
                required
                value={credConfirmPassword}
                onChange={e => setCredConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور للتأكيد"
                style={{padding:'9px 12px',borderRadius:'6px',border:'1px solid #fcd34d',background:'#ffffff',fontSize:'14px'}}
              />
            </label>
          )}

          {credPassword && (
            <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',color:'#92400e',cursor:'pointer',userSelect:'none'}}>
              <input type="checkbox" checked={showCredPassword} onChange={e => setShowCredPassword(e.target.checked)}/>
              <span>إظهار أحرف كلمة المرور</span>
            </label>
          )}
        </div>

        <div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'6px'}}>
          <button
            type="button"
            className="plain-button"
            onClick={() => setCredsModalOpen(false)}
            disabled={savingCreds}
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="blue-button"
            disabled={savingCreds}
            style={{background:'#d97706',borderColor:'#d97706',color:'#ffffff',fontWeight:700}}
          >
            {savingCreds ? 'جارٍ الحفظ…' : 'حفظ بيانات المالك الجديدة'}
          </button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
 </div>;
}
