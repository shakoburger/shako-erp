'use client';
import {AgencyLetterhead,AgencyReportFooter} from '@/components/agency-letterhead';
import {useCallback,useEffect,useState} from 'react';
import {useWorkspaceWindow,WindowControls} from '@/components/workspace-window';
import {useAgencyAccess} from '@/components/access-context';
import {ReportExports,permittedExport} from '@/components/report-export';
import {ERPIcon} from '@/components/erp-icons';
import {Search,RefreshCw,X,Minus,Printer,Download,CalendarDays} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {cashTitles,cashTypeLabel} from '@/lib/cash';
import {money,today,moduleEnabled,type Settings,type RecordRow} from '@/lib/domain';
import {api,download} from './erp-system';
import {StagedOperationsStrip} from '@/components/staged-operations-strip';
import {SearchablePicker} from '@/components/searchable-picker';
import {WhatsAppDialog} from '@/components/whatsapp-dialog';
import {buildReceiptWhatsAppMessage} from '@/lib/whatsapp';
type CashData={accounts:RecordRow[];archivedAccounts?:RecordRow[];treasuries:RecordRow[];currencies:{id?:string;code:string;name:string;rate:number;active?:boolean}[];counterparties:{id:string;kind:string;name:string;currency:string;payload?:any}[];vouchers:RecordRow[];ledger:RecordRow[];nextNumber:string};
function useCash(){const [data,setData]=useState<CashData>({accounts:[],treasuries:[],currencies:[],counterparties:[],vouchers:[],ledger:[],nextNumber:'—'}),[error,setError]=useState(''),[loading,setLoading]=useState(true);const load=useCallback(async()=>{try{setData(await api('/api/cash'));setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}},[]);const w=useWorkspaceWindow(),access=useAgencyAccess(),canManage=access.modules.cash==='manage';useEffect(()=>{if(w.active)load()},[load,w.active,w.refreshKey]);return {data,error,loading,load}}
export function CashField({label,value,onChange,type='text',readOnly=false,required=false,className='',...rest}:{label:string;value:any;onChange?:(v:any)=>void;type?:string;readOnly?:boolean;required?:boolean;className?:string;[key:string]:any}){return <label className={'input-group cash-field '+className}><span>{label}</span><input aria-label={label} dir={type==='text'?'auto':'ltr'} type={type} value={value??''} readOnly={readOnly} required={required} onChange={e=>onChange?.(type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)} min={type==='number'?0:undefined} step={type==='number'?'0.01':undefined} {...rest}/></label>}
export function CashSelect({label,value,onChange,options,required=false,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];required?:boolean;disabled?:boolean}){return <SearchablePicker label={label} value={value} onChange={onChange} options={options} disabled={disabled} placeholder="اختر حسابًا" className="cash-field" dir="rtl"/>;}
function CashTitle({mode,onClose,onRefresh}:{mode:string;onClose:()=>void;onRefresh:()=>void}){return <div className="window-title"><span className="page-title"><ERPIcon name="cash" size={21}/>{cashTitles[mode]}</span><WindowControls refresh={onRefresh} close={onClose}/></div>}
const cashMenu=[['cash-account','إضافة حساب'],['cash-payment','صرف نقد'],['cash-receipt','إستلام نقد'],['foreign-cash','النقد الأجنبي'],['cash-balances','إجمالي أرصدة النقد'],['cash-currency','إضافة عملة']];
function BackgroundMenu({mode}:{mode:string}){const type=mode.replace(/^(edit|print)-/,'');const catalog=['account','currency'].includes(type);const items=catalog?cashMenu:[[type==='forex'?'foreign-cash':type==='receipt'?'cash-receipt':'cash-payment',cashTypeLabel(type)],['cash-edit',type==='forex'?'تعديل شراء النقد الأجنبي':type==='receipt'?'تعديل الإستلام':'تعديل الصرف'],['cash-voucher',type==='receipt'?'إيصال الإستلام':'إيصال الصرف']];return <section className="menu-panel cash-background" aria-hidden="true" dir="rtl"><h1 className="ribbon">القائمة ‹ النقد{!catalog&&' ‹ '+cashTypeLabel(type)}</h1><div className="icon-menu">{items.map(([icon,label])=><div className="menu-item" key={label}><ERPIcon name={icon} size={26}/><span>{label}</span></div>)}<div className="menu-item"><ERPIcon name="back" size={26}/><span>القائمة السابقة</span></div></div></section>}
const newForm=(type:string)=>({type,date:today(),treasuryId:'',counterpartyId:'',person:'',amount:'',notes:'',conversionRate:1,transactionCurrency:'',treasuryCurrency:'',crossCurrency:false,settlementCurrency:'SDG',settlementTreasuryId:'',settlementAmount:'',coveredCurrency:'USD',coveredAmount:''});
export function CashWorkspace({mode,settings,initialStagedOp,onStagedConsumed,onClose}:{mode:string;settings:Settings;initialStagedOp?:any;onStagedConsumed?:()=>void;onClose:()=>void}){
 const w=useWorkspaceWindow(),access=useAgencyAccess(),canManage=access.modules.cash==='manage'&&(mode!=='currency'||access.manageSettings);
 const {data,error,loading,load}=useCash();const type=mode.replace(/^(edit|print)-/,'');const editing=mode.startsWith('edit-');const catalog=type==='account'||type==='currency';
 const [form,setForm]=useState<any>(catalog?{name:'',currency:type==='account'?'MULTI':'',rate:1,parentId:''}:newForm(type)),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const [accountToDelete,setAccountToDelete]=useState<any>(null),[accountConfirm,setAccountConfirm]=useState(false),[showArchived,setShowArchived]=useState(false);
 const [whatsAppModal,setWhatsAppModal]=useState<{name:string;phone:string;message:string}|null>(null);
 async function removeAccount(acc?:any){
  const target=acc||form;if(!target?.id)return;setBusy(true);
  try{
   const res:any=await api('/api/cash',{method:'DELETE',body:JSON.stringify({action:'account',id:target.id,updatedAt:target.updatedAt})});
   toast.success(res?.mode==='archived'?'تم حذف وأرشفة الحساب من القوائم النشطة':'تم حذف الحساب نهائياً');
   setAccountConfirm(false);setAccountToDelete(null);clear();await load();
  }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 async function restoreAccount(acc:any){
  if(!acc?.id)return;setBusy(true);
  try{
   await api('/api/cash',{method:'DELETE',body:JSON.stringify({action:'account',id:acc.id,updatedAt:acc.updatedAt,restore:true})});
   toast.success(`تم استعادة الحساب «${acc.name}» بنجاح`);
   await load();
  }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{if(initialStagedOp){onSelectStaged(initialStagedOp);onStagedConsumed?.();}},[initialStagedOp]);
 useEffect(()=>{
  const onStaged=(e:any)=>{
   if(e.detail&&e.detail.payload?.type?.startsWith('cash-')){
    onSelectStaged(e.detail);
   }
  };
  window.addEventListener('shako-staged-select',onStaged);
  return()=>window.removeEventListener('shako-staged-select',onStaged);
 },[data]);
 const set=(key:string,v:any)=>setForm((f:any)=>({...f,[key]:v}));const treasury=data.treasuries.find(a=>a.id===form.treasuryId);const foreign=data.counterparties.find(a=>a.id===form.counterpartyId);
 const accountLabel=(a:any)=>{
  let t='حساب';
  if(a.kind==='customer')t=a.payload?.accountType==='airline'?'خط طيران':a.payload?.accountType==='supplier'?'مورد':'عميل';
  else if(a.kind==='cash-account')t='خزينة';
  else if(a.kind==='bank-account')t='بنك';
  else if(a.kind==='expense')t='مصروفات';
  else if(a.kind==='account'){
   const st=a.payload?.accountType;
   t=st==='expense'?'مصروفات':st==='commission'?'عمولات':st==='revenue'?'إيرادات':'حساب عام';
  }else t=({customer:"عميل",account:"حساب",employee:"موظف","cash-account":"خزينة","bank-account":"بنك"} as Record<string,string>)[a.kind]||a.kind;
  return a.name+' · '+t+(a.kind==='customer'?'':' · '+(a.currency==='MULTI'?'متعدد العملات':a.currency));
 };
 const isCashCounterpartyAllowed=(a:any)=>{
  if(a.kind==='cash-account')return false;
  return ['customer','bank-account','expense','account','employee'].includes(a.kind);
 };
 const counterpartCurrency=foreign?.currency==='MULTI'||foreign?.kind==='customer'?(form.transactionCurrency||'USD'):foreign?.currency||'USD';
 const cashAccounts=data.treasuries.filter(a=>a.kind==='cash-account');
 const eligibleCashAccounts=cashAccounts.filter(a=>a.currency===(form.settlementCurrency||'SDG')||a.currency==='MULTI');
 const settlementTreasuryOptions=eligibleCashAccounts.length>0?eligibleCashAccounts.map(a=>({value:a.id,label:a.name+' · خزينة · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)})):[{value:'',label:`⚠️ لا توجد خزينة بعملة ${form.settlementCurrency||'SDG'} أو متعددة العملات`}];
 const selectedSettlementTreasury=cashAccounts.find(a=>a.id===form.settlementTreasuryId);
 const counterOptions=data.counterparties.filter(isCashCounterpartyAllowed).filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.kind==='customer'||a.currency==='MULTI').filter(a=>a.id!==form.treasuryId&&(form.crossCurrency||!treasury||treasury.currency==='MULTI'||(type==='forex'?a.currency!==treasury.currency:(a.kind==='customer'||a.currency==='MULTI'||a.currency===treasury.currency)))).map(a=>({value:a.id,label:accountLabel(a)}));
 const cashboxOptions=data.treasuries.filter(a=>a.kind==='cash-account'&&(!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.currency==='MULTI')).filter(a=>!foreign||(type==='forex'?a.currency!==foreign.currency:(a.currency==='MULTI'||foreign.kind==='customer'||foreign.currency==='MULTI'||a.currency===foreign.currency))).map(a=>({value:a.id,label:a.name+' · خزينة · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)}));
 const effectiveRate=type==='forex'?Number(form.conversionRate):1;const currencyName=(code:string)=>code==='MULTI'?'متعدد العملات':data.currencies.find(c=>c.code===code)?.name||code;
 function clear(){setForm(catalog?{name:'',currency:type==='account'?'MULTI':'',rate:1,parentId:''}:newForm(type));setSearch('')}
 function chooseTreasury(id:string){const a=data.treasuries.find(x=>x.id===id),counter=data.counterparties.find(x=>x.id===form.counterpartyId);const keep=counter&&counter.id!==id&&(type==='forex'?counter.currency!==a?.currency:(counter.kind==='customer'||counter.currency==='MULTI'||counter.currency===a?.currency||a?.currency==='MULTI'));setForm((f:any)=>({...f,treasuryId:id,counterpartyId:keep?counter.id:'',transactionCurrency:keep?(counter.kind==='customer'||counter.currency==='MULTI'?(a?.currency==='MULTI'?(f.treasuryCurrency||'USD'):a?.currency||'USD'):counter.currency):a?.currency||'',conversionRate:keep&&counter.currency!==a?.currency&&counter.kind!=='customer'&&counter.currency!=='MULTI'&&a?.currency!=='MULTI'?'':1}))}
 function chooseCounter(id:string){const a=data.counterparties.find(x=>x.id===id);setForm((f:any)=>({...f,counterpartyId:id,transactionCurrency:a?.kind==='customer'||a?.currency==='MULTI'?(treasury?.currency==='MULTI'?(f.treasuryCurrency||'USD'):treasury?.currency||f.transactionCurrency||'USD'):(a?.currency||''),conversionRate:a?.currency===treasury?.currency||a?.kind==='customer'||a?.currency==='MULTI'||treasury?.currency==='MULTI'?1:''}))}
 function onSelectStaged(op:any){
  const p=op.payload||{};
  const matchedCash=data.treasuries.find(a=>a.id===p.treasuryId||a.name===p.treasuryName);
  const matchedCounter=data.counterparties.find(a=>a.id===p.counterpartyId||a.id===p.customerId||a.name===p.counterpartyName||a.name===p.customerName);
  const amt=op.amount?op.amount/100:(p.sellingPrice||p.fare||'');
  setForm((f:any)=>({
   ...f,
   _stagedId:op.id,
   _attachment:p.attachment||null,
   date:op.date||f.date,
   treasuryId:matchedCash?.id||f.treasuryId,
   counterpartyId:matchedCounter?.id||f.counterpartyId,
   amount:amt||f.amount,
   person:p.person||op.name||f.person,
   notes:p.notes||('عملية معلقة: '+(op.name||op.code)),
   crossCurrency:!!p.crossCurrency,
   settlementCurrency:p.settlementCurrency||p.currency||'SDG',
   settlementTreasuryId:p.settlementTreasuryId||p.treasuryId||'',
   settlementAmount:p.settlementAmount||(p.crossCurrency?amt:''),
   coveredCurrency:p.coveredCurrency||'USD',
   coveredAmount:p.coveredAmount?p.coveredAmount/100:(p.coveredAmount||''),
   conversionRate:p.conversionRate||1,
   transactionCurrency:op.currency||f.transactionCurrency,
   treasuryCurrency:op.currency||f.treasuryCurrency
  }));
  toast.info('تم إنزال بيانات العملية المعلقة في نموذج النقد: '+(op.name||op.code));
 }
 async function find(explicitCode?: string){
  const target = (explicitCode || search).trim();
  const fresh:CashData=await api('/api/cash');
  const row=fresh.vouchers.find(v=>(v.code===target.padStart(8,'0')||v.id===target||v.payload?.receiptNumber===target)&&(!type||v.payload.type===type));
  if(!row){toast.error('رقم الإيصال غير موجود لهذا النوع');return}
  if(row.payload.status!=='active'){toast.error('هذا الإيصال محذوف');return}
  loadVoucherRow(row);
  load();
 }
 function loadVoucherRow(row:any){
  const p=row.payload||{};
  setSearch(row.code||'');
  setForm({id:row.id,updatedAt:row.updatedAt,type:p.type||type,date:row.date,treasuryId:p.treasuryId,counterpartyId:p.counterpartyId,person:p.person,amount:(type==='forex'?p.treasuryMinor:p.transactionMinor)/100,notes:p.notes,conversionRate:p.rate,transactionCurrency:p.transactionCurrency,treasuryCurrency:p.treasuryCurrency,crossCurrency:!!p.crossCurrency,settlementCurrency:p.crossCurrency?p.treasuryCurrency:'SDG',settlementTreasuryId:p.crossCurrency?p.treasuryId:'',settlementAmount:p.crossCurrency?p.treasuryMinor/100:'',coveredCurrency:p.coveredCurrency||p.transactionCurrency||'USD',coveredAmount:p.crossCurrency?(p.coveredAmount?p.coveredAmount/100:p.transactionMinor/100):''});
 }
 useEffect(()=>{
  const onSelect=(e:any)=>{
   if(!e.detail)return;
   const d=e.detail;
   if(d.record&&d.record.payload){
    loadVoucherRow(d.record);
    toast.info(`تم فتح سند النقد «${d.record.code||d.id}» للتعديل ✏️`);
   }else if(d.code||d.id){
    find(d.code||d.id).catch(()=>{});
   }
  };
  window.addEventListener('shako-select-cash-voucher',onSelect);
  return()=>window.removeEventListener('shako-select-cash-voucher',onSelect);
 },[type]);
 useEffect(()=>{
  try{
   const saved=sessionStorage.getItem('shako_pending_cash_select');
   if(saved){
    const parsed=JSON.parse(saved);
    if(parsed){
     if(parsed.record&&parsed.record.payload){
      loadVoucherRow(parsed.record);
      sessionStorage.removeItem('shako_pending_cash_select');
      toast.info(`تم فتح سند النقد «${parsed.record.code||parsed.id}» للتعديل ✏️`);
     }else if(parsed.code||parsed.id){
      sessionStorage.removeItem('shako_pending_cash_select');
      find(parsed.code||parsed.id).catch(()=>{});
     }
    }
   }
  }catch{}
 },[type]);

 async function save(e:any){
  e.preventDefault();
  setBusy(true);
  try{
   const effTreasuryCurrency=form.crossCurrency?form.settlementCurrency:(treasury?.currency==='MULTI'?(form.treasuryCurrency||'USD'):treasury?.currency);
   let row;
   if(catalog){
    row=await api('/api/cash',{method:'POST',body:JSON.stringify({action:type,id:form.id,name:form.name,currency:type==='account'?(form.currency||'MULTI'):form.currency,rate:Number(form.rate),...(type==='account'&&form.parentId?{parentId:form.parentId}:{})})});
   }else{
    if(editing&&!form.id)throw new Error('ابحث عن رقم الإيصال أولًا');
    if(form.crossCurrency){
     if(!form.settlementTreasuryId)throw new Error(`الرجاء اختيار حساب خزينة بعملة ${form.settlementCurrency||'SDG'} أو متعدد العملات`);
     const selTr=cashAccounts.find(a=>a.id===form.settlementTreasuryId);
     if(selTr&&selTr.currency!=='MULTI'&&selTr.currency!==form.settlementCurrency){
      throw new Error(`حساب الخزنة (${selTr.name}) عملته ${selTr.currency} ولا يطابق عملة السداد (${form.settlementCurrency})`);
     }
     if(!form.settlementAmount||Number(form.settlementAmount)<=0)throw new Error('الرجاء إدخال المبلغ المسدد بالعملة الأخرى');
     if(!form.coveredAmount||Number(form.coveredAmount)<=0)throw new Error('الرجاء إدخال المبلغ المغطى للحساب المقابل');
    }
    const targetTreasuryId=form.crossCurrency?form.settlementTreasuryId:form.treasuryId;
    const effTreasuryCurrency=form.crossCurrency?form.settlementCurrency:(treasury?.currency==='MULTI'?(form.treasuryCurrency||'USD'):treasury?.currency);
    const sAmt=Number(form.crossCurrency?(form.settlementAmount||form.amount):form.amount);
    const cAmt=form.crossCurrency?Number(form.coveredAmount||0):undefined;
    const rate=form.crossCurrency?Number(form.conversionRate||(sAmt>0&&cAmt&&cAmt>0?(sAmt/cAmt).toFixed(4):1)):effectiveRate;
    row=await api('/api/cash',{method:'POST',body:JSON.stringify({action:'voucher',id:form.id,updatedAt:form.updatedAt,type,date:form.date,treasuryId:targetTreasuryId,counterpartyId:form.counterpartyId,person:form.person,amount:sAmt,notes:form.notes,treasuryCurrency:effTreasuryCurrency,transactionCurrency:type==='forex'?undefined:(form.crossCurrency?counterpartCurrency:effTreasuryCurrency),crossCurrency:!!form.crossCurrency,coveredCurrency:form.crossCurrency?counterpartCurrency:undefined,coveredAmount:cAmt,conversionRate:rate})});
    if(form._stagedId){
     try{
      await api('/api/staged-operations?id='+encodeURIComponent(form._stagedId),{method:'DELETE'});
      toast.success('تم إنزال العملية وحذفها آليًا من قائمة المعلقات لمنع التكرار');
     }catch(err){console.error('Delete staged op error',err)}
    }
    }
   if(!catalog&&type==='receipt'&&row?.code){
    const custPhone=(foreign as any)?.payload?.phone||'';
    const waMsg=buildReceiptWhatsAppMessage({
     receiptNumber:row.code,
     date:form.date,
     customerName:foreign?.name||form.person||'العميل',
     amount:form.crossCurrency?Number(form.settlementAmount):Number(form.amount),
     currency:effTreasuryCurrency,
     notes:form.notes,
     collectorName:form.person,
     treasuryName:treasury?.name,
     settings
    });
    setWhatsAppModal({name:foreign?.name||form.person||'العميل',phone:custPhone,message:waMsg});
    toast.success('تم حفظ الإيصال رقم '+row.code,{
     action:{
      label:'إرسال WhatsApp 📲',
      onClick:()=>setWhatsAppModal({name:foreign?.name||form.person||'العميل',phone:custPhone,message:waMsg})
     }
    });
   }else{
    toast.success(catalog?'تم حفظ البيانات':'تم حفظ الإيصال رقم '+row.code);
   }
   clear();
   await load();
  }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 async function remove(){setBusy(true);try{await api('/api/cash',{method:'DELETE',body:JSON.stringify({id:form.id,updatedAt:form.updatedAt})});toast.success('تم حذف الإيصال من الأرصدة وحفظه في سجل العمليات');setConfirm(false);clear();load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 const errorUI=error?<p className="cash-error" role="alert">{error}<button type="button" onClick={load}>إعادة المحاولة</button></p>:loading?<p className="cash-error">جارٍ تحميل البيانات…</p>:null;
 if(mode==='balances'||mode.startsWith('print-'))return <CashReport mode={mode} settings={settings} data={data} error={error} loading={loading} load={load} onClose={onClose}/>;
 return <div className="cash-screen"><BackgroundMenu mode={mode}/><Dialog open={w.active} onOpenChange={v=>!v&&onClose()}><DialogContent showCloseButton={false} className={(w.expanded?'is-maximized ':'')+'cash-dialog '+(catalog?'cash-catalog ':'')+(editing?'cash-editing':'')} dir="rtl" aria-describedby="cash-dialog-description"><DialogTitle className="sr-only">{cashTitles[mode]}</DialogTitle><DialogDescription id="cash-dialog-description" className="sr-only">{catalog?'أضف بيانات الحساب أو العملة.':'أدخل حساب الخزينة والحساب المقابل والمبلغ ثم احفظ الإيصال.'}</DialogDescription><CashTitle mode={mode} onClose={onClose} onRefresh={load}/>{errorUI}<form onSubmit={save} className="cash-dialog-body">
 {!catalog&&moduleEnabled(settings,'stagedOps')&&<StagedOperationsStrip types={type==='receipt'?['cash-receipt']:type==='payment'?['cash-payment']:['cash-receipt','cash-payment']} onSelect={onSelectStaged} refreshKey={w.refreshKey} title="عمليات نقدية معلقة بانتظار الإنزال في النظام"/>}
 {form._attachment&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'6px 12px',marginBottom:'8px',fontSize:'12px',color:'#1e40af'}}><span>📎 مرفق العملية المعلقة: <b>{form._attachment.name}</b></span><a href={form._attachment.data} download={form._attachment.name} className="plain-button" style={{color:'#2563eb',fontWeight:600}}>تنزيل / فتح المرفق</a></div>}
 {catalog?<>
  {type==='account'&&<div className="cash-row"><CashSelect label="الحساب الرئيسي" value={form.parentId||'none'} onChange={v=>set('parentId',v==='none'?'':v)} options={[{value:'none',label:'بدون حساب رئيسي'},...data.counterparties.filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)).filter(x=>x.kind==='account'&&(!form.currency||x.currency===form.currency)).map(x=>({value:x.id,label:x.name}))]}/></div>}
  <div className="cash-row"><CashField label={type==='account'?'إسم الحساب':'اسم العملة'} value={form.name} onChange={v=>set('name',v)} required placeholder={type==='account'?'الرجاء إضافة إسم الحساب':'اسم العملة'}/></div>
  <div className="cash-row cash-pair">{type==='account'?<CashSelect label="عملة الحساب" value={form.currency} onChange={v=>{set('currency',v);set('parentId','');set('rate',v==='MULTI'?1:(data.currencies.find(c=>c.code===v)?.rate||1))}} options={[{value:'MULTI',label:'متعدد العملات (يقبل جميع العملات)'},...data.currencies.filter(c=>c.active!==false||form.id&&c.code===form.currency).map(c=>({value:c.code,label:c.name+' · '+c.code}))]} required/>:<CashField label="العملة" value={form.currency} onChange={v=>set('currency',v.toUpperCase())} placeholder="USD" readOnly={!!form.id} pattern="[A-Z]{3,8}" required/>}<CashField label="سعر الصرف" value={form.rate} type="number" min="0.00000001" step="any" onChange={v=>set('rate',v)} required/></div>
  <div className="cash-row cash-buttons"><button className="blue-button" disabled={!canManage||busy||!!error}>{type==='account'?form.id?'تعديل الحساب':'إضافة الحساب':form.id?'تعديل عملة':'إضافة العملة'}</button>{type==='account'&&form.id&&<button type="button" className="red-button" disabled={!canManage||busy} onClick={()=>{setAccountToDelete(form);setAccountConfirm(true);}}>حذف الحساب</button>}<button type="button" className="gray-button" onClick={clear}>تفريغ الحقول</button></div>
  <div className="cash-catalog-table"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>{type==='account'?'إسم الحساب':'العملة'}</TableHead>{type==='account'&&<TableHead>العملة</TableHead>}<TableHead>سعر الصرف</TableHead>{type==='account'&&<TableHead>إجراءات</TableHead>}</TableRow></TableHeader><TableBody>{type==='account'?data.accounts.map((a,i)=><TableRow key={a.id}><TableCell>{i+1}</TableCell><TableCell><button type="button" onClick={()=>setForm({id:a.id,updatedAt:a.updatedAt,name:a.name,currency:a.currency,rate:a.payload.rate,parentId:a.payload.parentId||''})}>{a.name}</button></TableCell><TableCell>{a.currency==='MULTI'?'متعدد العملات':a.currency}</TableCell><TableCell dir="ltr">{a.payload.rate}</TableCell><TableCell><button type="button" className="red-button" style={{padding:'2px 8px',fontSize:'11px',minHeight:'auto'}} onClick={()=>{setAccountToDelete(a);setAccountConfirm(true);}}>حذف</button></TableCell></TableRow>):data.currencies.map((c,i)=><TableRow key={c.code}><TableCell>{i+1}</TableCell><TableCell><button type="button" onClick={()=>setForm({id:c.id,name:c.name,currency:c.code,rate:c.rate})}>{c.name} · {c.code}</button></TableCell><TableCell dir="ltr">{c.rate}</TableCell></TableRow>)}</TableBody></Table>{type==='account'&&!data.accounts.length&&<p className="cash-no-data">لا توجد بيانات</p>}</div><p className="cash-table-hint">اضغط اسمًا في الجدول لتعديله، أو زر حذف لحذفه.</p>
  {type==='account'&&data.archivedAccounts&&data.archivedAccounts.length>0&&<div style={{marginTop:'12px',borderTop:'1px dashed #cbd5e1',paddingTop:'10px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}><span style={{fontWeight:600,fontSize:'12px',color:'#64748b'}}>الحسابات المؤرشفة / المحذوفة ({data.archivedAccounts.length})</span><button type="button" className="plain-button" style={{fontSize:'11px',color:'#0f766e',fontWeight:600}} onClick={()=>setShowArchived(!showArchived)}>{showArchived?'إخفاء':'عرض واستعادة الحسابات المحذوفة'}</button></div>{showArchived&&<Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>إسم الحساب</TableHead><TableHead>العملة</TableHead><TableHead>الحالة</TableHead><TableHead>إجراء</TableHead></TableRow></TableHeader><TableBody>{data.archivedAccounts.map((a:any,i:number)=><TableRow key={a.id}><TableCell>{i+1}</TableCell><TableCell>{a.name}</TableCell><TableCell>{a.currency==='MULTI'?'متعدد العملات':a.currency}</TableCell><TableCell><span style={{fontSize:'11px',padding:'2px 6px',borderRadius:'4px',background:'#fee2e2',color:'#b91c1c'}}>مؤرشف / محذوف</span></TableCell><TableCell><button type="button" className="blue-button" style={{padding:'2px 8px',fontSize:'11px',minHeight:'auto'}} disabled={busy} onClick={()=>restoreAccount(a)}>استعادة الحساب</button></TableCell></TableRow>)}</TableBody></Table>}</div>}
 </>:<>
  <div className="cash-row cash-pair"><label className="cash-date input-group"><span><CalendarDays size={15}/>التاريخ</span><input aria-label="تاريخ الإيصال" type="date" value={form.date} onChange={e=>set('date',e.target.value)} required/></label>{editing?<div className="cash-number-search"><CashField label="رقم الإيصال" value={search} onChange={setSearch} placeholder="بحث برقم الإيصال"/><button type="button" aria-label="بحث عن الإيصال" onClick={()=>find().catch(e=>toast.error(e.message))}><Search size={20}/></button></div>:<CashField label="رقم الإيصال" className="cash-number" value={data.nextNumber} readOnly/>}</div>
  {type==='forex'?<>
   <div className="cash-row"><CashSelect label="حساب الخزنة" value={form.treasuryId} onChange={chooseTreasury} options={cashboxOptions} required/></div>
   <div className="cash-row cash-pair"><CashField label="عملة الحساب" value={currencyName(treasury?.currency||'')} readOnly/><CashField label="سعر الصرف" type="number" min="0.00000001" step="any" value={form.conversionRate} onChange={v=>set('conversionRate',v)} required/></div>
   <div className="cash-row"><CashSelect label="اسم الحساب" value={form.counterpartyId} onChange={chooseCounter} options={counterOptions} required/></div>
  </>:<>
   <div className="cash-row"><CashSelect label="اسم الحساب" value={form.counterpartyId} onChange={chooseCounter} options={counterOptions} required/></div>
   <div className="cash-row"><CashSelect label={form.crossCurrency?"حساب الخزنة الرئيسي (معطل - الحركة بالعملة الأخرى)":"حساب الخزنة"} value={form.treasuryId} onChange={chooseTreasury} options={cashboxOptions} disabled={!!form.crossCurrency} required={!form.crossCurrency}/></div>
   {form.crossCurrency&&<div style={{fontSize:'12px',color:'#0f766e',background:'#f0fdf4',padding:'4px 10px',borderRadius:'6px',marginTop:'-4px',marginBottom:'8px',border:'1px solid #bbf7d0'}}>⚠️ حساب الخزنة الرئيسي أعلاه معطل (لن يتأثر بحركة نقدية) — الحركة الفعلية ستسجل في حساب العملة الأخرى المحدد بقسم التسوية أدناه.</div>}
   {treasury?.currency==='MULTI'&&<div className="cash-row"><CashSelect label="عملة حركة الخزينة" value={form.treasuryCurrency||'USD'} onChange={v=>set('treasuryCurrency',v)} options={data.currencies.map(c=>({value:c.code,label:c.name+' · '+c.code}))} required/></div>}
   <div className="cash-row cash-pair"><CashField label="عملة الحساب" value={currencyName(treasury?.currency||'')} readOnly/><CashField label="سعر الصرف" value={treasury?1:''} readOnly/></div>
  </>}
  <div className="cash-row"><CashField label={type==='receipt'?'إستلام من':'إستلم بواسطة'} value={form.person} onChange={v=>set('person',v)}/></div>
  {!form.crossCurrency&&<div className={'cash-row '+(type==='forex'?'cash-pair':'cash-amount-row')}><CashField label={type==='forex'?'المبلغ بالمحلي':type==='receipt'?'المبلغ المستلم':'المبلغ المنصرف'} type="number" min="0.01" step="any" value={form.amount} onChange={v=>set('amount',v)} required/>{type==='forex'&&<CashField label="المبلغ بالأجنبي" type="number" min="0.01" value={Number(form.conversionRate)>0&&form.amount!==''?Number((Number(form.amount)/Number(form.conversionRate)).toFixed(2)):''} onChange={v=>set('amount',Number((Number(v)*Number(form.conversionRate)).toFixed(2)))}/>}</div>}
  <div className="cash-row" style={{background:'#f8fafc',padding:'8px 12px',borderRadius:'6px',border:'1px solid #e2e8f0',margin:'6px 0'}}>
   <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:600,color:'#0f766e'}}>
    <input type="checkbox" checked={!!form.crossCurrency} onChange={e=>{const checked=e.target.checked;const defId=eligibleCashAccounts[0]?.id||'';setForm((f:any)=>({...f,crossCurrency:checked,settlementCurrency:f.settlementCurrency||'SDG',settlementTreasuryId:f.settlementTreasuryId||defId,coveredCurrency:counterpartCurrency,coveredAmount:checked?(f.coveredAmount||''):f.coveredAmount,settlementAmount:checked?(f.settlementAmount||f.amount||''):f.settlementAmount,conversionRate:f.conversionRate||''}))}}/>
    <span>تسوية بعملة مختلفة (سداد بعملة لتغطية حساب عميل / خطوط / مورد بعملة أخرى)</span>
   </label>
  </div>
  {form.crossCurrency&&<div style={{background:'#f0fdf4',padding:'12px',borderRadius:'8px',border:'1px solid #86efac',marginBottom:'10px'}}>
   <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',fontWeight:700,color:'#166534',fontSize:'13px'}}><ERPIcon name="forex" size={18}/><span>بيانات التسوية بالعملة الأخرى (الحسابات المتأثرة بالحركة الفعلية)</span></div>
   <div className="cash-row cash-pair">
    <CashSelect label="عملة السداد (العملة الأخرى)" value={form.settlementCurrency||'SDG'} onChange={v=>{const matched=cashAccounts.find(a=>a.currency===v||a.currency==='MULTI')?.id||'';setForm((f:any)=>({...f,settlementCurrency:v,settlementTreasuryId:matched}))}} options={data.currencies.map(c=>({value:c.code,label:c.name+' · '+c.code}))}/>
    <CashSelect label="حساب الخزنة (بالعملة الأخرى) *" value={form.settlementTreasuryId||''} onChange={v=>set('settlementTreasuryId',v)} options={settlementTreasuryOptions} required={!!form.crossCurrency}/>
   </div>
   <div className="cash-row cash-pair">
    <CashField label={`المبلغ الفعلي المدفوع بالخزينة (${form.settlementCurrency||'SDG'}) *`} type="number" min="0.01" step="any" value={form.settlementAmount||''} onChange={(v:any)=>{const sAmt=Number(v||0);const cov=Number(form.coveredAmount||0);setForm((f:any)=>({...f,settlementAmount:v,amount:v,...(cov>0&&sAmt>0?{conversionRate:Number((sAmt/cov).toFixed(4))}:{})}))}} required={!!form.crossCurrency} placeholder={`المبلغ بـ ${form.settlementCurrency||'SDG'}`}/>
    <CashField label="سعر الصرف *" type="number" min="0.00000001" step="any" value={form.conversionRate||''} onChange={(v:any)=>{const rate=Number(v||0);const cov=Number(form.coveredAmount||0);setForm((f:any)=>({...f,conversionRate:v,...(rate>0&&cov>0?{settlementAmount:Number((cov*rate).toFixed(2)),amount:Number((cov*rate).toFixed(2))}:{})}))}} required={!!form.crossCurrency} placeholder="سعر الصرف"/>
   </div>
   <div className="cash-row">
    <CashField label={`المبلغ المغطى لحساب ${foreign?.name||'الحساب المقابل'} (${counterpartCurrency}) *`} type="number" min="0.01" step="any" value={form.coveredAmount||''} onChange={(v:any)=>{const cov=Number(v||0);const sAmt=Number(form.settlementAmount||0);const rate=Number(form.conversionRate||0);if(sAmt>0&&cov>0){setForm((f:any)=>({...f,coveredAmount:v,conversionRate:Number((sAmt/cov).toFixed(4))}))}else if(rate>0&&cov>0){const calc=Number((cov*rate).toFixed(2));setForm((f:any)=>({...f,coveredAmount:v,settlementAmount:calc,amount:calc}))}else{setForm((f:any)=>({...f,coveredAmount:v}))}}} required={!!form.crossCurrency} placeholder={`المبلغ المغطى بـ ${counterpartCurrency}`}/>
   </div>
   <div style={{fontSize:'12px',color:'#15803d',background:'#dcfce7',padding:'6px 10px',borderRadius:'6px',marginTop:'6px'}}>💡 <b>الأثر المالي:</b> سيتم التأثير الفعلي على حساب <b>{selectedSettlementTreasury?.name||'الخزنة/البنك المحدد'}</b> بمبلغ <b>{money(Math.round(Number(form.settlementAmount||0)*100))} {form.settlementCurrency||'SDG'}</b>، بينما تُغطى مديونية <b>{foreign?.name||'الحساب المقابل'}</b> بمبلغ <b>{money(Math.round(Number(form.coveredAmount||0)*100))} {counterpartCurrency}</b>. حساب الخزنة في الشاشة الرئيسية معطل تماماً.</div>
  </div>}
  <div className="cash-row"><label className="input-group cash-field cash-notes"><span>البيان *</span><textarea aria-label="البيان" value={form.notes} onChange={e=>set('notes',e.target.value)} required placeholder="الرجاء كتابة البيان"/></label></div>
   <div className="cash-buttons">{editing?<><button className="green-button" disabled={!canManage||busy||!form.id||!!error}>تعديل</button><button type="button" className="red-button" disabled={!canManage||busy||!form.id} onClick={()=>setConfirm(true)}>حذف</button></>:<><button className="blue-button" disabled={!canManage||busy||!!error}>{busy?'جارٍ الحفظ…':type==='receipt'?'إستلام':'صرف'}</button><button type="button" className="gray-button" onClick={clear}>تفريغ الحقول</button></>}</div>
   {!data.treasuries.length&&!loading&&<p className="cash-setup-note">أضف حساب خزينة أو بنك من القسم المختص أولًا.</p>}{type!=='forex'&&!data.counterparties.length&&!loading&&<p className="cash-setup-note">أضف عميلًا أو حسابًا ماليًا من القسم المختص لاختيار الحساب المقابل.</p>}{type==='forex'&&foreign&&<p className="cash-rate-note">سعر الصرف: عدد وحدات {treasury?.currency} مقابل وحدة واحدة من {foreign.currency}.</p>}
  </>}
  </form></DialogContent></Dialog><AlertDialog open={confirm&&w.active} onOpenChange={setConfirm}><AlertDialogContent dir="rtl"><AlertDialogTitle>حذف الإيصال {search}</AlertDialogTitle><AlertDialogDescription>سيُلغى أثر الإيصال في الأرصدة، وتُحفظ بياناته في سجل العمليات. هل تريد الحذف؟</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>رجوع</AlertDialogCancel><AlertDialogAction onClick={remove} disabled={!canManage||busy}>حذف الإيصال</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><AlertDialog open={accountConfirm&&w.active} onOpenChange={setAccountConfirm}><AlertDialogContent dir="rtl"><AlertDialogTitle>حذف حساب الخزينة</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف الحساب «{accountToDelete?.name||form?.name}»؟ سيتم إزالته من القوائم والحركات النشطة.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel onClick={()=>{setAccountConfirm(false);setAccountToDelete(null);}}>إلغاء</AlertDialogCancel><AlertDialogAction onClick={()=>removeAccount(accountToDelete)} disabled={!canManage||busy}>تأكيد الحذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  {whatsAppModal&&<WhatsAppDialog open={!!whatsAppModal} onOpenChange={open=>!open&&setWhatsAppModal(null)} title="إرسال سند القبض عبر WhatsApp 📲" recipientName={whatsAppModal.name} initialPhone={whatsAppModal.phone} initialMessage={whatsAppModal.message}/>}
</div>
}
function exportRows(name:string,headers:string[],rows:any[][]){const q=(v:any)=>'"'+String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"';download('\uFEFF'+[headers,...rows].map(r=>r.map(q).join(',')).join('\r\n'),name+'.csv','text/csv;charset=utf-8')}
function CashReport({mode,settings,data,error,loading,load,onClose}:{mode:string;settings:Settings;data:CashData;error:string;loading:boolean;load:()=>void;onClose:()=>void}){
 const balances=mode==='balances';const type=mode.replace('print-','');const [date,setDate]=useState(today()),[currency,setCurrency]=useState('all'),[account,setAccount]=useState('all'),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[whatsAppReportOpen,setWhatsAppReportOpen]=useState(false);const vouchers=data.vouchers.filter(v=>v.payload.type===type&&(account==='all'||v.payload.counterpartyId===account));const row=data.vouchers.find(v=>v.id===selected);const p=row?.payload;const totals=new Map<string,{name:string;currency:string;amount:number}>();
 for(const a of data.accounts)if(currency==='all'||a.currency===currency)totals.set(a.id+':'+a.currency,{name:a.name,currency:a.currency,amount:0});
 for(const r of data.ledger)if(r.date<=date&&r.payload.status!=='voided'&&(currency==='all'||r.currency===currency)){const id=(r.payload.treasuryId||'unallocated')+':'+r.currency;const prev=totals.get(id)||{name:r.payload.treasuryName||'غير مخصص لخزينة',currency:r.currency,amount:0};prev.amount+=r.amount;totals.set(id,prev)}const rows=[...totals.values()];
 function find(){const v=vouchers.find(v=>v.code===search.trim().padStart(8,'0'));if(v)setSelected(v.id);else toast.error('رقم الإيصال غير موجود')}
 function csv(){balances?exportRows('cash-balances',['الحساب','العملة','الرصيد'],rows.map(r=>[r.name,r.currency,r.amount/100])):row&&exportRows('cash-voucher-'+row.code,['البيان','رقم الإيصال','التاريخ','الحساب','الخزينة','العملة','المبلغ','سعر الصرف','المستلم','الحالة'],[[p?.notes,row.code,row.date,p?.counterpartyName,p?.treasuryName,p?.treasuryCurrency,p?.treasuryMinor/100,p?.rate,p?.person,p?.status]])}
 const counterpartyRow=data.counterparties.find(c=>c.id===p?.counterpartyId);
 const reportWhatsAppMessage=row?buildReceiptWhatsAppMessage({receiptNumber:row.code,date:row.date,customerName:p?.counterpartyName||'العميل',amount:(p?.treasuryMinor||0)/100,currency:p?.treasuryCurrency||'USD',notes:p?.notes,collectorName:p?.person||p?.createdBy,treasuryName:p?.treasuryName,equivalentAmount:p?.transactionMinor?(p.transactionMinor/100):undefined,equivalentCurrency:p?.transactionCurrency,settings}):'';
 return <section className="app-window cash-report" dir="rtl"><CashTitle mode={mode} onClose={onClose} onRefresh={load}/><div className="window-body"><div className="toolbar cash-report-filters">{balances?<><CashField label="الأرصدة حتى تاريخ" value={date} type="date" onChange={setDate}/><CashSelect label="العملة" value={currency} onChange={setCurrency} options={[{value:'all',label:'الكل'},...data.currencies.map(c=>({value:c.code,label:c.name+' · '+c.code}))]}/><button className="search-button" aria-label="بحث أرصدة النقد" onClick={load}><Search size={20}/></button></>:<><CashSelect label="الحساب" value={account} onChange={v=>{setAccount(v);setSelected('')}} options={[{value:'all',label:'الكل'},...Array.from(new Map(data.vouchers.filter(v=>v.payload.type===type).map(v=>[v.payload.counterpartyId,{value:v.payload.counterpartyId,label:v.payload.counterpartyName}])).values())]}/><CashSelect label="رقم الإيصال" value={selected} onChange={setSelected} options={vouchers.map(v=>({value:v.id,label:v.code+(v.payload.status==='voided'?' · محذوف':'')}))}/><CashField label="رقم الإيصال للبحث" value={search} onChange={setSearch}/><button className="blue-button" onClick={find}>بحث</button></>}</div><div className="report-toolbar"><button disabled={!balances&&!row} onClick={()=>permittedExport(()=>window.print())}><Printer size={17}/> طباعة / PDF</button><button disabled={!balances&&!row} onClick={()=>permittedExport(csv)}><Download size={17}/> تصدير CSV</button><ReportExports disabled={!balances&&!row}/>{row&&type==='receipt'&&<button onClick={()=>setWhatsAppReportOpen(true)} style={{color:'#15803d',fontWeight:600}} title="إرسال سند القبض مباشرة عبر WhatsApp"><ERPIcon name="whatsapp" size={17}/> إرسال عبر WhatsApp</button>}<span>Page 1 of 1</span></div><div className="report-canvas"><article className="report-paper cash-paper"><AgencyLetterhead/><h1>{cashTitles[mode]}</h1>{error?<p className="cash-error">{error}</p>:loading?<p className="cash-no-data">جارٍ تحميل البيانات…</p>:balances?<><div className="report-meta"><span>حتى تاريخ: <b dir="ltr">{date}</b></span><span>العملة: {currency==='all'?'الكل':currency}</span></div><Table><TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>العملة</TableHead><TableHead>الرصيد</TableHead></TableRow></TableHeader><TableBody>{rows.map((r,i)=><TableRow key={i}><TableCell>{r.name}</TableCell><TableCell>{r.currency}</TableCell><TableCell dir="ltr">{money(r.amount)}</TableCell></TableRow>)}</TableBody></Table>{!rows.length&&<p className="cash-no-data">لا توجد بيانات</p>}<div className="report-totals">{[...new Set(rows.map(r=>r.currency))].map(c=><p key={c}>الإجمالي {c} : <b dir="ltr">{money(rows.filter(r=>r.currency===c).reduce((sum,r)=>sum+r.amount,0))}</b></p>)}</div>{rows.some(r=>r.name==='غير مخصص لخزينة')&&<p className="report-footnote">التحصيلات الآلية والحركات السابقة تظهر في «غير مخصص لخزينة».</p>}</>:row?<>{p?.status==='voided'&&<p className="cash-voided">إيصال محذوف · غير مشمول في الأرصدة</p>}<div className="cash-receipt-meta"><div><p>اسم الحساب : {p?.counterpartyName}</p><p>الخزينة : {p?.treasuryName}</p><p>رقم الإيصال : <b dir="ltr">{row.code}</b></p><p>تاريخ الإيصال : <b dir="ltr">{row.date}</b></p><p>تاريخ الطباعة : <b dir="ltr">{today()}</b></p><p>اسم {type==='receipt'?'الدافع':'المستلم'} : {p?.person||'—'}</p></div><div><p>سعر الصرف : <b dir="ltr">{p?.rate}</b></p><p>العملة : {p?.treasuryCurrency}</p><p>{type==='receipt'?'المبلغ المستلم':'المبلغ المنصرف'} : <b dir="ltr">{money(p?.treasuryMinor)}</b></p><p>ما يعادله : <b dir="ltr">{money(p?.transactionMinor)} {p?.transactionCurrency}</b></p></div></div><Table className="cash-receipt-lines"><TableHeader><TableRow><TableHead>البيان</TableHead><TableHead>المبلغ</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>{p?.notes||'—'}</TableCell><TableCell dir="ltr">{money(p?.treasuryMinor)} {p?.treasuryCurrency}</TableCell></TableRow></TableBody></Table><div className="cash-signatures"><span>أعد بواسطة : {p?.createdBy}</span><span>اعتمد بواسطة : __________________</span></div></>:<p className="cash-no-data">اختر الحساب ورقم الإيصال أو ابحث عنه لعرضه.</p>}<AgencyReportFooter/></article></div></div>{row&&<WhatsAppDialog open={whatsAppReportOpen} onOpenChange={setWhatsAppReportOpen} title={`إرسال ${type==='receipt'?'سند القبض':'سند الصرف'} عبر WhatsApp 📲`} recipientName={p?.counterpartyName||'العميل'} initialPhone={(counterpartyRow as any)?.payload?.phone||''} initialMessage={reportWhatsAppMessage}/>}</section>
}
