import type { Film, Project, ProjectSettings } from '../api';
import { applyOps } from '../../../server/ops.mjs';
import { filmHtml, readFilmFile } from '../../../../src/film-doc.mjs';
import type { Op } from '../api';
import {browserMediaFacts} from './media-facts';

export interface LocalProject {
  id: string; rootId: string; prefix: string; name: string; openedAt: number;
  text: string; film: Film; rev: string; settings: ProjectSettings;
  outer?: { id: string; name: string; folder: string; kind: 'part' };
}
export interface LocalFile { key: string; rootId: string; path: string; blob: Blob; mtime: number }
const DATABASE = 'openfilm-story-browser-v1';
let opening: Promise<IDBDatabase> | undefined;
export function database(): Promise<IDBDatabase> {
  return opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' });
      const files = request.result.createObjectStore('files', { keyPath: 'key' });
      files.createIndex('rootId', 'rootId');
      request.result.createObjectStore('meta');
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening=undefined; }; resolve(request.result); };
    request.onerror = () => { opening=undefined; reject(request.error); };
    request.onblocked = () => reject(new Error('请关闭其他旧版工作台标签页后重试。'));
  });
}
export function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error??new Error('本机保存未完成。'));transaction.onerror=()=>reject(transaction.error);});
}
export async function allProjects(): Promise<LocalProject[]> {return result((await database()).transaction('projects').objectStore('projects').getAll());}
export async function project(id: string): Promise<LocalProject> {
  const value=await result<LocalProject|undefined>((await database()).transaction('projects').objectStore('projects').get(id));
  if(!value)throw Object.assign(new Error('本机未找到这个工程，请从工程列表打开或导入备份。'),{status:404});
  return value;
}
export function publicProject(value:LocalProject):Project {return {id:value.id,name:value.name,path:`本机浏览器/${value.name}`,openedAt:value.openedAt,missing:false};}
export function pathIn(prefix: string, input: string): string {
  if (/^(?:[a-z]+:|\/|\\)/i.test(input) || input.includes('\0')) throw new Error('工程文件路径无效。');
  const parts:string[]=[];
  for(const part of `${prefix}/${input}`.replaceAll('\\','/').split('/')) {
    if(!part||part==='.')continue;
    if(part==='..'){if(!parts.length)throw new Error('文件路径超出工程范围。');parts.pop();}
    else parts.push(part);
  }
  return parts.join('/');
}
export const newRevision=()=>crypto.randomUUID();
export async function saveProject(value:LocalProject):Promise<void> {
  const tx=(await database()).transaction('projects','readwrite');tx.objectStore('projects').put(value);await committed(tx);
}
export async function newProject(name='未命名剧本',film?:Film):Promise<LocalProject> {
  const id=crypto.randomUUID();
  const value:LocalProject={id,rootId:id,prefix:'',name:name.trim()||'未命名剧本',openedAt:Date.now(),
    film:film??{stage:{w:1920,h:1080},tracks:[
      {attrs:{title:'A 线','data-story-track':'beat','data-story-track-id':'a'},clips:[]},
      {attrs:{title:'B 线','data-story-track':'beat','data-story-track-id':'b'},clips:[]},
      {attrs:{title:'场次划分','data-story-track':'scene','data-story-track-id':'scenes'},clips:[]},
    ]},text:'',rev:newRevision(),settings:{fps:30}};
  value.text=filmHtml(value.film);await saveProject(value);return value;
}
/** Read, compare revision, apply the complete operation and persist in one IDB transaction.
 * Two tabs cannot overwrite each other's committed edit. A stale caller must refresh. */
