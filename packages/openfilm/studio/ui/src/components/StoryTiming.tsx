import * as React from 'react';
import {api,projectEvents,type Clip,type Film,type Op} from '@/api';
import {clipEnd,shotSequenceDuration,storyData} from '@/lib/story-content';
import {adoptSceneDuration} from '@/lib/story-timing';

export function SceneTiming({projectId,scene,film,write}:{projectId:string;scene:Clip;film:Film;write(ops:Op[],label:string):Promise<string|null>}) {
  const [actual,setActual]=React.useState<number|null>(null);
  const [error,setError]=React.useState('');
  const [confirm,setConfirm]=React.useState(false);
  const [pending,setPending]=React.useState(false);
  const folder=scene.src.replace(/\/film\.html(?:#.*)?$/,'');
  React.useEffect(()=>{
    let live=true,generation=0;
    setActual(null);setError('');setConfirm(false);
    const load=async()=>{const current=++generation;try{const result=await api.readPartFilm(projectId,folder);if(live&&current===generation){setActual(shotSequenceDuration(result.film));setError('');}}catch(reason){if(live&&current===generation)setError(reason instanceof Error?reason.message:String(reason));}};
    void load();
    const stop=projectEvents(projectId,event=>{if(event.type==='files'||event.type==='film')void load();});
    window.addEventListener('focus',load);
    return()=>{live=false;stop();window.removeEventListener('focus',load);};
  },[projectId,scene.id,folder]);
  const estimated=clipEnd(scene)-(scene.at??0);
  const different=actual!==null&&Math.abs(estimated-actual)>.0005;
  const partial=(scene.time?.[0] ?? 0)>0 || film.tracks.flatMap(track=>track.clips).some(clip=>clip.id!==scene.id && clip.src.split('#')[0]===scene.src.split('#')[0]);
  const locked=film.tracks.some(track=>track.locked&&track.clips.some(clip=>clip.id===scene.id));
  let operations:Op[]=[];
  if(actual && !locked && !partial)operations=adoptSceneDuration(film,scene,actual);
  const shifted=operations.filter(op=>op.op==='fields'&&op.clip!==scene.id);
  const others=new Map(film.tracks.flatMap(track=>track.clips.map(clip=>[clip.id,clip] as const)));
  return <section className="story-timing" aria-label="场次时长核对">
    <h3>场次时长核对</h3>
    <p>场次预估 {estimated.toFixed(1)} 秒 · 镜头实排 {actual===null?'读取中':actual.toFixed(1)+' 秒'}</p>
    {different&&<p className="story-review" role="status">{actual===0?'本场尚无镜头。':'预估与实排不一致，请核对。'}</p>}
    {error&&<p role="alert">{error}</p>}
    {different&&actual!==null&&actual>0&&!partial&&<button disabled={pending||locked} onClick={()=>setConfirm(value=>!value)}>采用镜头实排时长</button>}
    {confirm&&different&&actual!==null&&actual>0&&!partial&&<div className="story-timing-preview" aria-label="采用实排时长预览">
      <p>将本场从 {estimated.toFixed(1)} 秒改为 {actual.toFixed(1)} 秒。剧本节拍保持不动，冲突场次顺延；缩短时保留空隙。</p>
      {shifted.length>0?<ul>{shifted.map(op=>op.op==='fields'&&<li key={op.clip}>{storyData(others.get(op.clip)!)?.title??op.clip}：{(others.get(op.clip)?.at??0).toFixed(1)} → {Number(op.fields.at).toFixed(1)} 秒</li>)}</ul>:<p>不会移动其他场次。</p>}
      <button disabled={pending||locked} onClick={async()=>{setPending(true);try{if(!await write(operations,'采用镜头实排并顺延冲突场次'))setConfirm(false);}finally{setPending(false);}}}>确认采用实排时长</button><button onClick={()=>setConfirm(false)}>取消核对</button>
    </div>}
    {partial&&<small>本场使用了裁剪或共享的分镜片段，保留现有剪辑区间，不自动套用整段时长。</small>}
    {locked&&<small>场次划分轨道已锁定，解锁后可采用实排时长。</small>}
  </section>;
}
