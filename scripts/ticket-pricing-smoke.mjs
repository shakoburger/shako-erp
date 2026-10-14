import assert from 'node:assert/strict';

// Local API checks for the confirmed ticket pricing rules, independent of the UI.
const base = 'http://127.0.0.1:5173';
const auth = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = auth.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const headers = { 'Content-Type': 'application/json', Origin: base, Cookie: cookie };
async function req(path, method = 'GET', body, expected = 200, authenticated = true) {
  const response = await fetch(base + path, {
    method,
    headers: authenticated ? headers : { 'Content-Type': 'application/json', Origin: base },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
let boot = await req('/api/bootstrap');
const original = structuredClone(boot.settings);
const enabled = { ...original, globalLocked: false, modules: Object.fromEntries(Object.keys(original.modules).map(key => [key, true])) };
const stamp = String(Date.now());
const numberBase = BigInt(stamp) * 1000n;
let numberOffset = 0n;
const nextNumber = () => String(numberBase + ++numberOffset);
const date = '2026-10-03';
const created = new Map();
async function settings(value) {
  const result = await req('/api/settings', 'PUT', { settings: value, revision: boot.revision });
  boot = { ...boot, ...result };
}
async function create(payload, suffix, extra = {}) {
  const input = { kind: 'ticket', name: `TICKET PRICING QA ${stamp} ${suffix}`, code: nextNumber(), date, currency: 'EGP', amount: 999, payload, ...extra };
  const saved = await req('/api/records', 'POST', input, 201);
  created.set(saved.id, { input, saved });
  return saved;
}
async function update(saved, payload) {
  const previous = created.get(saved.id);
  const input = { ...previous.input, id: saved.id, payload };
  const result = await req('/api/records', 'POST', input, 200);
  created.set(result.id, { input, saved: result });
  return result;
}
function totals(ticket, expected) {
  const [base, supplier, customer, income] = expected;
  assert.equal(ticket.payload.ticketBaseMinor, base, 'Right Ticket/base must equal Fare + taxes');
  assert.equal(ticket.payload.supplierDueMinor, supplier, 'Supplier amount');
  assert.equal(ticket.payload.totalMinor, customer, 'Customer amount');
  assert.equal(ticket.amount, customer, 'Persisted ticket amount must equal customer amount');
  assert.equal(ticket.payload.incomeMinor, income, 'Income must equal customer minus supplier');
  assert.equal(ticket.payload.pricingVersion, 3);
}
async function settlement(ticket, kind) {
  const rows = await req('/api/records?kind=all');
  const linked = rows.filter(row => row.payload.sourceId === ticket.id);
  if (!kind) { assert.equal(linked.length, 0); return; }
  assert.equal(linked.length, 1, 'Each paid ticket must have one generated settlement');
  assert.equal(linked[0].kind, kind);
  assert.equal(linked[0].amount, ticket.payload.totalMinor);
  assert.equal(linked[0].payload.systemGenerated, true);
  assert.equal(linked[0].payload.customerId, ticket.payload.customerId);
  assert.equal(linked[0].payload.direction, 'receipt');
}
const writablePayloadKeys = [
  'phone', 'email', 'notes', 'direction', 'treasuryId', 'customerId', 'airline', 'vendor', 'route', 'class', 'sign',
  'fare', 'commPct', 'commAmount', 'discount', 'discountPct', 'extraPct', 'extraComm',
  'payment', 'income', 'taxes', 'flags', 'status',
];
function writablePayload(payload) {
  return Object.fromEntries(writablePayloadKeys.filter(key => payload[key] !== undefined).map(key => [key, structuredClone(payload[key])]));
}

try {
  await settings(enabled);
  await req('/api/records', 'POST', { kind: 'ticket', name: 'Unauthorized', payload: {} }, 401, false);
  const customer = await req('/api/records', 'POST', {
    kind: 'customer', name: 'TICKET PRICING QA CUSTOMER ' + stamp, date, currency: 'EGP', amount: 0, payload: {},
  }, 201);
  const cash=await req('/api/cash','POST',{action:'account',name:'Ticket collection cash '+stamp,currency:'EGP',rate:1},201);
  const bank=await req('/api/banks','POST',{action:'account',name:'Ticket collection bank '+stamp,currency:'EGP',rate:1},201);
  const basic = {
    customerId: customer.id, airline: 'EGYPTAIR', fare: 500, commPct: 0, commAmount: 100,
    extraPct: 0, extraComm: 0, discountPct: 0, discount: 0, taxes: {}, payment: 'credit',
    status: 'active', flags: { 'Non IATA': false, 'Zero Comm': false },
  };
  let ticket = await create(basic, 'ZERO OFF');
  totals(ticket, [50000, 40000, 50000, 10000]);
  await settlement(ticket, null);
  ticket = await update(ticket, { ...basic, flags: { ...basic.flags, 'Zero Comm': true } });
  totals(ticket, [50000, 50000, 60000, 10000]);
  assert.equal(ticket.payload.commAmount, 100, 'Switching Zero Comm on must retain Comm');
  assert.equal(ticket.payload.commPct, 0);
  ticket = await update(ticket, { ...basic, extraComm: 40, discount: 20 });
  totals(ticket, [50000, 40000, 52000, 12000]);
  assert.equal(ticket.payload.commAmount, 100, 'Switching Zero Comm off must retain Comm');
  ticket = await update(ticket, { ...basic, extraComm: 40, discount: 20, flags: { ...basic.flags, 'Zero Comm': true } });
  totals(ticket, [50000, 50000, 62000, 12000]);
  // A large commission is valid under Zero Comm when neither supplier nor customer is negative.
  ticket = await update(ticket, { ...basic, commAmount: 501, flags: { ...basic.flags, 'Zero Comm': true } });
  totals(ticket, [50000, 50000, 100100, 50100]);
  // A loss does not make either payable invalid: 350 customer - 400 supplier = -50 income.
  ticket = await update(ticket, { ...basic, discount: 150 });
  totals(ticket, [50000, 40000, 35000, -5000]);

  const roundedInputs = {
    ...basic, fare: 123.45, taxes: { SD: 1.01, YQ: 2.02 }, commPct: 12.5, commAmount: 1.23,
    extraPct: 3.333, extraComm: 0.49, discountPct: 2.5, discount: 0.07, payment: 'cash', treasuryId:cash.id,
  };
  // Fare 12,345 + taxes 303; C=1,543+123; E=411+49; D=309+7 (all minor units).
  let rounded = await create(roundedInputs, 'ROUNDING CASH');
  totals(rounded, [12648, 10982, 12792, 1810]);
  await settlement(rounded, 'cash');
  rounded = await update(rounded, { ...roundedInputs, payment: 'bank', treasuryId:bank.id, flags: { ...basic.flags, 'Zero Comm': true } });
  totals(rounded, [12648, 12648, 14458, 1810]);
  await settlement(rounded, 'bank');
  assert.equal(rounded.payload.commAmount, 1.23);
  assert.equal(rounded.payload.commPct, 12.5);

  const nonIATA = await create({
    ...basic, vendor: 'LOCAL QA SUPPLIER', airline: 'EGYPTAIR', extraComm: 40, discount: 20,
    payment: 'bank', treasuryId:bank.id, flags: { 'Non IATA': true, 'Zero Comm': true },
  }, 'NON IATA BANK');
  totals(nonIATA, [50000, 50000, 62000, 12000]);
  assert.equal(nonIATA.payload.vendor, 'LOCAL QA SUPPLIER');
  assert.equal(nonIATA.payload.airline, 'EGYPTAIR', 'Actual carrier must remain independent of supplier name');
  await settlement(nonIATA, 'bank');

  const beforeRejected = await req('/api/records?kind=all');
  const negativeSupplierNumber = nextNumber();
  const negativeCustomerNumber = nextNumber();
  for (const [code, payload] of [
    [negativeSupplierNumber, { ...basic, commAmount: 501 }],
    [negativeCustomerNumber, { ...basic, discount: 501 }],
  ]) {
    await req('/api/records', 'POST', { kind: 'ticket', name: 'TICKET PRICING QA INVALID ' + stamp, code, date, currency: 'EGP', amount: 0, payload }, 400);
  }
  const afterRejected = await req('/api/records?kind=all');
  assert.ok(!afterRejected.some(row => [negativeSupplierNumber, negativeCustomerNumber].includes(row.code)));
  assert.deepEqual(afterRejected, beforeRejected, 'Rejected negative payables must not persist tickets or settlements');
  const duplicate = created.get(ticket.id).input;
  await req('/api/records', 'POST', { ...duplicate, id: undefined }, 409);
  await req('/api/records', 'POST', { ...duplicate, id: undefined, code: 'invalid-ticket-number' }, 400);
  await req('/api/records', 'POST', { ...duplicate, id: undefined, code: nextNumber(), payload: { ...basic, commPct: 101 } }, 400);

  await req('/api/records','POST',{...duplicate,id:undefined,code:nextNumber(),payload:{...basic,flags:{'Non IATA':true},vendor:''}},400);
  const withTaxes=await update(ticket,{...basic,taxes:{SD:50},commAmount:70,extraComm:15,discount:8});
  totals(withTaxes,[55000,48000,55700,7700]);
  const withTaxesZero=await update(withTaxes,{...basic,taxes:{SD:50},commAmount:70,extraComm:15,discount:8,flags:{'Zero Comm':true}});
  totals(withTaxesZero,[55000,55000,62700,7700]);

  // Reuse an isolated pre-v2 local fixture from work/smoke.mjs. Its old totals may differ from v2.
  const existing = await req('/api/records?kind=ticket');
  const legacyId = process.env.SHAKO_QA_LEGACY_TICKET_ID;
  const legacy = existing.find(row =>
    legacyId && row.id === legacyId &&
    row.payload.status === 'active' && (row.payload.pricingVersion ?? 1) < 2,
  );
  if(legacyId) assert.ok(legacy, 'SHAKO_QA_LEGACY_TICKET_ID must identify an active isolated pre-v2 local QA ticket');
  if(legacy) {
  const legacySaved = await req('/api/records', 'POST', {
    id: legacy.id, kind: 'ticket', name: legacy.name, code: legacy.code, date: legacy.date,
    currency: legacy.currency, amount: 0, payload: { ...writablePayload(legacy.payload), status: 'cancelled' },
  }, 200);
  assert.equal(legacySaved.amount, legacy.amount, 'Legacy status-only change must retain stored customer amount');
  assert.equal(legacySaved.payload.totalMinor, legacy.amount, 'Old missing totalMinor may be filled with its saved amount');
  assert.equal(legacySaved.payload.incomeMinor, legacy.payload.incomeMinor ?? 0);
  assert.equal(legacySaved.payload.supplierDueMinor, legacy.payload.supplierDueMinor ?? legacy.amount - (legacy.payload.incomeMinor ?? 0));
  assert.equal(legacySaved.payload.pricingVersion, legacy.payload.pricingVersion ?? 1);
  assert.equal(legacySaved.payload.status, 'cancelled');
  for (const key of ['fare', 'commPct', 'commAmount', 'discount', 'discountPct', 'extraPct', 'extraComm', 'taxes', 'flags']) {
    assert.deepEqual(legacySaved.payload[key], legacy.payload[key], `Legacy ${key} must not change during status update`);
  }
  await settlement(legacySaved, null);
  }

  console.log('Ticket pricing QA passed: Zero Comm off/on formulas with Comm retained, extra and discount, minor-unit percentage rounding, cash/bank settlements equal customer total, Non IATA supplier snapshot with separate carrier, rejected negative supplier/customer payables, duplicate/invalid tickets, and pricing persistence. Legacy status-only retention also has a self-contained unit test.');
} finally {
  // Close only fixtures created by this script, removing their active generated settlements.
  // Financial records remain as normal local audit history; do not attempt hard deletion.
  try {
    boot = await req('/api/bootstrap');
    await settings(enabled);
    for (const { input, saved } of created.values()) {
      if (saved.payload.status === 'active') {
        await req('/api/records', 'POST', { ...input, id: saved.id, payload: { ...input.payload, status: 'cancelled' } }, 200);
      }
    }
  } finally {
    boot = await req('/api/bootstrap');
    await settings(original);
  }
}
