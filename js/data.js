import { parseYouTube } from './player.js';

export const PARTS = Object.freeze({
  lead: 'LEAD', soprano: 'SOP', alto: 'ALTO', tenor: 'TENOR',
  baritone: 'BARI', bass: 'BASS', vp: 'VP',
  part1: '1번 파트', part2: '2번 파트', part3: '3번 파트',
  part4: '4번 파트', part5: '5번 파트', part6: '6번 파트', part7: '7번 파트',
  full: 'FULL',
});

export const CHECKLIST = Object.freeze([
  { id: 'listen', label: '음원 듣기' },
  { id: 'singAlong', label: '음원과 함께 부르기' },
  { id: 'solo', label: '음원 없이 부르기' },
  { id: 'otherParts', label: '다른 파트와 함께 부르기' },
  { id: 'fullMix', label: 'Full Mix와 함께 부르기' },
  { id: 'memorized', label: '암보 완료' },
]);

const STATUSES = new Set(['practice', 'complete', 'archive']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';

/** Validate each song separately so a corrupt entry cannot prevent loading its siblings. */
export function validateData(raw, { warn = true } = {}) {
  const result = { songs: [], errors: [], warnings: [] };
  const report = (kind, message) => result[kind].push(message);
  if (!isObject(raw) || !Array.isArray(raw.songs)) {
    report('errors', '데이터에 songs 배열이 필요합니다. songs.json 구조를 확인해 주세요.');
  } else {
    if (raw.version !== undefined && raw.version !== 1) {
      report('warnings', '데이터 version이 1이 아닙니다. 현재 지원하는 형식을 확인해 주세요.');
    }
    const ids = new Set();
    raw.songs.forEach((item, index) => {
      const position = `${index + 1}번째 곡`;
      if (!isObject(item)) {
        report('errors', `${position}: 곡 데이터는 객체여야 합니다. 이 항목을 건너뜁니다.`);
        return;
      }
      const id = text(item.id);
      const title = text(item.title);
      const label = title ? `${position} (${title})` : position;
      const songErrors = [];
      if (!id) songErrors.push('비어 있지 않은 문자열 id가 필요합니다.');
      if (id && ids.has(id)) songErrors.push(`ID "${id}"가 중복됩니다.`);
      if (id) ids.add(id);
      if (!title) songErrors.push('곡명이 필요합니다.');
      if (![1, 2, 3].includes(item.difficulty)) songErrors.push('difficulty는 숫자 1, 2, 3 중 하나여야 합니다.');
      if (!STATUSES.has(item.status)) songErrors.push('status는 practice, complete, archive 중 하나여야 합니다.');
      if (!isObject(item.videos)) songErrors.push('videos는 파트별 미디어 객체여야 합니다.');
      const videos = {};
      if (isObject(item.videos)) {
        Object.entries(PARTS).forEach(([part, partLabel]) => {
          const media = item.videos[part];
          if (media === undefined || media === null) {
            videos[part] = null;
            return;
          }
          if (isObject(media) && Object.keys(media).length === 0) {
            videos[part] = null;
            return;
          }
          if (!isObject(media)) {
            songErrors.push(`${partLabel} 미디어는 객체 또는 null이어야 합니다.`);
            return;
          }
          if (!['video', 'playlist'].includes(media.type)) {
            songErrors.push(`${partLabel} type은 video 또는 playlist여야 합니다.`);
            return;
          }
          if (media.url !== undefined && typeof media.url !== 'string') {
            songErrors.push(`${partLabel} URL은 문자열이어야 합니다.`);
            return;
          }
          videos[part] = { type: media.type, url: text(media.url) };
          const parsed = parseYouTube(videos[part]);
          if (!parsed.ok && !parsed.empty) {
            report('warnings', `${label} · ${partLabel}: ${parsed.error}`);
          }
        });
        const unknown = Object.keys(item.videos).filter((part) => !Object.hasOwn(PARTS, part));
        if (unknown.length) report('warnings', `${label}: 지원하지 않는 파트 ${unknown.join(', ')}를 무시합니다.`);
      }
      if (songErrors.length) {
        songErrors.forEach((message) => report('errors', `${label}: ${message} 이 항목을 건너뜁니다.`));
        return;
      }
      const optionalFields = ['artist', 'category', 'arrangement', 'memo'];
      const song = { id, title, difficulty: item.difficulty, status: item.status, videos };
      optionalFields.forEach((field) => {
        song[field] = text(item[field]);
        if (item[field] !== undefined && typeof item[field] !== 'string') {
          report('warnings', `${label}: ${field}가 문자열이 아니어서 빈 값으로 처리합니다.`);
        }
      });
      song.tags = Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string').map(text).filter(Boolean) : [];
      if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== 'string'))) {
        report('warnings', `${label}: 잘못된 태그를 제거했습니다. tags에는 문자열 배열을 사용해 주세요.`);
      }
      song.thumbnail = safeThumbnail(item.thumbnail);
      if (item.thumbnail && !song.thumbnail) report('warnings', `${label}: 안전하지 않거나 잘못된 썸네일 주소를 무시합니다.`);
      song.startingPitches = isObject(item.startingPitches) ? { ...item.startingPitches } : {};
      song.musicalKey = text(item.musicalKey);
      if (isObject(item.source)) song.source = item.source;
      result.songs.push(song);
    });
  }
  if (warn) [...result.errors, ...result.warnings].forEach((message) => console.warn(`[AcaRoom] ${message}`));
  return result;
}

function safeThumbnail(value) {
  const input = text(value);
  if (!input) return '';
  try {
    const url = new URL(input, typeof location === 'undefined' ? 'https://acaroom.invalid/' : location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return input;
  } catch {
    return '';
  }
}

let songsRequest;
/** Fetch only the external JSON; retries remain possible after network or syntax errors. */
export function loadSongs() {
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return Promise.resolve({ songs: [], errors: ['이 앱은 GitHub Pages 또는 HTTP 환경에서 실행해 주세요.'], warnings: [] });
  }
  if (songsRequest) return songsRequest;
  songsRequest = (async () => {
    try {
      const response = await fetch(new URL('../data/songs.json', import.meta.url), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let raw;
      try {
        raw = await response.json();
      } catch {
        throw new Error('JSON 문법을 확인해 주세요.');
      }
      const result = validateData(raw);
      if (!result.songs.length && result.errors.length) songsRequest = undefined;
      return result;
    } catch (error) {
      songsRequest = undefined;
      return {
        songs: [],
        errors: [`곡 데이터를 불러오지 못했습니다. data/songs.json 파일과 연결 상태를 확인해 주세요. (${error.message})`],
        warnings: [],
      };
    }
  })();
  return songsRequest;
}

export function availableParts(song) {
  if (!isObject(song?.videos)) return [];
  return Object.keys(PARTS).filter((part) => parseYouTube(song.videos[part]).ok);
}

export function preferredPart(song, myPart) {
  const parts = availableParts(song);
  if (!parts.length) return null;
  if (myPart && parts.includes(myPart)) return myPart;
  const partMap = {
    part1: ['soprano', 'lead'],
    part2: ['alto'],
    part3: ['tenor'],
    part4: ['baritone', 'bass'],
    part5: ['bass'],
    soprano: ['part1'],
    lead: ['part1'],
    alto: ['part2'],
    tenor: ['part3'],
    baritone: ['part4'],
    bass: ['part5', 'part4'],
  };
  if (myPart && partMap[myPart]) {
    for (const alt of partMap[myPart]) {
      if (parts.includes(alt)) return alt;
    }
  }
  if (parts.includes('full')) return 'full';
  return parts[0] || null;
}
