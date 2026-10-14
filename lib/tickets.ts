export type TicketTotals = {
 ticketBaseMinor:number;
 supplierDueMinor:number;
 totalMinor:number;
 incomeMinor:number;
 pricingVersion:number;
 brokerCommissionMinor:number;
 penaltyMinor?:number;
 refundCommMinor?:number;
 supplierRefundMinor?:number;
 customerRefundMinor?:number;
 originalCostMinor?:number;
 originalSellMinor?:number;
};
const number=(value:unknown)=>{
 if(value==='-'||value===''||value===null||value===undefined)return 0;
 const n=Number(value);
 return isNaN(n)?0:n;
};
const minor=(value:unknown)=>Math.round(number(value)*100);

export type RefundTotals = {
 originalCostMinor:number;
 originalSellMinor:number;
 penaltyMinor:number;
 supplierCommMinor:number;
 refundCommMinor:number;
 supplierRefundMinor:number;
 customerRefundMinor:number;
 incomeMinor:number;
};

// Calculates refunded ticket amounts according to agency refund rules:
// 1. Supplier refunds original cost minus airline cancellation penalty minus supplier commission
// 2. Customer paid originalSell. On refund, customer receives originalSell minus airline penalty minus supplier commission minus office refund commission/deduction
// 3. Default state (penalties=0, supplierComm=0, refundComm=0): customer receives full originalSell without deduction, airline refunds originalCost, agency reverses issuance commission
// 4. Agency net profit from refund: supplier refund minus customer refund = refundComm - origComm
export function calculateRefundTotals(p:Record<string,any>):RefundTotals{
 const penaltyMinor=minor(p.penalties);
 const supplierCommMinor=minor(p.supplierComm||p.brokerCommission);
 const refundCommMinor=minor(p.refundComm);

 const fareMinor=minor(p.fare);
 const taxSum=Object.values(p.taxes||{}).reduce<number>((sum,val)=>sum+minor(val),0);
 const origSellMinor=p.originalSellMinor!==undefined
  ?Number(p.originalSellMinor)
  :(p.originalAmount?minor(p.originalAmount):(p.sellingPrice!==undefined&&p.sellingPrice!==''&&number(p.sellingPrice)>0?minor(p.sellingPrice):(fareMinor+taxSum)));

 const origCostMinor=p.originalCostMinor!==undefined
  ?Number(p.originalCostMinor)
  :(p.originalSupplierDue?minor(p.originalSupplierDue):(p.supplierPrice!==undefined&&p.supplierPrice!==''&&number(p.supplierPrice)>0?minor(p.supplierPrice):origSellMinor));

 const origCommMinor=p.originalIncomeMinor!==undefined
  ?Number(p.originalIncomeMinor)
  :Math.max(0,origSellMinor-origCostMinor);

 const supplierRefundMinor=Math.max(0,origCostMinor-penaltyMinor-supplierCommMinor);
 const customerRefundMinor=Math.max(0,origSellMinor-penaltyMinor-supplierCommMinor-refundCommMinor);
 const incomeMinor=refundCommMinor-origCommMinor;

 return {
  originalSellMinor:origSellMinor,
  originalCostMinor:origCostMinor,
  penaltyMinor,
  supplierCommMinor,
  refundCommMinor,
  supplierRefundMinor,
  customerRefundMinor,
  incomeMinor
 };
}

