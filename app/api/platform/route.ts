import {z} from 'zod';
import {handled,json,body,sameOrigin,APIError} from '@/lib/server';
import {platformContext,platformAudit,type Agency} from '@/lib/platform';
import {agencyDDL,tenantDB,tenantSQL} from '@/lib/tenant-db';
import {defaults,today,moduleLabels,evaluateSubscription,getEndOfMonth,getEndOfNextMonth} from '@/lib/domain';
import {currencyDefaults} from '@/lib/cash';
import {roleAccess} from '@/lib/access';
import {passwordRecord} from '@/lib/agency-security';
import {agencyBackup} from '@/lib/agency-backup';

const date=z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v)]);
const fields={
  name:z.string().trim().min(1).max(200),
  state:z.enum(['active','suspended','archived']),
  paymentStatus:z.enum(['paid','partial','unpaid']),
  fee:z.number().finite().min(0).max(100000000),
  currency:z.enum(['EGP','USD','AED','SDG']),
  paidOn:date,
  dueOn:date,
  notes:z.string().trim().max(1000),
  modules:z.object(Object.fromEntries(Object.keys(moduleLabels).map(k=>[k,z.boolean()]))).strict().optional()
};

export async function GET(req:Request){
  return handled(async()=>{
    const c=await platformContext(),id=new URL(req.url).searchParams.get('backup');
    if(id){
      const agency=await c.database.prepare('SELECT * FROM platform_agencies WHERE id=?').bind(id).first<Agency>();
      if(!agency)throw new APIError(404,'الوكالة غير موجودة');
      const database=tenantDB(c.database,agency.namespace);
      const backup=await agencyBackup(database,agency,true);
      await platformAudit(c.database,c.user.email,id,'تنزيل نسخة احتياطية لبيانات الوكالة بواسطة مالك المنصة',null,{format:backup.format}).run();
      return json(backup);
    }
    const agencies=(await c.database.prepare('SELECT * FROM platform_agencies ORDER BY created_at DESC').all<Agency>()).results;
    const rows=await Promise.all(agencies.map(async a=>{
      const r=await tenantDB(c.database,a.namespace).prepare('SELECT payload FROM system_settings WHERE id=1').first<{payload:string}>();
      const settings=r?.payload?JSON.parse(r.payload):defaults;
      if(a.name && settings.companyName !== a.name){
        try{
          await tenantDB(c.database,a.namespace).prepare("UPDATE system_settings SET payload=json_set(payload,'$.companyName',?) WHERE id=1").bind(a.name).run();
          settings.companyName=a.name;
        }catch{}
      }
      const sub=evaluateSubscription(a);
      if(sub.isAutoLocked&&a.state==='active'){
        await c.database.prepare("UPDATE platform_agencies SET state='suspended', updated_at=? WHERE id=? AND state='active'").bind(new Date().toISOString(),a.id).run();
        await platformAudit(c.database,'system',a.id,'قفل الوكالة آلياً لانتهاء فترة السماح (5 أيام) دون سداد الاشتراك',{state:'active'},{state:'suspended'}).run();
        a.state='suspended';
        sub.state='suspended';
      }
      return {
        ...a,
        adminEmail:a.admin_email,
        backupAllowed:settings.ownerBackupAllowed!==false,
        modules:{stagedOps:true,...(settings.modules||defaults.modules)},
        companyName:a.name,
        overdue:sub.isOverdue,
        subscription:sub
      };
    }));
    const audit=(await c.database.prepare('SELECT actor,agency_id,action,created_at FROM platform_audit ORDER BY created_at DESC LIMIT 80').all()).results;
    const sysRow=await c.database.prepare('SELECT payload FROM system_settings WHERE id=1').first<{payload:string}>();
    let ownerAuth:any={},supportPhone='';
    try{
      const p=sysRow?.payload?JSON.parse(sysRow.payload):{};
      ownerAuth=p.ownerAuth||{};
      supportPhone=p.supportPhone||'';
    }catch{}
    const ownerInfo={
      username:ownerAuth.username||'owner',
      name:ownerAuth.name||c.user.displayName||'مالك المنصة',
      email:ownerAuth.email||c.user.email||'owner@shako.com',
      phone:ownerAuth.phone||supportPhone||''
    };
    return json({agencies:rows,audit,owner:ownerInfo});
  });
}

