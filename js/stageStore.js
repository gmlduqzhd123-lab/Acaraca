/**
 * AcaRaca 무대 큐시트 자료 (공연 목록·저장·공유 링크)
 * - 홈 화면 공연 카드처럼 앱을 열자마자 필요한 부분만 모았다. 무대 화면(js/stage.js)은 무대 탭을 열 때 불러온다.
 * - 기존 공연의 셋리스트를 바꾸면 그 공연의 revision을 1 올려야 이미 저장된 휴대폰에도 반영된다.
 */

import { el, button } from './ui.js';
import { resolveSongId } from './data.js';
import { entryRank, nextStage, resolveStageItemTranspose, localDateString } from './practiceLogic.js';
import { read as readStorage } from './storage.js';
import { parseNoteString } from './pitch.js';

export const STAGE_HISTORY_KEY = 'acaroom_stage_history_v2';
export const STAGE_ACTIVE_KEY = 'acaroom_stage_active_v2';
export const STAGE_DELETED_KEY = 'acaroom_stage_deleted_ids_v1';
export const STAGE_STOPWATCH_KEY = 'acaroom_stage_stopwatch_v1';

/**
 * 곡의 startingPitches 데이터로부터 재생 가능한 파트별 첫 음 목록을 최적 순서로 추출
 */
export function getSongStartingPitchEntries(songData) {
  if (!songData?.startingPitches) return [];
  const rawPitches = (typeof songData.startingPitches.pitches === 'object')
    ? songData.startingPitches.pitches
    : songData.startingPitches;

  const isPlayable = (v) => typeof v === 'string' && Boolean(parseNoteString(v));
  const numberedParts = Object.keys(rawPitches).filter(k => /^part\d+$/.test(k) && isPlayable(rawPitches[k]));

  // 번호 파트가 있으면 번호 파트만 사용 (파트 페이지와 동일). 순서: 악보 등장 순서(entryOrder) → 기본 2·4·1·3번
  if (numberedParts.length) {
    const rank = entryRank(songData);
    return numberedParts.sort((a, b) => rank(a) - rank(b)).map(k => [k, rawPitches[k]]);
  }

  const orderMap = { bass: 1, baritone: 3, tenor: 5, alto: 7, soprano: 9, lead: 11, vp: 12 };
  const named = Object.entries(rawPitches)
    .filter(([part, noteStr]) => part !== 'full' && part !== 'key' && isPlayable(noteStr));
  if (Array.isArray(songData.entryOrder) && songData.entryOrder.length) {
    const rank = (k) => { const i = songData.entryOrder.indexOf(k); return i === -1 ? 99 + (orderMap[k] || 0) : i; };
    return named.sort((a, b) => rank(a[0]) - rank(b[0]));
  }
  return named
    .sort((a, b) => {
      const pA = parseNoteString(a[1]);
      const pB = parseNoteString(b[1]);
      if (pA.freq !== pB.freq) return pA.freq - pB.freq;
      return (orderMap[a[0]] || 99) - (orderMap[b[0]] || 99);
    });
}

/** 곡 데이터의 partNames에서 파트 담당자 이름/이니셜을 찾음 */
export function getStagePartSinger(songData, part) {
  return (songData?.partNames && typeof songData.partNames[part] === 'string') ? songData.partNames[part] : '';
}

/**
 * 메인 33곡 외 무대 큐시트에 등록된 특별 레퍼토리 메타데이터 (첫 음 및 곡 정보)
 */
