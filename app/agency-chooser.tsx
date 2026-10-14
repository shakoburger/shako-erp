'use client';
import {useEffect,useState} from 'react';
import {Building2} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {api} from './erp-system';
import {toast} from 'sonner';
export function AgencyChooser({required=false}:{required?:boolean}){
 const [open,setOpen]=useState(required),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!open)return;let current=true;api('/api/agencies').then(b=>{if(current){setRows(b.agencies);setError('')}}).catch(e=>current&&setError(e.message));return()=>{current=false}},[open]);
 async function choose(id:string){setBusy(true);try{await api('/api/agencies',{method:'POST',body:JSON.stringify({agencyId:id})});window.location.assign('/')}catch(e:any){toast.error(e.message);setBusy(false)}}
 return <><button className="plain-button" aria-label="اختيار الوكالة" title="اختيار الوكالة" onClick={()=>setOpen(true)}><Building2 size={20}/>{required&&'اختيار الوكالة'}</button><Dialog open={open} onOpenChange={v=>!required&&setOpen(v)}><DialogContent dir="rtl"><DialogTitle>اختيار الوكالة</DialogTitle><DialogDescription>كل وكالة لها بيانات ومستخدمون مستقلون. احفظ مسودتك قبل التنقل.</DialogDescription>{error?<p role="alert">{error}</p>:!rows.length?<p>لا توجد وكالات مصرح بها لهذا الحساب.</p>:<div className="agency-choice-list">{rows.map(a=><button key={a.id} className="agency-choice" disabled={busy} onClick={()=>choose(a.id)}><Building2 size={20}/><strong>{a.name}</strong><small>{a.state==='active'?'متاحة':a.state==='archived'?'مؤرشفة':'موقوفة'}</small></button>)}</div>}</DialogContent></Dialog></>
}
