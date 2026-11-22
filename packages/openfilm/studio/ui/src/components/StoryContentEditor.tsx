import * as React from 'react';
import type {Clip,Film,Op} from '@/api';
import {editStoryDocument,shareStoryOccurrence,storyData,storyDocument} from '@/lib/story-content';
import {Field} from './StoryField';

type Write=(ops:Op[],label:string)=>Promise<string|null>;
export function StoryContentEditor({film,clip,write,disabled}:{film:Film;clip:Clip;write:Write;disabled:boolean}) {
  const doc=storyDocument(film,clip),contentId=storyData(clip)?.contentId;
  const occurrences=film.tracks.flatMap(track=>track.clips.filter(item=>item.id===clip.id || Boolean(contentId && storyData(item)?.contentId===contentId)).map(item=>({item,line:track.attrs?.title??'故事线'})));
  const [sharing,setSharing]=React.useState(false);
  return <section className="story-content-tools" aria-label="共享正文与段落">
    <p className="studio-field-hint">正文共享 · {occurrences.length} 个呈现片段。片段时间独立，正文修改同步。</p>
    <details className="studio-notes"><summary>按段落编辑与引用</summary>
      <p className="studio-field-hint">段落有稳定编号，可在场次的「编辑来源关联」中分别勾选。</p>
      {doc.blocks.map((block,index)=><fieldset key={block.id} disabled={disabled} data-story-paragraph={block.id}>
        <legend>段落 {index+1}</legend>
        <Field label={`正文段落 ${index+1}`} multiline value={block.text} onSave={text=>void write(editStoryDocument(film,clip,{...doc,blocks:doc.blocks.map(item=>item.id===block.id?{...item,text}:item)}),'修改共享正文段落')}/>
        <button disabled={doc.blocks.length===1} onClick={()=>void write(editStoryDocument(film,clip,{...doc,blocks:doc.blocks.filter(item=>item.id!==block.id)}),'删除正文段落')}>删除此段</button>
      </fieldset>)}
      <button disabled={disabled} onClick={()=>void write(editStoryDocument(film,clip,{...doc,blocks:[...doc.blocks,{id:crypto.randomUUID(),text:''}]}),'新增正文段落')}>新增正文段落</button>
    </details>
    <button disabled={disabled} onClick={()=>setSharing(!sharing)}>关联到另一条故事线</button>
    {sharing&&<div className="story-reference-picker" aria-label="选择共享正文的故事线"><p>在目标线新增呈现片段，引用同一份正文；不联动片段时间。</p>
      {film.tracks.map((track,index)=>track.attrs?.['data-story-track']==='beat'&&<button key={track.attrs['data-story-track-id']??index} disabled={disabled||track.locked} onClick={async()=>{if(!await write(shareStoryOccurrence(film,clip,index,crypto.randomUUID()),'关联共享正文到故事线'))setSharing(false);}}>关联到 {track.attrs.title??'故事线'}</button>)}
      <button onClick={()=>setSharing(false)}>取消</button>
    </div>}
    {occurrences.length>1&&<p className="studio-field-hint">出现位置：{occurrences.map(({line})=>line).join('、')}</p>}
  </section>;
}

/** Deleting the last timeline occurrence does not delete the writing. */
export function StoryDocumentLibrary({film,at,write,disabled}:{film:Film;at:number;write:Write;disabled:boolean}) {
  const [open,setOpen]=React.useState(false);
  return <section className="story-document-library">
    <button aria-expanded={open} onClick={()=>setOpen(!open)}>正文资料库 · {Object.keys(film.screenplay??{}).length}</button>
    {open&&<div aria-label="独立正文资料库"><p className="studio-field-hint">删除轨道片段后正文仍保留；可再次放入故事线。</p>
      {Object.entries(film.screenplay??{}).map(([id,doc])=><details key={id}><summary>{doc.title||'未命名正文'} · {doc.blocks.length} 段</summary>
        <p className="story-source-body">{doc.blocks.map(block=>block.text).join('\n\n')}</p>
        {film.tracks.map((track,index)=>track.attrs?.['data-story-track']==='beat'&&<button key={index} disabled={disabled||track.locked} onClick={()=>void write([{op:'insert',track:index,at,clip:{id:crypto.randomUUID(),src:'story-beat.html',time:[0,4],attrs:{'data-story':JSON.stringify({kind:'beat',contentId:id,title:doc.title,description:doc.blocks.map(block=>block.text).join('\n\n')})}}}],'从正文资料库新增呈现片段')}>放入 {track.attrs.title??'故事线'}</button>)}
      </details>)}
      {!Object.keys(film.screenplay??{}).length&&<p>编辑正文或关联来源后，正文将独立保存。</p>}
    </div>}
  </section>;
}
