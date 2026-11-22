import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const state = join(root, '.story-studio');
process.env.OPENFILM_HOME = join(state, 'home');
process.env.OPENFILM_SHARED_HOME = join(state, 'home');
process.env.OPENFILM_LIBRARY = join(state, 'projects');
process.env.OPENFILM_EXPORTS = join(state, 'exports');
process.env.OPENFILM_NO_BROWSER = '1';
process.env.OPENFILM_NO_UPDATE_CHECK = '1';
await mkdir(state, { recursive: true });
const { startStudio } = await import('../packages/openfilm/studio/server/server.mjs');
const { openProject, studioKey } = await import('../packages/openfilm/studio/server/projects.mjs');
const project = await openProject(resolve(process.argv[2]), { create: false });
const studio = await startStudio({ port: 4747, key: studioKey(), openBrowser: () => {}, stays: true });
console.log(JSON.stringify({ url: `http://127.0.0.1:${studio.port}/projects/${project.id}?key=${studio.key}` }));
if (process.argv.includes('--open') && process.platform === 'darwin') {
  spawn('/usr/bin/open', [`http://127.0.0.1:${studio.port}/projects/${project.id}?key=${studio.key}`], { stdio: 'ignore' });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void studio.close().then(() => process.exit()); });
