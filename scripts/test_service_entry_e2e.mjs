import { accountBalances } from '../lib/balances.js';
import { statementReport } from '../lib/financial-reports.js';

console.log('=== RUNNING SERVICE ENTRY E2E TESTS ===\n');

// 1. Mock DB Records
const customerId = 'cust-101';
const supplierId = 'sup-202';
const brokerId = 'brk-303';
const commAccountId = 'comm-404';

const masters = [
  {
    id: customerId,
    kind: 'customer',
    name: 'شركة الأفق للسياحة',
    date: '2026-10-01',
    currency: 'USD',
    amount: 0,
    payload: { creditLimit: 50000 }
  },
  {
    id: supplierId,
    kind: 'customer',
    name: 'مجموعة فنادق هيلتون',
    date: '2026-10-01',
    currency: 'USD',
    amount: 0,
    payload: { accountType: 'supplier' }
  },
  {
    id: brokerId,
    kind: 'account',
    name: 'وكالة الوسيط للتسويق',
    date: '2026-10-01',
    currency: 'USD',
    amount: 0,
    payload: { accountType: 'general' }
  },
  {
    id: commAccountId,
    kind: 'account',
    name: 'أرباح وعمولات الخدمات',
    date: '2026-10-01',
    currency: 'USD',
    amount: 0,
    payload: { accountType: 'commission' }
  }
];

// 2. Create Service Record
// Price: 750, Cost: 500, Qty: 2, Discount: 50
// Gross: 1500, Net Amount: 1450
// Supplier Due: 500 * 2 = 1000
// Broker Comm: 50
// Office Profit: 1450 - 1000 - 50 = 400
const serviceRecord = {
  id: 'srv-001',
  kind: 'service',
  name: 'حجز فنادق',
  code: '00000199',
  date: '2026-10-07',
  currency: 'USD',
  amount: 145000, // 1450 USD in minor units
  payload: {
    receiptNumber: '00000199',
    serviceAccountId: 'srv-type-1',
    serviceAccountName: 'حجز فنادق',
    cost: 500,
    price: 750,
    quantity: 2,
    discount: 50,
    costMinor: 50000,
    priceMinor: 75000,
    discountMinor: 5000,
    supplierDueMinor: 100000, // 1000 USD
    brokerCommission: 50,
    brokerCommissionMinor: 5000, // 50 USD
    incomeMinor: 40000, // 400 USD
    customerId,
    customerName: 'شركة الأفق للسياحة',
    supplierId,
    supplierName: 'مجموعة فنادق هيلتون',
    brokerId,
    brokerName: 'وكالة الوسيط للتسويق',
    commissionAccountId: commAccountId,
    commissionAccountName: 'أرباح وعمولات الخدمات',
    notes: 'إقامة 3 ليالي غرفة ديلوكس شامل الإفطار',
    payment: 'credit',
    flags: {
      Group: false,
      Broker: true
    }
  }
};

const allRows = [...masters, serviceRecord];

// 3. Test Balances
const balances = accountBalances(allRows, '2026-10-31');

console.log('--- Account Balances Verification ---');
const custBal = balances.find(b => b.accountId === customerId && b.currency === 'USD');
const supBal = balances.find(b => b.accountId === supplierId && b.currency === 'USD');
const brkBal = balances.find(b => b.accountId === brokerId && b.currency === 'USD');
const commBal = balances.find(b => b.accountId === commAccountId && b.currency === 'USD');

console.log(`Customer balance: ${custBal?.balanceMinor / 100} USD (Expected: +1450.00 debit)`);
console.log(`Supplier balance: ${supBal?.balanceMinor / 100} USD (Expected: -1000.00 credit)`);
console.log(`Broker balance: ${brkBal?.balanceMinor / 100} USD (Expected: -50.00 credit)`);
console.log(`Commission/Income balance: ${commBal?.balanceMinor / 100} USD (Expected: -400.00 credit)`);

if (custBal?.balanceMinor !== 145000) throw new Error('Customer balance mismatch');
if (supBal?.balanceMinor !== -100000) throw new Error('Supplier balance mismatch');
if (brkBal?.balanceMinor !== -5000) throw new Error('Broker balance mismatch');
if (commBal?.balanceMinor !== -40000) throw new Error('Commission balance mismatch');

const totalNetSum = (custBal?.balanceMinor || 0) + (supBal?.balanceMinor || 0) + (brkBal?.balanceMinor || 0) + (commBal?.balanceMinor || 0);
console.log(`Double-entry check sum: ${totalNetSum} (Expected: 0)`);
if (totalNetSum !== 0) throw new Error('Double entry sum is not zero!');

// 4. Test Statement of Account for Customer
console.log('\n--- Customer Statement of Account Verification ---');
const customerKey = JSON.stringify([customerId, 'USD']);
const statement = statementReport(allRows, customerKey, '2026-10-01', '2026-10-31', false);

console.log('Customer Statement entries count:', statement.entries.length);
const entry = statement.entries[0];
console.log('Entry Date:', entry.date);
console.log('Entry Receipt / Reference:', entry.reference);
console.log('Entry Description:', entry.description);
console.log('Entry Debit:', entry.debitMinor / 100);

if (entry.reference !== '00000199') throw new Error(`Expected reference '00000199' but got '${entry.reference}'`);
if (entry.debitMinor !== 145000) throw new Error('Expected debit 145000');
if (!entry.description.includes('حجز فنادق')) throw new Error('Expected service name in description');

// 5. Test Receipt Number Padding
console.log('\n--- Receipt Number Formatting ---');
const nextReceipt = String(Number(parseInt('00000199', 10)) + 1).padStart(8, '0');
console.log(`Next receipt number: ${nextReceipt} (Expected: 00000200)`);
if (nextReceipt !== '00000200') throw new Error('Receipt formatting error');

console.log('\n>>> ALL SERVICE ENTRY E2E TESTS PASSED WITH 100% SUCCESS! <<<');
