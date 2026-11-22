// @ts-check
/** @typedef {{ id: string, startMs: number, endMs: number }} Range */

/**
 * Edited ranges take the requested landing. A range they collide with and its
 * following neighbours move forward, keeping their lengths and any unused gaps.
 * Without priorities this also converts older overlapping tracks into a sequence.
 * @param {Range[]} ranges
 * @param {ReadonlySet<string>} [priorities]
 */
export function sequenceRanges(ranges, priorities = new Set()) {
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  const order = sorted.filter(range => !priorities.has(range.id));
  for (const range of sorted.filter(range => priorities.has(range.id))) {
    const at = order.findIndex(other => other.endMs > range.startMs &&
      !(priorities.has(other.id) && other.startMs <= range.startMs));
    order.splice(at < 0 ? order.length : at, 0, range);
  }
  const placements = new Map();
  let end = 0;
  for (const range of order) {
    const startMs = Math.max(end, range.startMs);
    const endMs = startMs + range.endMs - range.startMs;
    placements.set(range.id, { startMs, endMs });
    end = endMs;
  }
  return placements;
}

/** @typedef {{ id: string, at?: number, time?: number[], speed?: number, [field: string]: unknown }} Clip */
/** @typedef {{ tracks: {clips: Clip[], locked?: boolean, attrs?: Record<string,string>}[] }} Film */
/** @param {Clip} clip */
const spanOf = clip => {
  const startMs = Math.round((clip.at ?? 0) * 1000);
  return { id: clip.id, startMs, endMs: startMs + Math.round(((clip.time?.[1] ?? 4) - (clip.time?.[0] ?? 0)) / (clip.speed ?? 1) * 1000) };
};

/** @param {Film} film @param {Film} [before] */
export function packStoryTracks(film, before) {
  const previous = new Map(before?.tracks.flatMap((track, index) => track.clips.map(clip => [clip.id, { ...spanOf(clip), index }])));
  for (const [index, track] of film.tracks.entries()) {
    if (track.attrs?.['data-story-track'] !== 'beat') continue;
    const ranges = track.clips.map(spanOf);
    const priorities = new Set(before ? ranges.filter(range => {
      const original = previous.get(range.id);
      return !original || original.index !== index || original.startMs !== range.startMs || original.endMs !== range.endMs;
    }).map(range => range.id) : []);
    const positions = sequenceRanges(ranges, priorities);
    for (const clip of track.clips) {
      const placement = positions.get(clip.id);
      const original = spanOf(clip);
      if (!placement || placement.startMs === original.startMs) continue;
      if (track.locked) throw new Error('故事线已锁定，无法推后发生碰撞的节拍。');
      clip.at = placement.startMs / 1000;
    }
    track.clips.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  }
}
