import type {Clip,Film,Op,StoryGroup,StoryStructure} from '../api';
import {ensureSceneNumbers,validStoryStructure} from '../../../../src/story-structure.mjs';
import {storyData} from './story-content.ts';

export function structureOf(film:Film):StoryStructure {
  return structuredClone(film.storyStructure??{groups:[],members:{},sceneNumbers:{},nextSceneNumber:1});
}
export function structureOp(value:StoryStructure):Op {
  if(!validStoryStructure(value))throw new Error('分组配置无效，或场号重复。场号可使用数字、字母、中文及 . _ -，最多 32 个字符。');
  return {op:'story-structure',value};
}
export function initializeStructure(film:Film):Op[] {
  return [structureOp(structureOf(film))];
}
export function sceneNumber(film:Film,scene:Clip):string {
  return film.storyStructure?.sceneNumbers[scene.id]??'未编号';
}
export function storyGroupPath(film:Film,id?:string):string {
  const groups=film.storyStructure?.groups??[],group=groups.find(g=>g.id===id);
  if(!group)return '未归组';
  const parent=groups.find(g=>g.id===group.parentId);
  return parent?`${parent.title} / ${group.title}`:group.title;
}
export function structureGroups(film:Film):StoryGroup[] {
  const groups=film.storyStructure?.groups??[];
  return groups.filter(g=>!g.parentId).flatMap(g=>[g,...groups.filter(child=>child.parentId===g.id)]);
}
export function addStoryGroup(film:Film,group:StoryGroup):Op[] {
  const value=structureOf(film);value.groups.push({...group,title:group.title.trim()});return [structureOp(value)];
}
export function changeStoryGroup(film:Film,id:string,patch:Partial<Pick<StoryGroup,'title'|'parentId'>>):Op[] {
  const value=structureOf(film);if(!value.groups.some(g=>g.id===id))throw new Error('分组已不存在。');
  value.groups=value.groups.map(g=>{if(g.id!==id)return g;const next={...g,...patch,...(patch.title!==undefined?{title:patch.title.trim()}:{} )};if(Object.hasOwn(patch,'parentId')&&patch.parentId===undefined)delete next.parentId;return next;});
  return [structureOp(value)];
}
export function removeStoryGroup(film:Film,id:string):Op[] {
  const value=structureOf(film);value.groups=value.groups.filter(g=>g.id!==id).map(g=>{
    if(g.parentId!==id)return g;const next={...g};delete next.parentId;return next;
  });
  value.members=Object.fromEntries(Object.entries(value.members).filter(([,group])=>group!==id));
  return [structureOp(value)];
}
export function assignStoryGroup(film:Film,ids:readonly string[],groupId:string):Op[] {
  const value=structureOf(film),clips=film.tracks.flatMap(t=>t.clips).filter(c=>ids.includes(c.id)&&['scene','beat'].includes(storyData(c)?.kind??''));
  if(!clips.length)throw new Error('请先选择剧本故事卡或场次。');
  for(const clip of clips){if(groupId)value.members[clip.id]=groupId;else delete value.members[clip.id];}
  return [structureOp(value)];
}
export function reorderStoryGroup(film:Film,id:string,direction:-1|1):Op[] {
  const value=structureOf(film),group=value.groups.find(g=>g.id===id);if(!group)return [];
  const siblings=value.groups.filter(g=>g.parentId===group.parentId),target=siblings[siblings.findIndex(g=>g.id===id)+direction];if(!target)return [];
  const from=value.groups.indexOf(group),to=value.groups.indexOf(target);[value.groups[from],value.groups[to]]=[value.groups[to],value.groups[from]];
  return [structureOp(value)];
}
export function setSceneNumber(film:Film,scene:Clip,number:string):Op[] {
  const value=structureOf(film),numbered={...film,storyStructure:value};ensureSceneNumbers(numbered);
  number=number.trim();if(!number)throw new Error('场号不能为空。');
  if(Object.entries(value.sceneNumbers).some(([id,existing])=>id!==scene.id&&existing.toUpperCase()===number.toUpperCase()))throw new Error(`场号「${number}」已使用过，请换一个场号。`);
  value.sceneNumbers[scene.id]=number;return [structureOp(value)];
}
export function groupedStoryClips(film:Film,clips:Clip[]) {
  const members=film.storyStructure?.members??{};
  const groups=structureGroups(film).map(group=>({id:group.id,title:storyGroupPath(film,group.id),clips:clips.filter(clip=>members[clip.id]===group.id)}));
  const ungrouped=clips.filter(clip=>!groups.some(group=>group.id===members[clip.id]));
  return [...groups,...(ungrouped.length?[{id:'',title:'未归组',clips:ungrouped}]:[])];
}
