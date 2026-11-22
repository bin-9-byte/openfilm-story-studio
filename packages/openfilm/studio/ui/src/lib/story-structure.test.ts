import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Film,Clip,Op} from '../api.ts';
import {applyOps} from '../../../server/ops.mjs';
import {filmHtml,readFilmFile} from '../../../../src/film-doc.mjs';
import {inverse} from '../editor/undo.ts';
import {addStoryGroup,assignStoryGroup,changeStoryGroup,groupedStoryClips,initializeStructure,removeStoryGroup,reorderStoryGroup,sceneNumber,setSceneNumber,storyGroupPath} from './story-structure.ts';
const scene=(id:string,at:number):Clip=>({id,src:`parts/${id}/film.html`,at,time:[0,10],attrs:{'data-story':JSON.stringify({kind:'scene',title:id,sourceRefs:[{id:'beat',title:'原文',description:'不可丢失'}]})}});
const fixture=():Film=>({tracks:[{attrs:{'data-story-track':'scene','data-story-track-id':'s'},clips:[scene('s1',10),scene('s2',40)]}]});
const find=(f:Film,id:string)=>f.tracks.flatMap(t=>t.clips).find(c=>c.id===id)!;
const run=(f:Film,ops:Op[])=>applyOps(structuredClone(f),ops);
test('initialize numbers once; scene movement, deletion and insertion never reindex or reuse removed numbers',()=>{
 const initial=fixture(),ops=initializeStructure(initial),numbered=run(initial,ops);
 assert.equal(sceneNumber(numbered,find(numbered,'s1')),'S001');assert.equal(sceneNumber(numbered,find(numbered,'s2')),'S002');
 assert.deepEqual(numbered.tracks,initial.tracks);
 const moved=run(numbered,[{op:'move',clip:'s2',at:0}]);assert.equal(sceneNumber(moved,find(moved,'s2')),'S002');
 const deleted=run(moved,[{op:'remove',clip:'s1'}]),added=run(deleted,[{op:'insert',track:0,at:15,clip:scene('s3',15)}]);
 assert.equal(sceneNumber(added,find(added,'s3')),'S003');assert.equal(added.storyStructure!.sceneNumbers.s1,'S001');
 assert.deepEqual(run(numbered,inverse(initial,numbered,ops)),initial);
});
test('native split keeps old scene number, gives right half new number, inherits group and undoes in one step',()=>{
 let film=run(fixture(),addStoryGroup(fixture(),{id:'act',kind:'act',title:'第一幕'}));
 film=run(film,assignStoryGroup(film,['s1'],'act'));
 const ops:Op[]=[{op:'split',clip:'s1',at:15,time:[0,5],restTime:[5,10],restId:'right'}],after=run(film,ops);
 assert.equal(after.storyStructure!.sceneNumbers.s1,'S001');assert.equal(after.storyStructure!.sceneNumbers.right,'S003');
 assert.equal(after.storyStructure!.members.right,'act');assert.deepEqual(run(after,inverse(film,after,ops)),film);
 const native:Op[]=[{op:'split',clip:'s1',left:{time:[0,5]},right:{at:15,time:[5,10]},rightId:'nativeRight'}];
 const split=run(film,native);assert.equal(split.storyStructure!.sceneNumbers.nativeRight,'S003');assert.deepEqual(run(split,inverse(film,split,native)),film);
});
test('custom inserted scene numbers reject duplicates including deleted reservations and undo cleanly',()=>{
 let film=run(fixture(),initializeStructure(fixture()));const ops=setSceneNumber(film,find(film,'s1'),'12A'),after=run(film,ops);
 assert.equal(after.storyStructure!.sceneNumbers.s1,'12A');assert.deepEqual(run(after,inverse(film,after,ops)),film);
 assert.throws(()=>setSceneNumber(after,find(after,'s2'),'12a'));
 film=run(after,[{op:'remove',clip:'s1'}]);assert.throws(()=>setSceneNumber(film,find(film,'s2'),'12A'));
});
test('act/sequence create, assign, reparent, rename, reorder and delete never change timeline or source references',()=>{
 const before=fixture();let film=run(before,addStoryGroup(before,{id:'a',kind:'act',title:'第一幕'}));
 film=run(film,addStoryGroup(film,{id:'b',kind:'act',title:'第二幕'}));
 film=run(film,addStoryGroup(film,{id:'q',kind:'sequence',title:'来信',parentId:'a'}));
 film=run(film,assignStoryGroup(film,['s1'],'q'));assert.equal(storyGroupPath(film,'q'),'第一幕 / 来信');
 film=run(film,changeStoryGroup(film,'q',{title:'失约',parentId:'b'}));assert.equal(storyGroupPath(film,'q'),'第二幕 / 失约');
 const independent=run(film,changeStoryGroup(film,'q',{parentId:undefined}));assert.equal(Object.hasOwn(independent.storyStructure!.groups.find(g=>g.id==='q')!,'parentId'),false);
 film=run(film,reorderStoryGroup(film,'b',-1));assert.equal(film.storyStructure!.groups[0].id,'b');
 const ops=removeStoryGroup(film,'b'),deleted=run(film,ops);assert.equal(deleted.storyStructure!.groups.find(g=>g.id==='q')!.parentId,undefined);assert.equal(deleted.storyStructure!.members.s1,'q');
 assert.deepEqual(deleted.tracks,before.tracks);assert.deepEqual(run(deleted,inverse(film,deleted,ops)),film);
 const remove=removeStoryGroup(film,'q'),without=run(film,remove);assert.equal(without.storyStructure!.members.s1,undefined);assert.deepEqual(without.tracks,before.tracks);
});
test('structure, numbers and membership roundtrip alongside screenplay through legacy HTML and invalid trees reject',()=>{
 const before=fixture();let film=run(before,addStoryGroup(before,{id:'a',kind:'act',title:'幕 <一> "与" &'}));film=run(film,assignStoryGroup(film,['s1'],'a'));
 film.screenplay={doc:{title:'正文',blocks:[{id:'p',text:'保留正文'}]}};
 const text=filmHtml(film,'<section></section>'),read=readFilmFile(text);assert.deepEqual(read.problems,[]);assert.deepEqual(read.value.storyStructure,film.storyStructure);assert.deepEqual(read.value.screenplay,film.screenplay);assert.equal(filmHtml(read.value,text),text);
 assert.throws(()=>addStoryGroup(film,{id:'bad',kind:'sequence',title:'孤立',parentId:'unknown'}));
 assert.throws(()=>changeStoryGroup(film,'a',{parentId:'a'}));
 const groups=groupedStoryClips(film,film.tracks[0].clips);assert.equal(groups[0].clips[0].id,'s1');assert.equal(groups[1].title,'未分组');
});
