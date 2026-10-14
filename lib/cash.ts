import {currencies} from './domain';
export const currencyDefaults=currencies.map(code=>({code,name:({EGP:'جنيه مصري',USD:'دولار أمريكي',AED:'درهم إماراتي',SDG:'جنيه سوداني'} as Record<string,string>)[code],rate:1}));
export const cashTitles:Record<string,string>={account:'إضافة حساب نقد',currency:'إضافة عملة',payment:'صرف نقد',receipt:'إستلام نقد',forex:'شراء النقد الأجنبي','edit-payment':'تعديل صرف نقد','edit-receipt':'تعديل إستلام نقد','edit-forex':'تعديل شراء النقد الأجنبي','print-payment':'إيصال صرف نقد','print-receipt':'إيصال إستلام نقد','print-forex':'إيصال شراء نقد أجنبي',balances:'إجمالي أرصدة النقد'};
export const cashTypeLabel=(type:string)=>cashTitles[type]||type;
export const cashMinor=(value:number)=>Math.round((value+Number.EPSILON)*100);
