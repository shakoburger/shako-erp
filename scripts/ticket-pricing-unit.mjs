import assert from 'node:assert/strict';
import {calculateTicket,ticketTotals,sameTicketPricing,ticketSupplierName} from '../lib/tickets.ts';

const legacy={amount:47000,payload:{fare:500,commAmount:100,extraComm:40,discount:30,taxes:{},flags:{'Non IATA':true},airline:'AIRARABIA',totalMinor:47000,supplierDueMinor:36000,incomeMinor:11000}};
for(const changes of [{status:'cancelled'},{notes:'New note'},{vendor:'AIRARABIA',flags:{'Non IATA':true,BSP:true}}]){
 const p={...legacy.payload,...changes};
 assert.ok(sameTicketPricing(p,legacy.payload));
 assert.deepEqual(ticketTotals(p,legacy),{ticketBaseMinor:50000,supplierDueMinor:36000,totalMinor:47000,incomeMinor:11000,brokerCommissionMinor:0,pricingVersion:1});
}
assert.ok(sameTicketPricing({...legacy.payload,taxes:{SD:0,YQ:0},commPct:0},legacy.payload));
assert.equal(ticketTotals({...legacy.payload,extraComm:41},legacy).pricingVersion,3);
assert.equal(ticketTotals({...legacy.payload,extraComm:41},legacy).totalMinor,51100);
assert.equal(calculateTicket({...legacy.payload,flags:{'Zero Comm':true}}).totalMinor,61000);
assert.equal(ticketSupplierName({...legacy.payload,vendor:'Supplier A',airline:'Carrier B'}),'Supplier A');
assert.equal(ticketSupplierName(legacy.payload),'AIRARABIA');
const withBroker=ticketTotals({...legacy.payload,flags:{...legacy.payload.flags,Broker:true},brokerCommission:20},legacy);
assert.equal(withBroker.totalMinor,47000);assert.equal(withBroker.supplierDueMinor,36000);assert.equal(withBroker.incomeMinor,9000);assert.equal(withBroker.brokerCommissionMinor,2000);

// User's exact scenario: $1,000 ticket, $100 airline penalty, $50 supplier fee, $50 office refund fee
const refundUserCase = calculateTicket({
 status: 'refunded',
 sellingPrice: 1000,
 supplierPrice: 1000,
 penalties: 100,
 supplierComm: 50,
 refundComm: 50
});
assert.equal(refundUserCase.supplierDueMinor, 85000, 'Supplier must return 850 USD to office (1000 - 100 penalty - 50 comm)');
assert.equal(refundUserCase.totalMinor, 80000, 'Passenger must receive 800 USD net (850 - 50 office comm)');
assert.equal(refundUserCase.incomeMinor, 5000, 'Office must earn 50 USD refund commission');
assert.equal(refundUserCase.penaltyMinor, 10000, 'Penalty is 100 USD');
assert.equal(refundUserCase.brokerCommissionMinor, 5000, 'Supplier/broker comm is 50 USD');

console.log('PASS: legacy snapshots survive status, note and vendor initialization; only pricing edits upgrade totals; vendor is independent of actual carrier; user refund math matches exactly.');
