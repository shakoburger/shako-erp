'use client';
import {WhatsAppDialog} from '@/components/whatsapp-dialog';
import {buildTicketWhatsAppMessage, openWhatsAppDirect} from '@/lib/whatsapp';
import {ERPIcon} from '@/components/erp-icons';
import {AgencyLetterhead,AgencyReportFooter} from '@/components/agency-letterhead';
import {useWorkspaceWindow,WindowControls} from '@/components/workspace-window';
import {ReportExports,permittedExport} from '@/components/report-export';
import {useAgencyAccess,useAgencySettings} from '@/components/access-context';
import {accountBalances} from '@/lib/balances';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Search,Plus,Trash2,Pencil,Printer,Download,RefreshCw,Check,HelpCircle,Upload,Sparkles,Users,Calendar,Layers,Plane,RotateCcw} from 'lucide-react';
import {analyzeTicketDocument,parseTicketTextContent} from '@/lib/ticket-extractor';
import {toast} from 'sonner';
import {Switch} from '@/components/ui/switch';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {api,download} from './erp-system';
import {kinds,currencies,money,today,moduleLabels,moduleEnabled,type RecordRow,type Settings} from '@/lib/domain';
import {calculateTicket,ticketTotals,ticketSupplierName,ticketSupplierDue,parseTicketText,calculateRefundTotals} from '@/lib/tickets';
import {StagedOperationsStrip} from '@/components/staged-operations-strip';
import {SearchablePicker} from '@/components/searchable-picker';
import {InvoiceEntry} from '@/components/invoice-entry';
function Picker({value,onChange,options,label,color,disabled=false,placeholder='اختر',onCreateNew,createNewLabel}:{value:string;onChange:(v:string)=>void;options:(string|{value:string;label:string})[];label?:string;color?:string;disabled?:boolean;placeholder?:string;onCreateNew?:(name:string)=>void;createNewLabel?:string|((search:string)=>string)}){return <SearchablePicker value={value} onChange={onChange} options={options} label={label} color={color} disabled={disabled} placeholder={placeholder} onCreateNew={onCreateNew} createNewLabel={createNewLabel} dir="rtl"/>;}
function Field({label,value,onChange,type='text',color,required=false,allowNegative=false,...rest}:{label:any;value:any;onChange:(v:any)=>void;type?:string;color?:string;required?:boolean;allowNegative?:boolean;[k:string]:any}){
 const minVal = allowNegative ? undefined : (rest.min !== undefined ? rest.min : (type==='number'?0:undefined));
 return <label className="input-group" dir="rtl"><span style={{background:color,direction:'rtl',textAlign:'right'}}>{label}</span><input aria-label={typeof label === 'string' ? label : 'حقل إدخال'} dir={type==='text'?'auto':'ltr'} value={value??''} type={type} required={required} onChange={e=>{
  if(type==='number'){
   const val=e.target.value;
   if(val===''||val==='-')onChange(val);
   else onChange(Number(val));
  }else{
   onChange(e.target.value);
  }
 }} min={minVal} step={type==='number'?'0.01':undefined} {...rest}/></label>;
}
function useRows(kind:string,refreshKey:any=''){const w=useWorkspaceWindow();const [rows,setRows]=useState<RecordRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const load=useCallback(async()=>{setLoading(true);try{setRows(await api('/api/records?kind='+encodeURIComponent(kind)));setError('')}catch(e:any){setError(e.message);setRows([])}finally{setLoading(false)}},[kind,refreshKey]);useEffect(()=>{if(w.active)load()},[load,w.active,w.refreshKey]);return {rows,loading,error,load}}
function useCollectionAccounts(enabled=true){const w=useWorkspaceWindow(),[rows,setRows]=useState<RecordRow[]>([]);useEffect(()=>{if(!enabled||!w.active)return;let current=true;Promise.all([api('/api/cash').catch(()=>({accounts:[]})),api('/api/banks').catch(()=>({accounts:[]}))]).then(([cash,bank])=>{if(current)setRows([...cash.accounts,...bank.accounts])});return()=>{current=false}},[enabled,w.active,w.refreshKey]);return rows}
function Empty({loading,error,load}:{loading:boolean;error:string;load:()=>void}){return <div className={'empty-row '+(error?'error-text':'')}>{loading?'جارٍ تحميل البيانات…':error||'لا توجد بيانات مسجلة.'}{error&&<button className="plain-button" onClick={load}>إعادة المحاولة</button>}</div>}
const cleanPayload=(p:any)=>Object.fromEntries(Object.entries(p).filter(([k,v])=>!(['brokerId','supplierId','treasuryId','customerId','commissionAccountId','serviceAccountId','settlementTreasuryId'].includes(k)&&!v)&&['receiptNumber','accountType','customerName','sellingPrice','supplierPrice','phone','email','address','creditLimit','notes','direction','customerId','treasuryId','supplierId','brokerId','brokerCommission','airline','vendor','route','class','sign','fare','commPct','commAmount','penalties','refundComm','discount','discountPct','extraPct','extraComm','payment','income','taxes','flags','status','crossCurrency','settlementCurrency','settlementTreasuryId','settlementAmount','conversionRate','passengers','commissionAccountId','serviceAccountId','serviceAccountName','supplierName','brokerName','commissionAccountName','cost','price','quantity','exchangeRate','portalEnabled','portalCode','branchId','billedTo','billedToTaxNumber','billedToAddress','billedToPhone','billedToEmail','attention','language','invoiceType','ticketId','ticketIds','ticketCode','passengerName','flightDate','pnr','items','subtotal','taxRate','taxAmount','dueDate','bankDetails','refundDate','supplierComm','originalSellMinor','originalCostMinor','customerRefundMinor','supplierRefundMinor','refundIncomeMinor','refundNotes'].includes(k)));
function csv(name:string,headers:string[],rows:any[][]){const quote=(v:any)=>'"'+String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"';permittedExport(()=>download('\uFEFF'+[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n'),name+'.csv','text/csv;charset=utf-8'))}
export function RecordManager({kind,initialStatus}:{kind:string;initialStatus?:string}){
 const w=useWorkspaceWindow(),settings=useAgencySettings(),access=useAgencyAccess(),canManage=access.modules[kinds[kind]?.module]==='manage';const [catalog,setCatalog]=useState<string[]>(currencies);useEffect(()=>{api('/api/currencies').then(c=>setCatalog(c.map((x:any)=>x.code))).catch(()=>{})},[]);
 const {rows,loading,error,load}=useRows(kind),[search,setSearch]=useState(''),[currency,setCurrency]=useState('all'),[accountTypeFilter,setAccountTypeFilter]=useState(initialStatus&&['customer','airline','supplier','service','expense','commission','revenue','general'].includes(initialStatus)?initialStatus:'all'),[form,setForm]=useState<any>(null),[busy,setBusy]=useState(false),[remove,setRemove]=useState<RecordRow|null>(null),[customers,setCustomers]=useState<RecordRow[]>([]);
 const [refundModalTicket,setRefundModalTicket]=useState<RecordRow|null>(null);
 const [refundForm,setRefundForm]=useState<{refundDate:string;penalties:number|string;supplierComm:number|string;refundComm:number|string;commissionAccountId:string;notes:string}>({refundDate:today(),penalties:'',supplierComm:'',refundComm:'',commissionAccountId:'',notes:''});
 const [revenueAccounts,setRevenueAccounts]=useState<RecordRow[]>([]);
 const collectionAccounts=useCollectionAccounts(['cash','bank','service','visa'].includes(kind));
 const visible=rows.filter(r=>{
  if(r.payload.status==='voided'||r.payload.archived) return false;
  if(initialStatus&&r.payload.status!==initialStatus&&r.payload.accountType!==initialStatus) return false;
  if(currency!=='all'&&r.currency!=='MULTI'&&r.kind!=='customer'&&r.currency!==currency) return false;
  if(accountTypeFilter!=='all'){
    if(kind==='customer'){
      const t=r.payload?.accountType||'customer';
      if(t!==accountTypeFilter) return false;
    }else if(['account','expense'].includes(kind)){
      const t=r.payload?.accountType||(r.kind==='expense'?'expense':'general');
      if(t!==accountTypeFilter) return false;
    }
  }
  return (r.name+' '+r.code+' '+(r.payload.customerName||'')+' '+(r.payload.receiptNumber||'')).toLowerCase().includes(search.toLowerCase());
 });
 useEffect(()=>{if(['cash','bank','expense','service','visa','invoice','ticket'].includes(kind))api('/api/records?kind=customer').then(setCustomers).catch(()=>setCustomers([]));if(kind==='ticket')api('/api/records?kind=account').then(accs=>setRevenueAccounts(accs.filter((a:any)=>!a.payload?.archived&&(a.payload?.accountType==='revenue'||a.payload?.accountType==='commission')))).catch(()=>{});},[kind]);
 function open(row?:RecordRow){
  const isAcc=['customer','account','expense'].includes(kind);
  const defCurr=isAcc?'MULTI':(settings.defaultCurrency||settings.enabledCurrencies?.[0]||'EGP');
  const defType=kind==='expense'?'expense':kind==='customer'?(accountTypeFilter!=='all'?accountTypeFilter:(initialStatus&&['customer','airline','supplier','service'].includes(initialStatus)?initialStatus:'customer')):(accountTypeFilter!=='all'?accountTypeFilter:(initialStatus&&['service','expense','commission','revenue','general'].includes(initialStatus)?initialStatus:'revenue'));
  if(kind==='invoice'){
   setForm(row?{...row,amount:Math.abs(row.amount)/100,payload:{...cleanPayload(row.payload)}}:{kind:'invoice',name:'',code:'',date:today(),currency:settings.defaultCurrency||'USD',amount:0,payload:{billedTo:'',language:'ar',invoiceType:'tax',items:[]}});
   return;
  }
  const cleanCode=(row?.code&&row?.code===row?.id)?'':(row?.code||'');
  setForm(row?(kind==='service'?{...row,code:cleanCode,amount:Math.abs(row.amount)/100,payload:{...newService(defCurr).payload,...cleanPayload(row.payload)}}:{...row,code:cleanCode,amount:kind==='ticket'?row.amount:Math.abs(row.amount)/100,payload:kind==='ticket'?row.payload:{accountType:row.payload?.accountType||defType,...cleanPayload(row.payload)}}):(kind==='service'?newService(defCurr):{kind,name:'',code:'',date:today(),currency:defCurr,amount:0,payload:{accountType:defType,direction:kind==='expense'?'payment':'receipt',notes:'',payment:'credit'}}));
 }
 async function save(e:any,andClose=true){if(e?.preventDefault)e.preventDefault();setBusy(true);try{const isNew=!form.id;const savedName=form.name;const accType=form.payload?.accountType;const accCurr=form.currency;const b={id:form.id||undefined,kind,name:form.name,code:form.code||undefined,date:form.date,currency:form.currency,amount:Number(form.amount||0),payload:form.payload};await api('/api/records',{method:'POST',body:JSON.stringify(b)});load();if(accountTypeFilter!=='all'&&accType&&accountTypeFilter!==accType){setAccountTypeFilter('all');}const accLabel=accType==='airline'?'حساب خط الطيران':accType==='supplier'?'حساب المورد':accType==='service'?'حساب الخدمة':accType==='revenue'?'حساب الإيرادات':accType==='commission'?'حساب العمولات':accType==='expense'?'حساب المصروفات':'الحساب';toast.success(isNew?`تم حفظ ${accLabel} «${savedName}» بنجاح`:'تم حفظ التعديل بنجاح');if(andClose){setForm(null);}else{const isAcc=['customer','account','expense'].includes(kind);const defCurr=isAcc?(accCurr||'MULTI'):(settings.defaultCurrency||settings.enabledCurrencies?.[0]||'EGP');const defType=accType||(kind==='expense'?'expense':kind==='customer'?'customer':'revenue');setForm({kind,name:'',code:'',date:today(),currency:defCurr,amount:0,payload:{accountType:defType,direction:kind==='expense'?'payment':'receipt',notes:'',payment:'credit'}});}}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function deleteRow(){if(!remove)return;setBusy(true);try{await api('/api/records?id='+remove.id,{method:'DELETE'});setRemove(null);load();toast.success('تم حذف السجل')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function ticketStatus(row:RecordRow,status:string){setBusy(true);try{await api('/api/records',{method:'POST',body:JSON.stringify({id:row.id,kind:'ticket',name:row.name,code:row.code,date:row.date,currency:row.currency,amount:0,payload:{...cleanPayload(row.payload),status}})});toast.success('تم تحديث حالة التذكرة');load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 function openRefundModal(row:RecordRow){
  const p=row.payload||{};
  const origCost=p.originalCostMinor!==undefined?p.originalCostMinor/100:Number(p.supplierPrice||p.sellingPrice||(Math.abs(row.amount)/100)||0);
  const origSell=p.originalSellMinor!==undefined?p.originalSellMinor/100:Number(p.sellingPrice||origCost||0);
  setRefundForm({
   refundDate:p.refundDate||today(),
   penalties:p.penalties??'',
   supplierComm:p.supplierComm??(p.brokerCommission??''),
   refundComm:p.refundComm??'',
   commissionAccountId:p.commissionAccountId||'',
   notes:p.refundNotes||''
  });
  setRefundModalTicket(row);
 }
 async function revertRefund(row:RecordRow){
  setBusy(true);
  try{
   const p=row.payload||{};
   const origSell=p.originalSellMinor!==undefined?p.originalSellMinor/100:Number(p.sellingPrice||0);
   const origCost=p.originalCostMinor!==undefined?p.originalCostMinor/100:Number(p.supplierPrice||origSell||0);
   await api('/api/records',{
    method:'POST',
    body:JSON.stringify({
     id:row.id,
     kind:'ticket',
     name:row.name,
     code:row.code,
     date:row.date,
     currency:row.currency,
     amount:0,
     payload:{
      ...cleanPayload(p),
      status:'active',
      sellingPrice:origSell,
      supplierPrice:origCost,
      penalties:0,
      supplierComm:0,
      refundComm:0,
      originalSellMinor:undefined,
      originalCostMinor:undefined,
      customerRefundMinor:undefined,
      supplierRefundMinor:undefined,
      refundIncomeMinor:undefined,
      refundDate:undefined,
      refundNotes:undefined
     }
    })
   });
   toast.success('تمت إعادة تفعيل التذكرة كنشطة وإلغاء الاسترداد');
   load();
  }catch(e:any){toast.error(e.message||'فشل إعادة التفعيل')}finally{setBusy(false)}
 }
 async function submitRefund(e:any){
  e.preventDefault();
  if(!refundModalTicket)return;
  setBusy(true);
  try{
   const row=refundModalTicket;
   const p=row.payload||{};
   const origSellMinor=p.originalSellMinor!==undefined?Number(p.originalSellMinor):Math.round(Number(p.sellingPrice||(Math.abs(row.amount)/100)||0)*100);
   const origCostMinor=p.originalCostMinor!==undefined?Number(p.originalCostMinor):Math.round(Number(p.supplierPrice||p.sellingPrice||(Math.abs(row.amount)/100)||0)*100);
   const penaltyMinor=Math.round(Number(refundForm.penalties||0)*100);
   const supCommMinor=Math.round(Number(refundForm.supplierComm||0)*100);
   const refCommMinor=Math.round(Number(refundForm.refundComm||0)*100);

   const supplierRefundMinor=Math.max(0,origCostMinor-penaltyMinor-supCommMinor);
   const customerRefundMinor=Math.max(0,supplierRefundMinor-refCommMinor);
   const officeIncomeMinor=refCommMinor;

   const updatedPayload={
    ...cleanPayload(p),
    status:'refunded',
    refundDate:refundForm.refundDate||today(),
    originalSellMinor:origSellMinor,
    originalCostMinor:origCostMinor,
    penalties:Number(refundForm.penalties||0),
    supplierComm:Number(refundForm.supplierComm||0),
    refundComm:Number(refundForm.refundComm||0),
    customerRefundMinor,
    supplierRefundMinor,
    refundIncomeMinor:officeIncomeMinor,
    sellingPrice:customerRefundMinor/100,
    supplierPrice:supplierRefundMinor/100,
    commissionAccountId:refundForm.commissionAccountId||p.commissionAccountId||undefined,
    refundNotes:refundForm.notes||undefined
   };

   await api('/api/records',{
    method:'POST',
    body:JSON.stringify({
     id:row.id,
     kind:'ticket',
     name:row.name,
     code:row.code,
     date:row.date,
     currency:row.currency,
     amount:customerRefundMinor,
     payload:updatedPayload
    })
   });

   toast.success('تم استرداد التذكرة رقم '+row.code+' بنجاح. المسترد للراكب: '+(customerRefundMinor/100).toFixed(2)+' '+row.currency);
   setRefundModalTicket(null);
   load();
  }catch(err:any){toast.error(err.message||'فشل استرداد التذكرة')}finally{setBusy(false)}}
 const title=initialStatus==='refunded'?'التذاكر المستردة':initialStatus==='cancelled'?'التذاكر الملغاة':initialStatus==='revenue'?'دليل حسابات الإيرادات':initialStatus==='commission'?'حسابات العمولات':initialStatus==='expense'?'حسابات المصروفات':initialStatus==='airline'?'دليل حسابات الخطوط':initialStatus==='supplier'?'دليل الموردين':initialStatus==='service'?'دليل حسابات الخدمات':kinds[kind]?.label||'السجلات';
 return <div className="record-manager" dir="rtl"><div className="toolbar"><h1>{title}</h1><div className="search-input"><Search size={18}/><input aria-label="بحث في السجلات" placeholder="بحث بالاسم أو الرقم" value={search} onChange={e=>setSearch(e.target.value)}/></div>{kind==='customer'&&(
    <Picker label="نوع الحساب" value={accountTypeFilter} onChange={setAccountTypeFilter} options={[
      {value:'all',label:'الكل'},
      {value:'customer',label:'عملاء'},
      {value:'airline',label:'خطوط طيران'},
      {value:'supplier',label:'موردين'},
      {value:'service',label:'خدمات'}
    ]}/>
  )}{['account','expense'].includes(kind)&&(
    <Picker label="نوع الحساب" value={accountTypeFilter} onChange={setAccountTypeFilter} options={[
      {value:'all',label:'الكل'},
      {value:'service',label:'خدمات'},
      {value:'expense',label:'مصروفات'},
      {value:'commission',label:'عمولات'},
      {value:'revenue',label:'إيرادات'},
      {value:'general',label:'عام'}
    ]}/>
  )}<Picker label="العملة" value={currency} onChange={setCurrency} options={[{value:'all',label:'الكل'},...catalog]}/><button className="blue-button" disabled={!canManage} onClick={()=>open()}><Plus size={17}/>{kind==='customer'?((accountTypeFilter==='airline'||initialStatus==='airline')?'إضافة خط طيران':(accountTypeFilter==='supplier'||initialStatus==='supplier')?'إضافة مورد':(accountTypeFilter==='service'||initialStatus==='service')?'إضافة حساب خدمة':'إضافة عميل'):(kind==='account'&&(accountTypeFilter==='service'||initialStatus==='service'))?'إضافة حساب خدمة':(kind==='account'&&(accountTypeFilter==='revenue'||initialStatus==='revenue'))?'إضافة حساب إيرادات':(kind==='account'&&(accountTypeFilter==='commission'||initialStatus==='commission'))?'إضافة حساب عمولات':(kind==='account'&&(accountTypeFilter==='expense'||initialStatus==='expense'))?'إضافة حساب مصروفات':'إضافة'}</button><button className="plain-button" onClick={load} aria-label="تحديث السجلات"><RefreshCw size={17}/></button><button className="plain-button" onClick={()=>csv(title,['الاسم','الرقم','التاريخ','العملة','المبلغ'],visible.map(r=>[r.name,r.code,r.date,r.currency,(r.amount/100).toFixed(2)]))}><Download size={17}/>تصدير</button></div><div className="data-table"><Table><TableHeader><TableRow><TableHead>{(kind==='customer'&&(accountTypeFilter==='airline'||initialStatus==='airline'))?'شركة الطيران':(kind==='customer'&&(accountTypeFilter==='supplier'||initialStatus==='supplier'))?'المورد':(kind==='customer'&&(accountTypeFilter==='service'||initialStatus==='service'))?'اسم الخدمة':kind==='ticket'?'الاسم / المسافر':kind==='service'?'الاسم / الخدمة':'الاسم'}</TableHead><TableHead>الرقم</TableHead><TableHead>التاريخ</TableHead><TableHead>العملة</TableHead><TableHead>المبلغ</TableHead>{kind==='ticket'&&<TableHead>الحالة</TableHead>}<TableHead>التحكم</TableHead></TableRow></TableHeader><TableBody>{visible.map(r=><TableRow key={r.id}><TableCell>{r.name}{kind==='customer'&&<span style={{marginRight:'8px',padding:'2px 6px',fontSize:'11px',borderRadius:'4px',background:r.payload?.accountType==='airline'?'#e0f2fe':r.payload?.accountType==='supplier'?'#fef3c7':r.payload?.accountType==='service'?'#ede9fe':'#f0fdf4',color:r.payload?.accountType==='airline'?'#0369a1':r.payload?.accountType==='supplier'?'#b45309':r.payload?.accountType==='service'?'#7c3aed':'#15803d',fontWeight:600}}>{r.payload?.accountType==='airline'?'خط طيران':r.payload?.accountType==='supplier'?'مورد':r.payload?.accountType==='service'?'خدمة':'عميل'}</span>}{['account','expense'].includes(kind)&&<span style={{marginRight:'8px',padding:'2px 6px',fontSize:'11px',borderRadius:'4px',background:r.payload?.accountType==='expense'||r.kind==='expense'?'#ffe4e6':r.payload?.accountType==='commission'?'#f3e8ff':r.payload?.accountType==='revenue'?'#dcfce7':r.payload?.accountType==='service'?'#ede9fe':'#f1f5f9',color:r.payload?.accountType==='expense'||r.kind==='expense'?'#be123c':r.payload?.accountType==='commission'?'#7e22ce':r.payload?.accountType==='revenue'?'#15803d':r.payload?.accountType==='service'?'#7c3aed':'#475569',fontWeight:600}}>{r.payload?.accountType==='expense'||r.kind==='expense'?'مصروفات':r.payload?.accountType==='commission'?'عمولات':r.payload?.accountType==='revenue'?'إيرادات':r.payload?.accountType==='service'?'خدمة':'حساب عام'}</span>}{kind==='invoice'&&<span style={{marginRight:'8px',padding:'2px 6px',fontSize:'11px',borderRadius:'4px',background:r.payload?.language==='en'?'#dbeafe':r.payload?.language==='bilingual'?'#f3e8ff':'#f0fdf4',color:r.payload?.language==='en'?'#1d4ed8':r.payload?.language==='bilingual'?'#7e22ce':'#15803d',fontWeight:600}}>{r.payload?.language==='en'?'English':r.payload?.language==='bilingual'?'ثنائي اللغة':'عربي'}</span>}{kind==='invoice'&&r.payload?.invoiceType&&<span style={{marginRight:'4px',padding:'2px 6px',fontSize:'11px',borderRadius:'4px',background:'#f1f5f9',color:'#475569',fontWeight:600}}>{r.payload?.invoiceType==='tax'?'ضريبية':r.payload?.invoiceType==='proforma'?'مبدئية':'مبيعات'}</span>}{kind==='ticket'&&<small className="cell-secondary">{r.payload.customerName} · {r.payload.airline}</small>}{kind==='service'&&<small className="cell-secondary">{r.payload.customerName||'عميل'} · {r.payload.supplierName||'مورد'}{r.payload.quantity>1?` · عدد: ${r.payload.quantity}`:''}</small>}{kind==='invoice'&&r.payload?.passengerName&&<small className="cell-secondary">{r.payload.passengerName} {r.payload.airline?`· ${r.payload.airline}`:''} {r.payload.route?`(${r.payload.route})`:''}</small>}</TableCell><TableCell dir="ltr">{r.code===r.id?'—':r.code}{r.payload?.receiptNumber?<small className="cell-secondary">إيصال {r.payload.receiptNumber}</small>:null}</TableCell><TableCell dir="ltr">{r.date}</TableCell><TableCell>{r.kind==='customer'||r.currency==='MULTI'?'متعدد العملات':r.currency}</TableCell><TableCell dir="ltr">{r.kind==='customer'||r.currency==='MULTI'?'—':money(r.amount)}</TableCell>{kind==='ticket'&&<TableCell><span className={'status-chip '+r.payload.status}>{r.payload.status==='active'?'نشطة':r.payload.status==='refunded'?'مستردة':'ملغاة'}</span></TableCell>}<TableCell><div className="row-actions">{kind==='invoice'&&<button className="plain-button" onClick={()=>open(r)} title="معاينة وطباعة الفاتورة" style={{display:'inline-flex',alignItems:'center',gap:'4px',color:'#2563eb',fontWeight:600}}><Printer size={15}/>معاينة / طباعة</button>}<button className="plain-button" disabled={!canManage||r.payload.systemGenerated} title={r.payload.systemGenerated?"حركة آلية من العملية الأصلية":undefined} onClick={()=>open(r)} aria-label={'تعديل '+r.name}><Pencil size={16}/></button>{(!kinds[kind]?.financial||['account','expense','invoice','service','ticket','visa'].includes(kind))&&<button className="danger-text" disabled={!canManage} onClick={()=>setRemove(r)} aria-label={'حذف '+r.name}><Trash2 size={16}/></button>}{kind==='ticket'&&(
  <>
    {r.payload.status==='active'&&(
      <>
        <button type="button" className="plain-button" style={{color:'#0f766e',fontWeight:600}} disabled={busy||!canManage} onClick={()=>openRefundModal(r)} title="استرداد التذكرة وحساب الغرامات والعمولات">استرداد</button>
        <button type="button" className="danger-text" disabled={busy||!canManage} onClick={()=>ticketStatus(r,'cancelled')}>إلغاء</button>
      </>
    )}
    {r.payload.status==='refunded'&&(
      <>
        <button type="button" className="plain-button" style={{color:'#2563eb',fontWeight:600}} disabled={busy||!canManage} onClick={()=>openRefundModal(r)} title="تعديل تفاصيل الاسترداد والغرامات والعمولات">تعديل الاسترداد</button>
        <button type="button" className="plain-button" style={{color:'#64748b'}} disabled={busy||!canManage} onClick={()=>revertRefund(r)} title="إعادة تفعيل التذكرة كنشطة">إعادة تفعيل</button>
      </>
    )}
  </>
)}</div></TableCell></TableRow>)}</TableBody></Table>{!visible.length&&<Empty loading={loading} error={error} load={load}/>}</div><p className="table-summary">عدد السجلات: {visible.length}{currency!=='all'&&kind!=='customer'&&<> · المجموع: <b dir="ltr">{money(visible.reduce((s,r)=>s+r.amount,0))} {currency}</b></>}</p><Dialog open={!!form&&w.active} onOpenChange={v=>!v&&setForm(null)}><DialogContent dir="rtl" className={(w.expanded?'is-maximized ':'')+((['ticket','service','invoice'].includes(kind)?'ticket-dialog':'record-dialog'))} style={kind==='invoice'?{maxWidth:'min(1200px, 98vw)',maxHeight:'96dvh',overflow:'auto',padding:'18px'}:undefined}><div className="window-title record-window-title"><DialogTitle>{form?.id?'تعديل بيانات':'إضافة'} {kind==='invoice'?'فاتورة':form?.payload?.accountType==='airline'?'حساب خط طيران':form?.payload?.accountType==='supplier'?'حساب مورد':form?.payload?.accountType==='service'?'حساب خدمة':form?.payload?.accountType==='revenue'?'حساب إيرادات':form?.payload?.accountType==='commission'?'حساب عمولات':form?.payload?.accountType==='expense'?'حساب مصروفات':kind==='customer'?'عميل':title}</DialogTitle><WindowControls refresh={load} close={()=>setForm(null)}/></div><DialogDescription className="sr-only">{kind==='ticket'?'راجع بيانات المسافر والتذكرة قبل الحفظ.':kind==='invoice'?'إصدار وتعديل الفاتورة آلياً.':'أدخل بيانات السجل ثم اضغط حفظ.'}</DialogDescription>{form&&(kind==='ticket'?<TicketEntry initial={form} onDraftChange={setForm} onSaved={()=>{setForm(null);load()}}/>:kind==='service'?<ServiceEntry initial={form} onDraftChange={setForm} onSaved={()=>{setForm(null);load()}} onClose={()=>setForm(null)}/>:kind==='invoice'?<InvoiceEntry initial={form} onSaved={()=>{setForm(null);load()}} onCancel={()=>setForm(null)} onClose={()=>setForm(null)}/>:<form className="record-form" onSubmit={save}>{kind==='customer'&&<Picker label="نوع الحساب" value={form.payload?.accountType||'customer'} onChange={v=>setForm({...form,payload:{...form.payload,accountType:v}})} options={[{value:'customer',label:'عميل'},{value:'airline',label:'خط طيران'},{value:'supplier',label:'مورد'},{value:'service',label:'حساب خدمة'}]}/>}{['account','expense'].includes(kind)&&<Picker label="نوع الحساب" value={form.payload?.accountType||(kind==='expense'?'expense':accountTypeFilter!=='all'?accountTypeFilter:'revenue')} onChange={v=>setForm({...form,payload:{...form.payload,accountType:v}})} options={[{value:'service',label:'حساب خدمة'},{value:'revenue',label:'حساب إيرادات'},{value:'commission',label:'حساب عمولات'},{value:'expense',label:'حساب مصروفات'},{value:'general',label:'حساب عام'}]}/>}<Field label={form.payload?.accountType==='airline'?'اسم شركة الطيران':form.payload?.accountType==='supplier'?'اسم المورد':form.payload?.accountType==='service'?'اسم حساب الخدمة':form.payload?.accountType==='revenue'?'اسم حساب الإيرادات':form.payload?.accountType==='commission'?'اسم حساب العمولات':kind==='customer'?'الاسم':'الاسم / البيان'} value={form.name} onChange={v=>setForm({...form,name:v})} required placeholder={form.payload?.accountType==='airline'?'مثال: بدر للطيران أو TARCO AIRLINES':form.payload?.accountType==='supplier'?'مثال: شركة سياحة / فندق / مورد خارجي':form.payload?.accountType==='service'?'مثال: خدمات تأشيرات / حجز فنادق / برامج سياحية':form.payload?.accountType==='revenue'?'مثال: إيرادات التذاكر أو أرباح مبيعات التذاكر':kind==='customer'?'اسم العميل أو شركة الطيران أو المورد أو الخدمة':['account','expense'].includes(kind)?'اسم الحساب':'الاسم'}/>{kind!=='customer'&&<Field label="الرقم المرجعي (الكود)" placeholder="اختياري - يترك فارغاً للتوليد التلقائي" value={form.code||''} onChange={v=>setForm({...form,code:v})}/>}<Field label="التاريخ" type="date" value={form.date} onChange={v=>setForm({...form,date:v})} required/><Picker label="العملة" value={form.currency} onChange={v=>setForm({...form,currency:v,payload:{...form.payload,customerId:undefined,treasuryId:undefined}})} options={['account','expense','customer'].includes(kind)?[{value:'MULTI',label:'متعدد العملات (يقبل جميع العملات)'},...catalog.filter(c=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(c)||form.id&&c===form.currency).map(c=>({value:c,label:c}))]:catalog.filter(c=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(c)||form.id&&c===form.currency).map(c=>({value:c,label:c}))}/>{form.currency!=='MULTI'&&<Field label={['customer','account'].includes(kind)?'رصيد افتتاحي':'المبلغ'} type="number" value={form.amount} onChange={v=>setForm({...form,amount:v})} required={!['customer','account'].includes(kind)}/>}{['cash','bank'].includes(kind)&&<Picker label="نوع الحركة" value={form.payload.direction} onChange={v=>setForm({...form,payload:{...form.payload,direction:v}})} options={[{value:'receipt',label:'قبض'},{value:'payment',label:'صرف'}]}/>}<Field label="رقم الهاتف" value={form.payload.phone||''} onChange={v=>setForm({...form,payload:{...form.payload,phone:v}})}/>{kind==='customer'&&<><Field label="الإيميل" type="text" placeholder="example@email.com" value={form.payload.email||''} onChange={v=>setForm({...form,payload:{...form.payload,email:v}})}/><Field label="العنوان" value={form.payload.address||''} onChange={v=>setForm({...form,payload:{...form.payload,address:v}})}/><Field label="سقف الحساب" type="number" value={form.payload.creditLimit??''} onChange={v=>setForm({...form,payload:{...form.payload,creditLimit:v===''?undefined:v}})}/>
{(!form.payload?.accountType||form.payload?.accountType==='customer')&&<div style={{gridColumn:'1 / -1',padding:'12px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',marginTop:'4px',display:'flex',flexDirection:'column',gap:'10px'}} dir="rtl">
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:600,fontSize:'13px',color:'#166534'}}>
      <input type="checkbox" checked={!!form.payload.portalEnabled} onChange={e=>setForm({...form,payload:{...form.payload,portalEnabled:e.target.checked}})} style={{width:'18px',height:'18px',accentColor:'#16a34a'}}/>
      🌐 تفعيل بوابة العملاء الذاتية (B2B Client Portal)
    </label>
    {form.payload.portalEnabled && (
      <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'12px',background:'#dcfce7',color:'#15803d',fontWeight:600}}>
        بوابة نشطة
      </span>
    )}
  </div>
  {form.payload.portalEnabled && (
    <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'10px',alignItems:'end'}}>
      <Field label="رمز PIN / كود الدخول للبوابة" placeholder="مثال: 1234 أو كود مخصص" value={form.payload.portalCode||''} onChange={v=>setForm({...form,payload:{...form.payload,portalCode:v}})}/>
      <button type="button" className="plain-button" style={{padding:'8px 12px',background:'#22c55e',color:'#fff',borderColor:'#16a34a',fontWeight:600,display:'flex',alignItems:'center',gap:'6px'}} disabled={!form.payload.phone} onClick={()=>{
        const code = form.payload.portalCode || '1234';
        const phone = form.payload.phone;
        const msg = `مرحباً بك عزيزنا ${form.name}،\nيسعدنا تزويدكم برابط بوابة الخدمات الذاتية لشركتكم/حسابكم:\n🔗 الرابط: ${typeof window !== 'undefined' ? window.location.origin : ''}/portal\n📱 رقم الهاتف: ${phone}\n🔑 رمز الدخول (PIN): ${code}\nيمكنكم من خلال البوابة متابعة أرصدتكم، كشف الحساب، التذاكر، وتقديم طلبات الحجز والتحويل مباشرة.`;
        openWhatsAppDirect(phone, msg);
      }} title={!form.payload.phone?'أدخل رقم هاتف العميل أولاً':'إرسال الرابط وكود الدخول للعميل عبر واتساب'}>
        <ERPIcon name="whatsapp" size={16}/>
        إرسال بيانات البوابة عبر واتساب
      </button>
    </div>
  )}
</div>}</>}{customers.length>0&&['cash','bank','service','visa','invoice'].includes(kind)&&<Picker label="العميل" value={form.payload.customerId||'none'} onChange={v=>setForm({...form,payload:{...form.payload,customerId:v==='none'?undefined:v}})} options={[{value:'none',label:'بدون ربط'},...customers.map(c=>({value:c.id,label:c.name}))]}/>}{["service","visa"].includes(kind)&&<Picker label="طريقة السداد" value={form.payload.payment||"credit"} onChange={v=>setForm({...form,payload:{...form.payload,payment:v,treasuryId:undefined}})} options={[{value:"credit",label:"آجل"},{value:"cash",label:"نقدي"},{value:"bank",label:"بنك"}]}/>}{(["cash","bank"].includes(kind)||["service","visa"].includes(kind)&&["cash","bank"].includes(form.payload.payment))&&<Picker label="حساب التحصيل" value={form.payload.treasuryId||""} onChange={v=>setForm({...form,payload:{...form.payload,treasuryId:v}})} options={collectionAccounts.filter(a=>a.currency===form.currency&&a.kind===((kind==="bank"||form.payload.payment==="bank")?"bank-account":"cash-account")).map(a=>({value:a.id,label:a.name+" · "+a.currency}))}/>}<label className="stack-label">ملاحظات<textarea value={form.payload.notes||''} onChange={e=>setForm({...form,payload:{...form.payload,notes:e.target.value}})}/></label><div style={{display:'flex',gap:'10px',marginTop:'14px',flexWrap:'wrap'}}><button type="submit" className="blue-button" disabled={busy||!canManage} style={{flex:1}}>{busy?'جارٍ الحفظ…':form?.id?'حفظ التعديل':'حفظ وإغلاق'}</button>{!form?.id&&['customer','account','expense'].includes(kind)&&<button type="button" className="plain-button" disabled={busy||!canManage} style={{background:'#f0fdf4',color:'#166534',borderColor:'#86efac',fontWeight:600,display:'flex',alignItems:'center',gap:'6px'}} onClick={(e)=>save(e, false)}><Plus size={16}/><span>حفظ وإضافة آخر</span></button>}<button type="button" className="gray-button" onClick={()=>setForm(null)}>إلغاء</button></div></form>)}</DialogContent></Dialog><AlertDialog open={!!remove&&w.active} onOpenChange={v=>!v&&setRemove(null)}><AlertDialogContent dir="rtl"><AlertDialogTitle>حذف السجل</AlertDialogTitle><AlertDialogDescription>هل تريد حذف «{remove?.name}»؟</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>رجوع</AlertDialogCancel><AlertDialogAction onClick={deleteRow}>حذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{refundModalTicket&&<Dialog open={!!refundModalTicket} onOpenChange={v=>!v&&setRefundModalTicket(null)}><DialogContent dir="rtl" style={{maxWidth:'640px',borderRadius:'14px',padding:'22px',maxHeight:'90vh',overflowY:'auto'}}>{(()=>{const row=refundModalTicket;const p=row.payload||{};const origCost=p.originalCostMinor!==undefined?p.originalCostMinor/100:Number(p.supplierPrice||p.sellingPrice||(Math.abs(row.amount)/100)||0);const origSell=p.originalSellMinor!==undefined?p.originalSellMinor/100:Number(p.sellingPrice||origCost||0);const penalty=Number(refundForm.penalties||0);const supComm=Number(refundForm.supplierComm||0);const refComm=Number(refundForm.refundComm||0);const supRefund=Math.max(0,origCost-penalty-supComm);const custRefund=Math.max(0,supRefund-refComm);const officeProfit=refComm;const custName=p.customerName||customers.find(c=>c.id===p.customerId)?.name||'غير محدد';const supName=p.airline||p.vendor||p.supplierName||'غير محدد';return <form onSubmit={submitRefund}><div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}><div style={{width:'40px',height:'40px',borderRadius:'10px',background:'#fef2f2',color:'#dc2626',display:'flex',alignItems:'center',justifyContent:'center'}}><RotateCcw size={22}/></div><div><DialogTitle style={{fontSize:'18px',fontWeight:700,color:'#1e293b',margin:0}}>استرداد تذكرة سفر (Ticket Refund)</DialogTitle><DialogDescription style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>تذكرة رقم: <b dir="ltr" style={{color:'#0f766e'}}>{row.code}</b> · المسافر: <b>{row.name}</b></DialogDescription></div></div><div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'12px',marginBottom:'16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',fontSize:'12px'}}><div><span style={{color:'#64748b'}}>المسافر:</span> <b>{row.name}</b></div><div><span style={{color:'#64748b'}}>العميل:</span> <b>{custName}</b></div><div><span style={{color:'#64748b'}}>الخطوط / المورد:</span> <b>{supName}</b></div><div><span style={{color:'#64748b'}}>العملة:</span> <b>{row.currency}</b></div><div><span style={{color:'#64748b'}}>سعر البيع الأصلي:</span> <b dir="ltr" style={{color:'#0f766e'}}>{origSell.toLocaleString()} {row.currency}</b></div><div><span style={{color:'#64748b'}}>تكلفة المورد الأصلية:</span> <b dir="ltr" style={{color:'#7c3aed'}}>{origCost.toLocaleString()} {row.currency}</b></div></div><div style={{display:'flex',flexDirection:'column',gap:'12px',marginBottom:'16px'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}><Field label={'تاريخ الاسترداد *'} type="date" value={refundForm.refundDate} onChange={(v:any)=>setRefundForm(f=>({...f,refundDate:v}))} required/><Field label={'غرامة إلغاء الخطوط ('+row.currency+')'} color="#b91c1c" type="number" value={refundForm.penalties} onChange={(v:any)=>setRefundForm(f=>({...f,penalties:v}))} placeholder="تخصم من حساب المورد"/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}><Field label={'عمولة المورد ('+row.currency+')'} color="#b45309" type="number" value={refundForm.supplierComm} onChange={(v:any)=>setRefundForm(f=>({...f,supplierComm:v}))} placeholder="عمولة المورد إن وجدت"/><Field label={'عمولة استرداد المكتب ('+row.currency+')'} color="#047857" type="number" allowNegative={true} value={refundForm.refundComm} onChange={(v:any)=>setRefundForm(f=>({...f,refundComm:v}))} placeholder="ربح المكتب أو سالب لإرجاعها"/></div><div style={{display:'flex',gap:'6px',marginTop:'-6px',marginBottom:'10px',justifyContent:'flex-end'}}><button type="button" onClick={()=>setRefundForm(f=>({...f,refundComm:0}))} style={{fontSize:'11px',padding:'2px 8px',background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:'4px',cursor:'pointer',color:'#475569'}}>بدون عمولة (0)</button><button type="button" onClick={()=>{const c=Number(refundForm.refundComm||0);setRefundForm(f=>({...f,refundComm:c>0?-c:(c<0?c:-1000)}));}} style={{fontSize:'11px',padding:'2px 8px',background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'4px',cursor:'pointer',color:'#b91c1c',fontWeight:600}}>إرجاع بالناقص (-)</button><button type="button" onClick={()=>{const c=Number(refundForm.refundComm||0);setRefundForm(f=>({...f,refundComm:Math.abs(c)}));}} style={{fontSize:'11px',padding:'2px 8px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'4px',cursor:'pointer',color:'#15803d',fontWeight:600}}>ربح موجب (+)</button></div><div style={{display:'grid',gridTemplateColumns:'1fr',gap:'10px'}}><Picker label="حساب إيرادات الاسترداد (أرباح المكتب)" value={refundForm.commissionAccountId} onChange={v=>setRefundForm(f=>({...f,commissionAccountId:v}))} options={[{value:'',label:revenueAccounts.length>0?'اختر حساب الإيرادات...':'لا يوجد حساب إيرادات'},...revenueAccounts.map(a=>({value:a.id,label:a.name+' · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)}))]}/></div><Field label="ملاحظات الاسترداد" value={refundForm.notes} onChange={(v:any)=>setRefundForm(f=>({...f,notes:v}))} placeholder="سبب الاسترداد، رقم مرجع الإلغاء، أو شروط الاسترداد"/></div><div style={{background:officeProfit>0?'#f0fdf4':officeProfit<0?'#fef2f2':'#f8fafc',border:`1.5px solid ${officeProfit>0?'#86efac':officeProfit<0?'#fca5a5':'#cbd5e1'}`,borderRadius:'10px',padding:'14px',marginBottom:'18px'}}><div style={{fontWeight:700,fontSize:'13px',color:officeProfit>0?'#166534':officeProfit<0?'#b91c1c':'#475569',marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>📊 الحسبة المحاسبية للاسترداد (مطابقة تلقائية):</span><span style={{fontSize:'11px',background:officeProfit>0?'#dcfce7':officeProfit<0?'#fee2e2':'#e2e8f0',color:officeProfit>0?'#15803d':officeProfit<0?'#991b1b':'#334155',padding:'2px 8px',borderRadius:'12px',fontWeight:600}}>{officeProfit>0?'ربح محقق (+)':officeProfit<0?'مخصوم من العمولات (-)':'بدون عمولة (0)'}</span></div><div style={{display:'flex',flexDirection:'column',gap:'6px',fontSize:'12px'}}><div style={{display:'flex',justifyContent:'space-between',color:'#334155'}}><span>تكلفة التذكرة الأصلية (من المورد/الخطوط):</span><b dir="ltr">{origCost.toLocaleString()} {row.currency}</b></div><div style={{display:'flex',justifyContent:'space-between',color:'#b91c1c'}}><span>(-) غرامة إلغاء الخطوط (تخصم من المورد):</span><b dir="ltr">- {penalty.toLocaleString()} {row.currency}</b></div>{supComm>0&&<div style={{display:'flex',justifyContent:'space-between',color:'#b45309'}}><span>(-) عمولة المورد (تخصم من المورد):</span><b dir="ltr">- {supComm.toLocaleString()} {row.currency}</b></div>}<div style={{display:'flex',justifyContent:'space-between',color:'#7c3aed',borderTop:'1px dashed #cbd5e1',paddingTop:'5px',fontWeight:700}}><span>(=) صافي المسترد من المورد / الخطوط للمكتب:</span><b dir="ltr">{supRefund.toLocaleString()} {row.currency}</b></div><div style={{display:'flex',justifyContent:'space-between',color:refComm<0?'#b91c1c':'#c2410c'}}><span>{refComm<0?'(+) إرجاع عمولة المكتب للراكب:':'(-) عمولة استرداد المكتب (تخصم من الراكب):'}</span><b dir="ltr">{refComm<0?`+${Math.abs(refComm).toLocaleString()}`:`- ${refComm.toLocaleString()}`} {row.currency}</b></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'2px solid #22c55e',paddingTop:'8px',marginTop:'4px',background:'#ffffff',padding:'8px 10px',borderRadius:'6px',color:'#15803d',fontWeight:800}}><span style={{fontSize:'13px'}}>(=) صافي المبلغ المسترد للراكب / العميل:</span><span style={{fontSize:'16px'}} dir="ltr">{custRefund.toLocaleString()} {row.currency}</span></div><div style={{display:'flex',justifyContent:'space-between',color:officeProfit>0?'#15803d':officeProfit<0?'#b91c1c':'#475569',fontSize:'12px',paddingTop:'4px',fontWeight:700}}><span>{officeProfit>0?'✨ صافي ربح الوكالة المحقق:':officeProfit<0?'⚠️ صافي ربح الوكالة (مسترد بالناقص ويُخصم من العمولات):':'⚖️ صافي ربح الوكالة (بدون عمولة):'}</span><b dir="ltr">{officeProfit>0?`+${officeProfit.toLocaleString()}`:officeProfit.toLocaleString()} {row.currency}</b></div></div></div><div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}><button type="button" className="gray-button" onClick={()=>setRefundModalTicket(null)}>إلغاء</button><button type="submit" className="blue-button" disabled={busy} style={{background:'#16a34a',borderColor:'#15803d',padding:'8px 20px',fontWeight:700,display:'flex',alignItems:'center',gap:'6px'}}><Check size={16}/><span>{busy?'جارٍ الحفظ…':'تأكيد وحفظ الاسترداد'}</span></button></div></form>})()}</DialogContent></Dialog>}</div>
}
const newTicket=()=>({name:'',code:'',date:today(),currency:'EGP',amount:0,_attachment:null,_stagedId:undefined,payload:{receiptNumber:'',customerId:'',treasuryId:'',brokerId:'',brokerCommission:0,airline:'',vendor:'',supplierId:undefined,commissionAccountId:'',fare:0,sellingPrice:0,supplierPrice:0,commAmount:0,commPct:0,penalties:0,refundComm:0,discount:0,discountPct:0,extraPct:0,extraComm:0,payment:'credit',route:'',class:'',sign:'',income:'عمولة التذاكر',notes:'',passengers:[{name:'',ticketNo:''}],taxes:Object.fromEntries(['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t=>[t,0])),flags:Object.fromEntries(['Non IATA','Zero Comm','BSP','Group','Broker'].map(t=>[t,false])),crossCurrency:false,settlementCurrency:'SDG',settlementTreasuryId:'',settlementAmount:'',conversionRate:1,status:'active'}});
export function TicketEntry({initial,initialStagedOp,onStagedConsumed,onSaved,onDraftChange}:{initial?:any;initialStagedOp?:any;onStagedConsumed?:()=>void;onSaved?:()=>void;onDraftChange?:(form:any)=>void}){
 const w=useWorkspaceWindow(),settings=useAgencySettings(),access=useAgencyAccess(),canManage=access.modules.tickets==='manage',collectionAccounts=useCollectionAccounts();const [showTaxes,setShowTaxes]=useState<boolean>(initial?._showTaxes??true),[catalog,setCatalog]=useState<string[]>(currencies),[balances,setBalances]=useState<any[]>([]);
 const [passengersList,setPassengersList]=useState<{name:string;ticketNo:string}[]>(()=>{if(initial?.payload?.passengers&&Array.isArray(initial.payload.passengers)&&initial.payload.passengers.length>0)return initial.payload.passengers;return [{name:initial?.name||'',ticketNo:initial?.code||''}];});
 const [analyzingFile,setAnalyzingFile]=useState(false);
 const [form,setForm]=useState<any>(initial?{...initial,payload:{...newTicket().payload,...initial.payload,vendor:initial.payload.vendor||(initial.payload.flags?.['Non IATA']?initial.payload.airline:'')}}:{...newTicket(),currency:settings.defaultCurrency||settings.enabledCurrencies?.[0]||'EGP'}),[customers,setCustomers]=useState<RecordRow[]>([]),[tickets,setTickets]=useState<RecordRow[]>([]),[supplierAccounts,setSupplierAccounts]=useState<RecordRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(''),[ticketSearch,setTicketSearch]=useState(initial?._ticketSearch||''),[help,setHelp]=useState(false),[pricingChoiceModal,setPricingChoiceModal]=useState<any>(null),[whatsAppModal,setWhatsAppModal]=useState<{name:string;phone:string;message:string}|null>(null);
 const [quickCustomerModal,setQuickCustomerModal]=useState(false);
 const [quickCustomerName,setQuickCustomerName]=useState('');
 const [quickCustomerPhone,setQuickCustomerPhone]=useState('');
 const [quickCustomerEmail,setQuickCustomerEmail]=useState('');
 const [quickCustomerAddress,setQuickCustomerAddress]=useState('');
 const [quickCustomerCurrency,setQuickCustomerCurrency]=useState('MULTI');
 const [quickCustomerSaving,setQuickCustomerSaving]=useState(false);
 const [quickAirlineModal,setQuickAirlineModal]=useState(false);
 const [quickAirlineName,setQuickAirlineName]=useState('');
 const [quickAirlineCurrency,setQuickAirlineCurrency]=useState('MULTI');
 const [quickAirlinePhone,setQuickAirlinePhone]=useState('');
 const [quickAirlineNotes,setQuickAirlineNotes]=useState('');
 const [quickAirlineSaving,setQuickAirlineSaving]=useState(false);
 const [quickRevenueModal,setQuickRevenueModal]=useState(false);
 const [quickRevenueName,setQuickRevenueName]=useState('');
 const [quickRevenueCurrency,setQuickRevenueCurrency]=useState('MULTI');
 const [quickRevenueNotes,setQuickRevenueNotes]=useState('');
 const [quickRevenueSaving,setQuickRevenueSaving]=useState(false);
 const [confirmEditTicketOpen,setConfirmEditTicketOpen]=useState(false);
 const [confirmDeleteTicketOpen,setConfirmDeleteTicketOpen]=useState(false);
 const [enableFareEdit,setEnableFareEdit]=useState(false);
 const autoTicketVoucherRef = useRef<string>('');
 const isManualTicketVoucherRef = useRef<boolean>(false);
 const pricingLeadRef = useRef<'comm'|'sell'|'supplier'|'none'>('none');
 const nextVoucherNumber = useMemo(()=>{
  const maxNum = tickets.reduce((max, t)=>{
   const raw = t.payload?.receiptNumber;
   const n = parseInt(raw || '', 10);
   return !isNaN(n) && n > max ? n : max;
  }, 0);
  return String(maxNum + 1);
 }, [tickets]);
 useEffect(()=>{
  if(!form.id){
   if(!isManualTicketVoucherRef.current || !p.receiptNumber || p.receiptNumber === autoTicketVoucherRef.current){
    setP('receiptNumber', nextVoucherNumber);
    autoTicketVoucherRef.current = nextVoucherNumber;
   }
  }
 },[nextVoucherNumber, form.id]);
 useEffect(()=>{onDraftChange?.({...form,_showTaxes:showTaxes,_ticketSearch:ticketSearch})},[form,showTaxes,ticketSearch]);
 const load=useCallback(async()=>{try{const [c,t,a]=await Promise.all([api('/api/records?kind=customer'),api('/api/records?kind=ticket'),api('/api/records?kind=account').catch(()=>[])]);setCustomers(c);setTickets(t);setSupplierAccounts(a);api('/api/currencies').then(c=>setCatalog(c.map((x:any)=>x.code))).catch(()=>{});api('/api/balances').then(b=>setBalances(b.balances)).catch(()=>{});setError('')}catch(e:any){setError(e.message)}},[]);useEffect(()=>{if(w.active)load()},[load,w.active,w.refreshKey]);
 const set=(key:string,v:any)=>setForm((f:any)=>({...f,[key]:v,...(key==='currency'?{payload:{...f.payload,brokerId:'',supplierId:undefined,treasuryId:''}}:{})}));const setP=(key:string,v:any)=>setForm((f:any)=>({...f,payload:{...f.payload,[key]:v}}));const p=form.payload;
 function resetForm(nextReceipt?: string){
  const freshPax = [{ name: '', ticketNo: '' }];
  setPassengersList(freshPax);
  setShowTaxes(false);
  setEnableFareEdit(false);
  setSelected('');
  setPricingChoiceModal(null);
  setAnalyzingFile(false);
  pricingLeadRef.current = 'none';
  isManualTicketVoucherRef.current = false;
  const recNo = nextReceipt !== undefined ? nextReceipt : nextVoucherNumber;
  autoTicketVoucherRef.current = recNo;
  setForm({
   ...newTicket(),
   currency: settings.defaultCurrency || settings.enabledCurrencies?.[0] || 'EGP',
   _attachment: null,
   _stagedId: undefined,
   payload: {
    ...newTicket().payload,
    receiptNumber: recNo,
    passengers: freshPax
   }
  });
 }
 function updatePassengers(newList:{name:string;ticketNo:string}[]){
  const sanitizedList = newList.map(p => ({
   name: p.name,
   ticketNo: p.ticketNo ? p.ticketNo.replace(/\D/g, '') : ''
  }));
  setPassengersList(sanitizedList);
  const primaryName=sanitizedList.map(p=>p.name.trim()).filter(Boolean).join(' / ')||sanitizedList[0]?.name||'';
  const primaryCode=(sanitizedList[0]?.ticketNo || '').replace(/\D/g, '');
  setForm((f:any)=>({...f,name:primaryName||f.name,code:primaryCode||f.code,payload:{...f.payload,passengers:sanitizedList}}));
 }
 function addPassengerRow(){
  const lastTicket=passengersList[passengersList.length-1]?.ticketNo?.trim();
  let nextTicket='';
  if(lastTicket&&/^\d+$/.test(lastTicket)){try{nextTicket=String(BigInt(lastTicket)+BigInt(1));}catch{}}
  updatePassengers([...passengersList,{name:'',ticketNo:nextTicket}]);
 }
 function removePassengerRow(index:number){
  if(passengersList.length<=1)return;
  updatePassengers(passengersList.filter((_,i)=>i!==index));
 }
 function updatePassengerRow(index:number,field:'name'|'ticketNo',val:string){
  const sanitizedVal = field === 'ticketNo' ? val.replace(/\D/g, '') : val;
  updatePassengers(passengersList.map((p,i)=>i===index?{...p,[field]:sanitizedVal}:p));
 }
 function prepareChoiceData(op:any,extracted:any){
   const sp=op?.payload||{};
   const isTkt=(val:string)=>/^\d{10,14}$/.test(val?.replace(/[-\s]/g,''));
   const paxRows:{name:string;ticketNo:string}[]=[];
   if(extracted?.passengers&&extracted.passengers.length>0){
    for(const pax of extracted.passengers)paxRows.push({name:pax.name||'',ticketNo:pax.ticketNo||''});
   }else if(sp.passengers&&Array.isArray(sp.passengers)&&sp.passengers.length>0){
    for(const pax of sp.passengers)paxRows.push({name:pax.name||'',ticketNo:pax.ticketNo||''});
   }

   const fallbackPaxName=(extracted?.passenger||sp.person||(op?.name!==sp.customerName?op?.name:'')||'').trim();
   const fallbackTktNo=(extracted?.ticketNo||sp.code||op?.code||'').trim();

   if(paxRows.length===0){
    if(fallbackPaxName||fallbackTktNo)paxRows.push({name:fallbackPaxName,ticketNo:fallbackTktNo});
   }else{
    if(!paxRows[0].name&&fallbackPaxName)paxRows[0].name=fallbackPaxName;
    if(!paxRows[0].ticketNo&&fallbackTktNo)paxRows[0].ticketNo=fallbackTktNo;
   }

   const isRefund=sp.type==='ticket-refund';
   const isVoid=sp.type==='ticket-void';
   const status=isRefund?'refunded':isVoid?'cancelled':'active';

   const rawCustName=(sp.customerName||extracted?.customerName||'').trim();
   const rawPaxName=(paxRows.map(p=>p.name).filter(Boolean).join(' / ')||extracted?.passenger||sp.person||(op?.name !== sp.customerName ? op?.name : '')||'').trim();

   const isCustMatch = (cName: string, target: string) => {
    if (!cName || !target) return false;
    const a = cName.trim().toLowerCase();
    const t = target.trim().toLowerCase();
    if (a === t || a.includes(t) || t.includes(a)) return true;
    if (t.includes('nader') && a.includes('نادر')) return true;
    if (t.includes('nouraya') && a.includes('نورآية')) return true;
    return false;
   };

   const matchedCust=customers.find(c=>
    c.id===sp.customerId||
    (rawCustName&&isCustMatch(c.name,rawCustName))
   );

   const rawCodeCandidate = (paxRows[0]?.ticketNo || extracted?.ticketNo || sp.code || op?.code || '').trim();
   const cleanDigits = rawCodeCandidate.replace(/\D/g, '');
   const finalCode = (cleanDigits.length >= 8 ? cleanDigits : (extracted?.pnr || rawCodeCandidate)).trim();
   if(paxRows.length>0&&!paxRows[0].ticketNo&&finalCode){
    paxRows[0].ticketNo=finalCode;
   }
   if(paxRows.length>0&&!paxRows[0].name&&rawPaxName){
    paxRows[0].name=rawPaxName;
   }
   const finalRoute=extracted?.route||sp.route||'';
   const finalClass=extracted?.class||sp.class||'';
   const finalDate=(extracted?.date||sp.date||op?.date||today()).trim();
   const finalCurrency=extracted?.currency||sp.currency||op?.currency||form.currency||'USD';

   const totalAmt = (sp.sellingPrice!==undefined&&sp.sellingPrice!==''&&Number(sp.sellingPrice)>0)
    ? Number(sp.sellingPrice)
    : (extracted?.total&&Number(extracted.total)>0)
      ? Number(extracted.total)
      : (op?.amount&&Number(op.amount)>0)
        ? (Number(op.amount)>2000?Number(op.amount)/100:Number(op.amount))
        : (sp.fare&&Number(sp.fare)>0)
          ? Number(sp.fare)
          : (extracted?.fare&&Number(extracted.fare)>0)
            ? Number(extracted.fare)
            : 0;

   const taxesObj = (extracted?.taxes && Object.keys(extracted.taxes).length > 0)
    ? extracted.taxes
    : (sp.taxes || Object.fromEntries(['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t=>[t,0])));
   const taxSum = Object.values(taxesObj).reduce<number>((s:number,v:any)=>s+Number(v||0),0);

   const finalFare = (extracted?.fare!==undefined&&Number(extracted.fare)>0)
    ? Number(extracted.fare)
    : (sp.fare!==undefined&&sp.fare!==''&&Number(sp.fare)>0)
      ? Number(sp.fare)
      : Math.max(0, totalAmt - taxSum);

   const isExternal = sp.commType === 'external';
   const commVal = Number(sp.commAmount || 0);

   const finalSup = (sp.supplierPrice!==undefined&&sp.supplierPrice!==''&&Number(sp.supplierPrice)>0)
    ? Number(sp.supplierPrice)
    : Math.max(0, (totalAmt > 0 ? totalAmt : (finalFare + taxSum)) - commVal);

   const finalSell = (sp.sellingPrice!==undefined&&sp.sellingPrice!==''&&Number(sp.sellingPrice)>0)
    ? Number(sp.sellingPrice)
    : (isExternal ? (finalSup + commVal) : (totalAmt > 0 ? totalAmt : (finalFare + taxSum)));

   const finalComm = (sp.commAmount!==undefined&&sp.commAmount!==''&&Number(sp.commAmount)>=0)
    ? Number(sp.commAmount)
    : Math.max(0, finalSell - finalSup);

   const rawAirline=(extracted?.airline||sp.airline||'').trim();
   const isAirlineMatch = (accName: string, target: string) => {
    if (!accName || !target) return false;
    const a = accName.toLowerCase();
    const t = target.toLowerCase();
    if (a === t || a.includes(t) || t.includes(a)) return true;
    if ((t.includes('tarco') || t.includes('3t')) && a.includes('تاركو')) return true;
    if ((t.includes('badr') || t.includes('j4')) && a.includes('بدر')) return true;
    if ((t.includes('qatar') || t.includes('qr')) && (a.includes('القطرية') || a.includes('قطر') || a.includes('قطريه'))) return true;
    if ((t.includes('egypt') || t.includes('ms')) && a.includes('مصر')) return true;
    if ((t.includes('saud') || t.includes('sv')) && a.includes('السعودية')) return true;
    if ((t.includes('flydubai') || t.includes('fz')) && (a.includes('دبي') || a.includes('flydubai'))) return true;
    if ((t.includes('emirates') || t.includes('ek')) && a.includes('الإمارات')) return true;
    if ((t.includes('salam') || t.includes('ov')) && (a.includes('السلام') || a.includes('سلام'))) return true;
    return false;
   };

   const matchedAirline=customers.find(c=>['airline','supplier'].includes(c.payload?.accountType)&&isAirlineMatch(c.name,rawAirline))||supplierAccounts.find((a:RecordRow)=>(a.currency==='MULTI'||a.currency===finalCurrency)&&isAirlineMatch(a.name,rawAirline));
   const finalCommAccountId=sp.commissionAccountId||form.payload?.commissionAccountId||'';

   return {
    op,
    sp,
    extracted,
    paxRows,
    status,
    rawCustName,
    rawPaxName,
    matchedCust,
    finalCode,
    finalRoute,
    finalClass,
    finalDate,
    finalCurrency,
    totalAmt,
    taxesObj,
    taxSum,
    finalFare,
    finalSell,
    finalSup,
    finalComm,
    rawAirline,
    matchedAirline,
    finalCommAccountId
   };
  }

  function applyPricingChoice(mode:'total_only'|'detailed_taxes',overrideData?:any){
   const data=overrideData||pricingChoiceModal;
   if(!data)return;
   const isDetailed=mode==='detailed_taxes';

   if(data.paxRows&&data.paxRows.length>0){
    updatePassengers(data.paxRows);
   }

   const formFare=isDetailed?data.finalFare:data.finalSell;
   const formTaxes=isDetailed?data.taxesObj:Object.fromEntries(['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t=>[t,0]));

   setShowTaxes(isDetailed);

   setForm((f:any)=>({
    ...f,
    _stagedId:data.op?.id||f._stagedId,
    _attachment:data.sp?.attachment||data.extracted?.attachment||f._attachment,
    name:data.rawPaxName||f.name,
    code:data.finalCode||f.code,
    date:data.finalDate||f.date,
    currency:data.finalCurrency||f.currency,
    payload:{
     ...f.payload,
     passengers:data.paxRows?.length>0?data.paxRows:f.payload.passengers,
     status:data.status||f.payload.status,
     customerId:data.matchedCust?.id||data.sp?.customerId||f.payload.customerId,
     airline:data.matchedAirline?.name||data.rawAirline||f.payload.airline,
     vendor:data.sp?.vendor||f.payload.vendor,
     supplierId:data.matchedAirline?.id||f.payload.supplierId,
     commissionAccountId:data.finalCommAccountId||f.payload.commissionAccountId,
     fare:formFare,
     sellingPrice:data.finalSell,
     supplierPrice:data.finalSup,
     commAmount:data.finalComm,
     commPct:data.sp?.commPct||0,
     commType:data.sp?.commType||'internal',
     flags:{...(f.payload?.flags||{}),'Zero Comm':data.sp?.commType==='external','BSP':data.sp?.commType!=='external'},
     penalties:data.sp?.penalties||0,
     refundComm:data.sp?.refundComm||0,
     route:data.finalRoute||f.payload.route,
     class:data.finalClass||f.payload.class,
     notes:data.sp?.notes||f.payload.notes,
     taxes:formTaxes,
     crossCurrency:!!data.sp?.crossCurrency,
     settlementCurrency:data.sp?.settlementCurrency||'SDG',
     settlementTreasuryId:data.sp?.settlementTreasuryId||data.sp?.treasuryId||'',
     settlementAmount:data.sp?.settlementAmount||(data.sp?.crossCurrency?data.sp?.amount:''),
     conversionRate:data.sp?.conversionRate||1
    }
   }));

   setPricingChoiceModal(null);
   setEnableFareEdit(isDetailed);
   const countLabel=data.paxRows?.length>1?`${data.paxRows.length} ركاب`:'تذكرة واحدة';
   if(isDetailed){
    toast.success(`تم إنزال سعر الأساس وتفصيل الضرائب (${countLabel})`);
   }else{
    toast.success(`تم إنزال المجموع الكلي للتذاكر وسعر المورد (${countLabel})`);
   }
  }

  function applyExtractedTicket(extracted:any,sourceName?:string){
   const dummyOp={payload:{attachment:null,notes:''},date:today(),currency:form.currency};
   const choiceData=prepareChoiceData(dummyOp,extracted);
   if(choiceData.taxSum>0){
    setPricingChoiceModal(choiceData);
   }else{
    applyPricingChoice('total_only',choiceData);
   }
  }

  async function onSelectStaged(op:any){
   const sp=op.payload||{};
   let extracted:any={};
   try{
    if(sp.attachment?.data){
     extracted=await analyzeTicketDocument(sp.attachment);
    }
   }catch(err){
    console.error('Failed to extract ticket attachment:', err);
   }
   if((!extracted || Object.keys(extracted).length===0 || !extracted.ticketNo)&&sp.notes){
    try{extracted=parseTicketTextContent(sp.notes)}catch{}
   }

   const choiceData=prepareChoiceData(op,extracted);
   if(choiceData.taxSum>0){
    setPricingChoiceModal(choiceData);
   }else{
    applyPricingChoice('total_only',choiceData);
   }
  }

  async function onDirectFileUpload(e: any){
   const file=e.target?.files?.[0];
   if(!file)return;
   setAnalyzingFile(true);
   try{
    const reader=new FileReader();
    reader.onload=async(ev)=>{
     try{
      const base64Data=ev.target?.result as string;
      const extracted=await analyzeTicketDocument({
       name:file.name,
       type:file.type||'application/pdf',
       size:file.size,
       data:base64Data
      });
      applyExtractedTicket(extracted,file.name);
     }catch(err:any){
      toast.error('فشل تحليل المستند: '+(err.message||'خطأ غير معروف'));
     }finally{
      setAnalyzingFile(false);
      if(e.target)e.target.value='';
     }
    };
    reader.onerror=()=>{
     toast.error('فشل قراءة الملف');
     setAnalyzingFile(false);
     if(e.target)e.target.value='';
    };
    reader.readAsDataURL(file);
   }catch(err:any){
    toast.error('فشل رفع الملف: '+(err.message||'خطأ غير معروف'));
    setAnalyzingFile(false);
   }
  }

  const nonIata=!!p.flags?.['Non IATA'],zero=!!p.flags?.['Zero Comm'];
  const saved=tickets.find(t=>t.id===form.id)||(form.id?initial:undefined);
  const prices=ticketTotals(p,saved);

  const totalTaxes=Object.values(p.taxes||{}).reduce<number>((s:number,v:any)=>s+Number(v||0),0);
  const baseTicketAmount=Number(p.fare||0)+totalTaxes;
  const commAmountVal=Number(p.commAmount||0)||(baseTicketAmount>0?Math.round(baseTicketAmount*Number(p.commPct||0)/100):0);
  const sellingPriceVal=p.sellingPrice!==undefined&&p.sellingPrice!==''
    ? p.sellingPrice
    : (zero ? (baseTicketAmount + commAmountVal) : baseTicketAmount);
  const supplierPriceVal=p.supplierPrice!==undefined&&p.supplierPrice!==''
    ? p.supplierPrice
    : (zero ? baseTicketAmount : Math.max(0, baseTicketAmount - commAmountVal));

  function onSellingChange(v:any){
   const sVal=Number(v||0);
   const commVal=Number(p.commAmount||0);
   const supVal=Number(supplierPriceVal||0);

   if(pricingLeadRef.current==='comm' && p.commAmount!=='' && p.commAmount!==undefined){
    // Rule 1: العمولة كتبت في الأول وبعد كده اتكتب السعر الإجمالي:
    // اجمع/اطرح واكتب سعر المورد آلياً: سعر المورد = الإجمالي - العمولة
    const newSup=Math.max(0,Math.round((sVal-commVal)*100)/100);
    const newPct=sVal>0?Number(((commVal/sVal)*100).toFixed(2)):0;
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      sellingPrice:v,
      supplierPrice:newSup,
      commPct:newPct,
      fare:!enableFareEdit ? Math.max(0, sVal - totalTaxes) : f.payload.fare
     }
    }));
    return;
   }

   // Rule 3: اتكتب سعر المورد وسعر الإجمالي: احسب العمولة آلياً
   pricingLeadRef.current='sell';
   const newComm=Math.max(0,Math.round((sVal-supVal)*100)/100);
   const newPct=sVal>0?Number(((newComm/sVal)*100).toFixed(2)):0;
   setForm((f:any)=>({
    ...f,
    payload:{
     ...f.payload,
     sellingPrice:v,
     commAmount:newComm,
     commPct:newPct,
     fare:!enableFareEdit ? Math.max(0, sVal - totalTaxes) : ((Number(f.payload.fare||0)===0&&totalTaxes===0)?(zero?supVal:sVal):f.payload.fare)
    }
   }));
  }

  function onSupplierChange(v:any){
   const supVal=Number(v||0);
   const commVal=Number(p.commAmount||0);
   const sVal=Number(sellingPriceVal||0);

   if(pricingLeadRef.current==='comm' && p.commAmount!=='' && p.commAmount!==undefined){
    // Rule 2: العمولة كتبت في الأول وبعدين اتكتب سعر المورد:
    // اجمع/اطرح واكتب السعر الإجمالي آلياً: السعر الإجمالي = المورد + العمولة
    const newSell=Math.round((supVal+commVal)*100)/100;
    const newPct=newSell>0?Number(((commVal/newSell)*100).toFixed(2)):0;
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      supplierPrice:v,
      sellingPrice:newSell,
      commPct:newPct,
      fare:!enableFareEdit ? Math.max(0, newSell - totalTaxes) : f.payload.fare
     }
    }));
    return;
   }

   // Rule 3: اتكتب سعر المورد وسعر الإجمالي: احسب العمولة آلياً
   pricingLeadRef.current='supplier';
   const newComm=Math.max(0,Math.round((sVal-supVal)*100)/100);
   const newPct=sVal>0?Number(((newComm/sVal)*100).toFixed(2)):0;
   setForm((f:any)=>({
    ...f,
    payload:{
     ...f.payload,
     supplierPrice:v,
     commAmount:newComm,
     commPct:newPct,
     fare:!enableFareEdit ? Math.max(0, sVal - totalTaxes) : ((Number(f.payload.fare||0)===0&&totalTaxes===0)?(zero?supVal:sVal):f.payload.fare)
    }
   }));
  }

  function onCommChange(v:any){
   pricingLeadRef.current='comm';
   if(v===''||v===undefined||v===null){
    pricingLeadRef.current='none';
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commAmount:'',
      commPct:''
     }
    }));
    return;
   }
   const comm=Number(v||0);
   const currentSell=Number(p.sellingPrice||sellingPriceVal||0);
   const currentSup=Number(p.supplierPrice||supplierPriceVal||0);

   if(zero){
    const base=currentSup>0?currentSup:(baseTicketAmount>0?baseTicketAmount:currentSell);
    const newSell=base+comm;
    const newPct=base>0?Number(((comm/base)*100).toFixed(2)):0;
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commAmount:v,
      commPct:newPct,
      supplierPrice:base>0?base:f.payload.supplierPrice,
      sellingPrice:newSell
     }
    }));
   }else{
    const sell=currentSell>0?currentSell:(baseTicketAmount>0?baseTicketAmount:(currentSup>0?currentSup+comm:0));
    const newSup=Math.max(0,sell-comm);
    const newPct=sell>0?Number(((comm/sell)*100).toFixed(2)):0;
    const keepExistingSup = (p.supplierPrice!==undefined&&p.supplierPrice!=='') && (p.sellingPrice!==undefined&&p.sellingPrice!=='');
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commAmount:v,
      commPct:newPct,
      sellingPrice:sell>0?sell:f.payload.sellingPrice,
      supplierPrice:keepExistingSup?f.payload.supplierPrice:(sell>0?newSup:f.payload.supplierPrice)
     }
    }));
   }
  }

  function onCommPctChange(v:any){
   pricingLeadRef.current='comm';
   if(v===''||v===undefined||v===null){
    pricingLeadRef.current='none';
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commPct:''
     }
    }));
    return;
   }
   const pct=Number(v||0);
   const currentSell=Number(p.sellingPrice||sellingPriceVal||0);
   const currentSup=Number(p.supplierPrice||supplierPriceVal||0);

   if(zero){
    const base=currentSup>0?currentSup:(baseTicketAmount>0?baseTicketAmount:currentSell);
    const comm=Math.round(base*pct/100);
    const newSell=base+comm;
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commPct:v,
      commAmount:comm,
      supplierPrice:base>0?base:f.payload.supplierPrice,
      sellingPrice:newSell
     }
    }));
   }else{
    const sell=currentSell>0?currentSell:(baseTicketAmount>0?baseTicketAmount:(currentSup>0?Math.round(currentSup/(1-(pct/100))):0));
    const comm=Math.round(sell*pct/100);
    const newSup=Math.max(0,sell-comm);
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commPct:v,
      commAmount:comm,
      sellingPrice:sell>0?sell:f.payload.sellingPrice,
      supplierPrice:sell>0?newSup:f.payload.supplierPrice
     }
    }));
   }
  }

  function onFareChange(v:any){
   const newFare=Number(v||0);
   const base=newFare+totalTaxes;
   const comm=Number(p.commAmount||0)||(base>0?Math.round(base*Number(p.commPct||0)/100):0);
   if(zero){
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      fare:v,
      supplierPrice:base,
      sellingPrice:base+comm
     }
    }));
   }else{
    const newSup=Math.max(0,base-comm);
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      fare:v,
      sellingPrice:base,
      supplierPrice:newSup
     }
    }));
   }
  }

  function onTaxChange(t:string,val:number){
   const nextTaxes={...(p.taxes||{}),[t]:val};
   const nextTaxSum=Object.values(nextTaxes).reduce<number>((s:number,x:any)=>s+Number(x||0),0);
   const newSell=Number(p.fare||0)+nextTaxSum;
   const comm=Number(p.commAmount||0);
   const newSup=Math.max(0,newSell-comm);
   setForm((f:any)=>({
    ...f,
    payload:{
     ...f.payload,
     taxes:nextTaxes,
     sellingPrice:newSell,
     supplierPrice:newSup
    }
   }));
  }

  const customerOptions=customers.filter(c=>!c.payload?.archived&&(!c.payload?.accountType||c.payload?.accountType==='customer'));
  const registeredAirlineAccs=customers.filter(c=>!c.payload?.archived&&c.payload?.accountType==='airline');
  const registeredAirlines=registeredAirlineAccs.map(c=>c.name);
  const allAirlines=registeredAirlines;
  const registeredSuppliers=customers.filter(c=>!c.payload?.archived&&c.payload?.accountType==='supplier').map(c=>c.name);
  const supplierOptions=[...new Set([...registeredSuppliers,...supplierAccounts.map(a=>a.name),...tickets.map(t=>ticketSupplierName(t.payload))])];
  const vendorListId='ticket-vendors-'+(form.id||'new');

  const normAr = (s: string) => (s || '').toLowerCase().replace(/[إأآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه').replace(/\s+/g, ' ').trim();
  const standardAirlinesList = ['الخطوط الجوية السودانية', 'تاركو للطيران', 'بدر للطيران', 'طيران الإمارات', 'الخطوط السعودية', 'مصر للطيران', 'الخطوط الجوية القطرية', 'فلاي دبي'];
  const existingAirlineNames = registeredAirlineAccs.map(a => a.name);
  const extraAirlineOptions = standardAirlinesList
    .filter(name => !existingAirlineNames.some(en => normAr(en) === normAr(name)))
    .map(name => ({ value: name, label: name + ' · متعدد العملات' }));

  const airlinePickerOptions = [
    ...registeredAirlineAccs.map(a => ({
      value: a.name,
      label: a.name + (a.currency === 'MULTI' ? ' · متعدد العملات' : ` · ${a.currency}`)
    })),
    ...extraAirlineOptions
  ];
  const targetAirline = normAr(p.airline);
  const matchedAirlineAcc = registeredAirlineAccs.find(c => {
    const cn = normAr(c.name);
    return cn === targetAirline || cn.includes(targetAirline) || targetAirline.includes(cn);
  }) || supplierAccounts.find(a => {
    const an = normAr(a.name);
    return an === targetAirline || an.includes(targetAirline) || targetAirline.includes(an);
  });
  const commissionAccounts=supplierAccounts.filter((a:RecordRow)=>!a.payload?.archived&&(a.payload?.accountType==='revenue'||a.payload?.accountType==='commission'));
  const defaultCommAcc=commissionAccounts.find((a:RecordRow)=>a.name.includes('تذاكر'))||commissionAccounts.find((a:RecordRow)=>a.payload?.accountType==='commission')||commissionAccounts[0];
  const selectedCommAcc=commissionAccounts.find((a:RecordRow)=>a.id===p.commissionAccountId);

  useEffect(()=>{
   if(!p.commissionAccountId&&defaultCommAcc?.id){
    setP('commissionAccountId',defaultCommAcc.id);
   }
  },[p.commissionAccountId,defaultCommAcc?.id]);

  function onAirlineChange(v:string){
   const target=v.trim().toLowerCase();
   const matched=customers.find(c=>['airline','supplier'].includes(c.payload?.accountType)&&(c.name.toLowerCase()===target||c.name.toLowerCase().includes(target)))||supplierAccounts.find(a=>(a.currency==='MULTI'||a.currency===form.currency)&&a.name.toLowerCase().includes(target));
   setForm((f:any)=>({
    ...f,
    payload:{
     ...f.payload,
     airline:v,
     ...((!f.payload.flags?.['Non IATA'])?{supplierId:matched?.id}:{})
    }
   }));
  }

  async function saveQuickAirline(nameToSave?: string){
   const targetName = (nameToSave || quickAirlineName).trim();
   if (!targetName) {
    toast.error('يرجى كتابة اسم شركة الطيران');
    return;
   }
   setQuickAirlineSaving(true);
   try {
    const res = await api('/api/records', {
     method: 'POST',
     body: JSON.stringify({
      kind: 'customer',
      name: targetName,
      date: today(),
      currency: quickAirlineCurrency || 'MULTI',
      amount: 0,
      payload: {
       accountType: 'airline',
       phone: quickAirlinePhone || undefined,
       notes: quickAirlineNotes || undefined,
       direction: 'receipt'
      }
     })
    });
    toast.success(`تم حفظ حساب الخطوط "${targetName}" بنجاح في دليل الحسابات`);
    const newCusts = await api('/api/records?kind=customer').catch(() => []);
    setCustomers(newCusts);
    const savedAcc = newCusts.find((c: any) => c.name.trim().toLowerCase() === targetName.toLowerCase());
    setForm((f: any) => ({
     ...f,
     payload: {
      ...f.payload,
      airline: targetName,
      ...((!f.payload.flags?.['Non IATA']) ? { supplierId: savedAcc?.id || res?.id } : {})
     }
    }));
    setQuickAirlineModal(false);
    setQuickAirlineName('');
    setQuickAirlinePhone('');
    setQuickAirlineNotes('');
   } catch (err: any) {
    toast.error(err.message || 'فشل حفظ حساب الخطوط');
   } finally {
    setQuickAirlineSaving(false);
   }
  }

  async function handleSaveQuickRevenue(e?:any){
   if(e?.preventDefault)e.preventDefault();
   const targetName=quickRevenueName.trim();
   if(!targetName){
    toast.error('الرجاء إدخال اسم حساب الإيرادات');
    return;
   }
   setQuickRevenueSaving(true);
   try{
    const res=await api('/api/records',{
     method:'POST',
     body:JSON.stringify({
      kind:'account',
      name:targetName,
      date:today(),
      currency:quickRevenueCurrency||'MULTI',
      amount:0,
      payload:{
       accountType:'revenue',
       notes:quickRevenueNotes||undefined
      }
     })
    });
    toast.success(`تم حفظ حساب الإيرادات "${targetName}" بنجاح في دليل الحسابات`);
    const newAccs=await api('/api/records?kind=account').catch(()=>[]);
    setSupplierAccounts(newAccs);
    const savedAcc=newAccs.find((a:any)=>a.name.trim().toLowerCase()===targetName.toLowerCase());
    setForm((f:any)=>({
     ...f,
     payload:{
      ...f.payload,
      commissionAccountId:savedAcc?.id||res?.id||''
     }
    }));
    setQuickRevenueModal(false);
    setQuickRevenueName('');
    setQuickRevenueNotes('');
   }catch(err:any){
    toast.error(err.message||'فشل حفظ حساب الإيرادات');
   }finally{
    setQuickRevenueSaving(false);
   }
  }

  async function saveQuickCustomer(nameToSave?: string){
   const targetName = (nameToSave || quickCustomerName).trim();
   if (!targetName) {
    toast.error('يرجى كتابة اسم العميل');
    return;
   }
   setQuickCustomerSaving(true);
   try {
    const res = await api('/api/records', {
     method: 'POST',
     body: JSON.stringify({
      kind: 'customer',
      name: targetName,
      date: today(),
      currency: quickCustomerCurrency || 'MULTI',
      amount: 0,
      payload: {
       accountType: 'customer',
       phone: quickCustomerPhone || undefined,
       email: quickCustomerEmail || undefined,
       address: quickCustomerAddress || undefined,
       direction: 'receipt'
      }
     })
    });
    toast.success(`تم حفظ العميل "${targetName}" بنجاح في دليل العملاء`);
    const newCusts = await api('/api/records?kind=customer').catch(() => []);
    setCustomers(newCusts);
    const savedCust = newCusts.find((c: any) => c.name.trim().toLowerCase() === targetName.toLowerCase());
    const newCustId = savedCust?.id || res?.id;
    setP('customerId', newCustId);
    setQuickCustomerModal(false);
    setQuickCustomerName('');
    setQuickCustomerPhone('');
    setQuickCustomerEmail('');
    setQuickCustomerAddress('');
   } catch (err: any) {
    toast.error(err.message || 'فشل حفظ العميل');
   } finally {
    setQuickCustomerSaving(false);
   }
  }

  function onVendorChange(v:string){
   const target=v.trim().toLowerCase();
   const matched=customers.find(c=>['supplier','airline'].includes(c.payload?.accountType)&&(c.name.toLowerCase()===target||c.name.toLowerCase().includes(target)))||supplierAccounts.find(a=>(a.currency==='MULTI'||a.currency===form.currency)&&a.name.toLowerCase().includes(target));
   setForm((f:any)=>({
    ...f,
    payload:{
     ...f.payload,
     vendor:v,
     ...(f.payload.flags?.['Non IATA']?{supplierId:matched?.id}:{})
    }
   }));
  }


 useEffect(()=>{
  if(initialStagedOp){
   onSelectStaged(initialStagedOp);
   onStagedConsumed?.();
  }
 },[initialStagedOp,customers,supplierAccounts]);

 useEffect(()=>{
  const onStaged=(e:any)=>{
   if(e.detail&&(e.detail.payload?.type?.startsWith('ticket-')||!e.detail.payload?.type?.startsWith('bank-'))){
    onSelectStaged(e.detail);
   }
  };
  window.addEventListener('shako-staged-select',onStaged);
  return()=>window.removeEventListener('shako-staged-select',onStaged);
 },[customers,supplierAccounts]);

 useEffect(()=>{
  try{
   const saved=sessionStorage.getItem('shako_pending_staged_op');
   if(saved){
    const parsed=JSON.parse(saved);
    if(parsed&&(parsed.payload?.type?.startsWith('ticket-')||!parsed.payload?.type?.startsWith('bank-'))){
     onSelectStaged(parsed);
     sessionStorage.removeItem('shako_pending_staged_op');
    }
   }
  }catch{}
 },[customers,supplierAccounts]);

 useEffect(()=>{
  if(p.payment!=='credit'&&!p.crossCurrency&&collectionAccounts.length>0){
   const eligible=collectionAccounts.filter(a=>(a.currency==='MULTI'||a.currency===form.currency)&&a.kind===(p.payment==='bank'?'bank-account':'cash-account'));
   if(p.treasuryId&&!collectionAccounts.some(a=>a.id===p.treasuryId)){
    setP('treasuryId',eligible[0]?.id||'');
   }else if(!p.treasuryId&&eligible.length>0){
    setP('treasuryId',eligible[0]?.id||'');
   }
  }
 },[collectionAccounts,p.payment,form.currency,p.crossCurrency,p.treasuryId]);

 useEffect(()=>{
  if(p.payment!=='credit'&&p.crossCurrency&&collectionAccounts.length>0){
   const sCur=p.settlementCurrency||'SDG';
   const eligible=collectionAccounts.filter(a=>a.currency==='MULTI'||a.currency===sCur);
   if(p.settlementTreasuryId&&!collectionAccounts.some(a=>a.id===p.settlementTreasuryId)){
    setP('settlementTreasuryId',eligible[0]?.id||'');
   }else if(!p.settlementTreasuryId&&eligible.length>0){
    setP('settlementTreasuryId',eligible[0]?.id||'');
   }
  }
 },[collectionAccounts,p.payment,p.settlementCurrency,p.crossCurrency,p.settlementTreasuryId]);

  async function save(e:any){
   if(e?.preventDefault)e.preventDefault();
   if(form.id){
    handleRequestEditTicket();
    return;
   }
   await executeSaveTicket();
  }

  function handleRequestEditTicket(){
   try{
    if(p.payment!=='credit'&&p.crossCurrency){
     if(!p.settlementTreasuryId)throw new Error('الرجاء اختيار حساب الخزنة أو البنك بالعملة الأخرى للتحصيل');
     const exists=collectionAccounts.some(a=>a.id===p.settlementTreasuryId);
     if(!exists)throw new Error('حساب الخزنة/البنك المحدد للتحصيل مؤرشف أو محذوف؛ يرجى اختيار حساب نشط');
     if(!p.settlementAmount||Number(p.settlementAmount)<=0)throw new Error('الرجاء إدخال المبلغ المسدد بالعملة الأخرى');
    }
    if(p.payment!=='credit'&&!p.crossCurrency){
     if(!p.treasuryId)throw new Error('الرجاء اختيار حساب التحصيل (الخزينة أو البنك)');
     const exists=collectionAccounts.some(a=>a.id===p.treasuryId);
     if(!exists)throw new Error('حساب التحصيل المحدد مؤرشف أو محذوف؛ يرجى اختيار حساب نشط');
    }
    setConfirmEditTicketOpen(true);
   }catch(err:any){
    toast.error(err.message||'بيانات التذكرة غير مكتملة');
   }
  }

  async function executeSaveTicket(){
   setBusy(true);
   try{
    if(p.payment!=='credit'&&p.crossCurrency){
     if(!p.settlementTreasuryId)throw new Error('الرجاء اختيار حساب الخزنة أو البنك بالعملة الأخرى للتحصيل');
     const exists=collectionAccounts.some(a=>a.id===p.settlementTreasuryId);
     if(!exists)throw new Error('حساب الخزنة/البنك المحدد للتحصيل مؤرشف أو محذوف؛ يرجى اختيار حساب نشط');
     if(!p.settlementAmount||Number(p.settlementAmount)<=0)throw new Error('الرجاء إدخال المبلغ المسدد بالعملة الأخرى');
    }
    if(p.payment!=='credit'&&!p.crossCurrency){
     if(!p.treasuryId)throw new Error('الرجاء اختيار حساب التحصيل (الخزينة أو البنك)');
     const exists=collectionAccounts.some(a=>a.id===p.treasuryId);
     if(!exists)throw new Error('حساب التحصيل المحدد مؤرشف أو محذوف؛ يرجى اختيار حساب نشط');
    }
    const normalized=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,['fare','commPct','commAmount','penalties','supplierComm','refundComm','discount','discountPct','extraPct','extraComm','brokerCommission','sellingPrice','supplierPrice','settlementAmount','conversionRate'].includes(k)?Number(v||0):v]));
    if(!normalized.commissionAccountId&&defaultCommAcc?.id){
     normalized.commissionAccountId=defaultCommAcc.id;
    }
    if((!normalized.fare||Number(normalized.fare)===0)&&Number(normalized.sellingPrice)>0){
     normalized.fare=Math.max(0,Number(normalized.sellingPrice)-totalTaxes);
    }
    if(p.status==='refunded'){
     const ref=calculateRefundTotals(normalized);
     normalized.originalSellMinor=ref.originalSellMinor;
     normalized.originalCostMinor=ref.originalCostMinor;
     normalized.originalIncomeMinor=Math.max(0,ref.originalSellMinor-ref.originalCostMinor);
     normalized.customerRefundMinor=ref.customerRefundMinor;
     normalized.supplierRefundMinor=ref.supplierRefundMinor;
     normalized.refundIncomeMinor=ref.incomeMinor;
     normalized.sellingPrice=Number(p.sellingPrice||sellingPriceVal||(ref.originalSellMinor/100));
     normalized.supplierPrice=Number(p.supplierPrice||supplierPriceVal||(ref.originalCostMinor/100));
    }
    if(p.crossCurrency){
     normalized.treasuryId=p.settlementTreasuryId||p.treasuryId;
    }
    const assignedReceipt=(p.receiptNumber?String(p.receiptNumber).trim():(!form.id?nextVoucherNumber:'')).trim();
    if(assignedReceipt)normalized.receiptNumber=assignedReceipt;
    const currentTotals=calculateTicket(normalized);
    const ticketAmountMinor=currentTotals.totalMinor;
    if(p.status!=='refunded'){
     normalized.sellingPrice=currentTotals.totalMinor/100;
     normalized.supplierPrice=currentTotals.supplierDueMinor/100;
    }
    const cust=customers.find(c=>c.id===p.customerId);
    const resolvedCustomerName = cust?.name || p.customerName || p.customer || '';
    const resolvedAirline = normalized.airline || p.airline || matchedAirlineAcc?.name || '';
    const resolvedSupplierId = normalized.supplierId || p.supplierId || matchedAirlineAcc?.id || undefined;
    if ((!normalized.fare || Number(normalized.fare) === 0) && Number(normalized.sellingPrice) > 0) {
      normalized.fare = Math.max(0, Number(normalized.sellingPrice) - totalTaxes);
    }
    if (!normalized.fare || Number(normalized.fare) === 0) {
      normalized.fare = Number(normalized.sellingPrice || normalized.supplierPrice || 0);
    }
    const r=await api('/api/records',{method:'POST',body:JSON.stringify({id:form.id,kind:'ticket',name:form.name,code:form.code,date:form.date,currency:form.currency,amount:ticketAmountMinor,payload:cleanPayload({...normalized,...currentTotals,customerName:resolvedCustomerName,airline:resolvedAirline,supplierId:resolvedSupplierId})})});
    const custPhone=cust?.payload?.phone||p.phone||'';
    const waMsg=buildTicketWhatsAppMessage({
     ticketCode:form.code,
     passengerName:form.name,
     customerName:cust?.name,
     airline:ticketSupplierName(p),
     route:p.route,
     flightDate:form.date,
     totalAmount:Number(sellingPriceVal||0),
     currency:form.currency,
     receiptNumber:assignedReceipt,
     pnr:p.pnr,
     settings
    });
    setWhatsAppModal({name:cust?.name||form.name,phone:custPhone,message:waMsg});
    if(form._stagedId){
     try{
      await api('/api/staged-operations?id='+encodeURIComponent(form._stagedId),{method:'DELETE'});
      toast.success('تم حفظ التذكرة وحذفها آليًا من قائمة المعلقات لمنع التكرار',{action:{label:'إرسال WhatsApp 📲',onClick:()=>setWhatsAppModal({name:cust?.name||form.name,phone:custPhone,message:waMsg})}});
     }catch(err){console.error('Delete staged op error',err)}
    }else{
     toast.success(form.id ? 'تم حفظ تعديل التذكرة · '+r.code : 'تم حفظ التذكرة · '+r.code,{action:{label:'إرسال WhatsApp 📲',onClick:()=>setWhatsAppModal({name:cust?.name||form.name,phone:custPhone,message:waMsg})}});
    }
    const nextRec = String(Number(assignedReceipt || 0) + 1);
    resetForm(nextRec);
    load();
    onSaved?.();
   }catch(e:any){toast.error(e.message)}finally{setBusy(false);setConfirmEditTicketOpen(false);}
  }

  async function executeDeleteTicket(){
   if(!form.id)return;
   setBusy(true);
   try{
    await api('/api/records?id='+encodeURIComponent(form.id),{
     method:'DELETE'
    });
    toast.success('تم حذف التذكرة بنجاح');
    resetForm(nextVoucherNumber);
    load();
    onSaved?.();
   }catch(err:any){
    toast.error(err.message||'فشل حذف التذكرة');
   }finally{
    setBusy(false);
    setConfirmDeleteTicketOpen(false);
   }
  }
 function choose(id:string,explicitRecord?:any){
  setSelected(id);
  isManualTicketVoucherRef.current = false;
  autoTicketVoucherRef.current = '';
  pricingLeadRef.current = 'none';
  setEnableFareEdit(false);
  const r=explicitRecord||tickets.find(t=>t.id===id);
  if(r){
   const loadedPassengers=(r.payload?.passengers&&Array.isArray(r.payload.passengers)&&r.payload.passengers.length>0)?r.payload.passengers:[{name:r.name,ticketNo:r.code}];
   setPassengersList(loadedPassengers);
   let cleanTreasuryId=r.payload?.treasuryId||'';
   if(r.payload?.payment!=='credit'&&cleanTreasuryId&&collectionAccounts.length>0){
    if(!collectionAccounts.some(a=>a.id===cleanTreasuryId)){
     const eligible=collectionAccounts.filter(a=>(a.currency==='MULTI'||a.currency===r.currency)&&a.kind===(r.payload.payment==='bank'?'bank-account':'cash-account'));
     cleanTreasuryId=eligible[0]?.id||'';
    }
   }
   const currentStatus = p.status;
   const isRefundIntent = currentStatus === 'refunded' || r.payload?.status === 'refunded' || Boolean(r.payload?.penalties || r.payload?.refundComm);
   const finalStatus = isRefundIntent ? 'refunded' : (r.payload?.status || 'active');
   const sVal = Number(r.payload?.sellingPrice || 0);
   const supVal = Number(r.payload?.supplierPrice || 0);
   const origSell = r.payload?.originalSellMinor ?? (sVal > 0 ? Math.round(sVal * 100) : 0);
   const origCost = r.payload?.originalCostMinor ?? (supVal > 0 ? Math.round(supVal * 100) : 0);
   const origInc = r.payload?.originalIncomeMinor ?? Math.max(0, origSell - origCost);

   setForm({
     ...r,
     amount:r.amount,
     payload:{
       ...newTicket().payload,
       ...r.payload,
       fare: (Number(r.payload?.fare || 0) === 0 && sVal > 0) ? sVal : (r.payload?.fare || 0),
       commissionAccountId: r.payload?.commissionAccountId || defaultCommAcc?.id || '',
       status: finalStatus,
       originalSellMinor: origSell,
       originalCostMinor: origCost,
       originalIncomeMinor: origInc,
       refundDate: r.payload?.refundDate || (isRefundIntent ? today() : undefined),
       receiptNumber:r.payload?.receiptNumber||'',
       treasuryId:cleanTreasuryId,
       passengers:loadedPassengers,
       vendor:r.payload?.vendor||(r.payload?.flags?.['Non IATA']?r.payload.airline:'')
     }
   });
  }
 }
 useEffect(()=>{
  const onSelectTicket=(e:any)=>{
   if(!e.detail)return;
   const d=e.detail;
   if(d.record&&d.record.kind==='ticket'){
    choose(d.record.id,d.record);
    toast.info(`تم فتح التذكرة «${d.record.name||d.record.code}» للتعديل ✏️`);
   }else if(d.id){
    const found=tickets.find(t=>t.id===d.id);
    if(found){
     choose(found.id,found);
     toast.info(`تم فتح التذكرة «${found.name||found.code}» للتعديل ✏️`);
    }else{
     choose(d.id);
    }
   }else if(d.code){
    const found=tickets.find(t=>t.code===d.code||t.payload?.receiptNumber===d.code);
    if(found){
     choose(found.id,found);
     toast.info(`تم فتح التذكرة «${found.name||found.code}» للتعديل ✏️`);
    }
   }
  };
  window.addEventListener('shako-select-ticket',onSelectTicket);
  return()=>window.removeEventListener('shako-select-ticket',onSelectTicket);
 },[tickets]);
 useEffect(()=>{
  try{
   const saved=sessionStorage.getItem('shako_pending_ticket_select');
   if(saved){
    const parsed=JSON.parse(saved);
    if(parsed){
     if(parsed.record&&parsed.record.kind==='ticket'){
      choose(parsed.record.id,parsed.record);
      sessionStorage.removeItem('shako_pending_ticket_select');
      toast.info(`تم فتح التذكرة «${parsed.record.name||parsed.record.code}» للتعديل ✏️`);
     }else if(parsed.id){
      const found=tickets.find(t=>t.id===parsed.id);
      if(found){
       choose(found.id,found);
       sessionStorage.removeItem('shako_pending_ticket_select');
      }else{
       choose(parsed.id);
       sessionStorage.removeItem('shako_pending_ticket_select');
      }
     }
    }
   }
  }catch{}
 },[tickets]);

 if(error)return <Empty loading={false} error={error} load={load}/>;
 return <form className="ticket-form" dir="rtl" onSubmit={save}>
  {moduleEnabled(settings,'stagedOps')&&<StagedOperationsStrip types={['ticket-new','ticket-refund','ticket-void']} onSelect={onSelectStaged} refreshKey={w.refreshKey} title="تذاكر معلقة بانتظار الإنزال في النظام"/>}
  {form._attachment&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'6px 12px',marginBottom:'8px',fontSize:'12px',color:'#1e40af'}}><span>📎 مرفق التذكرة المعلقة: <b>{form._attachment.name}</b></span><a href={form._attachment.data} download={form._attachment.name} className="plain-button" style={{color:'#2563eb',fontWeight:600}}>تنزيل / فتح المرفق</a></div>}
  <div className="ticket-topline" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'10px',borderBottom:'1px solid #cbd5e1',paddingBottom:'8px',marginBottom:'10px'}}>
    <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
      <div style={{display:'inline-flex',alignItems:'center',gap:'2px',background:'#f1f5f9',padding:'2px 4px',borderRadius:'8px',border:'1.5px solid #cbd5e1'}}>
        <button type="button" onClick={()=>setP('status','active')} style={{padding:'5px 12px',borderRadius:'6px',border:'none',fontSize:'12px',fontWeight:700,cursor:'pointer',background:(!p.status||p.status==='active')?'#15803d':'transparent',color:(!p.status||p.status==='active')?'#fff':'#475569',transition:'all 0.15s'}}>🟢 إصدار نشط</button>
        <button type="button" onClick={()=>{setP('status','refunded');const sVal=Number(p.sellingPrice||sellingPriceVal||0);const supVal=Number(p.supplierPrice||supplierPriceVal||0);if(!p.originalSellMinor&&sVal>0)setP('originalSellMinor',Math.round(sVal*100));if(!p.originalCostMinor&&supVal>0)setP('originalCostMinor',Math.round(supVal*100));if(!p.originalIncomeMinor&&sVal>0&&supVal>0)setP('originalIncomeMinor',Math.max(0,Math.round((sVal-supVal)*100)));if(!p.refundDate)setP('refundDate',today());}} style={{padding:'5px 12px',borderRadius:'6px',border:'none',fontSize:'12px',fontWeight:700,cursor:'pointer',background:p.status==='refunded'?'#dc2626':'transparent',color:p.status==='refunded'?'#fff':'#475569',display:'inline-flex',alignItems:'center',gap:'5px',transition:'all 0.15s'}}><RotateCcw size={13}/><span>استرداد تذكرة (Refund)</span></button>
        <button type="button" onClick={()=>setP('status','cancelled')} style={{padding:'5px 12px',borderRadius:'6px',border:'none',fontSize:'12px',fontWeight:700,cursor:'pointer',background:p.status==='cancelled'?'#475569':'transparent',color:p.status==='cancelled'?'#fff':'#475569',transition:'all 0.15s'}}>❌ إلغاء (Void)</button>
      </div>
      <div style={{minWidth:'150px'}}>
        <Field label="التاريخ" type="date" value={form.date} onChange={v=>set('date',v)} required/>
      </div>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}} dir="ltr">
      {['Broker','Group','BSP','Zero Comm','Non IATA'].map(f=>{
        const active=!!p.flags?.[f];
        return (
          <label
            className="flag"
            key={f}
            dir="ltr"
            style={{
              display:'inline-flex',
              alignItems:'center',
              gap:'7px',
              padding:'3px 10px',
              borderRadius:'20px',
              border:active?'1.5px solid #0f766e':'1px solid #cbd5e1',
              background:active?'#ecfdf5':'#f8fafc',
              cursor:'pointer',
              userSelect:'none',
              transition:'all 0.15s ease'
            }}
          >
            <b style={{color:f==='BSP'&&active?'#dc2626':active?'#0f766e':'#475569',fontSize:'12px',fontWeight:700}}>{f}</b>
            <Switch
              dir="ltr"
              aria-label={f}
              checked={active}
              onCheckedChange={v=>{
                const nextFlags={...p.flags,[f]:v};
                if(f==='Zero Comm'){
                  const base=baseTicketAmount>0?baseTicketAmount:Math.max(Number(p.sellingPrice||0),Number(p.supplierPrice||0));
                  const comm=Number(p.commAmount||0)||(base>0?Math.round(base*Number(p.commPct||0)/100):0);
                  let newSell: number;
                  let newSup: number;
                  if(v){
                    newSup = base;
                    newSell = base + comm;
                  }else{
                    newSell = base;
                    newSup = Math.max(0, base - comm);
                  }
                  setForm((prev:any)=>({
                    ...prev,
                    payload:{
                      ...prev.payload,
                      flags:nextFlags,
                      sellingPrice:newSell,
                      supplierPrice:newSup
                    }
                  }));
                  return;
                }
                setP('flags',nextFlags);
                if(f==='Non IATA')setP('supplierId',undefined);
                if(f==='Non IATA'&&v&&!p.vendor)setP('vendor',p.airline||'');
              }}
            />
          </label>
        );
      })}
    </div>
    <div className="voucher" title="رقم إيصال العملية" style={{flexShrink:0}}>
      <span><span>رقم الإيصال</span><input aria-label="رقم الإيصال" value={p.receiptNumber??''} onChange={e=>{
        const val = e.target.value;
        isManualTicketVoucherRef.current = val.trim() !== '' && val !== nextVoucherNumber;
        setP('receiptNumber', val);
      }} placeholder={!form.id?nextVoucherNumber:'—'}/></span>
      <b
        style={p.status==='refunded'?{color:'#dc2626',fontWeight:700}:form.id?{cursor:'pointer'}:undefined}
        title={form.id?'اضغط لإنشاء تذكرة جديدة':undefined}
        onClick={()=>{if(form.id)resetForm(nextVoucherNumber)}}
      >
        {p.status==='refunded'?'مستردة':form.id?'تعديل':'جديد'}
      </b>
    </div>
  </div>
  <div className="ticket-grid"><aside className="ticket-side"><section className="ticket-card"><h2 className="lime">قائمة التذاكر</h2><label style={{display:'block',marginBottom:'6px'}}><span style={{fontSize:'12px',fontWeight:700,color:'#475569',display:'block',marginBottom:'3px'}}>بحث في قائمة التذاكر:</span><input className="ticket-search" placeholder="بحث برقم التذكرة أو الإيصال أو الراكب" aria-label="بحث برقم التذكرة أو الإيصال أو الراكب" value={ticketSearch} onChange={e=>setTicketSearch(e.target.value)}/></label><div className="ticket-list" role="list">{tickets.filter(t=>{const q=ticketSearch.trim().toLowerCase();if(!q)return true;const vNo=t.payload?.receiptNumber?String(t.payload.receiptNumber).toLowerCase():'';const matchVoucher=vNo&&(`voucher no ${vNo}`.includes(q)||`voucher no${vNo}`.includes(q)||`voucher ${vNo}`.includes(q)||`إيصال ${vNo}`.includes(q)||`ايصال ${vNo}`.includes(q));return t.code.toLowerCase().includes(q)||(vNo&&vNo.includes(q))||Boolean(matchVoucher)||t.name.toLowerCase().includes(q)||t.payload?.passengers?.some((ps:any)=>(ps.name&&ps.name.toLowerCase().includes(q))||(ps.ticketNo&&ps.ticketNo.toLowerCase().includes(q)));}).map(t=><button type="button" key={t.id} className={selected===t.id?'selected':''} onClick={()=>choose(t.id)}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',gap:'4px'}}><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.code}</span>{t.payload?.receiptNumber&&<span style={{fontSize:'10px',background:'#e7f4ef',color:'#0f766e',padding:'1px 5px',borderRadius:'4px',fontWeight:700,whiteSpace:'nowrap'}} title="رقم الإيصال">إيصال {t.payload.receiptNumber}</span>}</div><small>{t.name}</small></button>)}{!tickets.length&&<span>لا توجد تذاكر</span>}</div><div className="ticket-tools"><button type="button" className="lime-button" onClick={load} aria-label="تحديث التذاكر"><RefreshCw size={17}/></button><button type="button" className="orange-button" onClick={()=>csv('tickets',['المسافر','التذكرة','الشركة','المبلغ','العملة'],tickets.map(t=>[t.name,t.code,ticketSupplierName(t.payload),t.amount/100,t.currency]))} aria-label="تصدير التذاكر"><Download size={17}/></button><button type="button" className="yellow-button" onClick={()=>resetForm(nextVoucherNumber)} disabled={!canManage} aria-label="تذكرة جديدة"><Plus size={17}/></button></div></section><section className="ticket-card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><h2 className="green" style={{margin:0}}>عمولة التذاكر / الدخل</h2><button type="button" className="plain-button" onClick={()=>setQuickRevenueModal(true)} style={{padding:'3px 8px',fontSize:'11px',background:'#ecfdf5',color:'#047857',border:'1px solid #a7f3d0',borderRadius:'4px',fontWeight:700,display:'inline-flex',alignItems:'center',gap:'3px'}} title="إضافة حساب إيرادات جديد في دليل الحسابات"><Plus size={13}/><span>+ حساب إيرادات</span></button></div><Picker label="نوع العمولة" value={p.income} onChange={v=>setP('income',v)} options={['عمولة التذاكر','عمولة إضافية','عمولة التأشيرات','عمولة الخدمات']}/><Picker label="حساب الإيرادات / العمولات" value={p.commissionAccountId||''} onChange={v=>setP('commissionAccountId',v)} options={[{value:'',label:commissionAccounts.length>0?'اختر حساب الإيرادات...':'لا يوجد حساب إيرادات (أضف حساب إيرادات)'},...commissionAccounts.map((a: RecordRow)=>({value:a.id,label:a.name+' · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)}))]}/><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:selectedCommAcc?'#f0fdf4':'#f8fafc',border:`1px solid ${selectedCommAcc?'#bbf7d0':'#e2e8f0'}`,borderRadius:'4px',padding:'4px 8px',marginBottom:'6px',fontSize:'11px'}}><span>حساب الإيراد: <b style={{color:selectedCommAcc?'#15803d':'#64748b'}}>{selectedCommAcc?.name||(commissionAccounts.length>0?'يرجى اختيار حساب الإيرادات':'لم يتم تحديد حساب إيرادات')}</b></span><span style={{color:selectedCommAcc?'#16a34a':'#94a3b8'}}>{selectedCommAcc?'أرباح معتمدة':'أرباح التذاكر'}</span></div><Picker label="عملة التذكرة" value={form.currency} onChange={v=>set('currency',v)} options={catalog.filter(c=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(c)||form.id&&c===form.currency)}/><p className="ticket-tip">{!customers.length?<>أضف عميلًا من دليل العملاء قبل تسجيل التذكرة.</>:'التذاكر المحفوظة تظهر في القائمة والتقارير.'}</p></section></aside>
   <div className="ticket-main">
   {(p.status==='refunded'||Boolean(p.penalties||p.refundComm||p.supplierComm))&&(
     <div style={{background:'#fff5f5',border:'2px solid #f87171',borderRadius:'10px',padding:'14px 16px',marginBottom:'12px',boxShadow:'0 2px 10px rgba(220,38,38,0.08)'}} dir="rtl">
       <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
         <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
           <div style={{width:'34px',height:'34px',borderRadius:'8px',background:'#fee2e2',color:'#dc2626',display:'flex',alignItems:'center',justifyContent:'center'}}>
             <RotateCcw size={18}/>
           </div>
           <div>
             <h3 style={{margin:0,fontSize:'15px',fontWeight:800,color:'#991b1b'}}>
               بيانات استرداد التذكرة (Ticket Refund)
             </h3>
             <span style={{fontSize:'12px',color:'#7f1d1d'}}>
               {zero
                 ? 'تذكرة بعمولة خارجية (Zero Comm): افتراضياً يسترجع الراكب كامل المبلغ شاملاً العمولة. إذا كانت عمولة المكتب غير مستردة، اضغط على زر «الاحتفاظ بالعمولة» ليتم خصمها من الراكب.'
                 : 'أدخل غرامة الخطوط وعمولة المكتب ليقوم النظام آلياً بخصم المبالغ واحتساب صافي المسترد للخطوط والراكب وصافي ربح الوكالة.'}
             </span>
           </div>
         </div>
         <button type="button" onClick={()=>setP('status','active')} style={{background:'#ffffff',color:'#475569',border:'1px solid #cbd5e1',borderRadius:'6px',padding:'4px 10px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
           إلغاء الاسترداد والعودة للإصدار النشط
         </button>
       </div>

       {(()=>{
         const sMin = p.originalSellMinor !== undefined ? Number(p.originalSellMinor) : (Number(p.sellingPrice||sellingPriceVal||0)*100);
         const cMin = p.originalCostMinor !== undefined ? Number(p.originalCostMinor) : (Number(p.supplierPrice||supplierPriceVal||0)*100);
         const origCommVal = Math.max(0, (sMin - cMin)/100);
         return (
           <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
             <Field label={'غرامة إلغاء الخطوط ('+form.currency+') *'} color="#b91c1c" type="number" value={p.penalties||''} onChange={(v:any)=>setP('penalties',v)} placeholder="تخصم من المورد والراكب"/>
             <div>
               <Field label={'عمولة / خصم استرداد المكتب ('+form.currency+')'} color="#047857" type="number" allowNegative={true} value={p.refundComm??''} onChange={(v:any)=>setP('refundComm',v)} placeholder="0 لإرجاع كامل المبلغ، أو اكتب مبلغ الخصم"/>
               <div style={{display:'flex',gap:'4px',marginTop:'4px',justifyContent:'flex-end',flexWrap:'wrap'}}>
                 <button type="button" onClick={()=>setP('refundComm',0)} style={{fontSize:'10px',padding:'2px 6px',background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:'4px',cursor:'pointer',color:'#475569'}} title="إرجاع كامل المبلغ للراكب بدون أي خصم عمولة">استرداد كامل (0)</button>
                 {origCommVal>0&&(
                   <button type="button" onClick={()=>setP('refundComm',origCommVal)} style={{fontSize:'10px',padding:'2px 6px',background:'#eff6ff',border:'1px solid #93c5fd',borderRadius:'4px',cursor:'pointer',color:'#1d4ed8',fontWeight:600}} title="خصم عمولة التذكرة الأصلية من الراكب والاحتفاظ بها للمكتب">الاحتفاظ بالعمولة ({origCommVal.toLocaleString()})</button>
                 )}
               </div>
             </div>
             <Field label={'عمولة المورد ('+form.currency+')'} color="#b45309" type="number" value={p.supplierComm||''} onChange={(v:any)=>setP('supplierComm',v)} placeholder="إن وجدت (تخصم من المورد والراكب)"/>
           </div>
         );
       })()}

       <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'10px',marginBottom:'10px'}}>
         <Field label="تاريخ حركة الاسترداد *" type="date" value={p.refundDate||today()} onChange={(v:any)=>setP('refundDate',v)}/>
         <Field label="ملاحظات الاسترداد" value={p.refundNotes||''} onChange={(v:any)=>setP('refundNotes',v)} placeholder="سبب الاسترداد، مرجع الإلغاء، أو شروط الاسترداد"/>
       </div>

       {(()=>{
         const ref=calculateRefundTotals(p);
         const isPos=ref.incomeMinor>0;
         const isNeg=ref.incomeMinor<0;
         const profitColor=isPos?'#15803d':isNeg?'#b91c1c':'#475569';
         const profitBg=isPos?'#f0fdf4':isNeg?'#fef2f2':'#f8fafc';
         const profitBorder=isPos?'#86efac':isNeg?'#fca5a5':'#cbd5e1';
         return (
           <div style={{background:'#ffffff',border:'1.5px solid #86efac',borderRadius:'8px',padding:'12px 14px',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(135px, 1fr))',gap:'10px',alignItems:'center'}}>
             <div style={{borderLeft:'1px solid #e2e8f0',paddingLeft:'8px'}}>
               <span style={{fontSize:'11px',color:'#0f766e',display:'block',fontWeight:600}}>سعر البيع الأصلي (الراكب)</span>
               <b style={{fontSize:'15px',color:'#0f766e'}} dir="ltr">{(ref.originalSellMinor/100).toLocaleString()} {form.currency}</b>
             </div>
             <div style={{borderLeft:'1px solid #e2e8f0',paddingLeft:'8px'}}>
               <span style={{fontSize:'11px',color:'#64748b',display:'block'}}>تكلفة المورد الأصلية</span>
               <b style={{fontSize:'15px',color:'#1e293b'}} dir="ltr">{(ref.originalCostMinor/100).toLocaleString()} {form.currency}</b>
             </div>
             <div style={{borderLeft:'1px solid #e2e8f0',paddingLeft:'8px'}}>
               <span style={{fontSize:'11px',color:'#b91c1c',display:'block'}}>(-) غرامة الخطوط</span>
               <b style={{fontSize:'15px',color:'#b91c1c'}} dir="ltr">- {(ref.penaltyMinor/100).toLocaleString()} {form.currency}</b>
             </div>
             <div style={{borderLeft:'1px solid #e2e8f0',paddingLeft:'8px'}}>
               <span style={{fontSize:'11px',color:'#7c3aed',display:'block'}}>(=) المسترد من الخطوط</span>
               <b style={{fontSize:'15px',color:'#7c3aed'}} dir="ltr">{(ref.supplierRefundMinor/100).toLocaleString()} {form.currency}</b>
             </div>
             <div style={{borderLeft:'1px solid #e2e8f0',paddingLeft:'8px'}}>
               <span style={{fontSize:'11px',color:ref.refundCommMinor<0?'#b91c1c':'#c2410c',display:'block'}}>
                 {ref.refundCommMinor<0?'(+) إرجاع إضافي للراكب':'(-) خصم عمولة المكتب'}
               </span>
               <b style={{fontSize:'15px',color:ref.refundCommMinor<0?'#b91c1c':'#c2410c'}} dir="ltr">
                 {ref.refundCommMinor<0?`+ ${(Math.abs(ref.refundCommMinor)/100).toLocaleString()}`:`- ${(ref.refundCommMinor/100).toLocaleString()}`} {form.currency}
               </b>
             </div>
             <div style={{background:'#f0fdf4',padding:'8px 10px',borderRadius:'6px',border:'1px solid #bbf7d0'}}>
               <span style={{fontSize:'11px',color:'#15803d',display:'block',fontWeight:700}}>(=) صافي المسترد للراكب</span>
               <b style={{fontSize:'16px',color:'#15803d',fontWeight:800}} dir="ltr">{(ref.customerRefundMinor/100).toLocaleString()} {form.currency}</b>
             </div>
             <div style={{background:profitBg,padding:'8px 10px',borderRadius:'6px',border:`1.5px solid ${profitBorder}`}}>
               <span style={{fontSize:'11px',color:profitColor,display:'block',fontWeight:700}}>
                 {isPos?'✨ صافي ربح الوكالة':isNeg?'⚠️ صافي ربح الوكالة (بالسالب)':'⚖️ صافي ربح الوكالة'}
               </span>
               <b style={{fontSize:'16px',color:profitColor,fontWeight:800}} dir="ltr">
                 {isPos?`+ ${(ref.incomeMinor/100).toLocaleString()}`:(ref.incomeMinor/100).toLocaleString()} {form.currency}
               </b>
               <span style={{fontSize:'10px',color:profitColor,display:'block',marginTop:'2px'}}>
                 {isPos?'ربح محقق بالاسترداد':isNeg?'يُخصم لإرجاع عمولة الإصدار':'استرداد متعادل'}
               </span>
             </div>
           </div>
         );
       })()}
     </div>
   )}
   <div className="ticket-partners"><section className="ticket-card">{nonIata?<><Field label="حساب المورد / البروكر" color="#a62fca" value={p.vendor||''} onChange={onVendorChange} list={vendorListId} placeholder="اختر المورد أو اكتب اسمه" required/><datalist id={vendorListId}>{supplierOptions.map(name=><option key={name} value={name}/>)}</datalist><div style={{marginTop:'6px'}}><Picker label="حساب خطوط الطيران" color="#b2cd16" value={p.airline||''} onChange={onAirlineChange} options={airlinePickerOptions}/>{p.airline&&!matchedAirlineAcc&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fffbeb',border:'1px solid #fef3c7',borderRadius:'4px',padding:'4px 8px',marginTop:'4px',fontSize:'11px',color:'#b45309'}}><span>⚠️ "{p.airline}" غير مسجل بعد في دليل حسابات الخطوط</span><button type="button" onClick={()=>saveQuickAirline(p.airline)} disabled={quickAirlineSaving} style={{background:'#d97706',color:'#fff',border:'none',borderRadius:'4px',padding:'2px 8px',fontSize:'11px',cursor:'pointer',fontWeight:600}}>{quickAirlineSaving?'جارٍ الحفظ…':'+ حفظ كحساب خطوط'}</button></div>}</div></>:<><Picker label="حساب خطوط الطيران" color="#a62fca" value={p.airline||''} onChange={onAirlineChange} options={airlinePickerOptions}/><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'4px',padding:'3px 8px',marginTop:'4px',fontSize:'11px'}}><span>حساب الخطوط المرتبط: <b style={{color:matchedAirlineAcc?'#0f766e':'#dc2626'}}>{matchedAirlineAcc?.name||(p.airline?`${p.airline} (غير محفوظ)`:'غير محدد')}</b></span><span style={{color:'#64748b'}}>{matchedAirlineAcc?.currency==='MULTI'?'متعدد العملات':matchedAirlineAcc?.currency||form.currency}</span></div>{p.airline&&!matchedAirlineAcc&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fffbeb',border:'1px solid #fef3c7',borderRadius:'4px',padding:'4px 8px',marginTop:'4px',fontSize:'11px',color:'#b45309'}}><span>⚠️ شركة "{p.airline}" غير محفوظة في دليل الحسابات</span><button type="button" onClick={()=>saveQuickAirline(p.airline)} disabled={quickAirlineSaving} style={{background:'#d97706',color:'#fff',border:'none',borderRadius:'4px',padding:'2px 8px',fontSize:'11px',cursor:'pointer',fontWeight:600}}>{quickAirlineSaving?'جارٍ الحفظ…':'+ حفظ كحساب خطوط الآن'}</button></div>}</>}<div className="paired-fields"><Field label={<span style={{display:'inline-flex',justifyContent:'space-between',alignItems:'center',width:'100%',gap:'4px'}}><span>العمولة (الفارق أو يدوي)</span>{(sellingPriceVal||supplierPriceVal)&&<button type="button" onClick={()=>{const diff=Math.max(0,Number(sellingPriceVal||0)-Number(supplierPriceVal||0));onCommChange(diff);}} style={{fontSize:'10px',padding:'1px 5px',borderRadius:'4px',border:'1px solid #c084fc',background:'#f3e8ff',color:'#7e22ce',cursor:'pointer',fontWeight:600}} title="ملء العمولة تلقائياً بفارق سعر البيع والتكلفة">تعبئة الفارق ({Math.max(0,Number(sellingPriceVal||0)-Number(supplierPriceVal||0)).toLocaleString()})</button>}</span>} color="#a62fca" type="number" value={p.commAmount} onChange={onCommChange} placeholder="فارق البيع والتكلفة أو اكتب يدويًا"/><Field label="نسبة العمولة %" color="#a62fca" type="number" max="100" value={p.commPct} onChange={onCommPctChange}/></div>{nonIata&&<div className="paired-fields"><Picker label="شركة الطيران" color="#b2cd16" value={p.airline||''} onChange={onAirlineChange} options={airlinePickerOptions}/></div>}{p.flags?.Broker&&<div className="broker-fields paired-fields"><Picker label="حساب البروكر" value={p.brokerId||''} onChange={v=>{const b=customers.find(c=>c.id===v);setP('brokerId',v);setP('brokerName',b?.name||'');}} placeholder="اختر حساب البروكر (من دليل العملاء)" options={[{value:'',label:'اختر حساب البروكر (من دليل العملاء)'},...customers.filter(c=>!c.payload?.archived&&(!c.payload?.accountType||c.payload?.accountType==='customer')&&(c.currency==='MULTI'||c.currency===form.currency)&&c.id!==p.customerId).map(c=>({value:c.id,label:c.name+(c.currency==='MULTI'?' · متعدد العملات':` · ${c.currency}`)}))]}/><Field label="عمولة البروكر" type="number" value={p.brokerCommission||0} onChange={v=>setP('brokerCommission',v)}/></div>}<p className="commission-note" dir="rtl">{zero?'العمولة تُضاف إلى سعر الراكب.':'العمولة الداخلية تُخصم من حساب الخطوط أو المورد.'}{p.flags?.Broker&&' عمولة البروكر تُخصم من ربح المكتب وتُسجَّل مستحقًا لحسابه.'}</p></section><section className="ticket-card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}><span style={{fontSize:'12px',fontWeight:700,color:'#1e293b'}}>حساب العميل</span><button type="button" className="plain-button" onClick={()=>{setQuickCustomerName('');setQuickCustomerModal(true);}} style={{padding:'2px 8px',fontSize:'11px',background:'#ecfdf5',color:'#047857',border:'1px solid #a7f3d0',borderRadius:'4px',fontWeight:700,display:'inline-flex',alignItems:'center',gap:'3px'}} title="إضافة عميل جديد في دليل العملاء مباشرة"><Plus size={13}/><span>+ إضافة عميل</span></button></div><Picker label="حساب العميل" value={p.customerId} onChange={v=>setP('customerId',v)} options={customerOptions.map(c=>({value:c.id,label:c.name}))} onCreateNew={(query)=>saveQuickCustomer(query)} createNewLabel={(q)=>`+ إضافة «${q}» كعميل جديد`}/><div className="paired-fields"><Field label="مبلغ الخصم" type="number" value={p.discount} onChange={v=>setP('discount',v)}/><Field label="نسبة الخصم %" type="number" max="100" value={p.discountPct} onChange={v=>setP('discountPct',v)}/></div><Picker label="طريقة السداد" value={p.payment} onChange={v=>{setP('payment',v);setP('treasuryId','')}} options={[{value:'cash',label:'نقدي'},{value:'bank',label:'بنك'},{value:'credit',label:'آجل'}]}/>{p.payment!=='credit'&&<><Picker label={p.crossCurrency?"حساب التحصيل (معطل - الحركة بالعملة الأخرى)":"حساب التحصيل"} value={p.treasuryId||''} onChange={v=>setP('treasuryId',v)} disabled={!!p.crossCurrency} options={collectionAccounts.filter(a=>(a.currency==='MULTI'||a.currency===form.currency)&&a.kind===(p.payment==='bank'?'bank-account':'cash-account')).map(a=>({value:a.id,label:a.name+' · '+a.currency}))}/>{p.crossCurrency&&<div style={{fontSize:'11px',color:'#0f766e',background:'#f0fdf4',padding:'3px 8px',borderRadius:'4px',marginTop:'-4px',marginBottom:'4px',border:'1px solid #bbf7d0'}}>⚠️ حساب التحصيل الرئيسي معطل (لن يتأثر بحركة) — الحركة النقدية الفعلية ستسجل في حساب العملة الأخرى أدناه.</div>}<div style={{background:'#f8fafc',padding:'6px 10px',borderRadius:'6px',border:'1px solid #e2e8f0',margin:'4px 0'}}><label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:600,color:'#0f766e',fontSize:'12px'}}><input type="checkbox" checked={!!p.crossCurrency} onChange={e=>{const checked=e.target.checked;setP('crossCurrency',checked);if(checked&&!p.settlementCurrency)setP('settlementCurrency','SDG');if(checked&&!p.conversionRate)setP('conversionRate',1);if(checked&&!p.settlementAmount){const tot=Number(sellingPriceVal||0);setP('settlementAmount',tot>0?tot:'');}}}/><span>تسوية / سداد بعملة أخرى (مثال: السعر بالدولار والدفع بالسوداني)</span></label></div>{p.crossCurrency&&<div style={{background:'#f0fdf4',padding:'8px 10px',borderRadius:'6px',border:'1px solid #86efac',marginBottom:'6px',fontSize:'12px'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginBottom:'6px'}}><Picker label="عملة السداد" value={p.settlementCurrency||'SDG'} onChange={v=>{setP('settlementCurrency',v);setP('settlementTreasuryId','');}} options={catalog.filter(c=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(c))}/><Picker label="حساب الخزنة / البنك *" value={p.settlementTreasuryId||''} onChange={v=>setP('settlementTreasuryId',v)} options={collectionAccounts.filter(a=>a.currency==='MULTI'||a.currency===(p.settlementCurrency||'SDG')).map(a=>({value:a.id,label:a.name+' · '+(a.kind==='bank-account'?'بنك':'خزينة')+' · '+a.currency}))}/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}><Field label={`المبلغ المسدد (${p.settlementCurrency||'SDG'}) *`} type="number" value={p.settlementAmount||''} onChange={(v:any)=>{const sAmt=Number(v||0);const tot=Number(sellingPriceVal||0);setP('settlementAmount',v);if(sAmt>0&&tot>0){setP('conversionRate',Number((sAmt/tot).toFixed(4)));}}} placeholder="المبلغ المدفوع فعلياً"/><Field label="سعر الصرف *" type="number" step="any" value={p.conversionRate||''} onChange={(v:any)=>{const rate=Number(v||0);const tot=Number(sellingPriceVal||0);setP('conversionRate',v);if(tot>0&&rate>0){setP('settlementAmount',Number((tot*rate).toFixed(2)));}}} placeholder="سعر الصرف"/></div><div style={{fontSize:'11px',color:'#15803d',marginTop:'4px'}}>💡 سيتم إيداع <b>{p.settlementAmount||0} {p.settlementCurrency||'SDG'}</b> في حساب <b>{collectionAccounts.find(a=>a.id===p.settlementTreasuryId)?.name||'الخزنة/البنك المحدد'}</b>، وتغطية سعر التذكرة (<b>{sellingPriceVal||0} {form.currency}</b>) في حساب العميل. حساب التحصيل بالدولار أعلاه معطل.</div></div>}</>}</section></div>
  <section className="ticket-card ticket-details">
    <div style={{background:'#f8fafc',padding:'8px 10px',borderRadius:'8px',border:'1px solid #cbd5e1',marginBottom:'8px'}}>
     <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px',flexWrap:'wrap',gap:'6px'}}>
      <span style={{fontWeight:700,fontSize:'12px',color:'#1e293b',display:'flex',alignItems:'center',gap:'4px'}}>
       <Users size={16}/> قائمة الركاب والتذاكر ({passengersList.length} {passengersList.length>1?'ركاب':'راكب'})
      </span>
      <div style={{display:'flex',gap:'6px'}}>
       <label className="plain-button" style={{cursor:'pointer',fontSize:'11px',background:'#ecfdf5',color:'#047857',border:'1px solid #a7f3d0',padding:'3px 8px',borderRadius:'4px',display:'inline-flex',alignItems:'center',gap:'4px'}}>
        <Upload size={13}/>
        <span>{analyzingFile?'جارٍ التحليل…':'تحليل تذكرة / PDF / صورة (OCR)'}</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.pnr" style={{display:'none'}} onChange={onDirectFileUpload} disabled={analyzingFile}/>
       </label>
       <button type="button" className="plain-button" style={{fontSize:'11px',background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe',padding:'3px 8px',borderRadius:'4px',display:'inline-flex',alignItems:'center',gap:'4px'}} onClick={addPassengerRow}>
        <Plus size={13}/>
        <span>+ إضافة راكب وتذكرة</span>
       </button>
      </div>
     </div>
     <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
      {passengersList.map((pax,idx)=>(
       <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'6px',alignItems:'center',background:'#ffffff',padding:'4px 6px',borderRadius:'6px',border:'1px solid #e2e8f0'}}>
        <Field label={`اسم الراكب ${passengersList.length>1?idx+1:''}`} value={pax.name} onChange={v=>updatePassengerRow(idx,'name',v)} placeholder="اسم الراكب (PAX)" required/>
        <Field label={`رقم التذكرة ${passengersList.length>1?idx+1:''}`} value={pax.ticketNo} onChange={v=>updatePassengerRow(idx,'ticketNo',v)} placeholder="رقم التذكرة (13-14 رقم)" required inputMode="numeric"/>
        {passengersList.length>1&&(
         <button type="button" onClick={()=>removePassengerRow(idx)} style={{background:'#fee2e2',color:'#b91c1c',border:'none',borderRadius:'4px',padding:'6px 8px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}} title="حذف الراكب">
          <Trash2 size={15}/>
         </button>
        )}
       </div>
      ))}
     </div>
    </div>
    <div className="paired-fields" style={{margin:'6px 0'}}>
     <Field
      label={
       <span style={{display:'inline-flex',justifyContent:'space-between',alignItems:'center',width:'100%',gap:'6px'}}>
        <span>{passengersList.length>1?"سعر الأساس (Fare)":"السعر الأساسي (Fare)"}</span>
        <button
         type="button"
         onClick={()=>setEnableFareEdit(v=>!v)}
         style={{
          fontSize:'10px',
          padding:'1px 6px',
          borderRadius:'4px',
          border:enableFareEdit?'1px solid #16a34a':'1px solid #94a3b8',
          background:enableFareEdit?'#dcfce7':'#f1f5f9',
          color:enableFareEdit?'#15803d':'#475569',
          cursor:'pointer',
          fontWeight:700,
          lineHeight:'1.2'
         }}
         title={enableFareEdit?'انقر لقفل خانة السعر الأساسي وجعلها معطلة تلقائياً':'انقر لتفعيل وتعديل خانة السعر الأساسي برغبتك'}
        >
         {enableFareEdit ? '🔓 مفعل للتعديل' : '🔒 معطل (تلقائي)'}
        </button>
       </span>
      }
      type="number"
      value={enableFareEdit ? p.fare : (p.fare || (Number(sellingPriceVal || 0) > 0 ? Math.max(0, Number(sellingPriceVal || 0) - totalTaxes) : 0))}
      onChange={onFareChange}
      disabled={!enableFareEdit}
      required={false}
      style={!enableFareEdit ? {background:'#f8fafc',color:'#64748b',cursor:'not-allowed'} : {}}
     />
     <Field label={passengersList.length>1?"سعر البيع الإجمالي (للعميل)":"سعر البيع (للعميل)"} color="#0f766e" type="number" value={sellingPriceVal} onChange={onSellingChange} placeholder="إجمالي سعر البيع" required/>
     <Field label={passengersList.length>1?"سعر المورد الإجمالي (التكلفة)":"سعر المورد (التكلفة)"} color="#7c6ba3" type="number" value={supplierPriceVal} onChange={onSupplierChange} placeholder="إجمالي تكلفة المورد" required/>
    </div><div className="tax-visibility" style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',padding:'6px 12px',borderRadius:'6px',border:'1px solid #e2e8f0',margin:'6px 0'}}><button type="button" className="plain-button" style={{fontWeight:600,color:showTaxes?'#0f766e':'#64748b'}} aria-expanded={showTaxes} onClick={()=>setShowTaxes(v=>{const next=!v;if(next)setEnableFareEdit(true);return next;})}>{showTaxes?'إخفاء خانات الضرائب ▲':'إظهار خانات الضرائب ▼'} {totalTaxes>0&&`(${totalTaxes.toFixed(2)} ${form.currency})`}</button><span style={{fontSize:'12px',color:'#64748b'}}>{showTaxes?'الضرائب تضاف لسعر التذكرة الأساسي':'الضرائب مخفية، وتُحسب العمولات مباشرة بين البيع والتكلفة'}</span></div><div className="tax-grid" hidden={!showTaxes}>{['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t=><label key={t} style={{display:'flex',flexDirection:'column',gap:'2px'}}><span style={{fontSize:'11px',fontWeight:700,color:'#475569'}}>ضريبة {t}</span><input aria-label={'ضريبة '+t} type="number" min="0" step="0.01" value={p.taxes?.[t]||''} onChange={e=>onTaxChange(t,Number(e.target.value))}/></label>)}</div><div className="ticket-route"><Field label="خط السير (Route)" value={p.route} onChange={v=>setP('route',v)} placeholder="CAI – KRT"/><Field label="الدرجة (Class)" value={p.class} onChange={v=>setP('class',v)}/><Field label="الإشارة (Sign)" value={p.sign} onChange={v=>setP('sign',v)}/></div><div className="paired-fields"><Field label="نسبة إضافية %" color="#ffbf00" type="number" max="100" value={p.extraPct} onChange={v=>setP('extraPct',v)}/><Field label="عمولة إضافية" color="#ffbf00" type="number" value={p.extraComm} onChange={v=>setP('extraComm',v)}/></div></section></div>
  <aside className="ticket-summary">
  <section className="ticket-card">
    <div className="summary-row"><span className="red">سقف الحساب</span><b>—</b></div>
    <div className="summary-row"><span>رصيد العميل</span><b>{money(balances.find(b=>b.accountId===p.customerId&&b.currency===form.currency)?.balanceMinor??customers.find(c=>c.id===p.customerId)?.amount??0)} {form.currency}</b></div>
  </section>
  {p.status==='refunded'?(
    <section className="ticket-card" style={{border:'1.5px solid #fecaca',background:'#fff5f5'}}>
      <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px'}}>
        <RotateCcw size={16} color="#dc2626"/>
        <h2 style={{margin:0,fontSize:'13px',fontWeight:700,color:'#dc2626'}}>تذكرة مستردة</h2>
      </div>
      <div className="summary-row"><span style={{color:'#0f766e',fontWeight:600}}>سعر البيع الأصلي (الراكب)</span><b style={{color:'#0f766e'}} dir="ltr">{money(prices.originalSellMinor??prices.ticketBaseMinor)}</b></div>
      <div className="summary-row"><span style={{color:'#475569'}}>تكلفة المورد الأصلية</span><b dir="ltr">{money(prices.originalCostMinor??prices.supplierDueMinor)}</b></div>
      <div className="summary-row"><span style={{color:'#b91c1c'}}>(-) غرامة الخطوط</span><b style={{color:'#b91c1c'}} dir="ltr">- {money(prices.penaltyMinor||0)}</b></div>
      {(prices.brokerCommissionMinor||0)>0&&<div className="summary-row"><span style={{color:'#b45309'}}>(-) عمولة المورد</span><b style={{color:'#b45309'}} dir="ltr">- {money(prices.brokerCommissionMinor||0)}</b></div>}
      <div className="summary-row" style={{borderTop:'1px dashed #fca5a5',paddingTop:'4px'}}><span className="purple" title="المسترد من الخطوط أو المورد للمكتب">(=) مسترد من {nonIata?'المورد':'الخطوط'}</span><b aria-label="صافي حساب الخطوط أو المورد" style={{color:'#7c3aed'}} dir="ltr">{money(prices.supplierRefundMinor??prices.supplierDueMinor)}</b></div>
      {(prices.refundCommMinor ?? 0) < 0 ? (
        <div className="summary-row" style={{background:'#fef2f2',padding:'3px 6px',borderRadius:'4px',margin:'2px 0'}}><span style={{color:'#b91c1c',fontWeight:600}}>(+) إرجاع إضافي للراكب</span><b style={{color:'#b91c1c'}} dir="ltr">+ {money(Math.abs(prices.refundCommMinor || 0))}</b></div>
      ) : (
        <div className="summary-row"><span style={{color:'#c2410c'}}>(-) خصم عمولة المكتب</span><b style={{color:'#c2410c'}} dir="ltr">- {money(prices.refundCommMinor||0)}</b></div>
      )}
      <div className="summary-row" style={{borderTop:'2px solid #bbf7d0',paddingTop:'6px',background:'#f0fdf4',margin:'4px -8px',padding:'6px 8px',borderRadius:'4px'}}><span style={{color:'#15803d',fontWeight:700}}>(=) المسترد للراكب</span><b aria-label="إجمالي سعر الراكب" style={{color:'#15803d',fontSize:'15px',fontWeight:800}} dir="ltr">{money(prices.customerRefundMinor??prices.totalMinor)}</b></div>
      {(()=>{
        const profitMinor = prices.incomeMinor;
        const isPositive = profitMinor > 0;
        const isNegative = profitMinor < 0;

        const boxBg = isPositive ? '#f0fdf4' : isNegative ? '#fef2f2' : '#f8fafc';
        const boxBorder = isPositive ? '#86efac' : isNegative ? '#fca5a5' : '#cbd5e1';
        const textColor = isPositive ? '#15803d' : isNegative ? '#b91c1c' : '#475569';
        const badgeBg = isPositive ? '#dcfce7' : isNegative ? '#fee2e2' : '#e2e8f0';
        const badgeColor = isPositive ? '#166534' : isNegative ? '#991b1b' : '#334155';
        const badgeText = isPositive ? 'ربح محقق (+)' : isNegative ? 'مسترد بالناقص (-)' : 'بدون ربح (0)';
        const commAccountName = selectedCommAcc?.name || defaultCommAcc?.name || 'عمولات التذاكر';
        const noteText = isPositive
          ? `يُضاف لحساب «${commAccountName}»`
          : isNegative
          ? `يُخصم من حساب «${commAccountName}» لإرجاع عمولة الإصدار`
          : 'استرداد متعادل · تم الاحتفاظ بعمولة الإصدار';

        return (
          <div style={{
            background: boxBg,
            border: `2px solid ${boxBorder}`,
            borderRadius: '8px',
            padding: '10px 12px',
            marginTop: '8px',
            marginBottom: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
              <span style={{fontSize:'12px',fontWeight:700,color:textColor,display:'flex',alignItems:'center',gap:'4px'}}>
                <span>{isPositive ? '✨' : isNegative ? '⚠️' : '⚖️'}</span>
                <span>صافي ربح الوكالة</span>
              </span>
              <span style={{fontSize:'10px',fontWeight:700,background:badgeBg,color:badgeColor,padding:'2px 6px',borderRadius:'10px'}}>
                {badgeText}
              </span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginTop:'2px'}}>
              <span style={{fontSize:'11px',color:textColor}}>
                {isNegative ? 'صافي العائد (بالسالب):' : 'صافي ربح المكتب:'}
              </span>
              <b aria-label="صافي ربح الوكالة" style={{fontSize:'17px',fontWeight:800,color:textColor}} dir="ltr">
                {isPositive ? `+ ${money(profitMinor)}` : money(profitMinor)} {form.currency}
              </b>
            </div>
            <div style={{fontSize:'10.5px',color:textColor,marginTop:'4px',paddingTop:'4px',borderTop:`1px dashed ${boxBorder}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span>{noteText}</span>
              {isNegative && <span style={{fontWeight:700,color:'#dc2626'}}>(بالسالب)</span>}
            </div>
          </div>
        );
      })()}
      <div className="ticket-save" style={{display:'flex',flexDirection:'column',gap:'8px',width:'100%',borderTop:'1px solid #fca5a5',paddingTop:'10px',marginTop:'6px'}}>
        <button className="blue-button" style={{width:'100%',background:'#dc2626',color:'#fff'}} disabled={busy||!canManage||!customerOptions.length}>
          {busy?'جارٍ الحفظ…':form.id?'حفظ التعديل (مستردة)':'حفظ التذكرة المستردة'}
        </button>
        <div style={{display:'grid',gridTemplateColumns:form.id?'1fr 1fr':'1fr',gap:'6px',width:'100%'}}>
          <button type="button" className="gray-button" style={{width:'100%',padding:'7px 8px'}} onClick={()=>resetForm(nextVoucherNumber)}>
            تفريغ الحقول
          </button>
          {form.id&&<button type="button" className="plain-button" onClick={()=>{const cust=customers.find(c=>c.id===p.customerId);const custPhone=cust?.payload?.phone||p.phone||'';const waMsg=buildTicketWhatsAppMessage({ticketCode:form.code,passengerName:form.name,customerName:cust?.name,airline:ticketSupplierName(p),route:p.route,flightDate:form.date,totalAmount:Number(sellingPriceVal||0),currency:form.currency,receiptNumber:p.receiptNumber,pnr:p.pnr,settings});setWhatsAppModal({name:cust?.name||form.name,phone:custPhone,message:waMsg})}} style={{width:'100%',color:'#15803d',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',padding:'7px 8px',borderRadius:'4px',border:'1px solid #86efac',background:'#f0fdf4'}} title="إرسال إيصال التذكرة عبر WhatsApp"><ERPIcon name="whatsapp" size={15}/> <span>WhatsApp</span></button>}
        </div>
        <button type="button" onClick={()=>setP('status','active')} className="plain-button" style={{width:'100%',color:'#475569',fontSize:'12px',fontWeight:600,padding:'7px 8px',background:'#ffffff',border:'1px solid #cbd5e1',borderRadius:'4px'}}>
          إلغاء الاسترداد والعودة للنشط
        </button>
      </div>
    </section>
  ):(
    <section className="ticket-card">
      <div className="summary-row"><span className="lime" title="سعر التذكرة الأساسي مع الضرائب">سعر التذكرة</span><b aria-label="سعر التذكرة الأساسي" dir="ltr">{money(prices.ticketBaseMinor)}</b></div>
      <div className="summary-row"><span className="purple" title="صافي المستحق للخطوط أو المورد">{nonIata?'المورد':'الخطوط'}</span><b aria-label="صافي حساب الخطوط أو المورد" dir="ltr">{money(prices.supplierDueMinor)}</b></div>
      <div className="summary-row"><span title="إجمالي سعر الراكب بعد العمولات والخصم">Customer</span><b aria-label="إجمالي سعر الراكب" dir="ltr">{money(prices.totalMinor)}</b></div>
      <div className="summary-row"><span className="orange">صافي العمولة</span><b aria-label="صافي العمولة" dir="ltr">{money(prices.incomeMinor)}</b></div>
      <div className="ticket-save" style={{display:'flex',flexDirection:'column',gap:'8px',width:'100%',borderTop:'1px solid #cbd5e1',paddingTop:'10px',marginTop:'6px'}}>
        {!form.id && (
          <button
            type="submit"
            className="blue-button"
            style={{width:'100%'}}
            disabled={busy||!canManage||!customerOptions.length}
            title="حفظ التذكرة الجديدة في النظام"
          >
            {busy?'جارٍ الحفظ…':'إضافة تذكرة (جديد)'}
          </button>
        )}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',width:'100%'}}>
          <button
            type="button"
            disabled={!form.id || busy || !canManage}
            onClick={handleRequestEditTicket}
            style={{
              background: form.id ? '#2563eb' : '#f1f5f9',
              color: form.id ? '#ffffff' : '#94a3b8',
              border: form.id ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
              cursor: form.id ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: 700,
              padding: '8px 10px',
              borderRadius: '6px',
              opacity: form.id ? 1 : 0.6,
              minHeight: '38px',
              transition: 'all 0.15s ease'
            }}
            title={form.id ? 'تعديل وحفظ بيانات التذكرة المحددة' : 'يتفعل فقط عند اختيار تذكرة مسجلة للتعديل'}
          >
            <Pencil size={15} />
            <span>تعديل</span>
          </button>

          <button
            type="button"
            disabled={!form.id || busy || !canManage}
            onClick={() => setConfirmDeleteTicketOpen(true)}
            style={{
              background: form.id ? '#dc2626' : '#f1f5f9',
              color: form.id ? '#ffffff' : '#94a3b8',
              border: form.id ? '1px solid #b91c1c' : '1px solid #cbd5e1',
              cursor: form.id ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: 700,
              padding: '8px 10px',
              borderRadius: '6px',
              opacity: form.id ? 1 : 0.6,
              minHeight: '38px',
              transition: 'all 0.15s ease'
            }}
            title={form.id ? 'حذف هذه التذكرة نهائياً من النظام' : 'يتفعل فقط عند اختيار تذكرة مسجلة للحذف'}
          >
            <Trash2 size={15} />
            <span>حذف</span>
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:form.id?'1fr 1fr':'1fr',gap:'6px',width:'100%'}}>
          <button type="button" className="gray-button" style={{width:'100%',padding:'7px 8px'}} onClick={()=>resetForm(nextVoucherNumber)} title="تفريغ الحقول والبدء بتذكرة جديدة">
            تفريغ الحقول (جديد)
          </button>
          {form.id&&<button type="button" className="plain-button" onClick={()=>{const cust=customers.find(c=>c.id===p.customerId);const custPhone=cust?.payload?.phone||p.phone||'';const waMsg=buildTicketWhatsAppMessage({ticketCode:form.code,passengerName:form.name,customerName:cust?.name,airline:ticketSupplierName(p),route:p.route,flightDate:form.date,totalAmount:Number(sellingPriceVal||0),currency:form.currency,receiptNumber:p.receiptNumber,pnr:p.pnr,settings});setWhatsAppModal({name:cust?.name||form.name,phone:custPhone,message:waMsg})}} style={{width:'100%',color:'#15803d',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',padding:'7px 8px',borderRadius:'4px',border:'1px solid #86efac',background:'#f0fdf4'}} title="إرسال إيصال التذكرة عبر WhatsApp"><ERPIcon name="whatsapp" size={15}/> <span>WhatsApp</span></button>}
        </div>
        {form.id&&p.status!=='refunded'&&(
          <button type="button" onClick={()=>{
            setP('status','refunded');
            const sVal=Number(p.sellingPrice||sellingPriceVal||0);
            const supVal=Number(p.supplierPrice||supplierPriceVal||0);
            setP('originalSellMinor',Math.round(sVal*100));
            setP('originalCostMinor',Math.round(supVal*100));
            setP('refundDate',today());
          }} className="plain-button" style={{color:'#dc2626',background:'#fef2f2',border:'1.5px solid #fca5a5',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'7px 10px',borderRadius:'6px',width:'100%'}} title="تحويل هذه التذكرة إلى مستردة">
            <RotateCcw size={14}/>
            <span>استرداد هذه التذكرة (Refund)</span>
          </button>
        )}
      </div>
    </section>
  )}
</aside></div><Dialog open={help&&w.active} onOpenChange={setHelp}><DialogContent dir="rtl"><DialogTitle>رقم التذكرة</DialogTitle><DialogDescription>أدخل رقمًا من 8 إلى 16 رقمًا. لا يمكن حفظ رقم تذكرة مكرر.</DialogDescription></DialogContent></Dialog><Dialog open={!!pricingChoiceModal} onOpenChange={v=>!v&&setPricingChoiceModal(null)}><DialogContent dir="rtl" className="ticket-pricing-modal" style={{maxWidth:'520px',borderRadius:'12px',padding:'22px'}}><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}><Sparkles size={20} color="#0f766e"/><DialogTitle style={{fontSize:'17px',fontWeight:700,color:'#0f766e',margin:0}}>طريقة تنزيل أسعار التذاكر والضرائب</DialogTitle></div><DialogDescription style={{color:'#475569',fontSize:'13px',lineHeight:1.6,marginBottom:'14px'}}>تم استخراج بيانات الملف المرفوع ({pricingChoiceModal?.paxRows?.length||1} {pricingChoiceModal?.paxRows?.length>1?'ركاب':'راكب'}). اختر طريقة تنزيل المبالغ في نموذج التذكرة:</DialogDescription><div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'13px'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}><span style={{color:'#64748b'}}>عدد الركاب والتذاكر:</span><b style={{color:'#0f766e'}}>{pricingChoiceModal?.paxRows?.length||1} {pricingChoiceModal?.paxRows?.length>1?'ركاب':'راكب'}</b></div><div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}><span style={{color:'#64748b'}}>إجمالي التذاكر (سعر البيع):</span><b style={{color:'#0f766e'}}>{Number(pricingChoiceModal?.finalSell||0).toLocaleString()} {pricingChoiceModal?.finalCurrency}</b></div><div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}><span style={{color:'#64748b'}}>سعر المورد / الخطوط:</span><b style={{color:'#7c3aed'}}>{Number(pricingChoiceModal?.finalSup||0).toLocaleString()} {pricingChoiceModal?.finalCurrency}</b></div><div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}><span style={{color:'#64748b'}}>السعر الأساسي (Fare):</span><b>{Number(pricingChoiceModal?.finalFare||0).toLocaleString()} {pricingChoiceModal?.finalCurrency}</b></div><div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>مجموع الضرائب (Taxes):</span><b style={{color:'#c2410c'}}>{Number(pricingChoiceModal?.taxSum||0).toLocaleString()} {pricingChoiceModal?.finalCurrency}</b></div></div><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><button type="button" className="plain-button" onClick={()=>applyPricingChoice('total_only')} style={{background:'#f0fdf4',border:'2px solid #22c55e',color:'#15803d',padding:'12px 14px',borderRadius:'8px',textAlign:'right',cursor:'pointer',display:'flex',flexDirection:'column',gap:'4px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:'14px'}}>1. المجموع الكلي للتذاكر فقط</b><span style={{fontSize:'11px',background:'#dcfce7',color:'#166534',padding:'2px 8px',borderRadius:'4px',fontWeight:700}}>المجموع الكلي</span></div><small style={{color:'#166534',fontSize:'12px'}}>وضع إجمالي التذاكر كلها في سعر البيع وسعر المورد كالعادة، بدون تفصيل خانات الضرائب.</small></button><button type="button" className="plain-button" onClick={()=>applyPricingChoice('detailed_taxes')} style={{background:'#eff6ff',border:'2px solid #3b82f6',color:'#1d4ed8',padding:'12px 14px',borderRadius:'8px',textAlign:'right',cursor:'pointer',display:'flex',flexDirection:'column',gap:'4px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:'14px'}}>2. تنزيل الضرائب والسعر الأساسي بالتفصيل</b><span style={{fontSize:'11px',background:'#dbeafe',color:'#1e40af',padding:'2px 8px',borderRadius:'4px',fontWeight:700}}>تفصيلي</span></div><small style={{color:'#1e40af',fontSize:'12px'}}>تنزيل سعر الأساس بالتفصيل مع بنود الضرائب (SD, YR, YQ...) وفتح جدول الضرائب تلقائيًا.</small></button></div></DialogContent></Dialog>{whatsAppModal&&<WhatsAppDialog open={!!whatsAppModal} onOpenChange={open=>!open&&setWhatsAppModal(null)} title="إرسال إيصال التذكرة عبر WhatsApp 📲" recipientName={whatsAppModal.name} initialPhone={whatsAppModal.phone} initialMessage={whatsAppModal.message}/>}<Dialog open={quickCustomerModal} onOpenChange={setQuickCustomerModal}><DialogContent dir="rtl" style={{maxWidth:'450px',borderRadius:'12px',padding:'20px'}}><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}><Users size={20} color="#0f766e"/><DialogTitle style={{fontSize:'16px',fontWeight:700,color:'#0f766e',margin:0}}>إضافة عميل جديد لدليل العملاء</DialogTitle></div><DialogDescription style={{fontSize:'12px',color:'#64748b',marginBottom:'14px'}}>سيتم تسجيل العميل في دليل العملاء، وربطه بالتذاكر وجميع العمليات وكشوف الحساب.</DialogDescription><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><Field label="اسم العميل *" value={quickCustomerName} onChange={setQuickCustomerName} placeholder="مثال: أحمد عبد الله أو اسم الشركة" required/><Picker label="العملة الأساسية للحساب" value={quickCustomerCurrency} onChange={setQuickCustomerCurrency} options={[{value:'MULTI',label:'متعدد العملات (موصى به)'},...catalog.map(c=>({value:c,label:c}))]}/><Field label="رقم الهاتف (اختياري)" value={quickCustomerPhone} onChange={setQuickCustomerPhone} placeholder="مثال: 0912345678"/><Field label="البريد الإلكتروني (اختياري)" type="text" value={quickCustomerEmail} onChange={setQuickCustomerEmail} placeholder="example@email.com"/><Field label="العنوان (اختياري)" value={quickCustomerAddress} onChange={setQuickCustomerAddress} placeholder="المدينة، العنوان أو الحي"/><div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'10px'}}><button type="button" className="gray-button" onClick={()=>setQuickCustomerModal(false)}>إلغاء</button><button type="button" className="blue-button" onClick={()=>saveQuickCustomer()} disabled={quickCustomerSaving||!quickCustomerName.trim()}>{quickCustomerSaving?'جارٍ الحفظ…':'حفظ وتحديد في التذكرة'}</button></div></div></DialogContent></Dialog><Dialog open={quickAirlineModal} onOpenChange={setQuickAirlineModal}><DialogContent dir="rtl" style={{maxWidth:'450px',borderRadius:'12px',padding:'20px'}}><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}><Plane size={20} color="#0f766e"/><DialogTitle style={{fontSize:'16px',fontWeight:700,color:'#0f766e',margin:0}}>إضافة حساب خط طيران جديد للدليل</DialogTitle></div><DialogDescription style={{fontSize:'12px',color:'#64748b',marginBottom:'14px'}}>سيتم تسجيل شركة الطيران في دليل الحسابات كحساب خطوط مستقل تحت تحكمك، وربطه بجميع حركات التذاكر وكشوفات الحساب.</DialogDescription><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><Field label="اسم شركة الطيران *" value={quickAirlineName} onChange={setQuickAirlineName} placeholder="مثال: تاركو للطيران / Badr Airlines" required/><Picker label="العملة الأساسية للحساب" value={quickAirlineCurrency} onChange={setQuickAirlineCurrency} options={[{value:'MULTI',label:'متعدد العملات (موصى به)'},...catalog.map(c=>({value:c,label:c}))]}/><Field label="رقم الهاتف / التواصل (اختياري)" value={quickAirlinePhone} onChange={setQuickAirlinePhone} placeholder="هاتف المكتب أو المشرف"/><Field label="ملاحظات (اختياري)" value={quickAirlineNotes} onChange={setQuickAirlineNotes} placeholder="ملاحظات حول الحساب أو كود الشركة"/><div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'10px'}}><button type="button" className="gray-button" onClick={()=>setQuickAirlineModal(false)}>إلغاء</button><button type="button" className="blue-button" onClick={()=>saveQuickAirline()} disabled={quickAirlineSaving||!quickAirlineName.trim()}>{quickAirlineSaving?'جارٍ الحفظ…':'حفظ وتحديد في التذكرة'}</button></div></div></DialogContent></Dialog><Dialog open={quickRevenueModal} onOpenChange={setQuickRevenueModal}><DialogContent dir="rtl" style={{maxWidth:'450px',borderRadius:'12px',padding:'20px'}}><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}><Sparkles size={20} color="#0f766e"/><DialogTitle style={{fontSize:'16px',fontWeight:700,color:'#0f766e',margin:0}}>إضافة حساب إيرادات جديد لدليل الحسابات</DialogTitle></div><DialogDescription style={{fontSize:'12px',color:'#64748b',marginBottom:'14px'}}>سيتم تسجيل حساب الإيرادات في دليل الحسابات تحت تحكمك الكامل، ويمكنك تعديله ومراجعته وتحديده لحركات التذاكر والخدمات.</DialogDescription><div style={{display:'flex',flexDirection:'column',gap:'10px'}}><Field label="اسم حساب الإيرادات *" value={quickRevenueName} onChange={setQuickRevenueName} placeholder="مثال: إيرادات التذاكر / أرباح وعمولات الحجوزات" required/><Picker label="العملة الأساسية للحساب" value={quickRevenueCurrency} onChange={setQuickRevenueCurrency} options={[{value:'MULTI',label:'متعدد العملات (موصى به)'},...catalog.map(c=>({value:c,label:c}))]}/><Field label="ملاحظات (اختياري)" value={quickRevenueNotes} onChange={setQuickRevenueNotes} placeholder="ملاحظات حول الحساب أو الغرض منه"/><div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'10px'}}><button type="button" className="gray-button" onClick={()=>setQuickRevenueModal(false)}>إلغاء</button><button type="button" className="blue-button" onClick={()=>handleSaveQuickRevenue()} disabled={quickRevenueSaving||!quickRevenueName.trim()}>{quickRevenueSaving?'جارٍ الحفظ…':'حفظ وتحديد في التذكرة'}</button></div></div></DialogContent></Dialog>
      <AlertDialog open={confirmEditTicketOpen} onOpenChange={setConfirmEditTicketOpen}>
        <AlertDialogContent dir="rtl" style={{ maxWidth: '440px', borderRadius: '12px', padding: '22px' }}>
          <AlertDialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pencil size={18} color="#2563eb" />
            <span>تأكيد تعديل التذكرة</span>
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginTop: '8px' }}>
            هل أنت متأكد من حفظ التعديلات على هذه التذكرة ({p.receiptNumber ? `إيصال رقم ${p.receiptNumber}` : (form.code || form.name)})؟
            <br />
            سيتم تحديث بيانات التذكرة وجميع القيود المحاسبية المرتبطة بها في كشف الحساب.
          </AlertDialogDescription>
          <AlertDialogFooter style={{ display: 'flex', gap: '10px', marginTop: '18px', justifyContent: 'flex-start' }}>
            <AlertDialogAction
              onClick={executeSaveTicket}
              disabled={busy}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {busy ? 'جارٍ الحفظ…' : 'نعم، حفظ التعديل'}
            </AlertDialogAction>
            <AlertDialogCancel
              disabled={busy}
              onClick={() => setConfirmEditTicketOpen(false)}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteTicketOpen} onOpenChange={setConfirmDeleteTicketOpen}>
        <AlertDialogContent dir="rtl" style={{ maxWidth: '440px', borderRadius: '12px', padding: '22px' }}>
          <AlertDialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={18} color="#dc2626" />
            <span>تأكيد حذف التذكرة</span>
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginTop: '8px' }}>
            هل أنت متأكد من رغبتك في حذف هذه التذكرة ({p.receiptNumber ? `إيصال رقم ${p.receiptNumber}` : (form.code || form.name)}) نهائياً؟
            <br />
            <strong>تنبيه:</strong> سيتم حذف التذكرة وتسوياتها وحركاتها المرتبطة بالكامل من كشوف الحسابات ولا يمكن التراجع عن هذه الخطوة.
          </AlertDialogDescription>
          <AlertDialogFooter style={{ display: 'flex', gap: '10px', marginTop: '18px', justifyContent: 'flex-start' }}>
            <AlertDialogAction
              onClick={executeDeleteTicket}
              disabled={busy}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {busy ? 'جارٍ الحذف…' : 'نعم، تأكيد الحذف'}
            </AlertDialogAction>
            <AlertDialogCancel
              disabled={busy}
              onClick={() => setConfirmDeleteTicketOpen(false)}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
</form>
}

export const defaultServiceTypes: string[] = [];

export const newService = (defCurr = 'EGP') => ({
  kind: 'service',
  name: '',
  code: '',
  date: today(),
  currency: defCurr,
  amount: 0,
  payload: {
    receiptNumber: '',
    serviceAccountId: '',
    serviceAccountName: '',
    cost: 0,
    price: 0,
    quantity: 1,
    notes: '',
    payment: 'credit',
    treasuryId: '',
    supplierId: '',
    supplierName: '',
    discount: 0,
    commissionAccountId: '',
    commissionAccountName: '',
    exchangeRate: 1,
    brokerId: '',
    brokerName: '',
    brokerCommission: 0,
    flags: {
      Group: false,
      Broker: false
    }
  }
});

export function ServiceEntry({
  initial,
  onSaved,
  onDraftChange,
  onClose
}: {
  initial?: any;
  onSaved?: () => void;
  onDraftChange?: (form: any) => void;
  onClose?: () => void;
}) {
  const w = useWorkspaceWindow();
  const settings = useAgencySettings();
  const access = useAgencyAccess();
  const canManage = access.modules.customers === 'manage';
  const collectionAccounts = useCollectionAccounts();

  const [catalog, setCatalog] = useState<string[]>(currencies);
  const [customers, setCustomers] = useState<RecordRow[]>([]);
  const [accounts, setAccounts] = useState<RecordRow[]>([]);
  const [services, setServices] = useState<RecordRow[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [isCustomService, setIsCustomService] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [quickCustomerModal, setQuickCustomerModal] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerEmail, setQuickCustomerEmail] = useState('');
  const [quickCustomerAddress, setQuickCustomerAddress] = useState('');
  const [quickCustomerCurrency, setQuickCustomerCurrency] = useState('MULTI');
  const [quickCustomerSaving, setQuickCustomerSaving] = useState(false);
  const [quickServiceModal, setQuickServiceModal] = useState(false);
  const [quickServiceName, setQuickServiceName] = useState('');
  const [quickServiceCurrency, setQuickServiceCurrency] = useState('MULTI');
  const [quickServiceNotes, setQuickServiceNotes] = useState('');
  const [quickServiceSaving, setQuickServiceSaving] = useState(false);

  const [quickRevenueModal, setQuickRevenueModal] = useState(false);
  const [quickRevenueName, setQuickRevenueName] = useState('');
  const [quickRevenueCurrency, setQuickRevenueCurrency] = useState('MULTI');
  const [quickRevenueNotes, setQuickRevenueNotes] = useState('');
  const [quickRevenueSaving, setQuickRevenueSaving] = useState(false);

  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const defCurr = settings.defaultCurrency || settings.enabledCurrencies?.[0] || 'EGP';
  const [form, setForm] = useState<any>(() => {
    if (initial) {
      return {
        ...initial,
        amount: initial.amount ? Math.abs(initial.amount) / 100 : 0,
        payload: { ...newService(defCurr).payload, ...cleanPayload(initial.payload || {}) }
      };
    }
    return newService(defCurr);
  });

  const p = form.payload;
  const set = (key: string, v: any) => setForm((f: any) => ({ ...f, [key]: v }));
  const setP = (key: string, v: any) => setForm((f: any) => ({ ...f, payload: { ...f.payload, [key]: v } }));

  const autoReceiptRef = useRef<string>('');
  const isManualReceiptRef = useRef<boolean>(false);

  // Next voucher number (e.g., 00000199)
  const nextReceiptNumber = useMemo(() => {
    const maxNum = services.reduce((max, s) => {
      const raw = s.payload?.receiptNumber || s.code;
      const n = parseInt(raw || '', 10);
      return !isNaN(n) && n > max ? n : max;
    }, 198);
    return String(maxNum + 1).padStart(8, '0');
  }, [services]);

  const load = useCallback(async () => {
    try {
      const [c, a, s] = await Promise.all([
        api('/api/records?kind=customer').catch(() => []),
        api('/api/records?kind=account').catch(() => []),
        api('/api/records?kind=service').catch(() => [])
      ]);
      setCustomers(c);
      setAccounts(a);
      setServices(s);
      api('/api/currencies').then(currs => setCatalog(currs.map((x: any) => x.code))).catch(() => {});
      api('/api/balances').then(b => setBalances(b.balances || [])).catch(() => {});
    } catch {}
  }, []);

  async function handleSaveQuickService(e?: any) {
    if (e?.preventDefault) e.preventDefault();
    const targetName = quickServiceName.trim();
    if (!targetName) {
      toast.error('الرجاء إدخال اسم حساب الخدمة');
      return;
    }
    setQuickServiceSaving(true);
    try {
      const res = await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'customer',
          name: targetName,
          date: today(),
          currency: quickServiceCurrency || 'MULTI',
          amount: 0,
          payload: {
            accountType: 'service',
            notes: quickServiceNotes || undefined
          }
        })
      });
      toast.success(`تم حفظ حساب الخدمة "${targetName}" بنجاح في دليل الحسابات`);
      const [newCusts, newAccs] = await Promise.all([
        api('/api/records?kind=customer').catch(() => []),
        api('/api/records?kind=account').catch(() => [])
      ]);
      setCustomers(newCusts);
      setAccounts(newAccs);
      const savedAcc = [...newCusts, ...newAccs].find((a: any) => a.name.trim().toLowerCase() === targetName.toLowerCase());
      const chosenId = savedAcc?.id || res?.id || '';
      setIsCustomService(false);
      setCustomServiceName('');
      setForm((f: any) => ({
        ...f,
        name: targetName,
        payload: {
          ...f.payload,
          serviceAccountId: chosenId,
          serviceAccountName: targetName
        }
      }));
      setQuickServiceModal(false);
      setQuickServiceName('');
      setQuickServiceNotes('');
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ حساب الخدمة');
    } finally {
      setQuickServiceSaving(false);
    }
  }

  async function handleSaveQuickRevenue(e?: any) {
    if (e?.preventDefault) e.preventDefault();
    const targetName = quickRevenueName.trim();
    if (!targetName) {
      toast.error('الرجاء إدخال اسم حساب الإيرادات');
      return;
    }
    setQuickRevenueSaving(true);
    try {
      const res = await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'account',
          name: targetName,
          date: today(),
          currency: quickRevenueCurrency || 'MULTI',
          amount: 0,
          payload: {
            accountType: 'revenue',
            notes: quickRevenueNotes || undefined
          }
        })
      });
      toast.success(`تم حفظ حساب الإيرادات "${targetName}" بنجاح في دليل الحسابات`);
      const newAccs = await api('/api/records?kind=account').catch(() => []);
      setAccounts(newAccs);
      const savedAcc = newAccs.find((a: any) => a.name.trim().toLowerCase() === targetName.toLowerCase());
      const chosenId = savedAcc?.id || res?.id || '';
      setP('commissionAccountId', chosenId);
      setP('commissionAccountName', targetName);
      setQuickRevenueModal(false);
      setQuickRevenueName('');
      setQuickRevenueNotes('');
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ حساب الإيرادات');
    } finally {
      setQuickRevenueSaving(false);
    }
  }

  async function saveQuickCustomer(nameToSave?: string) {
    const targetName = (nameToSave || quickCustomerName).trim();
    if (!targetName) {
      toast.error('يرجى كتابة اسم العميل');
      return;
    }
    setQuickCustomerSaving(true);
    try {
      const res = await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'customer',
          name: targetName,
          date: today(),
          currency: quickCustomerCurrency || 'MULTI',
          amount: 0,
          payload: {
            accountType: 'customer',
            phone: quickCustomerPhone || undefined,
            email: quickCustomerEmail || undefined,
            address: quickCustomerAddress || undefined,
            direction: 'receipt'
          }
        })
      });
      toast.success(`تم حفظ العميل "${targetName}" بنجاح في دليل العملاء`);
      const newCusts = await api('/api/records?kind=customer').catch(() => []);
      setCustomers(newCusts);
      const savedCust = newCusts.find((c: any) => c.name.trim().toLowerCase() === targetName.toLowerCase());
      const newCustId = savedCust?.id || res?.id;
      setP('customerId', newCustId);
      setQuickCustomerModal(false);
      setQuickCustomerName('');
      setQuickCustomerPhone('');
      setQuickCustomerEmail('');
      setQuickCustomerAddress('');
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ العميل');
    } finally {
      setQuickCustomerSaving(false);
    }
  }

  useEffect(() => {
    if (w.active) load();
  }, [load, w.active, w.refreshKey]);

  useEffect(() => {
    onDraftChange?.(form);
  }, [form, onDraftChange]);

  useEffect(() => {
    if (!form.id) {
      if (!isManualReceiptRef.current || !p.receiptNumber || p.receiptNumber === autoReceiptRef.current) {
        setP('receiptNumber', nextReceiptNumber);
        autoReceiptRef.current = nextReceiptNumber;
      }
    }
  }, [nextReceiptNumber, form.id]);

  // Default commission account for services ("عمولات الخدمات")
  const defaultServiceCommissionAccount = useMemo(() => {
    return accounts.find(a => 
      !a.payload?.archived && 
      (a.payload?.accountType === 'revenue' || a.payload?.accountType === 'commission' || a.payload?.accountType === 'income') &&
      (a.name.trim() === 'عمولات الخدمات' || a.name.includes('عمولات الخدمات') || a.name.includes('عمولة الخدمات'))
    ) || accounts.find(a => 
      !a.payload?.archived && 
      (a.payload?.accountType === 'revenue' || a.payload?.accountType === 'commission') &&
      a.name.includes('خدمات')
    );
  }, [accounts]);

  useEffect(() => {
    if (!form.id && !p.commissionAccountId && defaultServiceCommissionAccount) {
      setP('commissionAccountId', defaultServiceCommissionAccount.id);
      setP('commissionAccountName', defaultServiceCommissionAccount.name);
    }
  }, [defaultServiceCommissionAccount, form.id, p.commissionAccountId]);

  // Selected customer info
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === p.customerId);
  }, [customers, p.customerId]);

  const customerBalance = useMemo(() => {
    if (!p.customerId) return null;
    const curBal = balances.find(b => b.accountId === p.customerId && b.currency === form.currency);
    if (curBal !== undefined) return curBal.balanceMinor;
    return selectedCustomer?.amount ?? 0;
  }, [balances, p.customerId, form.currency, selectedCustomer]);

  const customerBalanceFormatted = useMemo(() => {
    if (!p.customerId) return '—';
    if (customerBalance === null) return '0.00 ' + form.currency;
    return money(customerBalance) + ' ' + form.currency;
  }, [p.customerId, customerBalance, form.currency]);

  const customerCreditLimitFormatted = useMemo(() => {
    if (!selectedCustomer) return '—';
    const lim = selectedCustomer.payload?.creditLimit;
    if (lim === undefined || lim === null || lim === '') return '—';
    return money(Math.round(Number(lim) * 100)) + ' ' + form.currency;
  }, [selectedCustomer, form.currency]);

  // Customer options
  const customerOptions = useMemo(() => {
    return customers.filter(c => !c.payload?.archived && (!c.payload?.accountType || c.payload?.accountType === 'customer'));
  }, [customers]);

  // Supplier options: strictly suppliers and airlines only
  const supplierOptions = useMemo(() => {
    const isSupplierOrAirline = (row: RecordRow) => {
      const type = row.payload?.accountType;
      return !row.payload?.archived && (type === 'supplier' || type === 'airline');
    };

    const sups = customers.filter(isSupplierOrAirline);
    const accSups = accounts.filter(isSupplierOrAirline);

    const list: RecordRow[] = [];
    const seen = new Set<string>();

    for (const item of [...sups, ...accSups]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        list.push(item);
      }
    }

    if (p.supplierId && !seen.has(p.supplierId)) {
      const existing = customers.find(c => c.id === p.supplierId) || accounts.find(a => a.id === p.supplierId);
      if (existing && isSupplierOrAirline(existing)) {
        list.unshift(existing);
      }
    }

    return list;
  }, [customers, accounts, p.supplierId]);

  // Service accounts: strictly accounts with accountType === 'service', never commission accounts
  const serviceAccounts = useMemo(() => {
    const isDedicatedService = (a: RecordRow) => {
      if (a.payload?.archived) return false;
      const type = a.payload?.accountType;
      const name = (a.name || '').trim();
      // Explicitly reject any commission, airline, supplier, expense, or ticket accounts
      if (type === 'commission' || type === 'airline' || type === 'supplier' || type === 'expense' ||
          name.includes('عمولة') || name.includes('عمولات') || name.includes('تذاكر')) {
        return false;
      }
      return type === 'service';
    };
    const list: RecordRow[] = [];
    const seen = new Set<string>();
    for (const item of [...customers, ...accounts]) {
      if (isDedicatedService(item) && !seen.has(item.id)) {
        seen.add(item.id);
        list.push(item);
      }
    }
    if (p.serviceAccountId && !seen.has(p.serviceAccountId)) {
      const existing = customers.find(c => c.id === p.serviceAccountId) || accounts.find(a => a.id === p.serviceAccountId);
      if (existing && isDedicatedService(existing)) {
        list.unshift(existing);
      }
    }
    return list;
  }, [customers, accounts, p.serviceAccountId]);


  // Revenue accounts
  const revenueAccounts = useMemo(() => {
    return accounts.filter(a => !a.payload?.archived && (a.payload?.accountType === 'revenue' || a.payload?.accountType === 'commission' || a.payload?.accountType === 'income'));
  }, [accounts]);

  // Commission accounts: strictly ensures "عمولات الخدمات" is prioritized at the top as default
  const commissionAccounts = useMemo(() => {
    const list = accounts.filter(a => !a.payload?.archived && (a.payload?.accountType === 'revenue' || a.payload?.accountType === 'commission' || a.payload?.accountType === 'income'));
    if (defaultServiceCommissionAccount) {
      return [
        defaultServiceCommissionAccount,
        ...list.filter(a => a.id !== defaultServiceCommissionAccount.id)
      ];
    }
    return list;
  }, [accounts, defaultServiceCommissionAccount]);

  // Broker accounts: strictly customer accounts from customers directory (حسابات العملاء)
  const brokerAccounts = useMemo(() => {
    const custBrokers = customers
      .filter(c => !c.payload?.archived && 
                   (!c.payload?.accountType || c.payload?.accountType === 'customer') &&
                   (c.currency === 'MULTI' || c.currency === form.currency) && 
                   c.id !== p.customerId && 
                   c.id !== p.supplierId)
      .map(c => ({
        id: c.id,
        name: c.name,
        currency: c.currency,
        label: c.name + (c.currency === 'MULTI' ? ' · متعدد العملات' : ` · ${c.currency}`)
      }));
    if (p.brokerId && !custBrokers.some(b => b.id === p.brokerId)) {
      const existing = customers.find(c => c.id === p.brokerId) || accounts.find(a => a.id === p.brokerId);
      if (existing) {
        custBrokers.unshift({
          id: existing.id,
          name: existing.name,
          currency: existing.currency,
          label: existing.name + (existing.currency === 'MULTI' ? ' · متعدد العملات' : ` · ${existing.currency}`)
        });
      }
    }
    return custBrokers;
  }, [customers, accounts, form.currency, p.customerId, p.supplierId, p.brokerId]);

  function recalcAmount(price: number, quantity: number, discount: number) {
    const subtotal = Number(price || 0) * Number(quantity || 1);
    const net = Math.max(0, subtotal - Number(discount || 0));
    setForm((f: any) => ({ ...f, amount: Number(net.toFixed(2)) }));
  }

  function onPriceChange(val: any) {
    const price = val === '' ? 0 : Number(val);
    setP('price', val);
    recalcAmount(price, Number(p.quantity || 1), Number(p.discount || 0));
  }

  function onCostChange(val: any) {
    setP('cost', val);
  }

  function onQuantityChange(val: any) {
    const qty = val === '' ? 1 : Math.max(1, Number(val));
    setP('quantity', val);
    recalcAmount(Number(p.price || 0), qty, Number(p.discount || 0));
  }

  function onDiscountChange(val: any) {
    const disc = val === '' ? 0 : Number(val);
    setP('discount', val);
    recalcAmount(Number(p.price || 0), Number(p.quantity || 1), disc);
  }

  function onAmountChange(val: any) {
    const net = val === '' ? 0 : Number(val);
    setForm((f: any) => ({ ...f, amount: val }));
    const qty = Number(p.quantity || 1);
    const disc = Number(p.discount || 0);
    if (qty > 0) {
      setP('price', Number(((net + disc) / qty).toFixed(2)));
    }
  }

  function chooseService(s: RecordRow) {
    setSelectedServiceId(s.id);
    isManualReceiptRef.current = false;
    autoReceiptRef.current = '';
    const pay = s.payload || {};
    setForm({
      ...s,
      amount: Math.abs(s.amount) / 100,
      payload: {
        ...newService(defCurr).payload,
        ...cleanPayload(pay)
      }
    });
    if (pay.serviceAccountId) {
      setIsCustomService(false);
      setCustomServiceName('');
    } else if (s.name && !serviceAccounts.some(a => a.id === s.name || a.name === s.name)) {
      setIsCustomService(true);
      setCustomServiceName(s.name);
    } else {
      setIsCustomService(false);
      setCustomServiceName('');
    }
  }

  useEffect(() => {
    const onSelectService = (e: any) => {
      if (!e.detail) return;
      const d = e.detail;
      if (d.record && d.record.kind === 'service') {
        chooseService(d.record);
        toast.info(`تم فتح الخدمة «${d.record.name || d.record.code}» للتعديل ✏️`);
      } else if (d.id) {
        const found = services.find(s => s.id === d.id);
        if (found) {
          chooseService(found);
          toast.info(`تم فتح الخدمة «${found.name || found.code}» للتعديل ✏️`);
        }
      } else if (d.code) {
        const found = services.find(s => s.code === d.code || s.payload?.receiptNumber === d.code);
        if (found) {
          chooseService(found);
          toast.info(`تم فتح الخدمة «${found.name || found.code}» للتعديل ✏️`);
        }
      }
    };
    window.addEventListener('shako-select-service', onSelectService);
    return () => window.removeEventListener('shako-select-service', onSelectService);
  }, [services]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('shako_pending_service_select');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          if (parsed.record && parsed.record.kind === 'service') {
            chooseService(parsed.record);
            sessionStorage.removeItem('shako_pending_service_select');
            toast.info(`تم فتح الخدمة «${parsed.record.name || parsed.record.code}» للتعديل ✏️`);
          } else if (parsed.id) {
            const found = services.find(s => s.id === parsed.id);
            if (found) {
              chooseService(found);
              sessionStorage.removeItem('shako_pending_service_select');
            }
          }
        }
      }
    } catch {}
  }, [services]);

  function resetForm(nextReceipt?: string) {
    const nextRec = nextReceipt || nextReceiptNumber;
    setSelectedServiceId('');
    setIsCustomService(false);
    setCustomServiceName('');
    isManualReceiptRef.current = false;
    autoReceiptRef.current = nextRec;
    setForm({
      ...newService(defCurr),
      currency: form.currency || defCurr,
      payload: {
        ...newService(defCurr).payload,
        receiptNumber: nextRec,
        commissionAccountId: defaultServiceCommissionAccount?.id || '',
        commissionAccountName: defaultServiceCommissionAccount?.name || ''
      }
    });
  }

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return services;
    return services.filter(s => {
      const vNo = s.payload?.receiptNumber ? String(s.payload.receiptNumber).toLowerCase() : '';
      const matchReceipt = vNo && (`إيصال ${vNo}`.includes(q) || `ايصال ${vNo}`.includes(q) || vNo.includes(q));
      return s.name.toLowerCase().includes(q) ||
        (s.payload?.customerName && s.payload.customerName.toLowerCase().includes(q)) ||
        (s.payload?.supplierName && s.payload.supplierName.toLowerCase().includes(q)) ||
        Boolean(matchReceipt);
    });
  }, [services, serviceSearch]);

  // Calculations for Summary
  const quantityNum = Number(p.quantity || 1);
  const costNum = Number(p.cost || 0);
  const priceNum = Number(p.price || 0);
  const discountNum = Number(p.discount || 0);
  const netAmt = form.amount !== undefined && form.amount !== '' ? Number(form.amount) : Math.max(0, (priceNum * quantityNum) - discountNum);

  const supplierDueVal = costNum * quantityNum;
  const brokerCommVal = p.flags?.Broker ? Number(p.brokerCommission || 0) : 0;
  const incomeVal = Math.max(0, netAmt - supplierDueVal - brokerCommVal);

  const supplierDueMinor = Math.round(supplierDueVal * 100);
  const customerNetMinor = Math.round(netAmt * 100);
  const incomeMinor = Math.round(incomeVal * 100);

  async function save(e: any) {
    if (e?.preventDefault) e.preventDefault();
    if (form.id) {
      handleRequestEdit();
      return;
    }
    await executeSave();
  }

  function handleRequestEdit() {
    if (!p.customerId) {
      toast.error('الرجاء اختيار حساب العميل');
      return;
    }
    const finalServiceName = (isCustomService ? customServiceName : form.name || p.serviceAccountName || '').trim();
    if (!finalServiceName) {
      toast.error('الرجاء اختيار أو كتابة حساب الخدمة');
      return;
    }
    if (p.payment !== 'credit' && !p.treasuryId) {
      toast.error('الرجاء اختيار حساب التحصيل (الخزينة أو البنك)');
      return;
    }
    setConfirmEditOpen(true);
  }

  async function executeSave() {
    if (!p.customerId) {
      toast.error('الرجاء اختيار حساب العميل');
      return;
    }
    const finalServiceName = (isCustomService ? customServiceName : form.name || p.serviceAccountName || '').trim();
    if (!finalServiceName) {
      toast.error('الرجاء اختيار أو كتابة حساب الخدمة');
      return;
    }
    if (p.payment !== 'credit' && !p.treasuryId) {
      toast.error('الرجاء اختيار حساب التحصيل (الخزينة أو البنك)');
      return;
    }

    setBusy(true);
    try {
      const assignedReceipt = (p.receiptNumber ? String(p.receiptNumber).trim() : (!form.id ? nextReceiptNumber : '')).trim();
      const assignedCommId = p.commissionAccountId || defaultServiceCommissionAccount?.id || '';
      const assignedCommName = p.commissionAccountName || (assignedCommId ? accounts.find(a => a.id === assignedCommId)?.name : '') || defaultServiceCommissionAccount?.name || '';
      const rawPayload = {
        ...p,
        receiptNumber: assignedReceipt,
        cost: Number(p.cost || 0),
        price: Number(p.price || 0),
        quantity: Number(p.quantity || 1),
        discount: Number(p.discount || 0),
        exchangeRate: Number(p.exchangeRate || 1),
        brokerCommission: p.flags?.Broker ? Number(p.brokerCommission || 0) : 0,
        customerName: selectedCustomer?.name,
        serviceAccountName: finalServiceName,
        commissionAccountId: assignedCommId,
        commissionAccountName: assignedCommName
      };

      const cleaned = cleanPayload(rawPayload);
      if (!p.flags?.Broker || !cleaned.brokerId) {
        delete cleaned.brokerId;
        cleaned.brokerCommission = 0;
        delete cleaned.brokerName;
      }
      if (cleaned.payment === 'credit' || !cleaned.treasuryId) {
        delete cleaned.treasuryId;
      }
      if (!cleaned.supplierId) {
        delete cleaned.supplierId;
        delete cleaned.supplierName;
      }
      if (!cleaned.commissionAccountId) {
        delete cleaned.commissionAccountId;
        delete cleaned.commissionAccountName;
      }
      if (!cleaned.serviceAccountId) {
        delete cleaned.serviceAccountId;
      }

      const b = {
        id: form.id,
        kind: 'service',
        name: finalServiceName,
        code: form.code || assignedReceipt || undefined,
        date: form.date,
        currency: form.currency,
        amount: Number(form.amount || 0),
        payload: cleaned
      };

      await api('/api/records', {
        method: 'POST',
        body: JSON.stringify(b)
      });

      toast.success(form.id ? `تم حفظ تعديل الخدمة بنجاح · إيصال ${assignedReceipt}` : `تم حفظ الخدمة بنجاح · إيصال ${assignedReceipt}`);

      const nextNum = String(Number(parseInt(assignedReceipt, 10) || 0) + 1).padStart(8, '0');
      resetForm(nextNum);
      load();
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء حفظ الخدمة');
    } finally {
      setBusy(false);
      setConfirmEditOpen(false);
    }
  }

  async function executeDelete() {
    if (!form.id) return;
    setBusy(true);
    try {
      await api('/api/records?id=' + encodeURIComponent(form.id), {
        method: 'DELETE'
      });
      toast.success('تم حذف العملية بنجاح');
      resetForm();
      load();
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'فشل حذف العملية');
    } finally {
      setBusy(false);
      setConfirmDeleteOpen(false);
    }
  }

  return (
    <form className="ticket-form" onSubmit={save} dir="rtl">
      {/* Topline Bar */}
      <div className="ticket-topline">
        <Field label="التاريخ" type="date" value={form.date} onChange={v => set('date', v)} required />
        <label className="flag">
          <Switch checked={!!p.flags?.Group} onCheckedChange={v => setP('flags', { ...p.flags, Group: v })} />
          <b>مجموعة خدمات</b>
        </label>
        <label className="flag">
          <Switch checked={!!p.flags?.Broker} onCheckedChange={v => setP('flags', { ...p.flags, Broker: v })} />
          <b>Broker</b>
        </label>
        <div className="voucher" title="رقم إيصال العملية">
          <span>
            <span>Voucher No</span>
            <input
              aria-label="رقم الإيصال"
              value={p.receiptNumber ?? ''}
              onChange={e => {
                const val = e.target.value;
                isManualReceiptRef.current = val.trim() !== '' && val !== nextReceiptNumber;
                setP('receiptNumber', val);
              }}
              placeholder={nextReceiptNumber}
            />
          </span>
          <b
            style={{ cursor: form.id ? 'pointer' : 'default' }}
            title={form.id ? 'اضغط لإنشاء إيصال خدمة جديد' : 'إيصال جديد'}
            onClick={() => { if (form.id) resetForm(); }}
          >
            {form.id ? 'تعديل' : 'جديد'}
          </b>
        </div>
      </div>

      {/* 3-Column Ticket Grid */}
      <div className="ticket-grid">
        {/* 1. Left Side: Service List & Income/Currency */}
        <aside className="ticket-side">
          <section className="ticket-card">
            <h2 className="lime">الخدمات</h2>
            <input
              className="ticket-search"
              placeholder="بحث بالخدمة أو الإيصال أو العميل"
              aria-label="بحث في الخدمات"
              value={serviceSearch}
              onChange={e => setServiceSearch(e.target.value)}
            />
            <div className="ticket-list" role="list">
              {filteredServices.map(s => (
                <button
                  type="button"
                  key={s.id}
                  className={selectedServiceId === s.id ? 'selected' : ''}
                  onClick={() => chooseService(s)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '4px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    {s.payload?.receiptNumber && (
                      <span style={{ fontSize: '10px', background: '#e7f4ef', color: '#0f766e', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, whiteSpace: 'nowrap' }} title="رقم الإيصال">
                        إيصال {s.payload.receiptNumber}
                      </span>
                    )}
                  </div>
                  <small>{s.payload?.customerName || s.payload?.supplierName || 'عميل'}</small>
                </button>
              ))}
              {!filteredServices.length && <span>لا توجد خدمات</span>}
            </div>
            <div className="ticket-tools">
              <button type="button" className="lime-button" onClick={load} aria-label="تحديث الخدمات">
                <RefreshCw size={17} />
              </button>
              <button
                type="button"
                className="orange-button"
                onClick={() => csv('services', ['الخدمة', 'رقم الإيصال', 'العميل', 'المورد', 'المبلغ', 'العملة'], services.map(s => [s.name, s.payload?.receiptNumber || '—', s.payload?.customerName || '—', s.payload?.supplierName || '—', (s.amount / 100).toFixed(2), s.currency]))}
                aria-label="تصدير الخدمات"
              >
                <Download size={17} />
              </button>
              <button type="button" className="yellow-button" onClick={() => resetForm()} disabled={!canManage} aria-label="خدمة جديدة">
                <Plus size={17} />
              </button>
            </div>
          </section>

          <section className="ticket-card">
            <h2 className="green" style={{ margin: '0 0 10px 0' }}>إيرادات الخدمات / الدخل</h2>
            <Picker
              label="حساب الإيرادات / العمولات"
              value={p.commissionAccountId || defaultServiceCommissionAccount?.id || ''}
              onChange={v => {
                const val = v;
                const acc = commissionAccounts.find(a => a.id === val);
                setP('commissionAccountId', val);
                setP('commissionAccountName', acc?.name || '');
              }}
              options={[{ value: '', label: commissionAccounts.length > 0 ? 'اختر حساب الإيرادات...' : 'لا يوجد حساب إيرادات (أضف حساب إيرادات)' }, ...commissionAccounts.map(a => ({ value: a.id, label: a.name + ' · ' + (a.currency === 'MULTI' ? 'متعدد العملات' : a.currency) }))]}
            />
            <Picker
              label="Currency"
              value={form.currency}
              onChange={v => set('currency', v)}
              options={catalog.filter(c => !settings.enabledCurrencies || settings.enabledCurrencies.includes(c) || form.id && c === form.currency)}
            />
            <Field
              label="سعر الصرف"
              type="number"
              step="any"
              value={p.exchangeRate || 1}
              onChange={v => setP('exchangeRate', Number(v) || 1)}
            />
            <p className="ticket-tip">
              {!customers.length ? 'أضف عميلاً من دليل العملاء قبل تسجيل الخدمة.' : 'تسجيل الخدمات يربط أوتوماتيكياً القيود وكشوف الحسابات.'}
            </p>
          </section>
        </aside>

        {/* 2. Center: Partners, Pricing, Customer & Payment */}
        <div className="ticket-main">
          {/* Top Partner & Service Card */}
          <div className="ticket-partners">
            {/* Card A: Service Details */}
            <section className="ticket-card">
              <Picker
                label="حساب الخدمة"
                color="#a62fca"
                value={isCustomService ? '__custom__' : (p.serviceAccountId || (serviceAccounts.some(a => a.name === form.name) ? (serviceAccounts.find(a => a.name === form.name)?.id || form.name) : (form.name || '')))}
                onChange={v => {
                  if (v === '__custom__') {
                    setIsCustomService(true);
                    setCustomServiceName(form.name || '');
                    setForm((f: any) => ({ ...f, payload: { ...f.payload, serviceAccountId: '' } }));
                  } else if (!v) {
                    setIsCustomService(false);
                    setCustomServiceName('');
                    setForm((f: any) => ({ ...f, name: '', payload: { ...f.payload, serviceAccountId: '', serviceAccountName: '' } }));
                  } else {
                    setIsCustomService(false);
                    setCustomServiceName('');
                    const matched = serviceAccounts.find(a => a.id === v || a.name === v);
                    if (matched) {
                      setForm((f: any) => ({
                        ...f,
                        name: matched.name,
                        payload: {
                          ...f.payload,
                          serviceAccountId: matched.id,
                          serviceAccountName: matched.name
                        }
                      }));
                    } else {
                      setForm((f: any) => ({ ...f, name: v, payload: { ...f.payload, serviceAccountId: '', serviceAccountName: v } }));
                    }
                  }
                }}
                options={[
                  { value: '', label: serviceAccounts.length > 0 ? 'اختر حساب الخدمة...' : 'لا يوجد حساب خدمة (أضف حساب خدمة)' },
                  ...serviceAccounts.map(a => ({
                    value: a.id,
                    label: a.name + (a.currency === 'MULTI' ? ' · متعدد العملات' : ` · ${a.currency}`)
                  })),
                  { value: '__custom__', label: '+ خدمة مخصصة (كتابة يدوية)' }
                ]}
              />
              {isCustomService && (
                <div style={{ marginTop: '8px' }}>
                  <Field
                    label="اسم الخدمة المخصصة"
                    value={customServiceName}
                    onChange={v => {
                      setCustomServiceName(v);
                      setForm((f: any) => ({ ...f, name: v, payload: { ...f.payload, serviceAccountName: v } }));
                    }}
                    placeholder="اكتب اسم الخدمة…"
                    required
                  />
                </div>
              )}
              <Picker
                label="حساب المورد"
                color="#0f766e"
                value={p.supplierId || ''}
                onChange={v => {
                  const sup = supplierOptions.find(s => s.id === v);
                  setP('supplierId', v);
                  setP('supplierName', sup?.name || '');
                }}
                options={[
                  { value: '', label: 'بدون مورد (أو اختر المورد)...' },
                  ...supplierOptions.map(s => {
                    const isAirline = s.payload?.accountType === 'airline';
                    const tag = isAirline ? ' · خط طيران' : ' · مورد';
                    const curr = s.currency === 'MULTI' ? ' · متعدد العملات' : (s.currency ? ` · ${s.currency}` : '');
                    return {
                      value: s.id,
                      label: `${s.name}${tag}${curr}`
                    };
                  })
                ]}
              />
              <div className="paired-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr 1.35fr', gap: '10px' }}>
                <Field
                  label="عدد الخدمات"
                  type="number"
                  min="1"
                  value={p.quantity || 1}
                  onChange={onQuantityChange}
                  required
                />
                <Field
                  label="التكلفة (سعر المورد)"
                  color="#a62fca"
                  type="number"
                  value={p.cost ?? ''}
                  onChange={onCostChange}
                  placeholder="0"
                />
                <Field
                  label="السعر (سعر البيع)"
                  color="#a62fca"
                  type="number"
                  value={p.price ?? ''}
                  onChange={onPriceChange}
                  placeholder="0"
                  required
                />
              </div>
              {p.flags?.Broker && (
                <div className="broker-fields paired-fields">
                  <Picker
                    label="حساب البروكر"
                    value={p.brokerId || ''}
                    onChange={v => {
                      const b = brokerAccounts.find(a => a.id === v);
                      setP('brokerId', v);
                      setP('brokerName', b?.name || '');
                    }}
                    placeholder="اختر حساب البروكر (من دليل العملاء)"
                    options={[
                      { value: '', label: 'اختر حساب البروكر (من دليل العملاء)' },
                      ...brokerAccounts.map(b => ({
                        value: b.id,
                        label: b.label
                      }))
                    ]}
                  />
                  <Field
                    label="عمولة البروكر"
                    type="number"
                    value={p.brokerCommission || 0}
                    onChange={v => setP('brokerCommission', Number(v) || 0)}
                    placeholder="0"
                  />
                </div>
              )}
              <p className="commission-note" dir="rtl">
                تكلفة المورد تحسب (التكلفة × العدد). فارق البيع والتكلفة يسجل كأرباح للمكتب.
                {p.flags?.Broker && ' عمولة البروكر تخصم من ربح المكتب وتضاف لحساب البروكر.'}
              </p>
            </section>

            {/* Card B: Customer & Payment */}
            <section className="ticket-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>حساب العميل</span>
                <button
                  type="button"
                  className="plain-button"
                  onClick={() => { setQuickCustomerName(''); setQuickCustomerModal(true); }}
                  style={{ padding: '2px 8px', fontSize: '11px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  title="إضافة عميل جديد في دليل العملاء مباشرة"
                >
                  <Plus size={13} />
                  <span>+ إضافة عميل</span>
                </button>
              </div>
              <Picker
                label="حساب العميل"
                value={p.customerId || ''}
                onChange={v => setP('customerId', v)}
                options={customerOptions.map(c => ({ value: c.id, label: c.name }))}
                onCreateNew={query => saveQuickCustomer(query)}
                createNewLabel={q => `+ إضافة «${q}» كعميل جديد`}
              />
              <div className="paired-fields">
                <Field
                  label="التخفيض"
                  type="number"
                  value={p.discount ?? ''}
                  onChange={onDiscountChange}
                  placeholder="0"
                />
                <Field
                  label="المبلغ (صافي الفاتورة)"
                  color="#0f766e"
                  type="number"
                  value={form.amount ?? ''}
                  onChange={onAmountChange}
                  placeholder="0.00"
                />
              </div>
              <Picker
                label="طريقة السداد"
                value={p.payment || 'credit'}
                onChange={v => {
                  setP('payment', v);
                  setP('treasuryId', '');
                }}
                options={[
                  { value: 'credit', label: 'آجل' },
                  { value: 'cash', label: 'نقدي' },
                  { value: 'bank', label: 'بنك' }
                ]}
              />
              {p.payment !== 'credit' && (
                <Picker
                  label="حساب التحصيل"
                  value={p.treasuryId || ''}
                  onChange={v => setP('treasuryId', v)}
                  options={[
                    { value: '', label: 'اختر حساب التحصيل…' },
                    ...collectionAccounts
                      .filter(a => (a.currency === 'MULTI' || a.currency === form.currency) && a.kind === (p.payment === 'bank' ? 'bank-account' : 'cash-account'))
                      .map(a => ({ value: a.id, label: a.name + ' · ' + a.currency }))
                  ]}
                />
              )}
            </section>
          </div>

          {/* Notes Card */}
          <section className="ticket-card" style={{ marginTop: '12px' }}>
            <label className="stack-label">
              <span>ملاحظات وبيانات الخدمة</span>
              <textarea
                value={p.notes || ''}
                onChange={e => setP('notes', e.target.value)}
                placeholder="أدخل أي ملاحظات أو تفاصيل خاصة بتنفيذ الخدمة والعميل…"
                rows={2}
              />
            </label>
          </section>
        </div>

        {/* 3. Right Side: Summary & Actions */}
        <aside className="ticket-summary">
          <section className="ticket-card">
            <div className="summary-row">
              <span className="red">سقف الحساب</span>
              <b>{customerCreditLimitFormatted}</b>
            </div>
            <div className="summary-row">
              <span>رصيد العميل</span>
              <b>{customerBalanceFormatted}</b>
            </div>
          </section>

          <section className="ticket-card">
            <div className="summary-row">
              <span className="purple" title="مستحق المورد / التكلفة">Vendor</span>
              <b aria-label="صافي حساب المورد" dir="ltr">{money(supplierDueMinor)}</b>
            </div>
            <div className="summary-row">
              <span title="إجمالي حساب العميل">Customer</span>
              <b aria-label="إجمالي حساب العميل" dir="ltr">{money(customerNetMinor)}</b>
            </div>
            <div className="summary-row">
              <span className="orange" title="صافي ربح الخدمة">Income</span>
              <b aria-label="صافي ربح الخدمة" dir="ltr">{money(incomeMinor)}</b>
            </div>
            <div className="ticket-save" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '6px' }}>
              {!form.id && (
                <button
                  type="submit"
                  className="blue-button"
                  style={{ width: '100%' }}
                  disabled={busy || !canManage || !p.customerId}
                  title="حفظ العملية الجديدة في النظام"
                >
                  {busy ? 'جارٍ الحفظ…' : 'حفظ العملية (جديد)'}
                </button>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
                <button
                  type="button"
                  disabled={!form.id || busy || !canManage}
                  onClick={handleRequestEdit}
                  style={{
                    background: form.id ? '#2563eb' : '#f1f5f9',
                    color: form.id ? '#ffffff' : '#94a3b8',
                    border: form.id ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                    cursor: form.id ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    opacity: form.id ? 1 : 0.6,
                    minHeight: '38px',
                    transition: 'all 0.15s ease'
                  }}
                  title={form.id ? 'تعديل وحفظ بيانات العملية المحددة' : 'يتفعل فقط عند اختيار عملية مسجلة للتعديل'}
                >
                  <Pencil size={15} />
                  <span>تعديل</span>
                </button>

                <button
                  type="button"
                  disabled={!form.id || busy || !canManage}
                  onClick={() => setConfirmDeleteOpen(true)}
                  style={{
                    background: form.id ? '#dc2626' : '#f1f5f9',
                    color: form.id ? '#ffffff' : '#94a3b8',
                    border: form.id ? '1px solid #b91c1c' : '1px solid #cbd5e1',
                    cursor: form.id ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    opacity: form.id ? 1 : 0.6,
                    minHeight: '38px',
                    transition: 'all 0.15s ease'
                  }}
                  title={form.id ? 'حذف هذه العملية نهائياً من النظام' : 'يتفعل فقط عند اختيار عملية مسجلة للحذف'}
                >
                  <Trash2 size={15} />
                  <span>حذف</span>
                </button>
              </div>

              <button
                type="button"
                className="gray-button"
                style={{ width: '100%', padding: '7px 8px' }}
                onClick={() => resetForm()}
                title="تفريغ الحقول والبدء بعملية جديدة"
              >
                تفريغ الحقول (جديد)
              </button>
            </div>
          </section>
        </aside>
      </div>
      <Dialog open={quickCustomerModal} onOpenChange={setQuickCustomerModal}>
        <DialogContent dir="rtl" style={{ maxWidth: '450px', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Users size={20} color="#0f766e" />
            <DialogTitle style={{ fontSize: '16px', fontWeight: 700, color: '#0f766e', margin: 0 }}>
              إضافة عميل جديد لدليل العملاء
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
            سيتم تسجيل العميل في دليل العملاء تحت تحكمك الكامل، وربطه بالخدمة وجميع العمليات وكشوف الحساب.
          </DialogDescription>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Field
              label="اسم العميل *"
              value={quickCustomerName}
              onChange={setQuickCustomerName}
              placeholder="مثال: أحمد عبد الله أو اسم الشركة"
              required
            />
            <Picker
              label="العملة الأساسية للحساب"
              value={quickCustomerCurrency}
              onChange={setQuickCustomerCurrency}
              options={[{ value: 'MULTI', label: 'متعدد العملات (موصى به)' }, ...catalog.map(c => ({ value: c, label: c }))]}
            />
            <Field
              label="رقم الهاتف (اختياري)"
              value={quickCustomerPhone}
              onChange={setQuickCustomerPhone}
              placeholder="مثال: 0912345678"
            />
            <Field
              label="البريد الإلكتروني (اختياري)"
              type="text"
              value={quickCustomerEmail}
              onChange={setQuickCustomerEmail}
              placeholder="example@email.com"
            />
            <Field
              label="العنوان (اختياري)"
              value={quickCustomerAddress}
              onChange={setQuickCustomerAddress}
              placeholder="المدينة، العنوان أو الحي"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button type="button" className="gray-button" onClick={() => setQuickCustomerModal(false)}>إلغاء</button>
              <button
                type="button"
                className="blue-button"
                onClick={() => saveQuickCustomer()}
                disabled={quickCustomerSaving || !quickCustomerName.trim()}
              >
                {quickCustomerSaving ? 'جارٍ الحفظ…' : 'حفظ وتحديد في الخدمة'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={quickServiceModal} onOpenChange={setQuickServiceModal}>
        <DialogContent dir="rtl" style={{ maxWidth: '450px', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Sparkles size={20} color="#0f766e" />
            <DialogTitle style={{ fontSize: '16px', fontWeight: 700, color: '#0f766e', margin: 0 }}>
              إضافة حساب خدمة جديد لدليل الحسابات
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
            سيتم إضافة حساب الخدمة كبند مستقل في الدليل لتنظيم حسابات خدمات التأشيرات والفنادق والرحلات وربطها بالعمليات بسهولة.
          </DialogDescription>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Field
              label="اسم حساب الخدمة *"
              value={quickServiceName}
              onChange={setQuickServiceName}
              placeholder="مثال: حجز فنادق / تأشيرات سياحية / برامج سياحية"
              required
            />
            <Picker
              label="العملة الأساسية للحساب"
              value={quickServiceCurrency}
              onChange={setQuickServiceCurrency}
              options={[{ value: 'MULTI', label: 'متعدد العملات (موصى به)' }, ...catalog.map(c => ({ value: c, label: c }))]}
            />
            <Field
              label="ملاحظات (اختياري)"
              value={quickServiceNotes}
              onChange={setQuickServiceNotes}
              placeholder="ملاحظات حول الحساب أو الغرض منه"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button type="button" className="gray-button" onClick={() => setQuickServiceModal(false)}>إلغاء</button>
              <button
                type="button"
                className="blue-button"
                onClick={() => handleSaveQuickService()}
                disabled={quickServiceSaving || !quickServiceName.trim()}
              >
                {quickServiceSaving ? 'جارٍ الحفظ…' : 'حفظ وتحديد في الخدمة'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={quickRevenueModal} onOpenChange={setQuickRevenueModal}>
        <DialogContent dir="rtl" style={{ maxWidth: '450px', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Sparkles size={20} color="#047857" />
            <DialogTitle style={{ fontSize: '16px', fontWeight: 700, color: '#047857', margin: 0 }}>
              إضافة حساب إيرادات جديد لدليل الحسابات
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
            سيتم إضافة حساب الإيرادات لتسجيل عوائد وأرباح الخدمات وتوزيع القيود المحاسبية.
          </DialogDescription>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Field
              label="اسم حساب الإيراد / العمولة *"
              value={quickRevenueName}
              onChange={setQuickRevenueName}
              placeholder="مثال: إيرادات الخدمات / عمولات التأشيرات / أرباح متنوعة"
              required
            />
            <Picker
              label="العملة الأساسية للحساب"
              value={quickRevenueCurrency}
              onChange={setQuickRevenueCurrency}
              options={[{ value: 'MULTI', label: 'متعدد العملات (موصى به)' }, ...catalog.map(c => ({ value: c, label: c }))]}
            />
            <Field
              label="ملاحظات (اختياري)"
              value={quickRevenueNotes}
              onChange={setQuickRevenueNotes}
              placeholder="ملاحظات حول الحساب أو الغرض منه"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button type="button" className="gray-button" onClick={() => setQuickRevenueModal(false)}>إلغاء</button>
              <button
                type="button"
                className="blue-button"
                onClick={() => handleSaveQuickRevenue()}
                disabled={quickRevenueSaving || !quickRevenueName.trim()}
              >
                {quickRevenueSaving ? 'جارٍ الحفظ…' : 'حفظ وتحديد كإيراد'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmEditOpen} onOpenChange={setConfirmEditOpen}>
        <AlertDialogContent dir="rtl" style={{ maxWidth: '440px', borderRadius: '12px', padding: '22px' }}>
          <AlertDialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pencil size={18} color="#2563eb" />
            <span>تأكيد تعديل العملية</span>
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginTop: '8px' }}>
            هل أنت متأكد من حفظ التعديلات على هذه العملية ({p.receiptNumber ? `إيصال رقم ${p.receiptNumber}` : (form.code || form.name)})؟
            <br />
            سيتم تحديث بيانات العملية وجميع القيود المحاسبية المرتبطة بها في كشف الحساب.
          </AlertDialogDescription>
          <AlertDialogFooter style={{ display: 'flex', gap: '10px', marginTop: '18px', justifyContent: 'flex-start' }}>
            <AlertDialogAction
              onClick={executeSave}
              disabled={busy}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {busy ? 'جارٍ الحفظ…' : 'نعم، حفظ التعديل'}
            </AlertDialogAction>
            <AlertDialogCancel
              disabled={busy}
              onClick={() => setConfirmEditOpen(false)}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent dir="rtl" style={{ maxWidth: '440px', borderRadius: '12px', padding: '22px' }}>
          <AlertDialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={18} color="#dc2626" />
            <span>تأكيد حذف العملية</span>
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginTop: '8px' }}>
            هل أنت متأكد من رغبتك في حذف هذه العملية ({p.receiptNumber ? `إيصال رقم ${p.receiptNumber}` : (form.code || form.name)}) نهائياً؟
            <br />
            <strong>تنبيه:</strong> سيتم حذف العملية وتسوياتها وحركاتها المرتبطة بالكامل من كشوف الحسابات ولا يمكن التراجع عن هذه الخطوة.
          </AlertDialogDescription>
          <AlertDialogFooter style={{ display: 'flex', gap: '10px', marginTop: '18px', justifyContent: 'flex-start' }}>
            <AlertDialogAction
              onClick={executeDelete}
              disabled={busy}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {busy ? 'جارٍ الحذف…' : 'نعم، تأكيد الحذف'}
            </AlertDialogAction>
            <AlertDialogCancel
              disabled={busy}
              onClick={() => setConfirmDeleteOpen(false)}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function financialRows(rows:RecordRow[],currency:string,date:string){return rows.filter(r=>r.payload.status!=='voided'&&r.currency===currency&&r.date<=date&&(!r.payload.status||r.payload.status==='active'))}
function useReportCurrencies(rows:RecordRow[],refreshKey:string){
 const [catalog,setCatalog]=useState<{code:string;name:string}[]>([]);
 useEffect(()=>{let current=true;api('/api/currencies').then(value=>{if(current)setCatalog(value)}).catch(()=>{if(current)setCatalog([])});return()=>{current=false}},[refreshKey]);
 const codes=[...new Set([...currencies,...catalog.map(c=>c.code),...rows.flatMap(r=>[r.currency,r.payload.customerCurrency]).filter(Boolean)])];
 return codes.map(code=>({value:code,label:(catalog.find(c=>c.code===code)?.name||code)+(catalog.find(c=>c.code===code)?.name?' · '+code:'')}));
}
export function Dashboard({settings}:{settings:Settings}){
 const refreshKey=JSON.stringify([settings.modules,settings.enabledCurrencies]),{rows,loading,error,load}=useRows('all',refreshKey),[currency,setCurrency]=useState('all'),[date,setDate]=useState(today());
 const catalog=useReportCurrencies(rows,refreshKey),options=catalog.filter(o=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(o.value)),selected=currency==='all'?options:options.filter(o=>o.value===currency);useEffect(()=>{if(currency!=='all'&&!options.some(o=>o.value===currency))setCurrency('all')},[currency,settings.enabledCurrencies]);
 return <div className="dashboard" dir="rtl"><div className="toolbar"><Field label="الأرصدة حتى تاريخ" type="date" value={date} onChange={setDate}/><Picker label="العملة" value={currency} onChange={setCurrency} options={[{value:'all',label:'كل العملات'},...options]}/><button className="search-button" onClick={load} aria-label="بحث"><Search size={20}/></button></div>{error?<Empty loading={loading} error={error} load={load}/>:selected.map(o=><section key={o.value} className="dashboard-currency-section" aria-label={'الأرصدة '+o.value}><h2 className="dashboard-currency-heading">{o.label}</h2><CurrencyDashboard rows={rows} date={date} currency={o.value} settings={settings}/></section>)}<p className="field-note">{loading?'جارٍ التحديث…':'الأرصدة معروضة لكل عملة بصورة مستقلة. الأقسام الموقوفة لا تدخل في هذا العرض.'}</p></div>
}
function CurrencyDashboard({rows,date,currency,settings}:{rows:RecordRow[];date:string;currency:string;settings:Settings}){
 const filtered=financialRows(rows,currency,date);const totals=(kind:string)=>filtered.filter(r=>r.kind===kind).reduce((s,r)=>s+r.amount,0);const sales=totals('ticket')+totals('service')+totals('visa');const expenses=Math.abs(totals('expense'));const ticketCommissions=filtered.filter(r=>r.kind==='ticket').reduce((s,r)=>s+(r.payload.incomeMinor||0),0);const profit=ticketCommissions+totals('service')+totals('visa')-expenses;
 const projected=accountBalances(rows,date,settings.modules).filter(r=>r.currency===currency);
 const supplierIds=new Set([
  ...filtered.filter(r=>r.kind==='ticket').map(r=>r.payload.supplierId||'supplier:'+ticketSupplierName(r.payload)),
  ...rows.filter(r=>['airline','supplier'].includes(r.payload?.accountType)).map(r=>r.id)
 ]);
 const customerBalances=projected.filter(r=>r.kind==='customer' && !supplierIds.has(r.accountId)).map(r=>({id:r.accountId,name:r.name,amount:r.balanceMinor}));
 const supplierBalances=projected.filter(r=>supplierIds.has(r.accountId)).map(r=>({id:r.accountId,name:r.name,amount:-r.balanceMinor}));
 function panel(title:string,color:string,list:{id:string;name:string;amount:number}[],total:number){return <section className="dashboard-panel" key={title} style={{'--panel-color':color} as any}><h2>{title}</h2><Table><TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>المبلغ</TableHead></TableRow></TableHeader><TableBody>{list.slice(0,6).map(r=><TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell dir="ltr">{money(r.amount)}</TableCell></TableRow>)}</TableBody></Table>{!list.length&&<div className="dashboard-empty">لا توجد بيانات</div>}<div className="panel-total"><span>المجموع</span><b>{money(total)}</b></div></section>}
 return <div><div className="chart-panels">{[{title:'النقد المتاح والأرصدة',color:'#0f766e',numbers:[totals('cash'),totals('bank')],labels:['رصيد النقد','رصيد البنوك'],colors:['#b4535b','#427ca1']},{title:'المبيعات والمصروفات',color:'#b4535b',numbers:[sales,expenses],labels:['إجمالي المبيعات','المصروفات'],colors:['#c18537','#6b8c76']},{title:'الأرباح والخسائر',color:'#427ca1',numbers:[Math.max(profit,0),Math.max(-profit,0)],labels:['الأرباح','الخسائر'],colors:['#0f766e','#b4535b']}].map(c=>{const sum=c.numbers.reduce((a,b)=>a+Math.abs(b),0);const pct=sum?Math.abs(c.numbers[0])/sum*100:0;return <section className="chart-panel" key={c.title}><h2 style={{background:c.color}}>{c.title}</h2><div className="chart-content"><div className="pie" aria-label={c.title} style={{background:sum?`conic-gradient(${c.colors[0]} 0% ${pct}%,${c.colors[1]} ${pct}% 100%)`:'#e6e8ed'}}>{!sum&&<span>0.00</span>}</div><div className="chart-legend">{c.labels.map((l,i)=><div key={l} style={{color:c.colors[i]}}><span>{l}</span><b dir="ltr">{money(c.numbers[i])}</b></div>)}</div></div></section>})}</div><div className="dashboard-tables">{panel('الحركات النقدية','#427ca1',filtered.filter(r=>r.kind==='cash'),totals('cash'))}{panel('عمولات ودخل التذاكر ('+currency+')','#059669',filtered.filter(r=>r.kind==='ticket'&&r.payload.incomeMinor).map(r=>({id:r.id,name:(r.name||'تذكرة')+' ('+r.code+')',amount:r.payload.incomeMinor||0})),ticketCommissions)}{panel('المصروفات','#9b5961',filtered.filter(r=>r.kind==='expense'),totals('expense'))}{panel('أرصدة العملاء','#7c6ba3',customerBalances,customerBalances.reduce((sum,r)=>sum+r.amount,0))}{panel('أرصدة الخطوط والموردين','#0f766e',supplierBalances,supplierBalances.reduce((sum,r)=>sum+r.amount,0))}{panel('أرصدة البنوك','#376289',filtered.filter(r=>r.kind==='bank'),totals('bank'))}{panel('الخدمات','#a87932',filtered.filter(r=>r.kind==='service'),totals('service'))}{panel('التأشيرات','#6b8c76',filtered.filter(r=>r.kind==='visa'),totals('visa'))}{panel('الحسابات','#9b5961',accountBalances(rows,date,settings.modules).filter(r=>r.kind==='account'&&r.currency===currency).map(r=>({id:r.accountId,name:r.name,amount:r.balanceMinor})),accountBalances(rows,date,settings.modules).filter(r=>r.kind==='account'&&r.currency===currency).reduce((s,r)=>s+r.balanceMinor,0))}</div></div>
}
export function BalanceReport({report,settings}:{report:string;settings:Settings}){
 const {rows,loading,error,load}=useRows('all',JSON.stringify(settings.modules)),[currency,setCurrency]=useState('all'),[date,setDate]=useState(today()),[query,setQuery]=useState('');
 const currencyOptions=useReportCurrencies(rows,JSON.stringify(settings.modules));const currencyCodes=currencyOptions.map(o=>o.value);
 const filtered=rows.filter(r=>r.payload.status!=='voided'&&r.date<=date&&(currency==='all'||r.currency===currency)&&(!r.payload.status||r.payload.status==='active'));
 const data=accountBalances(rows,date,settings.modules).filter(r=>(currency==='all'||r.currency===currency)&&(report==='all'||report==='customer'&&(r.kind==='customer'&&!rows.some(x=>x.id===r.accountId&&['airline','supplier'].includes(x.payload?.accountType)))||report==='airline'&&(r.kind==='supplier'||rows.some(t=>t.kind==='ticket'&&t.payload.supplierId===r.accountId)||rows.some(x=>x.id===r.accountId&&['airline','supplier'].includes(x.payload?.accountType)))||report==='bank'&&r.kind==='bank-account'||report==='cash'&&r.kind==='cash-account'||report==='expense'&&r.kind==='expense'||report==='account'&&r.kind==='account')).map(r=>({name:r.name,currency:r.currency,charges:r.debitMinor,paid:r.creditMinor,balance:r.balanceMinor}));
 const visible=data.filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));const title=report==='customer'?'إجمالي أرصدة العملاء':report==='airline'?'إجمالي أرصدة الخطوط':report==='bank'?'إجمالي أرصدة البنوك':report==='cash'?'إجمالي أرصدة النقد':report==='expense'?'إجمالي أرصدة المصروفات':'التقرير الإداري';
 return <div className="report-view" dir="rtl"><div className="toolbar"><Field label="الأرصدة حتى تاريخ" type="date" value={date} onChange={setDate}/><Picker label="العملة" value={currency} onChange={setCurrency} options={[{value:'all',label:'كل العملات'},...currencyOptions]}/><div className="search-input"><Search size={18}/><input aria-label="بحث في التقرير" placeholder="بحث بالحساب" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="search-button" onClick={load} aria-label="تحديث التقرير"><Search size={20}/></button></div><div className="report-toolbar"><button onClick={()=>permittedExport(()=>window.print())}><Printer size={17}/> طباعة / PDF</button><button onClick={()=>csv(title,['الحساب','العملة','مدين','دائن','الرصيد'],visible.map(r=>[r.name,r.currency,r.charges/100,r.paid/100,r.balance/100]))}><Download size={17}/> تصدير CSV</button><ReportExports/><span>{visible.length} حساب</span></div><div className="report-canvas"><article className="report-paper"><AgencyLetterhead/><h1>{title}</h1><div className="report-meta"><span>حتى تاريخ: <b dir="ltr">{date}</b></span><span>العملة: {currency==='all'?'كل العملات (مفصولة بالعملة)':currency}</span></div>{currencyCodes.filter(c=>visible.some(r=>r.currency===c)).map(c=>{const curRows=visible.filter(r=>r.currency===c);const curTotal=curRows.reduce((s,r)=>s+r.balance,0);return <section key={c} className="report-currency-section" style={{marginBottom:'24px'}}><h2 style={{fontSize:'16px',fontWeight:'bold',color:'#0f766e',marginBottom:'8px'}}>العملة: {c}</h2><Table><TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>مدين</TableHead><TableHead>دائن</TableHead><TableHead>الرصيد</TableHead></TableRow></TableHeader><TableBody>{curRows.map((r,i)=><TableRow key={i}><TableCell>{r.name}</TableCell><TableCell dir="ltr">{money(r.charges)}</TableCell><TableCell dir="ltr">{money(r.paid)}</TableCell><TableCell dir="ltr">{money(r.balance)}</TableCell></TableRow>)}</TableBody></Table><div className="report-totals" style={{marginTop:'8px',marginBottom:'16px'}}><p>الإجمالي {c} : <b dir="ltr">{money(curTotal)}</b></p></div></section>})}{!visible.length&&<Empty loading={loading} error={error} load={load}/>}{Object.values(settings.modules).some(enabled=>!enabled)&&<p className="field-note">تقرير جزئي: الأقسام الموقوفة غير مشمولة في الأرقام المعروضة.</p>}<p className="report-footnote">{report==='airline'?'الموجب مدين والسالب دائن؛ صافي مستحق المورد والبروكر يُخفض عند سداد حسابه المرتبط.':'المبالغ معروضة لكل عملة بصورة مستقلة.'}</p><AgencyReportFooter/></article></div></div>
}

export {InvoiceEntry} from '@/components/invoice-entry';