// Percentages use Fare; taxes do not earn a commission.
export function calculateTicket(p:Record<string,any>):TicketTotals{
 if(p.status==='refunded'){
  const ref=calculateRefundTotals(p);
  return {
   ticketBaseMinor:ref.originalSellMinor,
   supplierDueMinor:ref.supplierRefundMinor,
   totalMinor:ref.customerRefundMinor,
   brokerCommissionMinor:ref.supplierCommMinor,
   incomeMinor:ref.incomeMinor,
   pricingVersion:3,
   penaltyMinor:ref.penaltyMinor,
   refundCommMinor:ref.refundCommMinor,
   supplierRefundMinor:ref.supplierRefundMinor,
   customerRefundMinor:ref.customerRefundMinor,
   originalCostMinor:ref.originalCostMinor,
   originalSellMinor:ref.originalSellMinor
  };
 }
 const fare=minor(p.fare);
 const taxSum=Object.values(p.taxes||{}).reduce<number>((sum,value)=>sum+minor(value),0);

 const hasSellingPrice=p.sellingPrice!==undefined&&p.sellingPrice!==''&&number(p.sellingPrice)>0;
 const hasSupplierPrice=p.supplierPrice!==undefined&&p.supplierPrice!==''&&number(p.supplierPrice)>0;

 const sellMinor = hasSellingPrice ? minor(p.sellingPrice) : 0;
 const supMinor = hasSupplierPrice ? minor(p.supplierPrice) : 0;

 let commission = minor(p.commAmount);
 if (!commission && number(p.commPct) > 0) {
  const baseForPct = fare > 0 ? fare : (sellMinor > 0 ? sellMinor : supMinor);
  commission = Math.round(baseForPct * number(p.commPct) / 100);
 }
 const extra = Math.round(fare * number(p.extraPct) / 100) + minor(p.extraComm);
 const discount = Math.round(fare * number(p.discountPct) / 100) + minor(p.discount);
 const zero = !!p.flags?.['Zero Comm'];
 const brokerCommissionMinor = p.flags?.Broker ? minor(p.brokerCommission) : 0;

 let supplierDueMinor: number;
 let totalMinor: number;
 let ticketBaseMinor = (fare + taxSum) > 0 ? (fare + taxSum) : 0;

 if (!ticketBaseMinor) {
  ticketBaseMinor = sellMinor > 0 ? sellMinor : supMinor;
 }

 if (zero) {
  supplierDueMinor = supMinor > 0 ? supMinor : (ticketBaseMinor > 0 ? ticketBaseMinor : sellMinor);
  if (sellMinor > supplierDueMinor) {
   totalMinor = sellMinor + extra - discount;
  } else {
   totalMinor = supplierDueMinor + commission + extra - discount;
  }
 } else {
  const baseForSell = sellMinor > 0 ? sellMinor : (ticketBaseMinor > 0 ? ticketBaseMinor : supMinor);
  totalMinor = baseForSell + extra - discount;

  if (supMinor > 0 && supMinor < baseForSell) {
   supplierDueMinor = supMinor;
  } else if (commission > 0) {
   supplierDueMinor = Math.max(0, baseForSell - commission);
  } else if (supMinor > 0) {
   supplierDueMinor = supMinor;
  } else {
   supplierDueMinor = Math.max(0, ticketBaseMinor);
  }
 }

 return {
  ticketBaseMinor: ticketBaseMinor > 0 ? ticketBaseMinor : (supplierDueMinor > 0 ? supplierDueMinor : totalMinor),
  supplierDueMinor,
  totalMinor,
  brokerCommissionMinor,
  incomeMinor: totalMinor - supplierDueMinor - brokerCommissionMinor,
  pricingVersion: 3
 };
}

export function sameTicketPricing(a:Record<string,any>,b:Record<string,any>){
 if((a.status==='refunded')!==(b.status==='refunded'))return false;
 if(a.status==='refunded'&&b.status==='refunded'){
  const key=(p:Record<string,any>)=>JSON.stringify({
   penalties:number(p.penalties),
   refundComm:number(p.refundComm),
   supplierComm:number(p.supplierComm||p.brokerCommission),
   fare:number(p.fare),
   sellingPrice:number(p.sellingPrice),
   supplierPrice:number(p.supplierPrice),
   originalAmount:number(p.originalAmount),
   originalSupplierDue:number(p.originalSupplierDue)
  });
  return key(a)===key(b);
 }
 const key=(p:Record<string,any>)=>JSON.stringify({
  values:['fare','commPct','commAmount','discount','discountPct','extraPct','extraComm','sellingPrice','supplierPrice'].map(k=>number(p[k])),
  taxes:Object.entries(p.taxes||{}).map(([k,v])=>[k,number(v)] as const).filter(([,v])=>v!==0).sort(([a],[b])=>a.localeCompare(b)),
  zero:!!p.flags?.['Zero Comm']
 });
 return key(a)===key(b);
}

