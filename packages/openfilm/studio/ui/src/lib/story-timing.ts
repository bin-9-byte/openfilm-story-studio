import type {Clip,Film,Op} from '../api';
import {sequenceRanges} from '../../../../src/story-sequence.mjs';
import {clipEnd} from './story-content.ts';

/** Adopt a scene's shot extent; push collisions in its track, without moving screenplay sources. */
export function adoptSceneDuration(film: Film, scene: Clip, seconds: number): Op[] {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('镜头实排时长必须大于零。');
  const track = film.tracks.find(track=>track.clips.some(clip=>clip.id===scene.id));
  if (!track || track.locked) throw new Error('场次划分轨道已锁定或不存在。');
  const ranges = track.clips.map(clip=>({id:clip.id,startMs:Math.round((clip.at ?? 0)*1000),
    endMs:Math.round(((clip.at ?? 0)+(clip.id===scene.id ? seconds : clipEnd(clip)-(clip.at ?? 0)))*1000)}));
  const positions = sequenceRanges(ranges,new Set([scene.id]));
  const ops: Op[] = [];
  for (const clip of track.clips) {
    const at = positions.get(clip.id)!.startMs/1000;
    const fields: Record<string,unknown> = {};
    if (Math.abs(at-(clip.at ?? 0))>.0005) fields.at=at;
    if (clip.id===scene.id) fields.time=[clip.time?.[0] ?? 0,(clip.time?.[0] ?? 0)+seconds*(clip.speed ?? 1)];
    if (Object.keys(fields).length) ops.push({op:'fields',clip:clip.id,fields});
  }
  return ops;
}
