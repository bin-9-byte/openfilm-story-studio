/** The editor never mounts until local requests can be handled without a server. */
export async function startBrowser():Promise<void>{
  if(!window.isSecureContext||!('serviceWorker' in navigator)||!indexedDB)throw new Error('此浏览器不支持本机离线存储，请使用新版 Chrome、Edge 或 Safari，通过 HTTPS 打开。');
  const progress=(event:MessageEvent)=>{
    if(event.data?.type!=='openfilm-install-progress')return;
    const root=document.getElementById('root');if(root)root.textContent=`正在准备离线工作台… ${event.data.done} / ${event.data.total}`;
  };
  navigator.serviceWorker.addEventListener('message',progress);
  try{
    await navigator.serviceWorker.register('/browser-sw.js',{type:'module',scope:'/',updateViaCache:'none'});
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('离线资源尚未就绪，请保持联网后刷新重试。')),60000);
      void navigator.serviceWorker.ready.then(()=>{clearTimeout(timer);resolve();},reject);
    });
    if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('离线服务启动超时，请刷新重试。')),15000);
      navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
      if(navigator.serviceWorker.controller){clearTimeout(timer);resolve();}
    });
  }finally{navigator.serviceWorker.removeEventListener('message',progress);}
  // Optional protection against eviction; denial never prevents editing.
  void navigator.storage?.persist?.().catch(()=>false);
  try{if(!localStorage.getItem('openfilm.language'))localStorage.setItem('openfilm.language','zh-CN');}catch{/* optional */}
}