export const STAGE_EXTRA_SONG_METADATA = {
  'stand-by-me': {
    id: 'stand-by-me',
    title: 'Stand By Me (스탠바이미)',
    artist: 'Ben E. King',
    category: 'Pop / Soul',
    arrangement: '혼성 5부',
    musicalKey: 'E Major',
    pitchPipe: 'E',
    difficulty: 2,
    bpm: 118,
    duration: '3:15',
    openingCue: 'When the night has come~ (베이스 인트로 후 솔로 진입)',
    status: 'practice',
    tags: ['무대 레퍼토리', '소울', '명곡'],
    videos: {
      full: {
        type: 'video',
        url: 'https://www.youtube.com/watch?v=hwZNL7QVJjE'
      }
    },
    // 혼성5부 교육용 악보(arr 김승호) 기준: 솔로 1마디 → 소프라노 5마디 → 알토·바리톤·베이스 9마디
    entryOrder: ['lead', 'soprano', 'alto', 'baritone', 'bass'],
    startingPitches: {
      key: 'E Major',
      pitches: {
        lead: 'E4',
        soprano: 'G#4',
        alto: 'E4',
        baritone: 'B3',
        bass: 'E2'
      }
    }
  },
  'the-lion-sleeps-tonight': {
    id: 'the-lion-sleeps-tonight',
    title: 'The Lion Sleeps Tonight',
    artist: 'The Tokens',
    category: 'Pop / World',
    arrangement: '혼성 5부',
    musicalKey: 'A Major',
    pitchPipe: 'E',
    bpm: 122,
    duration: '2:50',
    openingCue: 'Wimoweh~ 아~위모웨 (팔세토·코러스 인트로)',
    difficulty: 2,
    status: 'practice',
    tags: ['무대 레퍼토리', '아카펠라', '라이온킹'],
    videos: {
      full: {
        type: 'video',
        url: 'https://www.youtube.com/watch?v=OQlByoPdG6c'
      }
    },
    // 악보 화면 기준: 솔로 1마디(E4) → 소프라노 5마디(G#4). 알토·베이스는 6마디 이후 등장(첫 음 미확인)
    entryOrder: ['lead', 'soprano'],
    startingPitches: {
      key: 'A Major',
      pitches: {
        lead: 'E4',
        soprano: 'G#4'
      }
    }
  },
  'march-for-the-beloved': {
    id: 'march-for-the-beloved',
    title: '임을 위한 행진곡',
    artist: '아카라카 · 이솝 편곡',
    category: '기념 / 합창',
    arrangement: '혼성 4부',
    musicalKey: 'C Minor / Eb Major',
    pitchPipe: 'C',
    bpm: 76,
    duration: '3:20',
    openingCue: '사랑도 명예도 이름도 남김없이~ 한평생 나가자던 뜨거운 맹세',
    difficulty: 2,
    status: 'archive',
    tags: ['무대 레퍼토리', '4부', '기념공연'],
    videos: {
      full: {
        type: 'video',
        url: 'https://www.youtube.com/watch?v=FrZsv-Z77fU'
      }
    },
    entryOrder: ['part1', 'part2', 'part3', 'part4'],
    startingPitches: {
      key: 'C Minor / Eb Major',
      pitches: {
        part1: 'C4',
        part2: 'C4',
        part3: 'G3',
        part4: 'C3',
        soprano: 'C4',
        alto: 'C4',
        tenor: 'G3',
        bass: 'C3'
      }
    }
  }
};

/**
 * "MM:SS" 또는 "H:MM:SS" 형식의 연주 시간 문자열을 초(seconds) 단위로 변환
 */
