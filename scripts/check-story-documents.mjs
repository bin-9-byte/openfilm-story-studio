// Real browser regression against the existing private verification project.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const require=createRequire(new URL('../packages/openfilm/package.json',import.meta.url));const {chromium}=require('playwright-core');
const profile=await mkdtemp(join(tmpdir(),'openfilm-documents-qa-'));
const options={executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,locale:'zh-CN',viewport:{width:1440,height:1000}};
let context=await chromium.launchPersistentContext(profile,options),page=context.pages()[0];
const errors=[];const hook=()=>page.on('pageerror',e=>errors.push(e.stack));hook();
const base=process.env.BROWSER_URL??'http://127.0.0.1:4751',sample=process.argv[2];if(!sample)throw new Error('Pass original verification project folder');
const wait=()=>page.waitForTimeout(350);
// evaluate has no Node scope.
const film=async id=>(await page.evaluate(async id=>(await fetch('/api/projects/'+id)).json(),id)).value;
const meta=c=>JSON.parse(c.attrs['data-story']),clips=f=>f.tracks.flatMap(t=>t.clips),find=(f,id)=>clips(f).find(c=>c.id===id);
const undo=async()=>{await page.getByRole('button',{name:'撤销 (⌘Z)',exact:true}).click();await wait();};
const selectScene=async title=>{await page.getByRole('button',{name:'场次与分镜',exact:true}).click();await page.getByRole('button',{name:`选择场次 · ${title}`,exact:true}).click();};
let rootId,contentId,copyId;
try {
 await page.goto(base);await page.getByRole('button',{name:'新建工程',exact:true}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'新建工程',exact:true}).click();await page.locator('[data-story-project]').waitFor();
 const blankId=new URL(page.url()).pathname.split('/').pop();assert.equal(clips(await film(blankId)).length,0);
 await page.getByRole('button',{name:'新建空场次',exact:true}).click();await page.getByRole('button',{name:'创建空场次',exact:true}).click();await page.getByRole('button',{name:'进入本场分镜',exact:true}).click();await page.getByRole('button',{name:'新增镜头',exact:true}).waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-story-transition'));
 await page.getByRole('button',{name:'新增镜头',exact:true}).click();await page.locator('[data-story-shot]').waitFor();assert.equal(clips(await film(new URL(page.url()).pathname.split('/').pop())).length,1);
 await page.getByRole('button',{name:'本机工程',exact:true}).click();await page.getByRole('button',{name:'新建工程',exact:true}).waitFor();
 console.log('PASS completely blank project starts directly with empty scene and empty shot');
 await page.locator('input[webkitdirectory]').setInputFiles(sample);await page.locator('[data-story-project]').waitFor();rootId=new URL(page.url()).pathname.split('/').pop();
 const original=await film(rootId),scenes=clips(original).filter(c=>meta(c).kind==='scene');assert.equal(scenes.length,2);
 await page.getByRole('button',{name:'选择节拍 · 把下次当作字面承诺',exact:true}).click();
 await page.getByRole('textbox',{name:'节拍内容',exact:true}).fill('街口收到一封信。\n\n邮局拆开信，认出旧日笔迹。');await page.getByRole('textbox',{name:'节拍名称',exact:true}).click();await wait();
 let current=await film(rootId);contentId=meta(find(current,'b1')).contentId;assert.equal(current.screenplay[contentId].blocks.length,2);
 const beforeShare=current;
 await page.getByRole('button',{name:'关联到另一条故事线',exact:true}).click();await page.getByRole('button',{name:/^关联到 A 线/}).click();await wait();
 current=await film(rootId);let appearances=clips(current).filter(c=>meta(c).contentId===contentId);assert.equal(appearances.length,2);const shared=appearances.find(c=>c.id!=='b1');assert.equal(shared.attrs['data-link'],undefined);
 await undo();assert.deepEqual((await film(rootId)).tracks,beforeShare.tracks);assert.deepEqual((await film(rootId)).screenplay,beforeShare.screenplay);
 await page.getByRole('button',{name:/^重做 \(/}).click();await wait();
 // Either occurrence edits canonical writing; both timeline labels/body mirrors update.
 await page.getByRole('textbox',{name:'节拍内容',exact:true}).fill('街口收到第二封信。\n\n邮局拆开信，认出旧日笔迹。');await page.getByRole('textbox',{name:'节拍名称',exact:true}).click();await wait();
 current=await film(rootId);appearances=clips(current).filter(c=>meta(c).contentId===contentId);assert.ok(appearances.every(c=>meta(c).description.includes('第二封信')));
 console.log('PASS original sample: one document shared by A/B appearances; synchronized writing and atomic undo/redo');
 const beforeMove=structuredClone(current);
 const card=page.locator('[data-block-title="把下次当作字面承诺"]').first();await card.scrollIntoViewIfNeeded();const b=await card.boundingBox();await page.mouse.move(b.x+Math.min(25,b.width/2),b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+Math.min(25,b.width/2)+80,b.y+b.height/2,{steps:15});await page.mouse.up();await wait();
 current=await film(rootId);assert.notEqual(find(current,shared.id).at,find(beforeMove,shared.id).at);assert.equal(find(current,'b1').at,find(beforeMove,'b1').at);assert.deepEqual(current.screenplay,beforeMove.screenplay);await undo();
 console.log('PASS native shared appearance drag is independent and undo restores whole timeline');
 for(let index=0;index<2;index++) {
  await selectScene(meta(scenes[index]).title);await page.getByRole('button',{name:'编辑来源关联',exact:true}).click();
  const picker=page.getByRole('region',{name:'场次引用正文'}); // section has aria-label
  const checked=picker.locator('fieldset > label > input:checked');while(await checked.count())await checked.first().uncheck();
  const choice=picker.locator('[data-source-choice="b1"]');await choice.locator('> label > input').check();
  await choice.getByRole('checkbox',{name:`引用 把下次当作字面承诺 段落 ${index===0?2:1}`,exact:true}).uncheck();
  await page.getByRole('button',{name:'保存来源关联',exact:true}).click();await wait();
  const ref=meta(find(await film(rootId),scenes[index].id)).sourceRefs[0];assert.equal(ref.contentId,contentId);assert.equal(ref.blockIds.length,1);
  assert.equal(ref.description,index===0?'街口收到第二封信。':'邮局拆开信，认出旧日笔迹。');
  assert.equal(await page.locator('[data-paragraph-reference]').innerText(),ref.description);
 }
 console.log('PASS two existing scenes reference different stable paragraphs of the same shared document');
 await page.getByRole('button',{name:'新建空场次',exact:true}).click();await page.getByRole('textbox',{name:'新场次名称',exact:true}).fill('空场次验证');await page.getByRole('button',{name:'创建空场次',exact:true}).click();await wait();
 current=await film(rootId);const empty=clips(current).find(c=>meta(c).title==='空场次验证');assert.deepEqual(meta(empty).sourceRefs,[]);const beforeUndo=current;
 await undo();assert.ok(!clips(await film(rootId)).some(c=>c.id===empty.id));await page.getByRole('button',{name:/^重做 \(/}).click();await wait();assert.deepEqual((await film(rootId)).tracks,beforeUndo.tracks);
 await page.getByRole('button',{name:'进入本场分镜',exact:true}).click();await page.getByRole('button',{name:'新增镜头',exact:true}).waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-story-transition'));
 const childId=new URL(page.url()).pathname.split('/').pop();await page.getByRole('button',{name:'新增镜头',exact:true}).click();await page.locator('[data-story-shot]').waitFor();assert.equal(clips(await film(childId)).length,1);await undo();assert.equal(clips(await film(childId)).length,0);await page.getByRole('button',{name:/^重做 \(/}).click();await wait();
 assert.equal(meta(clips(await film(childId))[0]).description,'');
 console.log('PASS empty scene → empty storyboard shot without beat prerequisite; scene and shot undo/redo');
 const links=page.locator('[data-story-shot] [data-shot-links]');await links.locator('summary').click();await links.getByRole('button',{name:'选择关联节拍',exact:true}).click();const choice=links.locator('[data-source-choice="b1"]');await choice.locator('> label > input').check();await choice.getByRole('checkbox',{name:'镜头引用 把下次当作字面承诺 段落 1',exact:true}).uncheck();await links.getByRole('button',{name:'保存镜头关联',exact:true}).click();await wait();
 assert.equal(meta(clips(await film(childId))[0]).sourceRefs[0].blockIds.length,1);
 assert.ok((await links.innerText()).includes('邮局拆开信'));assert.ok(!(await links.innerText()).includes('街口收到第二封信'));
 console.log('PASS empty shot links a specific source paragraph');
 await context.setOffline(true);await page.reload();await page.locator('[data-story-shot]').waitFor();await page.getByRole('button',{name:'返回场次主轨',exact:true}).click();await page.getByRole('button',{name:'进入本场分镜',exact:true}).waitFor();
 const expected=await film(rootId);assert.equal(expected.screenplay[contentId].blocks.length,2);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出工程',exact:true}).click();const download=await downloadPromise;const backup='/private/tmp/story-documents.openfilm.json';await download.saveAs(backup);const archive=JSON.parse(await readFile(backup,'utf8'));assert.ok(archive.files.length>100);
 await page.getByRole('button',{name:'本机工程',exact:true}).click();await page.locator('input[accept=".json,.openfilm.json"]').setInputFiles(backup);await page.locator('[data-story-project]').waitFor();copyId=new URL(page.url()).pathname.split('/').pop();assert.notEqual(copyId,rootId);assert.deepEqual((await film(copyId)).screenplay,expected.screenplay);assert.deepEqual((await film(copyId)).tracks,expected.tracks);
 await selectScene('空场次验证');await page.getByRole('button',{name:'进入本场分镜',exact:true}).click();await page.locator('[data-story-shot]').waitFor();assert.equal(meta(clips(await film(new URL(page.url()).pathname.split('/').pop()))[0]).sourceRefs[0].blockIds.length,1);
 const reopen=page.url();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-story-transition'));await page.waitForTimeout(180);await page.screenshot({path:'/private/tmp/story-documents-verified.png'});await context.close();context=await chromium.launchPersistentContext(profile,options);await context.setOffline(true);page=context.pages()[0];hook();await page.goto(reopen);await page.locator('[data-story-shot]').waitFor();
 assert.deepEqual((await film(copyId)).screenplay,expected.screenplay);assert.deepEqual(errors,[]);
 console.log('PASS offline autosave/reload, complete archive/import and browser process restart preserve documents, references, tracks and shots');
 await writeFile('/private/tmp/story-documents-report.json',JSON.stringify({rootId,copyId,contentId,profile,errors,archiveFiles:archive.files.length},null,2));
} catch(e) {console.error(e);console.log((await page.locator('body').innerText()).slice(-4500));await page.screenshot({path:'/private/tmp/story-documents-failure.png'});throw e;} finally {await context.close();}
