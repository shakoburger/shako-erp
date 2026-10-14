import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(
  ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  file
);

const { calculateTicket, ticketSupplierDue } = require('../lib/tickets.ts');
const { accountBalances } = require('../lib/balances.ts');

console.log('Testing Ticket Pricing & Zero Comm Logic...');

// 1. Zero Comm is FALSE: Internal commission deducted from airline/supplier price
{
  const p1 = {
    fare: 1000,
    commAmount: 100,
    sellingPrice: 1000,
    supplierPrice: 1000, // even if passed equal to fare/sellingPrice
    flags: { 'Zero Comm': false }
  };
  const res1 = calculateTicket(p1);
  assert.equal(res1.totalMinor, 100000, 'Customer pays 1000 USD');
  assert.equal(res1.supplierDueMinor, 90000, 'Airline due is 900 USD (1000 - 100)');
  assert.equal(res1.incomeMinor, 10000, 'Commission is 100 USD');

  const row1 = {
    id: 't-norm-1',
    kind: 'ticket',
    name: 'سارة أحمد',
    code: '777000111222',
    date: '2026-10-08',
    currency: 'USD',
    amount: res1.totalMinor,
    payload: {
      ...p1,
      ...res1,
      customerId: 'cust-1',
      supplierId: 'airline-tarco',
      commissionAccountId: 'rev-comm'
    }
  };
  assert.equal(ticketSupplierDue(row1), 90000, 'ticketSupplierDue must return 900 USD');

  const rows = [
    { id: 'cust-1', kind: 'customer', name: 'سارة', date: '2026-01-01', currency: 'USD', amount: 0, payload: { accountType: 'customer' } },
    { id: 'airline-tarco', kind: 'customer', name: 'تاركو', date: '2026-01-01', currency: 'USD', amount: 0, payload: { accountType: 'airline' } },
    { id: 'rev-comm', kind: 'account', name: 'إيرادات التذاكر', date: '2026-01-01', currency: 'USD', amount: 0, payload: { accountType: 'revenue' } },
    row1
  ];

  const bals = accountBalances(rows);
  const custBal = bals.find(b => b.accountId === 'cust-1');
  const airBal = bals.find(b => b.accountId === 'airline-tarco');
  const commBal = bals.find(b => b.accountId === 'rev-comm');

  assert.equal(custBal.balanceMinor, 100000, 'Customer owes 1000 USD (+1000)');
  assert.equal(airBal.balanceMinor, -90000, 'Airline is owed 900 USD (-900)');
  assert.equal(commBal.balanceMinor, -10000, 'Commission account credited 100 USD (-100)');
  console.log('✓ Normal Ticket (Zero Comm = false): 1000 Cust / 900 Airline / 100 Commission passed!');
}

// 2. Zero Comm is TRUE: Markup added on top to customer
{
  const p2 = {
    fare: 1000,
    commAmount: 100,
    supplierPrice: 1000,
    sellingPrice: 1000,
    flags: { 'Zero Comm': true }
  };
  const res2 = calculateTicket(p2);
  assert.equal(res2.totalMinor, 110000, 'Customer pays 1100 USD (1000 + 100)');
  assert.equal(res2.supplierDueMinor, 100000, 'Airline due is full 1000 USD');
  assert.equal(res2.incomeMinor, 10000, 'Commission is 100 USD');

  const row2 = {
    id: 't-zero-1',
    kind: 'ticket',
    name: 'محمد علي',
    code: '777000111333',
    date: '2026-10-08',
    currency: 'USD',
    amount: res2.totalMinor,
    payload: {
      ...p2,
      ...res2,
      customerId: 'cust-2',
      supplierId: 'airline-badr',
      commissionAccountId: 'rev-comm'
    }
  };
  assert.equal(ticketSupplierDue(row2), 100000, 'ticketSupplierDue must return 1000 USD');

  const rows = [
    { id: 'cust-2', kind: 'customer', name: 'محمد', date: '2026-01-01', currency: 'USD', amount: 0, payload: { accountType: 'customer' } },
    { id: 'airline-badr', kind: 'customer', name: 'بدر', date: '2026-01-01', currency: 'USD', amount: 0, payload: { accountType: 'airline' } },
    { id: 'rev-comm', kind: 'account', name: 'إيرادات التذاكر', date: '2026-01-01', currency: 'USD', amount: 0, payload: { accountType: 'revenue' } },
    row2
  ];

  const bals = accountBalances(rows);
  const custBal = bals.find(b => b.accountId === 'cust-2');
  const airBal = bals.find(b => b.accountId === 'airline-badr');
  const commBal = bals.find(b => b.accountId === 'rev-comm');

  assert.equal(custBal.balanceMinor, 110000, 'Customer owes 1100 USD (+1100)');
  assert.equal(airBal.balanceMinor, -100000, 'Airline is owed 1000 USD (-1000)');
  assert.equal(commBal.balanceMinor, -10000, 'Commission account credited 100 USD (-100)');
  console.log('✓ Zero Comm Ticket (Zero Comm = true): 1100 Cust / 1000 Airline / 100 Commission passed!');
}

// 3. commPct testing
{
  const p3 = {
    fare: 1000,
    commPct: 10,
    sellingPrice: 1000,
    supplierPrice: 1000,
    flags: { 'Zero Comm': false }
  };
  const res3 = calculateTicket(p3);
  assert.equal(res3.totalMinor, 100000, 'Customer pays 1000 USD');
  assert.equal(res3.supplierDueMinor, 90000, 'Airline due is 900 USD');
  assert.equal(res3.incomeMinor, 10000, 'Commission is 100 USD');
  console.log('✓ CommPct (10%) with Zero Comm = false passed!');
}

console.log('\nALL ZERO COMM AND COMMISSION ASSERTIONS PASSED 100%! 🎉\n');