export function parseDurationSeconds(str) {
  if (typeof str === 'number' && Number.isFinite(str) && str > 0) return Math.round(str);
  if (!str || typeof str !== 'string') return 0;
  const parts = str.trim().split(':').map((p) => Number(p.trim()));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * 셋리스트 전체 예상 러닝타임(곡 연주 시간 + 곡간 MC 멘트·전환 시간) 산출
 */
export function estimateSetlistDurationSeconds(session, songs = [], mcSecondsPerSong = 35) {
  const items = Array.isArray(session?.songs) ? session.songs : [];
  if (!items.length) {
    return { musicSeconds: 0, mcSeconds: 0, totalSeconds: 0, formatted: '0분' };
  }
  let musicSeconds = 0;
  for (const item of items) {
    const sd = resolveSongData(songs, item?.songId, item?.title);
    const dur = parseDurationSeconds(sd?.duration) || 210;
    musicSeconds += dur;
  }
  const mcSeconds = items.length * Math.max(0, Number(mcSecondsPerSong) || 0);
  const totalSeconds = musicSeconds + mcSeconds;
  const mins = Math.max(1, Math.round(totalSeconds / 60));
  return {
    musicSeconds,
    mcSeconds,
    totalSeconds,
    formatted: `약 ${mins}분`,
  };
}
STAGE_EXTRA_SONG_METADATA['lion-sleeps-tonight'] = STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'];

/**
 * 곡 ID를 통해 메인 songs 및 추가 무대 레퍼토리에서 메타데이터 검색
 */
export function resolveSongData(songs, songId, fallbackTitle = '') {
  songId = resolveSongId(songId);
  if (Array.isArray(songs)) {
    const found = songs.find(s => s.id === songId);
    if (found) return found;
  }
  if (STAGE_EXTRA_SONG_METADATA[songId]) {
    return STAGE_EXTRA_SONG_METADATA[songId];
  }
  return {
    id: songId,
    title: fallbackTitle || songId,
    artist: '아카라카',
    category: '아카펠라',
    arrangement: '다성부',
    startingPitches: null
  };
}

/**
 * 사용자 직접 입력 공연 셋리스트 (최신순 3건 정렬)
 * 사용자가 직접 입력하지 않은 임의 더미 공연은 기본 히스토리에 포함하지 않음
 */
export const DEFAULT_STAGE_HISTORY = [
  {
    id: 'stage-2026-jeonnam',
    eventTitle: '2026 전교조 전남지부 참교육실천대회 찬조 공연',
    date: '2026.10.24',
    venue: '광주교육연수원',
    notes: '2026 전교조 전남지부 참교육실천대회 찬조 공연 큐시트 (장소: 광주교육연수원)',
    updatedAt: 1792836000000,
    revision: 2,
    currentIndex: 0,
    songs: [
      { songId: 'love-song-medley', title: '러브송 메들리', note: '오프닝 메들리', commentTone: 'story' },
      { songId: 'isnt-she-lovely', title: 'Isn\'t She Lovely', note: '소울풀 그루브', commentTone: 'wit' },
      { songId: 'in-your-arms', title: '그대 내 품에', note: '감성 발라드', commentTone: 'story' },
      { songId: 'old-pop-medley', title: '올드팝 메들리', note: '명곡 메들리', commentTone: 'story' },
      { songId: 'short-hair', title: '단발머리', note: '경쾌한 비트', commentTone: 'wit' },
      { songId: 'lets-travel', title: '여행을 떠나요', note: '피날레 호응 유도', commentTone: 'wit' }
    ]
  },
  {
    id: 'stage-2026-gyowon',
    eventTitle: '2026 제19회 교원예술제',
    date: '2026.10.23',
    venue: '장흥문화예술회관',
    notes: '2026 제19회 교원예술제 무대 큐시트 (장소: 장흥문화예술회관)',
    updatedAt: 1792749600000,
    // 기본 셋리스트를 고치면 revision을 올려 이미 저장된 기기에도 반영
    revision: 2,
    currentIndex: 0,
    songs: [
      { songId: 'bohemian-rhapsody', title: '보헤미안 랩소디', note: '퀸 오페라 하이라이트', commentTone: 'wit' }
    ]
  },
  {
    id: 'stage-2026-yeosu',
    eventTitle: '2026 여수 생활문화한마당',
    date: '2026.10.16',
    venue: '웅천친수공원',
    notes: '2026 여수 생활문화한마당 공연 큐시트 (장소: 웅천친수공원)',
    updatedAt: 1792144800000,
    // 기본 셋리스트를 고치면 revision을 올려 이미 저장된 기기에도 반영
    revision: 3,
    currentIndex: 0,
    songs: [
      { songId: 'love-song-medley', title: '러브송 메들리', note: '오프닝 메들리', commentTone: 'story' },
      { songId: 'bohemian-rhapsody', title: '보헤미안 랩소디', note: '5부 하이라이트', commentTone: 'wit' },
      { songId: 'in-your-arms', title: '그대 내 품에', note: '감성 발라드', commentTone: 'story' },
      { songId: 'old-pop-medley', title: '올드팝 메들리', note: '명곡 메들리', commentTone: 'story' },
      { songId: 'lets-travel', title: '여행을 떠나요', note: '피날레 호응 유도', commentTone: 'wit' }
    ]
  }
];

/**
 * 사용자가 직접 입력하지 않은 과거 임시/샘플 더미 공연 ID 목록 (발견 즉시 히스토리에서 영구 삭제)
 */
export const DUMMY_STAGE_IDS = new Set([
  'stage-2026-spring',
  'stage-2025-busking',
  'stage-2024-suncheon',
  'stage-2024-winter'
]);

/**
 * 미입력 더미 공연 판별 헬퍼
 */
export function isDummyStage(item) {
  if (!item) return false;
  if (DUMMY_STAGE_IDS.has(item.id)) return true;
  const title = item.eventTitle || '';
  if (
    title.includes('청춘 하모니') ||
    title.includes('봄맞이 캠퍼스 버스킹') ||
    title.includes('아고라순천')
  ) {
    return true;
  }
  return false;
}

/**
 * 저장소에서 공연 히스토리 가져오기 (항상 최신순 정렬)
 * - 사용자가 직접 입력하지 않은 샘플/더미 공연은 영구 배제
 */
export function getStageHistory() {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_STAGE_HISTORY.filter(item => !isDummyStage(item));
  }
  try {
    let deletedIds = new Set();
    try {
      const dRaw = localStorage.getItem(STAGE_DELETED_KEY);
      if (dRaw) deletedIds = new Set(JSON.parse(dRaw));
    } catch (_) {}

    const raw = localStorage.getItem(STAGE_HISTORY_KEY);
    if (raw === null) {
      const initial = DEFAULT_STAGE_HISTORY.filter(item => !isDummyStage(item) && !deletedIds.has(item.id));
      saveStageHistory(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // 1. 기존에 저장되어 있던 미입력 더미/샘플 공연 영구 배제 및 삭제된 ID 배제
      const cleaned = parsed.filter(item => !isDummyStage(item) && !deletedIds.has(item.id));
      let changed = cleaned.length !== parsed.length;

      // 2. 사용자가 직접 추가를 요청한 기본 공연(참교육실천대회, 교원예술제, 여수 등)이 누락되어 있고 삭제하지 않았다면 반영
      // 기본 공연의 revision이 저장본보다 높으면 기본 셋리스트로 갱신
      for (const def of DEFAULT_STAGE_HISTORY) {
        if (!def.revision) continue;
        const idx = cleaned.findIndex(item => item.id === def.id);
        if (idx >= 0 && (cleaned[idx].revision || 1) < def.revision) {
          cleaned[idx] = JSON.parse(JSON.stringify(def));
          changed = true;
        }
      }
      const existingIds = new Set(cleaned.map(item => item.id));
      for (const def of DEFAULT_STAGE_HISTORY) {
        if (!existingIds.has(def.id) && !deletedIds.has(def.id) && !isDummyStage(def)) {
          cleaned.push(JSON.parse(JSON.stringify(def)));
          changed = true;
        }
      }

      const sorted = cleaned.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (changed) {
        saveStageHistory(sorted);
      }
      return sorted;
    }
  } catch (e) {
    console.warn('Failed to parse stage history:', e);
  }
  return DEFAULT_STAGE_HISTORY.filter(item => !isDummyStage(item));
}

/**
 * 공연 히스토리 저장
 */
export function saveStageHistory(history) {
  if (typeof localStorage === 'undefined') return history;
  try {
    const sorted = [...history].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    localStorage.setItem(STAGE_HISTORY_KEY, JSON.stringify(sorted));
    return sorted;
  } catch (e) {
    console.error('Failed to save stage history:', e);
    return history;
  }
}

/**
 * 역대 공연 셋리스트를 날짜순(오래된 순 -> 최신 순)으로 정렬하여 반환
 */
export function getChronologicalPerformanceList() {
  const history = getStageHistory();
  return [...history].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.updatedAt || 0) - (b.updatedAt || 0);
  });
}

