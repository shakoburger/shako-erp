import {LayoutDashboard,BookOpen,UsersRound,Wallet,Landmark,BriefcaseBusiness,SlidersHorizontal,ChartNoAxesCombined,FileChartColumn,Ticket,Plane,FilePenLine,Undo2,Ban,IdCard,ConciergeBell,FileText,ArrowDownLeft,ArrowUpRight,ArrowLeftRight,Coins,Receipt,WalletCards,Plus,ArrowRight,SquareCheckBig,CalendarClock,Layers,Scale,MessageCircle,type LucideIcon} from 'lucide-react';

const icons:Record<string,LucideIcon>={
 supervisor:LayoutDashboard,'supervisor-page':LayoutDashboard,accounts:BookOpen,customers:UsersRound,cash:Wallet,banks:Landmark,employees:BriefcaseBusiness,control:SlidersHorizontal,
 'staged-ops':Layers,
 'total-balances':ChartNoAxesCombined,'management-reports':FileChartColumn,'customer-balances':UsersRound,'airline-balances':Plane,'bank-balances':Landmark,'cash-balances':WalletCards,'expense-balances':Receipt,
 'gds-tickets':Ticket,'ticket-edit':FilePenLine,visas:IdCard,services:ConciergeBell,invoice:FileText,'customer-reports':FileChartColumn,'economy-travel':Plane,'ticket-refund':Undo2,'ticket-cancel':Ban,
 'cash-account':WalletCards,'cash-payment':ArrowUpRight,'cash-receipt':ArrowDownLeft,'foreign-cash':Coins,'cash-currency':Coins,'cash-edit':FilePenLine,'cash-voucher':Receipt,
 'bank-account':Landmark,'bank-deposit':ArrowDownLeft,'bank-withdraw':ArrowUpRight,'bank-transfer':ArrowLeftRight,'bank-cheque-issue':FilePenLine,'bank-cheque-receive':SquareCheckBig,'bank-reports':FileChartColumn,'bank-reconciliation':Scale,
 'cheque-direct-issue':FilePenLine,'cheque-edit':FilePenLine,'cheque-deferred-issue':CalendarClock,'cheque-pass-issued':SquareCheckBig,'cheque-voucher':Receipt,back:ArrowRight,add:Plus,
 whatsapp:MessageCircle,'share-whatsapp':MessageCircle,
};
export function ERPIcon({name,size=24,className=''}:{name:string;size?:number;className?:string}){const Icon=icons[name]||FileText;return <Icon size={size} strokeWidth={1.7} className={className} aria-hidden="true"/>}