export async function changeProject(id:string,change:(current:LocalProject)=>LocalProject):Promise<LocalProject> {
  const tx=(await database()).transaction('projects','readwrite'),store=tx.objectStore('projects');
  const done=committed(tx);let next:LocalProject|undefined,failure:unknown;
  const request=store.get(id);
  request.onsuccess=()=>{try{const current=request.result as LocalProject|undefined;
    if(!current)throw Object.assign(new Error('工程已删除。'),{status:404});
    next=change(current);store.put(next);
  }catch(error){failure=error;tx.abort();}};
  try{await done;}catch(error){throw failure??error;}return next!;
}
export function editProject(id:string,base:string|null,ops:Op[]):Promise<LocalProject> {
  return changeProject(id,current=>{
    if(base&&base!==current.rev)throw Object.assign(new Error('另一标签页已修改这个工程，请重新载入后继续。'),{status:409,code:'conflict'});
    const film=applyOps(structuredClone(current.film),ops) as Film;
    return {...current,film,text:filmHtml(film,current.text),rev:newRevision()};
  });
}
export async function files(rootId:string):Promise<LocalFile[]> {return result((await database()).transaction('files').objectStore('files').index('rootId').getAll(rootId));}
export async function file(rootId:string,path:string):Promise<LocalFile|undefined> {return result((await database()).transaction('files').objectStore('files').get(`${rootId}/${path}`));}
export async function putFile(rootId:string,path:string,blob:Blob):Promise<void> {
  const tx=(await database()).transaction('files','readwrite');tx.objectStore('files').put({key:`${rootId}/${path}`,rootId,path,blob,mtime:Date.now()} satisfies LocalFile);await committed(tx);
}
export async function deleteFile(rootId:string,path:string):Promise<void>{const tx=(await database()).transaction('files','readwrite');tx.objectStore('files').delete(`${rootId}/${path}`);await committed(tx);}
export async function meta<T>(key:string,fallback:T):Promise<T> {return (await result<T|undefined>((await database()).transaction('meta').objectStore('meta').get(key)))??fallback;}
export async function putMeta(key:string,value:unknown):Promise<void>{const tx=(await database()).transaction('meta','readwrite');tx.objectStore('meta').put(value,key);await committed(tx);}
/** One read transaction keeps a backup's film references and asset set consistent across tabs. */
export async function bundle(id:string){
  const tx=(await database()).transaction(['projects','files','meta']),done=committed(tx);
  const [projects,assets,keys,values]=await Promise.all([
    result<LocalProject[]>(tx.objectStore('projects').getAll()),result<LocalFile[]>(tx.objectStore('files').getAll()),
    result(tx.objectStore('meta').getAllKeys()),result(tx.objectStore('meta').getAll()),
  ]);await done;
  const selected=projects.find(p=>p.id===id);if(!selected)throw new Error('工程不存在。');
  return {root:projects.find(p=>p.id===selected.rootId)!,projects:projects.filter(p=>p.rootId===selected.rootId),files:assets.filter(f=>f.rootId===selected.rootId),metadata:new Map(keys.map((key,index)=>[String(key),values[index]]))};
}
export function parseFilm(text:string):Film {
  const parsed=readFilmFile(text);
  if(!parsed.doc)throw new Error(`工程格式无效：${parsed.problems.join('；')}`);
  return parsed.value as Film;
}
/** Import is all-or-nothing. Original files, including unreferenced media used by redo, are retained. */
export async function importProject(name:string,entries:{path:string;blob:Blob}[]):Promise<LocalProject> {
  const byPath=new Map<string,Blob>();
  for(const entry of entries){const path=pathIn('',entry.path);if(byPath.has(path))throw new Error('工程中存在重复路径。');byPath.set(path,entry.blob);}
  const main=byPath.get('film.html');if(!main)throw new Error('请选择包含 film.html 的完整工程文件夹。');
  const id=crypto.randomUUID(),projects:LocalProject[]=[];
  for(const [path,blob] of byPath)if(path==='film.html'||/^parts\/.+\/film\.html$/.test(path)) {
    const text=await blob.text(),prefix=path==='film.html'?'':path.slice(0,-10);
    const settingsFile=byPath.get(`${prefix?prefix+'/':''}.film/settings.json`);
    const settings=settingsFile?JSON.parse(await settingsFile.text()) as ProjectSettings:{fps:30};
    if(!settings||typeof settings!=='object'||(settings.fps!=null&&(!(settings.fps>0)||!Number.isFinite(settings.fps))))throw new Error('工程的帧率设置无效。');
    projects.push({id:prefix?crypto.randomUUID():id,rootId:id,prefix,name:prefix?prefix.split('/').pop()!:name,
      openedAt:Date.now(),film:parseFilm(text),text,rev:newRevision(),settings,
      ...(prefix?{outer:{id,name,folder:prefix.replace(/^parts\//,''),kind:'part' as const}}:{})});
  }
  const markers=new Map<string,unknown>();
  for(const value of projects){const blob=byPath.get(`${value.prefix?value.prefix+'/':''}.film/markers.json`);if(blob){const parsed=JSON.parse(await blob.text());if(!Array.isArray(parsed))throw new Error('工程标记格式无效。');markers.set(`markers:${value.id}`,parsed);}}
  const probeFile=byPath.get('.film/browser-media.json');
  const probes:Record<string,Record<string,unknown>>=probeFile?JSON.parse(await probeFile.text()):{};
  for(const [path,blob] of byPath)if(/\.(mp4|mov|webm|m4v|mp3|wav|m4a|ogg|aac|flac)$/i.test(path)&&!probes[path])probes[path]=await browserMediaFacts(new File([blob],path,{type:blob.type}));
  const tx=(await database()).transaction(['projects','files','meta'],'readwrite');
  for(const value of projects)tx.objectStore('projects').put(value);
  for(const [path,blob] of byPath)tx.objectStore('files').put({key:`${id}/${path}`,rootId:id,path,blob,mtime:Date.now()});
  for(const [key,value] of markers)tx.objectStore('meta').put(value,key);
  for(const [path,facts] of Object.entries(probes))tx.objectStore('meta').put(facts,`probe:${id}/${pathIn('',path)}`);
  await committed(tx);return projects.find(value=>value.id===id)!;
}
export async function deleteProject(id:string):Promise<void> {
  const current=await project(id),rootId=current.rootId;
  const [related,assets]=await Promise.all([allProjects(),files(rootId)]);
  const tx=(await database()).transaction(['projects','files'],'readwrite');
  for(const value of related)if(value.rootId===rootId)tx.objectStore('projects').delete(value.id);
  for(const value of assets)tx.objectStore('files').delete(value.key);
  await committed(tx);
}
