import * as React from 'react';
import {ChevronDown,ChevronRight,MoreHorizontal,Plus,GripVertical} from 'lucide-react';
import type {Clip,Film,Op,StoryGroup} from '@/api';
import {clipEnd,storyData} from '@/lib/story-content';
import {storyTime} from '@/lib/story-overview';
import {addStoryGroup,assignStoryGroup,changeStoryGroup,initializeStructure,removeStoryGroup,reorderStoryGroup,sceneNumber,setSceneNumber,storyGroupPath} from '@/lib/story-structure';

const DRAG_TYPE='application/x-openfilm-outline';
type Props={projectId:string;film:Film;kind:'beat'|'scene';selectedId?:string;selectedIds:readonly string[];onSelect(clip:Clip):void;currentFilm():Film;settle():Promise<void>;write(ops:Op[],label:string):Promise<string|null>};
type Drag={projectId:string;ids:string[]};

/** The outline edits membership only. Timeline positions and shared writing stay untouched. */
export function StoryOutline({projectId,film,kind,selectedId,selectedIds,onSelect,currentFilm,settle,write}:Props) {
  const groups=film.storyStructure?.groups??[],members=film.storyStructure?.members??{};
  const clips=film.tracks.flatMap(t=>t.clips).filter(c=>storyData(c)?.kind===kind).sort((a,b)=>(a.at??0)-(b.at??0));
  const selected=clips.find(c=>c.id===selectedId),label=kind==='scene'?'场次':'故事卡';
  const [form,setForm]=React.useState<{kind:'act'|'sequence';parentId?:string}|null>(null),[name,setName]=React.useState('');
  const [menu,setMenu]=React.useState<string|null>(null),[rename,setRename]=React.useState<string|null>(null),[renameText,setRenameText]=React.useState('');
  const [move,setMove]=React.useState<{type:'group'|'clip';id:string}|null>(null),[numbering,setNumbering]=React.useState<string|null>(null),[number,setNumber]=React.useState('');
  const [closed,setClosed]=React.useState<Set<string>>(new Set()),[over,setOver]=React.useState<string|null>(null),[dragging,setDragging]=React.useState<string[]>([]);
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
  const list=React.useRef<HTMLDivElement>(null),live=React.useRef(true),noticeSnapshot=React.useRef<string|null>(null),scrollFrame=React.useRef<number|null>(null),scrollSpeed=React.useRef(0);
  React.useEffect(()=>{if(noticeSnapshot.current&&noticeSnapshot.current!==JSON.stringify(film.storyStructure)){setNotice('');noticeSnapshot.current=null;}},[film.storyStructure]);
  React.useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
  React.useEffect(()=>{live.current=true;return()=>{live.current=false;stopScroll();};},[]);
  React.useEffect(()=>{setForm(null);setMenu(null);setMove(null);setRename(null);setNumbering(null);setError('');setNotice('');setDragging([]);setOver(null);},[projectId]);
  React.useEffect(()=>{if(numbering&&numbering!==selectedId)setNumbering(null);},[selectedId]);
  React.useEffect(()=>{
    if(!selectedId)return;const group=groups.find(g=>g.id===members[selectedId]);
    setClosed(old=>{const next=new Set(old);next.delete(group?.id??'');if(group?.parentId)next.delete(group.parentId);return next;});
    const frame=requestAnimationFrame(()=>list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest'}));return()=>cancelAnimationFrame(frame);
  },[selectedId,members[selectedId??''],groups.find(g=>g.id===members[selectedId??''])?.parentId]);
  async function apply(build:(film:Film)=>Op[],message:string) {
    try{await settle();if(live.current){setBusy(true);setError('');}const ops=build(currentFilm());if(!ops.length)return false;const failure=await write(ops,message);if(failure)throw new Error(failure);if(live.current){noticeSnapshot.current=JSON.stringify(currentFilm().storyStructure);setNotice(message);}return true;}
    catch(reason){if(live.current)setError(reason instanceof Error?reason.message:String(reason));return false;}finally{if(live.current)setBusy(false);}
  }
  function stopScroll(){scrollSpeed.current=0;if(scrollFrame.current!==null)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=null;}
  function autoScroll(e:React.DragEvent) {
    if(!dragging.length||!e.dataTransfer.types.includes(DRAG_TYPE)||!list.current)return;
    const bounds=list.current.getBoundingClientRect(),edge=28;
    scrollSpeed.current=e.clientY<bounds.top+edge?-Math.min(12,Math.max(3,bounds.top+edge-e.clientY)):e.clientY>bounds.bottom-edge?Math.min(12,Math.max(3,e.clientY-bounds.bottom+edge)):0;
    if(!scrollSpeed.current){stopScroll();return;}
    if(scrollFrame.current!==null)return;
    const step=()=>{if(!list.current||!scrollSpeed.current){scrollFrame.current=null;return;}list.current.scrollTop+=scrollSpeed.current;scrollFrame.current=requestAnimationFrame(step);};scrollFrame.current=requestAnimationFrame(step);
  }
  function startCreate(kind:'act'|'sequence',parentId?:string){setMove(null);setRename(null);setNumbering(null);setForm({kind,parentId});setName('');setMenu(null);setError('');}
  function openMenu(id:string){setForm(null);setMove(null);setRename(null);setNumbering(null);setMenu(menu===id?null:id);}
  function toggle(id:string){setClosed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  function readDrag(e:React.DragEvent):Drag|null {
    try{const value=JSON.parse(e.dataTransfer.getData(DRAG_TYPE));return value.projectId===projectId&&Array.isArray(value.ids)&&value.ids.every((id:unknown)=>typeof id==='string')?value:null;}catch{return null;}
  }
  function dropZone(id:string) {
    return {onDragOver:(e:React.DragEvent)=>{if(busy||!e.dataTransfer.types.includes(DRAG_TYPE))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';setOver(id);},
      onDragLeave:(e:React.DragEvent)=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))setOver(null);},
      onDrop:(e:React.DragEvent)=>{e.preventDefault();e.stopPropagation();stopScroll();setOver(null);setDragging([]);const data=readDrag(e);if(!data||busy)return;void apply(f=>assignStoryGroup(f,data.ids,id),id?`已移入「${storyGroupPath(currentFilm(),id)}」`:'已移到未归组').then(ok=>{if(!ok||!live.current)return;setClosed(old=>{const next=new Set(old);next.delete(id);const parent=groups.find(g=>g.id===id)?.parentId;if(parent)next.delete(parent);return next;});const clip=clips.find(c=>c.id===(data.ids.includes(selectedId??'')?selectedId:data.ids[0]));if(clip)onSelect(clip);});}};
  }
  function renderClip(clip:Clip,index:number) {
    const current=members[clip.id],path=storyGroupPath(film,current),title=storyData(clip)?.title??'';
    return <div className={`outline-clip ${dragging.includes(clip.id)?'is-dragging':''}`} key={clip.id} data-outline-clip={clip.id}>
      <div role="button" tabIndex={0} className="outline-select" aria-label={`选择${label} · ${title}`} aria-current={selectedId===clip.id?'true':undefined} draggable={!busy}
        onDragStart={e=>{const ids=selectedIds.includes(clip.id)?clips.filter(c=>selectedIds.includes(c.id)).map(c=>c.id):[clip.id];e.dataTransfer.setData(DRAG_TYPE,JSON.stringify({projectId,ids}));e.dataTransfer.effectAllowed='move';setDragging(ids);setMenu(null);}}
        onDragEnd={()=>{stopScroll();setDragging([]);setOver(null);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onSelect(clip);}}} onClick={()=>onSelect(clip)}>
        <GripVertical size={12} className="outline-grip" aria-hidden/><span className="outline-number">{kind==='scene'?sceneNumber(film,clip):String(index+1).padStart(2,'0')}</span>
        <span className="studio-nav-copy"><strong>{title}</strong><small>{kind==='beat'?`${film.tracks.find(t=>t.clips.some(c=>c.id===clip.id))?.attrs?.title??'故事线'} · `:''}{storyTime(clip.at??0)} · {(clipEnd(clip)-(clip.at??0)).toFixed(1)} 秒</small><small className="outline-membership" data-outline-membership={clip.id}>{path}</small></span>
      </div>
      <button className="outline-more" aria-label={`管理${label} · ${title}`} aria-expanded={menu===clip.id} onClick={()=>openMenu(clip.id)}><MoreHorizontal size={14}/></button>
      {menu===clip.id&&<div className="outline-menu"><button onClick={()=>{setMove({type:'clip',id:clip.id});setMenu(null);}}>移动到…</button>{kind==='scene'&&<button onClick={()=>{onSelect(clip);setNumber(film.storyStructure?.sceneNumbers[clip.id]??'');setNumbering(clip.id);setMenu(null);}}>修改场号</button>}</div>}
    </div>;
  }
  function renderGroup(group:StoryGroup):React.ReactNode {
    const children=groups.filter(g=>g.parentId===group.id),own=clips.filter(c=>members[c.id]===group.id),ids=new Set([group.id,...children.map(g=>g.id)]);
    const count=clips.filter(c=>ids.has(members[c.id])).length,open=!closed.has(group.id);
    return <section key={group.id} className={`outline-folder ${group.parentId?'is-child':''} ${over===group.id?'is-drop-target':''}`} data-outline-group={group.id} {...dropZone(group.id)}>
      <div className="outline-folder-heading">
        <button className="outline-folder-toggle" aria-label={`${open?'收起':'展开'} · ${group.title}`} aria-expanded={open} onClick={()=>toggle(group.id)}>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<span>{group.title}</span><small>{count}</small></button>
        {group.kind==='act'&&<button className="outline-icon" aria-label={`在 ${group.title} 新增序列`} onClick={()=>startCreate('sequence',group.id)}><Plus size={13}/></button>}
        <button className="outline-icon" aria-label={`管理分组 · ${group.title}`} aria-expanded={menu===group.id} onClick={()=>openMenu(group.id)}><MoreHorizontal size={14}/></button>
      </div>
      {menu===group.id&&<div className="outline-menu" data-outline-menu={group.id}>
        <button onClick={()=>{setRename(group.id);setRenameText(group.title);setMenu(null);}}>重命名</button>
        {group.kind==='sequence'&&<button onClick={()=>{setMove({type:'group',id:group.id});setMenu(null);}}>移动到其他幕…</button>}
        <button disabled={busy} onClick={()=>void apply(f=>reorderStoryGroup(f,group.id,-1),'已上移分组')}>上移</button><button disabled={busy} onClick={()=>void apply(f=>reorderStoryGroup(f,group.id,1),'已下移分组')}>下移</button>
        <button disabled={busy} onClick={async()=>{if(await apply(f=>removeStoryGroup(f,group.id),'已删除分组，内容已保留'))setMenu(null);}}>删除分组，保留内容</button>
      </div>}
      {rename===group.id&&<form className="outline-inline-form" onSubmit={async e=>{e.preventDefault();if(await apply(f=>changeStoryGroup(f,group.id,{title:renameText}),'已重命名分组'))setRename(null);}}><input aria-label="分组名称" autoFocus value={renameText} onChange={e=>setRenameText(e.target.value)}/><div><button disabled={busy||!renameText.trim()}>保存名称</button><button type="button" onClick={()=>setRename(null)}>取消</button></div></form>}
      {open&&<div className="outline-folder-content">{own.map(renderClip)}{children.map(renderGroup)}{!own.length&&!children.length&&<p className="outline-empty-drop">把{label}拖到这里</p>}</div>}
    </section>;
  }
  const ungrouped=clips.filter(c=>!groups.some(g=>g.id===members[c.id]));
  const moving=move?.type==='clip'?clips.find(c=>c.id===move.id):undefined;
  const moveValue=move?.type==='group'?groups.find(g=>g.id===move.id)?.parentId??'':moving?members[moving.id]??'':'';
  return <aside className="studio-navigator story-outline" aria-label={`${label}目录`}>
    <div className="studio-navigator-heading"><h2>{label}</h2><span>{clips.length}</span></div>
    <div className="outline-create-actions"><button onClick={()=>startCreate('act')}><Plus size={13}/>幕</button><button onClick={()=>startCreate('sequence')}><Plus size={13}/>序列</button>
      {kind==='scene'&&!film.storyStructure&&clips.length>0&&<button disabled={busy} onClick={()=>void apply(initializeStructure,'已为现有场次编号')}>编场号</button>}
    </div>
    {form&&<form className="outline-inline-form" aria-label="新增分组" onSubmit={async e=>{e.preventDefault();const draft={...form};if(await apply(f=>addStoryGroup(f,{id:crypto.randomUUID(),kind:draft.kind,title:name,...(draft.parentId?{parentId:draft.parentId}:{})}),`已新增${draft.kind==='act'?'幕':'序列'}`))setForm(null);}}>
      <label>{form.kind==='act'?'新增幕':'新增序列'}<input aria-label="新分组名称" autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder={form.kind==='act'?'例如：第一幕 · 启程':'例如：收到来信'}/></label>
      {form.parentId&&<small>放在：{storyGroupPath(film,form.parentId)}</small>}<div><button disabled={busy||!name.trim()}>创建</button><button type="button" onClick={()=>setForm(null)}>取消</button></div>
    </form>}
    {move&&<div className="outline-inline-form" aria-label="移动分组或内容"><label>移动到<select aria-label="目标位置" value={moveValue} disabled={busy} onChange={async e=>{const target=e.currentTarget.value;const action={...move};if(await apply(f=>action.type==='group'?changeStoryGroup(f,action.id,{parentId:target||undefined}):assignStoryGroup(f,[action.id],target),'已移动到所选位置'))setMove(null);}}><option value="">{move.type==='group'?'独立序列':'未归组'}</option>{groups.filter(g=>move.type!=='group'||g.kind==='act').map(g=><option key={g.id} value={g.id}>{storyGroupPath(film,g.id)}</option>)}</select></label><button onClick={()=>setMove(null)}>取消移动</button></div>}
    <div className="studio-navigator-scroll" ref={list} onDragOverCapture={autoScroll} onDragLeave={e=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))stopScroll();}}>
      {groups.filter(g=>!g.parentId).map(renderGroup)}
      <section className={`outline-folder ${over===''?'is-drop-target':''}`} data-outline-ungrouped="" {...dropZone('')}><div className="outline-folder-heading"><button className="outline-folder-toggle" aria-expanded={!closed.has('')} onClick={()=>toggle('')}>{closed.has('')?<ChevronRight size={13}/>:<ChevronDown size={13}/>}<span>{groups.length?'未归组':'全部'+label}</span><small>{ungrouped.length}</small></button></div>{!closed.has('')&&ungrouped.map(renderClip)}{!closed.has('')&&!ungrouped.length&&<p className="outline-empty-drop">{groups.length?'拖到这里可移出分组':kind==='scene'?'点击右上角「新建空场次」':'点击右上角「新增故事卡」'}</p>}</section>
    </div>
    {selected&&<div className="outline-current" aria-label="当前归属"><strong>{kind==='scene'?`场号 ${sceneNumber(film,selected)}`:storyData(selected)?.title}</strong><span>{storyGroupPath(film,members[selected.id])}</span><div><button onClick={()=>setMove({type:'clip',id:selected.id})}>移动到…</button>{kind==='scene'&&<button onClick={()=>{setNumber(film.storyStructure?.sceneNumbers[selected.id]??'');setNumbering(numbering===selected.id?null:selected.id);}}>修改场号</button>}</div>
      {numbering===selected.id&&kind==='scene'&&<form onSubmit={async e=>{e.preventDefault();if(await apply(f=>setSceneNumber(f,selected,number),'已修改场号'))setNumbering(null);}}><input aria-label="场号" autoFocus value={number} onChange={e=>setNumber(e.target.value)} placeholder="例如 12A"/><button disabled={busy||!number.trim()}>保存场号</button></form>}
    </div>}
    {error&&<p className="outline-feedback is-error" role="alert">{error}</p>}{notice&&!error&&<p className="outline-feedback" role="status">{notice}</p>}
    <p className="studio-navigator-foot">把{label}拖进幕或序列即可归组。</p>
  </aside>;
}
