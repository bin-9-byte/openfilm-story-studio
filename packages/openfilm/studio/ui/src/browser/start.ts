/** The editor never mounts until local requests can be handled without a server. */
export async function startBrowser():Promise<void>{
  if(!window.isSecureContext||!('serviceWorker' in navigator)||!indexedDB)throw new Error('此浏览器不支持本机离线存储，请使用新版 Chrome、Edge 或 Safari，通过 HTTPS 打开。');
  await navigator.serviceWorker.register('/browser-sw.js',{type:'module',scope:'/',updateViaCache:'none'});
  await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('离线资源尚未就绪，请保持联网后刷新重试。')),60000))]);
  if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('离线服务启动超时，请刷新重试。')),15000);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
    if(navigator.serviceWorker.controller){clearTimeout(timer);resolve();}
  });
  // Optional protection against eviction; denial never prevents editing.
  void navigator.storage?.persist?.().catch(()=>false);
  try{if(!localStorage.getItem('openfilm.language'))localStorage.setItem('openfilm.language','zh-CN');}catch{/* optional */}
}
