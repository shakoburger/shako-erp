'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {requestJSON} from '@/lib/client-api';
import {WorkspaceWindow,WindowControls} from '@/components/workspace-window';
import {OperationReports} from '@/components/operation-reports';
import {cashTitles} from '@/lib/cash';
import {Download,Power,Settings as SettingsIcon,LockKeyhole,RefreshCw,X,Home,Plane,Menu,ArrowRight,ChevronLeft,ShieldCheck,Headphones,KeyRound,Smartphone} from 'lucide-react';
import {ERPIcon} from '@/components/erp-icons';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {Toaster,toast} from 'sonner';
import {defaults,moduleLabels,moduleEnabled,money,type Settings,type ModuleKey,type AgencySubscription,evaluateSubscription} from '@/lib/domain';
import {BankWorkspace} from './bank-workspace';
import {bankMenu,bankTypes,bankTitles,bankTypeLabel,bankIcon,issuedChequeMenu} from '@/lib/banks';
import {CashWorkspace} from './cash-workspace';
import {AgencyChooser} from './agency-chooser';
import {AgencyPanel,AgencyPassword} from './agency-panel';
import {AgencyAccess,AgencySettings} from '@/components/access-context';
import {roleAccess,roleLabels,type Access} from '@/lib/access';
import {OwnerPanel} from './owner-panel';
import {RecordManager,TicketEntry,ServiceEntry,Dashboard,BalanceReport} from './workspaces';
import {FinancialReport} from './financial-reports';
import {PeriodClosingWorkspace} from './period-closing-workspace';
import {StagedOperationsWorkspace} from './staged-operations-workspace';
import {LoginPage} from '@/components/login-page';
export async function api(path:string,init?:RequestInit):Promise<any>{try{const b=await requestJSON(path,init);if(b.operationReport&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('shako-operation',{detail:b.operationReport}));return b}catch(e:any){if(typeof window!=='undefined'&&[401,403,428].includes(e.status)&&path!=='/api/bootstrap'&&path!=='/api/agency/security')window.dispatchEvent(new Event('shako-access-refresh'));throw e}}
export function download(value:string,name:string,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([value],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
type MenuItem={icon:string;label:string;target:string;module?:ModuleKey};
const menus:Record<string,MenuItem[]>={
 main:[{icon:'staged-ops',label:'العمليات المعلقة',target:'staged-ops',module:'stagedOps'},{icon:'supervisor',label:'المشرف',target:'supervisor',module:'supervisor'},{icon:'accounts',label:'الحسابات',target:'accounts',module:'accounts'},{icon:'customers',label:'العملاء',target:'customers',module:'customers'},{icon:'cash',label:'النقد',target:'cash',module:'cash'},{icon:'banks',label:'البنوك',target:'banks',module:'banks'},{icon:'employees',label:'الموظفين',target:'record:employee',module:'employees'},{icon:'control',label:'التحكم',target:'agency-settings',module:'control'}],
 supervisor:[{icon:'supervisor-page',label:'صفحة المشرف',target:'dashboard',module:'supervisor'},{icon:'total-balances',label:'إجمالي الأرصدة',target:'balances',module:'reports'},{icon:'management-reports',label:'التقارير الإدارية',target:'report:all',module:'reports'}],
 balances:[{icon:'customer-balances',label:'أرصدة العملاء',target:'report:customer',module:'customers'},{icon:'airline-balances',label:'أرصدة الخطوط',target:'report:airline',module:'tickets'},{icon:'bank-balances',label:'أرصدة البنوك',target:'bank-work:balances',module:'banks'},{icon:'cash-balances',label:'أرصدة النقد',target:'cash-work:balances',module:'cash'},{icon:'expense-balances',label:'أرصدة المصروفات',target:'report:expense',module:'accounts'}],
  customers:[{icon:'gds-tickets',label:'إضافة التذاكر',target:'add-tickets',module:'tickets'},{icon:'ticket-edit',label:'تعديل التذاكر',target:'record:ticket',module:'tickets'},{icon:'airline-balances',label:'حسابات الخطوط',target:'record:customer:airline',module:'tickets'},{icon:'visas',label:'التأشيرات',target:'record:visa',module:'customers'},{icon:'services',label:'إضافة خدمة',target:'service',module:'customers'},{icon:'services',label:'سجلات الخدمات',target:'record:service',module:'customers'},{icon:'services',label:'حسابات الخدمات',target:'record:customer:service',module:'customers'},{icon:'invoice',label:'فاتورة مبدئية',target:'record:invoice',module:'customers'},{icon:'customer-reports',label:'التقارير',target:'customer-reports',module:'reports'},{icon:'customer-balances',label:'دليل العملاء',target:'record:customer',module:'customers'}],
 'add-tickets':[{icon:'gds-tickets',label:'تذاكر GDS',target:'ticket',module:'tickets'},{icon:'economy-travel',label:'السفر الاقتصادي',target:'ticket',module:'tickets'},{icon:'ticket-refund',label:'التذاكر المستردة',target:'record:ticket:refunded',module:'tickets'},{icon:'ticket-cancel',label:'إلغاء التذاكر',target:'record:ticket:cancelled',module:'tickets'}],
 accounts:[{icon:'accounts',label:'دليل الحسابات',target:'record:account',module:'accounts'},{icon:'airline-balances',label:'حسابات الخطوط',target:'record:customer:airline',module:'accounts'},{icon:'services',label:'حسابات الخدمات',target:'record:customer:service',module:'accounts'},{icon:'accounts',label:'إقفال الفترات والأرباح',target:'period-closing',module:'accounts'},{icon:'ticket',label:'حسابات الإيرادات',target:'record:account:revenue',module:'accounts'},{icon:'expense-balances',label:'المصروفات',target:'record:expense',module:'accounts'},{icon:'management-reports',label:'التقارير',target:'report:all',module:'reports'}],
 cash:[{icon:'cash-account',label:'إضافة حساب',target:'cash-work:account',module:'cash'},{icon:'cash-payment',label:'صرف نقد',target:'cash-payment',module:'cash'},{icon:'cash-receipt',label:'إستلام نقد',target:'cash-receipt',module:'cash'},{icon:'foreign-cash',label:'النقد الأجنبي',target:'cash-forex',module:'cash'},{icon:'cash-balances',label:'إجمالي أرصدة النقد',target:'cash-work:balances',module:'reports'},{icon:'cash-currency',label:'إضافة عملة',target:'cash-work:currency',module:'cash'}],
 'cash-payment':[{icon:'cash-payment',label:'صرف نقد',target:'cash-work:payment',module:'cash'},{icon:'cash-edit',label:'تعديل الصرف',target:'cash-work:edit-payment',module:'cash'},{icon:'cash-voucher',label:'إيصال الصرف',target:'cash-work:print-payment',module:'reports'}],
 'cash-receipt':[{icon:'cash-receipt',label:'إستلام نقد',target:'cash-work:receipt',module:'cash'},{icon:'cash-edit',label:'تعديل الإستلام',target:'cash-work:edit-receipt',module:'cash'},{icon:'cash-voucher',label:'إيصال الإستلام',target:'cash-work:print-receipt',module:'reports'}],
 'cash-forex':[{icon:'foreign-cash',label:'شراء النقد الأجنبي',target:'cash-work:forex',module:'cash'},{icon:'cash-edit',label:'تعديل شراء النقد الأجنبي',target:'cash-work:edit-forex',module:'cash'},{icon:'cash-voucher',label:'إيصال الصرف',target:'cash-work:print-forex',module:'reports'}],
 control:[{icon:'customer-balances',label:'المستخدمون',target:'access',module:'control'},{icon:'management-reports',label:'إعدادات النظام',target:'info',module:'control'}]
};
menus['customer-reports']=[{icon:'customer-balances',label:'كشف حساب',target:'report:statement',module:'reports'},{icon:'cash-voucher',label:'إيصال التذاكر',target:'report:ticket-receipt',module:'reports'},{icon:'ticket-refund',label:'التذاكر المستردة',target:'report:refunded-tickets',module:'reports'},{icon:'economy-travel',label:'تذاكر السفر الاقتصادي',target:'report:economy-tickets',module:'reports'},{icon:'airline-balances',label:'مبيعات الخطوط',target:'report:airline-sales',module:'reports'},{icon:'economy-travel',label:'السفر الاقتصادي',target:'report:economy-sales',module:'reports'},{icon:'management-reports',label:'المبيعات اليومية',target:'report:daily-sales',module:'reports'}];
menus.banks=bankMenu.map(([icon,label,target])=>({icon,label,target,module:target==='bank-reports'?'reports':'banks'}));
for(const type of bankTypes)menus['bank-'+type]=[{icon:bankIcon(type),label:type==='deposit'?'إيداع بنكي جديد':bankTypeLabel(type),target:'bank-work:'+type,module:'banks'},{icon:'cash-edit',label:bankTitles['edit-'+type],target:'bank-work:edit-'+type,module:'banks'},{icon:'cash-voucher',label:bankTitles['print-'+type],target:'bank-work:print-'+type,module:'reports'}];
menus['bank-cheque-issue']=issuedChequeMenu.map(([icon,label,target])=>({icon,label,target,module:target.includes('print-')?'reports':'banks'}));
menus['bank-reports']=[{icon:'bank-reports',label:'إجمالي أرصدة البنوك',target:'bank-work:balances',module:'reports'},...bankTypes.map(type=>({icon:'cash-voucher',label:bankTitles['print-'+type],target:'bank-work:print-'+type,module:'reports' as ModuleKey}))];
const menuNames:Record<string,string>={main:'القائمة','staged-ops':'العمليات المعلقة',supervisor:'المشرف',customers:'العملاء',balances:'إجمالي الأرصدة','add-tickets':'إضافة التذاكر',accounts:'الحسابات',control:'التحكم',cash:'النقد','cash-payment':'صرف نقد','cash-receipt':'إستلام نقد','cash-forex':'النقد الأجنبي'};
const parent:Record<string,string>={supervisor:'main',customers:'main',balances:'supervisor','add-tickets':'customers',accounts:'main',control:'main',cash:'main','cash-payment':'cash','cash-receipt':'cash','cash-forex':'cash','staged-ops':'main'};
menuNames['customer-reports']='تقارير العملاء';parent['customer-reports']='customers';
menuNames.banks='البنوك';menuNames['bank-reports']='التقارير';parent.banks='main';parent['bank-reports']='banks';for(const type of bankTypes){menuNames['bank-'+type]=bankTypeLabel(type);parent['bank-'+type]='banks'}
const titles:Record<string,string>={'record:customer:service':'دليل حسابات الخدمات','record:account:revenue':'دليل حسابات الإيرادات','record:account:commission':'دليل حسابات العمولات','record:customer:airline':'دليل حسابات الخطوط','report:statement':'كشف حساب','report:daily-sales':'تقرير المبيعات اليومية','report:airline-sales':'مبيعات الخطوط','report:economy-sales':'تقرير مبيعات السفر الاقتصادي','report:ticket-receipt':'إيصال التذاكر','report:refunded-tickets':'التذاكر المستردة','report:economy-tickets':'تذاكر السفر الاقتصادي',dashboard:'صفحة المشرف','period-closing':'إقفال الفترات المحاسبية والأرباح والخسائر','staged-ops':'العمليات المعلقة',ticket:'إضافة تذاكر GDS',access:'صلاحيات المستخدمين',info:'معلومات النظام','agency-settings':'إعدادات الوكالة','my-password':'كلمة مرور حسابي'};
const viewModule=(v:string):ModuleKey|undefined=>v==='period-closing'?'accounts':v==='staged-ops'?'stagedOps':v.startsWith('bank-')?'banks':v.startsWith('cash-')?'cash':v==='dashboard'?'supervisor':v==='ticket'?'tickets':v.startsWith('report:')?'reports':v.startsWith('record:')?({cash:'cash',bank:'banks',employee:'employees',customer:'customers',ticket:'tickets',account:'accounts',expense:'accounts',visa:'customers',service:'customers',invoice:'customers'} as Record<string,ModuleKey>)[v.split(':')[1]]:v==='agency-settings'?'control':v==='balances'?'reports':v in moduleLabels?v as ModuleKey:undefined;
const descriptions:Record<string,string>={'record:customer:service':'إدارة وعرض وتعديل حسابات الخدمات السياحية والتأشيرات والفنادق والأرصدة','record:account:revenue':'إدارة وعرض وتعديل حسابات الإيرادات ودخل التذاكر والخدمات','record:account:commission':'إدارة ودليل حسابات العمولات متعددة العملات','record:customer:airline':'إدارة وعرض وتعديل حسابات خطوط الطيران والأرصدة وبيانات التواصل','staged-ops':'قائمة العمليات المعلقة للتذاكر والتحاويل بجميع الصيغ',supervisor:'الأرصدة والمبيعات والتقارير',accounts:'دليل الحسابات والمصروفات والإيرادات','period-closing':'احتساب الأرباح والخسائر، قيود التسوية، وقفل الحركات المالية لمنع التعديل إلا بصلاحية مدير',customers:'التذاكر والخدمات وبيانات العملاء',cash:'الخزائن والصرف والاستلام والعملات',banks:'الحسابات البنكية والشيكات والتحويلات','record:employee':'دليل الموظفين وبيانات التواصل',control:'الصلاحيات وإعدادات النظام',dashboard:'نظرة على حركة أعمالك بكل العملات',balances:'متابعة أرصدة الحسابات', 'add-tickets':'إصدار وإدارة تذاكر السفر','bank-work:account':'إدارة بيانات الحسابات البنكية','cash-work:account':'إدارة حسابات الخزائن','cash-work:currency':'دليل العملات وأسعار الصرف','bank-deposit':'إيداع جديد وتعديل وطباعة الإيصالات','bank-withdraw':'سحب جديد وتعديل وطباعة الإيصالات','bank-transfer':'التحويل بين الحسابات البنكية','bank-cheque-issue':'شيكات مباشرة وآجلة وتمرير الشيك','bank-cheque-receive':'استلام الشيكات ومتابعتها','bank-reports':'الأرصدة وإيصالات العمليات','cash-payment':'صرف جديد وتعديل وطباعة الإيصالات','cash-receipt':'استلام جديد وتعديل وطباعة الإيصالات','cash-forex':'عمليات شراء النقد الأجنبي',ticket:'الركاب والأسعار والعمولات',service:'إصدار وإدارة خدمة جديدة برقم إيصال وحسابات الموردين والعملاء'};
export default function ERPSystem({ownerPage=false}:{ownerPage?:boolean}){
 const [agencyPending,setAgencyPending]=useState(false);
 const [access,setAccess]=useState<Access>(roleAccess('viewer')),[passwordPending,setPasswordPending]=useState(false),[passwordChange,setPasswordChange]=useState(false),[passwordMissing,setPasswordMissing]=useState(false);
 const [subscription,setSubscription]=useState<AgencySubscription|null>(null); const [settings,setSettings]=useState<Settings>(defaults),[revision,setRevision]=useState(1),[owner,setOwner]=useState(false),[previewAsAgency,setPreviewAsAgency]=useState(()=>typeof window!=='undefined'&&window.location.search.includes('preview=agency')),[user,setUser]=useState({name:'SHAKO User',email:''}),[view,setView]=useState('main'),[history,setHistory]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState(0),[lastBackup,setLastBackup]=useState('—'),[mobileOpen,setMobileOpen]=useState(false),[opened,setOpened]=useState<string[]>([]),[expanded,setExpanded]=useState<Record<string,boolean>>({});
 const effectiveOwner=owner&&!previewAsAgency;
 useEffect(()=>{if(!ownerPage&&!menus[view])setOpened(v=>v.includes(view)?v:[...v,view])},[view,ownerPage]);
 function closeWindow(v:string){setOpened(w=>w.filter(x=>x!==v));setExpanded(e=>({...e,[v]:false}));if(view===v)setView('main')}
 function label(v:string){return titles[v]||(v.startsWith('bank-work:')?bankTitles[v.split(':')[1]]:v.startsWith('cash-work:')?cashTitles[v.split(':')[1]]:v.startsWith('record:')?kindsLabel(v):v.startsWith('report:')?'تقرير الأرصدة':'إدارة السجلات')}
 function kindsLabel(v:string){return ({customer:'العملاء',account:'الحسابات',employee:'الموظفون',ticket:'التذاكر',expense:'المصروفات',visa:'التأشيرات',service:'الخدمات',invoice:'الفواتير'} as Record<string,string>)[v.split(':')[1]]||'السجلات'}
 const bootstrapPending=useRef(false);
 const load=useCallback(async()=>{
  if(bootstrapPending.current)return;
  bootstrapPending.current=true;
  try{
    const b=await api('/api/bootstrap');
    if(b.owner && !ownerPage && typeof window !== 'undefined' && !window.location.search.includes('preview=agency')){
      window.location.replace('/owner');
      return;
    }
    setSettings(previous=>JSON.stringify(previous)===JSON.stringify(b.settings)?previous:b.settings);
    setRevision(b.revision);
    setOwner(b.owner);
    setAgencyPending(!!b.agencySelectionRequired);
    setAccess(b.access);
    setPasswordPending(b.passwordRequired);
    setPasswordChange(b.passwordChangeRequired);
    setPasswordMissing(b.passwordMissing);
    setUser(b.user);
    if(b.subscription){
      setSubscription(b.subscription);
    }else if(b.agency){
      setSubscription(evaluateSubscription({...b.agency,fee_minor:(b.settings?.displayAmount??0)*100,payment_status:b.settings?.paymentStatus}));
    }
    setError('');
    setStatus(0);
  }catch(e:any){
    setError(e.message);
    setStatus(e.status||503);
  }finally{
    bootstrapPending.current=false;
    setLoading(false);
  }
 },[ownerPage]);
 useEffect(()=>{load();const refresh=()=>{if(document.visibilityState==='visible')load()};document.addEventListener('visibilitychange',refresh);const t=setInterval(load,15000);return()=>{clearInterval(t);document.removeEventListener('visibilitychange',refresh)}},[load]);
 useEffect(()=>{window.addEventListener('shako-access-refresh',load);return()=>window.removeEventListener('shako-access-refresh',load)},[load]);
 useEffect(()=>{document.title=settings.systemName+' ERP'},[settings.systemName]);
 const [stagedOpToLoad,setStagedOpToLoad]=useState<any>(null);
 function handleNavigateStaged(target:string,item?:any){if(item){setStagedOpToLoad(item);try{sessionStorage.setItem('shako_pending_staged_op',JSON.stringify(item))}catch{}if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('shako-staged-select',{detail:item}));}go(target);}
 function go(next:string){setMobileOpen(false);if(ownerPage){window.location.assign(next==='main'?'/':'/?section='+encodeURIComponent(next));return}setHistory(h=>[...h,view]);setView(next)}
 useEffect(()=>{
  const handleOpenRecord=(e:any)=>{
   const d=e.detail;
   if(!d)return;
   const kind=d.kind||d.record?.kind;
   if(kind==='ticket'){
    try{sessionStorage.setItem('shako_pending_ticket_select',JSON.stringify(d))}catch{}
    go('ticket');
    setTimeout(()=>{
     window.dispatchEvent(new CustomEvent('shako-select-ticket',{detail:d}));
    },100);
   }else if(kind==='service'){
    try{sessionStorage.setItem('shako_pending_service_select',JSON.stringify(d))}catch{}
    go('service');
    setTimeout(()=>{
     window.dispatchEvent(new CustomEvent('shako-select-service',{detail:d}));
    },100);
   }else if(kind==='bank-voucher'||kind==='bank'){
    const vType=d.record?.payload?.type||'deposit';
    try{sessionStorage.setItem('shako_pending_bank_select',JSON.stringify(d))}catch{}
    go('bank-work:edit-'+vType);
    setTimeout(()=>{
     window.dispatchEvent(new CustomEvent('shako-select-bank-voucher',{detail:d}));
    },100);
   }else if(kind==='cash-voucher'||kind==='cash'){
    const vType=d.record?.payload?.type||'receipt';
    try{sessionStorage.setItem('shako_pending_cash_select',JSON.stringify(d))}catch{}
    go('cash-work:edit-'+vType);
    setTimeout(()=>{
     window.dispatchEvent(new CustomEvent('shako-select-cash-voucher',{detail:d}));
    },100);
   }else if(['customer','account','expense','employee','visa','invoice'].includes(kind)){
    go('record:'+kind);
   }
  };
  window.addEventListener('shako-open-record',handleOpenRecord);
  return()=>window.removeEventListener('shako-open-record',handleOpenRecord);
 },[view,ownerPage]);

 useEffect(()=>{if(ownerPage)return;const requested=new URLSearchParams(window.location.search).get('section');if(requested&&(requested==='agency-settings'||menus.main.some(i=>i.target===requested)))setView(requested)},[ownerPage]);
 function back(){setView(history.at(-1)||parent[view]||'main');setHistory(h=>h.slice(0,-1))}
 async function backup(){try{const data=await api('/api/owner?mode=backup');download(JSON.stringify(data,null,2),settings.systemName+'-backup-'+new Date().toISOString().slice(0,10)+'.json');setLastBackup(new Date().toLocaleString('en-GB',{timeZone:'Africa/Cairo'}));toast.success('تم تنزيل نسخة البيانات')}catch(e:any){toast.error(e.message)}}
 useEffect(()=>{if(ownerPage)return;const ctx=(document as any).modelContext;if(!ctx?.registerTool)return;const controller=new AbortController();Promise.resolve(ctx.registerTool({name:'navigate_shako_module',title:'فتح قسم في SHAKO',description:'يفتح القائمة المحددة في الواجهة دون إضافة أو تعديل بيانات.',inputSchema:{type:'object',properties:{module:{type:'string',enum:['supervisor','customers','accounts','cash','banks','control']}},required:['module'],additionalProperties:false},annotations:{readOnlyHint:true},execute:async(input:any)=>{if(!input||!['supervisor','customers','accounts','cash','banks','control'].includes(input.module))throw new Error('Invalid module');if(!moduleEnabled(settings,input.module))throw new Error('Module locked');setView(input.module==='control'?'agency-settings':input.module);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));return {view:input.module}}},{signal:controller.signal})).catch(()=>{});return()=>controller.abort()},[settings]);
 const itemAccessible = useCallback((i: MenuItem) => {
  if (effectiveOwner) return true;
  if (!i.module) return true;
  return access.modules[i.module] !== 'none';
 }, [access, effectiveOwner]);

 const activeModule = viewModule(view);
 const forbidden = !ownerPage && !effectiveOwner && !!activeModule && access.modules[activeModule] === 'none';
 const bankReport=view==='bank-work:balances'||view.startsWith('bank-work:print-')||view==='bank-reports';
 const cashReport=view==='cash-work:balances'||view.startsWith('cash-work:print-');
 const locked=settings.globalLocked||((cashReport||bankReport)&&!moduleEnabled(settings,'reports'))||(viewModule(view)&&!moduleEnabled(settings,viewModule(view)!));
 if(loading)return <div className="center-state" dir="rtl"><RefreshCw className="spin"/><p>جارٍ تحميل النظام…</p></div>;
 if(status===401||(error&&(error.includes('تسجيل الدخول')||error.includes('مصرح')||error.includes('غير مسجل'))))return <LoginPage onLoginSuccess={load} returnTo={ownerPage?'/owner':'/'}/>;
 let content;
 if(error)content=<div className="center-state" dir="rtl"><LockKeyhole/><h1>تعذر الدخول إلى النظام</h1><p>{error}</p><button className="blue-button" onClick={load}>إعادة المحاولة</button></div>;
 else if(agencyPending)content=<div className="center-state"><h1>اختر الوكالة</h1><AgencyChooser required/></div>;
 else if(passwordPending && !effectiveOwner && access.role !== 'admin' && user.email !== 'admin@shako.com')content=<AgencyPassword onDone={load} forceChange={passwordChange} missing={passwordMissing}/>;
 else if(ownerPage)content=effectiveOwner?<OwnerPanel settings={settings} revision={revision} onSave={(s,r)=>{setSettings(s);setRevision(r)}} backup={backup}/>:<div className="center-state" dir="rtl"><LockKeyhole/><h1>لوحة المالك</h1><p>هذه الصفحة متاحة لمالك النظام فقط.</p><a href="/" className="blue-button">واجهة المستخدم</a></div>;
 else if(forbidden)content=(
  <div className="center-state unauthorized" dir="rtl" style={{textAlign:'center',maxWidth:'520px',margin:'60px auto',padding:'36px 28px',background:'#ffffff',borderRadius:'16px',boxShadow:'0 10px 30px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0'}}>
    <LockKeyhole size={52} color="#dc2626" style={{margin:'0 auto 16px'}}/>
    <h1 style={{fontSize:'22px',fontWeight:800,color:'#0f172a',marginBottom:'8px'}}>غير مصرح لك بالوصول إلى هذا القسم</h1>
    <p style={{fontSize:'14px',color:'#475569',lineHeight:1.7,marginBottom:'24px'}}>
      حسابك الحالي مسجل بدور: <strong style={{color:'#0f766e',fontWeight:700}}>{roleLabels[access.role]}</strong>.<br/>
      صلاحيات ومهام هذا القسم غير مخصصة لدورك الحالي. يمكنك الرجوع إلى مساحة العمل الرئيسية.
    </p>
    <button className="blue-button" onClick={()=>setView('main')} style={{margin:'0 auto'}}>العودة للقائمة الرئيسية</button>
  </div>
 );
 else if(locked)content=<div className="center-state suspended" dir="rtl"><LockKeyhole size={52}/><h1>{settings.globalLocked?'النظام موقوف مؤقتًا':'هذا القسم موقوف مؤقتًا'}</h1><p>{settings.lockReason}</p><a className="blue-button" href={'tel:'+settings.phones.split(/[ ,،\n]+/)[0]}>التواصل مع الإدارة · <b dir="ltr">{settings.phones}</b></a>{!settings.globalLocked&&<button className="plain-button" onClick={()=>setView('main')}>العودة للقائمة</button>}</div>;
 else if(menus[view]){
  const crumb=view==='main'?'مساحة العمل':['الرئيسية',...(view==='balances'?['المشرف']:view==='add-tickets'?['العملاء']:view.startsWith('cash-')?['النقد']:view.startsWith('bank-')?['البنوك']:[]),menuNames[view]].join(' / ');
  const visibleCards = (menus[view] || []).filter(itemAccessible);
  content=(
    <section className="menu-panel" dir="rtl">
      <div className="menu-heading">
        <div>
          <p className="eyebrow">{crumb}</p>
          <h1>{view==='main'?'كل أعمالك، في مكان واحد':menuNames[view]}</h1>
          <p>{view==='main' ? (
            effectiveOwner ? 'أنت الآن في واجهة الوكالة كمالك المنصة — صلاحيات إدارية كاملة.' :
            access.role==='accountant' ? 'مساحة العمل المالية: الحسابات، الخزائن، البنوك، وإقفال الفترات والتقارير.' :
            access.role==='booking' ? 'مساحة عمل الحجوزات: إصدار التذاكر، العمليات المعلقة، والعملاء والخدمات.' :
            'إدارة السفر والحسابات والعمليات اليومية. اختر القسم للبدء.'
          ) : 'اختر العملية التي تريد تنفيذها أو راجع السجلات والتقارير.'}</p>
        </div>
        {view!=='main'&&<button className="plain-button" onClick={back}><ArrowRight size={18}/>رجوع</button>}
      </div>
      <div className="navigation-grid">
        {visibleCards.map(i=>(
          <button className={'navigation-card '+(i.module&&!moduleEnabled(settings,i.module)?'item-locked':'')} key={i.label} onClick={()=>go(i.target)}>
            <span className="navigation-card-icon"><ERPIcon name={i.icon} size={27}/></span>
            <div>
              <strong>{i.label}</strong>
              <small>{descriptions[i.target]||'فتح الشاشة وإدارة البيانات'}</small>
            </div>
            {i.module&&!moduleEnabled(settings,i.module)?<LockKeyhole className="menu-lock" size={17}/>:<ChevronLeft className="card-arrow" size={18}/>}
          </button>
        ))}
      </div>
      {visibleCards.length === 0 && (
        <div style={{padding:'32px',textAlign:'center',color:'#64748b',background:'#f8fafc',borderRadius:'12px',marginTop:'16px'}}>
          لا توجد شاشات مصرح بها في هذا القسم لصلاحية حسابك.
        </div>
      )}
      {view==='main'&&(
        <div className="workspace-note">
          <ShieldCheck size={20}/>
          <div>
            <strong>مساحة عمل مخصصة حسب الصلاحية ({effectiveOwner ? 'مالك المنصة 👑' : roleLabels[access.role]})</strong>
            <p>تم تحديد القوائم والشاشات بدقة وفقاً لاسم المستخدم وصلاحياته المعتمدة.</p>
          </div>
        </div>
      )}
    </section>
  );
 }

 function renderWindow(v:string){
  const wMod = viewModule(v);
  if (!ownerPage && !effectiveOwner && !!wMod && access.modules[wMod] === 'none') {
    return (
      <section className="app-window" dir="rtl">
        <div className="window-title">
          <span className="page-title"><LockKeyhole size={20} color="#dc2626"/> قسم غير مصرح</span>
          <WindowControls refresh={load} close={()=>closeWindow(v)}/>
        </div>
        <div className="window-body" style={{padding:'40px',textAlign:'center'}}>
          <LockKeyhole size={48} color="#dc2626" style={{margin:'0 auto 12px'}}/>
          <h3>ليس لديك صلاحية للوصول إلى هذا القسم</h3>
          <p style={{color:'#64748b'}}>هذا السجل مخصص لأدوار أخرى في الوكالة وفقاً لاسم المستخدم.</p>
          <button className="blue-button" onClick={()=>closeWindow(v)} style={{margin:'16px auto 0'}}>إغلاق الشاشة</button>
        </div>
      </section>
    );
  }
  let panel=v==='my-password'?<section className="settings-card"><h2>كلمة مرور حسابي</h2><AgencyPassword changeOnly onDone={()=>{toast.success('تم تغيير كلمة المرور');load()}}/></section>:v==='agency-settings'||v==='access'||v==='info'?<AgencyPanel settings={settings} onSave={()=>load()} backup={backup} owner={effectiveOwner} userEmail={user.email}/>:v==='period-closing'?<PeriodClosingWorkspace settings={settings} onUpdated={()=>load()} onClose={()=>closeWindow(v)}/>:v==='staged-ops'?<StagedOperationsWorkspace settings={settings} onNavigate={(target,item)=>handleNavigateStaged(target,item)}/>:v==='dashboard'?<Dashboard settings={settings}/>:v==='ticket'?<TicketEntry initialStagedOp={stagedOpToLoad} onStagedConsumed={()=>setStagedOpToLoad(null)}/>:v==='service'?<ServiceEntry onSaved={load}/>:v.startsWith('record:')?<RecordManager kind={v.split(':')[1]} initialStatus={v.split(':')[2]}/>:v.startsWith('report:')&&['statement','daily-sales','airline-sales','economy-sales','ticket-receipt','refunded-tickets','economy-tickets'].includes(v.split(':')[1])?<FinancialReport mode={v.split(':')[1]} settings={settings}/>:v.startsWith('report:')?<BalanceReport report={v.split(':')[1]} settings={settings}/>:<div className="info-panel" dir="rtl"><h2>{v==='access'?'صلاحيات المستخدمين':'معلومات النظام'}</h2>{v==='access'?<p>{effectiveOwner?'إدارة حسابات المستخدمين متاحة في لوحة المالك.':'تواصل مع مالك النظام لتعديل صلاحيات الدخول.'}</p>:<dl><dt>اسم النظام</dt><dd>{settings.systemName}</dd><dt>السنة المالية</dt><dd>{settings.financialYear}</dd><dt>الدعم الفني</dt><dd dir="ltr">{settings.phones}</dd></dl>}{effectiveOwner&&<a href="/owner" className="blue-button">فتح لوحة المالك</a>}</div>;
  if(v.startsWith('bank-work:'))return <BankWorkspace mode={v.split(':')[1]} settings={settings} initialStagedOp={stagedOpToLoad} onStagedConsumed={()=>setStagedOpToLoad(null)} onClose={()=>closeWindow(v)}/>;
  if(v.startsWith('cash-work:'))return <CashWorkspace mode={v.split(':')[1]} settings={settings} initialStagedOp={stagedOpToLoad} onStagedConsumed={()=>setStagedOpToLoad(null)} onClose={()=>closeWindow(v)}/>;
  return <section className="app-window"><div className="window-title"><span className="page-title"><ERPIcon name={v==='staged-ops'?'staged-ops':v==='ticket'?'gds-tickets':v==='service'?'services':v==='dashboard'?'supervisor':v.startsWith('report:')?'management-reports':'accounts'} size={21}/>{label(v)|| (v.startsWith('report:')?'إجمالي الأرصدة':'إدارة السجلات')}</span><WindowControls refresh={load} close={()=>closeWindow(v)}/></div><div className="window-body">{panel}</div></section>
 }
 const pageLabel=ownerPage?'لوحة المالك':menuNames[view]||titles[view]||(view.startsWith('bank-work:')?bankTitles[view.split(':')[1]]:view.startsWith('cash-work:')?'عمليات النقد':view.startsWith('report:')?'التقارير':'إدارة السجلات');
 const navActive=(target:string)=>!ownerPage&&(target===view||(target==='staged-ops'&&view==='staged-ops')||(target==='customers'&&(activeModule==='tickets'||activeModule==='customers'))||(target==='supervisor'&&['dashboard','balances'].includes(view))||(target==='accounts'&&activeModule==='accounts')||(target==='cash'&&view.startsWith('cash-'))||(target==='banks'&&view.startsWith('bank-'))||(target==='agency-settings'&&['agency-settings','access','info'].includes(view)));
 const sidebar=<><a href="/" className="sidebar-brand"><span className="brand-mark">{settings.logoKey?<img src={'/api/agency/logo?v='+encodeURIComponent(settings.logoKey)} alt="شعار الوكالة"/>:<Plane size={23}/>}</span><span>{settings.systemName}<small>TRAVEL & FINANCE</small></span></a><p className="sidebar-caption">مساحة العمل</p><nav className="primary-nav" aria-label="الأقسام الرئيسية"><button className={!ownerPage&&view==='main'?'active':''} onClick={()=>go('main')} aria-current={!ownerPage&&view==='main'?'page':undefined}><Home size={20}/><span>الرئيسية</span></button>{menus.main.filter(itemAccessible).map(i=><button key={i.target} className={navActive(i.target)?'active':''} aria-current={navActive(i.target)?'page':undefined} onClick={()=>go(i.target)}><ERPIcon name={i.icon} size={20}/><span>{i.label}</span>{i.module&&!moduleEnabled(settings,i.module)&&<LockKeyhole size={14}/>}</button>)}</nav><div className="sidebar-support"><Headphones size={20}/><div><strong>الدعم الفني</strong><a href={'tel:'+settings.phones.split(/[ ,،\n]+/)[0]} dir="ltr">{settings.phones}</a></div></div><div className="sidebar-user"><span className="user-avatar">{user.name.trim().slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><small style={{display:'inline-block',padding:'2px 6px',borderRadius:'4px',marginTop:'2px',fontSize:'10px',fontWeight:700,background:effectiveOwner?'#fef3c7':access.role==='admin'?'#e0f2fe':access.role==='accountant'?'#f3e8ff':access.role==='booking'?'#dcfce7':'#f1f5f9',color:effectiveOwner?'#92400e':access.role==='admin'?'#0369a1':access.role==='accountant'?'#7e22ce':access.role==='booking'?'#15803d':'#475569'}}>{effectiveOwner?'👑 مالك المنصة':roleLabels[access.role]}</small></div></div></>;
 return <AgencyAccess.Provider value={access}><AgencySettings.Provider value={settings}><div className="erp-shell" dir="rtl">{previewAsAgency&&<div style={{background:'linear-gradient(90deg, #0369a1 0%, #0284c7 100%)',color:'#fff',padding:'9px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'13px',fontWeight:700,zIndex:99,position:'relative',boxShadow:'0 4px 12px rgba(2,132,199,0.3)'}}><span>👁️ وضع المعاينة: أنت تتصفح النظام الآن كمعاينة لشاشة (الوكالة المشتركة) — منصة المالك المستقلة مفصولة بالكامل.</span><a href="/owner" style={{background:'#fff',color:'#0369a1',border:'none',borderRadius:'6px',padding:'5px 14px',fontWeight:800,fontSize:'12.5px',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:'4px'}}>العودة لمنصة المالك المركزية 👑</a></div>}<Toaster position="top-center" richColors dir="rtl"/><aside className="erp-sidebar">{sidebar}</aside><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent className="mobile-sidebar" side="right" dir="rtl"><SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle><SheetDescription className="sr-only">اختر قسمًا للانتقال إلى مساحة العمل.</SheetDescription>{sidebar}</SheetContent></Sheet><div className="erp-main"><header className="topbar"><button className="mobile-menu" aria-label="فتح القائمة الرئيسية" onClick={()=>setMobileOpen(true)}><Menu size={22}/></button><div className="topbar-context"><div style={{display:'flex',alignItems:'center',gap:'8px'}}><span className="company">{settings.companyName}</span><span style={{fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'6px',background:effectiveOwner?'#fef3c7':access.role==='admin'?'#e0f2fe':access.role==='accountant'?'#f3e8ff':access.role==='booking'?'#dcfce7':'#f1f5f9',color:effectiveOwner?'#92400e':access.role==='admin'?'#0369a1':access.role==='accountant'?'#7e22ce':access.role==='booking'?'#15803d':'#475569'}}>{effectiveOwner?'👑 مالك المنصة':roleLabels[access.role]}</span></div><span className="topbar-page">{pageLabel}</span></div><div className="top-actions">{owner&&<button type="button" onClick={()=>setPreviewAsAgency(!previewAsAgency)} className="plain-button" title={previewAsAgency?"العودة لوضع مالك النظام":"معاينة النظام كما تراه الوكالة المشتركة"} style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'12px',fontWeight:700,padding:'4px 9px',borderRadius:'6px',background:previewAsAgency?'#fef3c7':'#f0fdf4',color:previewAsAgency?'#b45309':'#15803d',border:`1px solid ${previewAsAgency?'#fde68a':'#86efac'}`}}>{previewAsAgency?'وضع الوكالة (العودة كمالك 👑)':'معاينة كوكالة 👁️'}</button>}{!ownerPage&&!agencyPending&&<AgencyChooser/>}{!ownerPage&&<a href="/mobile" target="_blank" rel="noopener noreferrer" aria-label="تطبيق الهاتف المحمول للمدير" title="فتح تطبيق الهاتف المحمول (PWA)" style={{color:'#0284c7',display:'inline-flex',alignItems:'center',padding:'4px 6px',borderRadius:'6px',background:'rgba(2,132,199,0.08)'}}><Smartphone size={19}/></a>}{!ownerPage&&!passwordPending&&<OperationReports settings={settings}/>}{(access.manageSettings||access.manageUsers)&&!passwordPending&&<button onClick={()=>go('agency-settings')} aria-label="إعدادات الوكالة" title="إعدادات الوكالة"><SettingsIcon size={20}/></button>}{!effectiveOwner&&!passwordPending&&<button onClick={()=>go('my-password')} aria-label="تغيير كلمة مرور حسابي" title="تغيير كلمة مرور حسابي"><KeyRound size={20}/></button>}{effectiveOwner&&<a href={ownerPage?'/':'/owner'} aria-label={ownerPage?'واجهة المستخدم':'لوحة المالك'} title={ownerPage?'واجهة المستخدم':'لوحة المالك'}>{ownerPage?<Home size={20}/>:<SettingsIcon size={20}/>}</a>}{access.backup&&!passwordPending&&<button onClick={backup} aria-label="تنزيل نسخة احتياطية" title="تنزيل نسخة احتياطية"><Download size={20}/></button>}<button type="button" aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={async()=>{try{await fetch('/api/auth/logout',{method:'POST'});}catch{}load();}}><Power size={20}/></button></div></header><main className={'workspace '+(ownerPage?'owner-workspace':(view.startsWith('cash-work:')&&!cashReport||view.startsWith('bank-work:')&&!bankReport)?'cash-workspace':!menus[view]||locked||error?'window-workspace':'')}>{content}{!ownerPage&&opened.map(v=><WorkspaceWindow.Provider key={v} value={{active:view===v&&!locked&&!error&&!loading&&!passwordPending&&!agencyPending,refreshKey:String(revision),expanded:!!expanded[v],minimize:()=>setView('main'),toggle:()=>setExpanded(e=>({...e,[v]:!e[v]}))}}><div className={'retained-window '+(expanded[v]?'is-maximized':'')} hidden={view!==v||!!locked||!!error||loading||passwordPending||agencyPending}>{renderWindow(v)}</div></WorkspaceWindow.Provider>)}</main>{!ownerPage&&!passwordPending&&opened.length>0&&<nav className="window-taskbar" aria-label="الشاشات المفتوحة">{opened.map(v=><button key={v} className={view===v?'active':''} onClick={()=>go(v)}><ERPIcon name={v==='staged-ops'?'staged-ops':v==='ticket'?'gds-tickets':v==='service'?'services':v.startsWith('bank-')?'banks':'accounts'} size={16}/>{label(v)}{view!==v&&<small>مسودة محفوظة</small>}</button>)}</nav>}<footer className="statusbar"><span>السنة المالية <b dir="ltr">{settings.financialYear}</b></span><span>آخر نسخة احتياطية <b dir="ltr">{lastBackup}</b></span><span>الوكالة <b>{settings.companyName}</b></span>{subscription&&(subscription.paymentStatus!=='paid'||subscription.feeMinor>0)&&<span className={'status-subscription '+(subscription.paymentStatus==='paid'?'paid':'unpaid')+(subscription.inGracePeriod?' in-grace':'')}>{subscription.paymentStatus==='paid'?<>الاشتراك: <b>مسدد</b> ({money(subscription.feeMinor)} {subscription.currency}){subscription.dueOn&&<small> · الاستحقاق: {subscription.dueOn}</small>}</>:<>قيمة الاشتراك: <b dir="ltr">{money(subscription.feeMinor)} {subscription.currency}</b> <span className="unpaid-tag">({subscription.paymentStatus==='partial'?'مسدد جزئياً':'غير مسدد'})</span>{subscription.inGracePeriod?<span className="grace-badge">⏳ فترة سماح: متبقي {subscription.daysRemaining} {subscription.daysRemaining===1?'يوم':subscription.daysRemaining===2?'يومان':'أيام'} قبل الإقفال</span>:subscription.dueOn?<span className="due-badge">· مستحق في: {subscription.dueOn}</span>:null}</>}</span>}</footer></div></div></AgencySettings.Provider></AgencyAccess.Provider>
}
