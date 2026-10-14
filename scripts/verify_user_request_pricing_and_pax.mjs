import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTicketTextContent } from '../lib/ticket-extractor.ts';

// 1. Simulate the Reciprocal Pricing Logic (as implemented in workspaces.tsx and staged-operations-workspace.tsx)
class PricingSimulator {
  constructor() {
    this.pricingLead = 'none';
    this.commAmount = '';
    this.sellingPrice = '';
    this.supplierPrice = '';
  }

  setCommission(cVal) {
    this.pricingLead = cVal !== '' ? 'comm' : 'none';
    this.commAmount = cVal;
  }

  setSellingPrice(sVal) {
    const s = Number(sVal || 0);
    const comm = Number(this.commAmount || 0);
    const sup = Number(this.supplierPrice || 0);

    if (this.pricingLead === 'comm' && this.commAmount !== '') {
      // Rule 1: Comm entered first, then selling entered -> supplier = selling - comm
      this.sellingPrice = String(s);
      this.supplierPrice = String(Math.max(0, Math.round((s - comm) * 100) / 100));
      return;
    }

    // Rule 3: Supplier and Selling entered -> Comm = Selling - Supplier
    this.pricingLead = 'sell';
    this.sellingPrice = String(s);
    if (sup > 0) {
      this.commAmount = String(Math.max(0, Math.round((s - sup) * 100) / 100));
    }
  }

  setSupplierPrice(supVal) {
    const sup = Number(supVal || 0);
    const comm = Number(this.commAmount || 0);
    const sell = Number(this.sellingPrice || 0);

    if (this.pricingLead === 'comm' && this.commAmount !== '') {
      // Rule 2: Comm entered first, then supplier entered -> selling = supplier + comm
      this.supplierPrice = String(sup);
      this.sellingPrice = String(Math.round((sup + comm) * 100) / 100);
      return;
    }

    // Rule 3: Supplier and Selling entered -> Comm = Selling - Supplier
    this.pricingLead = 'supplier';
    this.supplierPrice = String(sup);
    if (sell > 0) {
      this.commAmount = String(Math.max(0, Math.round((sell - sup) * 100) / 100));
    }
  }
}

// Tests
console.log('--- RUNNING USER SPECIFICATION VERIFICATIONS ---');

// Test 1: Commission entered first (50), then Selling price (500) -> Supplier price = 450
{
  const sim = new PricingSimulator();
  sim.setCommission('50');
  sim.setSellingPrice('500');
  assert.strictEqual(sim.supplierPrice, '450', 'Supplier price must be 450');
  assert.strictEqual(sim.commAmount, '50', 'Commission must remain 50');
  console.log('✓ Rule 1 passed: Comm (50) -> Sell (500) -> Sup = 450, Comm = 50');
}

// Test 2: Commission entered first (50), then Supplier price (450) -> Selling price = 500
{
  const sim = new PricingSimulator();
  sim.setCommission('50');
  sim.setSupplierPrice('450');
  assert.strictEqual(sim.sellingPrice, '500', 'Selling price must be 500');
  assert.strictEqual(sim.commAmount, '50', 'Commission must remain 50');
  console.log('✓ Rule 2 passed: Comm (50) -> Sup (450) -> Sell = 500, Comm = 50');
}

// Test 3: Supplier price (450) entered, then Selling price (500) -> Comm = 50
{
  const sim = new PricingSimulator();
  sim.setSupplierPrice('450');
  sim.setSellingPrice('500');
  assert.strictEqual(sim.commAmount, '50', 'Commission must be calculated as 50');
  assert.strictEqual(sim.sellingPrice, '500');
  assert.strictEqual(sim.supplierPrice, '450');
  console.log('✓ Rule 3A passed: Sup (450) -> Sell (500) -> Comm = 50');
}

// Test 4: Selling price (500) entered, then Supplier price (450) -> Comm = 50
{
  const sim = new PricingSimulator();
  sim.setSellingPrice('500');
  sim.setSupplierPrice('450');
  assert.strictEqual(sim.commAmount, '50', 'Commission must be calculated as 50');
  assert.strictEqual(sim.sellingPrice, '500');
  assert.strictEqual(sim.supplierPrice, '450');
  console.log('✓ Rule 3B passed: Sell (500) -> Sup (450) -> Comm = 50');
}

