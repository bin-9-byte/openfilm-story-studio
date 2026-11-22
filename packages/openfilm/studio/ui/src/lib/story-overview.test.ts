import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Film,Clip} from '../api';
import {storyReadingGroups,storyScenes,storyPartFolder,shotPresentation,storyTime} from './story-overview.ts';
const beat=(id:string,at:number,body:string):Clip=>({id,src:'beat.html',at,time:[0,10],attrs:{'data-story':JSON.stringify({kind:'beat',title:id,description:body})}});
test('full reading sorts screenplay time, keeps parallel lines and complete paragraphs without duplicating beats per scene',()=>{
 const film:Film={tracks:[{attrs:{title:'A'},clips:[beat('later',30,'结尾'),beat('past',10,'回忆\n人物：完整对白')]},{attrs:{title:'B'},clips:[beat('parallel',10,'认知线')]}]};
 const groups=storyReadingGroups(film);assert.deepEqual(groups.map(group=>[group.at,group.entries.map(entry=>entry.clip.id)]),[[10,['past','parallel']],[30,['later']]]);assert.ok(groups[0].entries[0].clip.attrs!['data-story'].includes('完整对白'));assert.deepEqual(storyReadingGroups(film,'B').flatMap(group=>group.entries.map(entry=>entry.clip.id)),['parallel']);
});
test('scene ordering is chronological and folders must refer to local compound films',()=>{
 const scene=(id:string,at:number,src:string):Clip=>({id,at,src,attrs:{'data-story':JSON.stringify({kind:'scene',title:id})}});
 const a=scene('a',20,'parts/a/film.html#t=0,5'),b=scene('b',4,'parts/b/film.html');assert.deepEqual(storyScenes({tracks:[{clips:[a,b]}]}).map(c=>c.id),['b','a']);assert.equal(storyPartFolder(a),'parts/a');assert.equal(storyPartFolder(scene('x',0,'https://example.com/film.html')),null);
});
test('shot location maps trimmed scene time and speed without hiding out-of-range shots',()=>{
 const scene:Clip={id:'scene',src:'parts/a/film.html',at:100,time:[5,15],speed:2};
 const shot:Clip={id:'shot',src:'image.jpg',at:3,time:[0,5]};
 assert.deepEqual(shotPresentation(scene,shot),{outside:false,localStart:5,globalStart:100,globalEnd:101.5,clipped:true});
 assert.deepEqual(shotPresentation(scene,{...shot,at:20}),{outside:true,localStart:20,globalStart:null,globalEnd:null,clipped:false});
 assert.equal(storyTime(59.999),'01:00');assert.equal(storyTime(396.5),'06:36.5');
});
