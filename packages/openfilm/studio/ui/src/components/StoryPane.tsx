import * as React from 'react';
import { Clapperboard, Link2, Link2Off, Plus } from 'lucide-react';
import { api, ApiError, projectEvents, type Clip, type Film as FilmValue, type Op, type ProjectFilm } from '@/api';
import { openStoryProject } from '@/lib/project-handoff';
import './StoryPane.css';
import { StoryOverview } from './StoryOverview';
import { STORY_ENTER_SCENE, STORY_LEAVE_SCENE, STORY_LOCATION_EVENT, locateStory, saveStoryPreference, storyPreference, rememberStoryLocation, rememberedStoryLocation, type StoryLocation, type StoryView } from '@/lib/story-navigation';
import { Field, StoryDraftContext } from './StoryField';
import { StoryNavigator } from './StoryNavigator';
import { StoryHelp, type HelpAction } from './StoryHelp';
import { storyTime } from '@/lib/story-overview';
import { SceneReferences, ShotBeatLinks } from './StoryReferences';
import {StoryStructurePanel} from './StoryStructure';
import {initializeStructure,sceneNumber,storyGroupPath} from '@/lib/story-structure';
import { StoryContentEditor, StoryDocumentLibrary } from './StoryContentEditor';
import { SceneTiming } from './StoryTiming';
import { importStoryImage, storedStoryImage, storyImageUrl } from '@/lib/story-media';

import { storyData, resolvedStoryClip, storyDocument, editStoryDocument, updateStoryText, clipEnd, sceneCandidates, sceneRange, confirmedSceneSources, shotImageOp, shotSequenceDuration, type StoryData } from '@/lib/story-content';
export { storyData, type StoryData } from '@/lib/story-content';

type Write = (ops: Op[], label?: string) => Promise<string | null>;

export function storyLinkOps(film: FilmValue, id: string): Op[] {
  const clips = film.tracks.flatMap(track => track.clips);
  const selected = clips.find(clip => clip.id === id);
  if (!selected) return [];
  const attrs = { ...selected.attrs };
  if (attrs['data-link']) {
    delete attrs['data-link'];
    return [{ op: 'fields', clip: id, fields: { attrs } }];
  }
  const target = clips.find(clip => storyData(clip)?.kind === 'scene' &&
    (selected?.at ?? 0) >= (clip.at ?? 0) && (selected?.at ?? 0) < clipEnd(clip));
  if (!target) return [];
  attrs['data-link'] = target.attrs?.['data-link'] ?? target.id;
  return [
    { op: 'fields', clip: id, fields: { attrs } },
    { op: 'fields', clip: target.id, fields: { attrs: { ...target.attrs, 'data-link': attrs['data-link'] } } },
  ];
}

