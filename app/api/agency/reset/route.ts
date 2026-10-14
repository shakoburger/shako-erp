import {z} from 'zod';
import {context,handled,json,sameOrigin,body,APIError} from '@/lib/server';
import {passwordMatches} from '@/lib/agency-security';

const resetSchema=z.object({
 confirmText:z.string().trim(),
 password:z.string().optional(),
 keepCurrencies:z.boolean().default(true),
 createDefaultTreasury:z.boolean().default(true),
 createStandardAccounts:z.boolean().default(false),
 clearAuditLog:z.boolean().default(false)
}).strict();

export async function POST(req:Request){return handled(async()=>{
 sameOrigin(req);
 const c=await context();
 
 // Only agency manager (admin role) or platform owner can reset the program
 if(c.access.role!=='admin'&&!c.owner){
  throw new APIError(403,'مسح كافة العمليات والحسابات وإعادة ضبط البرنامج متاح لمدير الوكالة فقط');
 }
 
 const b=resetSchema.parse(await body(req));
 
 // Confirmation safeguard: must write the exact confirmation phrase
 if(b.confirmText!=='مسح كافة البيانات'&&b.confirmText.toUpperCase()!=='RESET'){
  throw new APIError(400,'يرجى كتابة نص التأكيد «مسح كافة البيانات» بدقة لإتمام عملية إعادة الضبط');
 }
 
 // Optional password verification for admin members
 if(!c.owner&&c.member?.password_hash&&b.password){
  const valid=await passwordMatches(b.password,c.member.password_salt,c.member.password_hash);
  if(!valid){
   throw new APIError(401,'كلمة مرور مدير الوكالة غير صحيحة');
  }
 }
 
 const now=new Date().toISOString();
 const today=now.slice(0,10);
 const statements:any[]=[];
 
 // 1. Wipe all operations and accounts from records
 if(b.keepCurrencies){
  statements.push(c.database.prepare("DELETE FROM records WHERE kind != 'cash-currency'"));
 } else {
  statements.push(c.database.prepare("DELETE FROM records"));
 }
 
 // 2. Create fresh default main treasury if requested
 if(b.createDefaultTreasury){
  const treasuryId=crypto.randomUUID();
  statements.push(
   c.database.prepare(
    "INSERT INTO records (id, kind, module, code, name, date, currency, amount, payload, created_at, updated_at) VALUES (?, 'cash-account', 'cash', ?, ?, ?, 'MULTI', 0, ?, ?, ?)"
   ).bind(
    treasuryId,
    'الخزينة الرئيسية',
    'الخزينة الرئيسية',
    today,
    JSON.stringify({notes:'الخزينة النقدية الرئيسية الافتراضية للنظام بعد إعادة الضبط'}),
    now,
    now
   )
  );
 }
 
 // 3. Chart of accounts is manually managed by the user under revenue accounts
 
 // 4. Audit log handling
 if(b.clearAuditLog){
  statements.push(c.database.prepare("DELETE FROM audit_log"));
 }
 statements.push(
  c.database.prepare(
   "INSERT INTO audit_log (id, actor, action, before_value, after_value, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
   crypto.randomUUID(),
   c.user.email,
   'إعادة ضبط البرنامج ومسح كافة العمليات والحسابات (ريسيت شامل)',
   JSON.stringify({resetAt:now,options:b}),
   JSON.stringify({status:'completed',executedBy:c.user.email}),
   now
  )
 );
 
 // 5. Increment revision in system_settings
 statements.push(
  c.database.prepare("UPDATE system_settings SET revision = revision + 1, updated_at = ? WHERE id = 1").bind(now)
 );
 
 await c.database.batch(statements);
 
 return json({
  ok:true,
  message:'تم مسح كافة العمليات والحسابات وإعادة ضبط البرنامج بنجاح',
  resetAt:now
 });
})}
