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

const {accountStatementData} = require('../components/account-statement.tsx');

const mockProps = {
  selected: {key: '["c","SDG"]', accountId: 'c', kind: 'customer', name: 'Mubarak Babiker', currency: 'SDG'},
  master: {id: 'c', kind: 'customer', name: 'Mubarak Babiker', payload: {phone: '0123456789'}},
  currentBalanceMinor: 0,
  from: '2026-10-01',
  to: '2026-10-07',
  all: false,
  ledger: {
    openingMinor: 0,
    closingMinor: 0,
    debitMinor: 728640000,
    creditMinor: 728640000,
    entries: [
      {
        id: 'tkt1',
        date: '2026-10-06',
        reference: '—',
        description: 'MOBARAK TAHA (5242419452129) / DALAL MOHAMED (5242419452130) · SZH - TJS',
        rate: 1,
        debitMinor: 728640000,
        creditMinor: 0,
        balanceMinor: 728640000
      },
      {
        id: 'set1',
        date: '2026-10-06',
        reference: '00000125',
        description: 'تحصيل آلي · MOBARAK TAHA (5242419452129) / DALAL MOHAMED (5242419452130)',
        rate: 1,
        debitMinor: 0,
        creditMinor: 728640000,
        balanceMinor: 0
      }
    ]
  },
  settings: {
    companyName: 'SHAKO Travel',
    phones: '0912345678',
    defaultCurrency: 'SDG',
    modules: {}
  }
};

const report = accountStatementData(mockProps);

assert.deepEqual(report.headers, ['التاريخ', 'الإيصال', 'البيان', 'R.O.E', 'مطالبات', 'سداد', 'الرصيد']);
assert.deepEqual(report.amountColumns, [4, 5, 6]);

assert.equal(report.rows.length, 2);
assert.deepEqual(report.rows[0], [
  '2026-10-06',
  '—',
  'MOBARAK TAHA (5242419452129) / DALAL MOHAMED (5242419452130) · SZH - TJS',
  1,
  7286400,
  0,
  7286400
]);

assert.deepEqual(report.rows[1], [
  '2026-10-06',
  '00000125',
  'تحصيل آلي · MOBARAK TAHA (5242419452129) / DALAL MOHAMED (5242419452130)',
  1,
  0,
  7286400,
  0
]);

assert.deepEqual(report.totals, ['الإجمالي', '', '', '', 7286400, 7286400, '']);

console.log('PASS: accountStatementData column order, headers, rows, amountColumns, and totals verified perfectly!');
