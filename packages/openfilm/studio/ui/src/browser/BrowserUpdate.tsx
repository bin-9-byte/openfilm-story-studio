import {useEffect,useState} from 'react';
import {waitForLocalWrites} from '../api';
/** Updates are explicit so a deployment never reloads an author in the middle of a draft. */
export function BrowserUpdate(){
  const [registration,setRegistration]=useState<ServiceWorkerRegistration|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let alive=true,reg:ServiceWorkerRegistration|undefined;
    const check=()=>{if(alive&&reg)setReady(Boolean(reg.waiting));};
    const installing=()=>{reg?.installing?.addEventListener('statechange',check);};
    void navigator.serviceWorker.getRegistration().then(value=>{reg=value;if(!alive||!reg)return;setRegistration(reg);check();reg.addEventListener('updatefound',installing);});
    return()=>{alive=false;reg?.removeEventListener('updatefound',installing);};
  },[]);
  if(!ready)return null;
  const apply=async()=>{
    setBusy(true);setError('');
    try{
      await new Promise(resolve=>setTimeout(resolve,32));await waitForLocalWrites();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(document.querySelector('[data-save-state="dirty"],[data-save-state="error"],[data-save-state="saving"]'))throw new Error('还有内容尚未保存，请先完成保存后更新。');
      if(!registration?.waiting)throw new Error('新版本尚未就绪，请稍后再试。');
      navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});registration.waiting.postMessage({type:'apply-update'});
    }catch(reason){setError((reason as Error).message);setBusy(false);}
  };
  return <aside className="browser-update" role="status"><span>{error||'新版本已准备好，更新后工程仍保留在本机。'}</span><button disabled={busy} onClick={()=>void apply()}>{busy?'正在更新…':'保存并更新'}</button></aside>;
}
