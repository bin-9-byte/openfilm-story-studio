import * as React from 'react';

export const StoryDraftContext=React.createContext<(id:string,dirty:boolean)=>void>(()=>{});
export function Field({label,value,multiline=false,onSave}:{label:string;value:string;multiline?:boolean;onSave(value:string):void}) {
  const [draft,setDraft]=React.useState(value);
  const [focused,setFocused]=React.useState(false);
  const id=React.useId(),reportDirty=React.useContext(StoryDraftContext);
  React.useEffect(()=>{if(!focused)setDraft(value);},[value,focused]);
  React.useEffect(()=>{reportDirty(id,draft!==value);},[id,draft,value,reportDirty]);
  React.useEffect(()=>()=>reportDirty(id,false),[id,reportDirty]);
  const props={
    'aria-label':label,value:draft,
    onFocus:()=>setFocused(true),
    onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setDraft(event.target.value),
    onBlur:()=>{setFocused(false);if(draft!==value)onSave(draft);},
  };
  return <label className="story-field"><span>{label}</span>{multiline?<textarea {...props} rows={4}/>:<input {...props}/>}</label>;
}
