import * as db from './storage';
import {waitForLocalWrites} from '../api';
interface Archive {format:'openfilm-browser-project';version:1;name:string;files:{path:string;type:string;data:string;sha256:string}[]}
const digest=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function exportArchive(id:string):Promise<Blob>{
  await waitForLocalWrites();
  const snapshot=await db.bundle(id),root=snapshot.root,assets=snapshot.files,entries=new Map(assets.map(f=>[f.path,f.blob]));
  for(const value of snapshot.projects){
    const prefix=value.prefix?value.prefix+'/':'';
    entries.set(`${prefix}film.html`,new Blob([value.text],{type:'text/html'}));
    entries.set(`${prefix}.film/settings.json`,new Blob([JSON.stringify(value.settings)],{type:'application/json'}));
    entries.set(`${prefix}.film/markers.json`,new Blob([JSON.stringify(snapshot.metadata.get(`markers:${value.id}`)??[])],{type:'application/json'}));
  }
  const probes:Record<string,unknown>={};
  for(const asset of assets){const facts=snapshot.metadata.get(`probe:${root.id}/${asset.path}`);if(facts)probes[asset.path]=facts;}
  entries.set('.film/browser-media.json',new Blob([JSON.stringify(probes)],{type:'application/json'}));
  const archive:Archive={format:'openfilm-browser-project',version:1,name:root.name,files:[]};
  for(const [path,blob] of entries){
    const bytes=await blob.arrayBuffer(),array=new Uint8Array(bytes);let binary='';
    for(let i=0;i<array.length;i+=32768)binary+=String.fromCharCode(...array.subarray(i,i+32768));
    archive.files.push({path,type:blob.type,data:btoa(binary),sha256:await digest(bytes)});
  }
  return new Blob([JSON.stringify(archive)],{type:'application/json'});
}
export async function importArchive(blob:Blob):Promise<db.LocalProject>{
  const archive=JSON.parse(await blob.text()) as Archive;
  if(archive?.format!=='openfilm-browser-project'||archive.version!==1||typeof archive.name!=='string'||!Array.isArray(archive.files))throw new Error('请选择工作台导出的 .openfilm.json 工程备份。');
  const entries=[];
  for(const item of archive.files){
    if(typeof item.path!=='string'||typeof item.data!=='string'||typeof item.sha256!=='string')throw new Error('工程备份内容不完整。');
    const bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));
    if(await digest(bytes.buffer)!==item.sha256)throw new Error(`文件校验失败：${item.path}`);
    entries.push({path:item.path,blob:new Blob([bytes],{type:item.type||'application/octet-stream'})});
  }
  return db.importProject(archive.name,entries);
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
