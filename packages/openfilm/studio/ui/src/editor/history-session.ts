import type {Steps} from './steps';

/** Per-project undo stacks survive workbench navigation, never mixed across films or serialized to disk. */
export function createHistorySessions<S>(limit=32) {
  const values=new Map<string,Steps<S>>();
  return {
    get(id:string):Steps<S>{const value=values.get(id);if(!value)return {done:[],undone:[]};values.delete(id);values.set(id,value);return value;},
    set(id:string,value:Steps<S>){values.delete(id);values.set(id,value);while(values.size>limit)values.delete(values.keys().next().value!);},
  };
}
