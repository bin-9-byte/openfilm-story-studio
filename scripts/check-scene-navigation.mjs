// Browser regression: scene drill-down, exact return position, and timeline double-click.
import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const [rootId,sceneTitle,shotTitle]=process.argv.slice(2);if(!rootId||!sceneTitle||!shotTitle)throw new Error('Usage: node scripts/check-scene-navigation.mjs <root-project-id> <scene-title> <shot-title>');
const require=createRequire(new URL('../packages/openfilm/package.json',import.meta.url));const profile=await mkdtemp(join(tmpdir(),'openfilm-navigation-'));const {chromium}=require('playwright-core');const ctx=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:1351,height:928}});const page=ctx.pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
const key=(await readFile(new URL('../.story-studio/home/key',import.meta.url),'utf8')).trim();
await page.goto((process.env.STUDIO_URL??'http://127.0.0.1:4747')+'/projects/'+rootId+'?key='+key);
await page.getByRole('navigation',{name:'工作区导航'}).getByRole('button',{name:'场次与分镜',exact:true}).click();
await page.getByRole('button',{name:'选择场次 · '+sceneTitle,exact:true}).click();
await page.getByRole('button',{name:'进入本场分镜',exact:true}).waitFor();
await page.evaluate(()=>{window.__loadingFrames=0;window.__watch=new MutationObserver(()=>{if(document.querySelector('[aria-busy="true"].workspace-shell')&&!document.documentElement.hasAttribute('data-story-transition'))window.__loadingFrames++;});window.__watch.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-busy']});});
const rootScene=await page.getByRole('complementary',{name:'场次目录'}).locator('[aria-current="true"]').getAttribute('aria-label');const before=await page.getByRole('slider',{name:'拖动播放头',exact:true}).getAttribute('aria-valuenow');
const start=Date.now();await page.getByRole('button',{name:'进入本场分镜',exact:true}).click();
await page.getByRole('button',{name:'返回场次主轨',exact:true}).waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-story-transition'));
console.log('enterMs',Date.now()-start,'loadingMutations',await page.evaluate(()=>window.__loadingFrames));assert.ok(Date.now()-start<1800,'scene transition should not wait for its safety timeout');
assert.equal(await page.evaluate(()=>window.__loadingFrames),0,'scene drill-down should not flash full-page loading');
await page.getByRole('button',{name:'选择镜头 · '+shotTitle,exact:true}).click();await page.waitForTimeout(100);const shotTime=await page.getByRole('slider',{name:'拖动播放头',exact:true}).getAttribute('aria-valuenow');
await page.getByRole('button',{name:'返回场次主轨',exact:true}).click();await page.getByRole('button',{name:'进入本场分镜',exact:true}).waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-story-transition'));
assert.equal(await page.evaluate(()=>window.__loadingFrames),0,'return should not flash full-page loading');
assert.equal(await page.getByRole('complementary',{name:'场次目录'}).locator('[aria-current="true"]').getAttribute('aria-label'),rootScene);assert.equal(await page.getByRole('slider',{name:'拖动播放头',exact:true}).getAttribute('aria-valuenow'),before);
await page.locator('[data-workspace-timeline] [data-block-title]').filter({hasText:sceneTitle}).dblclick();await page.getByRole('button',{name:'返回场次主轨',exact:true}).waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-story-transition'));assert.equal(await page.getByRole('slider',{name:'拖动播放头',exact:true}).getAttribute('aria-valuenow'),shotTime);assert.equal(await page.getByRole('button',{name:'选择镜头 · '+shotTitle,exact:true}).getAttribute('aria-current'),'true');
assert.deepEqual(errors,[]);console.log('PASS enter/return without loading flashes');
}finally{await ctx.close();await rm(profile,{recursive:true,force:true})}
