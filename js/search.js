import { availableParts, PARTS } from './data.js';

const normalized = (value) => String(value ?? '').trim().toLocaleLowerCase('ko-KR');

// 띄어쓰기를 무시한 비교용 ("그대내품에" → "그대 내 품에")
const compact = (value) => value.replace(/\s+/g, '');

// 한글 초성 검색 ("ㅂㅎㅁㅇ" → "보헤미안")
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const isChoseongOnly = (word) => /^[ㄱ-ㅎ]+$/.test(word);
export function toChoseong(value) {
  return Array.from(String(value ?? ''), (ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }).join('');
}

/** 검색어 한 단어가 곡 정보 어딘가에 있는지 (띄어쓰기 무시·초성 포함) */
function matchesWord(word, haystack, haystackCompact, choseongCompact) {
  if (haystack.includes(word) || haystackCompact.includes(compact(word))) return true;
  return isChoseongOnly(word) && choseongCompact.includes(word);
}

const PART_SYNONYMS = {
  soprano: ['soprano', 'part1', 'sop', '소프라노'],
  lead: ['lead', 'part1', '리드'],
  alto: ['alto', 'part2', '알토'],
  tenor: ['tenor', 'part3', '테너'],
  baritone: ['baritone', 'part4', 'bari', '바리톤'],
  bass: ['bass', 'part4', 'part5', '베이스'],
  part1: ['part1', 'soprano', 'lead', '소프라노', '리드', '1번'],
  part2: ['part2', 'alto', '알토', '2번'],
  part3: ['part3', 'tenor', '테너', '3번'],
  part4: ['part4', 'baritone', 'bass', '바리톤', '베이스', '4번'],
  part5: ['part5', 'bass', '베이스', '5번'],
  part6: ['part6', '6번'],
  part7: ['part7', '7번'],
  vp: ['vp', '보컬퍼커션'],
  full: ['full', '전체'],
};

/** Every active field is applied together; each search word must occur somewhere. */
export function filterSongs(songs, {
  query = '', status = '', category = '', difficulty = '', part = '', favorites = [],
} = {}) {
  const words = normalized(query).split(/\s+/).filter(Boolean);
  const favoriteIds = favorites instanceof Set ? favorites : new Set(Array.isArray(favorites) ? favorites : []);
  const categoryFilter = normalized(category);
  const partFilter = normalized(part);
  const statusFilter = normalized(status);
  const allowedParts = partFilter && partFilter !== 'all' ? (PART_SYNONYMS[partFilter] || [partFilter]) : null;

  return (Array.isArray(songs) ? songs : []).filter((song) => {
    if (!song || typeof song !== 'object') return false;
    if (statusFilter === 'favorite' && !favoriteIds.has(song.id)) return false;
    if (statusFilter && statusFilter !== 'favorite' && statusFilter !== 'all' && song.status !== statusFilter) return false;
    if (categoryFilter && categoryFilter !== 'all' && normalized(song.category) !== categoryFilter) return false;
    if (difficulty && difficulty !== 'all' && Number(song.difficulty) !== Number(difficulty)) return false;
    const parts = availableParts(song);
    if (allowedParts && !parts.some((p) => allowedParts.includes(p))) return false;
    if (!words.length) return true;
    const memberNames = song.partNames && typeof song.partNames === 'object'
      ? Object.values(song.partNames).filter((name) => typeof name === 'string')
      : [];
    const haystack = normalized([
      song.title, song.artist, song.category, song.memo,
      ...(Array.isArray(song.tags) ? song.tags : []),
      ...memberNames,
      ...parts.flatMap((key) => [key, PARTS[key], ...(PART_SYNONYMS[key] || [])]),
    ].join(' '));
    const haystackCompact = compact(haystack);
    const choseongCompact = compact(toChoseong(normalized([song.title, song.artist, ...memberNames].join(' '))));
    return words.every((word) => matchesWord(word, haystack, haystackCompact, choseongCompact));
  });
}