export async function POST(req:Request){
  return handled(async()=>{
    sameOrigin(req);
    const c=await platformContext();
    const b=z.object({
      ...fields,
      adminEmail:z.string().email().max(200),
      adminName:z.string().trim().min(1).max(100),
      temporaryPassword:z.string().min(6).max(128),
      forcePasswordChange:z.boolean().optional(),
      enabledCurrencies:z.array(z.enum(['EGP','USD','AED','SDG'])).min(1).max(4),
      defaultCurrency:z.enum(['EGP','USD','AED','SDG'])
    }).strict().parse(await body(req));

    if(b.adminEmail.toLowerCase()===c.user.email.toLowerCase())throw new APIError(400,'أدخل بريد مدير الوكالة؛ حساب مالك المنصة مستقل');
    if(!b.enabledCurrencies.includes(b.defaultCurrency))throw new APIError(400,'العملة الافتراضية يجب أن تكون مفعلة');

    const id=crypto.randomUUID(),namespace='a_'+id.replaceAll('-','')+'_',now=new Date().toISOString();
    const pwd=await passwordRecord(b.temporaryPassword);
    const forceChange=b.forcePasswordChange!==false?1:0;
    const settings={
      ...defaults,
      companyName:b.name,
      displayAmount:0,
      licenseAmount:0,
      enabledCurrencies:[...new Set(b.enabledCurrencies)],
      defaultCurrency:b.defaultCurrency,
      modules:{...(b.modules||defaults.modules)},
      ownerBackupAllowed:true
    };

    const raw=(sql:string)=>c.database.prepare(tenantSQL(sql,namespace));
    await c.database.batch([
      ...agencyDDL(namespace).map(sql=>c.database.prepare(sql)),
      c.database.prepare('INSERT INTO platform_agencies (id,name,namespace,admin_email,state,payment_status,fee_minor,currency,paid_on,due_on,notes,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)').bind(id,b.name,namespace,b.adminEmail.toLowerCase(),b.state,b.paymentStatus,Math.round(b.fee*100),b.currency,b.paidOn,b.dueOn,b.notes,now,now),
      raw('INSERT INTO system_settings (id,owner_id,payload,revision,updated_at) VALUES (1,?,?,1,?)').bind(c.ownerId,JSON.stringify(settings),now),
      raw('INSERT INTO members (email,name,role,permissions,active,created_at,password_hash,password_salt,password_version,force_password_change) VALUES (?,?,?,?,1,?,?,?,1,?)').bind(b.adminEmail.toLowerCase(),b.adminName,'admin',JSON.stringify(roleAccess('admin')),now,pwd.hash,pwd.salt,forceChange),
      c.database.prepare('INSERT INTO platform_memberships (agency_id,email,active) VALUES (?,?,1)').bind(id,b.adminEmail.toLowerCase()),
      platformAudit(c.database,c.user.email,id,'إضافة وكالة جديدة مع تعيين بيانات المدير',null,{name:b.name,adminEmail:b.adminEmail,state:b.state,forcePasswordChange:forceChange===1})
    ]);
    return json({ok:true,id},201);
  });
}

