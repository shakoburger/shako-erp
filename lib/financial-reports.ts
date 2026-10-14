import {accountBalances,type FinanceRow} from './balances';
import {ticketSupplierName,ticketSupplierDue,calculateRefundTotals} from './tickets';
import {money} from './domain';
const masterKinds=new Set(['customer','account','employee','cash-account','bank-account']);

function formatPaxTickets(ticket?:FinanceRow):string{
 if(!ticket)return '';
 const passengers=ticket.payload?.passengers;
 if(Array.isArray(passengers)&&passengers.length>0){
  const items=passengers.map((p:any)=>{
   const name=(p.name||'').trim(),tkt=(p.ticketNo||'').trim();
   if(name&&tkt)return `${name} (${tkt})`;
   return name||tkt||'';
  }).filter(Boolean);
  if(items.length>0)return items.join(' / ');
 }
 const code=ticket.code&&ticket.code!==ticket.id?ticket.code.trim():'';
 const name=(ticket.name||'').trim();
 if(name&&code)return `${name} (${code})`;
 return name||code||'';
}

export function statementReport(rows:FinanceRow[],key:string,from:string,to:string,all=false,modules?:Record<string,boolean>){
 const opening=all?0:accountBalances(rows,previousDate(from),modules).find(a=>a.key===key)?.balanceMinor||0;
 const events=rows.flatMap(r=>{
  const rPayload=r.payload;
  if(r.kind==='ticket'&&rPayload.status==='refunded'){
   const ref=calculateRefundTotals(rPayload);
   const hasOrig=Boolean(rPayload.originalSellMinor||rPayload.originalAmount||rPayload.originalTicketId||rPayload.originalSupplierDue||ref.originalSellMinor);
   if(hasOrig){
    const ticketRow=r;
    const paxWithTickets=formatPaxTickets(ticketRow);
    const directReceipt=r.payload.receiptNumber;
    const reference=directReceipt?String(directReceipt):(r.code&&r.code!==r.id?r.code:'—');
    const supplier=rPayload.supplierId||'supplier:'+ticketSupplierName(rPayload);
    const defaultTicketComm=rows.find(m=>['account','income'].includes(m.kind)&&(m.name==='عمولات التذاكر'||m.name==='عمولة التذاكر'||m.payload?.accountType==='commission'));
    const commAcc=rPayload.commissionAccountId||defaultTicketComm?.id||'income:ticket';
    const origSell=rPayload.originalSellMinor??ref.originalSellMinor;
    const origCost=rPayload.originalCostMinor??ref.originalCostMinor;
    const custRefund=rPayload.customerRefundMinor??ref.customerRefundMinor;
    const supRefund=rPayload.supplierRefundMinor??ref.supplierRefundMinor;
    const refIncome=rPayload.refundIncomeMinor??(rPayload.refundCommMinor??ref.incomeMinor);
        const refDate=rPayload.refundDate||r.date;
    const res=[];
    if(r.date<=to&&(all||r.date>=from)){
     let deb=0,cred=0,mov=0;
     if(key===JSON.stringify([rPayload.customerId,r.currency])){
      deb=origSell;cred=0;mov=origSell;
     }else if(key===JSON.stringify([supplier,r.currency])){
      deb=0;cred=origCost;mov=-origCost;
     }
     if(deb||cred){
      res.push({
       id:r.id+':orig',
       date:r.date,
       reference,
       description:[paxWithTickets||r.name,rPayload.route,'تذكرة أصلية'].filter(Boolean).join(' · '),
       rate:null,
       opening:false,
       sortAt:(r.createdAt||'')+'_0',
       debitMinor:deb,
       creditMinor:cred,
       movementMinor:mov,
       sourceId:r.id,
       sourceKind:'ticket',
       rawRecord:r
      });
     }
    }
    if(refDate<=to&&(all||refDate>=from)){
     let deb=0,cred=0,mov=0;
     if(key===JSON.stringify([rPayload.customerId,r.currency])){
      deb=0;cred=custRefund;mov=-custRefund;
     }else if(key===JSON.stringify([supplier,r.currency])){
      deb=supRefund;cred=0;mov=supRefund;
     }else if(key===JSON.stringify([commAcc,r.currency])){
      if(refIncome>=0){deb=0;cred=refIncome;mov=-refIncome;}
      else{deb=-refIncome;cred=0;mov=-refIncome;}
     }
     if(deb||cred){
      const refDesc=[
       'استرداد تذكرة',
       paxWithTickets||r.name,
       rPayload.route,
       rPayload.penalties?('غرامة خطوط: '+rPayload.penalties):'',
       rPayload.refundComm?('عمولة استرداد: '+rPayload.refundComm):'',
       rPayload.notes
      ].filter(Boolean).join(' · ');
      res.push({
       id:r.id+':ref',
       date:refDate,
       reference:rPayload.refundReceiptNumber?String(rPayload.refundReceiptNumber):reference,
       description:refDesc,
       rate:null,
       opening:false,
       sortAt:(r.createdAt||'')+'_1',
       debitMinor:deb,
       creditMinor:cred,
       movementMinor:mov,
       sourceId:r.id,
       sourceKind:'ticket',
       rawRecord:r
      });
     }
    }
    if(res.length)return res;
   }
  }

  const date=r.payload.type?.startsWith('cheque-')?r.payload.clearedDate||r.date:r.date;
  if(date>to||!all&&date<from)return [];
  const isCrossSettlementLeg=Boolean(
   ['cash-voucher','bank-voucher'].includes(r.kind)&&
   r.payload?.crossCurrency&&
   r.payload?.treasuryCurrency&&
   r.payload?.treasuryCurrency!==r.payload?.transactionCurrency&&
   key===JSON.stringify([r.payload.counterpartyId,r.payload.treasuryCurrency])
  );
  if(isCrossSettlementLeg){
   const p=r.payload;
   const vCode=r.code&&r.code!==r.id?r.code:null;
   const directReceipt=p.receiptNumber?String(p.receiptNumber):null;
   const reference=vCode||directReceipt||'—';
   const rateVal=p.rate?Number(p.rate):null;
   const typeTitle=r.kind==='bank-voucher'?'إيداع بنك':(p.type==='receipt'?'سند قبض':'سند صرف');
   const desc=[
    typeTitle,
    p.treasuryName,
    `سداد ${p.treasuryMinor?money(p.treasuryMinor):''} ${p.treasuryCurrency} لتغطية ${p.transactionMinor?money(p.transactionMinor):''} ${p.transactionCurrency}`,
    rateVal?`سعر الصرف ${rateVal}`:'',
    `تسوية عملة مقابل ${p.transactionCurrency} (الأثر الصافي = 0)`,
    p.notes
   ].filter(Boolean).join(' · ');
   return [{
    id:r.id+':cross-sdg',
    date,
    reference,
    description:desc,
    rate:rateVal,
    opening:false,
    sortAt:(r.createdAt||'')+'_cross',
    debitMinor:0,
    creditMinor:0,
    movementMinor:0,
    sourceId:r.id,
    sourceKind:r.kind,
    rawRecord:r
   }];
  }
  const effect=accountBalances([r],'9999-12-31',modules).find(a=>a.key===key);
  if(!effect||!effect.debitMinor&&!effect.creditMinor)return [];
  const voucher=rows.find(v=>v.id===(r.payload.cashVoucherId||r.payload.bankVoucherId));
  const automatic=['cash','bank'].includes(r.kind)&&!voucher&&Boolean(r.payload.sourceId),original=automatic?rows.find(v=>v.id===r.payload.sourceId):undefined;
  const source=voucher||original||r,p=(voucher||r).payload,conversion=p.transactionCurrency&&p.treasuryCurrency&&p.transactionCurrency!==p.treasuryCurrency;
  const storedRate=p.rate??r.payload.rate,rate=masterKinds.has(r.kind)?null:Number(storedRate)>0?Number(storedRate):conversion?null:1;
  const ticketRow=r.kind==='ticket'?r:(original&&original.kind==='ticket'?original:undefined);
  const paxWithTickets=formatPaxTickets(ticketRow);
  const voucherCode=voucher?.code&&voucher.code!==voucher.id?voucher.code:null;
  const directReceipt=r.payload.receiptNumber||voucher?.payload?.receiptNumber||original?.payload?.receiptNumber;
  const fallbackCode=r.kind!=='ticket'&&r.code&&!r.code.startsWith('payment:')&&!r.code.startsWith('voucher:')&&r.code!==r.id?r.code:null;
  const reference=voucherCode||directReceipt||fallbackCode||'—';
  const description=masterKinds.has(r.kind)?'رصيد افتتاحي · '+r.name:r.kind==='ticket'?[p.status==='refunded'?'استرداد تذكرة':null,paxWithTickets||r.name,r.payload.route,r.payload.notes,conversion&&rate?`1 ${p.transactionCurrency} = ${rate} ${p.treasuryCurrency}`:''].filter(Boolean).join(' · '):r.kind==='service'?[r.name||'خدمة',r.payload?.quantity>1?`العدد: ${r.payload.quantity}`:'',r.payload?.notes,conversion&&rate?`1 ${p.transactionCurrency} = ${rate} ${p.treasuryCurrency}`:''].filter(Boolean).join(' · '):automatic&&original&&original.kind==='ticket'?['تحصيل آلي',paxWithTickets||original.name,r.payload.notes,conversion&&rate?`1 ${p.transactionCurrency} = ${rate} ${p.treasuryCurrency}`:''].filter(Boolean).join(' · '):automatic&&original&&original.kind==='service'?['تحصيل آلي',original.name||'خدمة',r.payload.notes].filter(Boolean).join(' · '):[automatic&&!r.name.startsWith('تحصيل آلي')?'تحصيل آلي':'',paxWithTickets||r.name,r.payload.route,r.payload.notes,p.chequeNumber?'شيك '+p.chequeNumber:'',conversion&&rate?`1 ${p.transactionCurrency} = ${rate} ${p.treasuryCurrency}`:''].filter(Boolean).join(' · ');
  return [{id:r.id,date,reference,description,rate,opening:masterKinds.has(r.kind),sortAt:source.createdAt||r.createdAt||'',debitMinor:effect.debitMinor,creditMinor:effect.creditMinor,movementMinor:effect.balanceMinor,sourceId:source.id,sourceKind:source.kind,rawRecord:source}];
 }).sort((a,b)=>a.date.localeCompare(b.date)||Number(b.opening)-Number(a.opening)||a.sortAt.localeCompare(b.sortAt)||a.reference.localeCompare(b.reference)||a.id.localeCompare(b.id));
 let balance=opening;const entries=events.map(e=>({...e,balanceMinor:balance+=e.movementMinor}));
 return {openingMinor:opening,entries,debitMinor:entries.reduce((s,e)=>s+e.debitMinor,0),creditMinor:entries.reduce((s,e)=>s+e.creditMinor,0),closingMinor:balance};
}
function previousDate(date:string){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return Number.isNaN(d.valueOf())?'0000-01-01':d.toISOString().slice(0,10)}
export type SalesSummary={key:string;supplier:string;currency:string;quantity:number;fareMinor:number;taxMinor:number;baseMinor:number;customerMinor:number;supplierMinor:number;commissionMinor:number;discountMinor:number;brokerMinor:number;incomeMinor:number};
export function dailySales(rows:FinanceRow[],from:string,to:string,currency='all',economy=false){
 const groups=new Map<string,SalesSummary>();
 for(const r of rows){const p=r.payload;if(r.kind!=='ticket'||p.status&&p.status!=='active'||r.date<from||r.date>to||currency!=='all'&&r.currency!==currency||economy&&!p.flags?.['Non IATA'])continue;
  const supplier=ticketSupplierName(p),key=JSON.stringify([p.supplierId||supplier,r.currency]);const g=groups.get(key)||{key,supplier,currency:r.currency,quantity:0,fareMinor:0,taxMinor:0,baseMinor:0,customerMinor:0,supplierMinor:0,commissionMinor:0,discountMinor:0,brokerMinor:0,incomeMinor:0};
  const fare=Math.round(Number(p.fare||0)*100),tax=Object.values(p.taxes||{}).reduce<number>((s,v)=>s+Math.round(Number(v||0)*100),0),due=ticketSupplierDue(r),broker=p.flags?.Broker?(p.brokerCommissionMinor??Math.round(Number(p.brokerCommission||0)*100)):0;
  g.quantity++;g.fareMinor+=fare;g.taxMinor+=tax;g.baseMinor+=p.ticketBaseMinor??fare+tax;g.customerMinor+=r.amount;g.supplierMinor+=due;g.commissionMinor+=r.amount-due;g.discountMinor+=Math.round(fare*Number(p.discountPct||0)/100)+Math.round(Number(p.discount||0)*100);g.brokerMinor+=broker;g.incomeMinor+=p.incomeMinor??r.amount-due-broker;groups.set(key,g);
 }
 return [...groups.values()].sort((a,b)=>a.currency.localeCompare(b.currency)||a.supplier.localeCompare(b.supplier));
}
