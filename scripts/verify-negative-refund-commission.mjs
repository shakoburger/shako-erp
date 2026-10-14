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

const { calculateRefundTotals, calculateTicket } = require('../lib/tickets.ts');
const { accountBalances } = require('../lib/balances.ts');
const { statementReport } = require('../lib/financial-reports.ts');

console.log('Testing User Ticket Refund Logic (Default State & Situations)...');

// Ticket details:
// Selling price paid by passenger = 1,800,000 SDG
// Supplier cost = 1,660,000 SDG
// Internal ticket commission = 140,000 SDG

// Scenario 1: THE DEFAULT STATE (الوضع الافتراضي عند فتح الاسترداد بدون أي إدخالات)
// Passenger gets back full 1,800,000 SDG without any deduction.
// Airline refunds 1,660,000 SDG.
// Agency reverses the 140,000 SDG issuance commission (-140,000 SDG).
const defaultPayload = {
  status: 'refunded',
  originalSellMinor: 180000000, // 1,800,000 SDG
  originalCostMinor: 166000000, // 1,660,000 SDG
  sellingPrice: 1800000,
  supplierPrice: 1660000,
  penalties: 0,
  supplierComm: 0,
  refundComm: 0,
};
const defaultTotals = calculateRefundTotals(defaultPayload);
assert.equal(defaultTotals.supplierRefundMinor, 166000000, 'Supplier refund must be 1,660,000 SDG');
assert.equal(defaultTotals.customerRefundMinor, 180000000, 'Customer refund must be full 1,800,000 SDG (no deductions)');
assert.equal(defaultTotals.incomeMinor, -14000000, 'Agency refund profit must be -140,000 SDG (reversing issuance commission)');
console.log('✓ Default refund state passed: 1,800,000 to passenger, 1,660,000 from airline, -140,000 commission reversed!');

// Scenario 2: Airline penalties added (250k penalty + 100k supplier fee), office waives its commission (refundComm = 0)
const penaltyPayload = {
  status: 'refunded',
  originalSellMinor: 180000000,
  originalCostMinor: 166000000,
  penalties: 250000,
  supplierComm: 100000,
  refundComm: 0,
};
const penaltyTotals = calculateRefundTotals(penaltyPayload);
assert.equal(penaltyTotals.supplierRefundMinor, 131000000, 'Supplier refund must be 1,310,000 SDG');
assert.equal(penaltyTotals.customerRefundMinor, 145000000, 'Customer gets 1,800,000 - 350,000 = 1,450,000 SDG');
assert.equal(penaltyTotals.incomeMinor, -14000000, 'Agency waives commission, net on refund = -140,000 SDG');
console.log('✓ Penalties with waived commission passed: 1,450,000 to passenger, 1,310,000 from airline, -140,000 commission!');

// Scenario 3: Office chooses to KEEP the 140,000 issuance commission (refundComm = 140,000)
const keepCommPayload = {
  status: 'refunded',
  originalSellMinor: 180000000,
  originalCostMinor: 166000000,
  penalties: 250000,
  supplierComm: 100000,
  refundComm: 140000,
};
const keepCommTotals = calculateRefundTotals(keepCommPayload);
assert.equal(keepCommTotals.supplierRefundMinor, 131000000);
assert.equal(keepCommTotals.customerRefundMinor, 131000000, 'Customer gets 1,800,000 - 350,000 - 140,000 = 1,310,000 SDG');
assert.equal(keepCommTotals.incomeMinor, 0, 'Agency kept commission, net on refund = 0 SDG');
console.log('✓ Office keeping commission passed: 1,310,000 to passenger, 0 net refund income (retained 140k profit)!');

