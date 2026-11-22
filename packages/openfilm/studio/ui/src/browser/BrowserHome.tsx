import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {go,openProject} from '../lib/navigate';
import * as db from './storage';
import {download,exportArchive,importArchive} from './archive';
import './browser.css';

export function BrowserActions({projectId}:{projectId:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const exportProject=async()=>{if(busy)return;setBusy(true);setError('');try{const p=await db.project(projectId),root=await db.project(p.rootId);download(await exportArchive(projectId),`${root.name}.openfilm.json`);}catch(reason){setError(String((reason as Error).message));}finally{setBusy(false);}};
  return <div className="browser-actions"><button onClick={()=>go('/')}>本机工程</button><span title="工程与素材仅保存在当前浏览器，不上传服务器">● 离线就绪</span><button disabled={busy} onClick={()=>void exportProject()}>{busy?'正在导出…':'导出工程'}</button>{error&&<span role="alert">{error}</span>}</div>;
}
export function BrowserHome(){
  const [projects,setProjects]=useState<db.LocalProject[]>([]),[name,setName]=useState('未命名剧本'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const archiveInput=useRef<HTMLInputElement>(null),folderInput=useRef<HTMLInputElement>(null);
  const refresh=()=>void db.allProjects().then(values=>setProjects(values.filter(p=>!p.outer).sort((a,b)=>b.openedAt-a.openedAt)),reason=>setError(String(reason)));
  useEffect(()=>{refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  async function run(job:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await job();}catch(reason){setError((reason as Error).message??String(reason));}finally{setBusy(false);refresh();}}
  return <main className="browser-home">
    <header><span className="browser-brand">剧本与分镜</span><span className="browser-local-state">● 本机存储 · 离线就绪</span></header>
    <section className="browser-welcome"><p className="browser-eyebrow">剧本导演工作台</p><h1>从一个故事开始</h1><p>先写故事线，再划分场次、设计分镜。时间轴与撤销操作保持一致。</p>
      <div className="browser-create"><label><span>工程名称</span><input aria-label="工程名称" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void run(async()=>openProject((await api.newProject(name)).id));}}/></label><button className="browser-primary" disabled={busy} onClick={()=>void run(async()=>openProject((await api.newProject(name)).id))}>新建工程</button></div>
      <div className="browser-import"><button disabled={busy} onClick={()=>archiveInput.current?.click()}>导入工程备份</button><button disabled={busy} onClick={()=>folderInput.current?.click()}>导入 OpenFilm 文件夹</button><span>工程和素材留在此浏览器，无需启动本机服务。</span></div>
      <input ref={archiveInput} type="file" hidden accept=".json,.openfilm.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>openProject((await importArchive(file)).id));}}/>
      <input ref={folderInput} type="file" hidden multiple {...{webkitdirectory:''}} onChange={e=>{const list=[...(e.target.files??[])];e.target.value='';if(list.length)void run(async()=>{const root=list[0].webkitRelativePath.split('/')[0];const p=await db.importProject(root,list.map(file=>({path:file.webkitRelativePath.slice(root.length+1),blob:file})));openProject(p.id);});}}/>
      {busy&&<p role="status">正在处理本机工程，请稍候…</p>}{error&&<p className="browser-error" role="alert">{error}</p>}
    </section>
    <section className="browser-projects"><div className="browser-projects-heading"><h2>我的工程</h2><span>{projects.length} 个</span></div>
      {!projects.length?<div className="browser-empty">还没有工程。新建剧本，或导入已有工程继续创作。</div>:<div className="browser-project-grid">{projects.map(p=><article key={p.id}><button className="browser-project-open" onClick={()=>openProject(p.id)}><strong>{p.name}</strong><span>{p.film.tracks.filter(t=>t.attrs?.['data-story-track']==='beat').length} 条故事线 · {p.film.tracks.flatMap(t=>t.clips).filter(c=>{try{return JSON.parse(c.attrs?.['data-story']??'{}').kind==='scene';}catch{return false;}}).length} 场</span></button><div><button disabled={busy} onClick={()=>void run(async()=>download(await exportArchive(p.id),`${p.name}.openfilm.json`))}>导出备份</button><button disabled={busy} onClick={()=>{if(confirm(`删除「${p.name}」及其本机素材？此操作不能撤销。`))void run(()=>db.deleteProject(p.id));}}>删除</button></div></article>)}</div>}
    </section>
    <footer>数据保存在当前设备的此浏览器内。清除网站数据会删除工程，请定期导出备份。首次加载完成后，可断网重新打开并继续创作。</footer>
  </main>;
}
