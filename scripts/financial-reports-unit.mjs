import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {accountBalances}=require('../lib/balances.ts'),{statementReport,dailySales}=require('../lib/financial-reports.ts');
const row=(id,kind,date,amount,payload={},currency='EGP')=>({id,kind,date,amount,payload,currency,code:id,name:id});
const key=JSON.stringify(['c','EGP']);
const rows=[row('c','customer','2026-09-30',50000),row('t','ticket','2026-10-01',25000,{customerId:'c',airline:'EGYPTAIR',fare:250,supplierDueMinor:20000,incomeMinor:3000,brokerCommissionMinor:2000,brokerCommission:20,brokerId:'b',flags:{Broker:true},status:'active'}),row('v','cash-voucher','2026-10-02',10000,{type:'receipt',counterpartyId:'c',counterpartyKind:'customer',transactionCurrency:'EGP',transactionMinor:10000,status:'active'}),row('q','bank-voucher','2026-10-01',2000,{type:'cheque-issue',chequeStatus:'cleared',clearedDate:'2026-10-10',counterpartyId:'c',counterpartyKind:'customer',transactionCurrency:'EGP',transactionMinor:2000,status:'active'}),row('pending','bank-voucher','2026-10-02',9000,{type:'cheque-issue',chequeStatus:'pending',counterpartyId:'c',counterpartyKind:'customer',transactionCurrency:'EGP',transactionMinor:9000,status:'active'}),row('void','cash-voucher','2026-10-02',3000,{type:'payment',counterpartyId:'c',counterpartyKind:'customer',transactionCurrency:'EGP',transactionMinor:3000,status:'voided'})];
let s=statementReport(rows,key,'2026-10-01','2026-10-04');assert.equal(s.openingMinor,50000);assert.equal(s.closingMinor,65000);assert.equal(s.entries.length,2);assert.equal(s.debitMinor,25000);assert.equal(s.creditMinor,10000);
for(const all of [false,true]){s=statementReport(rows,key,'2026-10-01','2026-10-10',all);assert.equal(s.closingMinor,accountBalances(rows,'2026-10-10').find(a=>a.key===key).balanceMinor);assert.equal(s.entries.filter(e=>e.id==='q')[0].date,'2026-10-10');assert.equal(s.entries.filter(e=>e.id==='c').length,all?1:0)}
const usd=row('usd','ticket','2026-10-01',10000,{airline:'EGYPTAIR',fare:90,taxes:{SD:10},supplierDueMinor:9500,incomeMinor:500,status:'active'},'USD');
const cancelled=row('cancelled','ticket','2026-10-01',999999,{airline:'EGYPTAIR',status:'cancelled'});const sales=dailySales([...rows,usd,cancelled],'2026-10-01','2026-10-04');assert.equal(sales.length,2);assert.equal(sales.find(g=>g.currency==='EGP').incomeMinor,3000);assert.equal(sales.find(g=>g.currency==='EGP').brokerMinor,2000);assert.equal(sales.find(g=>g.currency==='USD').baseMinor,10000);assert.equal(sales.reduce((a,g)=>a+g.quantity,0),2);
assert.equal(accountBalances(rows,'2026-10-04',{customers:false,accounts:true,banks:true,cash:true,tickets:false}).some(a=>a.accountId==='c'),false);
const paid=[row('paid','ticket','2026-10-01',10000,{customerId:'c',status:'active'}),row('settlement','cash','2026-10-01',10000,{customerId:'c'})];assert.equal(statementReport(paid,key,'2026-10-01','2026-10-04').closingMinor,0);
const fxVoucher={...row('fxv','cash-voucher','2026-10-02',500000,{type:'receipt',counterpartyId:'u',counterpartyKind:'customer',transactionCurrency:'USD',treasuryCurrency:'EGP',transactionMinor:10000,treasuryMinor:500000,rate:50,status:'active'}),code:'00000999'};
const fxLedger=row('fxleg','cash','2026-10-02',500000,{cashVoucherId:'fxv',treasuryId:'treasury',rate:50});
const fxRows=[row('u','customer','2026-09-30',0,{},'USD'),fxVoucher,fxLedger];
const usdStatement=statementReport(fxRows,JSON.stringify(['u','USD']),'2026-10-01','2026-10-04');assert.equal(usdStatement.entries[0].reference,'00000999');assert.equal(usdStatement.entries[0].rate,50);assert.equal(usdStatement.creditMinor,10000);assert.match(usdStatement.entries[0].description,/1 USD = 50 EGP/);
const egpStatement=statementReport(fxRows,JSON.stringify(['treasury','EGP']),'2026-10-01','2026-10-04');assert.equal(egpStatement.entries[0].reference,'00000999');assert.equal(egpStatement.entries[0].rate,50);assert.equal(egpStatement.debitMinor,500000);
const linkedTicket={...row('tlinked','ticket','2026-10-01',10000,{customerId:'c',status:'active',passengers:[{name:'Ali',ticketNo:'5242419452129'}]}),code:'5242419452129'};
const linkedPayment={...row('plinked','cash','2026-10-01',10000,{customerId:'c',sourceId:'tlinked',receiptNumber:'00000731'}),code:'payment:tlinked'};
const autoStatement=statementReport([linkedTicket,linkedPayment],key,'2026-10-01','2026-10-04');assert.equal(autoStatement.entries.find(e=>e.id==='tlinked').reference,'—');assert.equal(autoStatement.entries.find(e=>e.id==='plinked').reference,'00000731');assert.match(autoStatement.entries.find(e=>e.id==='tlinked').description,/Ali \(5242419452129\)/);assert.match(autoStatement.entries.find(e=>e.id==='plinked').description,/تحصيل آلي · Ali \(5242419452129\)/);
assert.equal(statementReport(rows,key,'2026-09-01','2026-10-04').entries.find(e=>e.id==='c').rate,null);
const sameDay=statementReport([row('c','customer','2026-10-01',50000),row('claim','service','2026-10-01',10000,{customerId:'c'})],key,'2026-10-01','2026-10-04');assert.equal(sameDay.entries[0].id,'c');assert.equal(sameDay.entries[0].balanceMinor,50000);assert.equal(sameDay.closingMinor,60000);
const stableVoucher={...fxVoucher,createdAt:'2026-10-02T08:00:00Z'},stableLedger={...fxLedger,createdAt:'2026-10-04T18:00:00Z'};
const laterTreasuryMovement={...row('later-cash','cash','2026-10-02',10000,{treasuryId:'treasury'}),createdAt:'2026-10-02T09:00:00Z'};
const stableStatement=statementReport([stableVoucher,stableLedger,laterTreasuryMovement],JSON.stringify(['treasury','EGP']),'2026-10-01','2026-10-04');assert.equal(stableStatement.entries[0].id,'fxleg');assert.equal(stableStatement.entries[0].balanceMinor,500000);

