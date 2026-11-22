import {openProject} from './navigate';
import {openStoryProject} from './project-handoff';
export type StoryView='script'|'board'|'picture'|'overview';
export interface StoryLocation {projectId:string;rootId:string;clipId:string;atMs:number;view:StoryView;anchor:string;scrollTop:number;restorePosition?:boolean}
export interface OverviewPreference {view:StoryView;rootId:string;anchor?:string;scrollTop?:number}
const PENDING='openfilm:story-location';
const prefKey=(id:string)=>`openfilm:story-view:${id}`;
export const STORY_LOCATION_EVENT='openfilm-story-location';
export const STORY_ENTER_SCENE='openfilm-story-enter-scene';
export const STORY_LEAVE_SCENE='openfilm-story-leave-scene';
export function storyPreference(id:string):OverviewPreference|null {
  try{const value=JSON.parse(sessionStorage.getItem(prefKey(id))??'null');return value&&['script','board','picture','overview'].includes(value.view)&&typeof value.rootId==='string'?value:null;}catch{return null;}
}
export function saveStoryPreference(id:string,value:OverviewPreference){try{sessionStorage.setItem(prefKey(id),JSON.stringify(value));}catch{/* session preferences are optional */}}
export function rememberStoryLocation(target:StoryLocation){try{sessionStorage.setItem(`openfilm:story-return:${target.projectId}`,JSON.stringify(target));}catch{/* optional position memory */}}
export function rememberedStoryLocation(id:string):StoryLocation|null{try{const value=JSON.parse(sessionStorage.getItem(`openfilm:story-return:${id}`)??'null');return value?.projectId===id&&typeof value.clipId==='string'&&Number.isFinite(value.atMs)?value:null;}catch{return null;}}
export function pendingStoryLocation(id:string):StoryLocation|null {
  try{const value=JSON.parse(sessionStorage.getItem(PENDING)??'null');return value?.projectId===id&&typeof value.clipId==='string'&&Number.isFinite(value.atMs)&&value.atMs>=0?value:null;}catch{return null;}
}
export function clearStoryLocation(id:string){if(pendingStoryLocation(id))try{sessionStorage.removeItem(PENDING);}catch{/* no storage */}}
export function locateStory(target:StoryLocation,currentProjectId:string) {
  saveStoryPreference(target.projectId,{view:target.view,rootId:target.rootId,anchor:target.anchor,scrollTop:target.scrollTop});
  try{sessionStorage.setItem(PENDING,JSON.stringify(target));}catch{/* local event still works */}
  if(target.projectId===currentProjectId)window.dispatchEvent(new CustomEvent(STORY_LOCATION_EVENT,{detail:target}));
  else return openStoryProject(target.projectId).catch(()=>openProject(target.projectId));
}
