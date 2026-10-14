import {context,handled,json} from '@/lib/server';
import {agencyAccess} from '@/lib/platform';
import {defaults} from '@/lib/domain';
import {roleAccess} from '@/lib/access';

export async function GET(){
  return handled(async()=>{
    const a=await agencyAccess();
    if(!a.agencyId)return json({agencySelectionRequired:true,agencies:a.choices,settings:{...defaults,displayAmount:0,licenseAmount:0},revision:0,owner:a.owner,access:roleAccess('viewer'),user:{name:a.user.displayName,email:a.user.email}});
    const c=await context({allowPasswordPending:true,allowSuspended:true});
    return json({
      settings:c.settings,
      revision:c.revision,
      owner:c.owner,
      access:c.access,
      passwordRequired:false,
      passwordChangeRequired:false,
      passwordMissing:false,
      agency:{id:c.agency.id,name:c.agency.name},
      subscription:c.subscription,
      user:{name:c.user.displayName,email:c.user.email}
    });
  });
}