// User's exact refund test:
const refundedTicket = row('t-refund', 'ticket', '2026-10-01', 80000, {
 customerId: 'cust-1',
 supplierId: 'sup-1',
 airline: 'Tarco',
 status: 'refunded',
 refundDate: '2026-10-08',
 originalAmount: 1000,
 originalSupplierDue: 1000,
 originalSellMinor: 100000,
 originalCostMinor: 100000,
 penalties: 100,
 supplierComm: 50,
 refundComm: 50,
 customerRefundMinor: 80000,
 supplierRefundMinor: 85000,
 refundCommMinor: 5000
}, 'USD');

const custRows = [
 row('cust-1', 'customer', '2026-09-30', 0, {}, 'USD'),
 row('sup-1', 'customer', '2026-09-30', 0, {accountType: 'airline'}, 'USD'),
 refundedTicket
];

// Customer statement:
const custStmt = statementReport(custRows, JSON.stringify(['cust-1', 'USD']), '2026-10-01', '2026-10-10');
assert.equal(custStmt.entries.length, 2, 'Customer statement must show both original ticket and refund movement');
assert.equal(custStmt.entries[0].debitMinor, 100000, 'Entry 1: Debit 1000 USD (original sale)');
assert.equal(custStmt.entries[0].creditMinor, 0);
assert.equal(custStmt.entries[1].creditMinor, 80000, 'Entry 2: Credit 800 USD (net customer refund)');
assert.equal(custStmt.entries[1].debitMinor, 0);
assert.equal(custStmt.closingMinor, 20000, 'Customer ending balance must be 200 USD (1000 - 800)');

// Supplier statement:
const supStmt = statementReport(custRows, JSON.stringify(['sup-1', 'USD']), '2026-10-01', '2026-10-10');
assert.equal(supStmt.entries.length, 2, 'Supplier statement must show both original ticket and refund movement');
assert.equal(supStmt.entries[0].creditMinor, 100000, 'Entry 1: Credit 1000 USD (original cost payable)');
assert.equal(supStmt.entries[0].debitMinor, 0);
assert.equal(supStmt.entries[1].debitMinor, 85000, 'Entry 2: Debit 850 USD (net supplier refund returned)');
assert.equal(supStmt.entries[1].creditMinor, 0);
assert.equal(supStmt.closingMinor, -15000, 'Supplier ending balance must be -150 USD (-1000 + 850)');

console.log('PASS: native-currency statement opening/running/closing, cheque clearing date, zero-effect pending/void, paid customer and sales snapshots per currency, and refund statement entries.');
