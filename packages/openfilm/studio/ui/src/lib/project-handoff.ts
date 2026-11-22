import { api, type ProjectFilm } from '@/api';
import { openProject } from './navigate';
import { studioHost } from './host';

// Only pass on a freshly read destination once; normal reads and file events
// remain authoritative. This is not a persistent project cache.
const handoffs = new Map<string, ProjectFilm>();
export function takeProjectHandoff(id: string): ProjectFilm | undefined {
  const value = handoffs.get(id);
  handoffs.delete(id);
  return value;
}

function destinationReady(id: string): Promise<void> {
  return new Promise(resolve => {
    let finishing = false;
    const finish = () => { observer.disconnect(); clearTimeout(timeout); resolve(); };
    const check = () => {
      const surface = document.querySelector(`[data-story-project="${CSS.escape(id)}"]`);
      if (document.querySelector('[data-page-ready="error"]')) { finish(); return; }
      if (finishing || !surface || !document.querySelector('[data-block="timeline"] [data-timeline]')) return;
      finishing = true;
      // Let selection, pane measurement and the visible storyboard images settle
      // before the browser captures the destination frame.
      const images = [...surface.querySelectorAll('img')].filter(img => {
        const box = img.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight && box.width > 0;
      });
      void Promise.race([
        Promise.all(images.map(img => img.decode().catch(() => {}))),
        new Promise(done => setTimeout(done, 180)),
      // Rendering is paused inside a view-transition update callback; awaiting
      // animation frames here would wait until the timeout instead of readiness.
      ]).then(() => setTimeout(finish, 32));
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = setTimeout(finish, 2500);
    check();
  });
}

let moving = false;
/** Drill into/out of a scene without showing an intermediate project splash. */
export async function openStoryProject(id: string): Promise<void> {
  if (moving) return;
  if (studioHost?.tabs) { openProject(id); return; }
  moving = true;
  try {
    const destination = await api.film(id, AbortSignal.timeout(8000));
    handoffs.set(id, destination);
    if (!document.startViewTransition) { openProject(id); return; }
    document.documentElement.dataset.storyTransition = '';
    const transition = document.startViewTransition(async () => {
      openProject(id);
      await destinationReady(id);
    });
    // A skipped browser animation must not become an unhandled rejection.
    void transition.ready.catch(() => {});
    await transition.finished;
  } finally {
    handoffs.delete(id);
    delete document.documentElement.dataset.storyTransition;
    moving = false;
  }
}
