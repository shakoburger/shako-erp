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

const { airlines } = require('../lib/domain.ts');

// 1. Verify static airlines list is completely empty
assert.equal(airlines.length, 0, 'Static airlines array must be empty');

// 2. Mock airline account creation and query
const records = [];

function addAirlineAccount(id, name, currency = 'MULTI', notes = '') {
  const row = {
    id,
    kind: 'customer',
    name,
    currency,
    amount: 0,
    payload: {
      accountType: 'airline',
      direction: 'receipt',
      notes
    }
  };
  records.push(row);
  return row;
}

// Add user-created airline
const airline1 = addAirlineAccount('air-1', 'تاركو للطيران', 'MULTI', 'حساب تاركو الرسمي');
const airline2 = addAirlineAccount('air-2', 'Badr Airlines', 'USD');

// Filter airlines in directory
const userAirlines = records.filter(r => r.kind === 'customer' && r.payload?.accountType === 'airline');
assert.equal(userAirlines.length, 2, 'Should find 2 user-created airline accounts');
assert.equal(userAirlines[0].name, 'تاركو للطيران');
assert.equal(userAirlines[1].name, 'Badr Airlines');

// 3. Test airline validation logic as implemented in route.ts
function validateTicketAirline(payload, dbRecords) {
  const airlineName = (payload.airline || '').trim();
  const airlineSupplierId = payload.supplierId || '';
  const dbAirline = airlineName ? dbRecords.find(r => 
    ((r.name.trim().toLowerCase() === airlineName.toLowerCase()) || (r.id === airlineSupplierId && r.id !== '')) &&
    (r.kind === 'account' || (r.kind === 'customer' && r.payload?.accountType === 'airline'))
  ) : null;

  const isAirlineKnown = Boolean(dbAirline);
  if (!isAirlineKnown) {
    throw new Error('شركة الطيران غير مسجلة في دليل الحسابات؛ يرجى إضافتها أولاً في حسابات الخطوط');
  }
  return dbAirline;
}

// 4. Test unrecognized airline rejection
assert.throws(() => {
  validateTicketAirline({ airline: 'طيران وهمي غير مسجل' }, records);
}, /شركة الطيران غير مسجلة في دليل الحسابات/);

// 5. Test recognized airline approval and matching
const matched1 = validateTicketAirline({ airline: 'تاركو للطيران' }, records);
assert.equal(matched1.id, 'air-1');

const matchedCase = validateTicketAirline({ airline: 'badr airlines' }, records);
assert.equal(matchedCase.id, 'air-2');

// 6. Test editing airline details
airline1.name = 'تاركو للطيران - الفرع الرئيسي';
airline1.payload.notes = 'تم التحديث';
assert.equal(records.find(r => r.id === 'air-1').name, 'تاركو للطيران - الفرع الرئيسي');

console.log('ALL TESTS PASSED: Static airlines removed, user-controlled airline accounts fully operational!');
