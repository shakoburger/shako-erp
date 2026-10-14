import assert from 'node:assert/strict';

// Local API integration checks. Deferred cheques affect balances only when passed.
const base = 'http://127.0.0.1:5173';
const auth = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = auth.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const headers = { 'Content-Type': 'application/json', Origin: base, Cookie: cookie };
async function response(path, method = 'GET', body, authenticated = true) {
  const r = await fetch(base + path, {
    method,
    headers: authenticated ? headers : { 'Content-Type': 'application/json', Origin: base },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
async function req(path, method = 'GET', body, expected = 200, authenticated = true) {
  const r = await response(path, method, body, authenticated);
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(r.body)}`);
  return r.body;
}
let boot = await req('/api/bootstrap');
const original = structuredClone(boot.settings);
const enabled = { ...original, globalLocked: false, modules: Object.fromEntries(Object.keys(original.modules).map(k => [k, true])) };
const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
const date = '2026-10-03', dueDate = '2026-10-10';
async function settings(value) {
  const result = await req('/api/settings', 'PUT', { settings: value, revision: boot.revision });
  boot = { ...boot, ...result };
}
const save = body => req('/api/banks', 'POST', body, 201);
const master = kind => req('/api/records', 'POST', {
  kind, name: `Cheque QA ${kind} ${stamp} ${Math.random().toString(36).slice(2, 6)}`, date, currency: 'EGP', amount: 0, payload: {},
}, 201);
async function records() { return await req('/api/records?kind=all'); }
async function legs(id) { return (await records()).filter(r => r.payload.bankVoucherId === id); }
async function effects(bankId, customerId) {
  const rows = await records();
  return {
    bank: rows.filter(r => r.kind === 'bank' && r.payload.treasuryId === bankId).reduce((sum, r) => sum + r.amount, 0),
    customer: rows.filter(r => ['cash', 'bank'].includes(r.kind) && r.payload.customerId === customerId)
      .reduce((sum, r) => sum + (r.payload.status === 'voided' ? 0 : r.payload.customerAmountMinor ?? r.amount), 0),
  };
}
function assertPosted(rows, voucher, amount) {
  assert.equal(rows.length, 1, 'A passed issued cheque must have exactly one bank leg');
  const row = rows[0];
  assert.equal(row.kind, 'bank');
  assert.equal(row.payload.treasuryId, voucher.payload.treasuryId);
  assert.equal(row.payload.bankVoucherId, voucher.id);
  assert.equal(row.amount, amount);
  assert.equal(row.date, voucher.payload.clearedDate);
  assert.equal(row.payload.customerId, voucher.payload.counterpartyId);
  assert.equal(row.payload.customerAmountMinor, amount);
  assert.equal(row.payload.status, 'active');
  assert.equal(row.payload.systemGenerated, true);
}
const pass = (voucher, clearedDate = '2026-10-11') => ({ action: 'pass-cheque', id: voucher.id, updatedAt: voucher.updatedAt, clearedDate });

try {
  await settings(enabled);
  await req('/api/banks', 'POST', { action: 'pass-cheque', id: '00000000-0000-4000-8000-000000000000', updatedAt: 'stale', clearedDate: date }, 401, false);
  const customer = await master('customer');
  const intermediary = await master('account');
  const otherIntermediary = await master('account');
  const employee = await master('employee');
  const bank = await save({ action: 'account', name: 'بنك اختبار الشيكات ' + stamp, currency: 'EGP', rate: 1, accountNumber: 'QA-' + stamp });
  const otherBank = await save({ action: 'account', name: 'بنك ثانٍ للشيكات ' + stamp, currency: 'EGP', rate: 1 });
  const issue = { action: 'voucher', type: 'cheque-issue', date, treasuryId: bank.id, counterpartyId: customer.id, amount: 100, notes: 'Cheque lifecycle QA' };
  const directBody = { ...issue, chequeNumber: 'DIRECT-' + stamp, chequeMode: 'direct', chequeDate: date, chequeStatus: 'cleared', clearedDate: date, person: '   ' };
  const direct = await save(directBody);
  assert.equal(direct.payload.person, '');
  assert.equal(direct.payload.chequeMode, 'direct');
  assertPosted(await legs(direct.id), direct, -10000);
  await req('/api/banks', 'POST', pass(direct), 409);

  const beforeRejected = await req('/api/banks');
  for (const [suffix, patch] of [
    ['PENDING', { chequeStatus: 'pending', clearedDate: undefined }],
    ['INTERMEDIARY', { intermediaryId: intermediary.id }],
    ['DUE', { chequeDate: dueDate }],
    ['CLEAR', { clearedDate: '2026-10-04' }],
  ]) {
    await req('/api/banks', 'POST', { ...directBody, chequeNumber: `BAD-${suffix}-${stamp}`, ...patch }, 400);
  }
  const deferredBody = { ...issue, chequeMode: 'deferred', chequeNumber: 'DEFERRED-' + stamp, chequeDate: dueDate, chequeStatus: 'pending', intermediaryId: intermediary.id };
  await req('/api/banks', 'POST', { ...deferredBody, chequeNumber: 'BAD-EARLY-' + stamp, chequeDate: '2026-10-02' }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, chequeNumber: 'BAD-NO-INTERMEDIARY-' + stamp, intermediaryId: undefined }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, chequeNumber: 'BAD-INTERMEDIARY-KIND-' + stamp, intermediaryId: employee.id }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, chequeNumber: 'BAD-SAME-INTERMEDIARY-' + stamp, counterpartyId: intermediary.id }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, chequeNumber: 'BAD-CLEARED-' + stamp, chequeStatus: 'cleared', clearedDate: '2026-10-11' }, 400);
  const afterRejected = await req('/api/banks');
  assert.equal(afterRejected.nextNumber, beforeRejected.nextNumber, 'Invalid cheques must not consume receipt numbers');
  assert.deepEqual(afterRejected.vouchers, beforeRejected.vouchers);
  assert.deepEqual(afterRejected.ledger, beforeRejected.ledger);

  const beforePending = await effects(bank.id, customer.id);
  let deferred = await save(deferredBody);
  assert.equal(deferred.payload.person, '');
  assert.equal(deferred.payload.chequeMode, 'deferred');
  assert.equal(deferred.payload.chequeStatus, 'pending');
  assert.equal(deferred.payload.intermediaryId, intermediary.id);
  assert.equal(deferred.payload.intermediaryName, intermediary.name);
  assert.equal((await legs(deferred.id)).length, 0);
  assert.deepEqual(await effects(bank.id, customer.id), beforePending, 'Saving a deferred cheque must not change bank or customer balances');
  assert.equal((await records()).find(r => r.id === intermediary.id).amount, 0, 'The intermediary account must not receive a financial effect before pass');
  await req('/api/records?id=' + intermediary.id, 'DELETE', undefined, 409);
  await req('/api/banks', 'POST', deferredBody, 409);
  await req('/api/banks', 'POST', { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, chequeMode: 'direct', chequeDate: date, chequeStatus: 'cleared', clearedDate: date, intermediaryId: undefined }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, treasuryId: otherBank.id }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, chequeNumber: 'CHANGED-' + stamp }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, intermediaryId: undefined }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, chequeMode: undefined }, 400);
  await req('/api/banks', 'POST', { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, chequeStatus: 'cleared', clearedDate: '2026-10-11' }, 400);
  await req('/api/banks', 'POST', pass(deferred, '2026-10-02'), 400);
  await req('/api/banks', 'POST', { ...pass(deferred), updatedAt: 'stale' }, 409);

  const pendingRevision = deferred.updatedAt;
  const race = await Promise.all(['2026-10-11', '2026-10-12'].map(clearedDate => response('/api/banks', 'POST', pass(deferred, clearedDate))));
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409], 'Only one concurrent pass may succeed');
  deferred = race.find(r => r.status === 200).body;
  assert.equal(deferred.payload.chequeStatus, 'cleared');
  assert.ok(Date.parse(deferred.updatedAt) > Date.parse(pendingRevision));
  assertPosted(await legs(deferred.id), deferred, -10000);
  assert.deepEqual(await effects(bank.id, customer.id), { bank: beforePending.bank - 10000, customer: beforePending.customer - 10000 });
  await req('/api/banks', 'POST', pass(deferred), 409);
  await req('/api/banks', 'POST', { action: 'pass-cheque', id: deferred.id, updatedAt: pendingRevision, clearedDate: '2026-10-11' }, 409);
  const audit = await req('/api/owner');
  assert.equal(audit.audit.filter(a => a.action === 'تمرير شيك محرر' && JSON.parse(a.after_value).chequeNumber === deferredBody.chequeNumber).length, 1, 'A losing or repeated pass must not create another pass audit');

  const passedBody = { ...deferredBody, id: deferred.id, updatedAt: deferred.updatedAt, chequeStatus: 'cleared', clearedDate: deferred.payload.clearedDate };
  await req('/api/banks', 'POST', { ...passedBody, chequeStatus: 'pending', clearedDate: undefined }, 400);
  await req('/api/banks', 'POST', { ...passedBody, clearedDate: '2026-10-13' }, 400);
  deferred = await req('/api/banks', 'POST', { ...passedBody, notes: 'Edited passed cheque', amount: 125 }, 200);
  assert.equal(deferred.payload.chequeStatus, 'cleared');
  assert.equal(deferred.payload.clearedDate, passedBody.clearedDate);
  assertPosted(await legs(deferred.id), deferred, -12500);

  // Mode-less pending issue fixtures exercise the compatibility path for older data.
  const legacyBody = { ...issue, chequeNumber: 'LEGACY-' + stamp, chequeDate: dueDate, chequeStatus: 'pending', person: '' };
  let legacy = await save(legacyBody);
  assert.equal(legacy.payload.chequeMode, undefined);
  assert.equal((await legs(legacy.id)).length, 0);
  legacy = await req('/api/banks', 'POST', pass(legacy), 200);
  assertPosted(await legs(legacy.id), legacy, -10000);
  legacy = await req('/api/banks', 'POST', { ...legacyBody, id: legacy.id, updatedAt: legacy.updatedAt, chequeStatus: 'cleared', clearedDate: legacy.payload.clearedDate, notes: 'Legacy edit after pass' }, 200);
  assertPosted(await legs(legacy.id), legacy, -10000);
  await req('/api/banks', 'POST', pass(legacy), 409);
  const received = await save({ ...legacyBody, type: 'cheque-receive', chequeNumber: 'RECEIVED-' + stamp });
  await req('/api/banks', 'POST', pass(received), 400);
  assert.equal((await legs(received.id)).length, 0);

  let pending = await save({ ...deferredBody, chequeNumber: 'LOCKS-' + stamp });
  const pendingBody = { ...deferredBody, chequeNumber: pending.payload.chequeNumber, id: pending.id, updatedAt: pending.updatedAt };
  const beforeLocks = structuredClone(pending);
  await settings({ ...enabled, modules: { ...enabled.modules, accounts: false } });
  await req('/api/banks', 'POST', { ...deferredBody, chequeNumber: 'LOCKED-NEW-' + stamp, intermediaryId: otherIntermediary.id }, 423);
  await req('/api/banks', 'POST', { ...pendingBody, intermediaryId: undefined }, 423);
  await req('/api/banks', 'POST', { ...pendingBody, intermediaryId: otherIntermediary.id }, 423);
  await req('/api/banks', 'POST', pass(pending), 423);
  await req('/api/banks', 'DELETE', { id: pending.id, updatedAt: pending.updatedAt }, 423);
  await settings({ ...enabled, modules: { ...enabled.modules, customers: false } });
  await req('/api/banks', 'POST', pass(pending), 423);
  await settings({ ...enabled, modules: { ...enabled.modules, banks: false } });
  await req('/api/banks', 'POST', pass(pending), 423);
  await settings({ ...enabled, globalLocked: true });
  await req('/api/banks', 'POST', pass(pending), 423);
  await settings(enabled);
  assert.deepEqual((await req('/api/banks')).vouchers.find(v => v.id === pending.id), beforeLocks);
  assert.equal((await legs(pending.id)).length, 0);
  pending = await req('/api/banks', 'POST', { ...pendingBody, intermediaryId: otherIntermediary.id, notes: 'Changed intermediary while pending' }, 200);
  assert.equal(pending.payload.intermediaryId, otherIntermediary.id);
  await req('/api/records?id=' + otherIntermediary.id, 'DELETE', undefined, 409);
  assert.equal((await legs(pending.id)).length, 0);

  // A deletion racing registration must never leave a dangling intermediary reference.
  const racingIntermediary = await master('account');
  const racingNumber = 'REFERENCE-RACE-' + stamp;
  const [registration, deletion] = await Promise.all([
    response('/api/banks', 'POST', { ...deferredBody, chequeNumber: racingNumber, intermediaryId: racingIntermediary.id }),
    response('/api/records?id=' + racingIntermediary.id, 'DELETE'),
  ]);
  if (registration.status === 201) {
    assert.ok([409, 423].includes(deletion.status), JSON.stringify(deletion.body));
    assert.ok((await records()).some(r => r.id === racingIntermediary.id));
    assert.equal((await legs(registration.body.id)).length, 0);
  } else {
    assert.equal(deletion.status, 200, JSON.stringify(deletion.body));
    assert.ok([400, 409].includes(registration.status), JSON.stringify(registration.body));
    assert.ok(!(await req('/api/banks')).vouchers.some(v => v.payload.chequeNumber === racingNumber));
  }

  await req('/api/banks', 'DELETE', { id: pending.id, updatedAt: pending.updatedAt });
  assert.equal((await legs(pending.id)).length, 0);
  await req('/api/banks', 'POST', pass(pending), 409);
  await req('/api/banks', 'DELETE', { id: deferred.id, updatedAt: deferred.updatedAt });
  const voidedRows = await legs(deferred.id);
  assert.equal(voidedRows.length, 1);
  assert.equal(voidedRows[0].amount, 0);
  assert.equal(voidedRows[0].payload.status, 'voided');
  assert.equal(voidedRows[0].payload.originalAmountMinor, -12500);
  await req('/api/banks', 'POST', pass(deferred), 409);
  await req('/api/banks', 'DELETE', { id: deferred.id, updatedAt: deferred.updatedAt }, 409);
  await req('/api/banks', 'DELETE', { id: direct.id, updatedAt: direct.updatedAt });
  assert.equal((await legs(direct.id))[0].amount, 0);

  console.log('Cheque QA passed: direct blank recipient, rejected forged direct/deferred data, deferred zero effect until pass, single-winner concurrent pass, repeated/stale pass rejection, legacy pass, passed edit status/date preservation, immutable mode/bank/number, intermediary reference protection and race, old/new account-module locks, pending and passed void, and audit.');
} finally {
  boot = await req('/api/bootstrap');
  await settings(original);
}
