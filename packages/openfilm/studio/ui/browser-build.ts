import type {Plugin} from 'vite';
import {readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
export function browserBuild():Plugin {
  let output='';
  return {
    name:'openfilm-browser-shell',
    configResolved(config){output=resolve(config.root,config.build.outDir);},
    generateBundle(){
      this.emitFile({type:'asset',fileName:'browser-plugin/edit.js',source:"export { default } from 'openfilm/workbench/edit';\n"});
      this.emitFile({type:'asset',fileName:'manifest.webmanifest',source:JSON.stringify({name:'剧本导演工作台',short_name:'剧本工作台',start_url:'/',scope:'/',display:'standalone',background_color:'#18191d',theme_color:'#18191d',lang:'zh-CN',icons:[{src:'/browser-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]})});
      this.emitFile({type:'asset',fileName:'browser-icon.svg',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="36" fill="#18191d"/><path d="M48 48h96v22H48zm0 37h72v22H48zm0 37h48v22H48z" fill="#08b9c8"/></svg>'});
    },
    transformIndexHtml(html){return html.replace('<title>OpenFilm Studio</title>','<title>剧本导演工作台</title><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#18191d">');},
    async closeBundle(){
      const walk=async(dir:string):Promise<string[]>=>{
        const entries=await readdir(dir,{withFileTypes:true});
        return (await Promise.all(entries.map(e=>e.isDirectory()?walk(join(dir,e.name)):Promise.resolve([join(dir,e.name)])))).flat();
      };
      const files=(await walk(output)).map(path=>'/'+path.slice(output.length+1).replaceAll('\\','/')).filter(path=>path!=='/browser-sw.js'&&path!=='/browser-precache.json'&&!path.endsWith('.map'));
      await writeFile(join(output,'browser-precache.json'),JSON.stringify({files}));
    },
  };
}
