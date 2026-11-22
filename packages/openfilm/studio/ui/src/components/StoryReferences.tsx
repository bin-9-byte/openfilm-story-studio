import * as React from 'react';
import type {Clip,Film,Op} from '@/api';
import {beatEntries,clipEnd,confirmedSceneSources,confirmSceneSources,sceneCandidates,shotBeatIds,sourceRefs,storyData,storyFields} from '@/lib/story-content';
type Write=(ops:Op[],label:string)=>Promise<string|null>;

export function SceneReferences({film,scene,write,onSelect,renderText}:{film:Film;scene:Clip;write:Write;onSelect(id:string):void;renderText(clip:Clip):React.ReactNode}) {
  const pinned=storyData(scene)?.scriptSource==='confirmed';
  const refs=confirmedSceneSources(film,scene),candidates=sceneCandidates(film,scene);
  const [draft,setDraft]=React.useState<string[]|null>(null);
  const [pending,setPending]=React.useState(false);
  React.useEffect(()=>{setDraft(null);},[scene.id]);
  const locked=film.tracks.some(track=>track.locked && track.clips.some(clip=>clip.id===scene.id));
  const review=refs.some(ref=>!ref.clip||ref.changed);
  const acknowledge=async(ids:readonly string[])=>{
    setPending(true);
    try{if(!await write([confirmSceneSources(film,scene,ids)],pinned?'确认场次剧本来源':'固定场次剧本来源'))setDraft(null);}
    finally{setPending(false);}
  };
  return <section className="story-source-list" aria-label="场次引用正文">
    <h3>{pinned?'已确认的剧本来源':'按时间范围预览剧本来源'}</h3>
    <p>{pinned?'节拍移动后仍保留来源。正文修改同步显示；位置或内容变化会提示核对。':'旧版按时间引用尚未固定。确认后，移动节拍不会使来源消失。'}</p>
    {review && <p role="alert" className="story-review">剧本来源待核对：内容、时间已变化，或来源被删除。</p>}
    {!pinned && <button disabled={pending||locked} onClick={()=>void acknowledge(candidates.map(entry=>entry.clip.id))}>固定当前来源</button>}
    {pinned && <div className="story-actions"><button disabled={pending||locked} onClick={()=>setDraft(sourceRefs(scene).map(ref=>ref.id))}>编辑来源关联</button>
      {review && <button disabled={pending||locked} onClick={()=>void acknowledge(sourceRefs(scene).map(ref=>ref.id))}>确认已核对</button>}</div>}
    {draft && <div className="story-reference-picker" aria-label="选择场次来源">
      <p>勾选具体节拍；取消勾选会解除来源引用，不删除正文。</p>
      {beatEntries(film).map(({clip,line})=><label key={clip.id}><input type="checkbox" checked={draft.includes(clip.id)} onChange={e=>setDraft(e.target.checked?[...draft,clip.id]:draft.filter(id=>id!==clip.id))}/>{line} · {storyData(clip)?.title}</label>)}
      {refs.filter(ref=>!ref.clip).map(({ref})=><label key={ref.id}><input type="checkbox" checked={draft.includes(ref.id)} onChange={e=>setDraft(e.target.checked?[...draft,ref.id]:draft.filter(id=>id!==ref.id))}/>来源已删除 · {ref.title}</label>)}
      <div className="story-actions"><button onClick={()=>setDraft(candidates.map(entry=>entry.clip.id))}>按当前范围选择候选</button><button disabled={pending||locked} onClick={()=>void acknowledge(draft)}>保存来源关联</button><button onClick={()=>setDraft(null)}>取消</button></div>
    </div>}
    {(pinned?refs:candidates.map(entry=>({...entry,ref:null,changed:false,outside:false}))).map(entry=>{
      const clip=entry.clip;
      if(!clip)return <section key={entry.ref!.id} data-missing-source={entry.ref!.id}><strong>来源已删除 · {entry.ref!.title}</strong><p className="story-source-body">{entry.ref!.description}</p><small>以上为上次确认内容，未自动替换来源。恢复节拍或编辑来源关联后再核对。</small></section>;
      const crosses=(clip.at??0)<(scene.at??0)||clipEnd(clip)>clipEnd(scene);
      return <section key={clip.id} data-source-beat={clip.id}><strong>{entry.line} · {storyData(clip)?.title}</strong>
        {crosses&&<small>跨场节拍 · 展示完整内容</small>}{entry.outside&&<small>已移出场次时间范围 · 保留已确认来源</small>}{entry.changed&&<small>来源已变化 · 待核对</small>}
        {renderText(clip)}<button onClick={()=>onSelect(clip.id)}>定位来源节拍</button></section>;
    })}
    {pinned&&!refs.length&&<p>尚未关联剧本节拍，可通过「编辑来源关联」选择。</p>}
    {!pinned&&!candidates.length&&<p>当前时间范围没有节拍。</p>}
    {pinned&&<small>当前时间范围另有 {candidates.filter(entry=>!sourceRefs(scene).some(ref=>ref.id===entry.clip.id)).length} 个未关联候选；不会自动替换已确认来源。</small>}
  </section>;
}

export function ShotBeatLinks({shot,parent,write,disabled=false}:{shot:Clip;parent:Film|null;write:Write;disabled?:boolean}) {
  const ids=shotBeatIds(shot),entries=parent?beatEntries(parent):[];
  const [draft,setDraft]=React.useState<string[]|null>(null);
  const [pending,setPending]=React.useState(false);
  React.useEffect(()=>setDraft(null),[shot.id]);
  return <details className="story-shot-links" data-shot-links={shot.id}>
    <summary>关联节拍 · {ids.length} 个</summary>
    {ids.map(id=>{const entry=entries.find(entry=>entry.clip.id===id);return <div key={id} className="story-linked-beat">{entry?<><strong>{entry.line} · {storyData(entry.clip)?.title}</strong><p>{storyData(entry.clip)?.description||'此节拍尚未填写正文。'}</p></>:<p>{parent?'来源节拍已删除':'正在读取来源'} · {id}</p>}</div>;})}
    {!ids.length&&<p>可关联多个节拍，同一镜头可同时服务 A/B 线。</p>}
    <button disabled={disabled||pending||!parent} onClick={()=>setDraft([...ids])}>选择关联节拍</button>
    {draft&&<div className="story-reference-picker" aria-label={`镜头关联节拍 · ${storyData(shot)?.title}`}>
      {entries.map(({clip,line})=><label key={clip.id}><input type="checkbox" checked={draft.includes(clip.id)} onChange={e=>setDraft(e.target.checked?[...draft,clip.id]:draft.filter(id=>id!==clip.id))}/>{line} · {storyData(clip)?.title}</label>)}
      {ids.filter(id=>!entries.some(entry=>entry.clip.id===id)).map(id=><label key={id}><input type="checkbox" checked={draft.includes(id)} onChange={e=>setDraft(e.target.checked?[...draft,id]:draft.filter(item=>item!==id))}/>已删除来源 · {id}</label>)}
      <button disabled={disabled||pending} onClick={async()=>{setPending(true);try{if(!await write([storyFields(shot,{beatIds:draft})],'关联镜头与剧本节拍'))setDraft(null);}finally{setPending(false);}}}>保存镜头关联</button><button onClick={()=>setDraft(null)}>取消</button>
    </div>}
  </details>;
}
