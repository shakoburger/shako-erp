export const moduleLabels = {supervisor:'المشرف',accounts:'الحسابات',customers:'العملاء',cash:'النقد',banks:'البنوك',employees:'الموظفين',control:'التحكم',tickets:'التذاكر',reports:'التقارير',stagedOps:'العمليات المعلقة'};
export type ModuleKey = keyof typeof moduleLabels;
export type StagedFieldKey = 'person'|'code'|'date'|'currency'|'airline'|'route'|'class'|'sellingPrice'|'supplierPrice'|'penalties'|'refundComm'|'treasury'|'crossCurrency'|'notes'|'attachment';
export type Settings = {systemName:string;companyName:string;phones:string;supportPhone?:string;displayAmount:number;licenseAmount:number;financialYear:number;globalLocked:boolean;lockReason:string;paymentStatus:'paid'|'unpaid'|'partial';modules:Record<ModuleKey,boolean>;agencyEmail?:string;address?:string;website?:string;taxNumber?:string;reportFooter?:string;logoKey?:string;logoData?:string;enabledCurrencies?:string[];defaultCurrency?:string;postingLockedUntil?:string;sessionHours?:number;ownerBackupAllowed?:boolean;stagedOpsFields?:Record<string,boolean>;branches?:import('./branches').Branch[]};
export const defaults:Settings={systemName:'SHAKO',companyName:'وكالة SHAKO للسفر والسياحة',phones:'0100000000',supportPhone:'01556849413',displayAmount:300000,licenseAmount:300000,financialYear:2026,globalLocked:false,lockReason:'تم إيقاف النظام مؤقتًا بسبب عدم السداد. يرجى التواصل مع إدارة النظام.',paymentStatus:'unpaid',modules:Object.fromEntries(Object.keys(moduleLabels).map(k=>[k,true])) as Record<ModuleKey,boolean>,stagedOpsFields:{person:true,code:true,date:true,currency:true,airline:true,route:true,class:true,sellingPrice:true,supplierPrice:true,penalties:true,refundComm:true,treasury:true,crossCurrency:true,notes:true,attachment:true},branches:[{id:'main',name:'الفرع الرئيسي',code:'HQ',isMain:true}]};
export const kinds:Record<string,{label:string;module:ModuleKey;financial?:boolean}>={customer:{label:'دليل العملاء',module:'customers'},account:{label:'دليل الحسابات',module:'accounts'},cash:{label:'حركة النقد',module:'cash',financial:true},bank:{label:'حركة البنوك',module:'banks',financial:true},employee:{label:'الموظفون',module:'employees'},expense:{label:'المصروفات',module:'accounts'},service:{label:'الخدمات',module:'customers',financial:true},visa:{label:'التأشيرات',module:'customers',financial:true},invoice:{label:'الفواتير المبدئية',module:'customers'},ticket:{label:'التذاكر',module:'tickets',financial:true},'staged-op':{label:'العمليات المعلقة',module:'stagedOps'}};
export type RecordRow={id:string;kind:string;module:ModuleKey;code:string;name:string;date:string;currency:string;amount:number;payload:Record<string,any>;createdAt:string;updatedAt:string};
export const airlines: string[] = [];
export const currencies=['EGP','USD','AED','SDG'];
export const money=(minor:number)=>((minor||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Cairo'});
export function moduleEnabled(s:Settings,m:ModuleKey){return !s.globalLocked && (s.modules?.[m] ?? true) && (m!=='tickets'||(s.modules?.customers ?? true))}
export function getEndOfMonth(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.toISOString().slice(0, 10);
}

export function getEndOfNextMonth(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysDiff(targetDateStr: string, fromDateStr: string): number {
  const target = new Date(targetDateStr + 'T00:00:00Z').getTime();
  const from = new Date(fromDateStr + 'T00:00:00Z').getTime();
  return Math.ceil((target - from) / (1000 * 60 * 60 * 24));
}

export type AgencySubscription = {
  feeMinor: number;
  fee: number;
  currency: string;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paidOn: string;
  dueOn: string;
  state: 'active' | 'suspended' | 'archived';
  graceDays: number;
  graceDeadline: string;
  inGracePeriod: boolean;
  daysRemaining: number;
  isOverdue: boolean;
  isAutoLocked: boolean;
  lockReason?: string;
};

export function evaluateSubscription(agency: {
  fee_minor?: number;
  currency?: string;
  payment_status?: string;
  paid_on?: string;
  due_on?: string;
  state?: string;
}, options?: {
  graceDays?: number;
  autoLock?: boolean;
}): AgencySubscription {
  const feeMinor = Number(agency.fee_minor || 0);
  const currency = agency.currency || 'USD';
  const paymentStatus = (agency.payment_status || 'unpaid') as 'paid' | 'partial' | 'unpaid';
  const state = (agency.state || 'active') as 'active' | 'suspended' | 'archived';
  const paidOn = agency.paid_on || '';
  const currentDate = today();
  const dueOn = agency.due_on || getEndOfMonth(currentDate);
  const graceDays = options?.graceDays ?? 5;
  const autoLock = options?.autoLock ?? true;
  const graceDeadline = addDays(dueOn, graceDays);

  let inGracePeriod = false;
  let daysRemaining = 0;
  let isOverdue = false;
  let isAutoLocked = false;
  let lockReason: string | undefined = undefined;

  if (paymentStatus !== 'paid') {
    if (currentDate > dueOn) {
      isOverdue = true;
      if (currentDate <= graceDeadline) {
        inGracePeriod = true;
        daysRemaining = Math.max(0, daysDiff(graceDeadline, currentDate));
      } else {
        if (autoLock) {
          isAutoLocked = true;
          lockReason = 'تم إيقاف النظام آلياً لانتهاء فترة السماح (' + graceDays + ' أيام) بعد تاريخ ' + dueOn + ' لعدم سداد الاشتراك بقيمة ' + money(feeMinor) + ' ' + currency + '. يرجى مراجعة إدارة المنصة للتفعيل بعد السداد.';
        }
      }
    }
  }

  return {
    feeMinor,
    fee: feeMinor / 100,
    currency,
    paymentStatus,
    paidOn,
    dueOn,
    state,
    graceDays,
    graceDeadline,
    inGracePeriod,
    daysRemaining,
    isOverdue,
    isAutoLocked,
    lockReason
  };
}
