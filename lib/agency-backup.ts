import {env} from 'cloudflare:workers';
import {agencyFields} from './server';
export async function agencyBackup(database:D1Database,agency:{id:string;name:string},includePlatformSettings=false){
 const [row,records,members,audit]=await Promise.all([database.prepare('SELECT payload FROM system_settings WHERE id=1').first<{payload:string}>(),database.prepare('SELECT * FROM records ORDER BY created_at').all(),database.prepare('SELECT email,name,role,permissions,active,created_at FROM members').all(),database.prepare('SELECT * FROM audit_log ORDER BY created_at').all()]);
 const raw=JSON.parse(row!.payload),settings=includePlatformSettings?raw:Object.fromEntries([...Object.keys(agencyFields),'systemName','logoKey','logoData'].map(k=>[k,raw[k]]));let logo:any=null;
 if(raw.logoData&&typeof raw.logoData==='string'){
  logo={contentType:'image/png',base64:raw.logoData.split(',')[1]||raw.logoData};
 }else if(raw.logoKey){
  const e=env as any,store=e?.AGENCY_ASSETS||e?.BUCKET||e?.ASSETS;
  if(store){
   try{
    const image=await store.get(raw.logoKey);
    if(image){
     const bytes=new Uint8Array(await image.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));
     logo={contentType:'image/png',base64:btoa(binary)};
    }
   }catch{}
  }
 }
 return {format:'SHAKO-AGENCY-3',exportedAt:new Date().toISOString(),agency:{id:agency.id,name:agency.name},settings,records:records.results,members:members.results,audit:audit.results,logo};
}
