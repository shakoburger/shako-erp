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

const { calculateRefundTotals, calculateTicket, ticketSupplierDue } = require('../lib/tickets.ts');
const { accountBalances } = require('../lib/balances.ts');
const { statementReport } = require('../lib/financial-reports.ts');

console.log('Testing User Exact Refund Scenario...');

// 1. User's exact parameters:
// Original Ticket = 1000 USD
// Airline Penalty = 100 USD
// Supplier Commission = 50 USD
// Office Commission = 50 USD
const ticket = {
  id: 'ticket-user-001',
  kind: 'ticket',
  code: '1234567890123',
  name: 'أحمد محمد',
  date: '2026-10-01',
  currency: 'USD',
  amount: 0,
  payload: {
    status: 'refunded',
    refundDate: '2026-10-05',
    originalSellMinor: 100000, // 1000 USD
    originalCostMinor: 100000, // 1000 USD
    fare: 1000,
    sellingPrice: 800, // net customer refund
    supplierPrice: 850, // net supplier refund
    penalties: 100, // airline cancellation penalty
    supplierComm: 50, // supplier commission / fee
    refundComm: 50, // office refund commission
    customerId: 'cust-ahmed',
    supplierId: 'sup-badr',
    airline: 'بدر للطيران',
    commissionAccountId: 'rev-comm',
    taxes: {}
  }
};

// 2. Test calculateRefundTotals
const totals = calculateRefundTotals(ticket.payload);
assert.equal(totals.originalSellMinor, 100000, 'Original sell must be 1000 USD');
assert.equal(totals.originalCostMinor, 100000, 'Original cost must be 1000 USD');
assert.equal(totals.penaltyMinor, 10000, 'Penalty must be 100 USD');
assert.equal(totals.supplierCommMinor, 5000, 'Supplier commission must be 50 USD');
assert.equal(totals.refundCommMinor, 5000, 'Office commission must be 50 USD');
assert.equal(totals.supplierRefundMinor, 85000, 'Supplier refund returned to agency must be 850 USD');
assert.equal(totals.customerRefundMinor, 80000, 'Customer refund returned to passenger must be 800 USD');
assert.equal(totals.incomeMinor, 5000, 'Office income from refund must be 50 USD');

console.log('✓ calculateRefundTotals matches user example (850 sup / 800 cust / 50 income)');

// 3. Test calculateTicket
const pricing = calculateTicket(ticket.payload);
assert.equal(pricing.supplierDueMinor, 85000);
assert.equal(pricing.totalMinor, 80000);
assert.equal(pricing.incomeMinor, 5000);
assert.equal(pricing.supplierRefundMinor, 85000);
assert.equal(pricing.customerRefundMinor, 80000);
console.log('✓ calculateTicket matches pricing');

// 4. Test ticketSupplierDue
assert.equal(ticketSupplierDue(ticket), 85000);
console.log('✓ ticketSupplierDue returns 850 USD');

// 5. Test accountBalances
const records = [
  {
    id: 'cust-ahmed',
    kind: 'customer',
    name: 'أحمد محمد',
    code: 'C001',
    date: '2026-01-01',
    currency: 'USD',
    amount: 0,
    payload: { accountType: 'customer' }
  },
  {
    id: 'sup-badr',
    kind: 'customer',
    name: 'بدر للطيران',
    code: 'S001',
    date: '2026-01-01',
    currency: 'USD',
    amount: 0,
    payload: { accountType: 'airline' }
  },
  {
    id: 'rev-comm',
    kind: 'account',
    name: 'إيرادات التذاكر والعمولات',
    code: 'A001',
    date: '2026-01-01',
    currency: 'USD',
    amount: 0,
    payload: { accountType: 'revenue' }
  },
  ticket
];

const balances = accountBalances(records);
const custBal = balances.find(b => b.accountId === 'cust-ahmed' && b.currency === 'USD');
const supBal = balances.find(b => b.accountId === 'sup-badr' && b.currency === 'USD');
const revBal = balances.find(b => b.accountId === 'rev-comm' && b.currency === 'USD');

// Customer: debited 1000 on orig, credited 800 on refund -> net balance = +200 USD (customer cost for penalty & fees)
assert.equal(custBal.balanceMinor, 20000, 'Customer net balance must be 200 USD');

// Supplier: credited 1000 on orig, debited 850 on refund -> net balance = -150 USD (supplier keeps 150)
assert.equal(supBal.balanceMinor, -15000, 'Supplier net balance must be -150 USD');

// Revenue: credited 50 on refund -> net balance = -50 USD (liability/credit income of 50 USD)
assert.equal(revBal.balanceMinor, -5000, 'Revenue balance must be -50 USD credit');

console.log('✓ accountBalances correctly updates Customer (+200), Supplier (-150), and Revenue (-50)');

// 6. Test statementReport for Customer and Supplier
const custStatement = statementReport(records, JSON.stringify(['cust-ahmed', 'USD']), '2026-10-01', '2026-10-10');
assert.equal(custStatement.entries.length, 2, 'Customer statement should have 2 entries (issuance + refund)');
assert.equal(custStatement.entries[0].debitMinor, 100000, 'First entry is issuance of 1000 USD debit');
assert.equal(custStatement.entries[1].creditMinor, 80000, 'Second entry is refund of 800 USD credit');
assert.equal(custStatement.closingMinor, 20000, 'Ending balance on statement is 200 USD');

const supStatement = statementReport(records, JSON.stringify(['sup-badr', 'USD']), '2026-10-01', '2026-10-10');
assert.equal(supStatement.entries.length, 2, 'Supplier statement should have 2 entries (issuance + refund)');
assert.equal(supStatement.entries[0].creditMinor, 100000, 'First entry is issuance of 1000 USD credit');
assert.equal(supStatement.entries[1].debitMinor, 85000, 'Second entry is refund of 850 USD debit');
assert.equal(supStatement.closingMinor, -15000, 'Ending balance on supplier statement is -150 USD');

console.log('✓ statementReport creates accurate two-legged chronological audit entries with exact amounts');
console.log('\nALL USER SCENARIO ASSERTIONS PASSED 100%! 🎉');
