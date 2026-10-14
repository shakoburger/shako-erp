import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// This regression intentionally targets the local preview only. Root cleans its fixtures.
const base='http://127.0.0.1:5173';
assert.equal(new URL(base).hostname,'127.0.0.1');
const stamp=String(Date.now()),prefix=`CurrencyLinkQA ${stamp}`,date='2026-10-04';
const results=[],fixtures=[],operations=[];
let serial=0;
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=auth.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.ok(cookie,'Local preview sign-in did not return a session');
async function response(path,method='GET',body){
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
}
async function req(path,method='GET',body,status=200){
  const r=await response(path,method,body);assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(r.body)}`);return r.body;
}
async function check(name,fn){
  try{await fn();results.push({name,pass:true});console.log('PASS '+name)}
  catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL '+name+': '+e.message)}
}
async function create(path,body){const row=await req(path,'POST',body,201);fixtures.push({id:row.id,kind:row.kind,name:row.name});return row}
const master=(kind,currency)=>create('/api/records',{kind,name:`${prefix} ${kind} ${currency}`,date,currency,amount:0,payload:{}});
const asset=(kind,currency,suffix='')=>create(kind==='cash'?'/api/cash':'/api/banks',{action:'account',name:`${prefix} ${kind} ${currency} ${suffix}`,currency,rate:currency==='USD'?50:1});
const recordInput=(kind,payment,customerId,treasuryId)=>({kind,name:`${prefix} ${kind} ${payment} ${++serial}`,code:stamp+String(serial).padStart(2,'0'),date,currency:'EGP',amount:kind==='ticket'?0:25,payload:{customerId,payment,...(treasuryId?{treasuryId}:{}),...(kind==='ticket'?{airline:'EGYPTAIR',fare:100,commAmount:0,flags:{},status:'active'}:{})}});
const input=(type,treasuryId,counterpartyId,extra={})=>({action:'voucher',type,date,treasuryId,counterpartyId,amount:10,notes:prefix,transactionCurrency:'EGP',conversionRate:1,...extra});
const cross={transactionCurrency:'USD',conversionRate:50};
async function all(){return req('/api/records?kind=all')}
async function legs(id){return (await all()).filter(r=>['cash','bank'].includes(r.kind)&&(r.payload.cashVoucherId===id||r.payload.bankVoucherId===id))}
async function balances(){return (await req('/api/balances')).balances}
const balance=(rows,id,currency='EGP')=>rows.find(r=>r.accountId===id&&r.currency===currency)?.balanceMinor||0;
async function savedVoucher(path,body){const row=await req(path,'POST',body,201);operations.push({id:row.id,kind:row.kind,code:row.code});return row}
async function verifyLegs(row,expected){
  const rows=await legs(row.id);assert.equal(rows.length,expected.length);
  for(const [account,amount] of expected){const leg=rows.find(r=>r.payload.treasuryId===account.id);assert.ok(leg,`Missing asset leg ${account.id}`);assert.equal(leg.currency,account.currency);assert.equal(leg.amount,amount)}
}
try{
  const boot=await req('/api/bootstrap');
  assert.equal(boot.settings.globalLocked,false,'Local preview is locked');
  for(const module of ['cash','banks','customers','accounts','employees','tickets','reports'])assert.equal(boot.settings.modules[module],true,`Required module ${module} is locked`);
  const customerEgp=await master('customer','EGP'),customerUsd=await master('customer','USD');
  const accountEgp=await master('account','EGP'),accountUsd=await master('account','USD'),employeeUsd=await master('employee','USD');
  const cashEgp=await asset('cash','EGP'),cashUsd=await asset('cash','USD');
  const bankEgp=await asset('bank','EGP'),bankEgp2=await asset('bank','EGP','second'),bankUsd=await asset('bank','USD');

  for(const type of ['receipt','payment']){
    const body=input(type,cashEgp.id,customerEgp.id);
    await check(`cash ${type} rejects USD counterpart with explicit rate`,()=>req('/api/cash','POST',{...body,counterpartyId:customerUsd.id,...cross},400));
    let row;
    await check(`cash ${type} accepts EGP and posts one native leg`,async()=>{row=await savedVoucher('/api/cash',body);assert.equal(row.payload.rate,1);await verifyLegs(row,[[cashEgp,type==='receipt'?1000:-1000]])});
    if(row)await check(`cash ${type} rejects cross-currency edit without changing legs`,async()=>{
      const before=await legs(row.id);await req('/api/cash','POST',{...body,id:row.id,updatedAt:row.updatedAt,counterpartyId:customerUsd.id,...cross},400);assert.deepEqual(await legs(row.id),before);
    });
  }
  for(const counterpart of [accountUsd,employeeUsd,bankUsd])await check(`cash receipt rejects USD ${counterpart.kind}`,()=>req('/api/cash','POST',input('receipt',cashEgp.id,counterpart.id,cross),400));
  await check('cash receipt using bank treasury rejects USD customer',()=>req('/api/cash','POST',input('receipt',bankEgp.id,customerUsd.id,cross),400));

  for(const type of ['deposit','withdraw','transfer','cheque-receive','cheque-issue']){
    const cheque=type.startsWith('cheque-'),transfer=type==='transfer';
    const extra=cheque?{chequeNumber:`${stamp}-${type}`,chequeDate:date,chequeStatus:'cleared',clearedDate:date,...(type==='cheque-issue'?{chequeMode:'direct'}:{})}:{};
    const body=input(type,bankEgp.id,transfer?bankEgp2.id:customerEgp.id,extra);
    await check(`bank ${type} rejects USD counterpart with explicit rate`,()=>req('/api/banks','POST',{...body,counterpartyId:transfer?bankUsd.id:customerUsd.id,...cross},400));
    let row;
    await check(`bank ${type} accepts matching currency and native signs`,async()=>{
      row=await savedVoucher('/api/banks',body);assert.equal(row.payload.rate,1);
      const sign=['deposit','cheque-receive'].includes(type)?1:-1;
      await verifyLegs(row,transfer?[[bankEgp,-1000],[bankEgp2,1000]]:[[bankEgp,sign*1000]]);
    });
    if(row)await check(`bank ${type} rejects cross-currency edit without changing legs`,async()=>{
      const before=await legs(row.id);await req('/api/banks','POST',{...body,id:row.id,updatedAt:row.updatedAt,counterpartyId:transfer?bankUsd.id:customerUsd.id,...cross},400);assert.deepEqual(await legs(row.id),before);
    });
  }
  await check('bank deposit rejects USD cash account',()=>req('/api/banks','POST',input('deposit',bankEgp.id,cashUsd.id,cross),400));
  await check('bank withdraw rejects USD chart account',()=>req('/api/banks','POST',input('withdraw',bankEgp.id,accountUsd.id,cross),400));
  const deferredBody=input('cheque-issue',bankEgp.id,customerEgp.id,{chequeNumber:stamp+'-deferred',chequeDate:'2026-10-10',chequeStatus:'pending',chequeMode:'deferred',intermediaryId:accountEgp.id});
  await check('deferred cheque rejects USD beneficiary',()=>req('/api/banks','POST',{...deferredBody,counterpartyId:customerUsd.id,...cross},400));
  await check('deferred cheque rejects USD intermediary',()=>req('/api/banks','POST',{...deferredBody,intermediaryId:accountUsd.id},400));
  await check('deferred EGP cheque has no legs until pass, then native leg',async()=>{
    let row=await savedVoucher('/api/banks',deferredBody);await verifyLegs(row,[]);
    row=await req('/api/banks','POST',{action:'pass-cheque',id:row.id,updatedAt:row.updatedAt,clearedDate:'2026-10-10'});await verifyLegs(row,[[bankEgp,-1000]]);
  });

  for(const kind of ['ticket','service'])for(const payment of ['cash','bank']){
    const correct=payment==='cash'?cashEgp:bankEgp,wrongCurrency=payment==='cash'?cashUsd:bankUsd,wrongKind=payment==='cash'?bankEgp:cashEgp;
    await check(`${kind} ${payment} requires actual treasuryId`,()=>req('/api/records','POST',recordInput(kind,payment,customerEgp.id),400));
    await check(`${kind} ${payment} rejects wrong treasury currency`,()=>req('/api/records','POST',recordInput(kind,payment,customerEgp.id,wrongCurrency.id),400));
    await check(`${kind} ${payment} rejects wrong treasury kind`,()=>req('/api/records','POST',recordInput(kind,payment,customerEgp.id,wrongKind.id),400));
    await check(`${kind} ${payment} assigns one settlement and balance to actual account`,async()=>{
      const before=await balances(),body=recordInput(kind,payment,customerEgp.id,correct.id),row=await create('/api/records',body);operations.push({id:row.id,kind:row.kind,code:row.code});
      const rows=await all(),settlements=rows.filter(r=>r.payload.sourceId===row.id);assert.equal(settlements.length,1);
      const settlement=settlements[0];assert.equal(settlement.kind,payment);assert.equal(settlement.currency,'EGP');assert.equal(settlement.payload.treasuryId,correct.id);assert.equal(settlement.amount,kind==='ticket'?10000:2500);
      const after=await balances();assert.equal(balance(after,correct.id)-balance(before,correct.id),settlement.amount);assert.equal(balance(after,customerEgp.id),balance(before,customerEgp.id),'Customer debt should be posted and collected once');
      assert.ok(row.operationReport.effects.some(e=>e.accountId===correct.id&&e.currency==='EGP'&&e.movementMinor===settlement.amount));
      const retry={...body,id:row.id,payload:{...body.payload,treasuryId:wrongCurrency.id}};await req('/api/records','POST',retry,400);
      assert.equal((await all()).filter(r=>r.payload.sourceId===row.id).length,1);assert.equal(balance(await balances(),correct.id),balance(after,correct.id));
    });
  }
  await check('ticket credit requires no treasury and creates no collection',async()=>{
    const row=await create('/api/records',recordInput('ticket','credit',customerEgp.id));assert.equal((await all()).filter(r=>r.payload.sourceId===row.id).length,0);
  });
  await check('matching USD ticket cash settlement stays on USD treasury and customer',async()=>{
    const body=recordInput('ticket','cash',customerUsd.id,cashUsd.id);body.currency='USD';const before=await balances(),row=await create('/api/records',body),after=await balances();
    assert.equal(balance(after,cashUsd.id,'USD')-balance(before,cashUsd.id,'USD'),10000);assert.equal(balance(after,customerUsd.id,'USD'),balance(before,customerUsd.id,'USD'));assert.equal((await all()).find(r=>r.payload.sourceId===row.id).payload.treasuryId,cashUsd.id);
  });
}catch(e){results.push({name:'Setup or run',pass:false,error:e.message});console.log('FAIL '+e.message)}
const report={base,stamp,prefix,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,fixtures,operations};
await writeFile(new URL('../.sites-runtime/currency-link-regression-result.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`Currency-link regression: ${report.passed} passed, ${report.failed} failed. Fixtures: ${prefix}.`);
process.exitCode=report.failed?1:0;
