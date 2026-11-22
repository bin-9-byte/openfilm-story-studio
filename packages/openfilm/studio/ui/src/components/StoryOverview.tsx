import * as React from 'react';
import {api,projectEvents,type Clip,type Film,type ProjectFilm} from '@/api';
import {beatEntries,clipEnd,confirmedSceneSources,sceneCandidates,shotBeatIds,shotSequenceDuration,storyData} from '@/lib/story-content';
import {groupedStoryClips,sceneNumber,storyGroupPath,structureGroups} from '@/lib/story-structure';
import {storyImageUrl} from '@/lib/story-media';
import {shotPresentation,storyPartFolder,storyReadingGroups,storyScenes,storyShots,storyTime} from '@/lib/story-overview';
import {locateStory,rememberStoryLocation,saveStoryPreference,storyPreference,type StoryView} from '@/lib/story-navigation';
import './StoryOverview.css';

type Root={id:string;film:Film;base:string;name:string};
type Part={film?:Film;error?:string};

export function StoryOverview({projectId,film,outer,mediaBase,projectName,focusedId,onLocalView,settle}:{
  projectId:string;film:Film;outer?:ProjectFilm['outer'];mediaBase:string;projectName:string;focusedId:string|null;onLocalView(view:StoryView):void;settle():Promise<void>;
}) {
  const [parent,setParent]=React.useState<Root|null>(null);
  const [rootError,setRootError]=React.useState('');
  const [refresh,setRefresh]=React.useState(0);
  const [parts,setParts]=React.useState<Map<string,Part>>(new Map());
  const [loadedRoot,setLoadedRoot]=React.useState<string|null>(null);
  const initialPosition=React.useRef(storyPreference(projectId));
  const [loading,setLoading]=React.useState(false);
  const [line,setLine]=React.useState('');
  const [structureFilter,setStructureFilter]=React.useState('');
  const [locating,setLocating]=React.useState('');
  const [error,setError]=React.useState('');
  const viewport=React.useRef<HTMLDivElement>(null);
  const restored=React.useRef(false);
  const root:Root|null=outer?parent:{id:projectId,film,base:mediaBase,name:projectName};
  React.useEffect(()=>{
    if(!outer){setParent(null);return;}
    let live=true;let stop=()=>{};
    const load=async()=>{try{
      let result=await api.film(outer.id);const seen=new Set<string>();
      while(result.outer){if(seen.has(result.project.id))throw new Error('工程父级关系异常。');seen.add(result.project.id);result=await api.film(result.outer.id);}
      if(live&&result.value){setParent({id:result.project.id,film:result.value,base:result.folder,name:result.project.name});setRootError('');}
      return result.project.id;
    }catch(reason){if(live)setRootError(reason instanceof Error?reason.message:String(reason));return null;}};
    void load().then(id=>{if(live&&id)stop=projectEvents(id,event=>{if(event.type==='film')void load();if(event.type==='files')setRefresh(value=>value+1);});});
    return()=>{live=false;stop();};
  },[projectId,outer?.id]);
  const rootId=root?.id,rootFilm=root?.film;
  React.useEffect(()=>{
    if(!rootId)return;
    return projectEvents(rootId,event=>{if(event.type==='files')setRefresh(value=>value+1);});
  },[rootId]);
  React.useEffect(()=>{
    if(!rootId||!rootFilm)return;
    let live=true;setLoading(true);
    const folders=[...new Set(storyScenes(rootFilm).map(storyPartFolder).filter((folder):folder is string=>Boolean(folder)))];
    void Promise.allSettled(folders.map(folder=>api.readPartFilm(rootId,folder))).then(results=>{
      if(!live)return;
      setParts(previous=>new Map(folders.map((folder,index)=>{
        const result=results[index];
        return [folder,result.status==='fulfilled'?{film:result.value.film}:{...previous.get(folder),error:result.reason instanceof Error?result.reason.message:String(result.reason)}];
      })));setLoadedRoot(rootId);setLoading(false);
    });
    return()=>{live=false;};
  },[rootId,rootFilm,refresh]);
  React.useEffect(()=>{
    if(loading||!root||loadedRoot!==root.id||restored.current)return;
    const pref=initialPosition.current;
    const frame=requestAnimationFrame(()=>{
      if(!viewport.current)return;
      viewport.current.scrollTop=pref?.scrollTop??0;
      if(pref?.anchor){const node=Array.from(viewport.current.querySelectorAll<HTMLElement>('[data-overview-anchor]')).find(el=>el.dataset.overviewAnchor===pref.anchor);node?.scrollIntoView({block:'nearest',inline:'nearest'});}
      restored.current=true;
    });
    return()=>cancelAnimationFrame(frame);
  },[rootId,loading,parts,projectId,loadedRoot]);
  function remember(anchor='') {
    if(root)saveStoryPreference(projectId,{view:'overview',rootId:root.id,anchor,scrollTop:viewport.current?.scrollTop??0});
  }
  async function locate(clip:Clip,scene?:Clip,view:StoryView='overview') {
    if(!root||locating)return;
    const anchor=scene?`shot:${scene.id}:${clip.id}`:storyData(clip)?.kind==='scene'?`scene:${clip.id}`:`beat:${clip.id}`;
    remember(anchor);setLocating(anchor);setError('');
    try{
      await settle();
      let targetProject=root.id,atMs=(clip.at??0)*1000;
      if(scene){rememberStoryLocation({projectId:root.id,rootId:root.id,clipId:scene.id,atMs:(scene.at??0)*1000,view:'overview',anchor,scrollTop:viewport.current?.scrollTop??0});const folder=storyPartFolder(scene);if(!folder)throw new Error('本场没有可打开的分镜工程。');const opened=await api.openPartFilm(root.id,folder);targetProject=opened.project.id;atMs=shotPresentation(scene,clip).localStart*1000;}
      const target={projectId:targetProject,rootId:root.id,clipId:clip.id,atMs,view,anchor,scrollTop:viewport.current?.scrollTop??0};
      if(targetProject===projectId)onLocalView(view);
      locateStory(target,projectId);
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setLocating('');}
  }
  if(!root)return <div className="story-overview"><p>{rootError||'正在读取完整故事…'}</p></div>;
  const chronologicalScenes=storyScenes(root.film);
  const scenes=groupedStoryClips(root.film,chronologicalScenes).filter(g=>!structureFilter||(structureFilter==='__ungrouped'&&g.id==='')||g.id===structureFilter||root.film.storyStructure?.groups.find(group=>group.id===g.id)?.parentId===structureFilter).flatMap(g=>g.clips);
  const groups=storyReadingGroups(root.film,line),lines=[...new Set(beatEntries(root.film).map(entry=>entry.line))];
  const allBeats=new Map(beatEntries(root.film).map(entry=>[entry.clip.id,entry]));
  const activePart=outer&&outer.id===root.id?`parts/${outer.folder}`:null;
  const partOf=(scene:Clip)=>{const folder=storyPartFolder(scene);return folder===activePart?{film}:folder?parts.get(folder):undefined;};
  const shotCount=scenes.reduce((count,scene)=>count+(partOf(scene)?.film?storyShots(partOf(scene)!.film!).length:0),0);
  return <div className="story-overview" aria-label="全片剧本与分镜总览" ref={viewport} onScroll={()=>{if(restored.current&&storyPreference(projectId)?.view==='overview')remember();}}>
    <header className="story-overview-head"><div><h2>全片总览 · {root.name}</h2><p>{beatEntries(root.film).length} 个节拍 · {scenes.length} 场 · {shotCount} 镜{loading?' · 正在读取镜头':''}</p></div>
      <div className="story-actions"><button onClick={()=>viewport.current?.querySelector('#story-reading')?.scrollIntoView({block:'start'})}>剧本串读</button><button onClick={()=>viewport.current?.querySelector('#story-boards')?.scrollIntoView({block:'start'})}>分镜总览</button><button onClick={()=>setRefresh(value=>value+1)}>刷新分镜</button></div>
      <p className="story-overview-location" role="status">当前轨道：{outer?`场内镜头 · ${scenes.find(scene=>storyPartFolder(scene)===activePart)&&storyData(scenes.find(scene=>storyPartFolder(scene)===activePart)!)?.title||projectName}`:'全片剧本与场次'}{focusedId?' · 已定位所选片段':''}。点击内容定位，编辑按钮进入原编辑器。</p>
      {(error||rootError)&&<p role="alert">{error||rootError}</p>}
    </header>
    <section id="story-reading" className="story-reading" aria-label="全片剧本串读">
      <div className="story-overview-section-title"><h2>剧本串读</h2><label>剧本线<select aria-label="串读剧本线" value={line} onChange={e=>setLine(e.target.value)}><option value="">全部剧本线</option>{lines.map(name=><option key={name}>{name}</option>)}</select></label></div>
      <p className="story-overview-hint">按全片呈现时间阅读；同起点的不同剧本线并列展示，正文保留原有段落。</p>
      {!groups.length&&<p>尚无节拍正文。旧版场次正文仍保留在下方对应场次。</p>}
      {groups.map(group=><div className="story-reading-group" key={group.at}><span className="story-reading-time">{storyTime(group.at)}</span><div className="story-reading-parallel">{group.entries.map(({clip,line})=><article key={clip.id} data-overview-anchor={`beat:${clip.id}`} data-overview-beat={clip.id} className={projectId===root.id&&focusedId===clip.id?'is-located':''}>
        <button className="story-reading-content" aria-label={`定位正文 · ${line} · ${storyData(clip)?.title}`} onClick={()=>void locate(clip)}><span className="story-reading-line">{line} · {storyTime(clip.at??0)}—{storyTime(clipEnd(clip))}</span><strong>{storyData(clip)?.title}</strong><span className="story-overview-body">{storyData(clip)?.description||'尚未填写正文'}</span></button>
        <button className="story-overview-edit" onClick={()=>void locate(clip,undefined,'script')} aria-label={`编辑正文 · ${storyData(clip)?.title}`}>编辑正文</button>
      </article>)}</div></div>)}
    </section>
    <section id="story-boards" className="story-boards" aria-label="全片分镜总览"><h2>场次与分镜</h2><label>结构分组<select aria-label="总览结构分组" value={structureFilter} onChange={e=>setStructureFilter(e.target.value)}><option value="">全部幕与序列</option>{structureGroups(root.film).map(g=><option key={g.id} value={g.id}>{storyGroupPath(root.film,g.id)}</option>)}<option value="__ungrouped">未分组</option></select></label>
      {!scenes.length&&<p>{structureFilter?'此分组暂无场次。':'尚未划分场次。剧本内容可先独立串读。'}</p>}
      {scenes.map((scene)=>{
        const data=storyData(scene)!,part=partOf(scene),shots=part?.film?storyShots(part.film):[];
        const confirmed=data.scriptSource==='confirmed',references=confirmed?confirmedSceneSources(root.film,scene):sceneCandidates(root.film,scene).map(entry=>({...entry,ref:null,changed:false}));
        return <article className="story-overview-scene" key={scene.id} data-overview-scene={scene.id} data-overview-anchor={`scene:${scene.id}`}>
          <header><div><span data-overview-scene-number={sceneNumber(root.film,scene)}>场号 {sceneNumber(root.film,scene)} · {storyTime(scene.at??0)}—{storyTime(clipEnd(scene))}</span><h3>{data.title}</h3><p className="story-group-path">{storyGroupPath(root.film,root.film.storyStructure?.members[scene.id])}</p><p>{data.place}</p><p>预估 {(clipEnd(scene)-(scene.at??0)).toFixed(1)} 秒 · 实排 {part?.film?shotSequenceDuration(part.film).toFixed(1)+' 秒':'待读取'} · {shots.length} 镜</p></div><div className="story-actions"><button aria-label={`定位场次 · ${data.title}`} onClick={()=>void locate(scene)}>定位场次</button><button onClick={()=>void locate(scene,undefined,'script')} aria-label={`编辑场次 · ${data.title}`}>编辑场次</button></div></header>
          {data.summary&&<p className="story-overview-body">{data.summary}</p>}
          {data.script&&<details open><summary>旧版场次正文</summary><button className="story-legacy-content story-overview-body" onClick={()=>void locate(scene)} aria-label={`定位场次正文 · ${data.title}`}>{data.script}</button></details>}
          <div className="story-overview-sources"><span>{confirmed?'已确认来源':'时间候选'}：</span>{references.map((entry,i)=>entry.clip?<button key={entry.clip.id} onClick={()=>void locate(entry.clip!)}>{entry.line} · {storyData(entry.clip)?.title}{entry.changed?' · 待核对':''}</button>:<span key={i} className="story-review">来源已删除 · {entry.ref?.title}</span>)}{!references.length&&<span>暂无来源</span>}</div>
          {part?.error&&<p role="alert">分镜读取失败：{part.error}{part.film?'（显示上次读取内容）':''}。可点击「刷新分镜」重试。</p>}
          {!part?.film&&!part?.error&&<p>{storyPartFolder(scene)?'正在读取本场镜头…':'本场尚无独立分镜工程。'}</p>}
          {part?.film&&!shots.length&&<p className="story-overview-empty">本场尚无镜头，可从「编辑场次」进入分镜新增。</p>}
          {shots.length>0&&<div className="story-overview-shots">{shots.map((shot,shotIndex)=>{
            const shotData=storyData(shot)!,projection=shotPresentation(scene,shot),image=shotData.image??(/\.(png|jpe?g|webp|gif|avif)(?:#.*)?$/i.test(shot.src)?shot.src:undefined);
            const base=new URL(storyPartFolder(scene)+'/',root.base).href;
            return <section key={shot.id} className={projectId!==root.id&&activePart===storyPartFolder(scene)&&focusedId===shot.id?'is-located':''} data-overview-shot={`${scene.id}:${shot.id}`} data-overview-anchor={`shot:${scene.id}:${shot.id}`}>
              <button className="story-overview-shot-content" disabled={Boolean(locating)} aria-label={`定位镜头 · ${data.title} · ${shotData.title}`} onClick={()=>void locate(shot,scene)}>
                {image?<img alt={shotData.title} src={storyImageUrl(image,base)} loading="lazy"/>:<div className="story-overview-no-image">暂无画面</div>}
                <span className="story-overview-shot-number">{String(shotIndex+1).padStart(2,'0')} · {shotData.title}</span>
                <span className="story-overview-hint">场内 {storyTime(shot.at??0)} · {(clipEnd(shot)-(shot.at??0)).toFixed(1)} 秒{projection.globalStart!==null?` · 全片 ${storyTime(projection.globalStart)}`:' · 超出场次排期'}{projection.clipped?' · 场次使用局部':''}</span>
                <span className="story-overview-body">{shotData.description||'尚未填写镜头描述'}</span><span>{[shotData.framing,shotData.movement].filter(Boolean).join(' · ')}</span>
              </button>
              <p className="story-overview-shot-beats">关联节拍：{shotBeatIds(shot).map(id=>allBeats.get(id)?storyData(allBeats.get(id)!.clip)?.title:`已删除 · ${id}`).join(' / ')||'尚未关联'}</p>
              {shotData.notes&&<details><summary>镜头备注</summary><p className="story-overview-body">{shotData.notes}</p></details>}
              <button className="story-overview-edit" aria-label={`编辑分镜 · ${data.title} · ${shotData.title}`} onClick={()=>void locate(shot,scene,'board')}>编辑分镜</button>
            </section>;
          })}</div>}
        </article>;
      })}
    </section>
  </div>;
}
