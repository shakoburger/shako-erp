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
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {bankTitles,bankTypeLabel,bankMenu,bankIcon,issuedChequeMenu} from '@/lib/banks';
import {money,today,moduleEnabled,type Settings,type RecordRow} from '@/lib/domain';
import {CashField,CashSelect} from './cash-workspace';
import {api,download} from './erp-system';
import {StagedOperationsStrip} from '@/components/staged-operations-strip';
import {BankReconciliationWorkspace} from './bank-reconciliation';
export type BankData={accounts:RecordRow[];archivedAccounts?:RecordRow[];currencies:{code:string;name:string;rate:number;active?:boolean}[];counterparties:{id:string;kind:string;name:string;currency:string;payload?:any}[];vouchers:RecordRow[];ledger:RecordRow[];nextNumber:string};
export function useBanks(){const [data,setData]=useState<BankData>({accounts:[],currencies:[],counterparties:[],vouchers:[],ledger:[],nextNumber:'—'}),[error,setError]=useState(''),[loading,setLoading]=useState(true);const load=useCallback(async()=>{try{setData(await api('/api/banks'));setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}},[]);const w=useWorkspaceWindow(),access=useAgencyAccess(),canManage=access.modules.banks==='manage';useEffect(()=>{if(w.active)load()},[load,w.active,w.refreshKey]);return {data,error,loading,load}}
export function BankTitle({mode,onClose,onRefresh}:{mode:string;onClose:()=>void;onRefresh:()=>void}){return <div className="window-title"><span className="page-title"><ERPIcon name="banks" size={21}/>{bankTitles[mode]}</span><WindowControls refresh={onRefresh} close={onClose}/></div>}
export function BackgroundMenu({mode}:{mode:string}){const type=mode.replace(/^(edit|print)-/,'');const items=type==='account'?bankMenu:[[bankIcon(type),type==='deposit'?'إيداع بنكي جديد':bankTypeLabel(type)],['cash-edit',bankTitles['edit-'+type]],['cash-voucher',bankTitles['print-'+type]]];return <section className="menu-panel cash-background" aria-hidden="true" dir="rtl"><h1 className="ribbon">القائمة ‹ البنوك{type!=='account'&&' ‹ '+bankTypeLabel(type)}</h1><div className="icon-menu">{items.map(([icon,label])=><div className="menu-item" key={label}><ERPIcon name={icon} size={26}/><span>{label}</span></div>)}<div className="menu-item"><ERPIcon name="back" size={26}/><span>القائمة السابقة</span></div></div></section>}
const newAccount=()=>({name:'',currency:'MULTI',rate:1,parentId:'',accountNumber:'',address:'',phone:'',email:''});
const newForm=(type:string)=>({type,date:today(),treasuryId:'',counterpartyId:'',person:'',amount:'',notes:'',conversionRate:1,transactionCurrency:'',treasuryCurrency:'',crossCurrency:false,settlementCurrency:'SDG',settlementTreasuryId:'',settlementAmount:'',coveredCurrency:'USD',coveredAmount:'',chequeNumber:'',chequeDate:today(),chequeStatus:'pending',clearedDate:today()});
export function BankWorkspace(props:{mode:string;settings:Settings;onClose:()=>void;initialStagedOp?:any;onStagedConsumed?:()=>void}){if(props.mode==='reconciliation')return <BankReconciliationWorkspace {...props}/>;return /^(edit-)?cheque-(direct|deferred)$|^pass-cheque-issue$/.test(props.mode)?<IssuedChequeWorkspace {...props}/>:<GeneralBankWorkspace {...props}/>}
function GeneralBankWorkspace({mode,settings,onClose,initialStagedOp,onStagedConsumed}:{mode:string;settings:Settings;onClose:()=>void;initialStagedOp?:any;onStagedConsumed?:()=>void}){
 const w=useWorkspaceWindow(),access=useAgencyAccess(),canManage=access.modules.banks==='manage';
 const {data,error,loading,load}=useBanks(),type=mode.replace(/^(edit|print)-/,''),catalog=type==='account',editing=mode.startsWith('edit-'),transfer=type==='transfer',cheque=type.startsWith('cheque-'),incoming=type==='deposit'||type==='cheque-receive';
 const [form,setForm]=useState<any>(catalog?newAccount():newForm(type)),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const [accountToDelete,setAccountToDelete]=useState<any>(null),[accountConfirm,setAccountConfirm]=useState(false),[showArchived,setShowArchived]=useState(false);
 async function removeAccount(acc?:any){
  const target=acc||form;if(!target?.id)return;setBusy(true);
  try{
   const res:any=await api('/api/banks',{method:'DELETE',body:JSON.stringify({action:'account',id:target.id,updatedAt:target.updatedAt})});
   toast.success(res?.mode==='archived'?'تم حذف وأرشفة حساب البنك من القوائم النشطة':'تم حذف حساب البنك نهائياً');
   setAccountConfirm(false);setAccountToDelete(null);clear();await load();
  }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 async function restoreAccount(acc:any){
  const target=acc||form;if(!target?.id)return;setBusy(true);
  try{
   await api('/api/banks',{method:'DELETE',body:JSON.stringify({action:'account',id:target.id,updatedAt:target.updatedAt,restore:true})});
   toast.success(`تم استعادة الحساب «${target.name}» بنجاح`);
   await load();
  }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{if(initialStagedOp){onSelectStaged(initialStagedOp);onStagedConsumed?.();}},[initialStagedOp,data.accounts,data.counterparties]);
 useEffect(()=>{
  const onStaged=(e:any)=>{
   if(e.detail&&(e.detail.payload?.type?.startsWith('bank-')||!e.detail.payload?.type?.startsWith('ticket-'))){
    onSelectStaged(e.detail);
   }
  };
  window.addEventListener('shako-staged-select',onStaged);
  return()=>window.removeEventListener('shako-staged-select',onStaged);
 },[data.accounts,data.counterparties]);
 useEffect(()=>{
  try{
   const saved=sessionStorage.getItem('shako_pending_staged_op');
   if(saved){
    const parsed=JSON.parse(saved);
    if(parsed&&parsed.payload?.type?.startsWith('bank-')){
     onSelectStaged(parsed);
     sessionStorage.removeItem('shako_pending_staged_op');
    }
   }
  }catch{}
 },[data.accounts,data.counterparties]);
 const set=(key:string,v:any)=>setForm((f:any)=>({...f,[key]:v})),treasury=data.accounts.find(a=>a.id===form.treasuryId),destination=data.accounts.find(a=>a.id===form.counterpartyId),counterpart=data.counterparties.find(a=>a.id===form.counterpartyId);
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
 const isBankCounterpartyAllowed=(a:any)=>{
  if(a.kind==='bank-account')return false;
  return ['customer','cash-account','expense','account','employee'].includes(a.kind);
 };
 const counterpartCurrency=counterpart?.currency==='MULTI'||counterpart?.kind==='customer'?(form.transactionCurrency||'USD'):counterpart?.currency||'USD';
 const bankAccounts=data.accounts.filter(a=>a.kind==='bank-account');
 const eligibleBankAccounts=bankAccounts.filter(a=>a.currency===(form.settlementCurrency||'SDG')||a.currency==='MULTI');
 const settlementTreasuryOptions=eligibleBankAccounts.length>0?eligibleBankAccounts.map(a=>({value:a.id,label:a.name+' · بنك · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)})):[{value:'',label:`⚠️ لا يوجد حساب بنك بعملة ${form.settlementCurrency||'SDG'} أو متعدد العملات`}];
 const selectedSettlementTreasury=bankAccounts.find(a=>a.id===form.settlementTreasuryId);
 const bankCounterOptions=data.counterparties.filter(isBankCounterpartyAllowed).filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.kind==='customer'||a.currency==='MULTI').filter(a=>a.id!==form.treasuryId&&(form.crossCurrency||!treasury||treasury.currency==='MULTI'||a.kind==='customer'||a.currency==='MULTI'||a.currency===treasury.currency)&&(!cheque||!['cash-account','bank-account'].includes(a.kind)));
 const bankAccountsOptions=data.accounts.filter(a=>a.kind==='bank-account').filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.currency==='MULTI').filter(a=>!counterpart||counterpart.kind==='customer'||counterpart.currency==='MULTI'||a.currency==='MULTI'||a.currency===counterpart.currency);
 const currencyName=(code:string)=>code==='MULTI'?'متعدد العملات':data.currencies.find(c=>c.code===code)?.name||code;
 function chooseCounter(id:string){const a=data.counterparties.find(x=>x.id===id);setForm((f:any)=>({...f,counterpartyId:id,transactionCurrency:a?.kind==='customer'||a?.currency==='MULTI'?(treasury?.currency==='MULTI'?(f.treasuryCurrency||'USD'):treasury?.currency||f.transactionCurrency||'USD'):(a?.currency||''),conversionRate:a?.currency===treasury?.currency||a?.kind==='customer'||a?.currency==='MULTI'||treasury?.currency==='MULTI'?1:''}))}
 const personLabel=transfer?'حوّل بواسطة':type==='deposit'?'أودع بواسطة':type==='withdraw'?'استلم بواسطة':cheque&&incoming?'استلام من':'المستفيد';
 const amountLabel=transfer?'المبلغ المحوّل':cheque?'قيمة الشيك':incoming?'المبلغ المودع':'المبلغ المسحوب';
 const noteLabel='البيان *';
 function clear(){setForm(catalog?newAccount():newForm(type));setSearch('')}
 function chooseBank(id:string){const a=data.accounts.find(x=>x.id===id),counter=data.counterparties.find(x=>x.id===form.counterpartyId);const keep=counter&&counter.id!==id&&(counter.kind==='customer'||counter.currency==='MULTI'||counter.currency===a?.currency||a?.currency==='MULTI');setForm((f:any)=>({...f,treasuryId:id,counterpartyId:keep?counter.id:'',transactionCurrency:keep?(counter.kind==='customer'||counter.currency==='MULTI'?(a?.currency==='MULTI'?'USD':a?.currency||'USD'):counter.currency):a?.currency||'',conversionRate:keep&&counter.currency!==a?.currency&&counter.kind!=='customer'&&counter.currency!=='MULTI'&&a?.currency!=='MULTI'?'':1}))}
 function onSelectStaged(op:any){
  const p=op.payload||{};
  const counterSearch = (p.counterpartyName || p.customerName || p.person || op.name || '').trim().toLowerCase();
  const matchedBank=data.accounts.find(a=>a.id===p.treasuryId||a.name===p.treasuryName);
  const matchedCounter=data.counterparties.find(a=>a.id===p.counterpartyId||a.id===p.customerId||(counterSearch&&(a.name.trim().toLowerCase()===counterSearch||a.name.trim().toLowerCase().includes(counterSearch)||counterSearch.includes(a.name.trim().toLowerCase()))));
  const amt=op.amount?op.amount/100:(p.sellingPrice||p.fare||'');
  setForm((f:any)=>({
   ...f,
   _stagedId:op.id,
   _attachment:p.attachment||null,
   date:op.date||f.date,
   treasuryId:matchedBank?.id||f.treasuryId,
   counterpartyId:matchedCounter?.id||f.counterpartyId,
   amount:amt||f.amount,
   person:p.person||op.name||f.person,
   notes:p.notes||('عملية معلقة: '+(op.name||op.code)),
   crossCurrency:!!p.crossCurrency,
   settlementCurrency:p.settlementCurrency||p.currency||'SDG',
   settlementTreasuryId:p.settlementTreasuryId||p.treasuryId||'',
   coveredCurrency:p.coveredCurrency||'USD',
   coveredAmount:p.coveredAmount?p.coveredAmount/100:(p.coveredAmount||''),
   conversionRate:p.conversionRate||1,
   transactionCurrency:op.currency||f.transactionCurrency,
   treasuryCurrency:op.currency||f.treasuryCurrency,
   chequeNumber:p.chequeNumber||op.code||f.chequeNumber
  }));
  toast.info('تم إنزال بيانات العملية المعلقة في نموذج البنك: '+(op.name||op.code));
 }
 async function find(explicitCode?: string){
  const target = (explicitCode || search).trim();
  const fresh:BankData=await api('/api/banks');
  const row=fresh.vouchers.find(v=>(v.code===target.padStart(8,'0')||v.id===target||v.payload?.receiptNumber===target)&&(!type||v.payload.type===type));
  if(!row){toast.error('رقم الإيصال غير موجود لهذا النوع');return}
  if(row.payload.status!=='active'){toast.error('هذا الإيصال محذوف');return}
  loadVoucherRow(row);
  load();
 }
 function loadVoucherRow(row:any){
  const p=row.payload||{};
  setSearch(row.code||'');
  setForm({...newForm(type),id:row.id,updatedAt:row.updatedAt,type:p.type||type,date:row.date,treasuryId:p.treasuryId,counterpartyId:p.counterpartyId,person:p.person,amount:(transfer?p.treasuryMinor:p.transactionMinor)/100,notes:p.notes,conversionRate:p.rate,transactionCurrency:p.transactionCurrency,treasuryCurrency:p.treasuryCurrency,crossCurrency:!!p.crossCurrency,settlementCurrency:p.crossCurrency?p.treasuryCurrency:'SDG',settlementTreasuryId:p.crossCurrency?p.treasuryId:'',settlementAmount:p.crossCurrency?p.treasuryMinor/100:'',coveredCurrency:p.coveredCurrency||p.transactionCurrency||'USD',coveredAmount:p.crossCurrency?(p.coveredAmount?p.coveredAmount/100:p.transactionMinor/100):'',chequeNumber:p.chequeNumber||'',chequeDate:p.chequeDate||today(),chequeStatus:p.chequeStatus||'pending',clearedDate:p.clearedDate||today()});
 }
 useEffect(()=>{
  const onSelect=(e:any)=>{
   if(!e.detail)return;
   const d=e.detail;
   if(d.record&&d.record.payload){
    loadVoucherRow(d.record);
    toast.info(`تم فتح الإيصال البنكي «${d.record.code||d.id}» للتعديل ✏️`);
   }else if(d.code||d.id){
    find(d.code||d.id).catch(()=>{});
   }
  };
  window.addEventListener('shako-select-bank-voucher',onSelect);
  return()=>window.removeEventListener('shako-select-bank-voucher',onSelect);
 },[type]);
 useEffect(()=>{
  try{
   const saved=sessionStorage.getItem('shako_pending_bank_select');
   if(saved){
    const parsed=JSON.parse(saved);
    if(parsed){
     if(parsed.record&&parsed.record.payload){
      loadVoucherRow(parsed.record);
      sessionStorage.removeItem('shako_pending_bank_select');
      toast.info(`تم فتح الإيصال البنكي «${parsed.record.code||parsed.id}» للتعديل ✏️`);
     }else if(parsed.code||parsed.id){
      sessionStorage.removeItem('shako_pending_bank_select');
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
   let row;
   if(catalog){
    row=await api('/api/banks',{method:'POST',body:JSON.stringify({action:'account',id:form.id,updatedAt:form.updatedAt,name:form.name,currency:form.currency||'MULTI',rate:Number(form.rate),parentId:form.parentId||undefined,accountNumber:form.accountNumber,address:form.address,phone:form.phone,email:form.email})});
   }else{
    if(editing&&!form.id)throw new Error('ابحث عن رقم الإيصال أولًا');
    if(form.crossCurrency){
     if(!form.settlementTreasuryId)throw new Error(`الرجاء اختيار حساب بنك بعملة ${form.settlementCurrency||'SDG'} أو متعدد العملات`);
     const selTr=bankAccounts.find(a=>a.id===form.settlementTreasuryId);
     if(selTr&&selTr.currency!=='MULTI'&&selTr.currency!==form.settlementCurrency){
      throw new Error(`حساب البنك (${selTr.name}) عملته ${selTr.currency} ولا يطابق عملة السداد (${form.settlementCurrency})`);
     }
     if(!form.settlementAmount||Number(form.settlementAmount)<=0)throw new Error('الرجاء إدخال المبلغ المسدد بالعملة الأخرى');
     if(!form.coveredAmount||Number(form.coveredAmount)<=0)throw new Error('الرجاء إدخال المبلغ المغطى للحساب المقابل');
    }
    const targetTreasuryId=form.crossCurrency?form.settlementTreasuryId:form.treasuryId;
    const effTreasuryCurrency=form.crossCurrency?form.settlementCurrency:(treasury?.currency==='MULTI'?(form.treasuryCurrency||'USD'):treasury?.currency);
    const sAmt=Number(form.crossCurrency?(form.settlementAmount||form.amount):form.amount);
    const cAmt=form.crossCurrency?Number(form.coveredAmount||0):undefined;
    const rate=form.crossCurrency?Number(form.conversionRate||(sAmt>0&&cAmt&&cAmt>0?(sAmt/cAmt).toFixed(4):1)):1;
    row=await api('/api/banks',{method:'POST',body:JSON.stringify({action:'voucher',id:form.id,updatedAt:form.updatedAt,type,date:form.date,treasuryId:targetTreasuryId,counterpartyId:form.counterpartyId,person:form.person,amount:sAmt,notes:form.notes,treasuryCurrency:effTreasuryCurrency,transactionCurrency:form.crossCurrency?counterpartCurrency:(transfer?undefined:effTreasuryCurrency),crossCurrency:!!form.crossCurrency,coveredCurrency:form.crossCurrency?counterpartCurrency:undefined,coveredAmount:cAmt,conversionRate:rate,...(cheque?{chequeNumber:form.chequeNumber,chequeDate:form.chequeDate,chequeStatus:form.chequeStatus,clearedDate:form.chequeStatus==='cleared'?form.clearedDate:undefined}:{})})});
    if(form._stagedId){
     try{
      await api('/api/staged-operations?id='+encodeURIComponent(form._stagedId),{method:'DELETE'});
      toast.success('تم إنزال العملية وحذفها آليًا من قائمة المعلقات لمنع التكرار');
     }catch(err){console.error('Delete staged op error',err)}
    }
   }
   toast.success(catalog?'تم حفظ حساب البنك':'تم حفظ الإيصال رقم '+row.code);
   clear();
   await load();
  }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 async function remove(){setBusy(true);try{await api('/api/banks',{method:'DELETE',body:JSON.stringify({id:form.id,updatedAt:form.updatedAt})});toast.success('تم إلغاء أثر الإيصال وحفظه في سجل العمليات');setConfirm(false);clear();load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 if(mode==='balances'||mode.startsWith('print-'))return <BankReport mode={mode} settings={settings} data={data} error={error} loading={loading} load={load} onClose={onClose}/>;
 return <div className="cash-screen"><BackgroundMenu mode={mode}/><Dialog open={w.active} onOpenChange={v=>!v&&onClose()}><DialogContent showCloseButton={false} className={(w.expanded?'is-maximized ':'')+'cash-dialog bank-dialog '+(catalog?'bank-catalog ':'')+(editing?'cash-editing':'')} dir="rtl" aria-describedby="bank-dialog-description"><DialogTitle className="sr-only">{bankTitles[mode]}</DialogTitle><DialogDescription id="bank-dialog-description" className="sr-only">{catalog?'أدخل بيانات حساب البنك.':'أدخل الحسابات والمبلغ ثم احفظ الإيصال.'}</DialogDescription><BankTitle mode={mode} onClose={onClose} onRefresh={load}/>{error?<p className="cash-error" role="alert">{error}<button type="button" onClick={load}>إعادة المحاولة</button></p>:loading?<p className="cash-error">جارٍ تحميل البيانات…</p>:null}<form onSubmit={save} className="cash-dialog-body">
 {!catalog&&moduleEnabled(settings,'stagedOps')&&<StagedOperationsStrip types={type==='transfer'?['bank-transfer']:type==='deposit'?['bank-deposit']:type==='withdraw'?['bank-withdraw']:['bank-transfer','bank-deposit','bank-withdraw']} onSelect={onSelectStaged} refreshKey={w.refreshKey} title="عمليات بنكية معلقة بانتظار الإنزال في النظام"/>}
 {form._attachment&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'6px 12px',marginBottom:'8px',fontSize:'12px',color:'#1e40af'}}><span>📎 مرفق العملية المعلقة: <b>{form._attachment.name}</b></span><a href={form._attachment.data} download={form._attachment.name} className="plain-button" style={{color:'#2563eb',fontWeight:600}}>تنزيل / فتح المرفق</a></div>}
 {catalog?<>
  <div className="cash-row cash-pair"><CashSelect label="الحساب الرئيسي" value={form.parentId||'none'} onChange={v=>set('parentId',v==='none'?'':v)} options={[{value:'none',label:'بدون حساب رئيسي'},...data.counterparties.filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)).filter(x=>x.kind==='account'&&(!form.currency||x.currency===form.currency)).map(x=>({value:x.id,label:x.name}))]}/><CashField label="إسم الحساب" value={form.name} onChange={v=>set('name',v)} required placeholder="الرجاء إضافة إسم الحساب"/></div>
  <div className="cash-row cash-pair"><CashSelect label="عملة الحساب" value={form.currency} onChange={v=>{set('currency',v);set('parentId','');set('rate',v==='MULTI'?1:(data.currencies.find(c=>c.code===v)?.rate||1))}} options={[{value:'MULTI',label:'متعدد العملات (يقبل جميع العملات)'},...data.currencies.filter(c=>c.active!==false||form.id&&c.code===form.currency).map(c=>({value:c.code,label:c.name+' · '+c.code}))]} required/><CashField label="سعر الصرف" type="number" min="0.00000001" step="any" value={form.rate} onChange={v=>set('rate',v)} required/></div>
  <div className="cash-row cash-buttons"><button className="blue-button" disabled={!canManage||busy||!!error}>{form.id?'تعديل الحساب':'إضافة الحساب'}</button>{form.id&&<button type="button" className="red-button" disabled={!canManage||busy} onClick={()=>{setAccountToDelete(form);setAccountConfirm(true);}}>حذف الحساب</button>}<button type="button" className="gray-button" onClick={clear}>تفريغ الحقول</button></div>
  <div className="cash-catalog-table"><Table><TableHeader><TableRow>{['#','إسم الحساب','العملة','سعر الصرف','رقم الحساب','العنوان','رقم الهاتف','البريد الإلكتروني','إجراءات'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{data.accounts.map((a,i)=><TableRow key={a.id}><TableCell>{i+1}</TableCell><TableCell><button type="button" onClick={()=>setForm({...newAccount(),...a.payload,id:a.id,updatedAt:a.updatedAt,name:a.name,currency:a.currency})}>{a.name}</button></TableCell><TableCell>{a.currency==='MULTI'?'متعدد العملات':a.currency}</TableCell><TableCell>{a.payload.rate}</TableCell><TableCell dir="ltr">{a.payload.accountNumber}</TableCell><TableCell>{a.payload.address}</TableCell><TableCell dir="ltr">{a.payload.phone}</TableCell><TableCell dir="ltr">{a.payload.email}</TableCell><TableCell><button type="button" className="red-button" style={{padding:'2px 8px',fontSize:'11px',minHeight:'auto'}} onClick={()=>{setAccountToDelete(a);setAccountConfirm(true);}}>حذف</button></TableCell></TableRow>)}</TableBody></Table>{!data.accounts.length&&<p className="cash-no-data">لا توجد بيانات</p>}</div><p className="cash-table-hint">اضغط اسم الحساب لتعديله، أو زر حذف لحذفه.</p>
  {data.archivedAccounts&&data.archivedAccounts.length>0&&<div style={{marginTop:'12px',borderTop:'1px dashed #cbd5e1',paddingTop:'10px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}><span style={{fontWeight:600,fontSize:'12px',color:'#64748b'}}>الحسابات المؤرشفة / المحذوفة ({data.archivedAccounts.length})</span><button type="button" className="plain-button" style={{fontSize:'11px',color:'#0f766e',fontWeight:600}} onClick={()=>setShowArchived(!showArchived)}>{showArchived?'إخفاء':'عرض واستعادة الحسابات المحذوفة'}</button></div>{showArchived&&<Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>إسم الحساب</TableHead><TableHead>العملة</TableHead><TableHead>الحالة</TableHead><TableHead>إجراء</TableHead></TableRow></TableHeader><TableBody>{data.archivedAccounts.map((a:any,i:number)=><TableRow key={a.id}><TableCell>{i+1}</TableCell><TableCell>{a.name}</TableCell><TableCell>{a.currency==='MULTI'?'متعدد العملات':a.currency}</TableCell><TableCell><span style={{fontSize:'11px',padding:'2px 6px',borderRadius:'4px',background:'#fee2e2',color:'#b91c1c'}}>مؤرشف / محذوف</span></TableCell><TableCell><button type="button" className="blue-button" style={{padding:'2px 8px',fontSize:'11px',minHeight:'auto'}} disabled={busy} onClick={()=>restoreAccount(a)}>استعادة الحساب</button></TableCell></TableRow>)}</TableBody></Table>}</div>}
  </>:<>
   <div className="cash-row cash-pair"><label className="cash-date input-group"><span><CalendarDays size={15}/>التاريخ</span><input aria-label="تاريخ الإيصال" type="date" value={form.date} onChange={e=>set('date',e.target.value)} required/></label>{editing?<div className="cash-number-search"><CashField label="رقم الإيصال" value={search} onChange={setSearch} placeholder="بحث برقم الإيصال"/><button type="button" aria-label="بحث عن الإيصال" onClick={()=>find().catch(e=>toast.error(e.message))}><Search size={20}/></button></div>:<CashField label="رقم الإيصال" className="cash-number" value={data.nextNumber} readOnly/>}</div>
  <div className="cash-row"><CashSelect label="اسم الحساب" value={form.counterpartyId} onChange={chooseCounter} options={bankCounterOptions.map(a=>({value:a.id,label:accountLabel(a)}))} required/></div>
  <div className="cash-row"><CashSelect label={form.crossCurrency?"حساب البنك الرئيسي (معطل - الحركة بالعملة الأخرى)":"حساب البنك"} value={form.treasuryId} onChange={chooseBank} options={bankAccountsOptions.map(a=>({value:a.id,label:a.name+' · بنك · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)}))} disabled={!!form.crossCurrency} required={!form.crossCurrency}/></div>
  {form.crossCurrency&&<div style={{fontSize:'12px',color:'#0f766e',background:'#f0fdf4',padding:'4px 10px',borderRadius:'6px',marginTop:'-4px',marginBottom:'8px',border:'1px solid #bbf7d0'}}>⚠️ حساب البنك الرئيسي أعلاه معطل (لن يتأثر بحركة نقدية/بنكية) — الحركة الفعلية ستسجل في حساب العملة الأخرى المحدد بقسم التسوية أدناه.</div>}
  {treasury?.currency==='MULTI'&&<div className="cash-row"><CashSelect label="عملة حركة البنك" value={form.treasuryCurrency||'USD'} onChange={v=>set('treasuryCurrency',v)} options={data.currencies.map(c=>({value:c.code,label:c.name+' · '+c.code}))} required/></div>}
  <div className="cash-row cash-pair"><CashField label="عملة الحساب" value={currencyName(treasury?.currency||'')} readOnly/><CashField label="سعر الصرف" value={treasury?1:''} readOnly/></div>
  {cheque&&<><div className="cash-row cash-pair"><CashField label="رقم الشيك" value={form.chequeNumber} readOnly={!!form.id} onChange={v=>set('chequeNumber',v)} required/><CashField label="تاريخ الاستحقاق" value={form.chequeDate} type="date" onChange={v=>set('chequeDate',v)} required/></div><div className="cash-row"><CashSelect label="حالة الشيك" value={form.chequeStatus} onChange={v=>set('chequeStatus',v)} options={[{value:'pending',label:'قيد التحصيل'},{value:'cleared',label:'تم التحصيل'}]}/></div>{form.chequeStatus==='cleared'&&<div className="cash-row"><CashField label="تاريخ التحصيل" type="date" value={form.clearedDate} onChange={v=>set('clearedDate',v)} required/></div>}<p className="cash-rate-note">الشيك قيد التحصيل لا يؤثر في الرصيد حتى اختيار «تم التحصيل».</p></>}
  <div className="cash-row"><CashField label={personLabel} value={form.person} onChange={v=>set('person',v)}/></div>
  {!form.crossCurrency&&<div className={'cash-row '+(transfer?'cash-pair':'cash-amount-row')}><CashField label={amountLabel} type="number" min="0.01" step="any" value={form.amount} onChange={v=>set('amount',v)} required/>{transfer&&<CashField label="المبلغ بحساب الوجهة" value={money(Math.round(Number(form.amount||0)/(destination?.currency===treasury?.currency?1:Number(form.conversionRate||1))*100))} readOnly/>}</div>}
  <div className="cash-row" style={{background:'#f8fafc',padding:'8px 12px',borderRadius:'6px',border:'1px solid #e2e8f0',margin:'6px 0'}}>
   <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:600,color:'#0f766e'}}>
    <input type="checkbox" checked={!!form.crossCurrency} onChange={e=>{const checked=e.target.checked;const defId=eligibleBankAccounts[0]?.id||'';setForm((f:any)=>({...f,crossCurrency:checked,settlementCurrency:f.settlementCurrency||'SDG',settlementTreasuryId:f.settlementTreasuryId||defId,coveredCurrency:counterpartCurrency,coveredAmount:checked?(f.coveredAmount||''):f.coveredAmount,settlementAmount:checked?(f.settlementAmount||f.amount||''):f.settlementAmount,conversionRate:f.conversionRate||''}))}}/>
    <span>تسوية بعملة مختلفة (سداد بعملة لتغطية حساب عميل / خطوط / مورد بعملة أخرى)</span>
   </label>
  </div>
  {form.crossCurrency&&<div style={{background:'#f0fdf4',padding:'12px',borderRadius:'8px',border:'1px solid #86efac',marginBottom:'10px'}}>
   <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',fontWeight:700,color:'#166534',fontSize:'13px'}}><ERPIcon name="forex" size={18}/><span>بيانات التسوية بالعملة الأخرى (الحسابات المتأثرة بالحركة الفعلية)</span></div>
   <div className="cash-row cash-pair">
    <CashSelect label="عملة السداد (العملة الأخرى)" value={form.settlementCurrency||'SDG'} onChange={v=>{const matched=bankAccounts.find(a=>a.currency===v||a.currency==='MULTI')?.id||'';setForm((f:any)=>({...f,settlementCurrency:v,settlementTreasuryId:matched}))}} options={data.currencies.map(c=>({value:c.code,label:c.name+' · '+c.code}))}/>
    <CashSelect label="حساب البنك (بالعملة الأخرى) *" value={form.settlementTreasuryId||''} onChange={v=>set('settlementTreasuryId',v)} options={settlementTreasuryOptions} required={!!form.crossCurrency}/>
   </div>
   <div className="cash-row cash-pair">
    <CashField label={`المبلغ الفعلي المدفوع بالبنك (${form.settlementCurrency||'SDG'}) *`} type="number" min="0.01" step="any" value={form.settlementAmount||''} onChange={(v:any)=>{const sAmt=Number(v||0);const cov=Number(form.coveredAmount||0);setForm((f:any)=>({...f,settlementAmount:v,amount:v,...(cov>0&&sAmt>0?{conversionRate:Number((sAmt/cov).toFixed(4))}:{})}))}} required={!!form.crossCurrency} placeholder={`المبلغ بـ ${form.settlementCurrency||'SDG'}`}/>
    <CashField label="سعر الصرف *" type="number" min="0.00000001" step="any" value={form.conversionRate||''} onChange={(v:any)=>{const rate=Number(v||0);const cov=Number(form.coveredAmount||0);setForm((f:any)=>({...f,conversionRate:v,...(rate>0&&cov>0?{settlementAmount:Number((cov*rate).toFixed(2)),amount:Number((cov*rate).toFixed(2))}:{})}))}} required={!!form.crossCurrency} placeholder="سعر الصرف"/>
   </div>
   <div className="cash-row">
    <CashField label={`المبلغ المغطى لحساب ${counterpart?.name||'الحساب المقابل'} (${counterpartCurrency}) *`} type="number" min="0.01" step="any" value={form.coveredAmount||''} onChange={(v:any)=>{const cov=Number(v||0);const sAmt=Number(form.settlementAmount||0);const rate=Number(form.conversionRate||0);if(sAmt>0&&cov>0){setForm((f:any)=>({...f,coveredAmount:v,conversionRate:Number((sAmt/cov).toFixed(4))}))}else if(rate>0&&cov>0){const calc=Number((cov*rate).toFixed(2));setForm((f:any)=>({...f,coveredAmount:v,settlementAmount:calc,amount:calc}))}else{setForm((f:any)=>({...f,coveredAmount:v}))}}} required={!!form.crossCurrency} placeholder={`المبلغ المغطى بـ ${counterpartCurrency}`}/>
   </div>
   <div style={{fontSize:'12px',color:'#15803d',background:'#dcfce7',padding:'6px 10px',borderRadius:'6px',marginTop:'6px'}}>💡 <b>الأثر المالي:</b> سيتم التأثير الفعلي على حساب <b>{selectedSettlementTreasury?.name||'البنك المحدد'}</b> بمبلغ <b>{money(Math.round(Number(form.settlementAmount||0)*100))} {form.settlementCurrency||'SDG'}</b>، بينما تُغطى مديونية <b>{counterpart?.name||'الحساب المقابل'}</b> بمبلغ <b>{money(Math.round(Number(form.coveredAmount||0)*100))} {counterpartCurrency}</b>. حساب البنك في الشاشة الرئيسية معطل تماماً.</div>
  </div>}
  <div className="cash-row"><label className="input-group cash-field cash-notes"><span>{noteLabel}</span><textarea aria-label="البيان" value={form.notes} onChange={e=>set('notes',e.target.value)} required placeholder="الرجاء كتابة البيان"/></label></div>
  <div className="cash-buttons">{editing?<><button className="green-button" disabled={!canManage||busy||!form.id||!!error}>تعديل</button><button type="button" className="red-button" disabled={!canManage||busy||!form.id} onClick={()=>setConfirm(true)}>حذف</button></>:<><button className="blue-button" disabled={!canManage||busy||!!error}>{busy?'جارٍ الحفظ…':transfer?'تحويل':cheque?'حفظ الشيك':incoming?'إستلام':'سحب'}</button><button type="button" className="gray-button" onClick={clear}>تفريغ الحقول</button></>}</div>
  {!data.accounts.length&&!loading&&<p className="cash-setup-note">أضف حساب بنك من قائمة البنوك أولًا.</p>}
 </>}
 </form></DialogContent></Dialog><AlertDialog open={confirm&&w.active} onOpenChange={setConfirm}><AlertDialogContent dir="rtl"><AlertDialogTitle>حذف الإيصال {search}</AlertDialogTitle><AlertDialogDescription>سيُلغى أثر الإيصال في جميع الحسابات المرتبطة، وتُحفظ بياناته في سجل العمليات. هل تريد الحذف؟</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>رجوع</AlertDialogCancel><AlertDialogAction onClick={remove} disabled={!canManage||busy}>حذف الإيصال</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><AlertDialog open={accountConfirm&&w.active} onOpenChange={setAccountConfirm}><AlertDialogContent dir="rtl"><AlertDialogTitle>حذف حساب البنك</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف حساب البنك «{accountToDelete?.name||form?.name}»؟ سيتم إزالته من القوائم والحركات النشطة.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel onClick={()=>{setAccountConfirm(false);setAccountToDelete(null);}}>إلغاء</AlertDialogCancel><AlertDialogAction onClick={()=>removeAccount(accountToDelete)} disabled={!canManage||busy}>تأكيد الحذف</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
}

function IssuedChequeWorkspace({mode,settings,onClose}:{mode:string;settings:Settings;onClose:()=>void}){
 const w=useWorkspaceWindow(),access=useAgencyAccess(),canManage=access.modules.banks==='manage';
 const {data,error,loading,load}=useBanks(),passing=mode==='pass-cheque-issue',editing=mode.startsWith('edit-'),deferred=mode.includes('deferred'),chequeMode=deferred?'deferred':'direct';
 const freshForm=()=>({...newForm('cheque-issue'),chequeMode,intermediaryId:''});
 const [form,setForm]=useState<any>(freshForm),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[clearedDate,setClearedDate]=useState(today());
 const set=(key:string,value:any)=>setForm((f:any)=>({...f,[key]:value})),bank=data.accounts.find(a=>a.id===form.treasuryId),counterpart=data.counterparties.find(a=>a.id===form.counterpartyId);
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
 const counterpartOptions=data.counterparties.filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.kind==='customer'||a.currency==='MULTI').filter(a=>!['cash-account','bank-account'].includes(a.kind)&&(!bank||a.kind==='customer'||a.currency==='MULTI'||bank.currency==='MULTI'||a.currency===bank.currency)).map(a=>({value:a.id,label:accountLabel(a)}));
 const intermediaryOptions=data.counterparties.filter(a=>!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.currency==='MULTI').filter(a=>a.kind==='account'&&a.id!==form.counterpartyId&&(!bank||a.currency===bank.currency||bank.currency==='MULTI'||a.currency==='MULTI')&&(!counterpart||a.currency===counterpart.currency||counterpart.currency==='MULTI'||a.currency==='MULTI')).map(a=>({value:a.id,label:a.name+' · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)}));
 function clear(){setForm(freshForm());setSearch('');setClearedDate(today())}
 async function find(){const d:BankData=await api('/api/banks'),row=d.vouchers.find(v=>v.code===search.trim().padStart(8,'0')&&v.payload.type==='cheque-issue');if(!row||row.payload.status!=='active')throw new Error('رقم الشيك الصادر غير موجود أو محذوف');const p=row.payload;if(!passing&&p.chequeMode&&p.chequeMode!==chequeMode)throw new Error('هذا الإيصال يخص شيكًا '+(p.chequeMode==='direct'?'مباشرًا':'آجلًا'));if(passing&&p.chequeStatus!=='pending')throw new Error('تم تمرير هذا الشيك بالفعل');setForm({...freshForm(),id:row.id,updatedAt:row.updatedAt,legacy:!p.chequeMode,date:row.date,treasuryId:p.treasuryId,counterpartyId:p.counterpartyId,person:p.person,amount:p.transactionMinor/100,notes:p.notes,conversionRate:p.rate,transactionCurrency:p.transactionCurrency,chequeNumber:p.chequeNumber,chequeDate:p.chequeDate,chequeStatus:p.chequeStatus,clearedDate:p.clearedDate,intermediaryId:p.intermediaryId||'',intermediaryName:p.intermediaryName,counterpartyName:p.counterpartyName,treasuryName:p.treasuryName,treasuryCurrency:p.treasuryCurrency,chequeMode:p.chequeMode});setClearedDate(today());await load()}
 async function save(e:any){e.preventDefault();setBusy(true);try{if((editing||passing)&&!form.id)throw new Error('ابحث عن رقم الإيصال أولًا');let row;if(passing)row=await api('/api/banks',{method:'POST',body:JSON.stringify({action:'pass-cheque',id:form.id,updatedAt:form.updatedAt,clearedDate})});else{const legacy=!!form.legacy,status=legacy?form.chequeStatus:deferred?(form.id?form.chequeStatus:'pending'):'cleared';row=await api('/api/banks',{method:'POST',body:JSON.stringify({action:'voucher',id:form.id,updatedAt:form.updatedAt,type:'cheque-issue',date:form.date,treasuryId:form.treasuryId,counterpartyId:form.counterpartyId,person:form.person,amount:Number(form.amount),notes:form.notes,transactionCurrency:form.transactionCurrency||bank?.currency,conversionRate:1,chequeNumber:form.chequeNumber,chequeMode:legacy?undefined:chequeMode,intermediaryId:deferred||legacy?form.intermediaryId||undefined:undefined,chequeDate:legacy?form.chequeDate:deferred?form.chequeDate:form.date,chequeStatus:status,clearedDate:status==='cleared'?(legacy||deferred?form.clearedDate:form.date):undefined})})}toast.success(passing?'تم تمرير الشيك رقم '+row.code:'تم حفظ الشيك رقم '+row.code);clear();await load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function remove(){setBusy(true);try{await api('/api/banks',{method:'DELETE',body:JSON.stringify({id:form.id,updatedAt:form.updatedAt})});toast.success('تم إلغاء أثر الشيك وحفظه في السجل');setConfirm(false);clear();await load()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 function chooseBank(id:string){const a=data.accounts.find(x=>x.id===id);setForm((f:any)=>({...f,treasuryId:id,transactionCurrency:a?.currency||'',counterpartyId:data.counterparties.find(x=>x.id===f.counterpartyId)?.currency===a?.currency||a?.currency==='MULTI'?f.counterpartyId:'',intermediaryId:data.counterparties.find(x=>x.id===f.intermediaryId)?.currency===a?.currency||a?.currency==='MULTI'?f.intermediaryId:'',conversionRate:1}))}
 const searchField=<div className="cash-number-search"><CashField label="رقم الإيصال" value={search} onChange={setSearch} placeholder="بحث برقم الإيصال"/><button type="button" aria-label="بحث عن الإيصال" onClick={()=>find().catch(e=>toast.error(e.message))}><Search size={20}/></button></div>;
 return <div className="cash-screen"><section className="menu-panel cash-background" aria-hidden="true" dir="rtl"><h1 className="ribbon">القائمة ‹ البنوك ‹ تحرير شيك</h1><div className="icon-menu">{issuedChequeMenu.map(([icon,label])=><div className="menu-item" key={label}><ERPIcon name={icon} size={26}/><span>{label}</span></div>)}<div className="menu-item"><ERPIcon name="back" size={26}/><span>القائمة السابقة</span></div></div></section><Dialog open={w.active} onOpenChange={v=>!v&&onClose()}><DialogContent showCloseButton={false} className={(w.expanded?'is-maximized ':'')+'cash-dialog bank-dialog issued-cheque '+(deferred?'cheque-wide ':'')+(editing?'cash-editing':'')} dir="rtl" aria-describedby="issued-cheque-description"><DialogTitle className="sr-only">{bankTitles[mode]}</DialogTitle><DialogDescription className="sr-only" id="issued-cheque-description">أدخل بيانات الشيك أو ابحث عن إيصال محفوظ.</DialogDescription><BankTitle mode={mode} onClose={onClose} onRefresh={load}/>{error?<p className="cash-error" role="alert">{error}</p>:loading?<p className="cash-error">جارٍ تحميل البيانات…</p>:null}<form className="cash-dialog-body" onSubmit={save}>
 {passing?<>
  <div className="cash-row">{searchField}</div><div className="cash-row"><CashSelect label="الشيك المحرر" value={form.id||''} onChange={id=>{const r=data.vouchers.find(v=>v.id===id);if(r){setSearch(r.code);const p=r.payload;setForm({...freshForm(),...p,id:r.id,updatedAt:r.updatedAt,date:r.date,amount:p.transactionMinor/100})}}} options={data.vouchers.filter(v=>v.payload.type==='cheque-issue'&&v.payload.status==='active'&&v.payload.chequeStatus==='pending').map(v=>({value:v.id,label:v.code+' · '+v.payload.chequeNumber+' · '+v.payload.counterpartyName}))}/></div>
  <div className="cash-row"><CashField label="حساب البنك" value={form.treasuryName||''} readOnly/></div><div className="cash-row"><CashField label="اسم الحساب" value={form.counterpartyName||''} readOnly/></div><div className="cash-row cash-pair"><CashField label="قيمة الشيك" value={form.amount} readOnly/><CashField label="رقم الشيك" value={form.chequeNumber} readOnly/></div><div className="cash-row"><CashField label="تاريخ الشيك" value={form.chequeDate} readOnly/></div><div className="cash-row"><CashField label="تاريخ التمرير" type="date" value={clearedDate} onChange={setClearedDate} required/></div><div className="cash-buttons"><button className="blue-button" disabled={!canManage||busy||!form.id||!!error}>تمرير الشيك</button><button type="button" className="gray-button" onClick={clear}>تفريغ الحقول</button></div>
 </>:<>
  <div className="cash-row cash-pair"><label className="cash-date input-group"><span><CalendarDays size={15}/>التاريخ</span><input aria-label="تاريخ الإيصال" type="date" value={form.date} onChange={e=>set('date',e.target.value)} required/></label>{editing?searchField:<CashField label="رقم الإيصال" className="cash-number" value={data.nextNumber} readOnly/>}</div>
  <div className={'cash-row '+(deferred?'cash-pair':'')}><CashSelect label="اسم الحساب" value={form.counterpartyId} onChange={v=>{set('counterpartyId',v);if(v===form.intermediaryId)set('intermediaryId','')}} options={counterpartOptions} required/>{deferred&&<CashSelect label="الحساب الوسيط" value={form.intermediaryId} onChange={v=>set('intermediaryId',v)} options={intermediaryOptions} required={!form.legacy}/>}</div>
  <div className="cash-row cheque-bank-rate"><CashSelect label="حساب البنك" value={form.treasuryId} onChange={chooseBank} options={data.accounts.filter(a=>a.kind==='bank-account'&&(!settings.enabledCurrencies||settings.enabledCurrencies.includes(a.currency)||a.currency==='MULTI')).filter(a=>!counterpart||counterpart.currency==='MULTI'||a.currency==='MULTI'||a.currency===counterpart.currency).map(a=>({value:a.id,label:a.name+' · '+(a.currency==='MULTI'?'متعدد العملات':a.currency)}))} disabled={!!form.id} required/><CashField label="سعر الصرف" value={form.conversionRate} type="number" min="0.00000001" step="any" onChange={v=>set('conversionRate',v)} readOnly required/></div>
  <div className={'cash-row '+(deferred?'cash-pair':'')}><CashField label="استلم بواسطة" value={form.person} onChange={v=>set('person',v)}/>{deferred&&<CashField label="تاريخ الشيك" type="date" value={form.chequeDate} onChange={v=>set('chequeDate',v)} required/>}</div>
  <div className="cash-row cash-pair"><CashField label="قيمة الشيك" type="number" min="0.01" step="any" value={form.amount} onChange={v=>set('amount',v)} required/><CashField label="رقم الشيك" value={form.chequeNumber} onChange={v=>set('chequeNumber',v)} readOnly={!!form.id} required/></div>
  <div className="cash-row"><label className="input-group cash-field cash-notes"><span>بيان الشيك *</span><textarea aria-label="بيان الشيك" value={form.notes} onChange={e=>set('notes',e.target.value)} required placeholder="الرجاء كتابة بيان الشيك"/></label></div>
  {editing&&form.chequeStatus==='cleared'&&deferred&&<p className="cash-rate-note">تم تمرير الشيك بتاريخ {form.clearedDate}؛ تعديل بياناته يحافظ على حالة الصرف.</p>}
  <div className="cash-buttons">{editing?<><button className="green-button" disabled={!canManage||busy||!form.id||!!error}>تعديل</button><button className="red-button" type="button" disabled={!canManage||busy||!form.id} onClick={()=>setConfirm(true)}>حذف</button></>:<><button className="blue-button" disabled={!canManage||busy||!!error}>{busy?'جارٍ الحفظ…':'تحرير'}</button><button className="gray-button" type="button" onClick={clear}>تفريغ الحقول</button></>}</div>
 </>}
 </form></DialogContent></Dialog><AlertDialog open={confirm&&w.active} onOpenChange={setConfirm}><AlertDialogContent dir="rtl"><AlertDialogTitle>حذف الشيك {search}</AlertDialogTitle><AlertDialogDescription>سيُلغى أثر الشيك في الحسابات المرتبطة وتُحفظ بياناته في سجل العمليات.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>رجوع</AlertDialogCancel><AlertDialogAction onClick={remove} disabled={!canManage||busy}>حذف الشيك</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
}

function exportRows(name:string,headers:string[],rows:any[][]){const q=(v:any)=>'"'+String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"';download('\uFEFF'+[headers,...rows].map(r=>r.map(q).join(',')).join('\r\n'),name+'.csv','text/csv;charset=utf-8')}
function BankReport({mode,settings,data,error,loading,load,onClose}:{mode:string;settings:Settings;data:BankData;error:string;loading:boolean;load:()=>void;onClose:()=>void}){
 const balances=mode==='balances';const type=mode.replace('print-','');const [date,setDate]=useState(today()),[currency,setCurrency]=useState('all'),[account,setAccount]=useState('all'),[selected,setSelected]=useState(''),[search,setSearch]=useState('');const vouchers=data.vouchers.filter(v=>v.payload.type===type&&(account==='all'||v.payload.counterpartyId===account));const row=data.vouchers.find(v=>v.id===selected);const p=row?.payload;const totals=new Map<string,{name:string;currency:string;amount:number}>();
 for(const a of data.accounts)if(currency==='all'||a.currency===currency)totals.set(a.id+':'+a.currency,{name:a.name,currency:a.currency,amount:0});
 for(const r of data.ledger)if(r.date<=date&&r.payload.status!=='voided'&&(currency==='all'||r.currency===currency)){const id=(r.payload.treasuryId||'unallocated')+':'+r.currency;const prev=totals.get(id)||{name:r.payload.treasuryName||'غير مخصص لحساب بنك',currency:r.currency,amount:0};prev.amount+=r.amount;totals.set(id,prev)}const rows=[...totals.values()];
 function find(){const v=vouchers.find(v=>v.code===search.trim().padStart(8,'0'));if(v)setSelected(v.id);else toast.error('رقم الإيصال غير موجود')}
 function csv(){balances?exportRows('bank-balances',['الحساب','العملة','الرصيد'],rows.map(r=>[r.name,r.currency,r.amount/100])):row&&exportRows('bank-voucher-'+row.code,['البيان','رقم الإيصال','التاريخ','الحساب','البنك','العملة','المبلغ','سعر الصرف','المستلم','الحالة'],[[p?.notes,row.code,row.date,p?.counterpartyName,p?.treasuryName,p?.treasuryCurrency,p?.treasuryMinor/100,p?.rate,p?.person,p?.status]])}
 return <section className="app-window cash-report" dir="rtl"><BankTitle mode={mode} onClose={onClose} onRefresh={load}/><div className="window-body"><div className="toolbar cash-report-filters">{balances?<><CashField label="الأرصدة حتى تاريخ" value={date} type="date" onChange={setDate}/><CashSelect label="العملة" value={currency} onChange={setCurrency} options={[{value:'all',label:'الكل'},...data.currencies.map(c=>({value:c.code,label:c.name+' · '+c.code}))]}/><button className="search-button" aria-label="بحث أرصدة البنوك" onClick={load}><Search size={20}/></button></>:<><CashSelect label="الحساب" value={account} onChange={v=>{setAccount(v);setSelected('')}} options={[{value:'all',label:'الكل'},...Array.from(new Map(data.vouchers.filter(v=>v.payload.type===type).map(v=>[v.payload.counterpartyId,{value:v.payload.counterpartyId,label:v.payload.counterpartyName}])).values())]}/><CashSelect label="رقم الإيصال" value={selected} onChange={setSelected} options={vouchers.map(v=>({value:v.id,label:v.code+(v.payload.status==='voided'?' · محذوف':'')}))}/><CashField label="رقم الإيصال للبحث" value={search} onChange={setSearch}/><button className="blue-button" onClick={find}>بحث</button></>}</div><div className="report-toolbar"><button disabled={!balances&&!row} onClick={()=>permittedExport(()=>window.print())}><Printer size={17}/> طباعة / PDF</button><button disabled={!balances&&!row} onClick={()=>permittedExport(csv)}><Download size={17}/> تصدير CSV</button><ReportExports disabled={!balances&&!row}/><span>Page 1 of 1</span></div><div className="report-canvas"><article className="report-paper cash-paper"><AgencyLetterhead/><h1>{bankTitles[mode]}</h1>{error?<p className="cash-error">{error}</p>:loading?<p className="cash-no-data">جارٍ تحميل البيانات…</p>:balances?<><div className="report-meta"><span>حتى تاريخ: <b dir="ltr">{date}</b></span><span>العملة: {currency==='all'?'الكل':currency}</span></div><Table><TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>العملة</TableHead><TableHead>الرصيد</TableHead></TableRow></TableHeader><TableBody>{rows.map((r,i)=><TableRow key={i}><TableCell>{r.name}</TableCell><TableCell>{r.currency}</TableCell><TableCell dir="ltr">{money(r.amount)}</TableCell></TableRow>)}</TableBody></Table>{!rows.length&&<p className="cash-no-data">لا توجد بيانات</p>}<div className="report-totals">{[...new Set(rows.map(r=>r.currency))].map(c=><p key={c}>الإجمالي {c} : <b dir="ltr">{money(rows.filter(r=>r.currency===c).reduce((sum,r)=>sum+r.amount,0))}</b></p>)}</div>{rows.some(r=>r.name==='غير مخصص لحساب بنك')&&<p className="report-footnote">التحصيلات الآلية والحركات السابقة تظهر في «غير مخصص لحساب بنك».</p>}</>:row?<>{p?.chequeNumber&&<p className="report-footnote">رقم الشيك: {p.chequeNumber} · {p.chequeMode==='direct'?'مباشر':p.chequeMode==='deferred'?'آجل':''} · تاريخ الشيك: {p.chequeDate} {p.intermediaryName&&'· الحساب الوسيط: '+p.intermediaryName} {p.clearedDate&&'· تاريخ الصرف / التحصيل: '+p.clearedDate} · {p.chequeStatus==='cleared'?(type==='cheque-issue'?'تم الصرف':'تم التحصيل'):'معلق · غير مشمول في الرصيد'}</p>}{p?.status==='voided'&&<p className="cash-voided">إيصال محذوف · غير مشمول في الأرصدة</p>}<div className="cash-receipt-meta"><div><p>اسم الحساب : {p?.counterpartyName}</p><p>البنك : {p?.treasuryName}</p><p>رقم الإيصال : <b dir="ltr">{row.code}</b></p><p>تاريخ الإيصال : <b dir="ltr">{row.date}</b></p><p>تاريخ الطباعة : <b dir="ltr">{today()}</b></p><p>اسم {['deposit','cheque-receive'].includes(type)?'الدافع':'المستلم'} : {p?.person||'—'}</p></div><div><p>سعر الصرف : <b dir="ltr">{p?.rate}</b></p><p>العملة : {p?.treasuryCurrency}</p><p>{['deposit','cheque-receive'].includes(type)?'المبلغ المستلم':'المبلغ المنصرف'} : <b dir="ltr">{money(p?.treasuryMinor)}</b></p><p>ما يعادله : <b dir="ltr">{money(p?.transactionMinor)} {p?.transactionCurrency}</b></p></div></div><Table className="cash-receipt-lines"><TableHeader><TableRow><TableHead>البيان</TableHead><TableHead>المبلغ</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>{p?.notes||'—'}</TableCell><TableCell dir="ltr">{money(p?.treasuryMinor)} {p?.treasuryCurrency}</TableCell></TableRow></TableBody></Table><div className="cash-signatures"><span>أعد بواسطة : {p?.createdBy}</span><span>اعتمد بواسطة : __________________</span></div></>:<p className="cash-no-data">اختر الحساب ورقم الإيصال أو ابحث عنه لعرضه.</p>}<AgencyReportFooter/></article></div></div></section>
}
