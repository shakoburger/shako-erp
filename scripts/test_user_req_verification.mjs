import { parseTicketTextContent } from '../lib/ticket-extractor.ts';

const tkt = `
BADR AIRLINES
ELECTRONIC TICKET RECEIPT
DATE OF ISSUE
12OCT26
PASSENGER NAME
ELZAIN MOHAMED MR
TICKET NUMBER
367 2420 778012
ROUTE: CAI - KRT
TOTAL AMOUNT: 450 USD
`;

const resTkt = parseTicketTextContent(tkt);
console.log('--- Ticket Parse Result ---');
console.log('Pax:', resTkt.passenger);
console.log('TicketNo:', resTkt.ticketNo);
console.log('Date:', resTkt.date);
console.log('AllPax:', resTkt.allPassengers);
console.log('AllTkts:', resTkt.allTicketNos);

if (resTkt.passenger !== 'ELZAIN MOHAMED' || resTkt.ticketNo !== '3672420778012' || resTkt.date !== '2026-10-12') {
  console.error('FAILED Ticket assertion');
  process.exit(1);
}

const fin = `
إشعار تحويل بنكك
بنك الخرطوم
الرقم المرجعي: FT26286012489
تاريخ المعاملة
12/10/2026
المبلغ: 150000 SDG
تم التحويل بنجاح إلى حساب: 123456
`;

const resFin = parseTicketTextContent(fin);
console.log('\n--- Financial Parse Result ---');
console.log('Ref:', resFin.referenceCode);
console.log('Date:', resFin.date);
console.log('Total:', resFin.total);
console.log('Direction:', resFin.financialDirection);

if (resFin.date !== '2026-10-12' || resFin.total !== 150000) {
  console.error('FAILED Financial assertion');
  process.exit(1);
}

console.log('\n>>> ALL TEST CASES PASSED SUCCESSFULLY! <<<');
