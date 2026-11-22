import * as React from 'react';
import type {Clip,Film,Op} from '@/api';
import {clipEnd,storyData} from '@/lib/story-content';
import {storyTime} from '@/lib/story-overview';
import {StoryOutline} from './StoryOutline';

type Props={projectId:string;film:Film;kind:'beat'|'scene'|'shot';selectedId?:string;selectedIds:readonly string[];onSelect(clip:Clip):void;currentFilm():Film;settle():Promise<void>;write(ops:Op[],label:string):Promise<string|null>};
export function StoryNavigator(props:Props) {
  return props.kind==='shot'?<ShotNavigator {...props}/>:<StoryOutline {...props} kind={props.kind}/>;
}
function ShotNavigator({film,selectedId,onSelect}:Props) {
  const ref=React.useRef<HTMLDivElement>(null);
  const clips=film.tracks.flatMap(t=>t.clips).filter(c=>storyData(c)?.kind==='shot').sort((a,b)=>(a.at??0)-(b.at??0));
  React.useEffect(()=>{const frame=requestAnimationFrame(()=>ref.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest'}));return()=>cancelAnimationFrame(frame);},[selectedId]);
  return <aside className="studio-navigator" aria-label="镜头目录"><div className="studio-navigator-heading"><h2>镜头</h2><span>{clips.length}</span></div><div className="studio-navigator-scroll" ref={ref}>
    {!clips.length&&<p className="studio-nav-empty">点击右上角「新增镜头」开始设计画面。</p>}
    {clips.map((clip,index)=><button key={clip.id} aria-label={`选择镜头 · ${storyData(clip)?.title}`} aria-current={selectedId===clip.id?'true':undefined} onClick={()=>onSelect(clip)}><span className="studio-nav-number">{String(index+1).padStart(2,'0')}</span><span className="studio-nav-copy"><strong>{storyData(clip)?.title}</strong><small>{storyTime(clip.at??0)} · {(clipEnd(clip)-(clip.at??0)).toFixed(1)} 秒</small></span></button>)}
  </div><p className="studio-navigator-foot">每个镜头都可以引用故事正文。</p></aside>;
}
