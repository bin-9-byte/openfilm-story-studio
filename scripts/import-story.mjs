import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { filmHtml, readFilm } from '../packages/openfilm/src/film-doc.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/import-story.mjs input.story.json new-project-folder');
const story = JSON.parse(await readFile(input, 'utf8'));
if (story.format !== 'story-timeline' || story.version !== 4 || !Array.isArray(story.scenes) || !Array.isArray(story.beats)) {
  throw new Error('Please export a version 4 story project first.');
}
const destination = resolve(output);
let exists = false;
try { await access(destination); exists = true; } catch {}
if (exists) throw new Error('Choose a new folder to preserve existing projects.');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const page = (title, description = '', image = '') => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=1920,height=1080">
<style>html,body{margin:0;width:100%;height:100%;background:#15171c;color:#eee;font-family:system-ui}body{display:grid;place-items:center}article{max-width:1400px;padding:80px}h1{font-size:70px}p{font-size:34px;line-height:1.8;white-space:pre-wrap}img{max-width:90vw;max-height:80vh}</style>
${image ? `<img src="${escape(image)}">` : `<article><h1>${escape(title)}</h1><p>${escape(description)}</p></article>`}
<script>window.film={duration:4,frame(t){}};</script>`;
const writeFilm = async (path, film) => {
  const read = readFilm(film);
  if (!read.doc) throw new Error(read.problems.join('\n'));
  await writeFile(path, filmHtml(film));
};
const metadata = value => ({ 'data-story': JSON.stringify(value) });
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'story-original.story.json'), JSON.stringify(story, null, 2));
await writeFile(join(destination, 'story-beat.html'), page('故事节拍'));
const sceneClips = [];
const links = new Map();
for (const [index, scene] of story.scenes.entries()) {
  const folder = `parts/scene-${index + 1}`;
  const absolute = join(destination, folder);
  await mkdir(absolute, { recursive: true });
  let at = 0;
  const shots = [];
  for (const [shotIndex, shot] of scene.shots.entries()) {
    const filename = `shot-${shotIndex + 1}.html`;
    await writeFile(join(absolute, filename), page(shot.title, shot.description || shot.framing, shot.image));
    shots.push({ id: shot.id, src: filename, at, time: [0, shot.duration],
      attrs: metadata({ ...shot, kind: 'shot' }) });
    at += shot.duration;
  }
  if (!shots.length) {
    await writeFile(join(absolute, 'empty.html'), page(scene.title, scene.summary));
    shots.push({ id: `${scene.id}-empty`, src: 'empty.html', at: 0, time: [0, 4],
      attrs: metadata({ kind: 'shot', title: '镜头 1', description: '', framing: '', movement: '', notes: '' }) });
  }
  await writeFilm(join(absolute, 'film.html'), { stage: { w: 1920, h: 1080 },
    tracks: [{ clips: shots, attrs: { title: '场内镜头', 'data-story-track': 'shot' } }] });
  const group = `story-${scene.id}`;
  links.set(scene.id, group);
  sceneClips.push({ id: scene.id, src: `${folder}/film.html`, at: scene.placement.start,
    time: [0, scene.placement.end - scene.placement.start],
    attrs: { ...metadata({ kind: 'scene', title: scene.title, place: scene.place, summary: scene.summary, script: scene.script }),
      'data-link': group } });
}
const tracks = story.tracks.filter(track => track.kind === 'linked').map(track => ({
  attrs: { title: track.name, 'data-story-track': 'beat', 'data-story-track-id': track.id },
  ...(track.locked ? { locked: true } : {}),
  clips: story.beats.filter(beat => beat.trackId === track.id).map(beat => {
    const scene = story.scenes.find(scene => scene.id === beat.sceneId);
    const span = scene?.placement ?? beat.placement;
    if (!span) throw new Error('Missing beat placement');
    return { id: beat.id, src: 'story-beat.html', at: span.start, time: [0, span.end - span.start],
      attrs: { ...metadata({ kind: 'beat', title: beat.label }),
        ...(scene ? { 'data-link': links.get(scene.id) } : {}) } };
  }),
}));
tracks.push({ clips: sceneClips, attrs: { title: story.tracks[0].name, 'data-story-track': 'scene' } });
await writeFilm(join(destination, 'film.html'), { stage: { w: 1920, h: 1080 }, tracks });
await mkdir(join(destination, '.film'), { recursive: true });
await writeFile(join(destination, '.film/settings.json'), JSON.stringify({
  fps: 30,
  trackNames: tracks.map((track, index) => ({ name: track.attrs.title, index, clips: track.clips.map(clip => clip.id) })),
  trackHeights: tracks.map((track, index) => ({ height: 78, index, clips: track.clips.map(clip => clip.id) })),
}, null, 2));
console.log(destination);