// Status/name/notes edits must not reprice previously issued tickets.
export function ticketTotals(p:Record<string,any>,saved?:{payload:Record<string,any>;amount:number}):TicketTotals{
 if(p.status==='refunded'){
  return calculateTicket(p);
 }
 if(saved&&sameTicketPricing(p,saved.payload)&&saved.amount>0){
  const old=saved.payload;
  const previousBroker=old.brokerCommissionMinor??0;
  const brokerCommissionMinor=p.flags?.Broker?minor(p.brokerCommission):0;
  const incomeMinor=(old.incomeMinor??0)+previousBroker-brokerCommissionMinor;
  return {
   ticketBaseMinor:old.ticketBaseMinor??minor(old.fare)+Object.values(old.taxes||{}).reduce<number>((sum,value)=>sum+minor(value),0),
   supplierDueMinor:old.supplierDueMinor??saved.amount-(old.incomeMinor??0)-previousBroker,
   totalMinor:saved.amount,incomeMinor,brokerCommissionMinor,pricingVersion:old.pricingVersion??1
  };
 }
 return calculateTicket(p);
}

export function ticketSupplierName(p:Record<string,any>){return p.flags?.['Non IATA']?(p.vendor||p.airline||'مورد غير محدد'):(p.airline||'خطوط غير محددة')}
export function ticketSupplierDue(row:{amount:number;payload:Record<string,any>}){
 if(row.payload?.status==='refunded'){
  return row.payload.supplierRefundMinor??calculateRefundTotals(row.payload).supplierRefundMinor;
 }
 if(row.payload?.supplierDueMinor!==undefined&&row.payload?.supplierDueMinor>0){
  return row.payload.supplierDueMinor;
 }
 const calc=calculateTicket(row.payload||{});
 if(calc.supplierDueMinor!==undefined&&calc.supplierDueMinor>0){
  return calc.supplierDueMinor;
 }
 if(row.payload?.supplierPrice!==undefined&&row.payload?.supplierPrice!==''&&Number(row.payload.supplierPrice)>0){
  return Math.round(Number(row.payload.supplierPrice)*100);
 }
 return row.payload?.supplierDueMinor??row.amount-(row.payload?.incomeMinor||0);
}

