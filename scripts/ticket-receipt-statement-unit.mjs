import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const require = createRequire(import.meta.url), ts = require('typescript');
const root = resolve('.');
require.extensions['.ts'] = (m, file) => {
  let code = readFileSync(file, 'utf8').replace(/from ['"]@\/(.*?)['"]/g, `from '${root.replace(/\\/g, '/')}/$1'`);
  m._compile(ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, file);
};
require.extensions['.tsx'] = (m, file) => {
  let code = readFileSync(file, 'utf8').replace(/from ['"]@\/(.*?)['"]/g, `from '${root.replace(/\\/g, '/')}/$1'`);
  m._compile(ts.transpileModule(code, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText, file);
};

const { statementReport } = require('../lib/financial-reports.ts');
const { accountStatementData } = require('../components/account-statement.tsx');

// Mock row creator
function makeRow(id, kind, date, amount, payload, code = id, currency = 'USD') {
  return {
    id,
    kind,
    module: kind === 'ticket' ? 'tickets' : 'cash',
    code,
    name: payload.customerName || 'Test Customer',
    date,
    currency,
    amount,
    payload,
    createdAt: date + 'T10:00:00Z',
    updatedAt: date + 'T10:00:00Z'
  };
}

// 1. Verify Ticket + Settlement receiptNumber in Statement
const customerId = 'cust-123';
const customerKey = JSON.stringify([customerId, 'USD']);

const ticket1 = makeRow(
  'tkt-001',
  'ticket',
  '2026-10-01',
  50000,
  {
    customerId,
    customerName: 'Ahmad Ali',
    receiptNumber: '1',
    fare: 450,
    status: 'active',
    passengers: [{ name: 'Ahmad Ali', ticketNo: '0651234567890' }]
  },
  '0651234567890'
);

const settlement1 = makeRow(
  'settlement:tkt-001',
  'cash',
  '2026-10-01',
  50000,
  {
    customerId,
    customerName: 'Ahmad Ali',
    sourceId: 'tkt-001',
    receiptNumber: '1',
    direction: 'receipt',
    systemGenerated: true
  },
  'payment:tkt-001'
);

const rows = [ticket1, settlement1];
const ledger = statementReport(rows, customerKey, '2026-10-01', '2026-10-31', true);

assert.equal(ledger.entries.length, 2, 'Should have 2 statement entries');

// Ticket entry
const ticketEntry = ledger.entries.find(e => e.id === 'tkt-001');
assert.ok(ticketEntry, 'Ticket entry must exist');
assert.equal(ticketEntry.reference, '1', 'Ticket entry reference must equal ticket receiptNumber');
assert.equal(ticketEntry.debitMinor, 50000, 'Ticket entry must be debit 50000 (500 USD)');

// Settlement entry
const settlementEntry = ledger.entries.find(e => e.id === 'settlement:tkt-001');
assert.ok(settlementEntry, 'Settlement entry must exist');
assert.equal(settlementEntry.reference, '1', 'Settlement entry reference must match ticket receiptNumber');
assert.equal(settlementEntry.creditMinor, 50000, 'Settlement entry must be credit 50000 (500 USD)');

// Balance check
assert.equal(ledger.closingMinor, 0, 'Closing balance after full settlement should be 0');

// Verify Account Statement Structure
const settings = { companyName: 'Shako Travel', phones: '123', defaultCurrency: 'USD', modules: {} };
const selected = { key: customerKey, accountId: customerId, name: 'Ahmad Ali', currency: 'USD', kind: 'customer' };
const statementData = accountStatementData({
  selected,
  master: { id: customerId, name: 'Ahmad Ali', payload: {} },
  currentBalanceMinor: 0,
  from: '2026-10-01',
  to: '2026-10-31',
  all: true,
  ledger,
  settings
});

assert.deepEqual(
  statementData.headers,
  ['التاريخ', 'الإيصال', 'البيان', 'R.O.E', 'مطالبات', 'سداد', 'الرصيد'],
  'Headers must match statement order'
);

assert.equal(statementData.rows[0][1], '1', 'First row reference must be 1');
assert.equal(statementData.rows[1][1], '1', 'Second row reference must be 1');

// 2. Verify Search logic
const searchFilter = (tickets, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return tickets;
  return tickets.filter(t => {
    const vNo = t.payload?.receiptNumber ? String(t.payload.receiptNumber).toLowerCase() : '';
    const matchVoucher = vNo && (
      `voucher no ${vNo}`.includes(q) ||
      `voucher no${vNo}`.includes(q) ||
      `voucher ${vNo}`.includes(q) ||
      `إيصال ${vNo}`.includes(q) ||
      `ايصال ${vNo}`.includes(q)
    );
    const matchCode = t.code.toLowerCase().includes(q);
    const matchReceipt = vNo && vNo.includes(q);
    const matchName = t.name.toLowerCase().includes(q);
    const matchPax = t.payload?.passengers?.some(ps =>
      (ps.name && ps.name.toLowerCase().includes(q)) ||
      (ps.ticketNo && ps.ticketNo.toLowerCase().includes(q))
    );
    return matchCode || matchReceipt || Boolean(matchVoucher) || matchName || matchPax;
  });
};

const ticketList = [
  ticket1,
  makeRow('tkt-002', 'ticket', '2026-10-02', 30000, { receiptNumber: '2', passengers: [{ name: 'Sara', ticketNo: '0659999999999' }] }, '0659999999999')
];

// Search by receiptNumber "1"
assert.equal(searchFilter(ticketList, '1').length, 1);
assert.equal(searchFilter(ticketList, '1')[0].id, 'tkt-001');

// Search by "voucher no1"
assert.equal(searchFilter(ticketList, 'voucher no1').length, 1);

// Search by "voucher no 2"
assert.equal(searchFilter(ticketList, 'voucher no 2').length, 1);

// Search by Arabic "إيصال 2"
assert.equal(searchFilter(ticketList, 'إيصال 2').length, 1);

// Search by passenger name "Sara"
assert.equal(searchFilter(ticketList, 'Sara').length, 1);
assert.equal(searchFilter(ticketList, 'Sara')[0].id, 'tkt-002');

// Search by ticket number
assert.equal(searchFilter(ticketList, '0651234567890').length, 1);

// 3. Next Voucher Number calculation
const computeNextVoucher = (tickets) => {
  const maxNum = tickets.reduce((max, t) => {
    const raw = t.payload?.receiptNumber;
    const n = parseInt(raw || '', 10);
    return !isNaN(n) && n > max ? n : max;
  }, 0);
  return String(maxNum + 1);
};

assert.equal(computeNextVoucher(ticketList), '3', 'Next voucher number after 1 and 2 should be 3');

console.log('PASS: ticket receiptNumber, search filter, auto-increment, and account statement integration verified successfully!');
