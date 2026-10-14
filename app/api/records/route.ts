import {activeAccountSQL,requireActiveAccount} from '@/lib/financial-accounts';
import {reportedBatch} from '@/lib/reported-batch';
import {manage,activeCurrency,postingDate,context,handled,json,body,sameOrigin,recordSchema,gate,APIError,unlockedSQL} from '@/lib/server';
import {kinds,moduleEnabled} from '@/lib/domain';
import {ticketTotals,ticketSupplierName,sameTicketPricing} from '@/lib/tickets';
const unpack=(r:any)=>({...r,payload:JSON.parse(r.payload),createdAt:r.created_at,updatedAt:r.updated_at});
export async function GET(req:Request){return handled(async()=>{const c=await context();const kind=new URL(req.url).searchParams.get('kind');if(!kind)throw new APIError(400,'حدد نوع البيانات');if(kind==='all'){gate(c,'reports');const allowed=Object.keys(c.settings.modules).filter(k=>moduleEnabled(c.settings,k as any));if(!allowed.length)return json([]);const r=await c.database.prepare(`SELECT * FROM records WHERE module IN (${allowed.map(()=>'?').join(',')}) ORDER BY date DESC, created_at DESC`).bind(...allowed).all();return json(r.results.map(unpack))}if(!kinds[kind])throw new APIError(400,'نوع بيانات غير صحيح');gate(c,kinds[kind].module);const r=await c.database.prepare('SELECT * FROM records WHERE kind = ? ORDER BY date DESC, created_at DESC').bind(kind).all();return json(r.results.map(unpack))})}
export async function POST(req:Request){return handled(async()=>{sameOrigin(req);const c=await context();const b=recordSchema.parse(await body(req));const module=kinds[b.kind].module;manage(c,module);const now=new Date().toISOString();const id=b.id||crypto.randomUUID();let amount=Math.round(b.amount*100);const payload:Record<string,any>={...b.payload};let existing:any=null;if(b.id){existing=await c.database.prepare('SELECT * FROM records WHERE id = ? AND kind = ?').bind(id,b.kind).first();if(!existing)throw new APIError(404,'السجل غير موجود')}
 if(b.kind==='customer'){
  if(!existing&&b.amount)throw new APIError(400,'رصيد العميل يسجل بحركة مالية بعملتها، وليس في بيانات العميل');
  b.currency=existing?.currency||'MULTI';amount=existing?.amount||0;if(payload.creditLimit===undefined&&existing){try{payload.creditLimit=JSON.parse(existing.payload).creditLimit;}catch{}}
 }
 if(b.kind!=='customer'&&b.currency!=='MULTI'&&!['EGP','USD','AED','SDG'].includes(b.currency)&&!await c.database.prepare("SELECT id FROM records WHERE kind='cash-currency' AND currency=?").bind(b.currency).first())throw new APIError(400,'العملة غير مسجلة');
 if(b.kind!=='customer'&&b.currency!=='MULTI')activeCurrency(c,b.currency,!!existing&&existing.currency===b.currency&&(['customer','account','employee','expense'].includes(b.kind)||['refunded','cancelled'].includes(payload.status)));if(kinds[b.kind].financial)postingDate(c,b.date,existing?.date);
 if(b.kind==='ticket'){
  if(!b.code||!b.code.split(/[,;\s\/]+/).filter(Boolean).every(t=>/^\d{8,16}$/.test(t)))throw new APIError(400,'رقم التذكرة يجب أن يتكون من 8 إلى 16 رقمًا');
  const nonIata=!!payload.flags?.['Non IATA'];
  const old=existing?JSON.parse(existing.payload):null;if(old?.brokerId||old?.supplierId)manage(c,'accounts');
  const historicalEdit=old&&existing.currency===b.currency&&old.customerId===payload.customerId&&sameTicketPricing(payload,old)&&payload.payment===old.payment&&payload.treasuryId===old.treasuryId&&payload.brokerId===old.brokerId&&Number(payload.brokerCommission||0)===Number(old.brokerCommission||0)&&ticketSupplierName(payload)===ticketSupplierName(old);
  const legacyBroker=old?.flags?.Broker&&payload.flags?.Broker&&!old.brokerId&&!payload.brokerId&&!Number(payload.brokerCommission||0)&&historicalEdit;
  const legacySupplier=old?.flags?.['Non IATA']&&!old.vendor&&old.airline===payload.airline;
  const airlineName = (payload.airline || '').trim();
  const airlineSupplierId = payload.supplierId || '';
  const dbAirline = airlineName ? await c.database.prepare("SELECT id, name FROM records WHERE (TRIM(LOWER(name)) = TRIM(LOWER(?)) OR (id = ? AND id != '')) AND (kind='account' OR (kind='customer' AND json_extract(payload,'$.accountType')='airline'))").bind(airlineName, airlineSupplierId).first<any>() : null;
  const isAirlineKnown = Boolean((old && old.airline === payload.airline) || dbAirline);
  if (!nonIata && !payload.supplierId && dbAirline?.id) {
    payload.supplierId = dbAirline.id;
  }

  if(!payload.customerId||payload.fare===undefined||(!nonIata&&!isAirlineKnown)||(nonIata&&!payload.vendor&&!legacySupplier))throw new APIError(400,'اختر العميل والخطوط أو المورد وأدخل سعر التذكرة');
  if(payload.airline&&!isAirlineKnown)throw new APIError(400,'شركة الطيران غير مسجلة في دليل الحسابات؛ يرجى إضافتها أولاً في حسابات الخطوط');
  manage(c,'customers');const customer=await c.database.prepare("SELECT name,currency FROM records WHERE id = ? AND kind = 'customer'").bind(payload.customerId).first<any>();if(!customer)throw new APIError(400,'العميل غير موجود');
  if(payload.flags?.Broker&&!legacyBroker){if(!payload.brokerId)throw new APIError(400,'اختر حساب البروكر');const broker=await c.database.prepare("SELECT * FROM records WHERE id=? AND kind IN ('account','customer')").bind(payload.brokerId).first<any>();if(!broker||(broker.kind==='account'&&broker.currency!=='MULTI'&&broker.currency!==b.currency))throw new APIError(400,'اختر حساب بروكر بنفس عملة التذكرة');payload.brokerName=broker.name;if(broker.kind==='account')manage(c,'accounts');else manage(c,'customers');}else if(!legacyBroker){delete payload.brokerId;payload.brokerCommission=0;delete payload.brokerName}
  if(payload.supplierId){const supplier=await c.database.prepare("SELECT * FROM records WHERE id=? AND kind IN ('account','customer')").bind(payload.supplierId).first<any>();if(!supplier)throw new APIError(400,'حساب المورد غير موجود');if(supplier.kind==='account'&&supplier.currency!=='MULTI'&&supplier.currency!==b.currency)throw new APIError(400,'حساب المورد يجب أن يطابق عملة التذكرة');if(supplier.name.trim().toLowerCase()!==ticketSupplierName(payload).trim().toLowerCase()&&!(old?.supplierId===payload.supplierId&&ticketSupplierName(old)===ticketSupplierName(payload)))throw new APIError(400,'اسم المورد لا يطابق الحساب المحدد');if(supplier.kind==='account')manage(c,'accounts');else manage(c,'customers');}
  if(payload.commissionAccountId){const commAcc=await c.database.prepare("SELECT * FROM records WHERE id=?").bind(payload.commissionAccountId).first<any>();if(commAcc){if(commAcc.currency!=='MULTI'&&commAcc.currency!==b.currency)throw new APIError(400,'حساب العمولات يجب أن يطابق عملة التذكرة');payload.commissionAccountName=commAcc.name;}}const totals=ticketTotals(payload,existing?{payload:old,amount:existing.amount}:undefined);
  if(!Object.values(totals).every(Number.isSafeInteger))throw new APIError(400,'إجمالي التذكرة أكبر من المسموح');
  if(totals.totalMinor<0)throw new APIError(400,'الخصم أكبر من إجمالي سعر الراكب');
  if(totals.pricingVersion>=2&&totals.supplierDueMinor<0)throw new APIError(400,'العمولة الداخلية أكبر من سعر التذكرة');
  amount=totals.totalMinor;
   if(!payload.receiptNumber){
    const maxRow=await c.database.prepare("SELECT payload FROM records WHERE kind = 'ticket'").all<any>();
    let max=0;
    for(const r of (maxRow.results||[])){
     try{
      const num=parseInt(JSON.parse(r.payload).receiptNumber,10);
      if(!isNaN(num)&&num>max)max=num;
     }catch{}
    }
    payload.receiptNumber=String(max+1);
   }
  Object.assign(payload,{...totals,customerName:customer.name,supplierName:ticketSupplierName(payload),status:payload.status||'active'});
  if(old&&old.status!=='active'&&old.status!==payload.status)throw new APIError(400,'لا يمكن إعادة فتح تذكرة ملغاة أو مستردة');
 }
 if(b.kind==='service'){
  if(!payload.receiptNumber){
   const maxRow=await c.database.prepare("SELECT payload FROM records WHERE kind IN ('service','ticket')").all<any>();
   let max=198;
   for(const r of (maxRow.results||[])){
    try{
     const num=parseInt(JSON.parse(r.payload).receiptNumber,10);
     if(!isNaN(num)&&num>max)max=num;
    }catch{}
   }
   payload.receiptNumber=String(max+1).padStart(8,'0');
  }
  if(payload.supplierId){
   const supplier=await c.database.prepare("SELECT * FROM records WHERE id=? AND kind IN ('account','customer')").bind(payload.supplierId).first<any>();
   if(!supplier)throw new APIError(400,'حساب المورد غير موجود');
   if(supplier.kind==='account'&&supplier.currency!=='MULTI'&&supplier.currency!==b.currency)throw new APIError(400,'حساب المورد يجب أن يطابق عملة الخدمة');
   payload.supplierName=supplier.name;
   if(supplier.kind==='account')manage(c,'accounts');else manage(c,'customers');
  }
  if(payload.flags?.Broker&&payload.brokerId){
   const broker=await c.database.prepare("SELECT * FROM records WHERE id=? AND kind IN ('account','customer')").bind(payload.brokerId).first<any>();
   if(!broker||(broker.kind==='account'&&broker.currency!=='MULTI'&&broker.currency!==b.currency))throw new APIError(400,'اختر حساب بروكر بنفس عملة الخدمة');
   payload.brokerName=broker.name;
   if(broker.kind==='account')manage(c,'accounts');else manage(c,'customers');
  }
  if(payload.commissionAccountId){
   const commAcc=await c.database.prepare("SELECT * FROM records WHERE id=?").bind(payload.commissionAccountId).first<any>();
   if(commAcc){
    if(commAcc.currency!=='MULTI'&&commAcc.currency!==b.currency)throw new APIError(400,'حساب العمولات يجب أن يطابق عملة الخدمة');
    payload.commissionAccountName=commAcc.name;
   }
  }
  const qty=Number(payload.quantity||1);
  const cost=Number(payload.cost||0);
  const supDue=Math.round(cost*qty*100);
  const brkComm=payload.flags?.Broker?Math.round(Number(payload.brokerCommission||0)*100):0;
  payload.costMinor=Math.round(cost*100);
  payload.priceMinor=Math.round(Number(payload.price||0)*100);
  payload.discountMinor=Math.round(Number(payload.discount||0)*100);
  payload.supplierDueMinor=supDue;
  payload.brokerCommissionMinor=brkComm;
  payload.incomeMinor=amount-(payload.supplierId?supDue:0)-brkComm;
 }
 if(existing && JSON.parse(existing.payload).systemGenerated)throw new APIError(400,'هذه حركة آلية. عدل العملية الأصلية.'); if(b.kind==='expense'||(['cash','bank'].includes(b.kind)&&payload.direction==='payment'))amount=-amount; if(payload.customerId&&b.kind!=='ticket'){manage(c,'customers');const customer=await c.database.prepare("SELECT name,currency FROM records WHERE id = ? AND kind = 'customer'").bind(payload.customerId).first<any>();if(!customer)throw new APIError(400,'العميل غير موجود');Object.assign(payload,{customerName:customer.name})} if(existing&&['ticket','service','visa'].includes(b.kind)){const oldPayment=JSON.parse(existing.payload).payment;if(oldPayment==='cash')manage(c,'cash');if(oldPayment==='bank')manage(c,'banks')}const settlementKind=payload.payment==='cash'?'cash':payload.payment==='bank'?'bank':null;if(settlementKind&&['ticket','service','visa'].includes(b.kind))manage(c,settlementKind==='cash'?'cash':'banks');
 const postsSettlement=settlementKind&&['ticket','service','visa'].includes(b.kind)&&(b.kind!=='ticket'||payload.status==='active');
 const assetKind=['cash','bank'].includes(b.kind)?b.kind:postsSettlement?settlementKind:null;
 if(assetKind){
  if(!payload.treasuryId)throw new APIError(400,'اختر حساب الخزينة أو البنك للتحصيل');
  const treasury=await c.database.prepare('SELECT * FROM records WHERE id=? AND kind IN ("cash-account","bank-account")').bind(payload.treasuryId).first<any>();
  const isCross=!!payload.crossCurrency;
  const treasuryCurrency=isCross?(payload.settlementCurrency||treasury?.currency):b.currency;
  if(!treasury||(!isCross&&treasury.currency!=='MULTI'&&treasury.currency!==b.currency))throw new APIError(400,'اختر حساب خزينة أو بنك بنفس عملة العملية أو حدد التسوية بعملة أخرى');
  if(isCross&&treasury.currency!=='MULTI'&&treasury.currency!==treasuryCurrency)throw new APIError(400,'حساب التحصيل يجب أن يطابق عملة التسوية المختارة');
  if(['ticket','service','visa'].includes(b.kind)&&!payload.customerId)throw new APIError(400,'اختر العميل للتحصيل');
  requireActiveAccount({...treasury,payload:JSON.parse(treasury.payload)});Object.assign(payload,{treasuryName:treasury.name,treasuryKind:treasury.kind});manage(c,treasury.kind==='bank-account'?'banks':'cash');
 }else delete payload.treasuryId;
 const code=b.code||id;const duplicate=await c.database.prepare('SELECT id FROM records WHERE kind = ? AND code = ? AND id != ?').bind(b.kind,code,id).first();if(duplicate)throw new APIError(409,'هذا الرقم مسجل بالفعل');
 const oldPayload=existing?JSON.parse(existing.payload):{};const references=[payload.customerId,payload.brokerId,payload.supplierId,payload.commissionAccountId,payload.treasuryId,oldPayload.treasuryId,oldPayload.customerId,oldPayload.brokerId,oldPayload.supplierId].filter(Boolean);const paymentModules=[...new Set([assetKind,oldPayload.payment==='cash'?'cash':oldPayload.payment==='bank'?'banks':null].filter(Boolean).map(x=>x==='bank'?'banks':x))];const condition=unlockedSQL(module,c)+(payload.treasuryId?activeAccountSQL(payload.treasuryId):'')+paymentModules.map(m=>` AND json_extract(payload,'$.modules.${m}')=1`).join('')+(payload.brokerId||payload.supplierId||oldPayload.brokerId||oldPayload.supplierId?" AND json_extract(payload,'$.modules.accounts')=1":'')+references.map(ref=>` AND EXISTS (SELECT 1 FROM records WHERE id='${String(ref).replaceAll("'","''")}')`).join('');const statement=existing?c.database.prepare(`UPDATE records SET name = ?, code = ?, date = ?, currency = ?, amount = ?, payload = ?, updated_at = ? WHERE id = ? AND kind = ? AND EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND ${condition})`).bind(b.name,code,b.date,b.currency,amount,JSON.stringify(payload),now,id,b.kind,c.revision):c.database.prepare(`INSERT INTO records (id, kind, module, code, name, date, currency, amount, payload, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND ${condition})`).bind(id,b.kind,module,code,b.name,b.date,b.currency,amount,JSON.stringify(payload),now,now,c.revision);
 const statements=[statement,c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(crypto.randomUUID(),c.user.email,(existing?'تعديل ':'إضافة ')+kinds[b.kind].label,JSON.stringify(existing),JSON.stringify({...b,amount,payload}),now)];
 if(['ticket','service','visa'].includes(b.kind)){
  const paymentCode='payment:'+id;
  statements.push(c.database.prepare(`DELETE FROM records WHERE code = ? AND json_extract(payload, '$.sourceId') = ? AND EXISTS (SELECT 1 FROM records WHERE id = ? AND updated_at = ?) AND EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND ${condition})`).bind(paymentCode,id,id,now,c.revision));
  if(settlementKind&&(b.kind!=='ticket'||payload.status==='active')){
   const isCross=!!payload.crossCurrency;
   const sCur=isCross?(payload.settlementCurrency||'SDG'):b.currency;
   const sRate=isCross?Number(payload.conversionRate||1):1;
   const sAmtMinor=isCross&&payload.settlementAmount?Math.round(Number(payload.settlementAmount)*100):(isCross?Math.round(amount*sRate):amount);
   const existingSettlement=existing?await c.database.prepare("SELECT payload FROM records WHERE id = ?").bind('settlement:'+id).first<any>():null;
   const existingReceiptNumber=existingSettlement?(()=>{try{return JSON.parse(existingSettlement.payload).receiptNumber||null;}catch{return null;}})():null;
    const targetReceiptNumber=payload.receiptNumber||existingReceiptNumber;
   const seqId=payload.treasuryKind==='bank-account'?'bank-sequence':'cash-sequence';
   const seqModule=payload.treasuryKind==='bank-account'?'banks':'cash';
   if(!targetReceiptNumber){
    statements.push(c.database.prepare(`INSERT INTO records (id,kind,module,code,name,date,currency,amount,payload,created_at,updated_at) SELECT ?,?,'${seqModule}','counter','counter',?,'EGP',1,'{}',?,? WHERE EXISTS (SELECT 1 FROM system_settings WHERE id=1 AND ${condition}) ON CONFLICT(id) DO UPDATE SET amount=amount+1,updated_at=excluded.updated_at WHERE EXISTS (SELECT 1 FROM system_settings WHERE id=1 AND ${condition})`).bind(seqId,seqId,b.date,now,now));
   }
   const baseSettlementPayload={systemGenerated:true,sourceId:id,treasuryId:payload.treasuryId,treasuryName:payload.treasuryName,customerId:payload.customerId,customerName:(payload as any).customerName,customerCurrency:b.currency,customerAmountMinor:amount,direction:'receipt',rate:sRate,crossCurrency:isCross,notes:'تحصيل من '+kinds[b.kind].label+(isCross?` [تسوية بعملة ${sCur} لتغطية ${b.currency}: مدفوع ${payload.settlementAmount||(sAmtMinor/100)} ${sCur} بسعر صرف ${sRate}]`:'')};
   statements.push(c.database.prepare(`INSERT INTO records (id, kind, module, code, name, date, currency, amount, payload, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, json_set(?, '$.receiptNumber', COALESCE(?, (SELECT printf('%08d', amount) FROM records WHERE id = ?))), ?, ? WHERE EXISTS (SELECT 1 FROM records WHERE id = ? AND updated_at = ?) AND EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND ${condition})`).bind('settlement:'+id,payload.treasuryKind==='bank-account'?'bank':'cash',payload.treasuryKind==='bank-account'?'banks':'cash',paymentCode,'تحصيل آلي · '+b.name,b.date,sCur,sAmtMinor,JSON.stringify(baseSettlementPayload),targetReceiptNumber,seqId,now,now,id,now,c.revision));
  }
 }
 const actionTypeLabel=b.kind==='customer'?(b.payload?.accountType==='airline'?'حساب خطوط':b.payload?.accountType==='supplier'?'حساب مورد':'عميل'):kinds[b.kind].label;
 const operation=await reportedBatch(c,statements,(existing?'تعديل ':'إضافة ')+actionTypeLabel,id);const result=operation.results;if(!result[0].meta.changes)throw new APIError(423,'تغيرت حالة التفعيل. أعد تحميل الصفحة.');const saved=await c.database.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();return json({...unpack(saved),operationReport:operation.report},existing?200:201)})}
