import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5173',stamp=String(Date.now()),prefix=`CurrencyLinkQA extra ${stamp}`,date='2026-10-04';
const previous=JSON.parse(await readFile(new URL('../.sites-runtime/currency-link-regression-result.json',import.meta.url),'utf8'));
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=auth.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const results=[],fixtures=[];let serial=0;
async function req(path,method='GET',body,status=200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)}),b=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(b)}`);return b}
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS '+name)}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL '+name+': '+e.message)}}
const balances=async()=>(await req('/api/balances')).balances;
const balance=(rows,id)=>rows.find(r=>r.accountId===id&&r.currency==='EGP')?.balanceMinor||0;
try{
 const rows=await req('/api/records?kind=all');
 const fixture=(kind,currency)=>{const r=rows.find(r=>r.kind===kind&&r.currency===currency&&r.name.startsWith(previous.prefix));assert.ok(r,`Prior fixture ${kind} ${currency} is absent; cleanup may have started`);return r};
 const accountEgp=fixture('account','EGP'),accountUsd=fixture('account','USD'),customer=fixture('customer','EGP');
 const cashEgp=fixture('cash-account','EGP'),cashUsd=fixture('cash-account','USD'),bankEgp=fixture('bank-account','EGP'),bankUsd=fixture('bank-account','USD');
 for(const kind of ['cash','bank']){
  const path=kind==='cash'?'/api/cash':'/api/banks',body={action:'account',name:`${prefix} ${kind} EGP parent`,currency:'EGP',rate:1};
  await check(`${kind} account rejects USD parent for EGP currency`,()=>req(path,'POST',{...body,parentId:accountUsd.id},400));
  await check(`${kind} account accepts and stores EGP parent`,async()=>{const row=await req(path,'POST',{...body,parentId:accountEgp.id},201);fixtures.push({id:row.id,kind:row.kind,name:row.name});assert.equal(row.currency,'EGP');assert.equal(row.payload.parentId,accountEgp.id)});
 }
 for(const payment of ['cash','bank']){
  const correct=payment==='cash'?cashEgp:bankEgp,wrong=payment==='cash'?cashUsd:bankUsd;
  const input=treasuryId=>({kind:'visa',name:`${prefix} visa ${payment} ${++serial}`,code:`${stamp}${serial}`,date,currency:'EGP',amount:12.35,payload:{customerId:customer.id,payment,...(treasuryId?{treasuryId}:{})}});
  await check(`visa ${payment} collection rejects absent treasuryId`,()=>req('/api/records','POST',input(),400));
  await check(`visa ${payment} collection rejects USD treasury`,()=>req('/api/records','POST',input(wrong.id),400));
  await check(`visa ${payment} collection posts once to matching actual treasury`,async()=>{
   const before=await balances(),row=await req('/api/records','POST',input(correct.id),201);fixtures.push({id:row.id,kind:row.kind,name:row.name});
   const after=await balances(),settlements=(await req('/api/records?kind=all')).filter(r=>r.payload.sourceId===row.id);assert.equal(settlements.length,1);
   const settlement=settlements[0];assert.equal(settlement.kind,payment);assert.equal(settlement.currency,'EGP');assert.equal(settlement.payload.treasuryId,correct.id);assert.equal(settlement.amount,1235);
   assert.equal(balance(after,correct.id)-balance(before,correct.id),1235);assert.equal(balance(after,customer.id),balance(before,customer.id));
  });
 }
}catch(e){results.push({name:'Setup or run',pass:false,error:e.message});console.log('FAIL '+e.message)}
const report={base,stamp,prefix,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,fixtures};
await writeFile(new URL('../.sites-runtime/currency-link-additional-result.json',import.meta.url),JSON.stringify(report,null,2));
console.log(`Additional currency-link regression: ${report.passed} passed, ${report.failed} failed. Fixtures: ${prefix}.`);
process.exitCode=report.failed?1:0;
