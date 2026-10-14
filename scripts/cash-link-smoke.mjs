import assert from 'node:assert/strict';

// Local integration checks for shared cash/bank treasury accounts.
const base = 'http://127.0.0.1:5173';
const auth = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = auth.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const headers = { 'Content-Type': 'application/json', Origin: base, Cookie: cookie };
async function req(path, method = 'GET', body, expected = 200, authenticated = true) {
  const r = await fetch(base + path, {
    method,
    headers: authenticated ? headers : { 'Content-Type': 'application/json', Origin: base },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await r.json();
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
let boot = await req('/api/bootstrap');
const original = structuredClone(boot.settings);
const enabled = { ...original, globalLocked: false, modules: Object.fromEntries(Object.keys(original.modules).map(k => [k, true])) };
const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
const date = '2026-10-03';
async function settings(value) {
  const result = await req('/api/settings', 'PUT', { settings: value, revision: boot.revision });
  boot = { ...boot, ...result };
}
const cashSave = body => req('/api/cash', 'POST', body, 201);
const bankSave = body => req('/api/banks', 'POST', body, 201);
const master = (kind, currency = 'EGP') => req('/api/records', 'POST', {
  kind, name: `Cash link QA ${kind} ${currency} ${stamp}`, date, currency, amount: 0, payload: {},
}, 201);
async function legs(id) {
  const data = await req('/api/records?kind=all');
  return (Array.isArray(data) ? data : data.rows).filter(r => r.payload.cashVoucherId === id);
}
function assertAssetLeg(rows, account, amount) {
  const row = rows.find(r => r.payload.treasuryId === account.id);
  assert.ok(row, `Missing ledger leg for ${account.name}`);
  assert.equal(row.kind, account.kind === 'bank-account' ? 'bank' : 'cash');
  assert.equal(row.currency, account.currency);
  assert.equal(row.amount, amount);
  assert.equal(row.payload.status, 'active');
  assert.equal(row.payload.systemGenerated, true);
  return row;
}
const codes = value => (Array.isArray(value) ? value : value.currencies).map(c => typeof c === 'string' ? c : c.code || c.currency);

try {
  await settings(enabled);
  await req('/api/cash', 'GET', undefined, 401, false);
  await req('/api/currencies', 'GET', undefined, 401, false);
  const customer = await master('customer');
  const usdCustomer = await master('customer', 'USD');
  const account = await master('account');
  const usdAccount = await master('account', 'USD');
  const employee = await master('employee');
  const cash = await cashSave({ action: 'account', name: 'خزينة الربط ' + stamp, currency: 'EGP', rate: 1 });
  const otherCash = await cashSave({ action: 'account', name: 'خزينة ثانية ' + stamp, currency: 'EGP', rate: 1 });
  const bank = await bankSave({ action: 'account', name: 'بنك الربط ' + stamp, currency: 'EGP', rate: 1 });
  const otherBank = await bankSave({ action: 'account', name: 'بنك ثانٍ ' + stamp, currency: 'EGP', rate: 1 });
  const usdBank = await bankSave({ action: 'account', name: 'بنك الدولار للربط ' + stamp, currency: 'USD', rate: 50 });
  const customCode = 'Q' + Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  await cashSave({ action: 'currency', name: 'عملة المشرف ' + stamp, currency: customCode, rate: 7 });
  let data = await req('/api/cash');
  assert.ok(data.accounts.every(a => a.kind === 'cash-account'), 'Cash account editor must keep its own catalog');
  assert.ok(data.treasuries.some(a => a.id === cash.id));
  assert.ok(data.treasuries.some(a => a.id === bank.id));
  for (const item of [customer, account, employee, otherCash, otherBank]) {
    assert.ok(data.counterparties.some(a => a.id === item.id), `Missing ${item.kind} counterpart option`);
  }

  const body = { action: 'voucher', type: 'payment', date, treasuryId: cash.id, counterpartyId: customer.id, amount: 10, notes: 'Shared treasury QA' };
  const omittedPerson = await cashSave(body);
  assert.equal(omittedPerson.payload.person, '');
  const blankPerson = await cashSave({ ...body, counterpartyId: account.id, person: '   ' });
  assert.equal(blankPerson.payload.person, '');
  const employeeVoucher = await cashSave({ ...body, counterpartyId: employee.id, person: '', amount: 11 });
  let rows = await legs(employeeVoucher.id);
  assert.equal(rows.length, 1);
  assertAssetLeg(rows, cash, -1100);
  await req('/api/records?id=' + employee.id, 'DELETE', undefined, 409);
  const cashToCash = await cashSave({ ...body, counterpartyId: otherCash.id, amount: 21 });
  rows = await legs(cashToCash.id);
  assert.equal(rows.length, 2);
  assertAssetLeg(rows, cash, -2100);
  assertAssetLeg(rows, otherCash, 2100);

  const cashToBank = await cashSave({ ...body, counterpartyId: bank.id, amount: 30 });
  rows = await legs(cashToBank.id);
  assert.equal(rows.length, 2);
  assertAssetLeg(rows, cash, -3000);
  assertAssetLeg(rows, bank, 3000);
  const bankToCash = await cashSave({ ...body, type: 'receipt', treasuryId: bank.id, counterpartyId: cash.id, amount: 40 });
  rows = await legs(bankToCash.id);
  assert.equal(rows.length, 2);
  assertAssetLeg(rows, bank, 4000);
  assertAssetLeg(rows, cash, -4000);
  const bankToBank = await cashSave({ ...body, treasuryId: bank.id, counterpartyId: otherBank.id, amount: 12 });
  rows = await legs(bankToBank.id);
  assert.equal(rows.length, 2);
  assertAssetLeg(rows, bank, -1200);
  assertAssetLeg(rows, otherBank, 1200);
  for (const source of [cash, bank]) {
    await req('/api/cash', 'POST', { ...body, treasuryId: source.id, counterpartyId: source.id }, 400);
  }

  await req('/api/cash','POST',{...body,type:'receipt',treasuryId:bank.id,counterpartyId:usdCustomer.id,amount:10,transactionCurrency:'USD',conversionRate:50},400);

  const forexBank = await cashSave({ ...body, type: 'forex', counterpartyId: usdBank.id, amount: 1000, conversionRate: 50 });
  rows = await legs(forexBank.id);
  assert.equal(rows.length, 2);
  assertAssetLeg(rows, cash, -100000);
  assertAssetLeg(rows, usdBank, 2000);
  const forexAccount = await cashSave({ ...body, type: 'forex', counterpartyId: usdAccount.id, amount: 600, conversionRate: 50 });
  rows = await legs(forexAccount.id);
  assert.equal(rows.length, 1);
  assertAssetLeg(rows, cash, -60000);
  assert.equal(forexAccount.payload.transactionCurrency, 'USD');
  assert.equal(forexAccount.payload.transactionMinor, 1200);
  const forexCustomer = await cashSave({ ...body, type: 'forex', treasuryId: bank.id, counterpartyId: usdCustomer.id, amount: 1000, conversionRate: 50 });
  rows = await legs(forexCustomer.id);
  assert.equal(rows.length, 1);
  const forexCustomerLeg = assertAssetLeg(rows, bank, -100000);
  assert.equal(forexCustomerLeg.payload.customerCurrency, 'USD');
  assert.equal(forexCustomerLeg.payload.customerAmountMinor, -2000);
  await req('/api/cash', 'POST', { ...body, type: 'forex', counterpartyId: usdBank.id, amount: 1000, conversionRate: 0 }, 400);

  let editable = await cashSave({ ...body, type: 'receipt', counterpartyId: account.id, amount: 50 });
  const initialRevision = editable.updatedAt;
  editable = await req('/api/cash', 'POST', { ...body, id: editable.id, updatedAt: editable.updatedAt, type: 'receipt', treasuryId: bank.id, counterpartyId: account.id, amount: 60 }, 200);
  rows = await legs(editable.id);
  assert.equal(rows.length, 1);
  assertAssetLeg(rows, bank, 6000);
  assert.ok(!rows.some(r => r.kind === 'cash'), 'Moving a voucher to a bank must remove its former cash leg');
  await req('/api/cash', 'POST', { ...body, id: editable.id, updatedAt: initialRevision, type: 'receipt', counterpartyId: account.id }, 409);

  let assetEdit = await cashSave({ ...body, counterpartyId: otherBank.id, amount: 18 });
  assetEdit = await req('/api/cash', 'POST', { ...body, id: assetEdit.id, updatedAt: assetEdit.updatedAt, treasuryId: bank.id, counterpartyId: otherCash.id, amount: 19 }, 200);
  rows = await legs(assetEdit.id);
  assert.equal(rows.length, 2);
  assertAssetLeg(rows, bank, -1900);
  assertAssetLeg(rows, otherCash, 1900);
  assert.ok(!rows.some(r => [cash.id, otherBank.id].includes(r.payload.treasuryId)), 'Both former asset legs must be removed on edit');
  const attempts = [
    { ...body, id: assetEdit.id, updatedAt: assetEdit.updatedAt, treasuryId: bank.id, counterpartyId: otherCash.id, amount: 20 },
    { ...body, id: assetEdit.id, updatedAt: assetEdit.updatedAt, treasuryId: cash.id, counterpartyId: otherBank.id, amount: 22 },
  ];
  const race = await Promise.all(attempts.map(async body => {
    const response = await fetch(base + '/api/cash', { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  assetEdit = race.find(r => r.status === 200).body;
  rows = await legs(assetEdit.id);
  assert.equal(rows.length, 2);
  const assets = [cash, otherCash, bank, otherBank];
  assertAssetLeg(rows, assets.find(a => a.id === assetEdit.payload.treasuryId), -assetEdit.payload.treasuryMinor);
  assertAssetLeg(rows, assets.find(a => a.id === assetEdit.payload.counterpartyId), assetEdit.payload.transactionMinor);
  assert.ok(Date.parse(assetEdit.updatedAt) > Date.parse(attempts[0].updatedAt), 'Revision timestamp must advance even for simultaneous edits');

  await req('/api/cash', 'DELETE', { id: cashToBank.id, updatedAt: cashToBank.updatedAt });
  rows = await legs(cashToBank.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.amount === 0 && r.payload.status === 'voided'));
  assert.deepEqual(rows.map(r => r.kind).sort(), ['bank', 'cash']);
  await req('/api/cash', 'DELETE', { id: cashToBank.id, updatedAt: cashToBank.updatedAt }, 409);
  await req('/api/cash', 'POST', { ...body, id: cashToBank.id, updatedAt: cashToBank.updatedAt, counterpartyId: bank.id }, 409);

  const beforeBankLock = await legs(editable.id);
  await settings({ ...enabled, modules: { ...enabled.modules, banks: false } });
  data = await req('/api/cash');
  assert.ok(!data.treasuries.some(a => a.kind === 'bank-account'));
  assert.ok(!data.counterparties.some(a => a.kind === 'bank-account'));
  await req('/api/cash', 'POST', { ...body, treasuryId: bank.id }, 423);
  await req('/api/cash', 'POST', { ...body, counterpartyId: bank.id }, 423);
  await req('/api/cash', 'POST', { ...body, id: editable.id, updatedAt: editable.updatedAt, type: 'receipt', counterpartyId: account.id }, 423);
  await req('/api/cash', 'DELETE', { id: editable.id, updatedAt: editable.updatedAt }, 423);
  await settings(enabled);
  assert.deepEqual(await legs(editable.id), beforeBankLock, 'A locked former bank leg must remain untouched');

  const beforeEmployeeLock = await legs(employeeVoucher.id);
  await settings({ ...enabled, modules: { ...enabled.modules, employees: false } });
  data = await req('/api/cash');
  assert.ok(!data.counterparties.some(a => a.kind === 'employee'));
  await req('/api/cash', 'POST', { ...body, counterpartyId: employee.id }, 423);
  await req('/api/cash', 'POST', { ...body, id: employeeVoucher.id, updatedAt: employeeVoucher.updatedAt, counterpartyId: account.id }, 423);
  await req('/api/cash', 'DELETE', { id: employeeVoucher.id, updatedAt: employeeVoucher.updatedAt }, 423);
  await settings(enabled);
  assert.deepEqual(await legs(employeeVoucher.id), beforeEmployeeLock, 'A locked former employee settlement must remain untouched');

  await settings({ ...enabled, modules: { ...enabled.modules, cash: false } });
  await req('/api/cash', 'GET', undefined, 423);
  assert.ok(codes(await req('/api/currencies')).includes(customCode), 'Supervisor currency catalog must work while cash is disabled');
  await settings({ ...enabled, modules: { ...enabled.modules, supervisor: false } });
  assert.ok(codes(await req('/api/currencies')).includes(customCode));
  await settings({ ...enabled, modules: { ...enabled.modules, reports: false } });
  assert.ok(codes(await req('/api/currencies')).includes(customCode));
  await settings({ ...enabled, modules: Object.fromEntries(Object.keys(enabled.modules).map(key=>[key,false])) });
  await req('/api/currencies', 'GET', undefined, 423);
  await settings(enabled);
  await req('/api/cash', 'DELETE', { id: bankToBank.id, updatedAt: bankToBank.updatedAt });
  rows = await legs(bankToBank.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.kind === 'bank' && r.amount === 0 && r.payload.status === 'voided'));

  console.log('Cash link QA passed: cash and bank sources, every master counterpart kind, optional person, actual asset ledger legs, single customer settlement, forex financial/customer counterparts, source/counterpart edits, stale and concurrent revisions, void across both ledgers, former-module locks, employee reference guard, and supervisor currencies while cash is disabled.');
} finally {
  boot = await req('/api/bootstrap');
  await settings(original);
}