export async function DELETE(req:Request){return handled(async()=>{sameOrigin(req);const c=await context();const id=new URL(req.url).searchParams.get('id');if(!id)throw new APIError(400,'حدد السجل');const existing=await c.database.prepare('SELECT * FROM records WHERE id = ?').bind(id).first<any>();if(!existing)throw new APIError(404,'السجل غير موجود');if(!kinds[existing.kind])throw new APIError(400,'استخدم شاشة القسم المختص لتعديل هذا السجل');manage(c,kinds[existing.kind].module);if(kinds[existing.kind].financial&&!['expense','service','ticket','visa'].includes(existing.kind))throw new APIError(400,'الحركات المالية تحفظ في السجل. استخدم شاشة القسم المختص.');if(['service','ticket','visa'].includes(existing.kind)){const paymentCode='payment:'+id;const settlementId='settlement:'+id;const operation=await reportedBatch(c,[c.database.prepare(`DELETE FROM records WHERE (code = ? AND json_extract(payload, '$.sourceId') = ?) OR id = ?`).bind(paymentCode,id,settlementId),c.database.prepare(`DELETE FROM records WHERE id = ? AND EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND ${unlockedSQL(kinds[existing.kind].module,c)})`).bind(id,c.revision),c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(crypto.randomUUID(),c.user.email,'حذف '+kinds[existing.kind].label,JSON.stringify(existing),'null',new Date().toISOString())],'حذف '+kinds[existing.kind].label,id);const r=operation.results;if(!r[1].meta.changes)throw new APIError(423,'تغيرت حالة التفعيل');return json({ok:true,operationReport:operation.report});}if(['customer','account','employee','expense'].includes(existing.kind)){const used=await c.database.prepare("SELECT id FROM records WHERE json_extract(payload,'$.customerId')=? OR json_extract(payload,'$.counterpartyId')=? OR json_extract(payload,'$.parentId')=? OR json_extract(payload,'$.intermediaryId')=? OR json_extract(payload,'$.brokerId')=? OR json_extract(payload,'$.supplierId')=? LIMIT 1").bind(id,id,id,id,id,id).first();if(used){const now=new Date().toISOString();const p={...JSON.parse(existing.payload),archived:true,archivedAt:now};await c.database.prepare("UPDATE records SET payload=?,updated_at=? WHERE id=?").bind(JSON.stringify(p),now,id).run();await c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),c.user.email,'أرشفة وحذف '+kinds[existing.kind].label,JSON.stringify(existing),JSON.stringify(p),now).run();return json({ok:true,archived:true});}}const operation=await reportedBatch(c,[c.database.prepare(`DELETE FROM records WHERE id = ? AND NOT EXISTS (SELECT 1 FROM records linked WHERE json_extract(linked.payload,'$.customerId')=? OR json_extract(linked.payload,'$.counterpartyId')=? OR json_extract(linked.payload,'$.parentId')=? OR json_extract(linked.payload,'$.intermediaryId')=? OR json_extract(linked.payload,'$.brokerId')=? OR json_extract(linked.payload,'$.supplierId')=?) AND EXISTS (SELECT 1 FROM system_settings WHERE id = 1 AND ${unlockedSQL(kinds[existing.kind].module,c)})`).bind(id,id,id,id,id,id,id,c.revision),c.database.prepare('INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(crypto.randomUUID(),c.user.email,'حذف '+kinds[existing.kind].label,JSON.stringify(existing),'null',new Date().toISOString())],'حذف '+kinds[existing.kind].label,id);const r=operation.results;if(!r[0].meta.changes)throw new APIError(423,'تغيرت حالة التفعيل');return json({ok:true,operationReport:operation.report})})}