export async function PUT(req:Request){
  return handled(async()=>{
    sameOrigin(req);
    const c=await platformContext();
    const b=z.object({
      ...fields,
      id:z.string().uuid(),
      revision:z.number().int(),
      adminEmail:z.string().email().max(200).optional().or(z.literal('')),
      adminName:z.string().trim().min(1).max(100).optional().or(z.literal('')),
      resetPassword:z.string().min(6).max(128).optional().or(z.literal('')),
      forcePasswordChange:z.boolean().optional(),
      ownerBackupAllowed:z.boolean().optional(),
      accountantEmail:z.string().optional().or(z.literal('')),
      accountantPassword:z.string().min(6).max(128).optional().or(z.literal('')),
      bookingEmail:z.string().optional().or(z.literal('')),
      bookingPassword:z.string().min(6).max(128).optional().or(z.literal(''))
    }).strict().parse(await body(req));

    const old=await c.database.prepare('SELECT * FROM platform_agencies WHERE id=?').bind(b.id).first<Agency>();
    if(!old)throw new APIError(404,'الوكالة غير موجودة');

    const now=new Date().toISOString(),auditId=crypto.randomUUID();
    const targetEmail=(b.adminEmail&&b.adminEmail.trim()?b.adminEmail.trim().toLowerCase():old.admin_email).toLowerCase();
    const tenantDb=tenantDB(c.database,old.namespace);

    // 1. Fetch current settings to preserve or merge modules
    const currentSettingsRow=await tenantDb.prepare('SELECT payload FROM system_settings WHERE id=1').first<{payload:string}>();
    const currentSettings=currentSettingsRow?.payload?JSON.parse(currentSettingsRow.payload):defaults;
    const mergedModules={...(currentSettings.modules||{}),...(b.modules||{})};
    const backupAllowed=b.ownerBackupAllowed!==undefined?b.ownerBackupAllowed:(currentSettings.ownerBackupAllowed!==false);

    // 2. Prepare main statements
    const targetName=(b.name||'').trim();
    const stmts:any[]=[
      c.database.prepare('UPDATE platform_agencies SET name=?,admin_email=?,state=?,payment_status=?,fee_minor=?,currency=?,paid_on=?,due_on=?,notes=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(targetName||b.name,targetEmail,b.state,b.paymentStatus,Math.round(b.fee*100),b.currency,b.paidOn,b.dueOn,b.notes,now,b.id,b.revision),
      c.database.prepare('INSERT INTO platform_audit (id,actor,agency_id,action,before_value,after_value,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()>0').bind(auditId,c.user.email,b.id,b.state==='archived'?'أرشفة الوكالة':old.state==='archived'?'استعادة الوكالة':'تعديل الاشتراك والتفعيل وإعدادات الوكالة',JSON.stringify(old),JSON.stringify(b),now),
      c.database.prepare(tenantSQL("UPDATE system_settings SET payload=json_set(payload,'$.companyName',?,'$.globalLocked',json(?),'$.modules',json(?),'$.ownerBackupAllowed',json(?)),revision=revision+1,updated_at=? WHERE id=1 AND EXISTS (SELECT 1 FROM platform_audit WHERE id=?)",old.namespace)).bind(targetName||b.name,JSON.stringify(b.state!=='active'),JSON.stringify(mergedModules),JSON.stringify(backupAllowed),now,auditId)
    ];

    // If admin email changed, update platform_memberships
    if(targetEmail!==old.admin_email.toLowerCase()){
      stmts.push(c.database.prepare('DELETE FROM platform_memberships WHERE agency_id=? AND email=?').bind(b.id,old.admin_email.toLowerCase()));
      stmts.push(c.database.prepare('INSERT OR IGNORE INTO platform_memberships (agency_id,email,active) VALUES (?,?,1)').bind(b.id,targetEmail));
    }

    const result=await c.database.batch(stmts);
    if(!result[0].meta.changes)throw new APIError(409,'بيانات الوكالة تغيرت. حدّث القائمة');

    // 3. If password reset or email update was requested, execute inside tenant members
    if(b.resetPassword&&b.resetPassword.trim()){
      const pwd=await passwordRecord(b.resetPassword.trim());
      const forceChange=b.forcePasswordChange!==false?1:0;
      const existingMember=await tenantDb.prepare('SELECT * FROM members WHERE email=?').bind(targetEmail).first<any>();
      if(existingMember){
        await tenantDb.prepare('UPDATE members SET password_hash=?,password_salt=?,password_version=password_version+1,force_password_change=?,active=1,failed_attempts=0,locked_until=NULL,revision=revision+1 WHERE email=?').bind(pwd.hash,pwd.salt,forceChange,targetEmail).run();
      }else{
        const existingAdmin=await tenantDb.prepare("SELECT * FROM members WHERE role='admin'").first<any>();
        if(existingAdmin){
          await tenantDb.prepare('UPDATE members SET email=?,password_hash=?,password_salt=?,password_version=password_version+1,force_password_change=?,active=1,failed_attempts=0,locked_until=NULL,revision=revision+1 WHERE email=?').bind(targetEmail,pwd.hash,pwd.salt,forceChange,existingAdmin.email).run();
        }else{
          await tenantDb.prepare('INSERT INTO members (email,name,role,permissions,active,created_at,password_hash,password_salt,password_version,force_password_change) VALUES (?,?,?,?,1,?,?,?,1,?)').bind(targetEmail,b.adminName||old.name,'admin',JSON.stringify(roleAccess('admin')),now,pwd.hash,pwd.salt,forceChange).run();
        }
      }
      await tenantDb.prepare('DELETE FROM agency_sessions WHERE email=?').bind(targetEmail).run();
      await platformAudit(c.database,c.user.email,b.id,'تعيين كلمة مرور مؤقتة/افتراضية لمدير الوكالة',null,{adminEmail:targetEmail,forcePasswordChange:forceChange===1}).run();
    }else if(targetEmail!==old.admin_email.toLowerCase()){
      // Just update email in tenant members if exists
      await tenantDb.prepare('UPDATE members SET email=? WHERE email=?').bind(targetEmail,old.admin_email.toLowerCase()).run();
    }

    // 4. If accountant password was requested
    if(b.accountantPassword&&b.accountantPassword.trim()){
      const pwd=await passwordRecord(b.accountantPassword.trim());
      const accEmail=(b.accountantEmail&&b.accountantEmail.trim()?b.accountantEmail.trim().toLowerCase():'accountant@shako.com');
      const existingAcc=await tenantDb.prepare("SELECT * FROM members WHERE role='accountant' OR email=?").bind(accEmail).first<any>();
      if(existingAcc){
        await tenantDb.prepare('UPDATE members SET email=?,password_hash=?,password_salt=?,password_version=password_version+1,active=1,revision=revision+1 WHERE email=?').bind(accEmail,pwd.hash,pwd.salt,existingAcc.email).run();
      }else{
        await tenantDb.prepare('INSERT INTO members (email,name,role,permissions,active,created_at,password_hash,password_salt,password_version,force_password_change) VALUES (?,?,?,?,1,?,?,?,1,0)').bind(accEmail,'المحاسب المالي','accountant',JSON.stringify(roleAccess('accountant')),now,pwd.hash,pwd.salt).run();
      }
      await tenantDb.prepare('DELETE FROM agency_sessions WHERE email=?').bind(accEmail).run();
      await platformAudit(c.database,c.user.email,b.id,'تعيين كلمة مرور لحساب المحاسب المالي بالوكالة',null,{email:accEmail}).run();
    }

    // 5. If booking officer password was requested
    if(b.bookingPassword&&b.bookingPassword.trim()){
      const pwd=await passwordRecord(b.bookingPassword.trim());
      const bkEmail=(b.bookingEmail&&b.bookingEmail.trim()?b.bookingEmail.trim().toLowerCase():'booking@shako.com');
      const existingBk=await tenantDb.prepare("SELECT * FROM members WHERE role='booking' OR email=?").bind(bkEmail).first<any>();
      if(existingBk){
        await tenantDb.prepare('UPDATE members SET email=?,password_hash=?,password_salt=?,password_version=password_version+1,active=1,revision=revision+1 WHERE email=?').bind(bkEmail,pwd.hash,pwd.salt,existingBk.email).run();
      }else{
        await tenantDb.prepare('INSERT INTO members (email,name,role,permissions,active,created_at,password_hash,password_salt,password_version,force_password_change) VALUES (?,?,?,?,1,?,?,?,1,0)').bind(bkEmail,'موظف الحجز والتذاكر','booking',JSON.stringify(roleAccess('booking')),now,pwd.hash,pwd.salt).run();
      }
      await tenantDb.prepare('DELETE FROM agency_sessions WHERE email=?').bind(bkEmail).run();
      await platformAudit(c.database,c.user.email,b.id,'تعيين كلمة مرور لحساب موظف الحجز بالوكالة',null,{email:bkEmail}).run();
    }

    return json({ok:true,adminEmail:targetEmail});
  });
}
