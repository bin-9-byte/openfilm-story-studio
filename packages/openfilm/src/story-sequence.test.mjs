import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packStoryTracks, sequenceRanges } from './story-sequence.mjs';
import { applyOps } from '../studio/server/ops.mjs';
import { inverse } from '../studio/ui/src/editor/undo.ts';

const film = () => ({ tracks: [
  { attrs: { title: 'A 线', 'data-story-track': 'beat', 'data-story-track-id': 'a' }, clips: [
    { id: 'a', src: 'beat.html', at: 0, time: [0, 4] },
    { id: 'b', src: 'beat.html', at: 4, time: [0, 4] },
    { id: 'c', src: 'beat.html', at: 12, time: [0, 4] },
  ] },
  { clips: [{ id: 'scene', src: 'scene.html', at: 0, time: [0, 20] }] },
] });

test('legacy overlaps are packed in stable start order', () => {
  const positions = sequenceRanges([
    { id: 'a', startMs: 0, endMs: 10 },
    { id: 'b', startMs: 5, endMs: 12 },
    { id: 'c', startMs: 30, endMs: 35 },
  ]);
  assert.deepEqual([...positions.values()], [
    { startMs: 0, endMs: 10 }, { startMs: 10, endMs: 17 }, { startMs: 30, endMs: 35 },
  ]);
});

test('a native insert pushes the existing beat and stays on the same storyline', () => {
  const before = film();
  const after = applyOps(structuredClone(before), [{ op: 'insert', track: 0, at: 5,
    clip: { id: 'new', src: 'beat.html', time: [0, 4] } }]);
  assert.equal(after.tracks.length, before.tracks.length);
  assert.deepEqual(after.tracks[0].clips.map(c => [c.id, c.at]), [['a', 0], ['new', 5], ['b', 9], ['c', 13]]);
  assert.deepEqual(after.tracks[1], before.tracks[1]);
});

test('one undo restores the edited beat and all pushed neighbours', () => {
  const before = film();
  const ops = [{ op: 'fields', clip: 'a', fields: { time: [0, 7] } }];
  const after = applyOps(structuredClone(before), ops);
  assert.equal(after.tracks[0].clips[1].at, 7);
  const undo = inverse(before, after, ops);
  assert.deepEqual(applyOps(structuredClone(after), undo), before);
});

test('a locked storyline cannot be silently packed', () => {
  const value = film();
  value.tracks[0].locked = true;
  value.tracks[0].clips[1].at = 2;
  assert.throws(() => packStoryTracks(value), /锁定/);
});
