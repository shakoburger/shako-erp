import fs from 'fs';
import { analyzeTicketDocument, parseTicketTextContent } from '../lib/ticket-extractor.ts';

// Simulated database customers
const customers = [
  { id: '487ef3a1-b77d-4313-88fa-7831d06cb68a', name: 'BADR AIRLINES', payload: { accountType: 'airline' } },
  { id: '24345254-d65f-4145-957d-daade30e130f', name: 'TARCO AIRLINES', payload: { accountType: 'airline' } },
  { id: '8042ce34-76c0-4453-8f9c-d80684e7cc86', name: 'امل مرحوم', payload: { accountType: 'customer' } }
];

const supplierAccounts = [];

async function testStagedSelection() {
  console.log('Testing Staged Selection on OP-284992 attachment...');

  const pdfBuf = fs.readFileSync('scratch/02NU94.pdf');
  const base64 = pdfBuf.toString('base64');

  const op = {
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
      vendor: '',
      fare: 0,
      sellingPrice: 0,
      supplierPrice: 0,
      commAmount: 311850,
      taxes: {},
      route: '',
      class: '',
      person: '',
      notes: '',
      attachment: {
        name: '02NU94.pdf',
        type: 'application/pdf',
        size: pdfBuf.length,
        data: 'data:application/pdf;base64,' + base64
      }
    }
  };

  // Run onSelectStaged logic
  const sp = op.payload || {};
  let extracted = {};
  if (sp.attachment?.data) {
    extracted = await analyzeTicketDocument(sp.attachment);
  }

  const isTkt = (val) => /^\d{10,14}$/.test(val?.replace(/[-\s]/g, ''));
  const paxRows = [];
  if (extracted.passengers && extracted.passengers.length > 0) {
    for (const pax of extracted.passengers) paxRows.push({ name: pax.name || '', ticketNo: pax.ticketNo || '' });
  } else if (sp.passengers && Array.isArray(sp.passengers) && sp.passengers.length > 0) {
    for (const pax of sp.passengers) paxRows.push({ name: pax.name || '', ticketNo: pax.ticketNo || '' });
  } else {
    const pName = (extracted.passenger || sp.person || (op.name !== sp.customerName ? op.name : '') || '').trim();
    const pCode = (extracted.ticketNo || (isTkt(sp.code) ? sp.code : '') || (isTkt(op.code) ? op.code : '') || '').trim();
    if (pName || pCode) paxRows.push({ name: pName, ticketNo: pCode });
  }

  const rawCustName = (sp.customerName || extracted.customerName || '').trim();
  const rawPaxName = (paxRows.map(p => p.name).filter(Boolean).join(' / ') || extracted.passenger || sp.person || op.name || rawCustName || '').trim();

  const isCustMatch = (cName, target) => {
    if (!cName || !target) return false;
    const a = cName.trim().toLowerCase();
    const t = target.trim().toLowerCase();
    if (a === t || a.includes(t) || t.includes(a)) return true;
    if (t.includes('nader') && a.includes('نادر')) return true;
    if (t.includes('nouraya') && a.includes('نورآية')) return true;
    return false;
  };

  const matchedCust = customers.find(c =>
    c.id === sp.customerId ||
    (rawCustName && isCustMatch(c.name, rawCustName)) ||
    (rawPaxName && isCustMatch(c.name, rawPaxName))
  );

  const finalCode = (paxRows[0]?.ticketNo || extracted.ticketNo || (isTkt(sp.code) ? sp.code : '') || (isTkt(op.code) ? op.code : '') || extracted.pnr || '').trim();
  const finalRoute = extracted.route || sp.route || '';
  const finalClass = extracted.class || sp.class || '';
  const finalDate = extracted.date || sp.date || op.date || '2026-10-07';

  const rawAirline = (extracted.airline || sp.airline || '').trim();
  const isAirlineMatch = (accName, target) => {
    if (!accName || !target) return false;
    const a = accName.toLowerCase();
    const t = target.toLowerCase();
    if (a === t || a.includes(t) || t.includes(a)) return true;
    if ((t.includes('tarco') || t.includes('3t')) && a.includes('تاركو')) return true;
    if ((t.includes('badr') || t.includes('j4')) && a.includes('بدر')) return true;
    return false;
  };

  const matchedAirline = customers.find(c => ['airline', 'supplier'].includes(c.payload?.accountType) && isAirlineMatch(c.name, rawAirline));

  console.log('=== TEST RESULTS ===');
  console.log('paxRows:', paxRows);
  console.log('finalCode (Ticket No):', finalCode);
  console.log('matchedCust:', matchedCust?.name, '(ID:', matchedCust?.id, ')');
  console.log('matchedAirline:', matchedAirline?.name, '(ID:', matchedAirline?.id, ')');
  console.log('finalRoute:', finalRoute);
  console.log('finalClass:', finalClass);
  console.log('finalDate:', finalDate);
  console.log('Fare:', extracted.fare);
  console.log('Total:', extracted.total);
  console.log('Taxes:', extracted.taxes);

  // Assertions
  if (paxRows[0]?.name !== 'SOFIAN DABLOUK') throw new Error(`Expected PAX SOFIAN DABLOUK, got ${paxRows[0]?.name}`);
  if (finalCode !== '3672420768223') throw new Error(`Expected ticket 3672420768223, got ${finalCode}`);
  if (matchedAirline?.name !== 'BADR AIRLINES') throw new Error(`Expected BADR AIRLINES, got ${matchedAirline?.name}`);
  if (finalRoute !== 'PZU – CAI') throw new Error(`Expected route PZU – CAI, got ${finalRoute}`);
  if (matchedCust?.name !== 'امل مرحوم') throw new Error(`Expected customer امل مرحوم, got ${matchedCust?.name}`);
  if (!extracted.taxes?.SD || !extracted.taxes?.YR) throw new Error('Taxes not extracted properly');

  console.log('\n>>> ALL STAGED SELECTION ASSERTIONS PASSED! <<<');
}

testStagedSelection().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
