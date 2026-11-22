import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clipEnd,sceneCandidates,sceneRange,storyData,confirmSceneSources,confirmedSceneSources,sourceRefs,shotBeatIds,storyFields,shotImageOp,shotSequenceDuration} from './story-content.ts';
import {adoptSceneDuration} from './story-timing.ts';
import {applyOps} from '../../../server/ops.mjs';
import {inverse} from '../editor/undo.ts';
import type {Film,Clip,Op} from '../api.ts';
const beat=(id:string,at:number,duration:number):Clip=>({id,src:'beat.html',at,time:[0,duration],attrs:{'data-story':JSON.stringify({kind:'beat',title:id,description:`正文${id}`})}});
const source=():Film=>({tracks:[{attrs:{title:'A 线','data-story-track':'beat','data-story-track-id':'a'},clips:[beat('a',0,8),beat('b',8,4)]},{attrs:{title:'B 线','data-story-track':'beat','data-story-track-id':'b'},clips:[beat('c',2,8)]}]});
const scene:Clip={id:'s',src:'parts/s/film.html',at:4,time:[0,4],attrs:{'data-story':JSON.stringify({kind:'scene',title:'场次',scriptSource:'timeline'})}};
test('scene references full cross-scene beats from multiple lines with half-open boundaries',()=>{
 const refs=sceneCandidates(source(),scene);assert.deepEqual(refs.map(r=>[r.clip.id,r.crosses]),[['a',true],['c',true]]);assert.equal(storyData(refs[0].clip)?.description,'正文a');
});
test('scene boundary changes update references without changing or copying text',()=>{
 const film=source(),before=structuredClone(film);assert.deepEqual(sceneCandidates(film,{...scene,at:8}).map(r=>r.clip.id),['c','b']);assert.deepEqual(film,before);
 film.tracks[0].clips[0].attrs!['data-story']=JSON.stringify({kind:'beat',title:'a',description:'修改来源正文'});assert.equal(storyData(sceneCandidates(film,scene)[0].clip)?.description,'修改来源正文');
});
test('explicit time selection takes priority; otherwise use selected beat span',()=>{
 assert.deepEqual(sceneRange(source(),['a','c']),{start:0,end:10});assert.deepEqual(sceneRange(source(),['a'],{startMs:4000,endMs:6000}),{start:4,end:6});assert.deepEqual(sceneRange(source(),[]),{start:0,end:0});
});
test('create scene and track without altering screenplay; one undo removes both',()=>{
 const before=source();const ops:Op[]=[{op:'story-track-add',id:'scene-track',name:'场次划分',at:2,kind:'scene'},{op:'insert',track:2,at:4,clip:scene}];
 const after=applyOps(structuredClone(before),ops);assert.deepEqual(after.tracks.slice(0,2),before.tracks);assert.equal(after.tracks[2].attrs?.['data-story-track'],'scene');assert.deepEqual(applyOps(structuredClone(after),inverse(before,after,ops)),before);
});

test('confirmed scene keeps source after movement, flags content changes and missing sources, undo restores confirmation',()=>{
 const before=source();before.tracks.push({clips:[scene]});
 const confirmation=confirmSceneSources(before,scene,['a','c']);
 const after=applyOps(structuredClone(before),[confirmation]);const pinned=after.tracks[2].clips[0];
 after.tracks[0].clips[0].at=50;
 assert.equal(confirmedSceneSources(after,pinned)[0].clip?.id,'a');assert.equal(confirmedSceneSources(after,pinned)[0].outside,true);assert.equal(confirmedSceneSources(after,pinned)[0].changed,true);
 after.tracks[0].clips[0].attrs!['data-story']=JSON.stringify({kind:'beat',title:'a',description:'新版正文'});
 assert.equal(storyData(confirmedSceneSources(after,pinned)[0].clip!)?.description,'新版正文');assert.equal(sourceRefs(pinned)[0].description,'正文a');
 after.tracks[1].clips=[];assert.equal(confirmedSceneSources(after,pinned)[1].clip,undefined);assert.equal(confirmedSceneSources(after,pinned)[1].ref.description,'正文c');
 const confirmed=applyOps(structuredClone(before),[confirmation]);assert.deepEqual(applyOps(structuredClone(confirmed),inverse(before,confirmed,[confirmation])),before);
});
test('shot can link multiple storylines by stable IDs and native undo restores them',()=>{
 const shot:Clip={id:'shot',src:'beat.html',time:[0,4],attrs:{'data-story':JSON.stringify({kind:'shot',title:'特写'})}};
 const film:Film={tracks:[{clips:[shot]}]};const op=storyFields(shot,{beatIds:['a','c']});
 const after=applyOps(structuredClone(film),[op]);assert.deepEqual(shotBeatIds(after.tracks[0].clips[0]),['a','c']);assert.deepEqual(applyOps(structuredClone(after),inverse(film,after,[op])),film);
});
test('image playback replacement preserves screen duration and metadata; one undo restores original trim/source',()=>{
 const shot:Clip={id:'shot',src:'movie.mp4',at:8,time:[3,11],speed:2,attrs:{'data-link':'group','data-story':JSON.stringify({kind:'shot',title:'特写',beatIds:['a']})}};
 const film:Film={tracks:[{clips:[shot]}]};const op=shotImageOp(shot,'assets/storyboards/frame.jpg');
 const after=applyOps(structuredClone(film),[op]);const image=after.tracks[0].clips[0];assert.equal(image.src,'assets/storyboards/frame.jpg');assert.equal(clipEnd(image),12);assert.equal(image.attrs?.['data-link'],'group');assert.deepEqual(shotBeatIds(image),['a']);assert.deepEqual(applyOps(structuredClone(after),inverse(film,after,[op])),film);
});
test('shot sequence extent includes gaps and ignores hidden/disabled material',()=>{
 const film:Film={tracks:[{clips:[{...beat('s',0,4),attrs:{'data-story':'{"kind":"shot","title":"1"}'}},{...beat('t',7,4),attrs:{'data-story':'{"kind":"shot","title":"2"}'}}]},{hidden:true,clips:[{...beat('u',40,4),attrs:{'data-story':'{"kind":"shot","title":"3"}'}}]}]};
 assert.equal(shotSequenceDuration(film),11);
});
test('adopting actual shot duration pushes colliding scenes only, preserves sources and unused gap; one undo',()=>{
 const first:Clip={...scene,at:4,time:[0,4]};const next:Clip={...scene,id:'next',at:8,time:[0,4]};const tail:Clip={...scene,id:'tail',at:16,time:[0,4]};
 const before=source();before.tracks.push({clips:[first,next,tail],attrs:{'data-story-track':'scene','data-story-track-id':'scene'}});
 const ops=adoptSceneDuration(before,first,6);const after=applyOps(structuredClone(before),ops);
 assert.deepEqual(after.tracks.slice(0,2),before.tracks.slice(0,2));assert.deepEqual(after.tracks[2].clips.map(c=>[c.id,c.at,clipEnd(c)]),[['s',4,10],['next',10,14],['tail',16,20]]);
 assert.deepEqual(applyOps(structuredClone(after),inverse(before,after,ops)),before);
 before.tracks[2].locked=true;assert.throws(()=>adoptSceneDuration(before,first,6),/锁定/);
});