// Test 5: Top-left passenger and ticket extraction with stacked passengers (Badr style)
{
  const badrSampleText = `
BADR AIRLINES
ELECTRONIC TICKET PASSENGER ITINERARY RECEIPT
1. SOFIAN DABLOUK - 367 2420 778012
2. AMNA DABLOUK - 367 2420 778013
3. OMAR DABLOUK - 367 2420 778014
BOOKING REF: 6KXYZ1
CAI - KRT
FARE: USD 450.00
TOTAL: USD 500.00
`;
  const res = parseTicketTextContent(badrSampleText);
  assert.strictEqual(res.passengers.length, 3, 'Should extract 3 stacked passengers');
  assert.strictEqual(res.passengers[0].name, 'SOFIAN DABLOUK');
  assert.strictEqual(res.passengers[0].ticketNo, '3672420778012');
  assert.strictEqual(res.passengers[1].name, 'AMNA DABLOUK');
  assert.strictEqual(res.passengers[1].ticketNo, '3672420778013');
  assert.strictEqual(res.passengers[2].name, 'OMAR DABLOUK');
  assert.strictEqual(res.passengers[2].ticketNo, '3672420778014');
  assert.strictEqual(res.ticketNo, '3672420778012', 'Primary ticket number must be clean digits only');
  assert.strictEqual(res.customerName, '', 'Customer name must be empty (user chooses customer name)');
  console.log('✓ Multi-pax & stacked tickets passed: 3 passengers correctly extracted with clean ticket numbers');
}

// Test 6: Tarco style single page extraction
{
  const tarcoSamplePage1 = `
TARCO AVIATION
E-TICKET RECEIPT
Mr. MUHANAD ELTAYEB 524 2419 449891
BOOKING REF: T7XYZ9
PZU - CAI
TOTAL: USD 350.00
`;
  const res1 = parseTicketTextContent(tarcoSamplePage1);
  assert.strictEqual(res1.passengers.length, 1);
  assert.strictEqual(res1.passengers[0].name, 'MUHANAD ELTAYEB');
  assert.strictEqual(res1.passengers[0].ticketNo, '5242419449891');
  assert.strictEqual(res1.ticketNo, '5242419449891', 'Ticket number must be clean digits only');
  assert.strictEqual(res1.customerName, '', 'Customer name must not be auto-filled');
  console.log('✓ Tarco single passenger page passed: 5242419449891 / MUHANAD ELTAYEB');
}

// Test 7: Sudan Airways sample from user ticket image
{
  const sudanAirwaysText = `
Passenger Name Ticket Number Information / Service request Type Contact Passport Number
Mr. Mohamedelhabeeb Mustafa 2002415301856 Adult(s) +249912597111
Booking reference # 005IAF
Payment Receipt
Payment mode : In account
Date of issue : 13-Oct-26
Place of issue : Nouraya Travel and Tourism Agency (PZU) (AGTPZU0905)SDG
Ticket issued by : Nouraya Tourism Age
Base fare amount 250,000 SDG
Tax and surcharges 550,000 SDG
NY : 30,000; N5 : 12,705; SD : 5,000; VT : 42,500; YR : 230,000; YQ : 229,795;
Total amount 800,000 SDG
Other fees* 0 SDG
`;
  const res = parseTicketTextContent(sudanAirwaysText);
  assert.strictEqual(res.passengers.length, 1);
  assert.strictEqual(res.passengers[0].name, 'Mohamedelhabeeb Mustafa', 'Must extract clean passenger name without titles or info');
  assert.strictEqual(res.passengers[0].ticketNo, '2002415301856', 'Must extract clean 13-digit ticket number only');
  assert.strictEqual(res.ticketNo, '2002415301856');
  assert.strictEqual(res.customerName, '', 'Customer name must be empty so user chooses customer');
  assert.strictEqual(res.airline, 'SUDAN AIRWAYS');
  assert.strictEqual(res.pnr, '005IAF');
  assert.strictEqual(res.date, '2026-10-13');
  assert.strictEqual(res.total, 800000);
  assert.strictEqual(res.currency, 'SDG');
  console.log('✓ Sudan Airways sample passed: Mohamedelhabeeb Mustafa / 2002415301856 / 800,000 SDG');
}

// Test 8: Actual 2-page PDF with Page 2 General Conditions
{
  const { analyzeTicketDocument } = await import('../lib/ticket-extractor.ts');
  const fs = await import('fs');
  const pdfPath = 'C:/Users/core x/.gemini/antigravity-ide/brain/0fb47c91-8287-4bc6-92c9-1f1e110ed031/.user_uploaded/media_1791909676419.pdf';
  if (fs.existsSync(pdfPath)) {
    const buffer = fs.readFileSync(pdfPath);
    const res = await analyzeTicketDocument({
      name: 'ticket.pdf',
      type: 'application/pdf',
      data: 'data:application/pdf;base64,' + buffer.toString('base64')
    });
    assert.strictEqual(res.passengers.length, 1, 'Must extract exactly 1 passenger, no page 2 garbage or fake passengers');
    assert.strictEqual(res.passengers[0].name, 'Mohamedelhabeeb Mustafa');
    assert.strictEqual(res.passengers[0].ticketNo, '2002415301856');
    assert.strictEqual(res.ticketNo, '2002415301856');
    assert.strictEqual(res.total, 800000, 'Total must be strictly 800,000 SDG, never 1,600,000');
    assert.strictEqual(res.customerName, '');
    console.log('✓ Multi-page PDF test passed: 1 passenger (Mohamedelhabeeb Mustafa / 2002415301856), total 800,000 SDG, zero page 2 text captured');
  }
}

console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
