import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=auth.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function req(path,method='GET',body,expected=200,authenticated=true){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:base,...(authenticated?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const b=await r.json();assert.equal(r.status,expected,JSON.stringify(b));return b}
let boot=await req('/api/bootstrap');const original=structuredClone(boot.settings);const stamp=Date.now();
async function settings(value){const s=await req('/api/settings','PUT',{settings:value,revision:boot.revision});boot={...boot,...s}}
const testCurrency='Q'+Array.from({length:4},()=>String.fromCharCode(65+Math.floor(Math.random()*26))).join('');
const save=body=>req('/api/cash','POST',body,201);
try{
 await req('/api/cash','GET',undefined,401,false);
 const c=await req('/api/records','POST',{kind:'customer',name:'Cash QA '+stamp,date:'2026-10-03',currency:'EGP',amount:0,payload:{}},201);
 const egp=await save({action:'account',name:'خزينة مصر '+stamp,currency:'EGP',rate:1});
 const usd=await save({action:'account',name:'خزينة الدولار '+stamp,currency:'USD',rate:8100});
 await req('/api/cash','POST',{action:'account',name:'INVALID',currency:'USD',rate:0},400);
 const cur=await save({action:'currency',name:'عملة اختبار '+stamp,currency:testCurrency,rate:5});
 await req('/api/cash','POST',{action:'currency',name:'duplicate',currency:testCurrency,rate:1},409);
 await req('/api/cash','POST',{action:'currency',id:cur.id,name:'عملة اختبار',currency:testCurrency,rate:6},200);
 const b={action:'voucher',type:'receipt',date:'2026-10-03',treasuryId:egp.id,counterpartyId:c.id,person:'اختبار محلي',amount:500,notes:'QA'};
 let receipt=await save(b);assert.equal(receipt.payload.treasuryMinor,50000);
 let d=await req('/api/cash');assert.equal(d.ledger.find(x=>x.payload.cashVoucherId===receipt.id).amount,50000);
 const payment=await save({...b,type:'payment',amount:100});d=await req('/api/cash');assert.equal(d.ledger.find(x=>x.payload.cashVoucherId===payment.id).amount,-10000);
 receipt=await req('/api/cash','POST',{...b,id:receipt.id,updatedAt:receipt.updatedAt,amount:700},200);d=await req('/api/cash');assert.equal(d.ledger.filter(x=>x.payload.cashVoucherId===receipt.id).length,1);assert.equal(d.ledger.find(x=>x.payload.cashVoucherId===receipt.id).amount,70000);
 await req('/api/cash','POST',{...b,id:receipt.id,updatedAt:'stale',amount:700},409);
 const foreign=await save({...b,type:'forex',counterpartyId:usd.id,amount:3000000,conversionRate:8100});assert.equal(foreign.payload.transactionMinor,37037);assert.equal(foreign.payload.rate,8100);d=await req('/api/cash');const legs=d.ledger.filter(x=>x.payload.cashVoucherId===foreign.id);assert.equal(legs.length,2);assert.equal(legs.find(x=>x.currency==='EGP').amount,-300000000);assert.equal(legs.find(x=>x.currency==='USD').amount,37037);
 await req('/api/cash','POST',{action:'account',id:usd.id,name:usd.name,currency:'USD',rate:8200},200);d=await req('/api/cash');assert.equal(d.vouchers.find(v=>v.id===foreign.id).payload.rate,8100);
 await req('/api/cash','POST',{...b,type:'forex',counterpartyId:egp.id,conversionRate:8100},400);
 await req('/api/cash','POST',{...b,amount:10,transactionCurrency:'USD',conversionRate:50},400);await req('/api/cash','POST',{...b,counterpartyId:usd.id,transactionCurrency:'USD',conversionRate:50},400);
 const concurrent=await Promise.all(Array.from({length:4},(_,i)=>save({...b,amount:10+i})));assert.equal(new Set(concurrent.map(x=>x.code)).size,4);
 await req('/api/cash','DELETE',{id:foreign.id,updatedAt:foreign.updatedAt});d=await req('/api/cash');assert.equal(d.vouchers.find(v=>v.id===foreign.id).payload.status,'voided');assert.ok(d.ledger.filter(x=>x.payload.cashVoucherId===foreign.id).every(x=>x.amount===0&&x.payload.status==='voided'));
 await req('/api/cash','POST',{...b,id:foreign.id,updatedAt:foreign.updatedAt,type:'forex',counterpartyId:usd.id},409);
 await req('/api/records?id='+egp.id,'DELETE',undefined,400);
 await settings({...original,modules:{...original.modules,customers:false}});await req('/api/cash','POST',b,423);
 await settings({...original,modules:{...original.modules,cash:false}});await req('/api/cash','GET',undefined,423);await req('/api/cash','POST',b,423);await req('/api/cash','DELETE',{id:receipt.id,updatedAt:receipt.updatedAt},423);
 await settings({...original,globalLocked:true});await req('/api/cash','GET',undefined,423);
 const backup=await req('/api/owner?mode=backup');assert.ok(backup.records.some(x=>x.id===egp.id));assert.ok(backup.records.some(x=>x.id===foreign.id));assert.ok(backup.records.some(x=>x.kind==='cash-sequence'));
 const log=await req('/api/owner');assert.ok(log.audit.some(x=>x.action==='حذف شراء النقد الأجنبي'));
 await settings(original);
 console.log('Cash QA passed: durable catalogs, receipt/payment signs, edits, stale revision, FX two legs and rounding, historical rate, ordinary cross-currency rejection, concurrent unique receipt numbers, void, module/global locks, audit, and backup.');
}finally{await settings(original)}