export function StoryPane({ projectId, film, outer, focusedId, selectedIds, timeMs, range, mediaBase, projectName, headerTools, onContentMode, settle, write, onSelectClip }: {
  projectId: string; film: FilmValue; focusedId: string | null; selectedIds: readonly string[]; timeMs: number; write: Write;
  outer?: ProjectFilm['outer'];
  mediaBase: string;
  projectName: string;
  headerTools?:React.ReactNode;
  onContentMode(content:boolean):void;
  settle():Promise<void>;
  range?: {startMs: number; endMs: number} | null;
  onSelectClip(id: string): void;
}) {
  const [view, setView] = React.useState<StoryView>(() => storyPreference(projectId)?.view ?? (
    film.tracks.some(track => track.attrs?.['data-story-track'] === 'shot' || track.clips.some(clip => storyData(clip)?.kind === 'shot')) ? 'board' : 'script'));
  React.useEffect(()=>{const saved=storyPreference(projectId);saveStoryPreference(projectId,{...saved,view,rootId:saved?.rootId??outer?.id??projectId});},[projectId,view,outer?.id]);
  React.useEffect(()=>{const onLocation=(event:Event)=>{const target=(event as CustomEvent<StoryLocation>).detail;if(target?.projectId===projectId)setView(target.view);};window.addEventListener(STORY_LOCATION_EVENT,onLocation);return()=>window.removeEventListener(STORY_LOCATION_EVENT,onLocation);},[projectId]);
  const [helpOpen,setHelpOpen]=React.useState(false);
  const [dirtyFields,setDirtyFields]=React.useState<Set<string>>(new Set());
  const reportDirty=React.useCallback((id:string,dirty:boolean)=>setDirtyFields(previous=>{if(previous.has(id)===dirty)return previous;const next=new Set(previous);if(dirty)next.add(id);else next.delete(id);return next;}),[]);
  const [mode, setMode] = React.useState<'writing' | 'scenes'>('writing');
  const [sceneDraft, setSceneDraft] = React.useState<{start: number; end: number; title: string; empty?:boolean} | null>(null);
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState(0);
  const [navigating, setNavigating] = React.useState(false);
  const documentRef = React.useRef<HTMLDivElement>(null);
  const imageInput = React.useRef<HTMLInputElement>(null);
  const imageTarget = React.useRef<Clip | null>(null);
  const [outerContext, setOuterContext] = React.useState<{ film: FilmValue; scene: Clip } | null>(null);
  const [contextError, setContextError] = React.useState('');
  React.useEffect(() => {
    setOuterContext(null);
    setContextError('');
    if (!outer || outer.kind !== 'part') return;
    let active = true;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      try {
        const parent = await api.film(outer.id);
        const candidates=parent.value?.tracks.flatMap(track=>track.clips).filter(clip=>clip.src.replace(/#.*$/, '')===`parts/${outer.folder}/film.html`&&storyData(clip)?.kind==='scene')??[];
        const scene=candidates.find(clip=>clip.id===rememberedStoryLocation(outer.id)?.clipId)??candidates[0];
        if (active && generation === current) {
          setOuterContext(parent.value && scene ? { film: parent.value, scene } : null);
          setContextError(scene ? '' : '未找到所属场次。');
        }
      } catch (reason) { if (active) setContextError(reason instanceof Error ? reason.message : String(reason)); }
    };
    void load();
    const stop = projectEvents(outer.id, event => { if (event.type === 'film') void load(); });
    return () => { active = false; stop(); };
  }, [projectId, outer?.id, outer?.folder, outer?.kind]);
  const clips = film.tracks.flatMap(track => track.clips).map(clip=>resolvedStoryClip(film,clip));
  const scenes = clips.filter(clip => storyData(clip)?.kind === 'scene');
  const shots = clips.filter(clip => storyData(clip)?.kind === 'shot');
  const isShotFilm = Boolean(outer?.kind === 'part') && film.tracks.some(track=>track.attrs?.['data-story-track']==='shot');
  const beats = clips.filter(clip => storyData(clip)?.kind === 'beat');
  const picked = clips.find(clip => clip.id === focusedId && selectedIds.includes(clip.id))
    ?? clips.find(clip => selectedIds.includes(clip.id));
  const selected = picked && storyData(picked) ? picked
    : shots[0] ?? (mode === 'writing' ? beats.find(clip => timeMs / 1000 >= (clip.at ?? 0) && timeMs / 1000 < clipEnd(clip)) ?? beats[0] : scenes.find(clip => timeMs / 1000 >= (clip.at ?? 0) && timeMs / 1000 < clipEnd(clip)) ?? scenes[0]);
  const data = selected ? storyData(selected)! : null;
  React.useLayoutEffect(() => {
    const saved=storyPreference(projectId);
    if(documentRef.current && saved?.scrollTop) documentRef.current.scrollTop=saved.scrollTop;
  },[projectId]);
  React.useEffect(() => {
    const kind = picked && storyData(picked)?.kind;
    if (kind === 'scene') setMode('scenes');
    else if (kind === 'beat') setMode('writing');
  }, [picked?.id]);
  const activeView = view === 'board' && data?.kind === 'beat' ? 'script' : view;
  React.useEffect(()=>{onContentMode(activeView!=='picture');},[activeView,onContentMode]);
  const contextScene = isShotFilm ? outerContext?.scene : data?.kind === 'scene' ? selected : null;
  const contextFilm = isShotFilm ? outerContext?.film : film;
  const contextGroups = contextFilm && contextScene ? contextFilm.tracks.flatMap(track => {
    const entries = track.clips.filter(clip => {
      if (storyData(clip)?.kind !== 'beat') return false;
      if (storyData(contextScene)?.scriptSource === 'confirmed') return confirmedSceneSources(contextFilm,contextScene).some(ref=>ref.clip?.id===clip.id);
      const linked = Boolean(contextScene.attrs?.['data-link']) && clip.attrs?.['data-link'] === contextScene.attrs?.['data-link'];
      return linked || ((clip.at ?? 0) < clipEnd(contextScene) && clipEnd(clip) > (contextScene.at ?? 0));
    });
    return entries.length ? [{ name: track.attrs?.title ?? '故事线', entries }] : [];
  }) : [];
  const overlappingTracks = film.tracks.filter(track => {
    if (track.attrs?.['data-story-track'] !== 'beat') return false;
    const sorted = [...track.clips].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    return sorted.some((clip, index) => index > 0 && (clip.at ?? 0) < clipEnd(sorted[index - 1]) - .0005);
  });

  async function commit(ops: Op[], label: string) {
    setPending(value => value + 1);
    try { const failure = await write(ops,label); setError(failure ?? ''); return failure; }
    catch (reason) { const message=reason instanceof Error ? reason.message : String(reason); setError(message); return message; }
    finally { setPending(value => value - 1); }
  }

  function update(clip: Clip, field: keyof StoryData, value: string) {
    const current = storyData(clip);
    if (!current) return;
    if (!writable(clip)) {setError('所在轨道已锁定。');return;}
    if(current.kind==='beat' && (field==='description'||field==='title')) {
      const latest=filmRef.current.tracks.flatMap(track=>track.clips).find(item=>item.id===clip.id)??clip;
      void commit(field==='description'?updateStoryText(filmRef.current,latest,value):editStoryDocument(filmRef.current,latest,{...storyDocument(filmRef.current,latest),title:value}),'编辑共享剧本正文');return;
    }
    void commit([{ op: 'fields', clip: clip.id,
      fields: { attrs: { ...clip.attrs, 'data-story': JSON.stringify({ ...current, [field]: value }) } } }], '编辑剧本与分镜');
  }

  async function enterScene(scene = selected) {
    if (navigating) return;
    setNavigating(true);
    try {
      if (!scene) return;
      await settle();
      rememberStoryLocation({projectId,rootId:projectId,clipId:scene.id,atMs:timeMs,view:'script',anchor:'',scrollTop:documentRef.current?.scrollTop??0,restorePosition:true});
      const folder = scene.src.replace(/\/film\.html.*$/, '');
      const { project } = await api.openPartFilm(projectId, folder);
      const saved = rememberedStoryLocation(project.id);
      if (saved) await locateStory(saved,projectId);
      else { saveStoryPreference(project.id,{view:'board',rootId:projectId}); await openStoryProject(project.id); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setNavigating(false); }
  }
  async function leaveScene() {
    if (!outer || navigating) return;
    setNavigating(true);
    try {
      await settle();
      rememberStoryLocation({projectId,rootId:outer.id,clipId:selected?.id??'',atMs:timeMs,view,anchor:'',scrollTop:documentRef.current?.scrollTop??0,restorePosition:true});
      const saved=rememberedStoryLocation(outer.id);
      const scene=outerContext?.scene;
      await locateStory(saved??{projectId:outer.id,rootId:outer.id,clipId:scene?.id??'',atMs:(scene?.at??0)*1000,view:'script',anchor:'',scrollTop:0},projectId);
    } catch(reason) { setError(reason instanceof Error?reason.message:String(reason)); }
    finally { setNavigating(false); }
  }
  React.useEffect(() => {
    const enter = (event:Event) => { const id=(event as CustomEvent<string>).detail;const scene=scenes.find(clip=>clip.id===id);if(scene)void enterScene(scene); };
    const leave = () => { void leaveScene(); };
    window.addEventListener(STORY_ENTER_SCENE,enter);window.addEventListener(STORY_LEAVE_SCENE,leave);
    return()=>{window.removeEventListener(STORY_ENTER_SCENE,enter);window.removeEventListener(STORY_LEAVE_SCENE,leave);};
  });

  async function ensurePage() {
    try { await api.readPage(projectId, 'story-beat.html'); }
    catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 404) throw reason;
      await api.writePage(projectId, 'story-beat.html', '<!doctype html><meta charset="utf-8"><style>body{background:#18191d;color:#eee}</style><script>window.film={duration:4,frame(t){}};</script>', null);
    }
  }

  async function addBeat(index?: number) {
    setPending(value => value + 1);
    try {
      await ensurePage();
      const id = crypto.randomUUID();
      const ops: Op[] = [];
      if (index === undefined) {
        index = 0;
        ops.push({op:'story-track-add',id:crypto.randomUUID(),name:'A 线 · 剧本主线',at:0});
      }
      const contentId=`content:${id}`;
      ops.push({op:'screenplay',set:{[contentId]:{title:'新节拍',blocks:[{id:crypto.randomUUID(),text:''}]}}});
      ops.push({ op: 'insert', track: index, at: Math.round(timeMs) / 1000, clip: {
        id, src: 'story-beat.html', time: [0, 4],
        attrs: { 'data-story': JSON.stringify({ kind: 'beat', contentId, title: '新节拍', description: '' }) },
      } });
      const failure = await write(ops, '新增剧本节拍');
      setError(failure ?? '');
      if (!failure) { onSelectClip(id); setMode('writing'); setView('script'); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(value => value - 1); }
  }

  async function prepareScene() {
    // Clicking the action blurs a draft field. Wait for that write rather than
    // disabling the button between pointer-down and click and losing the action.
    await settle();
    const draft = sceneRange(filmRef.current, selectedIds, range);
    if (draft.end <= draft.start) { setError('先选择剧本节拍，或在时间标尺上按住 Shift 拖出选区。'); return; }
    setError('');
    setSceneDraft({...draft,title:`场次 ${scenes.length + 1}`});
    documentRef.current?.scrollTo({top:0});
  }

  async function createScene() {
    if (!sceneDraft || pending) return;
    const {start,end,title} = sceneDraft;
    if (!title.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      setError('请填写场次名称和有效的起止时间。'); return;
    }
    if (!sceneDraft.empty && !sceneCandidates(film, {id:'draft',src:'',at:start,time:[0,end-start]}).length) {
      setError('这个范围没有剧本节拍，请调整选区。'); return;
    }
    const track = film.tracks.findIndex(track => track.attrs?.['data-story-track'] === 'scene');
    if (track >= 0 && film.tracks[track].locked) { setError('场次划分轨道已锁定。'); return; }
    if (scenes.some(scene => (scene.at ?? 0) < end && clipEnd(scene) > start)) {
      setError('选区与已有场次重叠，请调整边界后再划分。'); return;
    }
    setPending(value => value + 1);
    try {
      await ensurePage();
      const {folder} = await api.writePartFilm(projectId, title, {stage:film.stage,tracks:[{
        attrs:{title:'场内镜头','data-story-track':'shot'},clips:[],
      }]});
      const ops: Op[] = film.storyStructure?[]:initializeStructure(film);
      if (track < 0) ops.push({op:'story-track-add',id:crypto.randomUUID(),name:'场次划分',at:film.tracks.length,kind:'scene'});
      const id = crypto.randomUUID();
      ops.push({op:'insert',track:track < 0 ? film.tracks.length : track,at:start,clip:{
        id,src:`${folder}/film.html`,time:[0,end-start],
        attrs:{'data-story':JSON.stringify({kind:'scene',title:title.trim(),scriptSource:'confirmed',
          sourceRefs: (sceneDraft.empty?[]:sceneCandidates(film,{id:'draft',src:'',at:start,time:[0,end-start]})).map(({clip})=>({id:clip.id,title:storyData(clip)!.title,description:storyData(clip)!.description ?? '',...(storyData(clip)?.contentId?{contentId:storyData(clip)!.contentId}:{}),at:clip.at ?? 0,end:clipEnd(clip)}))})},
      }});
      const failure = await write(ops,sceneDraft.empty?'新建空场次':'从剧本选区划为场次');
      setError(failure ?? '');
      if (!failure) { setSceneDraft(null); setMode('scenes'); setView('script'); onSelectClip(id); }
    } catch (reason) {setError(reason instanceof Error ? reason.message : String(reason));}
    finally {setPending(value => value - 1);}
  }

  const filmRef = React.useRef(film);
  filmRef.current = film;
  const writable = (clip: Clip) => !filmRef.current.tracks.some(track=>track.locked && track.clips.some(item=>item.id===clip.id));
  async function replaceImage(clip: Clip, blob: Blob) {
    if (!writable(clip)) {setError('镜头轨道已锁定。');return;}
    setPending(value=>value+1);
    try {
      const path = await importStoryImage(projectId,blob);
      const current = filmRef.current.tracks.flatMap(track=>track.clips).find(item=>item.id===clip.id);
      if (!current || !writable(current)) throw new Error('镜头已删除或轨道已锁定。');
      await commit([shotImageOp(current,path)],'替换分镜画面与播放素材');
    } catch(reason) {setError(reason instanceof Error ? reason.message : String(reason));}
    finally {setPending(value=>value-1);}
  }
  const unconnectedImages = shots.filter(shot=>storyData(shot)?.image && (shot.src.split('#')[0] !== storyData(shot)?.image || (Boolean(outer) && shot.src.startsWith('assets/storyboards/'))));
  async function connectImages() {
    setPending(value=>value+1);
    try {
      if (unconnectedImages.some(shot=>!writable(shot))) throw new Error('镜头轨道已锁定。');
      const paths = [];
      for (const shot of unconnectedImages) {
        const blob = await storedStoryImage(storyData(shot)!.image!,mediaBase);
        paths.push({id:shot.id,path:await importStoryImage(projectId,blob)});
      }
      const ops = paths.map(({id,path})=>{
        const current = filmRef.current.tracks.flatMap(track=>track.clips).find(clip=>clip.id===id);
        if (!current || !writable(current)) throw new Error('镜头已删除或轨道已锁定，请重试。');
        return shotImageOp(current,path);
      });
      if (ops.length) await commit(ops,'接入已有分镜图播放');
    } catch(reason) {setError(reason instanceof Error ? reason.message : String(reason));}
    finally {setPending(value=>value-1);}
  }

  const linked = Boolean(selected?.attrs?.['data-link']);
  const target = scenes.find(scene => (selected?.at ?? 0) >= (scene.at ?? 0) && (selected?.at ?? 0) < clipEnd(scene));
  const changeLink = () => {
    const ops = storyLinkOps(film, selected!.id);
    void commit(ops, linked ? '解除节拍关联' : '关联故事节拍');
  };

  const selectedTrack=film.tracks.find(track=>track.clips.some(clip=>clip.id===selected?.id));
  const scope=outer?storyData(outerContext?.scene ?? {id:'',src:''})?.title??projectName:'全片';
  const objectKind=data?.kind==='shot'?'镜头':data?.kind==='scene'?'场次':'节拍';
  const sidebarKind=isShotFilm?'shot':mode==='scenes'?'scene':'beat';
  const saveState=error?'error':pending?'saving':dirtyFields.size?'dirty':'saved';
  async function focusHere(clip:Clip) {
    await settle();if(!isShotFilm||view==='script')documentRef.current?.scrollTo({top:0});onSelectClip(clip.id);
    if(isShotFilm&&view==='board')requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-story-shot="${CSS.escape(clip.id)}"]`)?.scrollIntoView({block:'nearest'}));
    locateStory({projectId,rootId:outer?.id??projectId,clipId:clip.id,atMs:(clip.at??0)*1000,view:activeView==='picture'?'picture':isShotFilm?view==='script'?'script':'board':'script',anchor:'',scrollTop:0},projectId);
  }
  async function switchWorkspace(next:'writing'|'scenes') {
    setMode(next);
    if(!outer){setView('script');onSelectClip(next==='writing'?(beats.find(clip=>clip.id===selected?.id)??beats[0])?.id??'':(scenes.find(clip=>clip.id===selected?.id)??scenes[0])?.id??'');return;}
    await settle();
    try {
      let root=await api.film(outer.id);const seen=new Set<string>();
      while(root.outer){if(seen.has(root.project.id))throw new Error('工程父级关系异常');seen.add(root.project.id);root=await api.film(root.outer.id);}
      const candidates=root.value?.tracks.flatMap(track=>track.clips).filter(clip=>storyData(clip)?.kind===(next==='writing'?'beat':'scene'))??[];
      const target=next==='scenes'?candidates.find(clip=>clip.id===outerContext?.scene.id)??candidates[0]:candidates[0];
      if(target)locateStory({projectId:root.project.id,rootId:root.project.id,clipId:target.id,atMs:(target.at??0)*1000,view:'script',anchor:'',scrollTop:0},projectId);
      else {saveStoryPreference(root.project.id,{view:'script',rootId:root.project.id});await openStoryProject(root.project.id);}
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
  }
  async function addShot() {
    const track=film.tracks.findIndex(track=>track.attrs?.['data-story-track']==='shot');
    if(track<0||film.tracks[track].locked){setError('镜头轨道已锁定或不存在');return;}
    const id=crypto.randomUUID(),at=Math.max(0,...shots.map(clipEnd));
    const failure=await commit([{op:'insert',track,at,clip:{id,src:'../../story-beat.html',time:[0,4],attrs:{'data-story':JSON.stringify({kind:'shot',title:'新镜头',description:'',framing:'',movement:'',notes:''})}}}],'新增分镜');
    if(!failure){onSelectClip(id);setView('board');requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-story-shot="${CSS.escape(id)}"]`)?.scrollIntoView({block:'nearest'}));locateStory({projectId,rootId:outer?.id??projectId,clipId:id,atMs:at*1000,view:'board',anchor:'',scrollTop:0},projectId);}
  }
  async function helpAction(action:HelpAction) {
    setHelpOpen(false);
    if(action==='read'){setView('overview');return;}
    if(action==='write'){await switchWorkspace('writing');return;}
    if(isShotFilm){setView('board');return;}
    const scene=data?.kind==='scene'?selected:scenes[0];
    if(!scene){setMode('scenes');setView('script');setError('先选择剧本节拍或时间选区，再点击「选区划为场次」');return;}
    await enterScene(scene);
  }

  return <StoryDraftContext.Provider value={reportDirty}><div className={`story-surface ${activeView === 'picture' ? 'story-picture' : ''}`} data-story-project={projectId} data-story-workspace="" data-film-inspector="">
    <header className="studio-header">
      <div className="studio-header-top"><div className="studio-product"><strong>剧本与分镜</strong><span>{scope}</span></div><div className="studio-header-tools"><span className="studio-save-state" data-save-state={saveState} role="status">{error?'需要处理':pending?'正在保存…':dirtyFields.size?'离开输入框后保存':'已保存到工程'}</span><button className="studio-help-trigger" onClick={()=>setHelpOpen(true)}>操作与验收</button>{headerTools&&<div className="studio-native-tools" aria-label="工作区工具">{headerTools}</div>}</div></div>
      <nav className="studio-navigation" aria-label="工作区导航">
        <button aria-pressed={view!=='overview' && !isShotFilm && mode==='writing'} onClick={()=>void switchWorkspace('writing')}>剧本创作</button>
        <button aria-pressed={view!=='overview' && (isShotFilm || mode==='scenes')} onClick={()=>isShotFilm?setView('board'):void switchWorkspace('scenes')}>场次与分镜</button>
        <button aria-pressed={view==='overview'} onClick={()=>setView('overview')}>全片总览</button>
      </nav>
    </header>
    <div className="studio-contextbar">
      <div className="studio-context-copy">{outer&&<button className="studio-back" disabled={navigating} onClick={()=>void leaveScene()}>返回场次主轨</button>}{contextScene&&contextFilm&&<span className="story-stable-number" data-current-scene-number={sceneNumber(contextFilm,contextScene)}>场号 {sceneNumber(contextFilm,contextScene)}</span>}<span>{activeView==='overview'?'全片阅读':`${selectedTrack?.attrs?.title??(isShotFilm?'场内镜头':mode==='scenes'?'场次划分':'剧本线')} / ${objectKind}`}</span>{selected&&activeView!=='overview'&&<small>{storyTime(selected.at??0)}—{storyTime(clipEnd(selected))} · {(clipEnd(selected)-(selected.at??0)).toFixed(1)} 秒</small>}</div>
      <div className="studio-context-actions">
        {view!=='overview'&&<div className="studio-view-switch" aria-label="内容与影像">{isShotFilm?<><button aria-pressed={activeView==='board'} onClick={()=>setView('board')}>分镜</button><button disabled={!selected} aria-pressed={activeView==='script'} onClick={()=>setView('script')}>镜头详情</button></>:<button aria-pressed={activeView==='script'} onClick={()=>setView('script')}>{data?.kind==='beat'?'节拍':'剧本'}</button>}<button aria-pressed={view==='picture'} onClick={()=>setView('picture')}>影像</button></div>}
        {!outer&&view!=='overview'&&<button className="studio-secondary" disabled={pending>0} onClick={async()=>{await settle();const start=Math.max(timeMs/1000,...scenes.map(clipEnd),0);setSceneDraft({start,end:start+4,title:`场次 ${scenes.length+1}`,empty:true});setMode('scenes');setView('script');}}>新建空场次</button>}
        {!outer&&view!=='overview'&&<button className={mode==='scenes' && data?.kind!=='scene'?'story-primary':'studio-secondary'} onClick={()=>void prepareScene()}>选区划为场次</button>}
        {!outer&&mode==='writing'&&view!=='overview'&&(film.tracks.some(track=>track.attrs?.['data-story-track']==='beat')?<details className="studio-add-menu"><summary className="story-primary" aria-label="新增节拍">新增节拍</summary><div aria-label="选择新增节拍的剧本线">{film.tracks.map((track,index)=>track.attrs?.['data-story-track']==='beat'&&<button key={index} disabled={Boolean(pending)||track.locked} onClick={event=>{event.currentTarget.closest('details')!.open=false;void addBeat(index);}}>{track.attrs.title??'剧本线'}节拍</button>)}</div></details>:<button className="story-primary" disabled={pending>0} onClick={()=>void addBeat()}>新增节拍</button>)}
        {!outer&&mode==='scenes'&&data?.kind==='scene'&&view!=='overview'&&<button className="story-primary" disabled={pending>0||navigating} onClick={()=>void enterScene()}>{navigating?'正在进入…':'进入本场分镜'}</button>}
        {isShotFilm&&view!=='overview'&&<button className="story-primary" disabled={pending>0} onClick={addShot}><Plus size={16}/>新增镜头</button>}
      </div>
    </div>
    {helpOpen&&<StoryHelp onClose={()=>setHelpOpen(false)} onAction={action=>void helpAction(action)}/>}
    {activeView==='overview' && <StoryOverview projectId={projectId} film={film} outer={outer} mediaBase={mediaBase} projectName={projectName} focusedId={focusedId} onLocalView={setView} settle={settle}/>}
    {activeView !== 'picture' && activeView !== 'overview' && <div className="studio-edit-layout"><StoryNavigator film={film} kind={sidebarKind} selectedId={selected?.id} onSelect={clip=>void focusHere(clip)}/><div ref={documentRef} className="story-document">
      {!outer&&<StoryStructurePanel film={film} currentFilm={()=>filmRef.current} selectedIds={selectedIds} selected={selected} settle={settle} write={commit}/>}
      {outer&&contextScene&&contextFilm&&<p className="studio-field-hint">{storyGroupPath(contextFilm,contextFilm.storyStructure?.members[contextScene.id])} · 场号 {sceneNumber(contextFilm,contextScene)}</p>}
      {!outer&&mode==='writing'&&<StoryDocumentLibrary film={film} at={timeMs/1000} write={commit} disabled={pending>0}/>}
      {sceneDraft && <section className="story-scene-draft" aria-label="划分场次">
        <strong>{sceneDraft.empty?'新建空场次':'从剧本选区划分场次'}</strong><p>{sceneDraft.empty?'从画面或场面开始，无需先写节拍。稍后可关联正文并添加空镜头。':'先按时间范围引用节拍，创建后可在来源关联中勾选具体段落。'}</p>
        <label>场次名称<input aria-label="新场次名称" value={sceneDraft.title} onChange={e=>setSceneDraft({...sceneDraft,title:e.target.value})}/></label>
        <label>开始（秒）<input aria-label="场次选区开始" type="number" min="0" step="0.1" value={sceneDraft.start} onChange={e=>setSceneDraft({...sceneDraft,start:Number(e.target.value)})}/></label>
        <label>结束（秒）<input aria-label="场次选区结束" type="number" min="0" step="0.1" value={sceneDraft.end} onChange={e=>setSceneDraft({...sceneDraft,end:Number(e.target.value)})}/></label>
        <div className="story-scene-preview" aria-label="将引用的剧本内容" hidden={sceneDraft.empty}>{sceneCandidates(film,{id:'draft',src:'',at:sceneDraft.start,time:[0,Math.max(0,sceneDraft.end-sceneDraft.start)]}).map(({clip,line,crosses})=><p key={clip.id}>{line} · {storyData(clip)?.title}{crosses ? ' · 跨场节拍' : ''}</p>)}</div>
        <button disabled={pending > 0} onClick={()=>void createScene()}>{sceneDraft.empty?'创建空场次':'确认划为场次'}</button><button onClick={()=>setSceneDraft(null)}>取消划分</button>
      </section>}
      {!selected && !isShotFilm && <section className="story-enter"><h2>{mode === 'writing' ? '从剧本开始' : '从剧本划分场次'}</h2>
        <p>{mode === 'writing' ? '先写剧本节拍，再划分场次和设计分镜。时间标尺表示预计呈现时长。' : '选择剧本节拍，或按住 Shift 在标尺上拖出选区，再点击「选区划为场次」。'}</p>
        <button disabled={pending > 0} onClick={()=>void addBeat(film.tracks.findIndex(track=>track.attrs?.['data-story-track']==='beat') < 0 ? undefined : film.tracks.findIndex(track=>track.attrs?.['data-story-track']==='beat'))}>新增剧本节拍</button>
      </section>}
      {contextScene && <details className="story-context" data-story-context="">
        <summary>本场故事线 · {storyData(contextScene)?.title}</summary>
        {contextGroups.length ? <div className="story-context-groups">{contextGroups.map((group, index) =>
          <section key={index}><h3>{group.name}</h3>{group.entries.map(beat => {
            const linked = Boolean(contextScene.attrs?.['data-link']) && beat.attrs?.['data-link'] === contextScene.attrs?.['data-link'];
            return <p key={beat.id}><strong>{storyData(beat)?.title}</strong>{storyData(beat)?.description && <span className="story-context-body">{storyData(confirmedSceneSources(contextFilm!,contextScene!).find(entry=>entry.ref.id===beat.id)?.clip??resolvedStoryClip(contextFilm!,beat))?.description}</span>}<small>{storyData(contextScene)?.scriptSource === 'confirmed' ? '已确认的剧本来源' : linked ? '关联本场' : '独立节拍 · 时间范围经过本场'}</small></p>;
          })}</section>)}</div> : <p className="story-context-empty">本场暂无关联或时间重叠的故事节拍。</p>}
      </details>}
      {isShotFilm && contextFilm && contextScene && storyData(contextScene)?.scriptSource === 'confirmed' && confirmedSceneSources(contextFilm,contextScene).some(ref=>ref.changed||!ref.clip) && <div className="story-notice story-review" role="alert">本场剧本来源有变化或删除，请返回场次核对。{confirmedSceneSources(contextFilm,contextScene).filter(ref=>!ref.clip).map(({ref})=><p key={ref.id}>来源已删除 · {ref.title}：{ref.description}（上次确认内容）</p>)}</div>}
      {isShotFilm && contextError && <p role="alert" className="story-error">{contextError}</p>}
      <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          const clip = imageTarget.current;
          event.currentTarget.value = '';
          if (!file || !clip) return;
          void replaceImage(clip,file);
        }} />
      {error && <p role="alert" className="story-error">{error}</p>}
      {overlappingTracks.length > 0 && <div className="story-sequence-notice">
        <span>旧工程中有节拍重叠。按时间顺序推后，整理成单行。</span>
        <button disabled={pending > 0} onClick={() => void commit([{ op: 'story-pack' }], '整理故事线节拍')}>整理同轨节拍</button>
      </div>}
      {(selected || isShotFilm) && (activeView === 'board' && data?.kind === 'scene'
        ? <div className="story-enter"><h2>{data?.title}</h2><p>{data?.place}</p>
            <button onClick={() => void enterScene()}><Clapperboard size={16} />进入本场分镜时间轴</button>
          </div>
        : activeView === 'board' && isShotFilm
          ? <div className="story-table-scroll">{unconnectedImages.length>0 && <div className="story-notice"><span>{unconnectedImages.length} 张已有分镜图尚未接入播放。</span><button disabled={pending>0} onClick={()=>void connectImages()}>接入已有分镜图播放</button></div>}
            {outerContext && <div className="story-notice"><span>场次预估 {(clipEnd(outerContext.scene)-(outerContext.scene.at ?? 0)).toFixed(1)} 秒 · 镜头实排 {shotSequenceDuration(film).toFixed(1)} 秒。返回场次可核对并采用实排时长。</span></div>}
            <table className="story-table">
              <thead><tr><th>镜号</th><th>分镜画面</th><th>内容描述</th><th>景别 / 运镜</th><th>备注</th></tr></thead>
              <tbody>{shots.map((shot, index) => {
                const shotData = storyData(shot)!;
                return <tr key={shot.id} data-story-shot={shot.id} aria-selected={selectedIds.includes(shot.id)}
                  onPointerDown={() => onSelectClip(shot.id)}><th>{String(index + 1).padStart(2, '0')}<small>{(clipEnd(shot) - (shot.at ?? 0)).toFixed(1)} 秒</small></th>
                  <td>{shotData.image && <img alt={shotData.title} src={storyImageUrl(shotData.image,mediaBase)} style={{ width: '100%', maxWidth: 240 }} />}
                    <button disabled={pending>0 || !writable(shot)} onClick={() => { imageTarget.current = shot; imageInput.current?.click(); }}>添加画面</button></td>
                  <td><Field label="镜头名称" value={shotData.title} onSave={value => update(shot, 'title', value)} />
                    <ShotBeatLinks shot={shot} parent={outerContext?.film ?? null} write={commit} disabled={pending>0 || !writable(shot)}/>
                    <Field label="内容描述" multiline value={shotData.description ?? ''} onSave={value => update(shot, 'description', value)} /></td>
                  <td><Field label="景别" value={shotData.framing ?? ''} onSave={value => update(shot, 'framing', value)} />
                    <Field label="运镜" value={shotData.movement ?? ''} onSave={value => update(shot, 'movement', value)} /></td>
                  <td><Field label="备注" multiline value={shotData.notes ?? ''} onSave={value => update(shot, 'notes', value)} /></td></tr>;
              })}</tbody>
            </table></div>
          : <article className="story-page" key={selected?.id}>
              <Field label={data?.kind === 'beat' ? '节拍名称' : '标题'} value={data?.title ?? ''} onSave={value => update(selected!, 'title', value)} />
              {data?.kind === 'scene' && <>
                <Field label="地点 / 时段" value={data?.place ?? ''} onSave={value => update(selected!, 'place', value)} />
                <Field label="场次简介" multiline value={data?.summary ?? ''} onSave={value => update(selected!, 'summary', value)} />
                {(data?.scriptSource === 'timeline' || data?.scriptSource === 'confirmed') ? <SceneReferences film={film} scene={selected!} write={commit} onSelect={id=>{onSelectClip(id);setMode('writing');}} renderText={(clip)=><Field label={`引用正文 · ${storyData(clip)?.title}`} multiline value={storyData(clip)?.description ?? ''} onSave={value=>update(clip,'description',value)}/>} />
                  : <><p className="story-legacy">旧版场次正文 · 保留原有内容，尚未迁移到剧本线。</p>
                    <Field label="剧本正文" multiline value={data?.script ?? ''} onSave={value => update(selected!, 'script', value)} /></>}
                <SceneTiming projectId={projectId} scene={selected!} film={film} write={commit}/>
                <Field label="场面调度备注" multiline value={data?.notes ?? ''} onSave={value=>update(selected!,'notes',value)}/>

              </>}
              {data?.kind === 'shot' && <>
                <ShotBeatLinks shot={selected!} parent={outerContext?.film ?? null} write={commit} disabled={pending>0 || !writable(selected!)}/>
                <Field label="内容描述" multiline value={data?.description ?? ''} onSave={value => update(selected!, 'description', value)} />
                <Field label="景别" value={data?.framing ?? ''} onSave={value => update(selected!, 'framing', value)} />
                <Field label="运镜" value={data?.movement ?? ''} onSave={value => update(selected!, 'movement', value)} />
                <Field label="备注" multiline value={data?.notes ?? ''} onSave={value => update(selected!, 'notes', value)} />
              </>}
              {data?.kind === 'beat' && <>
                <Field label="节拍内容" multiline value={data?.description ?? ''} onSave={value => update(selected!, 'description', value)} />
                <p className="studio-field-hint">离开输入框自动保存 · 时长可在底部轨道调整</p>
                <StoryContentEditor film={film} clip={selected!} write={commit} disabled={pending>0||!writable(selected!)}/>
                <details className="studio-notes"><summary>创作备注</summary><Field label="节拍备注" multiline value={data?.notes ?? ''} onSave={value => update(selected!, 'notes', value)} /></details>
                <button className="studio-link-control" aria-pressed={linked} disabled={!linked && !target} onClick={changeLink}>
                {linked ? <Link2 size={14} /> : <Link2Off size={14} />}{linked ? '跟随场次 · 点击解除关联' : '独立节拍 · 点击关联场次'}
              </button></>}
            </article>)}
    </div></div>}
  </div></StoryDraftContext.Provider>;
}
