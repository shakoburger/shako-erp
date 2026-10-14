'use client';
import {useState} from 'react';
import {money,type Settings} from '@/lib/domain';
import type {AccountBalance,FinanceRow} from '@/lib/balances';
import type {statementReport} from '@/lib/financial-reports';
import type {ReportData} from '@/lib/export-reports';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Plane,RotateCcw,Briefcase,Receipt,Landmark,Sparkles,Pencil,ExternalLink,X,FileText} from 'lucide-react';

type StatementProps={selected:AccountBalance;master?:FinanceRow;currentBalanceMinor:number;from:string;to:string;all:boolean;ledger:ReturnType<typeof statementReport>;settings:Settings};

export function accountStatementData(p:StatementProps):ReportData{
 const profile=p.master?.payload||{};
 const curr=p.selected.currency;
 return {title:'كشف حساب · '+p.selected.name+' ('+curr+')',subtitle:p.settings.companyName+' · الهاتف: '+p.settings.phones,logoUrl:p.settings.logoKey?'/api/agency/logo?v='+encodeURIComponent(p.settings.logoKey):undefined,orientation:'portrait',sections:[
  {title:p.selected.kind==='customer'?'بيانات العميل':'بيانات الحساب',items:[{label:'الحساب',value:p.selected.name},{label:'رقم الهاتف',value:profile.phone||'—'},{label:'العنوان',value:profile.address||'—'},{label:'الإيميل',value:profile.email||'—'}]},
  {title:'ملخص الحساب',items:[{label:'في الفترة من',value:p.all?'كل الفترات':p.from},{label:'إلى',value:p.to},{label:'الرصيد الحالي',value:money(p.currentBalanceMinor)},{label:'سقف الحساب',value:profile.creditLimit===undefined?'—':money(Math.round(profile.creditLimit*100))},{label:'العملة',value:curr}]}],
  opening:{label:'الرصيد الافتتاحي — رصيد الفترة السابقة ('+curr+')',value:p.ledger.openingMinor/100},
  headers:['التاريخ','الإيصال','البيان','R.O.E','مطالبات','سداد','الرصيد'],amountColumns:[4,5,6],
  rows:p.ledger.entries.map(e=>[e.date,e.reference,e.description,e.rate??'—',e.debitMinor/100,e.creditMinor/100,e.balanceMinor/100]),
  totals:['الإجمالي','','','',p.ledger.debitMinor/100,p.ledger.creditMinor/100,''],closing:{label:'الرصيد الختامي ('+curr+')',value:p.ledger.closingMinor/100},
  notes:['المطالبات مدينة والسداد دائن؛ الرصيد الموجب مدين والسالب دائن. سعر الصرف هو سعر العملية المحفوظ، والمبالغ معروضة بعملة الحساب دون إعادة تحويل.']};
}

export function openRecordWorkspace(entry:any){
 if(typeof window==='undefined'||!entry)return;
 const r=entry.rawRecord||{};
 const kind=entry.sourceKind||r.kind||'ticket';
 const id=entry.sourceId||r.id;
 const code=entry.reference&&entry.reference!=='—'?entry.reference:(r.code||r.payload?.receiptNumber);
 window.dispatchEvent(new CustomEvent('shako-open-record',{detail:{kind,id,code,record:r}}));
}

