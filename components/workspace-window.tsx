'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {RefreshCw,Minus,Maximize2,Minimize2,X} from 'lucide-react';
export const WorkspaceWindow=createContext({active:true,refreshKey:'',expanded:false,minimize:()=>{},toggle:()=>{}});
export const useWorkspaceWindow=()=>useContext(WorkspaceWindow);
export function WindowControls({refresh,close}:{refresh:()=>void;close:()=>void}){const w=useWorkspaceWindow();return <div><button type="button" aria-label="تحديث" onClick={refresh}><RefreshCw size={18}/></button><button type="button" aria-label="تصغير" onClick={w.minimize}><Minus size={18}/></button><button type="button" aria-label={w.expanded?'استعادة الحجم':'تكبير'} onClick={w.toggle}>{w.expanded?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button><button type="button" aria-label="إغلاق" onClick={close}><X size={18}/></button></div>}
