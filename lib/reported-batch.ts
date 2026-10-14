import {moduleEnabled,type ModuleKey} from './domain';
import {operationReport} from './balances';
import type {Context} from './server';
// D1 batch runs these reads and writes in a single transaction: concurrent saves cannot enter between the snapshots.
export async function reportedBatch(c:Context,statements:D1PreparedStatement[],action:string,id:string){
 const modules=(Object.keys(c.settings.modules) as ModuleKey[]).filter(m=>moduleEnabled(c.settings,m));
 const snapshot=()=>c.database.prepare(`SELECT * FROM records WHERE module IN (${modules.map(()=>'?').join(',')})`).bind(...modules);
 const r=await c.database.batch([snapshot(),...statements,snapshot()]);
 const unpack=(rows:any[])=>rows.map(r=>({...r,payload:JSON.parse(r.payload)}));
 return {results:r.slice(1,-1),report:moduleEnabled(c.settings,'reports')?operationReport(unpack(r[0].results),unpack(r.at(-1)!.results),action,id,c.user.displayName):undefined};
}
