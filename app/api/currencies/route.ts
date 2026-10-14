import {context,handled,json,gate} from '@/lib/server';
import {moduleEnabled,type ModuleKey} from '@/lib/domain';
import {currencyDefaults} from '@/lib/cash';
export async function GET(req:Request){return handled(async()=>{
 const c=await context();if(!(Object.keys(c.settings.modules) as ModuleKey[]).some(m=>moduleEnabled(c.settings,m)))gate(c,'reports');
 const rows=await c.database.prepare("SELECT currency,name FROM records WHERE kind='cash-currency' ORDER BY currency").all();
 const merged=new Map(currencyDefaults.map(x=>[x.code,{code:x.code,name:x.name}]));
 rows.results.forEach((r:any)=>merged.set(r.currency,{code:r.currency,name:r.name}));
 const active=new URL(req.url).searchParams.get('scope')==='active';return json([...merged.values()].map(v=>({...v,active:!c.rawSettings.enabledCurrencies||c.rawSettings.enabledCurrencies.includes(v.code),default:v.code===(c.rawSettings.defaultCurrency||'EGP')})).filter(v=>!active||v.active));
})}