export function AccountStatement({data,ledger}:{data:ReportData;ledger:ReturnType<typeof statementReport>}){
 const [activeEntry,setActiveEntry]=useState<any|null>(null);

 const raw=activeEntry?.rawRecord||{};
 const p=raw.payload||{};
 const kind=activeEntry?.sourceKind||raw.kind||'';
 const isTicket=kind==='ticket'||Boolean(p.passengers||p.airline||p.fare||p.route);
 const isRefund=p.status==='refunded'||Boolean(activeEntry?.id?.endsWith(':ref')||p.penalties||p.refundComm);
 const isService=kind==='service';
 const isVoucher=['cash-voucher','bank-voucher','cash','bank'].includes(kind);
 const isBank=kind==='bank-voucher'||kind==='bank';
 const isCash=kind==='cash-voucher'||kind==='cash';

 return (
  <>
   <div className="statement-details">
    {data.sections!.map(section=>(
     <section className="statement-detail-card" key={section.title}>
      <h2>{section.title}</h2>
      <dl>
       {section.items.map(item=>(
        <div key={item.label}>
         <dt>{item.label}</dt>
         <dd dir="auto">{item.value}</dd>
        </div>
       ))}
      </dl>
     </section>
    ))}
   </div>

   <div className="statement-balance-bar">
    <strong>{data.opening!.label}</strong>
    <b dir="ltr">{money(ledger.openingMinor)}</b>
   </div>

   <div className="statement-interactive-tip no-print">
    <Sparkles size={16} className="text-emerald-600"/>
    <span>💡 اضغط على أي حركة في الجدول لعرض تفاصيلها بالكامل، أو زر <b>✏️ تعديل</b> للانتقال المباشر لشاشتها لتعديلها أو مراجعتها.</span>
   </div>

   <div className="financial-table-scroll">
    <table className="statement-table">
     <thead>
      <tr>
       {data.headers.map((h,idx)=>(
        <th
         key={h}
         style={
          idx===0?{width:'105px',minWidth:'105px',textAlign:'center',whiteSpace:'nowrap'}:
          idx===1?{width:'85px',minWidth:'85px',textAlign:'center',whiteSpace:'nowrap'}:
          idx===2?{textAlign:'right',minWidth:'220px'}:
          idx===3?{width:'65px',minWidth:'65px',textAlign:'center',whiteSpace:'nowrap'}:
          {textAlign:'left',minWidth:'95px',whiteSpace:'nowrap'}
         }
        >
         {h}
        </th>
       ))}
       <th className="no-print" style={{width:'65px',minWidth:'65px',textAlign:'center',whiteSpace:'nowrap'}}>
        إجراء
       </th>
      </tr>
     </thead>
     <tbody>
      {ledger.entries.map(e=>(
       <tr
        key={e.id}
        className="statement-interactive-row"
        onClick={()=>setActiveEntry(e)}
        title="اضغط لعرض تفاصيل هذه العملية أو الانتقال لتعديلها"
       >
        <td dir="ltr" style={{width:'105px',minWidth:'105px',textAlign:'center',whiteSpace:'nowrap'}}>
         {e.date}
        </td>
        <td dir="ltr" style={{width:'85px',minWidth:'85px',textAlign:'center',whiteSpace:'nowrap'}}>
         {e.reference}
        </td>
        <td style={{textAlign:'right'}}>
         {e.description}
        </td>
        <td dir="ltr" style={{width:'65px',minWidth:'65px',textAlign:'center',whiteSpace:'nowrap'}}>
         {e.rate??'—'}
        </td>
        <td dir="ltr" style={{textAlign:'left',whiteSpace:'nowrap',color:e.debitMinor?'#1d4ed8':'inherit'}}>
         {money(e.debitMinor)}
        </td>
        <td dir="ltr" style={{textAlign:'left',whiteSpace:'nowrap',color:e.creditMinor?'#15803d':'inherit'}}>
         {money(e.creditMinor)}
        </td>
        <td dir="ltr" style={{textAlign:'left',whiteSpace:'nowrap',fontWeight:600}}>
         {money(e.balanceMinor)}
        </td>
        <td className="no-print" style={{textAlign:'center',padding:'4px'}}>
         <button
          type="button"
          className="statement-row-action-btn"
          onClick={(ev)=>{
           ev.stopPropagation();
           openRecordWorkspace(e);
          }}
          title="الانتقال إلى شاشة العملية للتعديل"
         >
          <Pencil size={12}/>
          <span>تعديل</span>
         </button>
        </td>
       </tr>
      ))}
      {!ledger.entries.length&&(
       <tr>
        <td colSpan={8} className="statement-empty">
         لا توجد حركات خلال الفترة المحددة.
        </td>
       </tr>
      )}
     </tbody>
     <tfoot>
      <tr>
       <th colSpan={4} style={{textAlign:'right'}}>الإجمالي</th>
       <td dir="ltr" style={{textAlign:'left',whiteSpace:'nowrap'}}>{money(ledger.debitMinor)}</td>
       <td dir="ltr" style={{textAlign:'left',whiteSpace:'nowrap'}}>{money(ledger.creditMinor)}</td>
       <td/>
       <td className="no-print"/>
      </tr>
     </tfoot>
    </table>
   </div>

   <div className="statement-balance-bar statement-closing">
    <strong>الرصيد الختامي</strong>
    <b dir="ltr">{money(ledger.closingMinor)}</b>
   </div>

   {/* Detail Inspection & Quick Jump Modal */}
   <Dialog open={!!activeEntry} onOpenChange={(v)=>!v&&setActiveEntry(null)}>
    <DialogContent dir="rtl" className="statement-detail-dialog" style={{maxWidth:'620px',borderRadius:'12px',padding:'20px'}}>
     <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px',borderBottom:'1px solid #e2e8f0',paddingBottom:'12px'}}>
      <div
       style={{
        width:'42px',
        height:'42px',
        borderRadius:'10px',
        background:isRefund?'#fef2f2':isTicket?'#eff6ff':isService?'#fdf4ff':isBank?'#f0fdf4':'#fefce8',
        color:isRefund?'#dc2626':isTicket?'#2563eb':isService?'#c026d3':isBank?'#16a34a':'#ca8a04',
        display:'flex',
        alignItems:'center',
        justifyContent:'center'
       }}
      >
       {isRefund?<RotateCcw size={22}/>:isTicket?<Plane size={22}/>:isService?<Briefcase size={22}/>:isBank?<Landmark size={22}/>:<Receipt size={22}/>}
      </div>
      <div style={{flex:1}}>
       <DialogTitle style={{fontSize:'17px',fontWeight:700,margin:0,color:'#0f172a'}}>
        {isRefund?'استرداد تذكرة سفر (Ticket Refund)':isTicket?'تذكرة سفر (GDS Ticket)':isService?'خدمة سياحية (Tourism Service)':isBank?'حركة بنكية (Bank Voucher)':isCash?'سند نقد (Cash Voucher)':'حركة كشف حساب'}
       </DialogTitle>
       <DialogDescription style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>
        التاريخ: <b>{activeEntry?.date}</b> · المرجع / الإيصال: <b dir="ltr" style={{color:'#0f766e'}}>{activeEntry?.reference}</b>
       </DialogDescription>
      </div>
     </div>

     {/* Movement Financial Overview */}
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'16px'}}>
      <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
       <span style={{fontSize:'11px',color:'#1e40af',display:'block'}}>متطلبات</span>
       <b dir="ltr" style={{fontSize:'15px',color:'#1d4ed8'}}>
        {activeEntry?.debitMinor?money(activeEntry.debitMinor):'0.00'}
       </b>
      </div>
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
       <span style={{fontSize:'11px',color:'#166534',display:'block'}}>سداد</span>
       <b dir="ltr" style={{fontSize:'15px',color:'#15803d'}}>
        {activeEntry?.creditMinor?money(activeEntry.creditMinor):'0.00'}
       </b>
      </div>
      <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
       <span style={{fontSize:'11px',color:'#475569',display:'block'}}>الرصيد بعد الحركة</span>
       <b dir="ltr" style={{fontSize:'15px',color:'#0f172a'}}>
        {activeEntry?.balanceMinor!==undefined?money(activeEntry.balanceMinor):'—'}
       </b>
      </div>
     </div>

     {/* Detailed Document Content */}
     <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'14px',marginBottom:'18px',fontSize:'12.5px',display:'flex',flexDirection:'column',gap:'8px'}}>
      <div style={{fontWeight:700,fontSize:'13px',color:'#334155',borderBottom:'1px dashed #cbd5e1',paddingBottom:'6px',marginBottom:'4px'}}>
       📋 تفاصيل العملية المحاسبية والمستند:
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
       <span style={{color:'#64748b'}}>البيان:</span>
       <b style={{maxWidth:'70%',textAlign:'left'}} dir="auto">{activeEntry?.description}</b>
      </div>

      {activeEntry?.rate&&activeEntry.rate!==1&&(
       <div style={{display:'flex',justifyContent:'space-between'}}>
        <span style={{color:'#64748b'}}>سعر الصرف (R.O.E):</span>
        <b dir="ltr">{activeEntry.rate}</b>
       </div>
      )}

      {isTicket&&(
       <>
        {p.passengers&&Array.isArray(p.passengers)&&p.passengers.length>0?(
         <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <span style={{color:'#64748b'}}>المسافرون والتذاكر:</span>
          <div style={{textAlign:'left'}}>
           {p.passengers.map((pax:any,idx:number)=>(
            <div key={idx}>
             <b>{pax.name}</b> {pax.ticketNo&&<span dir="ltr" style={{color:'#0f766e'}}>({pax.ticketNo})</span>}
            </div>
           ))}
          </div>
         </div>
        ):(
         <>
          {raw.name&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>المسافر:</span><b>{raw.name}</b></div>}
          {raw.code&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>رقم التذكرة:</span><b dir="ltr">{raw.code}</b></div>}
         </>
        )}

        {p.airline&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>شركة الطيران:</span><b>{p.airline}</b></div>}
        {p.route&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>خط السير:</span><b dir="ltr">{p.route}</b></div>}
        {p.class&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>الدرجة:</span><b>{p.class}</b></div>}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginTop:'4px',borderTop:'1px dashed #cbd5e1',paddingTop:'6px'}}>
         {p.sellingPrice!==undefined&&<div><span style={{color:'#64748b'}}>سعر البيع: </span><b dir="ltr">{Number(p.sellingPrice).toLocaleString()} {raw.currency}</b></div>}
         {p.supplierPrice!==undefined&&<div><span style={{color:'#64748b'}}>تكلفة المورد: </span><b dir="ltr">{Number(p.supplierPrice).toLocaleString()} {raw.currency}</b></div>}
         {p.commAmount!==undefined&&<div><span style={{color:'#64748b'}}>العمولة: </span><b dir="ltr" style={{color:'#15803d'}}>{Number(p.commAmount).toLocaleString()} {raw.currency}</b></div>}
         {p.penalties!==undefined&&Number(p.penalties)>0&&<div><span style={{color:'#b91c1c'}}>غرامة الإلغاء: </span><b dir="ltr" style={{color:'#b91c1c'}}>{Number(p.penalties).toLocaleString()} {raw.currency}</b></div>}
        </div>
       </>
      )}

      {isService&&(
       <>
        <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>اسم الخدمة:</span><b>{raw.name||'خدمة'}</b></div>
        {p.quantity&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>الكمية / العدد:</span><b>{p.quantity}</b></div>}
        {p.price&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>سعر البيع:</span><b dir="ltr">{Number(p.price).toLocaleString()} {raw.currency}</b></div>}
        {p.cost&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>سعر التكلفة:</span><b dir="ltr">{Number(p.cost).toLocaleString()} {raw.currency}</b></div>}
       </>
      )}

      {isVoucher&&(
       <>
        {p.treasuryName&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>الخزينة / البنك:</span><b>{p.treasuryName}</b></div>}
        {p.person&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>الشخص / المستلم:</span><b>{p.person}</b></div>}
        {p.chequeNumber&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#64748b'}}>رقم الشيك:</span><b dir="ltr">{p.chequeNumber}</b></div>}
        {p.crossCurrency&&(
         <div style={{background:'#f0fdf4',padding:'6px 8px',borderRadius:'6px',color:'#166534'}}>
          <span>تسوية عملة: سداد {p.treasuryMinor?money(p.treasuryMinor):''} {p.treasuryCurrency} لتغطية {p.transactionMinor?money(p.transactionMinor):''} {p.transactionCurrency}</span>
         </div>
        )}
       </>
      )}

      {p.notes&&<div style={{display:'flex',justifyContent:'space-between',borderTop:'1px dashed #cbd5e1',paddingTop:'4px'}}><span style={{color:'#64748b'}}>ملاحظات:</span><span>{p.notes}</span></div>}
     </div>

     {/* Action Buttons */}
     <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}>
      <button
       type="button"
       className="blue-button"
       style={{display:'inline-flex',alignItems:'center',gap:'8px',padding:'9px 18px',fontSize:'13px',fontWeight:700,background:'#0284c7',borderColor:'#0369a1'}}
       onClick={()=>{
        const toOpen=activeEntry;
        setActiveEntry(null);
        openRecordWorkspace(toOpen);
       }}
      >
       <Pencil size={15}/>
       <span>الانتقال إلى شاشة العملية للتعديل ✏️</span>
      </button>

      <button
       type="button"
       className="gray-button"
       style={{padding:'9px 18px',fontWeight:600}}
       onClick={()=>setActiveEntry(null)}
      >
       إغلاق
      </button>
     </div>
    </DialogContent>
   </Dialog>
  </>
 );
}
