export class RequestError extends Error {
 constructor(message:string,public status:number){super(message);this.name='RequestError'}
}

export async function requestJSON(path:string,init:RequestInit={},timeoutMs=init.method&&init.method!=='GET'?45000:12000):Promise<any>{
 const writing=!['GET','HEAD'].includes((init.method||'GET').toUpperCase());
 const uncertain='تعذر تأكيد نتيجة العملية. حدّث السجل وتحقق منها قبل إعادة الحفظ.';
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeoutMs);
 try{
  const res=await fetch(path,{...init,signal:controller.signal,headers:{'Content-Type':'application/json',...init.headers}});
  const raw=await res.text();let data:any;
  try{data=raw?JSON.parse(raw):{}}catch{throw new RequestError(writing?uncertain:'تعذر قراءة رد الخادم. أعد المحاولة.',res.status>=400?res.status:502)}
  if(!res.ok)throw new RequestError(data.error||'تعذر تنفيذ العملية',res.status);
  return data;
 }catch(e:any){
  if(controller.signal.aborted){if(init.signal?.aborted)throw new RequestError('أُلغي طلب التحميل',499);throw new RequestError(writing?uncertain:'الخادم المحلي لا يستجيب في الوقت المحدد. أعد المحاولة.',504)}
  if(e instanceof RequestError)throw e;
  throw new RequestError(writing?uncertain:'تعذر الاتصال بالخادم المحلي. تأكد من تشغيله ثم أعد المحاولة.',503);
 }finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort)}
}
