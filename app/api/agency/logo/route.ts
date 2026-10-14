import {env} from 'cloudflare:workers';
import {context,handled,agencyAbility,authSQL,APIError,json,sameOrigin} from '@/lib/server';

function getStore(){
 const e=env as any;
 return e?.BUCKET||e?.AGENCY_ASSETS||e?.ASSETS||null;
}

export async function GET(){
 return handled(async()=>{
  const c=await context({allowPasswordPending:true});
  const key=c.rawSettings.logoKey;
  const data=(c.rawSettings as any).logoData;
  if(!key&&!data)throw new APIError(404,'لا يوجد شعار');

  const store=getStore();
  if(store&&key){
   try{
    const image=await store.get(key);
    if(image){
     return new Response(image.body,{
      headers:{
       'Content-Type':image.httpMetadata?.contentType||'image/png',
       'Cache-Control':'public, max-age=3600',
       'X-Content-Type-Options':'nosniff'
      }
     });
    }
   }catch(err){
    console.warn('R2 get failed, checking database fallback:',err);
   }
  }

  if(data&&typeof data==='string'&&data.startsWith('data:image/')){
   const base64Part=data.split(',')[1];
   const binary=atob(base64Part);
   const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   return new Response(bytes,{
    headers:{
     'Content-Type':'image/png',
     'Cache-Control':'public, max-age=3600',
     'X-Content-Type-Options':'nosniff'
    }
   });
  }

  throw new APIError(404,'الشعار غير موجود');
 });
}

export async function POST(req:Request){
 return handled(async()=>{
  sameOrigin(req);
  const c=await context();
  agencyAbility(c,'manageSettings');
  const revision=Number(req.headers.get('X-Settings-Revision'));
  if(revision!==c.revision)throw new APIError(409,'الإعدادات تغيرت. أعد تحميلها قبل رفع الشعار');
  if(Number(req.headers.get('Content-Length')||0)>2000000)throw new APIError(413,'الشعار أكبر من المسموح (الحد الأقصى 2 ميجابايت)');
  const bytes=new Uint8Array(await req.arrayBuffer());
  if(bytes.length>2000000||bytes.length<24)throw new APIError(400,'ارفع صورة PNG صالحة بحجم أقل من 2 ميجابايت');
  if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw new APIError(400,'نوع الصورة غير صالح (يرجى رفع صورة صالحة)');
  const view=new DataView(bytes.buffer);
  if(!view.getUint32(16)||!view.getUint32(20)||view.getUint32(16)>2048||view.getUint32(20)>2048)throw new APIError(400,'أبعاد الشعار أكبر من المسموح');

  const key='branding/'+crypto.randomUUID()+'.png';
  const store=getStore();
  if(store){
   try{
    await store.put(key,bytes,{httpMetadata:{contentType:'image/png'}});
   }catch(err){
    console.warn('R2 put failed, will use database storage fallback:',err);
   }
  }

  let binary='';
  for(let i=0;i<bytes.length;i+=4096){
   binary+=String.fromCharCode(...bytes.subarray(i,i+4096));
  }
  const logoData='data:image/png;base64,'+btoa(binary);

  const settings={...c.rawSettings,logoKey:key,logoData};
  const now=new Date().toISOString();
  const result=await c.database.batch([
   c.database.prepare(`UPDATE system_settings SET payload=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? AND ${authSQL(c)}`).bind(JSON.stringify(settings),now,c.revision),
   c.database.prepare('INSERT INTO audit_log (id,actor,action,before_value,after_value,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),c.user.email,'تحديث شعار الوكالة',JSON.stringify({logoKey:c.rawSettings.logoKey||null}),JSON.stringify({logoKey:key}),now)
  ]);
  if(!result[0].meta.changes){
   if(store)try{await store.delete(key);}catch{}
   throw new APIError(409,'الإعدادات تغيرت. أعد رفع الشعار');
  }
  return json({settings,revision:c.revision+1});
 });
}

export async function DELETE(req:Request){
 return handled(async()=>{
  sameOrigin(req);
  const c=await context();
  agencyAbility(c,'manageSettings');
  if(Number(req.headers.get('X-Settings-Revision'))!==c.revision)throw new APIError(409,'الإعدادات تغيرت. أعد تحميلها');
  const settings={...c.rawSettings};
  delete settings.logoKey;
  delete (settings as any).logoData;
  const store=getStore();
  if(store&&c.rawSettings.logoKey){
   try{await store.delete(c.rawSettings.logoKey);}catch{}
  }
  const now=new Date().toISOString();
  const result=await c.database.batch([
   c.database.prepare(`UPDATE system_settings SET payload=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? AND ${authSQL(c)}`).bind(JSON.stringify(settings),now,c.revision),
   c.database.prepare('INSERT INTO audit_log (id,actor,action,before_value,after_value,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),c.user.email,'إزالة شعار الوكالة',JSON.stringify({logoKey:c.rawSettings.logoKey}),'null',now)
  ]);
  if(!result[0].meta.changes)throw new APIError(409,'الإعدادات تغيرت');
  return json({settings,revision:c.revision+1});
 });
}