export function parseTicketText(raw: string): {
 ticketNo?: string;
 pnr?: string;
 passenger?: string;
 route?: string;
 class?: string;
 fare?: number;
 total?: number;
 currency?: string;
 date?: string;
 airline?: string;
} {
 if (!raw || typeof raw !== 'string') return {};
 const clean = raw.replace(/[\r\t]+/g, ' ');
 const res: any = {};

 // 1. Ticket Number (13-14 digits)
 const tktMatch = clean.match(/(?:TKT|ETKT|TICKET|TKT\s*NO|رقم\s*التذكرة|تذكرة\s*رقم|رقم\s*التذكره|تذكره\s*رقم)[\s:#-]*(\d[\d\s-]{9,18}\d)|\b(\d{3}[\s-]?\d{4}[\s-]?\d{6}|\d{3}[\s-]?\d{10}|\d{13,14})\b/i);
 if (tktMatch) {
  res.ticketNo = (tktMatch[1] || tktMatch[2]).replace(/\D/g, '');
 }

 // 2. PNR / Booking reference (5-8 alpha-numeric)
 const pnrMatch = clean.match(/(?:PNR|LOC|BOOKING\s*REF|RESERVATION|RECORD\s*LOCATOR|رقم الحجز|مرجع الحجز)[:\s]+([A-Z0-9]{5,8})/i);
 if (pnrMatch) {
  res.pnr = pnrMatch[1].toUpperCase();
 }

 // 3. Passenger name & Customer name
 const paxMatch = clean.match(/(?:PAX|PASSENGER(?:\s*NAME)?|NAME|المسافر|اسم\s*المسافر|الراكب|اسم\s*الراكب)(?:[\s:#\-–=]+)([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF \t\/]{2,35})/i) || clean.match(/1\.1([A-Z\/]+)/);
 if (paxMatch) {
  res.passenger = paxMatch[1].trim().replace(/\/\s*/g, ' ');
 }
 const custMatch = clean.match(/(?:CUSTOMER|CLIENT|AGENT|العميل|الزبون|اسم العميل)[:\s]+([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s]{2,35})/i);
 if (custMatch) {
  res.customerName = custMatch[1].trim();
 }

 // 4. Route (e.g. KRT-CAI or KRT/CAI)
 const routeMatch = clean.match(/\b([A-Z]{3})\s*[-/–]\s*([A-Z]{3})\b/i) || clean.match(/(?:ROUTE|FROM\/TO|SECTOR|خط السير|خط الرحلة)[:\s]+([A-Z\u0600-\u06FF]{3}[A-Z\u0600-\u06FF0-9\s\-\/]{2,20})/i);
 if (routeMatch) {
  res.route = routeMatch[2] ? `${routeMatch[1].toUpperCase()} – ${routeMatch[2].toUpperCase()}` : routeMatch[1].trim().toUpperCase();
 }

 // 5. Class
 const classMatch = clean.match(/(?:CLASS|CLS|CABIN|الكلاس|الدرجة)[:\s]+([A-Z])\b/i) || clean.match(/\b([YJCWF])\s*CLASS\b/i);
 if (classMatch) {
  res.class = classMatch[1].toUpperCase();
 }

 // 6. Currency
 const currMatch = clean.match(/\b(USD|SAR|AED|SDG|EGP|EUR|GBP|QAR|KWD|دولار|ريال|درهم|جنيه)\b/i);
 if (currMatch) {
  const c = currMatch[1].toUpperCase();
  res.currency = c === 'دولار' ? 'USD' : c === 'ريال' ? 'SAR' : c === 'درهم' ? 'AED' : c === 'جنيه' ? 'EGP' : c;
 }

 // 7. Total / Fare
 const totalMatch = clean.match(/(?:TOTAL|TOTAL\s*FARE|AMOUNT|التوتل|الإجمالي|إجمالي التذكرة|المبلغ)[:\s]+(?:[A-Z]{3}\s*)?([\d,]+\.?\d*)/i);
 if (totalMatch) {
  res.total = Number(totalMatch[1].replace(/,/g, ''));
 }
 const fareMatch = clean.match(/(?:FARE|BASE\s*FARE|الأساس|سعر الأساس)[:\s]+(?:[A-Z]{3}\s*)?([\d,]+\.?\d*)/i);
 if (fareMatch) {
  res.fare = Number(fareMatch[1].replace(/,/g, ''));
 }

 // 8. Date (YYYY-MM-DD or DDMMMYY or DD/MM/YYYY)
 const dateMatch = clean.match(/\b(202\d-[01]\d-[0-3]\d)\b/) || clean.match(/\b([0-3]\d[A-Z]{3}\d{2,4})\b/i) || clean.match(/\b([0-3]?\d\/[01]?\d\/202\d)\b/);
 if (dateMatch) {
  res.date = dateMatch[1];
 }

 // 9. Airline
 const airlineMatch = clean.match(/(?:AIRLINE|CARRIER|الخطوط|شركة الطيران)[:\s]+([A-Z\u0600-\u06FF\s]{3,25})/i) || clean.match(/\b(Tarco|Badr|EgyptAir|Saudia|FlyDubai|Emirates|Qatar|Air Cairo|Flynas|Jazeera|SalamAir|Salam|Sudan Airways|Turkish Airlines|AirArabia|Air Arabia|تاركو|بدر|مصر للطيران|السعودية|فلاي دبي|طيران الإمارات|القطرية|طيران السلام|فلاي ناس|الجزيرة)\b/i);
 if (airlineMatch) {
  res.airline = airlineMatch[1].trim();
 }

 return res;
}