/**
 * 현재 활성화된 무대 세션 가져오기 (없으면 히스토리 최신 또는 기본 생성)
 */
/** 오늘 또는 가장 가까운 다가오는 공연 (없으면 null) */
export function findUpcomingStage(history = getStageHistory(), today = new Date()) {
  return nextStage(history, today)?.stage || null;
}

export function getActiveStageSession(allSongs = []) {
  // 앱을 새로 열 때마다 한 번, 무대 큐시트를 오늘·다가오는 공연으로 맞춤 (그 뒤 사용자가 고른 공연은 유지)
  try {
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('acaroom_stage_autopick')) {
      sessionStorage.setItem('acaroom_stage_autopick', '1');
      const upcoming = findUpcomingStage();
      const raw = localStorage.getItem(STAGE_ACTIVE_KEY);
      const currentId = raw ? (JSON.parse(raw) || {}).id : null;
      if (upcoming && upcoming.id !== currentId) {
        const picked = JSON.parse(JSON.stringify(upcoming));
        picked.currentIndex = 0;
        localStorage.setItem(STAGE_ACTIVE_KEY, JSON.stringify(picked));
      }
    }
  } catch (e) {
    console.warn('Failed to auto-pick upcoming stage:', e);
  }
  try {
    const raw = localStorage.getItem(STAGE_ACTIVE_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      // 만약 활성 세션이 미입력 더미 공연이거나 기본 템플릿이면 히스토리 최신(여수 등)으로 즉시 교체
      if (isDummyStage(session) || session.eventTitle === '새 아카라카 공연' || session.eventTitle === '2026 아카라카 무대 큐시트' || !session.eventTitle) {
        const history = getStageHistory();
        const fallback = history[0] || DEFAULT_STAGE_HISTORY[0];
        saveActiveStageSession(JSON.parse(JSON.stringify(fallback)));
        return fallback;
      }
      if (session && Array.isArray(session.songs) && session.songs.length > 0) {
        return session;
      }
    }
  } catch (e) {
    console.warn('Failed to load active stage session:', e);
  }

  // 없으면 히스토리 최상단 항목을 복제해 활성화
  const history = getStageHistory();
  if (history && history.length > 0) {
    const cloned = JSON.parse(JSON.stringify(history[0]));
    saveActiveStageSession(cloned);
    return cloned;
  }

  // 그것도 없으면 기본 세션 생성
  const defaultSession = {
    id: `stage-${Date.now()}`,
    eventTitle: '2026 여수 생활문화한마당',
    date: '2026.10.16',
    venue: '웅천친수공원',
    notes: '2026 여수 생활문화한마당 공연 큐시트 (장소: 웅천친수공원)',
    updatedAt: Date.now(),
    currentIndex: 0,
    songs: (DEFAULT_STAGE_HISTORY[0]?.songs || []).map(s => ({ ...s }))
  };
  saveActiveStageSession(defaultSession);
  return defaultSession;
}

