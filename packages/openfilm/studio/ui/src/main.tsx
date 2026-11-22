import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FocusNav } from './components/FocusNav';
import './globals.css';
import { applyStudioHost } from './lib/host';
import {BROWSER_LOCAL} from './browser/mode';
import {startBrowser} from './browser/start';

applyStudioHost();

const mount=()=>createRoot(document.getElementById('root')!).render(<StrictMode><FocusNav /><App /></StrictMode>);
if(BROWSER_LOCAL){
  document.getElementById('root')!.textContent='正在准备本机离线工作台…';
  void startBrowser().then(mount,error=>{document.getElementById('root')!.textContent=error instanceof Error?error.message:String(error);});
}else mount();
