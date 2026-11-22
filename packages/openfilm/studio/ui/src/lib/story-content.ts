import type { Clip, Film, Op, StoryDocument } from '../api';

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
  contentId?: string;
  blockIds?: string[];
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
    .map(raw => { const clip=resolvedStoryClip(film,raw); return ({ clip, line: track.attrs?.title ?? '剧本线',
      crosses: (clip.at ?? 0) < (scene.at ?? 0) || clipEnd(clip) > clipEnd(scene) }); }))
    .sort((a,b) => (a.clip.at ?? 0) - (b.clip.at ?? 0));
}

export function sceneRange(film: Film, selectedIds: readonly string[], range?: {startMs: number; endMs: number} | null) {
  const beats = film.tracks.flatMap(track => track.clips).filter(clip => selectedIds.includes(clip.id) && storyData(clip)?.kind === 'beat');
  const start = range ? range.startMs / 1000 : beats.length ? Math.min(...beats.map(clip => clip.at ?? 0)) : 0;
  const end = range ? range.endMs / 1000 : beats.length ? Math.max(...beats.map(clipEnd)) : 0;
  return {start, end};
}

export interface SourceRef { id: string; title: string; description: string; at: number; end: number; contentId?: string; blockIds?: string[] }
export const beatEntries = (film: Film) => film.tracks.flatMap(track => track.clips
  .filter(clip => storyData(clip)?.kind === 'beat').map(clip => ({clip:resolvedStoryClip(film,clip),line:track.attrs?.title ?? '剧本线'})));
