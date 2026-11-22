import * as React from 'react';
import type {Clip,Film} from '@/api';
import {clipEnd,storyData} from '@/lib/story-content';
import {storyTime} from '@/lib/story-overview';

export function StoryNavigator({film,kind,selectedId,onSelect}:{film:Film;kind:'beat'|'scene'|'shot';selectedId?:string;onSelect(clip:Clip):void}) {
  const ref=React.useRef<HTMLDivElement>(null);
  const groups=film.tracks.flatMap((track,index)=>{
    const clips=track.clips.filter(clip=>storyData(clip)?.kind===kind).sort((a,b)=>(a.at??0)-(b.at??0));
    return clips.length?[{id:index,title:track.attrs?.title??(kind==='scene'?'场次划分':kind==='shot'?'本场镜头':'剧本线'),clips}]:[];
  });
  const label=kind==='beat'?'节拍':kind==='scene'?'场次':'镜头';
  React.useEffect(()=>{
    const scroll=ref.current;if(!scroll)return;
    const reveal=()=>{const item=scroll.querySelector('[aria-current="true"]');if(!item)return;const bounds=item.getBoundingClientRect(),view=scroll.getBoundingClientRect();if(bounds.bottom>view.bottom)scroll.scrollTop+=bounds.bottom-view.bottom+8;else if(bounds.top<view.top)scroll.scrollTop-=view.top-bounds.top+8;};
    let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(reveal);});
    const observer=new ResizeObserver(reveal);observer.observe(scroll);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[selectedId]);
  return <aside className="studio-navigator" aria-label={`${label}目录`}>
    <div className="studio-navigator-heading"><h2>{label}列表</h2><span>{groups.reduce((n,g)=>n+g.clips.length,0)}</span></div>
    <div className="studio-navigator-scroll" ref={ref}>
      {!groups.length&&<p className="studio-nav-empty">{kind==='scene'?'选中剧本节拍或时间选区，再划分场次':kind==='shot'?'点击右上角新增镜头':'点击右上角新增节拍，开始写故事'}</p>}
      {groups.map(group=><section key={group.id}><h3 title={group.title}>{group.title}</h3>{group.clips.map((clip,index)=><button key={clip.id} aria-label={`选择${label} · ${storyData(clip)?.title}`} aria-current={selectedId===clip.id?'true':undefined} onClick={()=>onSelect(clip)}>
        <span className="studio-nav-number">{String(index+1).padStart(2,'0')}</span><span className="studio-nav-copy"><strong>{storyData(clip)?.title}</strong><small>{storyTime(clip.at??0)} · {(clipEnd(clip)-(clip.at??0)).toFixed(1)} 秒</small></span>
      </button>)}</section>)}
    </div>
    <p className="studio-navigator-foot">{kind==='beat'?'先写故事，再划分场次':kind==='scene'?'场次引用正文，镜头承接表达':'每个镜头都可以关联故事节拍'}</p>
  </aside>;
}
