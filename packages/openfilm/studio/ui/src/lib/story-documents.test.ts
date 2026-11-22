import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Film,Clip} from '../api.ts';
import {applyOps} from '../../../server/ops.mjs';
import {filmHtml,readFilmFile} from '../../../../src/film-doc.mjs';
import {inverse} from '../editor/undo.ts';
import {confirmedSceneSources,editStoryDocument,materializeStory,referenceParagraphs,shareStoryOccurrence,sourceRefs,storyData,storyDocument,selectSceneSources,updateStoryText} from './story-content.ts';
const beat:Clip={id:'a',src:'story-beat.html',at:0,time:[0,20],attrs:{'data-link':'old-link','data-story':JSON.stringify({kind:'beat',title:'来信与拆信',description:'街口收到信。\n\n邮局拆开信。'})}};
const scene=(id:string,at:number):Clip=>({id,src:`parts/${id}/film.html`,at,time:[0,10],attrs:{'data-story':JSON.stringify({kind:'scene',title:id,scriptSource:'confirmed',sourceRefs:[]})}});
const fixture=():Film=>({tracks:[{attrs:{title:'A','data-story-track':'beat','data-story-track-id':'A'},clips:[structuredClone(beat)]},{attrs:{title:'B','data-story-track':'beat','data-story-track-id':'B'},clips:[]},{attrs:{title:'场次','data-story-track':'scene','data-story-track-id':'S'},clips:[scene('s1',0),scene('s2',10)]}]});
const find=(film:Film,id:string)=>film.tracks.flatMap(t=>t.clips).find(c=>c.id===id)!;
test('cross-scene paragraphs use stable IDs, edit only affected sources, atomic undo restores document and refs',()=>{
 const before=fixture(),blocks=storyDocument(before,beat).blocks;
 const ops=referenceParagraphs(before,find(before,'s1'),beat,[blocks[0].id]);
 const first=applyOps(structuredClone(before),ops);
 const second=applyOps(first,referenceParagraphs(first,find(first,'s2'),find(first,'a'),[blocks[1].id]));
 assert.equal(storyData(confirmedSceneSources(second,find(second,'s1'))[0].clip!)?.description,'街口收到信。');
 assert.equal(storyData(confirmedSceneSources(second,find(second,'s2'))[0].clip!)?.description,'邮局拆开信。');
 const doc=storyDocument(second,find(second,'a'));
 const edit=editStoryDocument(second,find(second,'a'),{...doc,blocks:doc.blocks.map((b,i)=>i?b:{...b,text:'街口收到第二封信。'})});
 const changed=applyOps(structuredClone(second),edit);
 assert.equal(confirmedSceneSources(changed,find(changed,'s1'))[0].changed,true);
 assert.equal(confirmedSceneSources(changed,find(changed,'s2'))[0].changed,false);
 assert.deepEqual(applyOps(structuredClone(changed),inverse(second,changed,edit)),second);
});
test('shared content has independent time placement, follows a single document, survives original removal and undo',()=>{
 const before=fixture(),ops=shareStoryOccurrence(before,beat,1,'b'),shared=applyOps(structuredClone(before),ops);
 assert.equal(storyData(find(shared,'a'))?.contentId,storyData(find(shared,'b'))?.contentId);
 assert.equal(find(shared,'b').attrs?.['data-link'],undefined);
 const moved=applyOps(shared,[{op:'move',clip:'b',at:40}]);assert.equal(find(moved,'a').at,0);
 const edited=applyOps(moved,updateStoryText(moved,find(moved,'b'),'同一份改写。'));
 assert.equal(storyDocument(edited,find(edited,'a')).blocks[0].text,'同一份改写。');
 const removed=applyOps(edited,[{op:'remove',clip:'a'},{op:'remove',clip:'b'}]);
 assert.equal(Object.values(removed.screenplay!)[0].blocks[0].text,'同一份改写。');
 const fresh=applyOps(structuredClone(before),ops);
 assert.deepEqual(applyOps(structuredClone(fresh),inverse(before,fresh,ops)),before);
});
test('screenplay inert metadata roundtrips HTML, repeated saves, malicious strings and full deletion',()=>{
 const source=fixture(),m=materializeStory(source,beat);
 const film=applyOps(source,m.ops);film.screenplay![m.contentId].blocks[0].text='引号 " <script>alert(1)</script> </head> & 中文';
 const html=filmHtml(film);assert.deepEqual(readFilmFile(html).value.screenplay,film.screenplay);
 assert.deepEqual(readFilmFile(filmHtml(readFilmFile(html).value)).value,readFilmFile(html).value);
 assert.equal(readFilmFile(html).problems.length,0);
 assert.equal(filmHtml(film,html),html);
 const clear=structuredClone(film);delete clear.screenplay;
 assert.equal(readFilmFile(filmHtml(clear,html)).value.screenplay,undefined);
 assert.throws(()=>applyOps(fixture(),[{op:'screenplay',set:{bad:{title:'bad',blocks:[{id:'p',text:'1'},{id:'p',text:'2'}]}}}]));
});
test('deleted paragraphs stay missing rather than silently rebinding; creation and reference changes undo together',()=>{
 const before=fixture(),blocks=storyDocument(before,beat).blocks;
 const ops=selectSceneSources(before,find(before,'s1'),['a'],{a:[blocks[0].id]});
 const current=applyOps(structuredClone(before),ops),doc=storyDocument(current,find(current,'a'));
 const deleted=applyOps(structuredClone(current),editStoryDocument(current,find(current,'a'),{...doc,blocks:[doc.blocks[1]]}));
 const source=confirmedSceneSources(deleted,find(deleted,'s1'))[0];
 assert.equal(source.missingBlocks,true);assert.equal(source.changed,true);
 assert.equal(sourceRefs(find(deleted,'s1'))[0].description,'街口收到信。');
 assert.deepEqual(applyOps(structuredClone(current),inverse(before,current,ops)),before);
});
test('full-text insertion keeps unchanged paragraph IDs rather than consuming them by index',()=>{
 const before=fixture(),initial=storyDocument(before,beat);
 const changed=applyOps(before,updateStoryText(before,beat,'新增序言。\n\n街口收到信。\n\n邮局拆开信。'));
 const blocks=storyDocument(changed,find(changed,'a')).blocks;
 assert.equal(blocks[1].id,initial.blocks[0].id);assert.equal(blocks[2].id,initial.blocks[1].id);
});

test('screenplay survives writing back a headless legacy film fragment',()=>{
 const before=fixture(),source=materializeStory(before,beat),film=applyOps(before,source.ops);
 const text=filmHtml(film,'<section><img id="old" src="old.png#t=0,4"></section>');
 assert.deepEqual(readFilmFile(text).value.screenplay,film.screenplay);
});
