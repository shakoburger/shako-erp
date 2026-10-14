import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {defaults} from './domain';
import {APIError} from './server';
import {tenantDB} from './tenant-db';
import {getSqliteD1Database} from './sqlite-fallback';
export const legacyAgencyId='00000000-0000-4000-8000-000000000001';
export const agencyCookie='shako_selected_agency';
export type Agency={id:string;name:string;namespace:string;admin_email:string;state:'active'|'suspended'|'archived';payment_status:'paid'|'partial'|'unpaid';fee_minor:number;currency:string;paid_on:string;due_on:string;notes:string;revision:number;created_at:string;updated_at:string};
export function platformDB(){const e=env as any;if(e?.DB)return e.DB;const fallback=getSqliteD1Database();if(fallback)return fallback;throw new Error('Database unavailable');}
export async function platformIdentity(){
 const user=await getChatGPTUser();if(!user)throw new APIError(401,'يرجى تسجيل الدخول');const database=platformDB();let row=await database.prepare('SELECT owner_id FROM platform_settings WHERE id=1').first<{owner_id:string}>();
 if(!row){const configured=(env as unknown as {OWNER_EMAIL?:string}).OWNER_EMAIL?.trim().toLowerCase();if(!configured||user.email.toLowerCase()!==configured)throw new APIError(403,'مالك المنصة لم يكمل التهيئة');const now=new Date().toISOString();await database.batch([
 database.prepare('INSERT OR IGNORE INTO system_settings (id,owner_id,payload,revision,updated_at) VALUES (1,?,?,1,?)').bind(user.userId,JSON.stringify(defaults),now),
 database.prepare('INSERT OR IGNORE INTO platform_settings (id,owner_id) SELECT 1,owner_id FROM system_settings WHERE id=1'),
 database.prepare("INSERT OR IGNORE INTO platform_agencies (id,name,namespace,admin_email,state,payment_status,fee_minor,currency,paid_on,due_on,notes,revision,created_at,updated_at) SELECT ?,json_extract(payload,'$.companyName'),'legacy',?,'active','unpaid',0,'USD','','','',1,?,? FROM system_settings WHERE id=1").bind(legacyAgencyId,user.email.toLowerCase(),now,now)]);row=await database.prepare('SELECT owner_id FROM platform_settings WHERE id=1').first<{owner_id:string}>();}
 return {user,database,owner:row!.owner_id===user.userId,ownerId:row!.owner_id};
}
export async function platformContext(){const c=await platformIdentity();if(!c.owner)throw new APIError(403,'لوحة مالك المنصة غير متاحة لمستخدمي الوكالات');return c}
export async function agencyAccess(){
 const c=await platformIdentity();const rows=(c.owner?await c.database.prepare('SELECT id,name,state FROM platform_agencies ORDER BY name').all():await c.database.prepare("SELECT a.id,a.name,a.state FROM platform_agencies a JOIN platform_memberships m ON m.agency_id=a.id WHERE m.email=? AND m.active=1 AND a.state!='archived' ORDER BY a.name").bind(c.user.email.toLowerCase()).all()).results;
 const selected=(await cookies()).get(agencyCookie)?.value;if(selected&&!rows.some((a:any)=>a.id===selected))throw new APIError(403,'الوكالة المحددة غير مصرح بها لهذا الحساب');const agencyId=selected|| (rows.length===1?String(rows[0].id):c.owner&&rows.some((a:any)=>a.id===legacyAgencyId)?legacyAgencyId:null);
 return {...c,choices:rows as {id:string;name:string;state:string}[],agencyId};
}
export async function selectedAgency(){const c=await agencyAccess();if(!c.agencyId)throw new APIError(c.choices.length?409:403,c.choices.length?'اختر الوكالة التي تريد الدخول إليها':'لا توجد وكالة مصرح لك بالدخول إليها');const agency=await c.database.prepare('SELECT * FROM platform_agencies WHERE id=?').bind(c.agencyId).first<Agency>();if(!agency||(!c.owner&&agency.state==='archived'))throw new APIError(403,'الوكالة غير متاحة');return {...c,agency:agency!,database:tenantDB(c.database,agency!.namespace),rawDatabase:c.database}}
export function agencyCookieHeader(id:string,req:Request){return `${agencyCookie}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(req.url).protocol==='https:'?'; Secure':''}`}
export function platformAudit(database:D1Database,actor:string,agencyId:string,action:string,before:unknown,after:unknown){return database.prepare('INSERT INTO platform_audit (id,actor,agency_id,action,before_value,after_value,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,agencyId,action,JSON.stringify(before),JSON.stringify(after),new Date().toISOString())}
