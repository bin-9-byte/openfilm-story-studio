import * as React from 'react';
import type {Clip,Film,Op} from '@/api';
import {addStoryGroup,assignStoryGroup,changeStoryGroup,initializeStructure,removeStoryGroup,reorderStoryGroup,sceneNumber,setSceneNumber,storyGroupPath,structureGroups} from '@/lib/story-structure';
import {storyData} from '@/lib/story-content';
import {Field} from './StoryField';

type Props={film:Film;currentFilm():Film;selectedIds:readonly string[];selected?:Clip;settle():Promise<void>;write(ops:Op[],label:string):Promise<string|null>};
export function StoryStructurePanel({film,currentFilm,selectedIds,selected,settle,write}:Props) {
  const [kind,setKind]=React.useState<'act'|'sequence'>('act'),[title,setTitle]=React.useState(''),[parent,setParent]=React.useState('');
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  async function apply(build:(film:Film)=>Op[],label:string) {
    try{await settle();setBusy(true);setError('');const ops=build(currentFilm());if(!ops.length)return false;const failure=await write(ops,label);if(failure){setError(failure);return false;}return true;}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));return false;}finally{setBusy(false);}
  }
  const activeIds=new Set(film.tracks.flatMap(t=>t.clips.map(c=>c.id)));
  const groups=structureGroups(film),acts=groups.filter(g=>g.kind==='act');
  const ids=selectedIds.length?selectedIds:selected?[selected.id]:[];
  return <details className="story-structure-panel" aria-label="幕与序列分组">
    <summary>幕／序列与场号 <small>{groups.filter(g=>g.kind==='act').length} 幕 · {groups.filter(g=>g.kind==='sequence').length} 序列</small></summary>
    <p className="studio-field-hint">分组仅整理结构，不改变时间、轨道和正文。幕数不限；序列可以归入某一幕或独立存在。</p>
    {!film.storyStructure&&<p><button disabled={busy} onClick={()=>void apply(initializeStructure,'固定现有场号')}>固定现有场号</button> 按当前时间顺序首次编号，之后移动、插入、删除均不重排。</p>}
    <div className="story-structure-create">
      <label>类型<select aria-label="新分组类型" value={kind} onChange={e=>setKind(e.target.value as 'act'|'sequence')}><option value="act">幕</option><option value="sequence">序列</option></select></label>
      <label>分组名称<input aria-label="新分组名称" value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==='act'?'例如：第一幕 · 启程':'例如：失约与追寻'}/></label>
      {kind==='sequence'&&<label>所属幕<select aria-label="新序列所属幕" value={parent} onChange={e=>setParent(e.target.value)}><option value="">独立序列</option>{acts.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>}
      <button disabled={busy||!title.trim()} onClick={async()=>{if(await apply(f=>addStoryGroup(f,{id:crypto.randomUUID(),kind,title,...(kind==='sequence'&&acts.some(g=>g.id===parent)?{parentId:parent}:{})}),'新增幕或序列'))setTitle('');}}>新增分组</button>
    </div>
    <label className="story-structure-assign">将所选 {ids.length} 个节拍／场次放入<select aria-label="所选内容分组" value="" disabled={busy||!ids.length} onChange={e=>{const id=e.target.value;if(id==='__none')void apply(f=>assignStoryGroup(f,ids,''),'移出结构分组');else if(id)void apply(f=>assignStoryGroup(f,ids,id),'设置内容结构分组');}}><option value="">选择目标分组…</option><option value="__none">未分组</option>{groups.map(g=><option key={g.id} value={g.id}>{storyGroupPath(film,g.id)}</option>)}</select></label>
    <div className="story-structure-groups">{groups.map(g=><details key={g.id} data-story-group={g.id}><summary>{g.kind==='act'?'幕':'序列'} · {storyGroupPath(film,g.id)} <small>{Object.entries(film.storyStructure?.members??{}).filter(([clipId,id])=>id===g.id&&activeIds.has(clipId)).length} 项</small></summary>
      <Field label={`分组名称 · ${g.title}`} value={g.title} onSave={title=>void apply(f=>changeStoryGroup(f,g.id,{title}),'重命名结构分组')}/>
      {g.kind==='sequence'&&<label>所属幕<select aria-label={`所属幕 · ${g.title}`} value={g.parentId??''} disabled={busy} onChange={e=>{const parentId=e.currentTarget.value||undefined;void apply(f=>changeStoryGroup(f,g.id,{parentId}),'调整序列所属幕');}}><option value="">独立序列</option>{acts.map(act=><option key={act.id} value={act.id}>{act.title}</option>)}</select></label>}
      <div className="story-actions"><button disabled={busy} onClick={()=>void apply(f=>reorderStoryGroup(f,g.id,-1),'上移结构分组')}>上移</button><button disabled={busy} onClick={()=>void apply(f=>reorderStoryGroup(f,g.id,1),'下移结构分组')}>下移</button><button disabled={busy} onClick={()=>void apply(f=>removeStoryGroup(f,g.id),'删除分组并保留内容')}>删除分组，保留内容</button></div>
    </details>)}</div>
    {selected&&storyData(selected)?.kind==='scene'&&<div className="story-scene-number" data-scene-number={sceneNumber(film,selected)}><Field label="稳定场号" value={film.storyStructure?.sceneNumbers[selected.id]??''} onSave={number=>void apply(f=>setSceneNumber(f,selected,number),'修改稳定场号')}/><p className="studio-field-hint">例如 S012、12A；全工程唯一。删除场次后保留号段，新增场次不会抢用旧号。</p></div>}
    {error&&<p role="alert" className="story-error">{error}</p>}
  </details>;
}