// Scenario 4: Office charges extra cancellation profit (refundComm = 190,000 -> keeps 140k + 50k extra)
const extraProfitPayload = {
  status: 'refunded',
  originalSellMinor: 180000000,
  originalCostMinor: 166000000,
  penalties: 250000,
  supplierComm: 100000,
  refundComm: 190000,
};
const extraTotals = calculateRefundTotals(extraProfitPayload);
assert.equal(extraTotals.supplierRefundMinor, 131000000);
assert.equal(extraTotals.customerRefundMinor, 126000000, 'Customer gets 1,800,000 - 350,000 - 190,000 = 1,260,000 SDG');
assert.equal(extraTotals.incomeMinor, 5000000, 'Office earns +50,000 SDG extra profit on refund');
console.log('✓ Office extra profit passed: +50,000 SDG net profit on refund!');

// Double-Entry Accounting and General Ledger Test
const masterCommAccount = {
  id: 'comm-tickets-master',
  kind: 'account',
  name: 'عمولات التذاكر',
  date: '2026-01-01',
  currency: 'SDG',
  amount: 0,
  payload: { accountType: 'commission' }
};

const customerAccount = {
  id: 'cust-01',
  kind: 'customer',
  name: 'أمجد حسين',
  date: '2026-01-01',
  currency: 'SDG',
  amount: 0,
  payload: { accountType: 'customer' }
};

const supplierAccount = {
  id: 'sup-sd-airline',
  kind: 'account',
  name: 'الخطوط السودانية',
  date: '2026-01-01',
  currency: 'SDG',
  amount: 0,
  payload: { accountType: 'airline' }
};

// Test accounting on default full refund:
const ticketDefaultRefundRow = {
  id: 'ticket-default-refund',
  kind: 'ticket',
  code: '2002415296960',
  name: 'Amgad Hussein',
  date: '2026-10-01',
  currency: 'SDG',
  amount: 180000000,
  payload: {
    ...defaultPayload,
    customerId: 'cust-01',
    customerName: 'أمجد حسين',
    supplierId: 'sup-sd-airline',
    airline: 'الخطوط السودانية',
    commissionAccountId: 'comm-tickets-master',
    refundDate: '2026-10-10'
  }
};

const rows = [masterCommAccount, customerAccount, supplierAccount, ticketDefaultRefundRow];
const balances = accountBalances(rows, '2026-12-31');

const commBal = balances.find(b => b.accountId === 'comm-tickets-master');
const custBal = balances.find(b => b.accountId === 'cust-01');
const supBal = balances.find(b => b.accountId === 'sup-sd-airline');

assert.ok(commBal, 'Commission account balance exists');
assert.ok(custBal, 'Customer account balance exists');
assert.ok(supBal, 'Supplier account balance exists');

// Verify commission account was DEBITED by 140,000 (reversing issuance commission)
assert.equal(commBal.debitMinor, 14000000, 'Commission account debitMinor must be 140,000 SDG');
assert.equal(commBal.creditMinor, 0, 'Commission account creditMinor must be 0');

// Verify supplier was debited by 1,660,000 (airline refunded original cost)
assert.equal(supBal.debitMinor, 166000000, 'Supplier account debitMinor must be 1,660,000 SDG');

// Verify customer was credited by 1,800,000 (refunded full selling price)
assert.equal(custBal.creditMinor, 180000000, 'Customer account creditMinor must be 1,800,000 SDG');

// Double entry balancing: Total Debits === Total Credits
const totalDebits = commBal.debitMinor + supBal.debitMinor;
const totalCredits = custBal.creditMinor;
assert.equal(totalDebits, totalCredits, `Total debits (${totalDebits}) must equal total credits (${totalCredits})`);
console.log('✓ General Ledger double-entry integrity verified: Debits (1,660,000 sup + 140,000 comm) === Credits (1,800,000 cust)!');

// Statement of Account (كشف الحساب)
const commKey = JSON.stringify(['comm-tickets-master', 'SDG']);
const commStmt = statementReport(rows, commKey, '2026-01-01', '2026-12-31', false);
assert.equal(commStmt.entries.length, 1);
assert.equal(commStmt.entries[0].debitMinor, 14000000);
console.log('✓ Statement of Account displays accurate debit movement on commission reversal!');

console.log('\n🎉 ALL REFUND TESTS PASSED 100%!');
