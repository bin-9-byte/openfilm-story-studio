/// <reference lib="webworker" />
import {localResponse} from './local-api';
const worker=globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE=`openfilm-story-shell-${import.meta.env.VITE_BROWSER_BUILD}`;
worker.addEventListener('message',event=>{if(event.data?.type==='apply-update')event.waitUntil(worker.skipWaiting());});
const notify=async(path:string,event:unknown)=>{
  for(const client of await worker.clients.matchAll({type:'window'}))client.postMessage({type:'openfilm-local-event',path,event});
};
worker.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const manifest=await fetch('/browser-precache.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('离线清单无法读取。');return r.json();}) as {files:string[]};
    const cache=await caches.open(CACHE);
    // Atomic install: a partial shell is never advertised as offline-ready.
    try{await cache.addAll(manifest.files);}catch(error){await caches.delete(CACHE);throw error;}
  })());
});
worker.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys())if(name.startsWith('openfilm-story-shell-')&&name!==CACHE)await caches.delete(name);
    await worker.clients.claim();
  })());
});
worker.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==worker.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/browser-media/')){
    event.respondWith(localResponse(request,notify));return;
  }
  if(request.method!=='GET')return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(request.mode==='navigate')return (await cache.match('/index.html'))??fetch(request);
    return (await cache.match(url.pathname))??fetch(request);
  })());
});
