import {context,handled,json,agencyAbility} from '@/lib/server';
export async function GET(){return handled(async()=>{const c=await context();agencyAbility(c,'export');return json({ok:true})})}
