import {context,handled,json,gate} from '@/lib/server';
import {moduleEnabled,type ModuleKey} from '@/lib/domain';
import {accountBalances} from '@/lib/balances';
export async function GET(){return handled(async()=>{const c=await context();gate(c,'reports');const modules=(Object.keys(c.settings.modules) as ModuleKey[]).filter(m=>moduleEnabled(c.settings,m));const q=await c.database.prepare(`SELECT * FROM records WHERE module IN (${modules.map(()=>'?').join(',')})`).bind(...modules).all();const rows=q.results.map((r:any)=>({...r,payload:JSON.parse(r.payload)}));return json({balances:accountBalances(rows,'9999-12-31',c.settings.modules),partial:Object.values(c.settings.modules).some(v=>!v)})})}
