import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {api,type Clip,type Film} from '../api';
import type {PreviewHandle,PreviewProps} from '../editor/Preview';
import type {Anchor} from '../editor/player';
import {storyData} from '../lib/story-content';
import type {ClipSpan} from '../lib/film-shape';

const endOf=(clip:Clip,native?:number)=>(clip.at??0)+Math.max(0,((clip.time?.[1]??native??4)-(clip.time?.[0]??0))/(clip.speed??1));
const spansOf=(film:Film,base:string,facts:Map<string,number>):ClipSpan[]=>film.tracks.flatMap(track=>track.clips.map(clip=>({id:clip.id,src:clip.src,at:clip.at??0,end:endOf(clip,facts.get(new URL(clip.src,base).href)),native:facts.get(new URL(clip.src,base).href)??null})));
const image=(src:string)=>/\.(?:png|jpe?g|webp|avif|gif|svg|bmp)(?:[?#]|$)/i.test(src);
const video=(src:string)=>/\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(src);
/** Safe browser-native preview: imported HTML is never executed on the app origin. */
export const BrowserPreview=forwardRef<PreviewHandle,PreviewProps>(function BrowserPreview({folder,stage,time,onInfo,onError,onSpans,onShown,revision,children},ref){
  const [film,setFilm]=useState<Film>({tracks:[]}),[at,setAt]=useState(()=>time());
  const callbacks=useRef({onInfo,onError,onSpans,onShown});callbacks.current={onInfo,onError,onSpans,onShown};
  const [parts,setParts]=useState<Map<string,Film>>(new Map());
  const [facts,setFacts]=useState<Map<string,number>>(new Map());
  const line=useRef<Anchor|null>(null),animation=useRef(0),root=useRef<HTMLDivElement>(null);
  const update=(next:Film)=>{setFilm(next);const spans=spansOf(next,folder,facts);callbacks.current.onInfo({duration:Math.max(0,...spans.map(s=>s.end)),width:next.stage?.w??stage.w,height:next.stage?.h??stage.h,sounds:[],spans});callbacks.current.onSpans?.(spans);};
  const currentUpdate=useRef(update);currentUpdate.current=update;
  useEffect(()=>{
    let alive=true;
    // The root id and relative part prefix are encoded in the locally served folder.
    const url=new URL(folder);
    void (async()=>{
      const projects=await fetch('/api/browser/projects').then(r=>r.json()) as {id:string;folder:string}[];
      const match=projects.find(p=>p.folder===url.href);if(!match)throw new Error('本机预览工程不存在。');
      const loaded=await api.film(match.id);if(!alive)return;
      currentUpdate.current(loaded.value??{tracks:[]});revision?.present();callbacks.current.onError?.(null);callbacks.current.onShown?.();
    })().catch(error=>{if(alive)callbacks.current.onError?.(String(error.message??error));});
    return()=>{alive=false;};
  },[folder,revision?.rev]);
  useEffect(()=>{
    let alive=true;
    const compounds=film.tracks.flatMap(t=>t.clips).filter(c=>/\/film\.html(?:#.*)?$/.test(c.src));
    void Promise.all(compounds.map(async clip=>{
      const src=new URL(clip.src,folder);const response=await fetch(src);const text=await response.text();
      const {readFilmFile}=await import('../../../../src/film-doc.mjs');const parsed=readFilmFile(text);
      return [src.href,parsed.value as Film] as const;
    })).then(values=>{if(alive)setParts(new Map(values));},()=>{});
    return()=>{alive=false;};
  },[film,folder]);
  useEffect(()=>{
    let alive=true;
    const sources=new Set([...[{value:film,base:folder},...[...parts].map(([url,value])=>({value,base:new URL('.',url).href}))].flatMap(({value,base})=>value.tracks.flatMap(t=>t.clips.filter(c=>video(c.src)).map(c=>new URL(c.src,base).href)))]);
    void Promise.all([...sources].map(async src=>{const value=await fetch(`/api/browser/probe?src=${encodeURIComponent(src)}`).then(r=>r.json()) as {duration?:number};return [src,value.duration] as const;})).then(values=>{
      if(!alive)return;setFacts(previous=>{const next=new Map(previous);for(const [src,duration] of values)if(duration&&Number.isFinite(duration))next.set(src,duration);return next.size===previous.size&&[...next].every(([src,d])=>previous.get(src)===d)?previous:next;});
    });return()=>{alive=false;};
  },[film,parts,folder]);
  useEffect(()=>{currentUpdate.current(film);},[facts]);
  useEffect(()=>()=>cancelAnimationFrame(animation.current),[]);
  useImperativeHandle(ref,()=>({
    seek(t){line.current=null;cancelAnimationFrame(animation.current);setAt(t);},
    scrub(t){line.current=null;cancelAnimationFrame(animation.current);setAt(t);},
    async cue(t){line.current=null;cancelAnimationFrame(animation.current);setAt(t);return true;},
    play(anchor){line.current=anchor;cancelAnimationFrame(animation.current);const tick=()=>{if(!line.current)return;setAt(line.current.t+(performance.now()-line.current.at)/1000*line.current.rate);animation.current=requestAnimationFrame(tick);};tick();},
    update:currentUpdate.current,preview(){},async pick(){return null;},frame(){return null;},focus(){root.current?.focus();},reload(){currentUpdate.current(film);},
  }));
  const visible=film.tracks.filter(t=>!t.hidden).flatMap(track=>track.clips.filter(c=>!c.disabled&&at>=(c.at??0)&&at<endOf(c,facts.get(new URL(c.src,folder).href))).map(clip=>({clip,base:folder,t:(at-(clip.at??0))*(clip.speed??1)+(clip.time?.[0]??0),muted:track.muted}))).flatMap(item=>{
    const url=new URL(item.clip.src,item.base),part=parts.get(url.href);if(!part)return [item];
    return part.tracks.filter(track=>!track.hidden).flatMap(track=>track.clips.filter(c=>!c.disabled&&item.t>=(c.at??0)&&item.t<endOf(c,facts.get(new URL(c.src,new URL('.',url)).href))).map(clip=>({clip,base:new URL('.',url).href,t:(item.t-(clip.at??0))*(clip.speed??1)+(clip.time?.[0]??0),muted:item.muted||track.muted})));
  });
  const media=visible.filter(item=>image(storyData(item.clip)?.image??item.clip.src)||video(item.clip.src));
  const title=visible.at(-1)?.clip;
  return <div ref={root} tabIndex={-1} data-browser-preview="" className="absolute inset-0 flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-black">
    {!media.length&&<div className="max-w-[70%] p-8 text-center text-white"><h2 className="text-xl">{title?storyData(title)?.title??'预览':'当前时间没有镜头'}</h2><p className="mt-3 whitespace-pre-wrap text-sm text-white/60">{title?storyData(title)?.description??'请在分镜表添加画面，或把本机图片、视频拖入时间轴。':''}</p></div>}
    {media.map(({clip,base,t,muted})=>{
      const path=storyData(clip)?.image??clip.src,url=new URL(path,base);
      if(url.origin!==location.origin||!url.pathname.startsWith('/browser-media/'))return null;
      const box=clip.box,style=box?{left:`${box.x/stage.w*100}%`,top:`${box.y/stage.h*100}%`,width:`${(box.w??stage.w)/stage.w*100}%`,height:`${(box.h??stage.h)/stage.h*100}%`,transform:`rotate(${box.r??0}deg)`}:{inset:0};
      return <div key={`${base}:${clip.id}`} className="absolute flex items-center justify-center" style={style}>{video(path)?<LocalVideo src={url.href} time={t} playing={Boolean(line.current)} rate={clip.speed??1} muted={Boolean(muted)||clip.volume===0}/>:<img src={url.href} alt={storyData(clip)?.title??''} className="h-full w-full object-contain" draggable={false}/>}</div>;
    })}
    {children}
  </div>;
});
function LocalVideo({src,time,playing,rate,muted}:{src:string;time:number;playing:boolean;rate:number;muted:boolean}){
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;if(Math.abs(el.currentTime-time)>.12)el.currentTime=time;el.playbackRate=Math.max(.0625,Math.min(16,rate));if(playing)void el.play().catch(()=>{});else el.pause();},[time,playing,rate]);
  return <video ref={ref} src={src} muted={muted} preload="auto" playsInline className="h-full w-full object-contain"/>;
}
