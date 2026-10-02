import { availableParts, PARTS } from './data.js';

const normalized = (value) => String(value ?? '').trim().toLocaleLowerCase('ko-KR');

/** Every active field is applied together; each search word must occur somewhere. */
export function filterSongs(songs, {
  query = '', status = '', category = '', difficulty = '', part = '', favorites = [],
} = {}) {
  const words = normalized(query).split(/\s+/).filter(Boolean);
  const favoriteIds = favorites instanceof Set ? favorites : new Set(Array.isArray(favorites) ? favorites : []);
  const categoryFilter = normalized(category);
  const partFilter = normalized(part);
  const statusFilter = normalized(status);
  return (Array.isArray(songs) ? songs : []).filter((song) => {
    if (!song || typeof song !== 'object') return false;
    if (statusFilter === 'favorite' && !favoriteIds.has(song.id)) return false;
    if (statusFilter && statusFilter !== 'favorite' && statusFilter !== 'all' && song.status !== statusFilter) return false;
    if (categoryFilter && categoryFilter !== 'all' && normalized(song.category) !== categoryFilter) return false;
    if (difficulty && difficulty !== 'all' && Number(song.difficulty) !== Number(difficulty)) return false;
    const parts = availableParts(song);
    if (partFilter && partFilter !== 'all' && !parts.includes(partFilter)) return false;
    if (!words.length) return true;
    const haystack = normalized([
      song.title, song.artist, song.category, song.memo,
      ...(Array.isArray(song.tags) ? song.tags : []),
      ...parts.flatMap((key) => [key, PARTS[key]]),
    ].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}
