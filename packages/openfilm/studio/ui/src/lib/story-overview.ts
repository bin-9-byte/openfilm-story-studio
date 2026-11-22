import type {Clip,Film} from '../api';
import {beatEntries,clipEnd,storyData} from './story-content.ts';

export function storyReadingGroups(film:Film,line?:string) {
  const entries=beatEntries(film).filter(entry=>!line||entry.line===line)
    .sort((a,b)=>(a.clip.at??0)-(b.clip.at??0));
  const groups:{at:number;entries:typeof entries}[]=[];
  for(const entry of entries){
    const at=Math.round((entry.clip.at??0)*1000)/1000;
    const last=groups.at(-1);
    if(last?.at===at)last.entries.push(entry);else groups.push({at,entries:[entry]});
  }
  return groups;
}
export const storyScenes=(film:Film)=>film.tracks.flatMap(track=>track.clips)
  .filter(clip=>storyData(clip)?.kind==='scene').sort((a,b)=>(a.at??0)-(b.at??0));
export function storyPartFolder(scene:Clip):string|null {
  const src=scene.src.split('#')[0];
  return /^parts\/.+\/film\.html$/.test(src)?src.slice(0,-'/film.html'.length):null;
}
export const storyShots=(film:Film)=>film.tracks.flatMap(track=>track.clips)
  .filter(clip=>storyData(clip)?.kind==='shot').sort((a,b)=>(a.at??0)-(b.at??0));
/** A shot's presentation within a trimmed scene. Out-of-range shots remain visible in the overview. */
export function shotPresentation(scene:Clip,shot:Clip) {
  const from=scene.time?.[0]??0,to=scene.time?.[1]??from+4,speed=scene.speed??1;
  const localStart=Math.max(from,shot.at??0),localEnd=Math.min(to,clipEnd(shot));
  const outside=localEnd<=localStart;
  return {outside,localStart:outside?(shot.at??0):localStart,
    globalStart:outside?null:(scene.at??0)+(localStart-from)/speed,
    globalEnd:outside?null:(scene.at??0)+(localEnd-from)/speed,
    clipped:!outside&&(localStart>(shot.at??0)||localEnd<clipEnd(shot))};
}
export function storyTime(seconds:number) {
  const ms=Math.max(0,Math.round(seconds*1000));
  const whole=Math.floor(ms/1000),fraction=Math.round((ms%1000)/100);
  if(fraction===10)return storyTime((whole+1));
  return `${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}${fraction?'.'+fraction:''}`;
}
