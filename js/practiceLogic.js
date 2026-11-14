// 연습·공연 화면이 함께 쓰는 순수 로직 (화면 상태에 의존하지 않아 테스트하기 쉬움)
import { parseNoteString } from './pitch.js';

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
export function orderedPitchItems(song, partLabels = {}) {
  const rank = entryRank(song);
  return Object.entries(song?.startingPitches || {})
    .filter(([k, v]) => /^part\d+$/.test(k) && parseNoteString(v))
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([k, v]) => ({
      partKey: k,
      noteStr: v,
      parsed: parseNoteString(v),
      label: `${partLabels[k] || k}${song.partNames?.[k] ? ` ${song.partNames[k]}` : ''}`,
    }));
}

/** "2026.10.24" → 그날 0시 (Date). 형식이 아니면 null */
export function parseStageDate(value) {
  const m = String(value || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
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
