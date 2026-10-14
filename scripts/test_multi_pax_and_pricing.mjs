import fs from 'fs';
import { analyzeTicketDocument, parseTicketTextContent } from '../lib/ticket-extractor.ts';

// Simulated database customers
const customers = [
  { id: '487ef3a1-b77d-4313-88fa-7831d06cb68a', name: 'BADR AIRLINES', payload: { accountType: 'airline' } },
  { id: '24345254-d65f-4145-957d-daade30e130f', name: 'TARCO AIRLINES', payload: { accountType: 'airline' } },
  { id: '8042ce34-76c0-4453-8f9c-d80684e7cc86', name: 'امل مرحوم', payload: { accountType: 'customer' } }
];

async function runTests() {
  console.log('=== Test 1: OP-284992 (Single PAX with detailed taxes) ===');
  const pdfBuf = fs.readFileSync('scratch/02NU94.pdf');
  const base64 = pdfBuf.toString('base64');

  const op1 = {
    id: 'b8361c79-e0b9-4e62-a913-176cc8aedb5e',
    code: 'OP-284992',
    name: 'امل مرحوم',
    date: '2026-10-07',
    currency: 'USD',
    amount: 31185000,
    payload: {
      type: 'ticket-new',
      status: 'pending',
      customerId: '8042ce34-76c0-4453-8f9c-d80684e7cc86',
      customerName: 'امل مرحوم',
      airline: '',
      commAmount: 311850,
      attachment: {
        name: '02NU94.pdf',
        type: 'application/pdf',
        size: pdfBuf.length,
        data: 'data:application/pdf;base64,' + base64
      }
    }
  };

  const extracted1 = await analyzeTicketDocument(op1.payload.attachment);
  console.log('Extracted 1 PAX:', extracted1.passengers);
  console.log('Extracted 1 Fare:', extracted1.fare, 'Total:', extracted1.total, 'Taxes count:', Object.keys(extracted1.taxes || {}).length);

  if (extracted1.passengers[0].name !== 'SOFIAN DABLOUK') throw new Error('Pax name mismatch');
  if (extracted1.passengers[0].ticketNo !== '3672420768223') throw new Error('Ticket number mismatch');
  if (extracted1.fare !== 1039500) throw new Error('Fare mismatch');
  if (extracted1.total !== 4432025) throw new Error('Total mismatch');

  // Verify Choice Mode 1: total_only
  const totalOnlyResult = {
    paxRows: extracted1.passengers,
    fare: extracted1.total,
    sellingPrice: extracted1.total,
    supplierPrice: extracted1.total - 311850,
    taxes: Object.fromEntries(['SD','YR','YQ','XT','QR','EQ','JK','NY'].map(t => [t, 0])),
    showTaxes: false
  };
  console.log('Mode: total_only -> Sell:', totalOnlyResult.sellingPrice, 'Sup:', totalOnlyResult.supplierPrice, 'Fare:', totalOnlyResult.fare);
  if (totalOnlyResult.sellingPrice !== 4432025) throw new Error('Total only sell price mismatch');

  // Verify Choice Mode 2: detailed_taxes
  const detailedResult = {
    paxRows: extracted1.passengers,
    fare: extracted1.fare,
    sellingPrice: extracted1.total,
    supplierPrice: extracted1.total - 311850,
    taxes: extracted1.taxes,
    showTaxes: true
  };
  console.log('Mode: detailed_taxes -> Fare:', detailedResult.fare, 'Sell:', detailedResult.sellingPrice, 'Taxes SD:', detailedResult.taxes.SD);
  if (detailedResult.fare !== 1039500) throw new Error('Detailed fare mismatch');
  if (detailedResult.taxes.SD !== 50400) throw new Error('Detailed tax SD mismatch');

  console.log('\n=== Test 2: 9 Passengers on a single page (ticket range & list) ===');
  const text9Pax = `
AIRLINE: BADR AIRLINES
1. SOFIAN DABLOUK - 3672420768221
2. MONA DABLOUK - 3672420768222
3. AHMED DABLOUK - 3672420768223
4. FATIMA DABLOUK - 3672420768224
5. YOUSIF DABLOUK - 3672420768225
6. OMAR DABLOUK - 3672420768226
7. HASSAN DABLOUK - 3672420768227
8. MARYAM DABLOUK - 3672420768228
9. IBRAHIM DABLOUK - 3672420768229
BASE FARE AMOUNT: USD 100
SD: 20
YR: 30
TOTAL AMOUNT: USD 150
`;
  const extracted9 = parseTicketTextContent(text9Pax);
  console.log('9 PAX count:', extracted9.passengers.length);
  extracted9.passengers.forEach((p, i) => console.log(`  ${i+1}: ${p.name} -> ${p.ticketNo}`));
  if (extracted9.passengers.length !== 9) throw new Error('Expected 9 passengers, got ' + extracted9.passengers.length);
  if (extracted9.passengers[8].name !== 'IBRAHIM DABLOUK') throw new Error('9th passenger name mismatch');
  if (extracted9.passengers[8].ticketNo !== '3672420768229') throw new Error('9th passenger ticket mismatch');
  if (extracted9.fare !== 900) throw new Error('Expected 9 pax combined fare 900, got ' + extracted9.fare);
  if (extracted9.total !== 1350) throw new Error('Expected 9 pax combined total 1350, got ' + extracted9.total);
  if (extracted9.taxes.SD !== 180) throw new Error('Expected 9 pax scaled SD tax 180, got ' + extracted9.taxes.SD);
  if (extracted9.taxes.YR !== 270) throw new Error('Expected 9 pax scaled YR tax 270, got ' + extracted9.taxes.YR);

  console.log('\n=== Test 3: Multi-page document (up to 9 pages, each 1 passenger) ===');
  const pages = [];
  const names = ['SOFIAN', 'MONA', 'AHMED', 'FATIMA', 'YOUSIF', 'OMAR', 'HASSAN', 'MARYAM', 'IBRAHIM'];
  for (let i = 1; i <= 9; i++) {
    pages.push(`
BADR AIRLINES
TICKET NUMBER: 367242076822${i}
PASSENGER: ${names[i-1]} DABLOUK
BASE FARE AMOUNT: USD 200
SD: 40
TOTAL AMOUNT: USD 240
ROUTE: PZU – CAI
`);
  }

  const allPageResults = pages.map(pt => parseTicketTextContent(pt));
  const collectedPax = [];
  let combinedTotal = 0;
  let combinedFare = 0;
  const combinedTaxes = {};

  for (const pr of allPageResults) {
    for (const p of pr.passengers) {
      if (!collectedPax.some(cp => (p.ticketNo && cp.ticketNo) ? (cp.ticketNo === p.ticketNo) : (cp.name && p.name && cp.name.toLowerCase() === p.name.toLowerCase()))) {
        collectedPax.push(p);
      }
    }
    if (pr.total && pr.passengers.length > 0) {
      combinedTotal += pr.total;
    }
    if (pr.fare && pr.passengers.length > 0) {
      combinedFare += pr.fare;
    }
    if (pr.taxes) {
      for (const [code, val] of Object.entries(pr.taxes)) {
        combinedTaxes[code] = (combinedTaxes[code] || 0) + Number(val || 0);
      }
    }
  }

  console.log('Multi-page 9 pages -> collectedPax count:', collectedPax.length);
  collectedPax.forEach((p, idx) => console.log(`  Page ${idx+1}: ${p.name} -> ${p.ticketNo}`));
  if (collectedPax.length !== 9) throw new Error('Expected 9 pax across 9 pages');
  if (combinedFare !== 1800) throw new Error('Expected 1800 combined fare, got ' + combinedFare);
  if (combinedTotal !== 2160) throw new Error('Expected 2160 combined total, got ' + combinedTotal);
  if (combinedTaxes.SD !== 360) throw new Error('Expected 360 SD tax (40 * 9), got ' + combinedTaxes.SD);

  console.log('\n>>> ALL 3 TEST SUITES PASSED WITH 100% SUCCESS! <<<');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
