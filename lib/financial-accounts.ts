import {APIError,unlockedSQL,type Context} from './server';
import {reportedBatch} from './reported-batch';
import type {ModuleKey} from './domain';

export const isCustomer=(r:{kind:string})=>r.kind==='customer';
export const isCounterparty=(r:{kind:string})=>['customer','account','expense'].includes(r.kind);
export const isAsset=(r:{kind:string})=>['cash-account','bank-account'].includes(r.kind);
export function activeAccountSQL(id:string){return ` AND EXISTS (SELECT 1 FROM records WHERE id='${id.replaceAll("'","''")}' AND COALESCE(json_extract(payload,'$.archived'),0)=0)`}
export function requireActiveAccount(r:any){if(r.payload?.archived){const kindLabel=r.kind==='cash-account'?'الخزينة':r.kind==='bank-account'?'البنك':r.kind==='customer'?'العميل':'الحساب';throw new APIError(400,`حساب ${kindLabel} «${r.name||'المحدد'}» مؤرشف أو تم حذفه؛ يرجى اختيار حساب نشط أو استعادة الحساب`)}}
const links=['treasuryId','counterpartyId','parentId','intermediaryId','customerId','supplierId','brokerId','commissionAccountId','sourceId'];
const linkedSQL=links.map(key=>`json_extract(linked.payload,'$.${key}')=records.id`).join(' OR ');
// Every reference, including voided vouchers and pending cheques, protects the history.
export async function removeAsset(c:Context,old:any,updatedAt:string,restore=false){
 if(old.updatedAt!==updatedAt)throw new APIError(409,'تم تغيير الحساب؛ أعد تحميله');
 const module:ModuleKey=old.kind==='bank-account'?'banks':'cash';
 const now=new Date(Math.max(Date.now(),Date.parse(old.updatedAt)+1)).toISOString(),mutationId=crypto.randomUUID();
 const p={...old.payload,mutationId,archived:!restore,archivedAt:restore?null:now};
 const condition=`id=? AND updated_at=? AND EXISTS (SELECT 1 FROM system_settings WHERE id=1 AND ${unlockedSQL(module,c)})`;
 const noLinks=`amount=0 AND NOT EXISTS (SELECT 1 FROM records linked WHERE linked.id!=records.id AND (${linkedSQL}))`;
 const action=restore?'استعادة حساب':'حذف أو أرشفة حساب',auditId=crypto.randomUUID();
 const statements:D1PreparedStatement[]=[c.database.prepare(`INSERT INTO audit_log (id,actor,action,before_value,after_value,created_at) SELECT ?,?,?,?,?,? FROM records WHERE ${condition}`).bind(auditId,c.user.email,action,JSON.stringify(old),JSON.stringify(p),now,old.id,updatedAt,c.revision)];
 const audited=` AND EXISTS (SELECT 1 FROM audit_log WHERE id='${auditId}')`;
 if(!restore)statements.push(c.database.prepare(`DELETE FROM records WHERE ${condition} AND ${noLinks}${audited}`).bind(old.id,updatedAt,c.revision));
 statements.push(c.database.prepare(`UPDATE records SET payload=?,updated_at=? WHERE ${condition}${audited}`).bind(JSON.stringify(p),now,old.id,updatedAt,c.revision));
 const operation=await reportedBatch(c,statements,action,old.id);
 if(!operation.results[0].meta.changes)throw new APIError(409,'تغير الحساب أو صلاحياته؛ أعد تحميل البيانات');
 const saved=await c.database.prepare('SELECT id FROM records WHERE id=?').bind(old.id).first();
 return {ok:true,mode:restore?'restored':saved?'archived':'deleted',operationReport:operation.report};
}
