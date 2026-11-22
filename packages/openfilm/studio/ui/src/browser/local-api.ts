import * as db from './storage';
import plugins from './plugins.json';
import { filmHtml } from '../../../../src/film-doc.mjs';
import type { Film, Op } from '../api';

export type Notify=(path:string,event:unknown)=>Promise<void>;
const json=(body:unknown,status=200)=>Response.json(body,{status});
const emptyFilm=():Film=>({stage:{w:1920,h:1080},tracks:[{attrs:{title:'场内镜头','data-story-track':'shot'},clips:[]}]});
export const kindOf=(path:string)=>/\.(png|jpg|jpeg|svg|webp|gif|avif|bmp)$/i.test(path)?'image':/\.(mp4|webm|mov|m4v|ogv)$/i.test(path)?'video':/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path)?'audio':/\.html?$/i.test(path)?'page':'other';
const relative=(prefix:string,path:string)=>{
  const from=prefix.split('/').filter(Boolean),to=path.split('/');let i=0;while(from[i]&&from[i]===to[i])i++;
  return [...from.slice(i).map(()=>'..'),...to.slice(i)].join('/');
};
export function snapshot(p:db.LocalProject,origin:string){return {project:db.publicProject(p),folder:`${origin}/browser-media/${p.rootId}/${p.prefix?p.prefix+'/':''}`,text:p.text,rev:p.rev,value:p.film,doc:p.film,problems:[],...(p.outer?{outer:p.outer}:{})};}
async function asset(p:db.LocalProject,path:string){const value=await db.file(p.rootId,db.pathIn(p.prefix,path));if(!value)throw Object.assign(new Error('素材文件不存在。'),{status:404});return value;}
async function rawFile(p:db.LocalProject,path:string):Promise<Blob>{
  const full=db.pathIn(p.prefix,path);
  const child=(await db.allProjects()).find(v=>v.rootId===p.rootId&&`${v.prefix?v.prefix+'/':''}film.html`===full);
  if(child)return new Blob([child.text],{type:'text/html'});
  return (await asset(p,path)).blob;
}
async function localMedia(request:Request,p:db.LocalProject,path:string):Promise<Response>{
  const blob=await rawFile(p,path),headers=new Headers({'content-type':blob.type||'application/octet-stream','accept-ranges':'bytes','cache-control':'no-store','x-content-type-options':'nosniff'});
  headers.set('content-security-policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:");
  // Imported project HTML is data; it never executes with access to the editor's origin.
  if(/\.html?$/i.test(path)){headers.set('content-type','text/plain; charset=utf-8');headers.set('content-security-policy',"sandbox; default-src 'none'");}
  const range=request.headers.get('range');
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416,headers});
    const start=match[1]?Number(match[1]):Math.max(0,blob.size-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(blob.size-1,Number(match[2])):blob.size-1;
    if(start>end||start>=blob.size){headers.set('content-range',`bytes */${blob.size}`);return new Response(null,{status:416,headers});}
    headers.set('content-range',`bytes ${start}-${end}/${blob.size}`);headers.set('content-length',String(end-start+1));
    return new Response(blob.slice(start,end+1),{status:206,headers});
  }
  headers.set('content-length',String(blob.size));return new Response(request.method==='HEAD'?null:blob,{headers});
}
const prefs={proxies:{on:false,height:720},seenVersion:'0.4.1',projectsFolder:null,autoVersions:false,libraryCategories:{order:['media'],off:['voice','captions','cover','coverPicture','template','sound','music','text','sticker','filter','effect','transition','plugin']}};
export async function localResponse(request:Request,notify:Notify):Promise<Response>{
 try {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,''),method=request.method;
  if(url.pathname.startsWith('/browser-media/')){
    const [, ,rootId,...parts]=decodeURIComponent(url.pathname).split('/');
    return await localMedia(request,await db.project(rootId),parts.join('/'));
  }
  const rawUpload=method==='PUT'&&/^projects\/[^/]+\/files$/.test(path);
  const body=method==='GET'||method==='HEAD'||rawUpload?null:request.headers.get('content-type')?.includes('application/json')?await request.json():null;
  if(path==='browser/projects')return json((await db.allProjects()).map(p=>({id:p.id,folder:snapshot(p,url.origin).folder})));
  if(path==='browser/probe'){
    const src=new URL(url.searchParams.get('src')??'',url.origin),parts=decodeURIComponent(src.pathname).split('/');
    if(src.origin!==url.origin||parts[1]!=='browser-media')throw new Error('素材地址无效。');
    return json(await db.meta(`probe:${parts[2]}/${db.pathIn('',parts.slice(3).join('/'))}`,{}));
  }
  if(path==='health')return json({product:'openfilm-browser',version:'0.4.1-browser',home:'browser',filmOrigin:url.origin});
  if(path==='version')return json({version:'0.4.1',latest:null,newer:false,checkedAt:null,checking:false,source:false});
  if(path==='get/pending')return json({runs:[]});
  if(path==='library/added'||path==='library/favorites'){
    if(method==='PUT')await db.putMeta(path,body.ids??[]);return json({ids:await db.meta(path,[])});
  }
  if((path==='plugins'||path==='plugin-order')&&method==='GET')return json(plugins);
  if(path==='prefs'){if(method==='PATCH')await db.putMeta('prefs',{...await db.meta('prefs',prefs),...body});return json(await db.meta('prefs',prefs));}
  if(path==='projects'){
    if(method==='POST'){const p=await db.newProject(body?.name);await notify('events',{type:'projects'});return json({project:db.publicProject(p)});}
    return json({projects:(await db.allProjects()).filter(p=>!p.outer).sort((a,b)=>b.openedAt-a.openedAt).map(db.publicProject)});
  }
  const match=/^projects\/([^/]+)(?:\/(.*))?$/.exec(path);
  if(match){
    const id=decodeURIComponent(match[1]),action=match[2]??'',p=await db.project(id),events=`projects/${id}/events`;
    const writeActions=['PATCH:','DELETE:','POST:opened','POST:edit','POST:films','POST:films/open','PUT:files','DELETE:files','PUT:page','PATCH:settings','PUT:markers','PUT:canvas','POST:caption-tracks/sync'];
    if(method!=='GET'&&!writeActions.includes(`${method}:${action}`)&&!(method==='PUT'&&action.startsWith('canvas/')))return json({error:'这个操作需要本机 Node 版，浏览器版未执行此修改。'},501);
    if(!action){
      if(method==='DELETE'){await db.deleteProject(id);await notify(events,{type:'gone'});return json({});}
      if(method==='PATCH'){const next=await db.changeProject(id,current=>({...current,name:String(body.name).trim()||current.name}));await notify(events,{type:'project',project:db.publicProject(next)});return json({project:db.publicProject(next)});}
      return json(snapshot(p,url.origin));
    }
    if(action==='opened'){const next=await db.changeProject(id,current=>({...current,openedAt:Date.now()}));return json({project:db.publicProject(next)});}
    if(action==='edit'){
      const edited=await db.editProject(id,body.base,body.ops as Op[]);
      await notify(events,{type:'film',rev:edited.rev});
      return json({text:edited.text,rev:edited.rev,value:edited.film,doc:edited.film,rebased:false});
    }
    if(action==='films'&&method==='POST'){
      const folder=`parts/${crypto.randomUUID()}`,prefix=db.pathIn(p.prefix,folder),film=body.film??emptyFilm();
      const child:db.LocalProject={id:crypto.randomUUID(),rootId:p.rootId,prefix,name:body.name??'新场次',openedAt:Date.now(),film,text:filmHtml(film),rev:db.newRevision(),settings:{fps:p.settings.fps??30},outer:{id,name:p.name,folder:folder.slice(6),kind:'part'}};
      await db.saveProject(child);await notify(events,{type:'files'});return json({folder});
    }
    if(action==='films'||action==='films/open'){
      const prefix=db.pathIn(p.prefix,body?.folder??url.searchParams.get('folder')??'');
      let child=(await db.allProjects()).find(v=>v.rootId===p.rootId&&v.prefix===prefix);
      if(!child){const blob=await db.file(p.rootId,`${prefix}/film.html`);if(!blob)throw Object.assign(new Error('场次工程不存在。'),{status:404});
        const text=await blob.blob.text();child={...p,id:crypto.randomUUID(),prefix,name:prefix.split('/').pop()!,film:db.parseFilm(text),text,rev:db.newRevision(),outer:{id,name:p.name,folder:prefix.replace(/^parts\//,''),kind:'part'}};await db.saveProject(child);}
      return json(action==='films'?{film:child.film}:{project:db.publicProject(child)});
    }
    if(action==='files'&&method==='PUT'){
      const path=url.searchParams.get('path');if(!path)throw new Error('缺少素材文件名。');
      let destination=path;
      for(let n=2;await db.file(p.rootId,db.pathIn(p.prefix,destination));n++)destination=path.replace(/(\.[^/.]+)?$/,`-${n}$1`);
      const blob=await request.blob(),full=db.pathIn(p.prefix,destination);await db.putFile(p.rootId,full,blob);
      const facts=request.headers.get('x-local-media-facts');if(facts)await db.putMeta(`probe:${p.rootId}/${full}`,JSON.parse(facts));
      await notify(events,{type:'files'});return json({path:destination});
    }
    if(action==='files'&&method==='DELETE'){await db.deleteFile(p.rootId,db.pathIn(p.prefix,url.searchParams.get('path')??''));await notify(events,{type:'files'});return json({});}
    if(action==='files'){
      const entries=(await db.files(p.rootId)).filter(f=>!f.path.split('/').some(part=>part.startsWith('.')));
      const known=new Map(entries.map(f=>[f.path,{path:relative(p.prefix,f.path),kind:kindOf(f.path),size:f.blob.size,mtime:f.mtime}]));
      for(const child of await db.allProjects())if(child.rootId===p.rootId){const path=`${child.prefix?child.prefix+'/':''}film.html`;known.set(path,{path:relative(p.prefix,path),kind:'page',size:child.text.length,mtime:child.openedAt});}
      const listed=[...known.values()];return json({files:listed,folders:[...new Set(listed.flatMap(f=>f.path.includes('/')?[f.path.slice(0,f.path.lastIndexOf('/'))]:[]))],pages:listed.filter(f=>f.kind==='page'),links:{},made:[]});
    }
    if(action==='page'){
      const path=String(body?.path??url.searchParams.get('path')??'');
      if(method==='PUT'){if(body.text===null)await db.deleteFile(p.rootId,db.pathIn(p.prefix,path));else await db.putFile(p.rootId,db.pathIn(p.prefix,path),new Blob([body.text],{type:'text/html'}));await notify(events,{type:'files'});return json({rev:db.newRevision()});}
      return json({text:await (await rawFile(p,path)).text(),rev:p.rev});
    }
    if(action==='settings'){const next=method==='PATCH'?await db.changeProject(id,current=>({...current,settings:{...current.settings,...body}})):p;return json({settings:next.settings});}
    if(action==='markers'){const key=`markers:${id}`;if(method==='PUT')await db.putMeta(key,body.markers??body);return json({markers:await db.meta(key,[])});}
    if(action==='media'){
      const what=url.searchParams.get('what'),path=url.searchParams.get('path')??'';
      if(what==='probe'){
        const saved=await db.meta<Record<string,unknown>|null>(`probe:${p.rootId}/${db.pathIn(p.prefix,path)}`,null);if(saved)return json(saved);
        if(kindOf(path)==='image'){const bitmap=await createImageBitmap((await asset(p,path)).blob);const facts={width:bitmap.width,height:bitmap.height,audio:false};bitmap.close();return json(facts);}
        return json({audio:false});
      }
      if(what==='poster'||what==='frame'){
        if(kindOf(path)==='image')return localMedia(request,p,path);
        const child=(await db.allProjects()).find(v=>v.rootId===p.rootId&&`${v.prefix}/film.html`===db.pathIn(p.prefix,path));
        const clip=child?.film.tracks.flatMap(t=>t.clips).find(c=>kindOf(c.src)==='image');
        if(clip&&child)return localMedia(request,child,clip.src);
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#24262b"/><text x="160" y="95" text-anchor="middle" fill="#a7b1b7" font-size="18">分镜 / 素材</text></svg>',{headers:{'content-type':'image/svg+xml'}});
      }
      if(what==='waveform')return json({peaks:[],duration:0});
    }
    if(action==='files/made')return json({made:{}});
    if(action==='files/missing')return json({missing:[]});
    if(action==='proxies')return json({on:false,height:720,states:{},checks:{}});
    if(action==='preview-cache')return json({late:[],ranges:[]});
    if(action==='captions')return json({cues:[],sourceLanguage:null,languages:[],untranscribed:[]});
    if(action==='caption-tracks/sync')return json({});
    if(action==='covers')return json({covers:[],main:null,looks:{version:1,groups:[],items:[]},made:{}});
    if(action==='exports')return json({exports:[]});
    if(action==='history')return json({status:{head:null,branch:'browser',changes:null},versions:[],more:false,deletedCount:0});
    if(action==='canvas'||action.startsWith('canvas/')){const key=`${id}:${action}`;if(method==='PUT')await db.putMeta(key,body);return json(await db.meta(key,{nodes:[],edges:[]}));}
    if(action==='canvases')return json({boards:[]});
  }
  const readOnly:Record<string,unknown>={
    skills:{catalog:{},skills:[]},examples:{examples:[]},library:{version:1,groups:{},items:[],packs:[]},
    'library/voices':{version:1,providers:[],voices:[]},'saved/star':{paths:[]},'saved/places':{places:[],shelf:[],hidden:[]},
    providers:{providers:[],signingIn:null,use:null,model:null,custom:[],librarySearch:false},'get/pending':{runs:[]},'canvas-templates':{templates:[]},
    'diagnostics/problems':{problems:[]},'project-folders':{folders:[]},fonts:{fonts:[]},
  };
  if(method==='GET'&&path in readOnly)return json(readOnly[path]);
  return json({error:'这个功能需要本机 Node 服务，浏览器版暂不提供。'},501);
 }catch(error){const e=error as Error&{status?:number;code?:string};return json({error:e.message||'本机保存失败，请检查浏览器存储空间。',code:e.code},e.status??400);}
}
