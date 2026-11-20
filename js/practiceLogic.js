// 연습·공연 화면이 함께 쓰는 순수 로직 (화면 상태에 의존하지 않아 테스트하기 쉬움)
import { parseNoteString, transposeNoteString } from './pitch.js';

/** 파트 이름이 없는 곡의 기본 첫 음 재생 순서 */
export const DEFAULT_ENTRY_ORDER = ['part2', 'part4', 'part1', 'part3'];

/** "선영 · 희엽"처럼 한 파트에 여러 이름이 적힌 경우 나눔 */
export function splitMemberNames(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(/\s*[·,/]\s*/).map(s => s.trim()).filter(Boolean);
}

/** 이름(나는 누구?)으로 곡에서 내 파트를 찾고, 없으면 기본 파트 */
export function resolveMyPart(song, myName, myPart = '') {
  if (myName && song?.partNames) {
    const hit = Object.entries(song.partNames).find(([, name]) => splitMemberNames(name).includes(myName));
    if (hit) return hit[0];
  }
  return myPart;
}

/** 곡들에 적힌 단원 이름 목록 (많이 등장한 순, 같으면 가나다순) */
export function collectMemberNames(songs = []) {
  const count = new Map();
  for (const song of songs) {
    for (const raw of Object.values(song?.partNames || {})) {
      for (const name of splitMemberNames(raw)) count.set(name, (count.get(name) || 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([name]) => name);
}

/** 첫 음 재생 순서의 순위 함수: 곡의 entryOrder(악보 등장 순서) 또는 기본 2·4·1·3번, 나머지는 번호순 */
export function entryRank(song) {
  const order = Array.isArray(song?.entryOrder) && song.entryOrder.length ? song.entryOrder : DEFAULT_ENTRY_ORDER;
  return (k) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length + (parseInt(String(k).slice(4), 10) || 0) : i;
  };
}

/** 번호 파트 첫 음을 재생 순서대로 정렬한 목록 */
export function orderedPitchItems(song, partLabels = {}, transposeSemi = 0) {
  const rank = entryRank(song);
  const semi = Number.isFinite(transposeSemi) ? transposeSemi : 0;
  return Object.entries(song?.startingPitches || {})
    .filter(([k, v]) => /^part\d+$/.test(k) && parseNoteString(v))
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([k, v]) => {
      const shifted = semi ? transposeNoteString(v, semi) : v;
      return {
        partKey: k,
        noteStr: shifted,
        parsed: parseNoteString(shifted),
        label: `${partLabels[k] || k}${song.partNames?.[k] ? ` ${song.partNames[k]}` : ''}`,
      };
    });
}

/** "2026.10.24" → 그날 0시 (Date). 형식이 아니면 null */
export function parseStageDate(value) {
  const m = String(value || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * 휴대폰에 설정된 현지 시각 기준 오늘 날짜 문자열 ("2026-11-20" / sep='.'이면 "2026.11.20").
 * toISOString()은 세계 표준시라 한국에서는 새벽 0시~오전 9시에 하루 전 날짜가 찍히므로 이것을 쓴다.
 */
export function localDateString(date = new Date(), sep = '-') {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join(sep);
}

/** 오늘 또는 가장 가까운 다가오는 공연과 그 날짜 ({stage, date}), 없으면 null */
export function nextStage(history = [], today = new Date()) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  return history
    .map(stage => ({ stage, date: parseStageDate(stage?.date) }))
    .filter(({ stage, date }) => date && date >= base && Array.isArray(stage.songs) && stage.songs.length)
    .sort((a, b) => a.date - b.date)[0] || null;
}

/** 공연까지 남은 날 (당일 0) */
export function daysUntil(date, today = new Date()) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  return Math.round((date - base) / 86400000);
}

const clampSemi = (value) => Math.max(-6, Math.min(6, Math.round(value)));

/**
 * 큐시트 곡의 조바꿈(반음 수). 홈 '다음 무대' 카드와 무대 큐시트가 같은 규칙을 쓴다.
 * 큐시트에서 곡별로 정한 값(item.transpose)이 있으면 그것을, 없으면 연습실에서 저장한 곡 조바꿈을 쓴다.
 */
export function resolveStageItemTranspose(item, songTranspositions = {}) {
  const own = item?.transpose;
  if (own !== null && own !== undefined && own !== '' && Number.isFinite(Number(own))) return clampSemi(Number(own));
  const songId = item?.songId || item?.id;
  const saved = Number(songTranspositions?.[songId]);
  return songId && Number.isFinite(saved) ? clampSemi(saved) : 0;
}

/**
 * 연습실 곡 목록 정렬 (순수 함수).
 * - 'mastery-asc': 덜 익힌 순 (숙련도 0→3, 같으면 가나다순)
 * - 'recent': 최근 연습순 (최근 기록이 있는 곡 우선, 최신순)
 * - 'title': 가나다순
 * - 'difficulty-desc': 난이도 높은 순
 * - 'difficulty-asc': 난이도 낮은 순
 * - 그 외: 원래 목록 순서 유지
 */
export function sortSongs(songs = [], sortKey = '', { progress = {}, recent = [] } = {}) {
  const list = Array.isArray(songs) ? [...songs] : [];
  if (!sortKey || sortKey === 'default') return list;
  const prog = progress && typeof progress === 'object' ? progress : {};
  const byTitle = (a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'ko');

  if (sortKey === 'title') {
    return list.sort(byTitle);
  }
  if (sortKey === 'mastery-asc') {
    return list.sort((a, b) => {
      const la = Number(prog[a?.id]?.level) || 0;
      const lb = Number(prog[b?.id]?.level) || 0;
      return (la - lb) || byTitle(a, b);
    });
  }
  if (sortKey === 'recent') {
    const lastTs = new Map();
    for (const item of Array.isArray(recent) ? recent : []) {
      if (!item?.songId || !Number.isFinite(item.timestamp)) continue;
      const prev = lastTs.get(item.songId) || 0;
      if (item.timestamp > prev) lastTs.set(item.songId, item.timestamp);
    }
    const indexMap = new Map(list.map((s, i) => [s?.id, i]));
    return list.sort((a, b) => {
      const ta = lastTs.get(a?.id) || 0;
      const tb = lastTs.get(b?.id) || 0;
      if (ta !== tb) return tb - ta;
      return (indexMap.get(a?.id) ?? 0) - (indexMap.get(b?.id) ?? 0);
    });
  }
  if (sortKey === 'difficulty-desc') {
    return list.sort((a, b) => ((Number(b?.difficulty) || 0) - (Number(a?.difficulty) || 0)) || byTitle(a, b));
  }
  if (sortKey === 'difficulty-asc') {
    return list.sort((a, b) => ((Number(a?.difficulty) || 0) - (Number(b?.difficulty) || 0)) || byTitle(a, b));
  }
  return list;
}

/**
 * LIVE 무대 화면의 가로 스와이프 판별 (세로 스크롤과 구분).
 * 왼쪽으로 밀면 'next'(다음 곡), 오른쪽으로 밀면 'prev'(이전 곡), 기준 미달이면 null.
 */
export function classifyHorizontalSwipe(dx, dy, threshold = 52) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.25) return null;
  return dx < 0 ? 'next' : 'prev';
}
