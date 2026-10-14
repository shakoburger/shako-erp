import {ticketSupplierDue,ticketSupplierName,calculateRefundTotals} from './tickets';
export type AccountBalance={key:string;accountId:string;kind:string;name:string;currency:string;debitMinor:number;creditMinor:number;balanceMinor:number};
export type FinanceRow={id:string;kind:string;name:string;date:string;currency:string;amount:number;payload:Record<string,any>;code?:string;createdAt?:string};
export const balanceModule=(kind:string)=>({customer:'customers',account:'accounts',employee:'employees','cash-account':'cash','bank-account':'banks',supplier:'tickets',income:'customers',expense:'accounts'} as Record<string,string>)[kind];
export function accountBalances(rows:FinanceRow[],until='9999-12-31',modules?:Record<string,boolean>){
 const masters=new Map(rows.filter(r=>['customer','account','expense','employee','cash-account','bank-account'].includes(r.kind)).map(r=>[r.id,r]));
 const result=new Map<string,AccountBalance>();
 const add=(id:string,kind:string,name:string,currency:string,amount:number)=>{
  if(modules&&balanceModule(kind)&&!modules[balanceModule(kind)])return;
  const key=JSON.stringify([id,currency]);const a=result.get(key)||{key,accountId:id,kind,name:masters.get(id)?.name||name,currency,debitMinor:0,creditMinor:0,balanceMinor:0};
  a.debitMinor+=Math.max(amount,0);a.creditMinor+=Math.max(-amount,0);a.balanceMinor+=amount;result.set(key,a);
 };
 const linked=(id:string,name:string,currency:string,amount:number,kind='account')=>add(id,masters.get(id)?.kind||kind,name,currency,amount);
 for(const a of masters.values())if(a.date<=until&&(a.kind!=='customer'||a.amount))add(a.id,a.kind,a.name,a.currency,a.amount);
 for(const r of rows){const p=r.payload;if(r.date>until||p.status&&p.status!=='active'&&p.status!=='refunded')continue;
  if(['cash','bank'].includes(r.kind)){
   add(p.treasuryId||r.kind+':unallocated',r.kind==='cash'?'cash-account':'bank-account',p.treasuryName||(r.kind==='cash'?'نقد غير مخصص لخزينة':'بنك غير مخصص'),r.currency,r.amount);
   // Vouchers below supply the counterpart once. Automatic collections have no voucher.
   if(p.customerId&&!p.cashVoucherId&&!p.bankVoucherId)linked(p.customerId,p.customerName||'عميل',p.customerCurrency||r.currency,-(p.customerAmountMinor??r.amount),'customer');
  }
  if(['cash-voucher','bank-voucher'].includes(r.kind)){
   if(p.type?.startsWith('cheque-')&&(p.chequeStatus!=='cleared'||p.clearedDate>until))continue;
   if(['cash-account','bank-account'].includes(p.counterpartyKind))continue; // already an asset ledger leg
   const incoming=['receipt','deposit','cheque-receive'].includes(p.type);
   linked(p.counterpartyId,p.counterpartyName,p.transactionCurrency,(incoming?-1:1)*p.transactionMinor,p.counterpartyKind||'account');
   if(p.crossCurrency&&p.treasuryCurrency&&p.treasuryCurrency!==p.transactionCurrency){
    linked(p.counterpartyId,p.counterpartyName,p.treasuryCurrency,0,p.counterpartyKind||'account');
   }
  }
  if(['ticket','service','visa'].includes(r.kind)){
   if(r.kind!=='ticket'&&p.customerId)linked(p.customerId,p.customerName||'عميل',r.currency,r.amount,'customer');
   if(r.kind==='ticket'){
    if(p.status==='refunded'){
     const supplier=p.supplierId||'supplier:'+ticketSupplierName(p);
     const refDate=p.refundDate||r.date;
     const originalEffective=r.date<=until;
     const refundEffective=refDate<=until;
     const ref=calculateRefundTotals(p);
     const hasOrig=Boolean(p.originalSellMinor||p.originalAmount||p.originalTicketId||p.originalSupplierDue||ref.originalSellMinor);
     if(hasOrig&&originalEffective){
      const origSell=p.originalSellMinor??ref.originalSellMinor;
      const origCost=p.originalCostMinor??ref.originalCostMinor;
      if(p.customerId)linked(p.customerId,p.customerName||'عميل',r.currency,origSell,'customer');
      add(supplier,masters.get(supplier)?.kind||(p.supplierId?'account':'supplier'),ticketSupplierName(p),r.currency,-origCost);
     }
     if(refundEffective){
      const custRefund=p.customerRefundMinor??ref.customerRefundMinor;
      const supRefund=p.supplierRefundMinor??ref.supplierRefundMinor;
      const refIncome=p.refundIncomeMinor??(p.refundCommMinor??ref.incomeMinor);
      if(p.customerId)linked(p.customerId,p.customerName||'عميل',r.currency,-custRefund,'customer');
      add(supplier,masters.get(supplier)?.kind||(p.supplierId?'account':'supplier'),ticketSupplierName(p),r.currency,supRefund);
      const defaultTicketComm=[...masters.values()].find(m=>m.name==='عمولات التذاكر'||m.name==='عمولة التذاكر'||m.payload?.accountType==='commission');
      const commAcc=p.commissionAccountId||defaultTicketComm?.id||'income:ticket';
      const commName=masters.get(commAcc)?.name||'عمولات التذاكر';
      add(commAcc,masters.get(commAcc)?.kind||'income',commName,r.currency,-refIncome);
     }
    }else{
     const custAmount=r.amount>0?r.amount:(p.totalMinor>0?p.totalMinor:(p.sellingPrice?Math.round(Number(p.sellingPrice)*100):0));
     if(p.customerId)linked(p.customerId,p.customerName||'عميل',r.currency,custAmount,'customer');
     const supplier=p.supplierId||'supplier:'+ticketSupplierName(p);
     const supDue=ticketSupplierDue(r);
     add(supplier,masters.get(supplier)?.kind||(p.supplierId?'account':'supplier'),ticketSupplierName(p),r.currency,-supDue);
     const broker=p.flags?.Broker?(p.brokerCommissionMinor??Math.round(Number(p.brokerCommission||0)*100)):0;
     if(broker&&p.brokerId)linked(p.brokerId,p.brokerName||'بروكر',r.currency,-broker);
     const defaultTicketComm=[...masters.values()].find(m=>m.name==='عمولات التذاكر'||m.name==='عمولة التذاكر'||m.payload?.accountType==='commission');
     const commAcc=p.commissionAccountId||defaultTicketComm?.id||'income:ticket';
     const commName=masters.get(commAcc)?.name||'عمولات التذاكر';
     const incomeAmount=(p.incomeMinor!==undefined&&p.incomeMinor!==0)?p.incomeMinor:(custAmount-supDue-broker);
     add(commAcc,masters.get(commAcc)?.kind||'income',commName,r.currency,-incomeAmount);
    }
   }else if(r.kind==='service'){
    const qty=Number(p.quantity||1);
    const unitCost=Number(p.cost||0);
    const totalCostMinor=Math.round(unitCost * qty * 100);
    const supplierDueMinor=p.supplierDueMinor!==undefined?Number(p.supplierDueMinor):totalCostMinor;
    const broker=p.flags?.Broker?(p.brokerCommissionMinor??Math.round(Number(p.brokerCommission||0)*100)):0;
    if(p.supplierId){
     const supName=p.supplierName||masters.get(p.supplierId)?.name||'مورد الخدمة';
     add(p.supplierId,masters.get(p.supplierId)?.kind||'supplier',supName,r.currency,-supplierDueMinor);
    }
    if(broker&&p.brokerId){
     linked(p.brokerId,p.brokerName||'بروكر',r.currency,-broker);
    }
    const incomeMinor=r.amount - (p.supplierId?supplierDueMinor:0) - broker;
    const defaultComm=[...masters.values()].find(m=>m.name==='عمولات الخدمات'||m.name==='عمولة الخدمات');
    const commAcc=p.commissionAccountId||defaultComm?.id||'income:service';
    const commName=masters.get(commAcc)?.name||'عمولات الخدمات';
    add(commAcc,masters.get(commAcc)?.kind||'income',commName,r.currency,-incomeMinor);
   }else add('income:'+r.kind,'income',r.kind==='service'?'دخل الخدمات':'دخل التأشيرات',r.currency,-r.amount);
  }
  if(r.kind==='expense')add('expense:'+r.id,'expense',r.name,r.currency,Math.abs(r.amount));
 }
 return [...result.values()].sort((a,b)=>a.currency.localeCompare(b.currency)||a.name.localeCompare(b.name));
}
export type OperationReport={modules:string[];id:string;action:string;reference:string;date:string;at:string;actor:string;notes:string;effects:(AccountBalance&{beforeMinor:number;movementMinor:number;debitMovementMinor:number;creditMovementMinor:number;afterMinor:number})[]};
export function operationReport(before:FinanceRow[],after:FinanceRow[],action:string,id:string,actor:string):OperationReport{
 const a=new Map(accountBalances(before).map(r=>[r.key,r])),b=new Map(accountBalances(after).map(r=>[r.key,r]));
 const row=after.find(r=>r.id===id)||before.find(r=>r.id===id),effects:OperationReport['effects']=[];
 for(const key of new Set([...a.keys(),...b.keys()])){const prev=a.get(key),next=b.get(key),item=next||prev!;const movementMinor=(next?.balanceMinor||0)-(prev?.balanceMinor||0);
  const debit=(next?.debitMinor||0)-(prev?.debitMinor||0),credit=(next?.creditMinor||0)-(prev?.creditMinor||0);
  if(movementMinor||debit||credit||item.accountId===id)effects.push({...item,beforeMinor:prev?.balanceMinor||0,movementMinor,debitMovementMinor:Math.max(debit,0)+Math.max(-credit,0),creditMovementMinor:Math.max(credit,0)+Math.max(-debit,0),afterMinor:next?.balanceMinor||0});
 }
 const required=new Set<string>([(row as any)?.module].filter(Boolean));for(const e of effects){const module=({customer:'customers',account:'accounts',employee:'employees','cash-account':'cash','bank-account':'banks',supplier:'tickets',income:'customers',expense:'accounts'} as Record<string,string>)[e.kind];if(module)required.add(module)}
 const p=row?.payload;
 const isUUID=(s?:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
 const meaningfulCode=(row?.code&&!isUUID(row.code)&&row.code!==row.id)?row.code.trim():'';
 const refReceipt=row?.payload?.receiptNumber?.toString().trim();
 const refName=row?.name?.trim();
 const cleanRef=(refReceipt?`إيصال #${refReceipt}`:'')||refName||meaningfulCode||'';
 return {modules:[...required],id:crypto.randomUUID(),action,reference:cleanRef,date:row?.date||'',at:new Date().toISOString(),actor,notes:p?.notes|| (p?.chequeStatus==='pending'?'تم حفظ الشيك دون أثر مالي حتى التمرير.':effects.length?'':'حفظ بيانات دون تغيير الأرصدة.'),effects};
}