/**
 * 활성 무대 세션 저장 및 히스토리에 자동 반영 (최신순 상단 위치)
 */
export function saveActiveStageSession(session) {
  if (!session) return;
  session.updatedAt = Date.now();
  try {
    localStorage.setItem(STAGE_ACTIVE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save active stage session:', e);
  }

  // 히스토리에도 동기화 반영
  const history = getStageHistory();
  const existingIdx = history.findIndex(h => h.id === session.id);
  let updatedHistory;
  if (existingIdx >= 0) {
    updatedHistory = [...history];
    updatedHistory[existingIdx] = JSON.parse(JSON.stringify(session));
  } else {
    updatedHistory = [JSON.parse(JSON.stringify(session)), ...history];
  }
  saveStageHistory(updatedHistory);
}

/**
 * 새 빈 무대 세션 생성
 */
export function createNewStageSession(title = '새로운 아카라카 공연') {
  const newSession = {
    id: `stage-${Date.now()}`,
    eventTitle: title,
    date: localDateString(new Date(), '.'),
    venue: '메인 무대',
    notes: '새 큐시트',
    updatedAt: Date.now(),
    currentIndex: 0,
    songs: []
  };
  saveActiveStageSession(newSession);
  return newSession;
}

/**
 * 공연 히스토리 항목 삭제 (삭제 기록 영구 보존)
 */
export function deleteStageHistoryItem(id) {
  try {
    const deletedRaw = localStorage.getItem(STAGE_DELETED_KEY);
    const deletedSet = new Set(deletedRaw ? JSON.parse(deletedRaw) : []);
    deletedSet.add(id);
    localStorage.setItem(STAGE_DELETED_KEY, JSON.stringify([...deletedSet]));
  } catch (e) {
    console.warn('Failed to track deleted stage id:', e);
  }

  const history = getStageHistory().filter(item => item.id !== id);
  saveStageHistory(history);
  const active = getActiveStageSession();
  if (active && active.id === id) {
    if (history.length > 0) {
      saveActiveStageSession(JSON.parse(JSON.stringify(history[0])));
    } else {
      createNewStageSession('새 아카라카 공연');
    }
  }
}

export const STAGE_ADMIN_PASSWORD = '1234';

/**
 * 셋리스트 편집, 복제, 삭제 등 편집 기능 실행 전 비밀번호 확인 모달
 */
export function promptStagePassword({ actionName = '편집', onSuccess, onCancel }) {
  const existing = document.getElementById('stage-auth-dialog');
  if (existing) existing.remove();

  const dialog = el('dialog', {
    id: 'stage-auth-dialog',
    class: 'stage-modal-dialog stage-auth-dialog',
    'aria-labelledby': 'stage-auth-title'
  });

  const header = el('div', { class: 'stage-modal-header' },
    el('h3', { id: 'stage-auth-title', text: '🔒 관리자 비밀번호 확인' }),
    button('✕', () => dialog.close(), 'icon-button', null, { 'aria-label': '닫기' })
  );

  const desc = el('p', {
    style: 'font-size: 13.5px; color: var(--muted); margin: 0 0 16px; line-height: 1.5;',
    text: `${actionName} 작업을 진행하려면 비밀번호를 입력해 주세요.`
  });

  const input = el('input', {
    type: 'password',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    maxlength: '10',
    placeholder: '비밀번호 4자리',
    autocomplete: 'current-password',
    style: 'width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 20px; letter-spacing: 6px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); text-align: center;'
  });

  const errEl = el('div', {
    style: 'color: #ef4444; font-size: 12.5px; margin-top: 8px; font-weight: 600; display: none;',
    text: '비밀번호가 일치하지 않습니다.'
  });

  function submit() {
    const val = input.value.trim();
    if (val === STAGE_ADMIN_PASSWORD) {
      dialog.close();
      if (typeof onSuccess === 'function') onSuccess();
    } else {
      errEl.style.display = 'block';
      errEl.textContent = '비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
      input.classList.add('error');
      input.select();
      input.focus();
    }
  }

  const confirmBtn = button('확인', () => submit(), 'button primary', null, { style: 'flex: 1;' });
  const cancelBtn = button('취소', () => dialog.close(), 'button secondary', null, { style: 'flex: 1;' });

  const actions = el('div', { style: 'display: flex; gap: 8px; margin-top: 18px;' }, cancelBtn, confirmBtn);

  const body = el('div', { class: 'stage-modal-body', style: 'padding-top: 6px;' },
    desc,
    input,
    errEl,
    actions
  );

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  dialog.append(header, body);

  dialog.addEventListener('close', () => {
    dialog.remove();
    if (typeof onCancel === 'function') onCancel();
  });

  document.body.append(dialog);
  dialog.showModal();
  setTimeout(() => input.focus(), 60);
}

/**
 * 무대 큐시트(셋리스트 및 커스텀 멘트)를 공유용 JSON 문자열로 직렬화
 */
// 큐시트 곡의 조바꿈을 저장·공유할 값: 큐시트에서 정한 값(0 포함) 또는 이 기기에서 쓰는 곡 조바꿈.
// 받는 쪽도 같은 키로 보이도록 실제로 적용 중인 값을 담는다. 담을 필요가 없으면 null.
export function stageItemTransposeForExport(s) {
  const hasOwn = s && s.transpose !== null && s.transpose !== undefined && s.transpose !== '' && Number.isFinite(Number(s.transpose));
  const semi = resolveStageItemTranspose(s, readStorage('song_transpositions', {}));
  return hasOwn || semi !== 0 ? semi : null;
}

export function serializeStageSession(session) {
  if (!session || typeof session !== 'object') return '';
  const payload = {
    type: 'acaraca-stage-cuesheet',
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id || `stage-${Date.now()}`,
      eventTitle: session.eventTitle || '아카라카 공연',
      date: session.date || localDateString(new Date(), '.'),
      venue: session.venue || '',
      currentIndex: 0,
      songs: Array.isArray(session.songs) ? session.songs.map((s) => {
        const semi = stageItemTransposeForExport(s);
        return {
          songId: s.songId || '',
          title: s.title || '',
          note: s.note || '',
          commentTone: s.commentTone || 'story',
          ...(semi !== null ? { transpose: semi } : {}),
          ...(s.customComment ? { customComment: s.customComment } : {}),
          ...(typeof s.commentVariationIndex === 'number' ? { commentVariationIndex: s.commentVariationIndex } : {})
        };
      }) : []
    }
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * 가져온 JSON 문자열 또는 객체에서 유효한 무대 큐시트 세션 추출
 */
export function parseImportedStageSession(input) {
  const raw = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input;
  const target = (raw && typeof raw === 'object' && raw.session && typeof raw.session === 'object') ? raw.session : raw;
  if (!target || typeof target !== 'object' || !Array.isArray(target.songs)) {
    throw new Error('유효한 무대 큐시트(songs 배열) 형식이 아닙니다.');
  }
  return {
    id: target.id || `stage-${Date.now()}`,
    eventTitle: typeof target.eventTitle === 'string' && target.eventTitle.trim() ? target.eventTitle.trim() : '가져온 아카라카 공연',
    date: typeof target.date === 'string' ? target.date.trim() : localDateString(new Date(), '.'),
    venue: typeof target.venue === 'string' ? target.venue.trim() : '',
    currentIndex: 0,
    updatedAt: Date.now(),
    songs: target.songs
      .filter((s) => s && typeof s === 'object' && (s.songId || s.title))
      .map((s) => {
        const hasOwnSemi = s?.transpose !== null && s?.transpose !== undefined && s?.transpose !== '' && Number.isFinite(Number(s?.transpose));
        const semi = hasOwnSemi ? Math.max(-6, Math.min(6, Math.round(Number(s.transpose)))) : null;
        return {
          songId: typeof s.songId === 'string' ? resolveSongId(s.songId.trim()) : '',
          title: typeof s.title === 'string' ? s.title.trim() : '연습곡',
          note: typeof s.note === 'string' ? s.note.trim() : '',
          commentTone: ['wit', 'story', 'brief'].includes(s.commentTone) ? s.commentTone : 'story',
          ...(semi !== null ? { transpose: semi } : {}),
          ...(typeof s.customComment === 'string' && s.customComment.trim() ? { customComment: s.customComment.trim() } : {}),
          ...(typeof s.commentVariationIndex === 'number' ? { commentVariationIndex: s.commentVariationIndex } : {})
        };
      })
  };
}

/**
 * 무대 큐시트 세션을 URL-safe Base64 파라미터(?cuesheet=...)로 압축 인코딩
 */
export function encodeStageSessionShareParam(session) {
  if (!session || typeof session !== 'object') return '';
  const compact = {
    i: session.id || `stage-${Date.now()}`,
    t: session.eventTitle || '아카라카 공연',
    d: session.date || '',
    v: session.venue || '',
    s: Array.isArray(session.songs)
      ? session.songs.map((s) => {
          const semi = stageItemTransposeForExport(s);
          return {
            id: s.songId || '',
            t: s.title || '',
            ...(s.note ? { n: s.note } : {}),
            ...(semi !== null ? { k: semi } : {}),
            ...(s.commentTone && s.commentTone !== 'story' ? { c: s.commentTone } : {}),
            ...(s.customComment ? { m: s.customComment } : {})
          };
        })
      : []
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * URL 파라미터(?cuesheet=...)에서 무대 큐시트 세션 복원
 */
export function decodeStageSessionShareParam(param) {
  if (!param || typeof param !== 'string') return null;
  try {
    const base64 = param.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const raw = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    if (raw && Array.isArray(raw.s)) {
      return parseImportedStageSession({
        id: raw.i || `stage-${Date.now()}`,
        eventTitle: raw.t || '공유받은 무대 큐시트',
        date: raw.d || '',
        venue: raw.v || '',
        songs: raw.s.map((item) => ({
          songId: item.id || '',
          title: item.t || item.id || '연습곡',
          note: item.n || '',
          commentTone: item.c || 'story',
          ...(typeof item.k === 'number' ? { transpose: item.k } : {}),
          ...(item.m ? { customComment: item.m } : {})
        }))
      });
    }
    return parseImportedStageSession(raw);
  } catch (err) {
    console.warn('Failed to decode stage cuesheet share param:', err);
    return null;
  }
}

/**
 * 원클릭 무대 큐시트 공유 링크 생성
 */
export function buildStageShareUrl(session, baseHref = (typeof location !== 'undefined' ? location.href : 'https://gmlduqzhd123-lab.github.io/Acaraca/index.html')) {
  const url = new URL('./index.html', baseHref);
  url.searchParams.set('tab', 'stage');
  url.searchParams.set('view', 'live');
  const encoded = encodeStageSessionShareParam(session);
  if (encoded) url.searchParams.set('cuesheet', encoded);
  return url.href;
}
