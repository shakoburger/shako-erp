import {agencyBackup} from '@/lib/agency-backup';
import {context,handled,json,ownerOnly,agencyAbility,body,sameOrigin,APIError,audit} from '@/lib/server';
import {z} from 'zod';
export async function GET(req:Request){return handled(async()=>{const c=await context();const mode=new URL(req.url).searchParams.get('mode');if(mode==='backup'){agencyAbility(c,'backup');if(c.owner&&!c.rawSettings.ownerBackupAllowed)throw new APIError(403,'الوكالة لم تسمح بالنسخ من حساب مالك المنصة');return json(await agencyBackup(c.database,c.agency,c.owner))}ownerOnly(c);const [members,auditRows]=await Promise.all([c.database.prepare('SELECT email, active FROM members ORDER BY email').all(),c.database.prepare('SELECT actor, action, before_value, after_value, created_at FROM audit_log ORDER BY created_at DESC LIMIT 100').all()]);return json({members:members.results,audit:auditRows.results})})}
export async function POST(){return json({error:'استخدم إدارة المستخدمين في إعدادات الوكالة'},410)}