export const sourceRefs = (scene: Clip): SourceRef[] => {
  const refs = storyData(scene)?.sourceRefs;
  return Array.isArray(refs) ? refs.filter(ref => ref && typeof ref.id === 'string') : [];
};
export function captureSources(film: Film, ids: readonly string[], previous: SourceRef[] = []): SourceRef[] {
  const beats = new Map(beatEntries(film).map(entry => [entry.clip.id,entry.clip]));
  return [...new Set(ids)].flatMap(id => {
    const clip = beats.get(id), data = clip && storyData(clip);
    if (clip && data) {
      const old=previous.find(ref=>ref.id===id);
      const ref={id,title:data.title,description:data.description ?? '',at:clip.at ?? 0,end:clipEnd(clip),...(data.contentId?{contentId:data.contentId}:{}),...(old?.blockIds?{blockIds:old.blockIds}:{})};
      return [{...ref,description:referenceText(film,ref,clip)}];
    }
    const missing = previous.find(ref => ref.id === id);
    return missing ? [missing] : [];
  });
}
export function confirmedSceneSources(film: Film, scene: Clip) {
  const entries = new Map(beatEntries(film).map(entry => [entry.clip.id,entry]));
  return sourceRefs(scene).map(ref => {
    const entry = entries.get(ref.id);
    const sourceDoc=film.screenplay?.[ref.contentId ?? `content:${ref.id}`];
    const data = sourceDoc ? {title:sourceDoc.title,description:referenceText(film,ref,entry?.clip)} : entry && storyData(entry.clip);
    const availableDoc=sourceDoc ?? (entry ? storyDocument(film,entry.clip) : undefined);
    const missingBlocks=Boolean(ref.blockIds?.some(id=>!availableDoc?.blocks.some(block=>block.id===id)));
    const displayClip=entry ? resolvedStoryClip(film,entry.clip,ref.blockIds) : undefined;
    return {ref, ...entry, clip:displayClip, contentAvailable:Boolean(sourceDoc || entry), missingBlocks, changed: missingBlocks || Boolean(data && (data.title !== ref.title
      || (data.description ?? '') !== ref.description || (entry && (Math.abs((entry.clip.at ?? 0)-ref.at) > .0005
      || Math.abs(clipEnd(entry.clip)-ref.end) > .0005)))),
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


/** Stable document identity is independent of its clips, tracks, and screen duration. */
export function storyDocument(film:Film,clip:Clip):StoryDocument {
  const data=storyData(clip);
  return (data?.contentId && film.screenplay?.[data.contentId]) || {
    title:data?.title ?? '',blocks:(data?.description ?? '').split('\n\n').map((text,index)=>({id:`${clip.id}:p${index+1}`,text})),
  };
}
export function resolvedStoryClip(film:Film,clip:Clip,blockIds?:string[]):Clip {
  const data=storyData(clip);if(!data || data.kind!=='beat')return clip;
  const doc=storyDocument(film,clip),selected=blockIds ?? data.blockIds;
  const blocks=selected ? selected.flatMap(id=>doc.blocks.filter(block=>block.id===id)) : doc.blocks;
  return {...clip,attrs:{...clip.attrs,'data-story':JSON.stringify({...data,title:doc.title,description:blocks.map(block=>block.text).join('\n\n')})}};
}
export function referenceText(film:Film,ref:SourceRef,clip?:Clip):string {
  const doc=film.screenplay?.[ref.contentId ?? `content:${ref.id}`] ?? (clip ? storyDocument(film,clip) : undefined);
  if(!doc)return ref.description;
  if(!ref.blockIds)return doc.blocks.map(block=>block.text).join('\n\n');
  return ref.blockIds.map(id=>doc.blocks.find(block=>block.id===id)?.text ?? '〔来源段落已删除，待核对〕').join('\n\n');
}
export function materializeStory(film:Film,clip:Clip) {
  const data=storyData(clip)!;
  const contentId=data.contentId ?? `content:${clip.id}`;
  const doc=storyDocument(film,clip);
  const ops:Op[]=film.screenplay?.[contentId]?[]:[{op:'screenplay',set:{[contentId]:doc}}];
  if(data.contentId!==contentId)ops.push(storyFields(clip,{contentId}));
  return {contentId,doc,ops};
}
/** Mirrors are compatibility labels only; canonical text survives deleting any occurrence. */
export function editStoryDocument(film:Film,clip:Clip,doc:StoryDocument):Op[] {
  const source=materializeStory(film,clip);
  const ops:Op[]=[{op:'screenplay',set:{[source.contentId]:doc}}];
  for(const current of film.tracks.flatMap(track=>track.clips)) {
    const data=storyData(current);
    if(current.id===clip.id || (data?.kind==='beat' && data.contentId===source.contentId))
      ops.push(storyFields(current,{contentId:source.contentId,title:doc.title,description:doc.blocks.map(block=>block.text).join('\n\n')}));
  }
  return ops;
}
export function updateStoryText(film:Film,clip:Clip,text:string):Op[] {
  const doc=storyDocument(film,clip),used=new Set<string>(),texts=text.split('\n\n');
  // Reserve unchanged paragraphs before assigning IDs to inserted or rewritten text.
  const matches=texts.map(text=>{const old=doc.blocks.find(block=>block.text===text&&!used.has(block.id));if(old)used.add(old.id);return old;});
  const blocks=texts.map((text,index)=>{
    const old=matches[index] ?? (doc.blocks[index]&&!used.has(doc.blocks[index].id)?doc.blocks[index]:undefined);
    const id=old?.id ?? crypto.randomUUID();used.add(id);return {id,text};
  });
  return editStoryDocument(film,clip,{...doc,blocks});
}
export function shareStoryOccurrence(film:Film,clip:Clip,track:number,id:string):Op[] {
  if(film.tracks[track]?.attrs?.['data-story-track']!=='beat'||film.tracks[track].locked)throw new Error('目标故事线不存在或已锁定。');
  const source=materializeStory(film,clip);
  const attrs={...clip.attrs};delete attrs['data-link'];
  return [...source.ops,{op:'insert',track,at:clip.at??0,clip:{...structuredClone(clip),id,
    attrs:{...attrs,'data-story':JSON.stringify({...storyData(resolvedStoryClip(film,clip)),contentId:source.contentId})}}}];
}
export function referenceParagraphs(film:Film,scene:Clip,clip:Clip,blockIds:string[]):Op[] {
  const source=materializeStory(film,clip);
  if(!blockIds.length || blockIds.some(id=>!source.doc.blocks.some(block=>block.id===id)))throw new Error('请选择有效的正文段落。');
  const ref:SourceRef={id:clip.id,contentId:source.contentId,blockIds:[...new Set(blockIds)],title:source.doc.title,
    description:blockIds.map(id=>source.doc.blocks.find(block=>block.id===id)!.text).join('\n\n'),at:clip.at??0,end:clipEnd(clip)};
  const refs=sourceRefs(scene);const exists=refs.some(item=>item.id===clip.id);
  return [...source.ops,storyFields(scene,{scriptSource:'confirmed',sourceRefs:exists?refs.map(item=>item.id===clip.id?ref:item):[...refs,ref]})];
}

export function selectSceneSources(film:Film,scene:Clip,ids:readonly string[],paragraphs:Record<string,string[]>):Op[] {
  const ops:Op[]=[],entries=beatEntries(film),previous=sourceRefs(scene);
  const refs:SourceRef[]=[];
  for(const id of ids) {
    const clip=entries.find(entry=>entry.clip.id===id)?.clip;
    if(!clip){const old=previous.find(ref=>ref.id===id);if(old)refs.push(old);continue;}
    const source=materializeStory(film,clip);ops.push(...source.ops);
    const blockIds=paragraphs[id];
    if(blockIds && (!blockIds.length||blockIds.some(id=>!source.doc.blocks.some(block=>block.id===id))))throw new Error('每个来源至少选择一个有效段落。');
    const ref:SourceRef={id,contentId:source.contentId,...(blockIds?{blockIds}:{}),title:source.doc.title,
      description:(blockIds?source.doc.blocks.filter(block=>blockIds.includes(block.id)):source.doc.blocks).map(block=>block.text).join('\n\n'),at:clip.at??0,end:clipEnd(clip)};
    refs.push(ref);
  }
  ops.push(storyFields(scene,{scriptSource:'confirmed',sourceRefs:refs}));return ops;
}
