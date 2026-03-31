/** Stable album shape for playback UI (ids + cover URLs). */
export function normalizeAlbum(a, index) {
  if (!a) return null;
  return {
    ...a,
    id: a.id ?? String(index),
    staticCoverUrl: a.staticCoverUrl ?? a.cover,
    animatedCoverUrl: a.animatedCoverUrl ?? a.animatedCover ?? null,
  };
}
