import assert from 'node:assert';
import { extractInvoiceItemsFromTicket } from '../lib/ticket-extractor.ts';

console.log('--- TESTING INVOICE MULTI-PASSENGER EXTRACTION & PRICING ---');

// Test 1: User's exact ticket from screenshot (2002415294464 with 4 passengers, total 5,250,744 SDG)
{
  const mockTicket = {
    id: 'tkt-test-1',
    code: '2002415294464',
    name: 'Amira Ahmed / Osman Abdala / Mustafa Mohammed / Rakan Mohammed',
    currency: 'SDG',
    amount: 525074400, // minor units in records table
    date: '2026-10-07',
    payload: {
      fare: 5250744,
      taxes: { SD: 0, YR: 0 },
      airline: 'الخطوط السودانية',
      route: 'PZU - CAI',
      passengers: [
        { name: 'Amira Ahmed', ticketNo: '2002415294464' },
        { name: 'Osman Abdala', ticketNo: '2002415294465' },
        { name: 'Mustafa Mohammed', ticketNo: '2002415294466' },
        { name: 'Rakan Mohammed', ticketNo: '2002415294467' }
      ]
    }
  };

  const items = extractInvoiceItemsFromTicket(mockTicket);
  assert.strictEqual(items.length, 4, 'Must create 4 invoice items for 4 passengers');

  assert.strictEqual(items[0].passengerName, 'Amira Ahmed');
  assert.strictEqual(items[0].ticketNo, '2002415294464');
  assert.strictEqual(items[0].total, 1312686, '5,250,744 / 4 = 1,312,686');

  assert.strictEqual(items[1].passengerName, 'Osman Abdala');
  assert.strictEqual(items[1].ticketNo, '2002415294465');
  assert.strictEqual(items[1].total, 1312686);

  assert.strictEqual(items[2].passengerName, 'Mustafa Mohammed');
  assert.strictEqual(items[2].ticketNo, '2002415294466');
  assert.strictEqual(items[2].total, 1312686);

  assert.strictEqual(items[3].passengerName, 'Rakan Mohammed');
  assert.strictEqual(items[3].ticketNo, '2002415294467');
  assert.strictEqual(items[3].total, 1312686);

  const subtotal = items.reduce((s, it) => s + it.total, 0);
  assert.strictEqual(subtotal, 5250744, 'Sum of all items must equal ticket total exactly');
  console.log('✓ Test 1 passed: 4 passengers correctly added with divided price (1,312,686 each, total 5,250,744)');
}

// Test 2: Single passenger ticket (2002415301856 with 800,000 SDG)
{
  const mockSingleTicket = {
    id: 'tkt-test-2',
    code: '2002415301856',
    name: 'Mohamedelhabeeb Mustafa',
    currency: 'SDG',
    amount: 80000000,
    date: '2026-10-13',
    payload: {
      fare: 800000,
      airline: 'SUDAN AIRWAYS',
      route: 'PZU - KRT',
      passengers: [
        { name: 'Mohamedelhabeeb Mustafa', ticketNo: '2002415301856' }
      ]
    }
  };

  const items = extractInvoiceItemsFromTicket(mockSingleTicket);
  assert.strictEqual(items.length, 1, 'Single passenger ticket must create exactly 1 invoice item');
  assert.strictEqual(items[0].passengerName, 'Mohamedelhabeeb Mustafa');
  assert.strictEqual(items[0].ticketNo, '2002415301856');
  assert.strictEqual(items[0].total, 800000);
  console.log('✓ Test 2 passed: Single passenger ticket preserved with full amount (800,000 SDG)');
}

// Test 3: 3 passengers with uneven division (100.00 USD / 3)
{
  const mockUneven = {
    id: 'tkt-test-3',
    code: '3671112223334',
    name: 'Ali / Omar / Zaid',
    currency: 'USD',
    amount: 10000, // 100.00 USD
    date: '2026-10-10',
    payload: {
      fare: 100,
      passengers: [
        { name: 'Ali', ticketNo: '3671112223334' },
        { name: 'Omar', ticketNo: '3671112223335' },
        { name: 'Zaid', ticketNo: '3671112223336' }
      ]
    }
  };

  const items = extractInvoiceItemsFromTicket(mockUneven);
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].total, 33.33);
  assert.strictEqual(items[1].total, 33.33);
  assert.strictEqual(items[2].total, 33.34);
  const sum = items.reduce((s, it) => s + it.total, 0);
  assert.strictEqual(Math.round(sum * 100) / 100, 100);
  console.log('✓ Test 3 passed: Uneven division accurately handles remainder without loss (33.33, 33.33, 33.34 = 100)');
}

console.log('ALL INVOICE MULTI-PASSENGER TESTS PASSED SUCCESSFULLY!');
