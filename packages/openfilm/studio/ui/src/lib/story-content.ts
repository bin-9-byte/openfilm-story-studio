import type { Clip, Film } from '../api';

export interface StoryData {
  kind: 'scene' | 'beat' | 'shot';
  title: string;
  place?: string;
  summary?: string;
  script?: string;
  description?: string;
  framing?: string;
  movement?: string;
  notes?: string;
  image?: string;
  scriptSource?: 'timeline' | 'confirmed';
  sourceRefs?: SourceRef[];
  beatIds?: string[];
}

export function storyData(clip: Clip): StoryData | null {
  try {
    const value = JSON.parse(clip.attrs?.['data-story'] ?? 'null');
    return value && ['scene', 'beat', 'shot'].includes(value.kind) && typeof value.title === 'string' ? value : null;
  } catch { return null; }
}

export const clipEnd = (clip: Clip) => (clip.at ?? 0) + ((clip.time?.[1] ?? 4) - (clip.time?.[0] ?? 0)) / (clip.speed ?? 1);

/** Time overlap suggests candidates; only explicit confirmation creates stable source references. */
export function sceneCandidates(film: Film, scene: Clip) {
  return film.tracks.flatMap(track => track.clips.filter(clip => storyData(clip)?.kind === 'beat'
    && (clip.at ?? 0) < clipEnd(scene) && clipEnd(clip) > (scene.at ?? 0))
    .map(clip => ({ clip, line: track.attrs?.title ?? '剧本线',
      crosses: (clip.at ?? 0) < (scene.at ?? 0) || clipEnd(clip) > clipEnd(scene) })))
    .sort((a,b) => (a.clip.at ?? 0) - (b.clip.at ?? 0));
}

export function sceneRange(film: Film, selectedIds: readonly string[], range?: {startMs: number; endMs: number} | null) {
  const beats = film.tracks.flatMap(track => track.clips).filter(clip => selectedIds.includes(clip.id) && storyData(clip)?.kind === 'beat');
  const start = range ? range.startMs / 1000 : beats.length ? Math.min(...beats.map(clip => clip.at ?? 0)) : 0;
  const end = range ? range.endMs / 1000 : beats.length ? Math.max(...beats.map(clipEnd)) : 0;
  return {start, end};
}

export interface SourceRef { id: string; title: string; description: string; at: number; end: number }
export const beatEntries = (film: Film) => film.tracks.flatMap(track => track.clips
  .filter(clip => storyData(clip)?.kind === 'beat').map(clip => ({clip,line:track.attrs?.title ?? '剧本线'})));
export const sourceRefs = (scene: Clip): SourceRef[] => {
  const refs = storyData(scene)?.sourceRefs;
  return Array.isArray(refs) ? refs.filter(ref => ref && typeof ref.id === 'string') : [];
};
export function captureSources(film: Film, ids: readonly string[], previous: SourceRef[] = []): SourceRef[] {
  const beats = new Map(beatEntries(film).map(entry => [entry.clip.id,entry.clip]));
  return [...new Set(ids)].flatMap(id => {
    const clip = beats.get(id), data = clip && storyData(clip);
    if (clip && data) return [{id,title:data.title,description:data.description ?? '',at:clip.at ?? 0,end:clipEnd(clip)}];
    const missing = previous.find(ref => ref.id === id);
    return missing ? [missing] : [];
  });
}
export function confirmedSceneSources(film: Film, scene: Clip) {
  const entries = new Map(beatEntries(film).map(entry => [entry.clip.id,entry]));
  return sourceRefs(scene).map(ref => {
    const entry = entries.get(ref.id);
    const data = entry && storyData(entry.clip);
    return {ref, ...entry, changed: Boolean(entry && data && (data.title !== ref.title
      || (data.description ?? '') !== ref.description || Math.abs((entry.clip.at ?? 0)-ref.at) > .0005
      || Math.abs(clipEnd(entry.clip)-ref.end) > .0005)),
      outside: Boolean(entry && ((entry.clip.at ?? 0) >= clipEnd(scene) || clipEnd(entry.clip) <= (scene.at ?? 0))) };
  });
}
export function storyFields(clip: Clip, patch: Partial<StoryData>) {
  return {op:'fields' as const,clip:clip.id,fields:{attrs:{...clip.attrs,'data-story':JSON.stringify({...storyData(clip),...patch})}}};
}
export function confirmSceneSources(film: Film, scene: Clip, ids: readonly string[]) {
  return storyFields(scene,{scriptSource:'confirmed',sourceRefs:captureSources(film,ids,sourceRefs(scene))});
}
export function shotBeatIds(clip: Clip): string[] {
  const ids = storyData(clip)?.beatIds;
  return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string'))] : [];
}

/** Timeline extent, including gaps; not the sum of shot lengths. */
export function shotSequenceDuration(film: Film): number {
  return Math.max(0,...film.tracks.filter(track=>!track.hidden).flatMap(track=>track.clips
    .filter(clip=>storyData(clip)?.kind==='shot' && !clip.disabled).map(clipEnd)));
}

/** A local image replaces only the source/trim, preserving screen duration and all story/link metadata. */
export function shotImageOp(clip: Clip, path: string) {
  const operation = storyFields(clip,{image:path});
  return {...operation,fields:{...operation.fields,src:path,time:[0,clipEnd(clip)-(clip.at ?? 0)],speed:null}};
}
