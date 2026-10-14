import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5173';
const auth = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = auth.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

const customers = await (await fetch(base + '/api/records?kind=customer', {
  headers: { Cookie: cookie, Origin: base }
})).json();

const kirolos = customers.find(c => c.name.includes('كيرلس'));
const ofoq = customers.find(c => c.name.includes('الأفق'));

const testPayload = {
  kind: 'service',
  name: 'تأمين سفر دولي',
  code: '0000020',
  date: '2026-10-07',
  currency: 'USD',
  amount: 450,
  payload: {
    receiptNumber: '0000020',
    serviceAccountId: '',
    serviceAccountName: 'تأمين سفر دولي',
    cost: 125,
    price: 150,
    quantity: 3,
    notes: 'لللللل',
    payment: 'credit',
    treasuryId: '',
    supplierId: ofoq?.id || '',
    supplierName: ofoq?.name || 'وكالة الأفق',
    discount: 0,
    commissionAccountId: '',
    commissionAccountName: '',
    exchangeRate: 1,
    brokerId: '',
    brokerName: '',
    brokerCommission: 0,
    flags: { Group: false, Broker: false },
    customerName: kirolos?.name || 'كيرلس',
    customerId: kirolos?.id
  }
};

const res = await fetch(base + '/api/records', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: base,
    Cookie: cookie
  },
  body: JSON.stringify(testPayload)
});

console.log('Status:', res.status);
const resBody = await res.json();
console.log('Response body:', resBody);
