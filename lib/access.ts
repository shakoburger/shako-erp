import {moduleLabels,type ModuleKey} from './domain';
export type ModuleAccess='none'|'view'|'manage';
export type AgencyRole='admin'|'accountant'|'booking'|'viewer'|'custom';
export type Access={role:AgencyRole;modules:Record<ModuleKey,ModuleAccess>;manageSettings:boolean;manageUsers:boolean;export:boolean;backup:boolean};
export const roleLabels:Record<AgencyRole,string>={admin:'مدير الوكالة',accountant:'محاسب',booking:'موظف حجوزات',viewer:'عرض فقط',custom:'صلاحيات مخصصة'};
export function roleAccess(role:AgencyRole):Access{
 if(role==='admin'){
  return {
   role:'admin',
   modules:{supervisor:'manage',accounts:'manage',customers:'manage',cash:'manage',banks:'manage',employees:'manage',control:'manage',tickets:'manage',reports:'manage',stagedOps:'manage'},
   manageSettings:true,manageUsers:true,export:true,backup:true
  };
 }
 if(role==='accountant'){
  return {
   role:'accountant',
   modules:{supervisor:'manage',accounts:'manage',customers:'manage',cash:'manage',banks:'manage',reports:'manage',tickets:'view',stagedOps:'view',employees:'none',control:'none'},
   manageSettings:false,manageUsers:false,export:true,backup:false
  };
 }
 if(role==='booking'){
  return {
   role:'booking',
   modules:{tickets:'manage',customers:'manage',stagedOps:'manage',reports:'view',supervisor:'none',accounts:'none',cash:'none',banks:'none',employees:'none',control:'none'},
   manageSettings:false,manageUsers:false,export:false,backup:false
  };
 }
 return {
  role:'viewer',
  modules:{supervisor:'view',accounts:'view',customers:'view',cash:'view',banks:'view',employees:'none',control:'none',tickets:'view',reports:'view',stagedOps:'view'},
  manageSettings:false,manageUsers:false,export:false,backup:false
 };
}
export function parseAccess(value:unknown,role:AgencyRole='viewer'):Access{
 const fallback=roleAccess(role);if(!value||typeof value!=='object')return fallback;
 const v=value as any;return {...fallback,modules:Object.fromEntries(Object.keys(moduleLabels).map(m=>[m,['none','view','manage'].includes(v.modules?.[m])?v.modules[m]:fallback.modules[m as ModuleKey]])) as Access['modules'],manageSettings:v.manageSettings===true,manageUsers:v.manageUsers===true,export:v.export===true,backup:v.backup===true};
}
