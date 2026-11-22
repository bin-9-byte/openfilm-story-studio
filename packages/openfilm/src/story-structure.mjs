// @ts-check
/** @typedef {{id:string,kind:'act'|'sequence',title:string,parentId?:string}} StoryGroup */
/** @typedef {{groups:StoryGroup[],members:Record<string,string>,sceneNumbers:Record<string,string>,nextSceneNumber:number}} StoryStructure */
/** @param {any} id */
const safeKey = id => typeof id === 'string' && id.length > 0 && !['__proto__','constructor','prototype'].includes(id);
/** @param {any} value */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {string} number */
const numberKey = number => number.trim().toUpperCase();
/** @param {any} value */
export function validStoryStructure(value) {
  if(!object(value)||!Array.isArray(value.groups)||!object(value.members)||!object(value.sceneNumbers)||!Number.isSafeInteger(value.nextSceneNumber)||value.nextSceneNumber<1)return false;
  const groups=new Map();
  for(const g of value.groups) {
    if(!object(g)||!safeKey(g.id)||groups.has(g.id)||!['act','sequence'].includes(g.kind)||typeof g.title!=='string'||!g.title.trim()||g.title.length>160)return false;
    groups.set(g.id,g);
  }
  for(const g of value.groups)if(g.parentId!==undefined&&(g.kind!=='sequence'||groups.get(g.parentId)?.kind!=='act'))return false;
  if(Object.entries(value.members).some(([id,group])=>!safeKey(id)||!groups.has(group)))return false;
  const numbers=new Set();
  for(const [id,number] of Object.entries(value.sceneNumbers)) {
    if(!safeKey(id)||typeof number!=='string'||! /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,31}$/u.test(number)||number!==number.trim()||numbers.has(numberKey(number)))return false;
    numbers.add(numberKey(number));
  }
  return true;
}
/** New scene identities are allocated after the entire edit, never from the current scene order. */
/** @param {{storyStructure?:StoryStructure,tracks:{clips:{id:string,at?:number,attrs?:Record<string,string>}[]}[]}} film */
export function ensureSceneNumbers(film) {
  const structure=film.storyStructure;if(!structure)return;
  const used=new Set(Object.values(structure.sceneNumbers).map(numberKey));
  const scenes=film.tracks.flatMap(track=>track.clips).filter(clip=>{
    try{return JSON.parse(clip.attrs?.['data-story']??'null')?.kind==='scene';}catch{return false;}
  }).sort((a,b)=>(a.at??0)-(b.at??0)||a.id.localeCompare(b.id));
  for(const scene of scenes) {
    if(Object.hasOwn(structure.sceneNumbers,scene.id))continue;
    let number;
    do {if(structure.nextSceneNumber>=Number.MAX_SAFE_INTEGER)throw new Error('Scene number allocation exhausted');number=`S${String(structure.nextSceneNumber++).padStart(3,'0')}`;}while(used.has(numberKey(number)));
    structure.sceneNumbers[scene.id]=number;used.add(numberKey(number));
  }
}
