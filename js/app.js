import {loadSongs, PARTS, availableParts, preferredPart, resolveSongId} from './data.js';
import {resolveMyPart, collectMemberNames, orderedPitchItems as orderedPitchItemsFor, parseStageDate, nextStage, daysUntil, resolveStageItemTranspose, sortSongs, localDateString, isLightRoute, getScoreFormatKey, getScoreFormatLabel, sanitizeBackup, isSafeLinkUrl} from './practiceLogic.js';
import {parseYouTube, createPlayer, createSectionLooper, formatPlayerTime, destroyDetachedPlayers} from './player.js';
import {read, write, remove, isAvailable} from './storage.js';
import {filterSongs} from './search.js';
import {readRoute, writeRoute, routeUrl} from './router.js';
import {el, icon, button, toast, cover, emptyState} from './ui.js';
import {NOTES, OCTAVES, getNoteFrequency, playPitch, stopPitch, getCurrentPlaying, getCurrentSequence, subscribePitchState, parseNoteString, transposeNoteString, transposeMusicalKey, playNoteString, playChordStrings, playPitchSequence, stopPitchSequence, isPitchSequencePlaying, pitchPipeInfo, playPitchPipe, frequencyToPitchInfo, startVocalTuner, stopVocalTuner, isVocalTunerRunning, startMetronome, stopMetronome, isMetronomeRunning, getMetronomeBpm, setMetronomeBpm} from './pitch.js';
import {
  loadPerformances,
  loadRehearsals,
  loadScores,
  loadMemories,
  loadEducation,
  loadPracticeVideos,
  loadAppreciation,
  getAllFeedbacks,
  addFeedback,
  toggleFeedbackLike,
  getPerformancesForSong,
  getRehearsalsForSong,
  getScoresForSong,
  getAppreciationForSong,
  addCustomRehearsal,
  attachMediaToRehearsal,
  deleteCustomRehearsal,
  addCustomScore
} from './archive.js';
import { saveMediaFile } from './mediaStorage.js';
import { qrDataUrl, loadQrLibrary } from './qr.js';
import {
  requestWakeLock,
  releaseWakeLock,
  isWakeLockActive,
  enterPocketMode,
  exitPocketMode,
  isPocketModeActive,
  updateMediaSession,
  setMediaSessionPlaybackState
} from './backgroundPlay.js';
import {
  getStageHistory,
  getActiveStageSession,
  getSongStartingPitchEntries,
  saveActiveStageSession,
  createNewStageSession,
  deleteStageHistoryItem,
  saveStageHistory,
  promptStagePassword,
  resolveSongData,
  decodeStageSessionShareParam,
  estimateSetlistDurationSeconds
} from './stageStore.js';

// 나중에 불러오는 화면 코드: 한 번 실패한 import() 주소는 브라우저가 '실패'로 기억해 다시 요청하지 않는다.
// 그래서 다시 시도할 때는 주소 끝에 표시를 붙여 새로 받는다(오프라인이면 서비스워커가 저장본을 준다).
const lazyImportFailures = new Map();
function importLazy(path) {
  const failures = lazyImportFailures.get(path) || 0;
  const url = failures ? `${path}?retry=${failures}-${Date.now()}` : path;
  return import(url).then((mod) => {
    lazyImportFailures.delete(path);
    return mod;
  }, (error) => {
    lazyImportFailures.set(path, failures + 1);
    throw error;
  });
}

// 무대 화면(js/stage.js, 큰 파일)은 무대 탭을 처음 열 때 불러온다.
let stageViewModule = null;
let stageViewPromise = null;
function loadStageView() {
  if (stageViewModule) return Promise.resolve(stageViewModule);
  if (!stageViewPromise) {
    stageViewPromise = importLazy('./stage.js').then((mod) => (stageViewModule = mod)).catch((error) => {
      stageViewPromise = null;
      throw error;
    });
  }
  return stageViewPromise;
}
function cleanupStageLive() {
  stageViewModule?.cleanupStageLive();
}

const app = document.getElementById('app');
const labels = {
  home: '홈',
  stage: '공연 아카이브', // 구 stage: '아카라카 영상'
  songs: '아카라카 연습실',
  appreciation: '아카펠라 감상',
  scores: '악보 창고',
  memories: '우리들의 기록',
  rehearsal: '연습 일지',
  practiceVideos: '연습 영상',
  education: '교육 자료',
  favorites: '즐겨찾기',
  recent: '최근 연습',
  settings: '설정'
};
const navIcons = {
  home: 'home',
  stage: 'stage',
  songs: 'library',
  appreciation: 'sparkles',
  scores: 'document',
  memories: 'camera',
  rehearsal: 'notes',
  practiceVideos: 'video',
  education: 'academic',
  favorites: 'heart',
  recent: 'clock',
  settings: 'settings'
};
const levels = {1: '초급', 2: '중급', 3: '고급'};
const statuses = {practice: '현재 연습', complete: '완료', archive: '보관'};
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
// 합쳐진 곡의 예전 id(SONG_ID_ALIASES)로 저장된 기록은 지금 id로 옮긴다.
const favoriteIds = [...new Set(array(read('favorites', [])).filter(value => typeof value === 'string').map(resolveSongId))];
const storedProgress = Object.fromEntries(Object.entries(object(read('progress', {}))).map(([id, value]) => [resolveSongId(id), value]));
const state = {
  songs: [],
  performances: [],
  rehearsals: [],
  scores: [],
  memories: [],
  education: [],
  practiceVideos: [],
  appreciation: [],
  loading: true,
  archiveLoaded: false,
  loadError: '',
  favorites: new Set(favoriteIds),
  recent: array(read('recent', [])).filter(value => value && typeof value.songId === 'string' && typeof value.part === 'string' && Number.isFinite(value.timestamp)).map(value => ({...value, songId: resolveSongId(value.songId)})),
  myPart: Object.keys(PARTS).filter(part => part !== 'full').includes(read('myPart', '')) ? read('myPart', '') : '',
  myName: typeof read('myName', '') === 'string' ? read('myName', '') : '',
  setlist: null,
  progress: storedProgress,
  songTranspositions: object(read('song_transpositions', {})),
  filters: {query: '', status: '', category: '', difficulty: '', part: '', mastery: ''},
  browseSort: typeof read('browseSort', '') === 'string' ? read('browseSort', '') : '',
  browseFilterOpen: typeof window !== 'undefined' ? window.innerWidth > 900 : false,
  stageView: read('stageView', 'live'),
  stageFilters: {query: '', category: ''},
  rehearsalFilters: {query: '', songId: ''},
  scoreFilters: {query: '', category: '', songId: '', year: '', format: ''},
  educationFilters: {query: '', category: '', target: ''},
  practiceVideoFilters: {query: '', part: '', songId: '', sourceType: ''},
  appreciationFilters: {query: '', category: '', artist: '', sortBy: 'latest'},
  memoryFilters: {category: ''},
  route: readRoute(),
  random: null,
  player: null,
  initialSeek: null
};
const activeAudios = new Set();
const activePlayers = [];
const desktopNavGroups = [
  { title: '연습 & 무대', tabs: ['home', 'songs', 'stage', 'scores'] },
  { title: '아카이브', tabs: ['rehearsal', 'practiceVideos', 'appreciation', 'memories', 'education'] },
  { title: '나의 연습', tabs: ['favorites', 'recent', 'settings'] }
];
const mobilePrimaryTabs = ['home', 'songs', 'stage', 'scores'];
const mobileMoreTabs = ['rehearsal', 'practiceVideos', 'appreciation', 'memories', 'education', 'favorites', 'recent', 'settings'];
const mobileShortLabels = { home: '홈', songs: '연습실', stage: '무대', scores: '악보' };
let theme = ['system', 'light', 'dark'].includes(read('theme', 'system')) ? read('theme', 'system') : 'system';
const colorPreference = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'system' ? (colorPreference.matches ? 'dark' : 'light') : theme;
}
applyTheme();
colorPreference.addEventListener('change', applyTheme);

// --- 실시간 반음 조바꿈 (±반음 Key Transposition) 헬퍼 ---
function getSongTranspose(songId) {
  if (!songId) return 0;
  const raw = Number(state.songTranspositions?.[songId]);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-6, Math.min(6, Math.round(raw)));
}

function setSongTranspose(songId, semitones) {
  if (!songId) return 0;
  const next = Math.max(-6, Math.min(6, Math.round(Number(semitones) || 0)));
  const updated = { ...object(state.songTranspositions) };
  if (next === 0) delete updated[songId];
  else updated[songId] = next;
  state.songTranspositions = updated;
  write('song_transpositions', updated);
  return next;
}

function formatTransposeBadgeText(semi) {
  const s = Math.round(Number(semi) || 0);
  return s === 0 ? '원키' : `${s > 0 ? '+' : ''}${s}키`;
}

function getSongVoicePartMapping(song) {
  const allKeys = [
    ...Object.keys(song?.videos || {}).filter(k => song?.videos?.[k]?.url),
    ...Object.keys(song?.startingPitches || {}),
    ...Object.keys(song?.partNames || {})
  ];
  const numberedNums = allKeys
    .filter(k => /^part\d+$/.test(k))
    .map(k => parseInt(k.slice(4), 10))
    .filter(n => Number.isFinite(n));
  const maxPartNum = numberedNums.length ? Math.max(...numberedNums) : 5;

  if (maxPartNum === 4) {
    return {
      voiceToPart: { soprano: 'part1', alto: 'part2', tenor: 'part3', baritone: 'part4', bass: 'part4' },
      partToVoice: { part1: 'soprano', part2: 'alto', part3: 'tenor', part4: 'bass' },
      voiceHint: { part1: 'SOP', part2: 'ALTO', part3: 'TENOR', part4: 'BASS' }
    };
  }
  if (maxPartNum === 6) {
    return {
      voiceToPart: { soprano: 'part1', alto: 'part2', tenor: 'part3', baritone: 'part5', bass: 'part6' },
      partToVoice: { part1: 'soprano', part2: 'alto', part3: 'tenor', part4: 'tenor', part5: 'baritone', part6: 'bass' },
      voiceHint: { part1: 'SOP', part2: 'ALTO', part3: 'TENOR 1', part4: 'TENOR 2', part5: 'BARI', part6: 'BASS' }
    };
  }
  if (maxPartNum >= 7) {
    return {
      voiceToPart: { soprano: 'part1', alto: 'part3', tenor: 'part4', baritone: 'part5', bass: 'part6' },
      partToVoice: { part1: 'soprano', part2: 'soprano', part3: 'alto', part4: 'tenor', part5: 'baritone', part6: 'bass', part7: 'bass' },
      voiceHint: { part1: 'SOP 1', part2: 'SOP 2', part3: 'ALTO', part4: 'TENOR', part5: 'BARI', part6: 'BASS 1', part7: 'BASS 2' }
    };
  }
  return {
    voiceToPart: { soprano: 'part1', alto: 'part2', tenor: 'part3', baritone: 'part4', bass: 'part5' },
    partToVoice: { part1: 'soprano', part2: 'alto', part3: 'tenor', part4: 'baritone', part5: 'bass' },
    voiceHint: { part1: 'SOP', part2: 'ALTO', part3: 'TENOR', part4: 'BARI', part5: 'BASS' }
  };
}

function getTransposedPartNote(song, partKey) {
  if (!song?.startingPitches || !partKey) return '';
  let raw = song.startingPitches[partKey];
  if (!raw) {
    const { voiceToPart, partToVoice } = getSongVoicePartMapping(song);
    if (voiceToPart[partKey]) raw = song.startingPitches[voiceToPart[partKey]];
    else if (partToVoice[partKey]) raw = song.startingPitches[partToVoice[partKey]];
  }
  if (!raw) return '';
  return transposeNoteString(raw, getSongTranspose(song.id));
}

// --- 파트 숙련도 3단계 & 누적 연습 시간 트래커 (state.progress 활성화) ---
const MASTERY_META = {
  0: { label: '○ 아직 미시작', short: '미시작', icon: '○' },
  1: { label: '🌱 음정 익히는 중', short: '음정 익히는 중', icon: '🌱' },
  2: { label: '🎵 암보 연습 중', short: '암보 연습 중', icon: '🎵' },
  3: { label: '✨ 무대 준비 완료', short: '무대 준비 완료', icon: '✨' }
};

function getSongProgress(songId) {
  if (!songId) return { level: 0, practiceSec: 0, updatedAt: '' };
  const entry = state.progress?.[songId];
  if (typeof entry === 'number') {
    const lv = [0, 1, 2, 3].includes(entry) ? entry : 0;
    return { level: lv, practiceSec: 0, updatedAt: '' };
  }
  if (entry && typeof entry === 'object') {
    const lv = [0, 1, 2, 3].includes(Number(entry.level)) ? Number(entry.level) : 0;
    const sec = Number.isFinite(Number(entry.practiceSec)) ? Math.max(0, Math.floor(Number(entry.practiceSec))) : 0;
    return { level: lv, practiceSec: sec, updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '' };
  }
  return { level: 0, practiceSec: 0, updatedAt: '' };
}

function setSongMasteryLevel(songId, level) {
  if (!songId) return;
  const lv = [0, 1, 2, 3].includes(Number(level)) ? Number(level) : 0;
  const prev = getSongProgress(songId);
  const nextProgress = { ...object(state.progress) };
  if (lv === 0 && prev.practiceSec === 0) {
    delete nextProgress[songId];
  } else {
    nextProgress[songId] = {
      level: lv,
      practiceSec: prev.practiceSec,
      updatedAt: new Date().toISOString()
    };
  }
  state.progress = nextProgress;
  write('progress', nextProgress);
}

function addSongPracticeSeconds(songId, deltaSec) {
  if (!songId || !Number.isFinite(deltaSec) || deltaSec <= 0) return;
  const prev = getSongProgress(songId);
  const nextSec = prev.practiceSec + Math.round(deltaSec);
  const nextProgress = {
    ...object(state.progress),
    [songId]: {
      level: prev.level,
      practiceSec: nextSec,
      updatedAt: new Date().toISOString()
    }
  };
  state.progress = nextProgress;
  write('progress', nextProgress);
  document.querySelectorAll(`[data-practice-time-song="${songId}"]`).forEach((node) => {
    node.textContent = `⏱️ 누적 연습 ${formatPracticeTotalTime(nextSec)}`;
  });
}

function formatPracticeTotalTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s === 0) return '0분';
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}시간 ${remM}분` : `${h}시간`;
}

function renderMasteryControlPanel(song) {
  if (!song?.id) return null;
  const cur = getSongProgress(song.id);
  const timeBadge = el('span', {
    class: 'mastery-time-badge',
    'data-practice-time-song': song.id,
    text: `⏱️ 누적 연습 ${formatPracticeTotalTime(cur.practiceSec)}`
  });

  const chipGroup = el('div', { class: 'mastery-chip-group', role: 'group', 'aria-label': `${song.title} 숙련도 선택` });
  [0, 1, 2, 3].forEach((lv) => {
    const meta = MASTERY_META[lv];
    const isActive = cur.level === lv;
    const chip = el('button', {
      type: 'button',
      class: `mastery-chip level-${lv}${isActive ? ' active' : ''}`,
      'aria-pressed': String(isActive),
      onclick: () => {
        setSongMasteryLevel(song.id, lv);
        for (const btn of chipGroup.querySelectorAll('.mastery-chip')) {
          const activeNow = btn === chip;
          btn.classList.toggle('active', activeNow);
          btn.setAttribute('aria-pressed', String(activeNow));
        }
        toast(lv === 0 ? `'${song.title}' 숙련도 표시를 초기화했습니다.` : `${meta.label} 상태로 기록했습니다!`);
      }
    }, meta.label);
    chipGroup.append(chip);
  });

  return el('section', { class: 'mastery-panel', 'aria-label': '나의 곡 숙련도 및 연습 시간' },
    el('div', { class: 'mastery-panel-head' },
      el('div', {},
        el('h3', { class: 'mastery-panel-title', text: '🎯 나의 곡 숙련도 체크' }),
        el('p', { class: 'mastery-panel-desc', text: '음정 익히기부터 암보·무대 준비 완료까지 내 진도를 체크하면 연습실 목록에서 한눈에 모아볼 수 있어요.' })
      ),
      timeBadge
    ),
    chipGroup
  );
}

function navigate(route, {replace = false, focus = true} = {}) {
  stopPitch();
  state.route = route; writeRoute(route, {replace}); render(); window.scrollTo({top: 0, behavior: 'instant'});
  if (focus) app.focus({preventScroll: true});
}
function switchStageSubView(view) {
  state.stageView = view;
  write('stageView', view);
  navigate({tab: 'stage', view}, {replace: true});
}
// 모바일에서 대화상자가 화면보다 길면 포커스된 아래쪽 버튼으로 스크롤되어 제목이 가려지므로 열 때 맨 위로
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.__acaTopFix) {
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (...args) {
    const result = originalShowModal.apply(this, args);
    this.scrollTop = 0;
    requestAnimationFrame(() => { this.scrollTop = 0; });
    return result;
  };
  HTMLDialogElement.prototype.__acaTopFix = true;
}
function openSong(song) { navigate({song: song.id}); }
// 이름(나는 누구?)이 설정되어 있으면 곡마다 그 사람이 맡은 파트를, 없으면 기본 파트를 내 파트로 사용
function songMyPart(song) { return resolveMyPart(song, state.myName, state.myPart); }
function allMemberNames() { return collectMemberNames(state.songs); }
function myVoiceLabel() {
  if (state.myName) return state.myPart ? `${state.myName} · 그 외 ${PARTS[state.myPart]}` : state.myName;
  return state.myPart ? PARTS[state.myPart] : '';
}
function startPractice(song, explicitPart) {
  const myPart = songMyPart(song);
  const avail = availableParts(song);
  let part = explicitPart;
  if (!part) {
    if (myPart && avail.includes(myPart)) {
      part = myPart;
    } else if (myPart && !avail.includes(myPart) && avail.includes('full')) {
      part = 'full';
      setTimeout(() => toast(`💡 담당 파트(${PARTS[myPart] || myPart}) 개별 영상이 없어 전체 합주(Full) 영상으로 안내합니다.`), 60);
    } else {
      part = preferredPart(song, myPart);
    }
  }
  if (part) navigate({song: song.id, part});
  else { openSong(song); toast('아직 등록된 연습 영상이 없습니다.'); }
}

function openAdmin(targetUrl = './admin.html') {
  if (sessionStorage.getItem('acaroom_admin_auth') === 'true') {
    window.location.href = targetUrl;
    return;
  }
  const dialog = document.getElementById('admin-auth-dialog');
  if (!dialog) {
    const pass = window.prompt('관리자 비밀번호를 입력해 주세요:');
    if (pass === '1234') {
      sessionStorage.setItem('acaroom_admin_auth', 'true');
      window.location.href = targetUrl;
    } else if (pass !== null) {
      toast('비밀번호가 일치하지 않습니다.');
    }
    return;
  }

  const form = document.getElementById('admin-auth-form');
  const input = document.getElementById('admin-auth-password');
  const errEl = document.getElementById('admin-auth-error');
  const cancelBtn = document.getElementById('admin-auth-cancel');

  input.value = '';
  if (errEl) { errEl.textContent = ''; errEl.hidden = true; }

  const onSubmit = (e) => {
    e.preventDefault();
    if (input.value === '1234') {
      sessionStorage.setItem('acaroom_admin_auth', 'true');
      dialog.close();
      window.location.href = targetUrl;
    } else {
      if (errEl) {
        errEl.textContent = '비밀번호가 일치하지 않습니다.';
        errEl.hidden = false;
      }
      input.select();
    }
  };

  const onCancel = () => {
    dialog.close();
  };

  form.onsubmit = onSubmit;
  if (cancelBtn) cancelBtn.onclick = onCancel;
  dialog.showModal();
  setTimeout(() => input.focus(), 60);
}

const SECTION_AUTH_PASSWORD = '1234';
const SECTION_AUTH_NOTICE = '비밀번호는 엽쌤에게 문의하세요';

function isProtectedAuthorized(tab) {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem('acaroom_protected_auth') === 'true'
      || sessionStorage.getItem(`acaroom_${tab}_auth`) === 'true';
  } catch (e) {
    return false;
  }
}

function setProtectedAuthorized(tab) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('acaroom_protected_auth', 'true');
      sessionStorage.setItem('acaroom_scores_auth', 'true');
      sessionStorage.setItem('acaroom_education_auth', 'true');
    }
  } catch (e) {}
}

function openProtectedAuthDialog(tab = 'scores', onSuccess, onCancel) {
  const isScores = tab === 'scores';
  const sectionTitle = isScores ? '악보 창고' : '교육 자료';
  const sectionIcon = isScores ? '🎼' : '🎓';

  if (isProtectedAuthorized(tab)) {
    if (typeof onSuccess === 'function') onSuccess();
    else render();
    return;
  }

  const dialog = document.getElementById('protected-auth-dialog');
  if (!dialog) {
    const entered = window.prompt(`${sectionTitle} 비밀번호를 입력해 주세요:\n(${SECTION_AUTH_NOTICE})`);
    if (entered === SECTION_AUTH_PASSWORD) {
      setProtectedAuthorized(tab);
      toast('인증되었습니다.');
      if (typeof onSuccess === 'function') onSuccess();
      else render();
    } else if (entered !== null) {
      toast(`비밀번호가 일치하지 않습니다. ${SECTION_AUTH_NOTICE}`);
      if (typeof onCancel === 'function') onCancel();
    } else {
      if (typeof onCancel === 'function') onCancel();
    }
    return;
  }

  const titleEl = document.getElementById('protected-auth-title');
  const iconEl = document.getElementById('protected-auth-icon');
  const descEl = document.getElementById('protected-auth-desc');
  const form = document.getElementById('protected-auth-form');
  const input = document.getElementById('protected-auth-password');
  const errEl = document.getElementById('protected-auth-error');
  const cancelBtn = document.getElementById('protected-auth-cancel');
  const closeBtn = document.getElementById('protected-auth-close');

  if (titleEl) titleEl.textContent = `${sectionTitle} 비밀번호 인증`;
  if (iconEl) iconEl.textContent = sectionIcon;
  if (descEl) descEl.textContent = `${sectionTitle} 열람을 위해 비밀번호를 입력해 주세요.`;

  if (input) input.value = '';
  if (errEl) {
    errEl.textContent = `비밀번호가 일치하지 않습니다. ${SECTION_AUTH_NOTICE}`;
    errEl.hidden = true;
  }

  let closedWithAuth = false;

  const handleClose = () => {
    if (dialog.open) dialog.close();
    if (!closedWithAuth && typeof onCancel === 'function') onCancel();
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const val = input ? input.value.trim() : '';
    if (val === SECTION_AUTH_PASSWORD) {
      closedWithAuth = true;
      setProtectedAuthorized(tab);
      if (dialog.open) dialog.close();
      toast('인증되었습니다.');
      if (typeof onSuccess === 'function') onSuccess();
      else render();
    } else {
      if (errEl) {
        errEl.textContent = `비밀번호가 일치하지 않습니다. ${SECTION_AUTH_NOTICE}`;
        errEl.hidden = false;
      }
      if (input) {
        input.classList.add('error');
        input.select();
        input.focus();
      }
    }
  };

  if (form) form.onsubmit = onSubmit;
  if (cancelBtn) cancelBtn.onclick = handleClose;
  if (closeBtn) closeBtn.onclick = handleClose;

  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
    setTimeout(() => input && input.focus(), 60);
  }
}

function renderProtectedLockScreen(tab) {
  const isScores = tab === 'scores';
  const title = isScores ? '악보 창고' : '교육 자료';
  const iconSymbol = isScores ? '🎼' : '🎓';
  const eyebrow = isScores ? 'SECURE SCORE ARCHIVE' : 'ACAPELLA EDUCATION ARCHIVE';
  const desc = isScores
    ? '아카라카 및 연구회 소중한 악보 자료 보호를 위해 비밀번호 인증이 필요합니다.'
    : '선생님과 학생을 위한 워크숍, 교재 PDF, 수업 강의 영상 보호를 위해 비밀번호 인증이 필요합니다.';

  app.replaceChildren(
    el('div', { class: 'page-heading' },
      el('p', { class: 'eyebrow', text: eyebrow }),
      el('h1', { text: `${iconSymbol} ${title}` }),
      el('p', { text: desc })
    ),
    el('div', { class: 'protected-lock-state' },
      el('div', { class: 'protected-lock-icon' }, '🔒'),
      el('h2', { class: 'protected-lock-title', text: `${title} 접근 비밀번호` }),
      el('p', { class: 'protected-lock-desc', text: `${title}는 회원 전용 공간으로 비밀번호 입력 후 이용하실 수 있습니다.` }),
      el('div', { class: 'protected-notice-badge' },
        el('span', {}, '💡'),
        el('span', { text: SECTION_AUTH_NOTICE })
      ),
      el('div', { class: 'protected-lock-actions' },
        button('🔑 비밀번호 입력하기', () => openProtectedAuthDialog(tab, () => isScores ? renderScores() : renderEducation()), 'button primary', 'lock'),
        button('🏠 홈으로 돌아가기', () => navigate({ tab: 'home' }), 'button secondary', 'home')
      )
    )
  );
}

function renderNavIcon(tab) {
  return el('img', {
    class: 'nav-icon-img',
    src: `./assets/icons/nav/${tab}.png`,
    alt: '',
    width: '22',
    height: '22',
    loading: 'lazy',
    onerror: (e) => {
      const fallback = icon(navIcons[tab] || 'sparkles');
      if (e.target && e.target.parentNode) {
        e.target.parentNode.replaceChild(fallback, e.target);
      }
    }
  });
}

let deferredInstallPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const directBtn = document.getElementById('pwa-direct-install-btn');
    if (directBtn) directBtn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    toast('AcaRaca 앱이 성공적으로 설치되었습니다! 🎉');
  });
}

function openInstallDialog() {
  const dialog = document.getElementById('install-dialog');
  if (!dialog) return;
  const directBtn = document.getElementById('pwa-direct-install-btn');
  if (directBtn) {
    directBtn.hidden = !deferredInstallPrompt;
    directBtn.onclick = async () => {
      if (!deferredInstallPrompt) return;
      dialog.close();
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        toast('AcaRaca 앱 설치를 진행합니다.');
      }
      deferredInstallPrompt = null;
    };
  }
  dialog.showModal();
}

function openGuideDialog() {
  const dialog = document.getElementById('guide-dialog');
  if (dialog) dialog.showModal();
}

function openBackgroundGuideModal() {
  const dialog = document.getElementById('background-guide-dialog');
  if (dialog) dialog.showModal();
}

let topbarMoreRefs = null;
let topbarMoreListenerAdded = false;
let mobileMoreKeyHandler = null;
// 휴대폰 '뒤로가기'로 더보기 메뉴만 닫히도록, 메뉴를 열 때 같은 주소의 기록을 하나 쌓는다
let mobileMoreHistoryEntry = false;
let suppressNextPopstate = false;

/**
 * 더보기 메뉴 닫기.
 * - history: 'back'(기본) → 메뉴용 기록을 되돌린다 (X·바깥·Esc로 닫을 때)
 * - history: 'keep' → 기록은 그대로 두고, 바로 이어지는 화면 이동이 그 기록을 덮어쓴다 (반환값 true면 replace로 이동)
 * - history: 'none' → 뒤로가기로 이미 기록이 빠졌거나 화면을 다시 그리는 중
 */
function closeMobileMoreSheet({history: historyMode = 'back'} = {}) {
  const sheet = document.getElementById('mobile-more-sheet');
  if (sheet) sheet.remove();
  if (mobileMoreKeyHandler) {
    window.removeEventListener('keydown', mobileMoreKeyHandler);
    mobileMoreKeyHandler = null;
  }
  document.body.classList.remove('mobile-more-open');
  const moreBtn = document.querySelector('#mobile-nav .mobile-more-trigger');
  if (moreBtn) {
    moreBtn.setAttribute('aria-expanded', 'false');
    const activeTab = state.route.song ? 'songs' : state.route.tab || 'home';
    moreBtn.classList.toggle('active', mobileMoreTabs.includes(activeTab));
  }
  const hadEntry = mobileMoreHistoryEntry && Boolean(history.state?.acaMoreSheet);
  mobileMoreHistoryEntry = false;
  if (hadEntry && historyMode === 'back') {
    suppressNextPopstate = true;
    history.back();
  }
  return hadEntry && historyMode === 'keep';
}

/** 더보기 메뉴에서 다른 화면으로 이동: 메뉴용 기록을 새 화면이 덮어써 뒤로가기 한 번에 이전 화면으로 돌아간다 */
function navigateFromMoreSheet(route) {
  const replace = closeMobileMoreSheet({history: 'keep'});
  navigate(route, {replace});
}

function openMobileMoreSheet() {
  if (document.getElementById('mobile-more-sheet')) {
    closeMobileMoreSheet();
    return;
  }
  const activeTab = state.route.song ? 'songs' : state.route.tab || 'home';
  const voiceText = myVoiceLabel() || '단원 이름·파트 미설정';

  const sheetGrid = el('div', {class: 'mobile-more-grid'},
    mobileMoreTabs.map(tab => el('a', {
      class: `mobile-more-item${tab === activeTab ? ' active' : ''}`,
      href: routeUrl({tab}).href,
      'aria-current': tab === activeTab ? 'page' : null,
      onclick: (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateFromMoreSheet({tab});
      }
    }, renderNavIcon(tab), el('span', {text: labels[tab]})))
  );

  const profileStrip = el('div', {class: 'mobile-more-profile'},
    el('div', {class: 'mobile-more-profile-copy'},
      icon('mic'),
      el('div', {},
        el('span', {class: 'mobile-more-profile-kicker', text: '나의 목소리'}),
        el('strong', {text: voiceText})
      )
    ),
    button('변경', () => {
      navigateFromMoreSheet({tab: 'settings'});
    }, 'button secondary small')
  );

  const panel = el('div', {class: 'mobile-more-panel'},
    el('div', {class: 'mobile-more-handle', 'aria-hidden': 'true'}),
    el('div', {class: 'mobile-more-header'},
      el('div', {},
        el('h2', {text: '전체 메뉴'}),
        el('p', {text: '아카이브와 개인 연습 메뉴를 한눈에 열어보세요'})
      ),
      button('', () => closeMobileMoreSheet(), 'icon-button mobile-more-close', 'close', {'aria-label': '메뉴 닫기'})
    ),
    profileStrip,
    sheetGrid
  );

  const overlay = el('div', {
    id: 'mobile-more-sheet',
    class: 'mobile-more-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '전체 메뉴',
    onclick: (e) => {
      if (e.target === overlay) closeMobileMoreSheet();
    }
  }, panel);

  mobileMoreKeyHandler = (e) => {
    if (e.key === 'Escape') closeMobileMoreSheet();
  };
  window.addEventListener('keydown', mobileMoreKeyHandler);
  document.body.append(overlay);
  document.body.classList.add('mobile-more-open');
  try {
    history.pushState({...(history.state || {}), acaroom: true, acaMoreSheet: true}, '', location.href);
    mobileMoreHistoryEntry = true;
  } catch {
    mobileMoreHistoryEntry = false;
  }

  const moreBtn = document.querySelector('#mobile-nav .mobile-more-trigger');
  if (moreBtn) {
    moreBtn.setAttribute('aria-expanded', 'true');
    moreBtn.classList.add('active');
  }
  panel.querySelector('.mobile-more-item.active, .mobile-more-item')?.focus?.({preventScroll: true});
}

function refreshChrome() {
  const activeTab = state.route.song ? 'songs' : state.route.tab || 'home';
  const desktopNav = document.getElementById('desktop-nav');
  if (desktopNav) {
    const groupedNodes = [];
    for (const group of desktopNavGroups) {
      groupedNodes.push(el('p', {class: 'nav-group-label', text: group.title}));
      for (const tab of group.tabs) {
        groupedNodes.push(el('a', {
          class: `nav-link${tab === activeTab ? ' active' : ''}`, href: routeUrl({tab}).href,
          'aria-current': tab === activeTab ? 'page' : null,
          onclick: event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate({tab}); }
        }, renderNavIcon(tab), el('span', {text: labels[tab]})));
      }
    }
    desktopNav.replaceChildren(...groupedNodes);
  }
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    const isMoreActive = mobileMoreTabs.includes(activeTab) || Boolean(document.getElementById('mobile-more-sheet'));
    const primaryLinks = mobilePrimaryTabs.map(tab => el('a', {
      class: `nav-link${tab === activeTab ? ' active' : ''}`, href: routeUrl({tab}).href,
      'aria-current': tab === activeTab ? 'page' : null,
      onclick: event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateFromMoreSheet({tab});
      }
    }, renderNavIcon(tab), el('span', {text: mobileShortLabels[tab] || labels[tab]})));
    const moreTabBtn = el('button', {
      type: 'button',
      class: `nav-link mobile-more-trigger${isMoreActive ? ' active' : ''}`,
      'aria-label': '전체 메뉴 더보기',
      'aria-haspopup': 'dialog',
      'aria-expanded': String(Boolean(document.getElementById('mobile-more-sheet'))),
      onclick: () => openMobileMoreSheet()
    }, icon('more'), el('span', {text: '더보기'}));
    mobileNav.replaceChildren(...primaryLinks, moreTabBtn);
  }
  document.getElementById('sidebar-bottom').replaceChildren(
    button('🎤 무대 전용 큐시트', () => navigate({tab: 'stage', view: 'live'}), 'button primary small', 'stage', {style: 'width: 100%; margin-bottom: 8px; font-weight: 700;'}),
    button('첫 음 잡기 (피치파이프)', () => openPitchPipe(), 'button secondary small', 'music', {style: 'width: 100%; margin-bottom: 12px;'}),
    el('div', {class: 'my-part-mini'}, icon('mic'), el('div', {}, el('span', {text: '나의 목소리'}), el('strong', {text: myVoiceLabel() || '내 이름·파트를 선택해 주세요'})),
      button('변경', () => navigate({tab: 'settings'}), 'text-button')),
    el('p', {class: 'sidebar-tip', text: '서로 다른 목소리, 하나의 하모니.'})
  );
  const mobileSettingsBtn = document.getElementById('mobile-settings-btn');
  if (mobileSettingsBtn) {
    mobileSettingsBtn.replaceChildren(icon('settings'));
    mobileSettingsBtn.classList.toggle('active', activeTab === 'settings');
    mobileSettingsBtn.onclick = () => navigate({tab: 'settings'});
  }
  // 휴대폰에서는 자주 쓰는 버튼(첫 음 잡기·검색)만 보이고 나머지는 ⋯ 메뉴로 묶음
  const moreMenu = el('div', {class: 'topbar-more-menu', hidden: true, role: 'menu'});
  const closeMore = () => { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); };
  const extra = (label, action, iconName, attrs = {}) => button(label, () => { closeMore(); action(); }, 'button secondary small topbar-extra', iconName, attrs);
  // 앱설치·QR은 휴대폰에서도 ⋯ 메뉴에 숨기지 않고 맨 윗줄(설정 버튼 옆)에 바로 보이게 함
  const keyBtn = (label, action, iconName, attrs) => button(label, action, 'button secondary small topbar-key', iconName, attrs);
  const extras = [
    keyBtn('앱설치', () => openInstallDialog(), 'download', {'aria-label': 'AcaRaca 앱 설치 안내'}),
    keyBtn('📱 QR', () => window.YSQr?.open(), null, {'aria-label': 'QR 코드로 접속', 'data-qr-btn': ''}),
    extra('🎤 무대', () => navigate({tab: 'stage', view: 'live'}), 'stage', {'aria-label': '무대 전용 큐시트 모드'}),
    extra('설명서', () => openGuideDialog(), 'book', {'aria-label': 'AcaRaca 연습실 사용 설명서'}),
    extra('+ 곡 추가', () => openAdmin('./admin.html?action=new'), null, {'aria-label': '새 곡 및 영상 추가'})
  ];
  const moreBtn = button('', () => {
    const open = moreMenu.hidden;
    if (open) moreMenu.replaceChildren(...extras.filter(b => !b.classList.contains('topbar-key')).map(b => { const c = b.cloneNode(true); c.onclick = () => { closeMore(); b.click(); }; c.classList.remove('topbar-extra'); return c; }));
    moreMenu.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open));
  }, 'icon-button topbar-more-btn', 'more', {'aria-label': '더보기 메뉴', 'aria-expanded': 'false', 'aria-haspopup': 'menu'});
  // 바깥 클릭 시 닫기: 화면이 바뀔 때마다 리스너가 쌓이지 않도록 한 번만 등록하고 현재 메뉴만 참조
  topbarMoreRefs = {menu: moreMenu, btn: moreBtn, close: closeMore};
  if (!topbarMoreListenerAdded) {
    topbarMoreListenerAdded = true;
    document.addEventListener('click', (e) => {
      const ref = topbarMoreRefs;
      if (ref && !ref.menu.hidden && !ref.menu.contains(e.target) && !ref.btn.contains(e.target)) ref.close();
    });
  }
  document.getElementById('topbar-actions').replaceChildren(
    extras[0], extras[1], extras[2], extras[3],
    button('첫 음 잡기', () => openPitchPipe(), 'button secondary small topbar-pitch', 'music', {'aria-label': '첫 음 잡기 (피치파이프)'}),
    extras[4],
    button('', () => { if (!document.getElementById('song-search')) navigate({tab: 'songs'}); document.getElementById('song-search')?.focus(); }, 'icon-button', 'search', {'aria-label': '곡 검색'}),
    button('', () => navigate({tab: 'settings'}), 'icon-button desktop-settings-btn', 'settings', {'aria-label': '설정 열기'}),
    moreBtn, moreMenu
  );
}

function favoriteButton(song) {
  const active = state.favorites.has(song.id);
  const node = button('', () => {
    if (state.favorites.has(song.id)) state.favorites.delete(song.id); else state.favorites.add(song.id);
    write('favorites', [...state.favorites]);
    const selected = state.favorites.has(song.id);
    node.classList.toggle('active', selected); node.setAttribute('aria-pressed', String(selected));
    node.setAttribute('aria-label', `${song.title} 즐겨찾기 ${selected ? '해제' : '추가'}`);
    toast(selected ? '즐겨찾기에 담았어요.' : '즐겨찾기에서 뺐어요.');
    if (state.route.tab === 'favorites' || state.filters.status === 'favorite') render();
  }, `favorite-button${active ? ' active' : ''}`, 'heart', {'aria-label': `${song.title} 즐겨찾기 ${active ? '해제' : '추가'}`, 'aria-pressed': String(active)});
  return node;
}

function clearPracticeSongs() {
  const overrides = read('statusOverrides', {});
  state.songs.forEach(song => {
    if (song.status === 'practice') {
      song.status = 'complete';
      overrides[song.id] = 'complete';
    }
  });
  write('statusOverrides', overrides);
  render();
  toast('현재 연습 중인 영상을 모두 비웠어요.');
}

function togglePracticeStatus(song) {
  const overrides = read('statusOverrides', {});
  if (song.status === 'practice') {
    song.status = 'complete';
    overrides[song.id] = 'complete';
    toast(`'${song.title}' 곡을 현재 연습에서 비웠어요.`);
  } else {
    song.status = 'practice';
    overrides[song.id] = 'practice';
    toast(`'${song.title}' 곡을 현재 연습에 추가했어요.`);
  }
  write('statusOverrides', overrides);
  render();
}

function resetPracticeSongs() {
  remove('statusOverrides');
  initialize();
  toast('기본 연습곡 목록으로 되돌렸어요.');
}

function confirmClearPractice() {
  const dialog = el('dialog', {class: 'share-dialog', 'aria-labelledby': 'clear-practice-title'});
  dialog.replaceChildren(
    el('h2', {id: 'clear-practice-title', text: '현재 연습 비우기'}),
    el('p', {text: '현재 연습 중인 영상 목록을 모두 비우시겠습니까?\n언제든지 곡 상세 화면이나 아카라카 연습실에서 다시 현재 연습으로 등록할 수 있습니다.'}),
    el('div', {class: 'dialog-actions', style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px;'},
      button('취소', () => dialog.close(), 'button secondary small'),
      button('모두 비우기', () => {
        dialog.close();
        clearPracticeSongs();
      }, 'button danger small')
    )
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function songCard(song, options = {}) {
  const parts = availableParts(song);
  const isPractice = song.status === 'practice';
  const showExclude = options.showExclude ?? isPractice;
  const prog = getSongProgress(song.id);
  const semi = getSongTranspose(song.id);

  const excludeBtn = showExclude ? button('', () => togglePracticeStatus(song), 'icon-button-tiny', 'close', {
    title: '현재 연습에서 비우기',
    'aria-label': `${song.title} 현재 연습에서 비우기`
  }) : null;

  return el('article', {class: 'song-card'},
    el('div', {class: 'cover-wrap'}, cover(song),
      el('span', {class: `status-badge ${song.status}`, text: statuses[song.status]}),
      button('', () => openSong(song), 'cover-play', 'play', {'aria-label': `${song.title} 곡과 파트 보기`})
    ),
    el('div', {class: 'card-body'},
      el('div', {class: 'card-title-row'},
        el('h3', {class: 'card-title'}, button(song.title, () => openSong(song), 'title-button', null, {title: song.title})),
        el('div', {style: 'display: flex; align-items: center; gap: 6px;'},
          excludeBtn,
          favoriteButton(song)
        )
      ),
      el('p', {class: 'card-artist', text: song.artist || '아티스트 미등록'}),
      el('div', {class: 'card-meta'},
        el('span', {class: 'badge', text: song.category || '기타'}),
        el('span', {text: levels[song.difficulty]}),
        song.duration && el('span', {text: `⏱ ${song.duration}`}),
        song.arrangement && el('span', {text: song.arrangement}),
        semi !== 0 && el('span', {class: 'song-transpose-badge', text: `🎹 ${formatTransposeBadgeText(semi)}`}),
        prog.level > 0 && el('span', {class: `song-mastery-badge level-${prog.level}`, text: `${MASTERY_META[prog.level].icon} ${MASTERY_META[prog.level].short}`})
      ),
      el('div', {class: 'card-footer'},
        el('div', {class: 'part-preview'}, parts.length ? parts.slice(0, 3).map(part => el('span', {class: `part-pill${part === songMyPart(song) ? ' mine' : ''}`, text: PARTS[part]})) : el('span', {class: 'part-empty', text: '영상 등록 예정'}), parts.length > 3 && el('span', {class: 'part-more', text: `+${parts.length - 3}`})),
        button('연습 시작', () => openSong(song), 'button primary small', 'play')
      )
    )
  );
}
function songGrid(songs, emptyTitle = '등록된 곡이 없어요', emptyDescription = '데이터 편집기에서 첫 연습곡을 추가해 주세요.', options = {}) {
  const cls = options.carousel ? 'song-grid song-grid-carousel' : 'song-grid';
  return songs.length ? el('div', {class: cls}, songs.map(s => songCard(s, options))) : emptyState(emptyTitle, emptyDescription);
}
function heading(title, note = '', action = null) {
  return el('div', {class: 'section-heading'}, el('div', {}, el('h2', {text: title}), note && el('p', {class: 'section-note', text: note})), action);
}
function section(title, note, content, action = null) {
  return el('section', {class: 'section'}, heading(title, note, action), content);
}
function searchBar(home = false, update = null) {
  const input = el('input', {id: 'song-search', type: 'search', value: state.filters.query, placeholder: '어떤 곡을 연습할까요?', autocomplete: 'off', 'aria-label': '곡명, 아티스트, 태그, 파트 검색'});
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.filters.query = input.value;
      if (home && input.value.trim()) { navigate({tab: 'songs'}, {focus: false}); const field = document.getElementById('song-search'); field?.focus(); field?.setSelectionRange(field.value.length, field.value.length); }
      else update?.();
    }, 120);
  });
  const form = el('form', {class: 'search-bar', role: 'search', onsubmit: event => { event.preventDefault(); clearTimeout(debounce); state.filters.query = input.value; if (home) navigate({tab: 'songs'}); else update?.(); }}, icon('search'), input,
    button('검색', () => { state.filters.query = input.value; if (home) navigate({tab: 'songs'}); else update?.(); }, 'search-submit'));
  return form;
}
function validRecent() {
  return state.recent.filter(record => state.songs.some(song => song.id === record.songId && availableParts(song).includes(record.part))).slice(0, 10);
}

function clearRecentPractice() {
  state.recent = [];
  remove('recent');
  render();
  toast('최근 연습 목록을 모두 비웠어요.');
}

function removeRecentItem(songId, part) {
  state.recent = state.recent.filter(record => !(record.songId === songId && record.part === part));
  write('recent', state.recent);
  render();
  toast('최근 연습 목록에서 제외했습니다.');
}

function confirmClearRecent() {
  const dialog = el('dialog', {class: 'share-dialog', 'aria-labelledby': 'clear-recent-title'});
  dialog.replaceChildren(
    el('h2', {id: 'clear-recent-title', text: '최근 연습 목록 비우기'}),
    el('p', {text: '최근 연습한 곡 목록을 모두 비우시겠습니까?\n파트 연습을 다시 시작하면 새로운 최근 연습 기록이 저장됩니다.'}),
    el('div', {class: 'dialog-actions', style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px;'},
      button('취소', () => dialog.close(), 'button secondary small'),
      button('모두 비우기', () => {
        dialog.close();
        clearRecentPractice();
      }, 'button danger small')
    )
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function recentList(limit) {
  const records = validRecent().slice(0, limit);
  if (!records.length) return emptyState('첫 연습을 시작해 볼까요?', '파트 연습을 시작하면 여기에서 바로 이어갈 수 있어요.', button('연습곡 찾기', () => navigate({tab: 'songs'}), 'button secondary', 'arrow'));
  return el('div', {class: 'recent-list'}, records.map(record => {
    const song = state.songs.find(song => song.id === record.songId);
    return el('article', {class: 'recent-row'}, cover(song, 'recent-art'),
      el('div', {class: 'recent-info'}, el('h3', {}, button(song.title, () => openSong(song), 'title-button')), el('p', {text: `${song.artist || '아티스트 미등록'} · ${new Date(record.timestamp).toLocaleDateString('ko-KR', {month: 'short', day: 'numeric'})}`})),
      el('span', {class: 'recent-part', text: PARTS[record.part]}),
      el('div', {class: 'recent-row-actions'},
        button('', () => startPractice(song, record.part), 'recent-play', 'play', {'aria-label': `${song.title} ${PARTS[record.part]} 연습 이어가기`}),
        button('', () => removeRecentItem(song.id, record.part), 'icon-button-tiny', 'close', {
          title: '최근 기록에서 삭제',
          'aria-label': `${song.title} ${PARTS[record.part]} 최근 기록 삭제`
        })
      )
    );
  }));
}


function upcomingStage() {
  const next = nextStage(getStageHistory());
  let activeSession = null;
  try {
    activeSession = getActiveStageSession(state.songs);
  } catch {}
  if (next) {
    if (
      activeSession &&
      Array.isArray(activeSession.songs) &&
      activeSession.songs.length &&
      (activeSession.id === next.stage.id || activeSession.eventTitle === next.stage.eventTitle)
    ) {
      return { stage: activeSession, date: next.date, isUpcoming: true };
    }
    return { stage: next.stage, date: next.date, isUpcoming: true };
  }
  if (activeSession && Array.isArray(activeSession.songs) && activeSession.songs.length) {
    return { stage: activeSession, date: parseStageDate(activeSession.date), isUpcoming: false };
  }
  return null;
}
function orderedPitchItems(song, transposeSemi = null) {
  const semi = Number.isFinite(transposeSemi) ? transposeSemi : getSongTranspose(song?.id);
  return orderedPitchItemsFor(song, PARTS, semi);
}
function upcomingPitchItems(meta, transposeSemi = 0) {
  const fromNumbered = orderedPitchItems(meta, transposeSemi);
  if (fromNumbered.length) return fromNumbered;
  const semi = Number.isFinite(transposeSemi) ? transposeSemi : 0;
  return getSongStartingPitchEntries(meta)
    .map(([k, v]) => {
      const shifted = semi ? transposeNoteString(v, semi) : v;
      const parsed = parseNoteString(shifted);
      if (!parsed) return null;
      return {
        partKey: k,
        noteStr: shifted,
        parsed,
        label: `${PARTS[k] || k}${meta?.partNames?.[k] ? ` ${meta.partNames[k]}` : ''}`
      };
    })
    .filter(Boolean);
}
function startSetlistPractice(stage, index) {
  const ids = stage.songs.map(item => item.songId || item.id);
  state.setlist = {title: stage.eventTitle, ids};
  const song = state.songs.find(s => s.id === ids[index]);
  if (song) {
    startPractice(song);
  } else {
    saveActiveStageSession({ ...stage, currentIndex: index });
    navigate({tab: 'stage', view: 'live'});
    toast('무대 전용 레퍼토리입니다. LIVE 무대 큐시트로 이동했습니다.');
  }
}
function renderUpcomingStageCard() {
  const next = upcomingStage();
  if (!next) return null;
  const {stage, date, isUpcoming} = next;
  const dday = (isUpcoming && date) ? daysUntil(date) : null;
  const est = estimateSetlistDurationSeconds(stage, state.songs);
  const estLabel = est && est.totalSeconds > 0 ? est.formatted : '';
  const items = stage.songs.map((item, i) => {
    const id = item.songId || item.id;
    const song = state.songs.find(s => s.id === id) || null;
    const meta = song || resolveSongData(state.songs, id, item.title);
    const displayTitle = song?.title || item.title || meta?.title || id;
    const part = song ? songMyPart(song) : '';
    const name = song?.partNames?.[part];
    const itemSemi = resolveStageItemTranspose(item, state.songTranspositions);
    const titleLabel = `${displayTitle}${itemSemi !== 0 ? ` (${formatTransposeBadgeText(itemSemi)})` : ''}`;
    const practiceBtn = button([
      el('span', {class: 'setlist-num', text: String(i + 1)}),
      el('span', {class: 'setlist-title', text: titleLabel}),
      el('span', {class: 'setlist-part', text: song ? (part ? `${PARTS[part] || part}${name ? ` · ${name}` : ''}` : '파트 선택') : '무대 전용'})
    ], () => startSetlistPractice(stage, i), 'setlist-item', null, {'aria-label': `${i + 1}번째 곡 ${displayTitle} 연습`});
    // 곡별 첫 음 전체 화음 (공연 직전 빠르게 음 잡기)
    // 첫 음 순서(악보 등장 순서 → 기본 2·4·1·3번)대로 아르페지오 후 마지막에 2초 화음
    const seqItems = upcomingPitchItems(meta, itemSemi);
    const chordBtn = seqItems.length ? button([icon('music'), el('span', {text: '화음'})], () => {
      const wasMine = chordBtn.classList.contains('playing');
      document.querySelectorAll('.setlist-chord-btn.playing').forEach(n => n.classList.remove('playing'));
      if (isPitchSequencePlaying() || getCurrentPlaying()) { stopPitchSequence(); stopPitch(true); }
      if (wasMine) return; // 재생 중 다시 누르면 정지
      chordBtn.classList.add('playing');
      playPitchSequence(seqItems, {
        keepOrder: true,
        noteDuration: 650,
        gapDuration: 120,
        chordDuration: 2000,
        onStep: (step) => {
          if (step.type === 'note') toast(`🎵 ${displayTitle} · ${step.index + 1}/${step.total} ${step.label} ${step.parsed.displayNote}`);
          else if (step.type === 'chord') toast(`✨ ${displayTitle} 화음 (${step.notes.map(n => parseNoteString(n)?.displayNote || n).join(' · ')})`);
          else if (step.type === 'finish') chordBtn.classList.remove('playing');
        }
      });
    }, 'setlist-chord-btn', null, {'aria-label': `${displayTitle} 첫 음 순서대로 듣고 화음`, title: '첫 음 순서대로 + 화음'}) : null;
    const rawPipe = meta?.pitchPipe ? transposeNoteString(meta.pitchPipe, itemSemi) : '';
    const pp = pitchPipeInfo(rawPipe);
    const ppBtn = pp ? button([el('span', {class: 'pp-label', text: '피치파이프'}), el('strong', {text: pp.display}), el('span', {class: 'pp-kor', text: pp.korean})], () => {
      if (playPitchPipe(pp.note)) toast(`🎵 ${displayTitle} 피치파이프 대표음 ${pp.display} (${pp.korean})`);
    }, 'pitchpipe-badge', null, {'aria-label': `${displayTitle} 피치파이프 대표음 ${pp.display} ${pp.korean} 듣기`, title: '무대에서 피치파이프로 불어 줄 대표음'}) : null;
    return el('div', {class: 'setlist-row'}, practiceBtn, ppBtn, chordBtn);
  });
  const metaText = [stage.date, stage.venue, `${stage.songs.length}곡`, estLabel].filter(Boolean).join(' · ');
  // 다가오는 공연이 없고 고른 공연 날짜가 이미 지났으면 '지난 공연'으로 표시하고 다음 공연 만들기를 안내
  const isPast = !isUpcoming && date instanceof Date && daysUntil(date) < 0;
  const badgeText = dday !== null ? (dday === 0 ? 'D-DAY' : `D-${dday}`) : (isPast ? '지난 공연' : 'LIVE 큐시트');
  // 첫 화면을 다 가리지 않도록 3곡까지만 보이고 나머지는 펼치기
  const HOME_SETLIST_PREVIEW = 3;
  const grid = el('div', {class: 'setlist-grid'}, items);
  let expandBtn = null;
  if (items.length > HOME_SETLIST_PREVIEW + 1) {
    const hiddenRows = items.slice(HOME_SETLIST_PREVIEW);
    hiddenRows.forEach(row => { row.hidden = true; });
    expandBtn = button(`▾ 나머지 ${hiddenRows.length}곡 펼치기`, () => {
      const willShow = hiddenRows[0].hidden;
      hiddenRows.forEach(row => { row.hidden = !willShow; });
      expandBtn.textContent = willShow ? '▴ 3곡만 보기' : `▾ 나머지 ${hiddenRows.length}곡 펼치기`;
      expandBtn.setAttribute('aria-expanded', String(willShow));
    }, 'text-button setlist-expand-btn', null, {'aria-expanded': 'false'});
  }
  const actionButtons = [
    button('셋리스트 순서대로 연습 시작', () => startSetlistPractice(stage, 0), 'button primary small', 'play'),
    button('무대 큐시트 보기', () => {
      saveActiveStageSession(stage);
      navigate({tab: 'stage', view: 'live'});
    }, 'button secondary small', 'stage')
  ];
  if (isPast) {
    actionButtons.push(button('+ 다음 공연 만들기', () => {
      state.stageView = 'history';
      write('stageView', 'history');
      navigate({tab: 'stage', view: 'history'});
      toast('공연 히스토리에서 "+ 새 공연 만들기" 또는 지난 공연 "📋 복제"로 다음 공연을 준비하세요.');
    }, 'button secondary small', null, {'aria-label': '다음 공연 셋리스트 만들기'}));
  }
  return el('section', {class: `upcoming-stage${isPast ? ' is-past' : ''}`, 'aria-label': isUpcoming ? '다가오는 공연 연습' : (isPast ? '지난 공연 큐시트' : '현재 활성 무대 큐시트')},
    el('div', {class: 'upcoming-stage-head'},
      el('div', {},
        el('p', {class: 'eyebrow', text: isUpcoming ? 'NEXT STAGE' : (isPast ? 'LAST STAGE · 지난 공연' : 'ACTIVE CUE SHEET')}),
        el('h2', {text: stage.eventTitle}),
        el('p', {class: 'upcoming-stage-meta', text: metaText})
      ),
      el('span', {class: 'dday-badge', text: badgeText})
    ),
    grid,
    expandBtn,
    el('div', {class: 'upcoming-stage-actions'}, ...actionButtons)
  );
}
function renderHomeMasterySummary() {
  if (!state.songs.length) return null;
  let readyCount = 0;
  let learningCount = 0;
  let totalPracticeSec = 0;
  state.songs.forEach((s) => {
    const p = getSongProgress(s.id);
    if (p.level === 3) readyCount++;
    else if (p.level === 1 || p.level === 2) learningCount++;
    totalPracticeSec += p.practiceSec;
  });
  return el('section', {class: 'home-mastery-summary', 'aria-label': '나의 연습 숙련도 요약'},
    el('div', {class: 'home-mastery-copy'},
      el('strong', {text: '🎯 나의 레퍼토리 숙련도 현황'}),
      el('span', {text: `전체 ${state.songs.length}곡 중 무대 준비 ${readyCount}곡 · 연습 진행 ${learningCount}곡`})
    ),
    el('div', {class: 'home-mastery-stats'},
      button(`✨ 무대 준비 ${readyCount}곡`, () => {
        state.filters = {query: '', status: '', category: '', difficulty: '', part: '', mastery: 'ready'};
        navigate({tab: 'songs'});
      }, 'chip mastery-stat-chip ready'),
      button(`🎵 연습 중 ${learningCount}곡`, () => {
        state.filters = {query: '', status: '', category: '', difficulty: '', part: '', mastery: 'learning'};
        navigate({tab: 'songs'});
      }, 'chip mastery-stat-chip learning'),
      el('span', {class: 'mastery-time-badge', text: `⏱️ 누적 ${formatPracticeTotalTime(totalPracticeSec)}`})
    )
  );
}
function renderHome() {
  const practicing = state.songs.filter(song => song.status === 'practice');
  const hasMyIdentity = Boolean(state.myName || state.myPart);
  const intro = el('div', {class: 'home-intro'}, el('div', {}, el('p', {class: 'eyebrow', text: 'WELCOME TO YOUR PRACTICE ROOM'}), el('h1', {}, '오늘도, 우리의 ', el('span', {text: '하모니를.'})), el('p', {text: '한 곡씩, 한 파트씩. 함께 만드는 더 좋은 소리.'})), el('span', {class: 'intro-date', text: new Date().toLocaleDateString('ko-KR', {month: 'long', day: 'numeric', weekday: 'long'})}));
  app.append(intro);

  if (!hasMyIdentity) {
    const memberNames = allMemberNames();
    if (memberNames.length) {
      const onboardingCard = el('section', {class: 'home-onboarding-card', 'aria-label': '단원 이름 빠른 선택'},
        el('div', {class: 'home-onboarding-head'},
          el('div', {},
            el('p', {class: 'eyebrow', text: 'QUICK PROFILE SETUP'}),
            el('h2', {text: '👋 반가워요! 누구신가요?'}),
            el('p', {class: 'home-onboarding-desc', text: '이름을 한 번만 누르면 곡마다 내 파트와 첫 음이 자동으로 맞춰져요.'})
          ),
          button('기본 파트로 고르기 →', () => navigate({tab: 'settings'}), 'text-button')
        ),
        el('div', {class: 'home-onboarding-chips'},
          memberNames.map(name => button(name, () => {
            state.myName = name;
            write('myName', name);
            refreshChrome();
            render();
            toast(`🎤 ${name}님으로 설정했어요! 곡마다 ${name}님의 파트가 먼저 보여요.`);
          }, 'chip home-onboarding-chip'))
        )
      );
      app.append(onboardingCard);
    }
  }

  const recentItems = validRecent();
  const latestRecent = recentItems[0];
  const latestSong = latestRecent ? state.songs.find(s => s.id === latestRecent.songId) : null;
  if (latestRecent && latestSong) {
    const singer = latestSong.partNames?.[latestRecent.part];
    const resumeBanner = el('button', {
      type: 'button',
      class: 'home-resume-banner',
      'aria-label': `방금 연습하던 ${latestSong.title} ${PARTS[latestRecent.part] || latestRecent.part} 바로 이어하기`,
      onclick: () => startPractice(latestSong, latestRecent.part)
    },
      el('div', {class: 'home-resume-copy'},
        el('span', {class: 'home-resume-kicker', text: '▶ 방금 연습하던 곡 바로 이어하기'}),
        el('strong', {class: 'home-resume-title', text: `${latestSong.title} · ${PARTS[latestRecent.part] || latestRecent.part}${singer ? ` (${singer})` : ''}`})
      ),
      el('span', {class: 'home-resume-play', 'aria-hidden': 'true'}, icon('play'))
    );
    app.append(resumeBanner);
  }

  const upcoming = renderUpcomingStageCard();
  if (upcoming) app.append(upcoming);
  app.append(searchBar(true));
  const masterySummary = renderHomeMasterySummary();
  if (masterySummary) app.append(masterySummary);
  if (state.songs.length && state.songs.every(song => (song.tags || []).includes('demo'))) app.append(el('p', {class: 'demo-banner', text: '데모 라이브러리입니다. 실제 팀 연습 자료는 데이터 편집기에서 등록해 주세요.'}));
  const pendingMedia = state.songs.filter(song => !availableParts(song).length).length;
  if (pendingMedia) app.append(el('p', {class: 'notice', text: `${pendingMedia}곡의 연습 영상이 아직 등록되지 않았어요. 영상이 등록된 파트부터 연습을 시작해 보세요.`}));
  if (!state.songs.length) { app.append(section('연습 라이브러리', '', songGrid([])), button('데이터 편집기 열기', () => openAdmin('./admin.html'), 'button primary')); return; }
  if (!practicing.length) {
    const emptyPractice = emptyState(
      '현재 연습 중인 곡이 없어요',
      '아카라카 연습실에서 원하는 곡을 찾아 ‘현재 연습에 추가’해 보세요.',
      el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;'},
        button('연습곡 둘러보기', () => navigate({tab: 'songs'}), 'button primary small', 'arrow'),
        button('기본 연습곡 불러오기', resetPracticeSongs, 'button secondary small', 'refresh')
      )
    );
    app.append(section('지금 연습 중', '0곡 등록됨', emptyPractice));
  } else {
    const featured = practicing[0];
    const hero = el('div', {class: 'hero-panel'},
      el('div', {class: 'hero-copy'}, el('span', {class: 'hero-tag', text: 'TODAY’S SPOTLIGHT'}), el('h3', {class: 'hero-title', text: featured.title}), el('p', {class: 'hero-text', text: `${featured.artist || '아티스트 미등록'} · ${featured.arrangement || '함께 부르는 즐거움'}`}),
        el('div', {class: 'hero-actions'},
          button('연습 시작 (파트 선택)', () => openSong(featured), 'button primary', 'play'),
          button('곡과 파트 보기', () => openSong(featured), 'button ghost', 'arrow'),
          button('현재 연습에서 비우기', () => togglePracticeStatus(featured), 'button ghost danger-text', 'close', {title: '이 곡을 현재 연습에서 제외'})
        ),
        el('div', {class: 'hero-bottom'}, icon('mic'), el('span', {text: availableParts(featured).length ? `${availableParts(featured).length}개 파트 · ${levels[featured.difficulty]}` : '팀의 연습 영상을 기다리고 있어요'}))
      ), el('div', {class: 'hero-art'}, cover(featured, 'hero-cover'), el('span', {class: 'hero-art-label', text: 'MAKE ROOM FOR HARMONY'}))
    );
    const practiceHeaderActions = el('div', {style: 'display: flex; gap: 8px; align-items: center;'},
      button('연습 비우기', confirmClearPractice, 'text-button danger-text', 'close', {title: '현재 연습 중인 영상을 모두 비웁니다'}),
      button('모두 보기', () => { state.filters = {query: '', status: 'practice', category: '', difficulty: '', part: '', mastery: ''}; navigate({tab: 'songs'}); }, 'text-button', 'arrow')
    );
    app.append(section('지금 연습 중', `${practicing.length}곡의 하모니를 완성해 가고 있어요`, hero, practiceHeaderActions));
    if (practicing.length > 1) app.append(songGrid(practicing.slice(1, 5), undefined, undefined, {carousel: true}));
  }
  const mine = hasMyIdentity ? state.songs.filter(song => availableParts(song).includes(songMyPart(song))) : [];
  const myTitleText = state.myName
    ? `${state.myName}님의 맞춤 파트${state.myPart ? ` · 기본 ${PARTS[state.myPart]}` : ''}`
    : state.myPart
      ? `내 파트 · ${PARTS[state.myPart]}`
      : '내 목소리를 찾아보세요';
  const myDescText = state.myName
    ? `${state.myName}님 담당 파트 영상이 등록된 ${mine.length}곡을 바로 연습할 수 있어요.`
    : state.myPart
      ? `${PARTS[state.myPart]} 영상이 등록된 ${mine.length}곡을 바로 연습할 수 있어요.`
      : '단원 이름(나는 누구?)이나 기본 파트를 설정하면 내 연습 영상이 먼저 보여요.';
  const myPanel = el('div', {class: 'quick-panel sage'},
    el('div', {class: 'quick-panel-title'}, icon('mic'), el('h3', {text: myTitleText})),
    el('p', {text: myDescText}),
    button(hasMyIdentity ? '내 파트 곡 보기' : '내 파트 설정하기', () => {
      if (!hasMyIdentity) {
        navigate({tab: 'settings'});
      } else if (state.myName) {
        state.filters = {query: state.myName, status: '', category: '', difficulty: '', part: '', mastery: ''};
        navigate({tab: 'songs'});
      } else {
        state.filters = {query: '', status: '', category: '', difficulty: '', part: state.myPart, mastery: ''};
        navigate({tab: 'songs'});
      }
    }, 'button secondary', 'arrow')
  );

  const randomPanel = el('div', {class: 'quick-panel sand'});
  function updateRandom() {
    randomPanel.replaceChildren(el('div', {class: 'quick-panel-title'}, icon('shuffle'), el('h3', {text: '오늘은 어떤 곡을 불러볼까요?'})));
    if (state.random) {
      randomPanel.append(el('div', {class: 'random-result'}, cover(state.random, 'recent-art'), el('div', {}, el('strong', {text: state.random.title}), el('p', {text: state.random.artist}))), button('파트 선택 및 연습', () => openSong(state.random), 'button primary', 'play'));
    } else randomPanel.append(el('p', {text: '익숙한 곡도, 새로운 곡도. 가볍게 한 곡 골라보세요.'}));
    randomPanel.append(button(state.random ? '다른 곡 뽑기' : '랜덤 곡 선택', () => {
      const candidates = state.songs.filter(song => songMyPart(song) ? availableParts(song).includes(songMyPart(song)) : availableParts(song).length);
      if (!candidates.length) { toast(hasMyIdentity ? '내 파트 영상이 등록된 곡이 없습니다.' : '아직 등록된 연습 영상이 없습니다.'); return; }
      state.random = candidates[Math.floor(Math.random() * candidates.length)]; updateRandom();
    }, 'button secondary', 'shuffle'));
  }
  updateRandom();
  app.append(section('내 파트 맞춤 연습', hasMyIdentity ? '내 파트 곡과 오늘의 랜덤 추천을 한눈에' : '이름이나 기본 파트를 설정하고 가볍게 시작해 보세요', el('div', {class: 'quick-grid'}, myPanel, randomPanel)));

  const recentHeaderActions = el('div', {style: 'display: flex; gap: 8px; align-items: center;'},
    recentItems.length ? button('최근 연습 비우기', confirmClearRecent, 'text-button danger-text', 'close', {title: '최근 연습한 곡 목록을 모두 비웁니다'}) : null,
    button('모두 보기', () => navigate({tab: 'recent'}), 'text-button', 'arrow')
  );
  app.append(section('최근 연습', '마지막으로 부르던 파트부터 이어서', recentList(3), recentHeaderActions));

  app.append(section('연습 라이브러리', `${state.songs.length}곡, 하나의 연습실`, songGrid(state.songs.slice(0, 4), undefined, undefined, {carousel: true}), button('아카라카 연습실 바로가기', () => navigate({tab: 'songs'}), 'text-button', 'arrow')));

  const archivePanel = el('div', {class: 'quick-panel sage', style: 'margin-top: 16px;'},
    el('div', {class: 'quick-panel-title'}, icon('academic'), el('h3', {text: '아카라카 라운지 & 아카이브'})),
    el('p', {class: 'home-archive-summary', text: homeArchiveSummaryText()}),
    el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;'},
      button('✨ 아카펠라 감상', () => navigate({tab: 'appreciation'}), 'button secondary small', 'sparkles'),
      button('🎬 공연 아카이브', () => navigate({tab: 'stage', view: 'live'}), 'button secondary small', 'stage'),
      button('🎼 악보 창고', () => navigate({tab: 'scores'}), 'button secondary small', 'document'),
      button('📷 우리들의 기록', () => navigate({tab: 'memories'}), 'button secondary small', 'camera'),
      button('🎙️ 연습 일지 & 피드백', () => navigate({tab: 'rehearsal'}), 'button secondary small', 'notes'),
      button('🎥 연습 영상', () => navigate({tab: 'practiceVideos'}), 'button secondary small', 'video'),
      button('🎓 교육 자료', () => navigate({tab: 'education'}), 'button secondary small', 'academic')
    )
  );
  app.append(section('아카라카 아카이브', '함께 부르고 함께 나눈 모든 기록과 배움', archivePanel));
}

function renderBrowse(favoritesOnly = false) {
  const pageHeading = el('div', {class: 'page-heading'},
    el('div', {class: 'section-heading'},
      el('div', {},
        el('p', {class: 'eyebrow', text: favoritesOnly ? 'YOUR FAVORITES' : 'ACARACA PRACTICE ROOM'}),
        el('h1', {text: favoritesOnly ? '자꾸 부르고 싶은 곡' : '아카라카 연습실'}),
        el('p', {text: favoritesOnly ? '마음에 담아둔 곡을 한곳에서 만나보세요.' : '곡, 아티스트, 파트를 검색하고 나에게 맞는 연습을 찾아보세요.'})
      ),
      !favoritesOnly && button('+ 새 곡 / 영상 추가', () => openAdmin('./admin.html?action=new'), 'button primary small')
    )
  );
  app.append(pageHeading);
  const filterContainer = el('div', {class: 'filter-panel'});
  const results = el('div', {id: 'song-results', 'aria-live': 'polite'});
  const base = () => favoritesOnly ? state.songs.filter(song => state.favorites.has(song.id)) : state.songs;
  const hasDetailFilter = () => Boolean(state.filters.part || state.filters.category || state.filters.mastery);
  if (hasDetailFilter()) state.browseFilterOpen = true;

  function updateResults() {
    const filtered = filterSongs(base(), {...state.filters, favorites: [...state.favorites], progress: state.progress});
    const matches = sortSongs(filtered, state.browseSort, {progress: state.progress, recent: state.recent});
    const active = Object.values(state.filters).filter(value => String(value).trim()).length;
    const summary = el('div', {class: 'filter-summary'}, el('span', {}, el('strong', {text: String(matches.length)}), '곡', active ? ` · 필터 ${active}개 적용` : ''), active && button('필터 초기화', () => {
      state.filters = {query: '', status: '', category: '', difficulty: '', part: '', mastery: ''};
      const sf = document.getElementById('song-search');
      if (sf) sf.value = '';
      updateFilters();
      updateResults();
    }, 'text-button', 'close'));
    results.replaceChildren(el('h2', {class: 'sr-only', text: favoritesOnly ? '즐겨찾기 곡 목록' : '곡 검색 결과'}), summary, songGrid(matches,
      favoritesOnly && !state.favorites.size ? '즐겨찾기가 아직 없어요' : '찾는 곡이 없어요', favoritesOnly && !state.favorites.size ? '곡의 하트 버튼을 눌러 즐겨찾기에 담아보세요.' : '다른 검색어를 입력하거나 필터를 초기화해 보세요.'));
  }

  function updateFilters() {
    const statusOptions = [['', '전체'], ['practice', '현재 연습'], ['complete', '완료'], ['favorite', '즐겨찾기']];
    const sortOptions = [
      ['', '기본 순서'],
      ['mastery-asc', '덜 익힌 순'],
      ['recent', '최근 연습순'],
      ['title', '가나다순'],
      ['difficulty-desc', '난이도 높은 순'],
      ['difficulty-asc', '난이도 낮은 순']
    ];
    const detailCount = [state.filters.part, state.filters.category, state.filters.mastery].filter(Boolean).length;

    const statusChips = el('div', {class: 'chip-group browse-status-chips'},
      statusOptions.map(([value, label]) => button(label, () => {
        state.filters.status = value;
        updateFilters();
        updateResults();
      }, `chip${state.filters.status === value ? ' active' : ''}`, null, {'aria-pressed': String(state.filters.status === value)}))
    );

    const sortSelect = el('select', {
      id: 'browse-sort-select',
      class: `browse-sort-select${state.browseSort ? ' active' : ''}`,
      'aria-label': '곡 정렬 순서',
      onchange: (event) => {
        state.browseSort = event.target.value;
        write('browseSort', state.browseSort);
        event.target.classList.toggle('active', Boolean(state.browseSort));
        updateResults();
      }
    }, sortOptions.map(([value, text]) => el('option', {value, text})));
    sortSelect.value = state.browseSort || '';

    const detailToggleBtn = button(
      `상세 필터${detailCount ? ` (${detailCount})` : ''}`,
      () => {
        state.browseFilterOpen = !state.browseFilterOpen;
        updateFilters();
      },
      `chip browse-detail-toggle${(state.browseFilterOpen || detailCount) ? ' active' : ''}`,
      state.browseFilterOpen ? 'chevron-up' : 'chevron-down',
      {'aria-expanded': String(Boolean(state.browseFilterOpen))}
    );

    const toolbarRow = el('div', {class: 'browse-toolbar-row'},
      statusChips,
      el('div', {class: 'browse-toolbar-controls'}, sortSelect, detailToggleBtn)
    );

    const fields = [
      ['part', '파트', Object.entries(PARTS)],
      ['category', '장르', [...new Set(state.songs.map(song => song.category).filter(Boolean))].sort().map(value => [value, value])],
      ['mastery', '숙련도', [
        ['ready', '✨ 무대 준비 완료'],
        ['learning', '🌱/🎵 연습 진행 중'],
        ['2', '🎵 암보 연습 중'],
        ['1', '🌱 음정 익히는 중'],
        ['unstarted', '○ 아직 미시작']
      ]]
    ];
    const selectsRow = el('div', {class: 'filter-selects', hidden: !state.browseFilterOpen}, fields.map(([key, label, options]) => {
      const select = el('select', {
        id: `filter-${key}`,
        class: state.filters[key] ? 'active' : '',
        onchange: event => {
          state.filters[key] = event.target.value;
          event.target.classList.toggle('active', Boolean(event.target.value));
          updateFilters();
          updateResults();
        }
      }, el('option', {value: '', text: `모든 ${label}`}), options.map(([value, text]) => el('option', {value, text})));
      select.value = state.filters[key] || '';
      return el('label', {for: `filter-${key}`}, el('span', {text: label}), select);
    }));

    filterContainer.replaceChildren(toolbarRow, selectsRow);
  }
  app.append(searchBar(false, updateResults), filterContainer, results); updateFilters(); updateResults();
}

function normalizePerfSetlistItem(rawItem) {
  if (typeof rawItem === 'string') {
    const clean = rawItem.trim();
    const song = state.songs.find(s => s.id === clean || s.title === clean || clean.includes(s.title));
    return {
      songId: song?.id || null,
      title: clean,
      artist: song?.artist || '',
      time: '',
      song: song || null
    };
  }
  const obj = rawItem && typeof rawItem === 'object' ? rawItem : {};
  const baseId = obj.songId ? String(obj.songId).replace(/-[0-9]+$/, '') : '';
  const song = state.songs.find(s => s.id === obj.songId || (baseId && s.id === baseId));
  return {
    songId: obj.songId || song?.id || null,
    title: obj.title || song?.title || '',
    artist: obj.artist || song?.artist || '',
    time: obj.time || '',
    song: song || null
  };
}

function openStageModal(perf) {
  const existing = document.getElementById('stage-video-dialog');
  if (existing) {
    existing.close();
    existing.remove();
  }

  const dialog = el('dialog', {id: 'stage-video-dialog', class: 'stage-modal-dialog', 'aria-labelledby': 'stage-modal-title'});

  const closeBtn = el('button', {
    type: 'button',
    class: 'dialog-close-x',
    'aria-label': '닫기',
    onclick: () => dialog.close()
  }, '✕');

  const header = el('div', {class: 'stage-modal-header'},
    el('div', {style: 'flex: 1; min-width: 0;'},
      el('span', {class: 'badge', text: perf.category || '공연', style: 'margin-bottom: 4px;'}),
      el('h3', {id: 'stage-modal-title', text: perf.title})
    ),
    closeBtn
  );

  const playerHost = el('div', {class: 'stage-modal-player'});
  const p = createPlayer(playerHost, perf.video, perf.title);
  activePlayers.push(p);

  const metaBox = el('div', {style: 'display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12.5px; color: var(--muted);'},
    el('span', {text: `📅 ${perf.date}`}),
    perf.venue ? el('span', {text: `📍 ${perf.venue}`}) : null
  );

  const setlistBlock = perf.setlist?.length ? el('div', {class: 'stage-setlist-box', style: 'margin-top: 14px;'},
    el('div', {class: 'stage-setlist-title', text: '무대 셋리스트 (파트 연습 바로가기)'}),
    el('div', {class: 'stage-setlist-items'}, perf.setlist.map(rawItem => {
      const item = normalizePerfSetlistItem(rawItem);
      const song = item.song;
      return el('div', {class: 'setlist-item'},
        el('div', {},
          el('span', {class: 'setlist-song-name', text: item.title}),
          item.artist && el('span', {class: 'setlist-time', text: `· ${item.artist}`})
        ),
        song ? button('파트 연습실 이동', () => {
          dialog.close();
          openSong(song);
        }, 'button primary small', 'play') : null
      );
    }))
  ) : null;

  const body = el('div', {class: 'stage-modal-body'},
    playerHost,
    metaBox,
    perf.description ? el('p', {class: 'stage-desc', text: perf.description}) : null,
    setlistBlock
  );

  dialog.append(header, body);
  document.body.append(dialog);

  dialog.addEventListener('close', () => {
    p.destroy?.();
    const idx = activePlayers.indexOf(p);
    if (idx !== -1) activePlayers.splice(idx, 1);
    dialog.remove();
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.showModal();
}

function renderStageList(performances, container) {
  const list = el('div', {class: 'stage-list'}, performances.map(perf => {
    const thumb = el('div', {
      class: 'stage-list-thumb',
      role: 'button',
      tabindex: '0',
      'aria-label': `${perf.title} 영상 보기`,
      onclick: () => openStageModal(perf)
    },
      el('img', {src: perf.thumbnail, alt: '', loading: 'lazy'}),
      el('div', {class: 'stage-thumb-play', 'aria-hidden': 'true'}, '▶'),
      el('span', {class: 'stage-thumb-badge', text: perf.category || '공연'})
    );
    thumb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openStageModal(perf);
      }
    });

    const metaRow = el('div', {class: 'stage-list-meta'},
      el('span', {class: 'badge', text: perf.category || '공연'}),
      el('span', {class: 'stage-date', text: `📅 ${perf.date}`}),
      perf.venue ? el('span', {class: 'stage-venue', text: `📍 ${perf.venue}`}) : null
    );

    const titleBtn = el('h3', {
      class: 'stage-list-title',
      role: 'button',
      tabindex: '0',
      onclick: () => openStageModal(perf)
    }, perf.title);
    titleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openStageModal(perf);
      }
    });

    let setlistRow = null;
    if (perf.setlist && perf.setlist.length) {
      setlistRow = el('div', {class: 'stage-list-setlist'},
        el('span', {style: 'font-weight: 600; color: var(--muted); font-size: 11.5px;'}, '🎵 연주곡:'),
        ...perf.setlist.map(rawItem => {
          const item = normalizePerfSetlistItem(rawItem);
          const song = item.song;
          return el('span', {class: 'stage-setlist-chip'},
            el('strong', {text: item.title}),
            item.artist ? el('span', {style: 'color: var(--muted); font-size: 11px;'}, ` (${item.artist})`) : null,
            song ? button('연습실 이동 ↗', (e) => {
              e.stopPropagation();
              openSong(song);
            }, 'text-button', null, {style: 'font-size: 11px; padding: 0 4px;'}) : null
          );
        })
      );
    }

    const actions = el('div', {class: 'stage-list-actions'},
      button('▶ 영상 보기', () => openStageModal(perf), 'button primary small'),
      el('a', {
        href: perf.video.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'button secondary small',
        text: 'YouTube ↗',
        title: '새 창에서 원본 YouTube 영상 보기'
      })
    );

    const content = el('div', {class: 'stage-list-content'},
      metaRow,
      titleBtn,
      perf.description ? el('p', {
        class: 'stage-list-desc',
        text: perf.description,
        style: 'font-size: 12.5px; color: var(--muted); margin: 4px 0 6px; line-height: 1.5;'
      }) : null,
      setlistRow
    );

    return el('article', {class: 'stage-list-item'},
      thumb,
      content,
      actions
    );
  }));

  container.append(list);
}

function renderStageCards(performances, container) {
  const grid = el('div', {class: 'stage-grid'}, performances.map(perf => {
    const playerHost = el('div', {class: 'stage-player-host'});
    const p = createPlayer(playerHost, perf.video, perf.title);
    activePlayers.push(p);

    const setlistNode = perf.setlist?.length ? el('div', {class: 'stage-setlist-box'},
      el('div', {class: 'stage-setlist-title', text: '무대 셋리스트 (파트 연습 바로가기)'}),
      el('div', {class: 'stage-setlist-items'}, perf.setlist.map(rawItem => {
        const item = normalizePerfSetlistItem(rawItem);
        const song = item.song;
        return el('div', {class: 'setlist-item'},
          el('div', {},
            el('span', {class: 'setlist-song-name', text: item.title}),
            item.artist && el('span', {class: 'setlist-time', text: `· ${item.artist}`})
          ),
          song ? button('파트 연습실 이동', () => openSong(song), 'button primary small', 'play') : null
        );
      }))
    ) : null;

    return el('article', {class: 'stage-card'},
      el('div', {class: 'stage-header'},
        el('div', {},
          el('span', {class: 'badge', text: perf.category || '공연'}),
          el('h2', {style: 'margin-top: 6px; font-size: 20px;', text: perf.title}),
          el('div', {class: 'stage-meta'},
            el('span', {text: `📅 ${perf.date}`}),
            perf.venue && el('span', {text: `📍 ${perf.venue}`})
          )
        )
      ),
      playerHost,
      perf.description && el('p', {class: 'stage-desc', text: perf.description}),
      setlistNode
    );
  }));

  container.append(grid);
}

function renderStageHistoryPage(container) {
  const topBar = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;' },
    el('div', {},
      el('h2', { style: 'font-size: 18px; font-weight: 800; margin: 0;', text: '📜 공연 히스토리 & 셋리스트 보관함' }),
      el('p', { style: 'font-size: 13px; color: var(--muted); margin: 2px 0 0;', text: '최신 공연이 항상 상단에 표시됩니다. 과거 공연 셋리스트를 불러와 무대를 바로 시작할 수 있습니다.' })
    ),
    button('+ 새 공연 만들기', () => {
      promptStagePassword({
        actionName: '새 공연 셋리스트 생성',
        onSuccess: () => {
          const newSession = createNewStageSession('새 아카라카 공연');
          switchStageSubView('live');
        }
      });
    }, 'button primary small')
  );

  const listArea = el('div', { class: 'stage-history-list' });

  function renderCards() {
    listArea.replaceChildren();
    const history = getStageHistory();

    if (!history.length) {
      listArea.append(el('p', { style: 'text-align: center; color: var(--muted); padding: 40px;', text: '저장된 공연 히스토리가 없습니다.' }));
      return;
    }

    history.forEach((item) => {
      const card = el('article', { class: 'stage-history-card' });

      const top = el('div', { class: 'stage-history-top' },
        el('div', {},
          el('h4', { class: 'stage-history-title', text: item.eventTitle || '아카라카 공연' }),
          el('div', { class: 'stage-history-date', text: `📅 ${item.date || ''} · 📍 ${item.venue || '공연장'}` })
        ),
        el('span', { class: 'stage-hero-badge', text: `${item.songs?.length || 0}곡` })
      );

      const songsRow = el('div', { class: 'stage-history-songs-row' },
        (item.songs || []).map((s, i) => el('span', { class: 'stage-history-song-tag', text: `${i + 1}. ${s.title}` }))
      );

      const loadBtn = button('무대 큐시트 시작', () => {
        saveActiveStageSession(item);
        switchStageSubView('live');
      }, 'button primary small', 'play');

      const cloneBtn = button('📋 복제', () => {
        promptStagePassword({
          actionName: `'${item.eventTitle}' 셋리스트 복제`,
          onSuccess: () => {
            const cloned = JSON.parse(JSON.stringify(item));
            cloned.id = `stage-${Date.now()}`;
            cloned.eventTitle = `${item.eventTitle} (복사본)`;
            cloned.date = localDateString(new Date(), '.');
            cloned.updatedAt = Date.now();
            saveStageHistory([cloned, ...getStageHistory()]);
            toast('셋리스트가 복제되었습니다.');
            renderCards();
          }
        });
      }, 'button secondary small');

      const deleteBtn = button('🗑️', () => {
        promptStagePassword({
          actionName: `'${item.eventTitle}' 공연 기록 삭제`,
          onSuccess: () => {
            if (confirm(`'${item.eventTitle}' 공연 기록을 완전히 삭제하시겠습니까?`)) {
              deleteStageHistoryItem(item.id);
              toast('공연 기록이 삭제되었습니다.');
              renderCards();
            }
          }
        });
      }, 'button secondary small icon-only', null, { title: '공연 기록 삭제' });

      const actions = el('div', { class: 'stage-history-actions' }, loadBtn, cloneBtn, deleteBtn);

      card.append(top, songsRow, actions);
      listArea.append(card);
    });
  }

  renderCards();
  container.append(topBar, listArea);
}

function renderStage() {
  if (state.route.view && ['live', 'history', 'list', 'cards', 'archive'].includes(state.route.view)) {
    if (state.route.view === 'archive') state.stageView = 'list';
    else state.stageView = state.route.view;
  } else {
    state.route.view = state.stageView || 'live';
  }

  const currentView = state.stageView || 'live';
  const isVideoView = currentView === 'list' || currentView === 'cards';

  app.append(
    el('div', {class: 'page-heading stage-page-heading'},
      el('p', {class: 'eyebrow', text: 'ACARACA STAGE & ARCHIVE'}),
      el('h1', {text: '공연 아카이브'}),
      el('p', {text: '실시간 무대 큐시트, 역대 공연 셋리스트 보관함, 감동의 실황 무대 영상을 한곳에서 모아봅니다.'})
    )
  );

  // 1. View Mode Switcher Tabs (3대 핵심 서브뷰)
  const viewTabs = el('div', {class: 'stage-view-tabs', role: 'tablist', 'aria-label': '공연 아카이브 서브 메뉴'},
    button('🎤 무대 큐시트', () => {
      switchStageSubView('live');
    }, `stage-tab-btn${currentView === 'live' ? ' active' : ''}`, null, {role: 'tab', 'aria-selected': String(currentView === 'live')}),
    button('📜 공연 히스토리', () => {
      switchStageSubView('history');
    }, `stage-tab-btn${currentView === 'history' ? ' active' : ''}`, null, {role: 'tab', 'aria-selected': String(currentView === 'history')}),
    button('🎬 실황 무대 영상', () => {
      switchStageSubView('list');
    }, `stage-tab-btn${isVideoView ? ' active' : ''}`, null, {role: 'tab', 'aria-selected': String(isVideoView)})
  );

  if (currentView === 'live') {
    app.classList.add('stage-live-page');
    app.append(el('div', {class: 'stage-controls-panel', style: 'margin-bottom: 16px;'}, viewTabs));
    const liveContainer = el('div', {id: 'stage-live-area'});
    app.append(liveContainer);
    stageViewModule.renderStageLiveView({
      container: liveContainer,
      songs: state.songs,
      scores: state.scores,
      navigate,
      onOpenScore: (sc, opts) => openOrDownloadScore(sc, false, opts),
      onSwitchView: (v) => {
        switchStageSubView(v);
      }
    });
    return;
  }

  app.classList.remove('stage-live-page');

  if (currentView === 'history') {
    app.append(el('div', {class: 'stage-controls-panel', style: 'margin-bottom: 16px;'}, viewTabs));
    const historyPageArea = el('div', {id: 'stage-history-area'});
    app.append(historyPageArea);
    renderStageHistoryPage(historyPageArea);
    return;
  }

  if (!state.performances.length) {
    app.append(emptyState('등록된 아카라카 영상이 아직 없어요', '새로운 무대 실황 영상이 곧 등록됩니다.'));
    return;
  }

  // 2. Category options
  const allCategories = ['전체', ...new Set(state.performances.map(p => p.category).filter(Boolean))];
  const selectedCategory = state.stageFilters.category || '전체';

  const categoryChips = el('div', {class: 'chip-group'},
    allCategories.map(cat => button(
      cat === '전체' ? `전체 (${state.performances.length})` : cat,
      () => {
        state.stageFilters.category = cat === '전체' ? '' : cat;
        updateStageContent();
      },
      `chip${(selectedCategory === cat || (!state.stageFilters.category && cat === '전체')) ? ' active' : ''}`
    ))
  );

  // 3. Search Bar
  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '공연명, 연주곡, 장소, 일자 검색...',
    value: state.stageFilters.query || '',
    oninput: (e) => {
      state.stageFilters.query = e.target.value;
      updateStageContent();
    }
  });

  const viewModeToggle = el('div', {class: 'stage-view-mode-toggle', style: 'display: inline-flex; gap: 4px;'},
    button('📋 목록', () => {
      state.stageView = 'list';
      write('stageView', 'list');
      state.route = {tab: 'stage', view: 'list'};
      writeRoute(state.route, {replace: true});
      updateStageContent();
    }, `stage-sub-toggle-btn${state.stageView !== 'cards' ? ' active' : ''}`, null, {title: '목록형 보기'}),
    button('🎴 카드', () => {
      state.stageView = 'cards';
      write('stageView', 'cards');
      state.route = {tab: 'stage', view: 'cards'};
      writeRoute(state.route, {replace: true});
      updateStageContent();
    }, `stage-sub-toggle-btn${state.stageView === 'cards' ? ' active' : ''}`, null, {title: '카드형 그리드 보기'})
  );

  const topControls = el('div', {class: 'stage-controls-panel'},
    el('div', {class: 'stage-tabs-row'},
      viewTabs,
      el('div', {style: 'display: flex; align-items: center; gap: 10px;'},
        viewModeToggle,
        el('div', {class: 'stage-summary-text', id: 'stage-summary-count'})
      )
    ),
    el('div', {class: 'search-box'},
      el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
      categoryChips
    )
  );
  app.append(topControls);

  const contentArea = el('div', {id: 'stage-content-area'});
  app.append(contentArea);

  function getFilteredPerformances() {
    const q = (state.stageFilters.query || '').trim().toLowerCase();
    const cat = state.stageFilters.category || '';

    return state.performances.filter(perf => {
      if (cat && perf.category !== cat) return false;
      if (!q) return true;

      const titleMatch = (perf.title || '').toLowerCase().includes(q);
      const venueMatch = (perf.venue || '').toLowerCase().includes(q);
      const descMatch = (perf.description || '').toLowerCase().includes(q);
      const dateMatch = (perf.date || '').toLowerCase().includes(q);
      const setlistMatch = perf.setlist?.some(rawItem => {
        const item = normalizePerfSetlistItem(rawItem);
        return (item.title || '').toLowerCase().includes(q) || (item.artist || '').toLowerCase().includes(q);
      });

      return titleMatch || venueMatch || descMatch || dateMatch || setlistMatch;
    });
  }

  function updateStageContent() {
    const filtered = getFilteredPerformances();
    const countEl = document.getElementById('stage-summary-count');
    if (countEl) {
      countEl.textContent = `총 ${filtered.length}개 영상`;
    }

    // Update active category chips
    for (const btn of categoryChips.querySelectorAll('button')) {
      const isAll = btn.textContent.startsWith('전체');
      const text = isAll ? '전체' : btn.textContent.trim();
      const isActive = (!state.stageFilters.category && text === '전체') || (state.stageFilters.category === text);
      btn.classList.toggle('active', isActive);
    }

    // Update view mode toggle active states
    for (const btn of viewModeToggle.querySelectorAll('button')) {
      const isCard = btn.textContent.includes('카드');
      const shouldActive = isCard ? state.stageView === 'cards' : state.stageView !== 'cards';
      btn.classList.toggle('active', shouldActive);
    }

    contentArea.replaceChildren();

    if (!filtered.length) {
      contentArea.append(emptyState('검색된 공연 영상이 없습니다', '다른 검색어를 입력하거나 카테고리 필터를 변경해 보세요.'));
      return;
    }

    if (state.stageView === 'cards') {
      renderStageCards(filtered, contentArea);
    } else {
      renderStageList(filtered, contentArea);
    }
  }

  updateStageContent();
}

function renderAudioPlayer(audioData, title = '현장 녹음본') {
  const card = el('div', {class: 'audio-player-card', role: 'region', 'aria-label': `${title} 오디오 플레이어`});
  const audioSrc = audioData.url ? encodeURI(decodeURI(audioData.url)) : '';
  const audio = new Audio(audioSrc);
  audio.preload = 'metadata';
  activeAudios.add(audio);
  let isPlaying = false;
  let speed = 1.0;
  let isScrubbing = false;

  const rateBtn = el('button', {
    type: 'button',
    class: 'chip small',
    text: '1.0x',
    onclick: () => {
      speed = speed === 1.0 ? 0.8 : speed === 0.8 ? 1.2 : 1.0;
      audio.playbackRate = speed;
      rateBtn.textContent = `${speed}x`;
    }
  });

  function syncAudioMediaSession() {
    updateMediaSession({
      title: audioData.label || title,
      artist: 'AcaRaca 현장 녹음본',
      album: '연습 일지',
      onPlay: () => { audio.play().catch(() => {}); },
      onPause: () => { audio.pause(); },
      onSeekBackward: () => { audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); },
      onSeekForward: () => { audio.currentTime = Math.min(audio.duration || 9999, (audio.currentTime || 0) + 5); },
      position: audio.currentTime || 0,
      duration: audio.duration || audioData.duration || 0,
      playbackRate: speed
    });
    setMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused');
  }

  const pocketBtn = el('button', {
    type: 'button',
    class: 'chip small',
    text: '🔒 절전',
    title: '화면 끄고 주머니에 넣은 채 계속 듣기 (포켓 절전 모드)',
    onclick: () => {
      if (!isPlaying) {
        audio.play().then(() => {
          isPlaying = true;
          requestWakeLock();
          syncAudioMediaSession();
          playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
        }).catch(() => {});
      }
      enterPocketMode({
        title: audioData.label || title,
        partLabel: '연습 일지 현장 녹음본 · 백그라운드 재생 중'
      });
      toast('🔒 화면 절전 모드가 켜졌습니다. 화면을 두 번 탭하면 잠금이 해제됩니다.');
    }
  });

  const header = el('div', {class: 'audio-player-header'},
    el('span', {text: `🎙️ ${audioData.label || title}`}),
    el('div', {style: 'display: flex; gap: 6px; align-items: center;'}, pocketBtn, rateBtn)
  );

  const playBtn = button('재생', () => {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      setMediaSessionPlaybackState('paused');
      playBtn.replaceChildren(icon('play'), document.createTextNode('재생'));
    } else {
      audio.play().then(() => {
        isPlaying = true;
        requestWakeLock();
        syncAudioMediaSession();
        playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
      }).catch((e) => {
        console.warn('Audio play failed:', e);
      });
    }
  }, 'button primary small', 'play');

  const rewindBtn = button('5초', () => {
    audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5);
    toast('⏪ 녹음본 5초 뒤로');
  }, 'button secondary small', 'rewind');

  const forwardBtn = button('5초', () => {
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
    audio.currentTime = Math.min(max, (audio.currentTime || 0) + 5);
    toast('⏩ 녹음본 5초 앞으로');
  }, 'button secondary small', 'fastforward');

  const timeLabel = el('span', {class: 'audio-time-label', text: '00:00'});
  const rangeInput = el('input', {
    type: 'range',
    min: 0,
    max: audioData.duration || 100,
    value: 0,
    step: 0.5,
  });

  const updateSliderTime = (val) => {
    const sec = Math.floor(val);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    const durSec = Math.floor(audio.duration || audioData.duration || 0);
    if (durSec > 0) {
      const dm = String(Math.floor(durSec / 60)).padStart(2, '0');
      const ds = String(durSec % 60).padStart(2, '0');
      timeLabel.textContent = `${m}:${s} / ${dm}:${ds}`;
    } else {
      timeLabel.textContent = `${m}:${s}`;
    }
  };

  rangeInput.addEventListener('mousedown', () => { isScrubbing = true; });
  rangeInput.addEventListener('touchstart', () => { isScrubbing = true; }, {passive: true});
  rangeInput.addEventListener('input', () => {
    updateSliderTime(Number(rangeInput.value));
  });
  const commitSeek = () => {
    if (isScrubbing) {
      isScrubbing = false;
      audio.currentTime = Number(rangeInput.value);
    }
  };
  rangeInput.addEventListener('mouseup', commitSeek);
  rangeInput.addEventListener('touchend', commitSeek);
  rangeInput.addEventListener('change', commitSeek);

  let loopStart = null;
  let loopEnd = null;
  let isLooping = false;
  let lastLoopSeek = 0;

  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration && !isNaN(audio.duration)) {
      rangeInput.max = audio.duration;
      updateSliderTime(audio.currentTime || 0);
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (isLooping && loopStart !== null && loopEnd !== null && loopEnd > loopStart) {
      const now = Date.now();
      if (audio.currentTime >= loopEnd && (now - lastLoopSeek > 300)) {
        lastLoopSeek = now;
        audio.currentTime = loopStart;
        rangeInput.value = loopStart;
        updateSliderTime(loopStart);
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      }
    }
    if (!isScrubbing) {
      rangeInput.value = audio.currentTime;
      updateSliderTime(audio.currentTime);
    }
  });

  audio.addEventListener('ended', () => {
    if (isLooping && loopStart !== null) {
      audio.currentTime = loopStart;
      audio.play().catch(() => {});
      return;
    }
    isPlaying = false;
    playBtn.replaceChildren(icon('play'), document.createTextNode('재생'));
  });

  audio.addEventListener('error', (err) => {
    isPlaying = false;
    playBtn.replaceChildren(icon('play'), document.createTextNode('재생'));
    console.warn('Audio error:', err);
    toast('오디오 음원을 불러오지 못했습니다.');
  });

  const row = el('div', {class: 'audio-controls-row'},
    rewindBtn, playBtn, forwardBtn,
    el('div', {class: 'audio-progress-wrap'}, rangeInput, timeLabel)
  );

  // A-B Section Loop (구간 반복 집중 연습)
  const loopStatusBadge = el('span', {class: 'loop-status-badge', text: '구간 미설정'});

  const setABtn = el('button', {
    type: 'button',
    class: 'loop-point-btn',
    'aria-label': '현재 위치를 A 시작점으로 설정',
    onclick: () => {
      const cur = Math.max(0, Math.round((audio.currentTime || 0) * 10) / 10);
      loopStart = cur;
      if (loopEnd !== null && loopStart >= loopEnd) {
        loopEnd = Math.round((loopStart + 5) * 10) / 10;
      }
      updateLoopUI();
      toast(`📍 A 시작점: ${formatPlayerTime(loopStart)} 설정`);
    }
  }, '📍 A 시작');

  const setBBtn = el('button', {
    type: 'button',
    class: 'loop-point-btn',
    'aria-label': '현재 위치를 B 끝점으로 설정',
    onclick: () => {
      const cur = Math.max(0, Math.round((audio.currentTime || 0) * 10) / 10);
      loopEnd = cur;
      if (loopStart !== null && loopEnd <= loopStart) {
        loopStart = Math.max(0, Math.round((loopEnd - 5) * 10) / 10);
      }
      updateLoopUI();
      toast(`🏁 B 끝점: ${formatPlayerTime(loopEnd)} 설정`);
    }
  }, '🏁 B 끝');

  const loopToggleBtn = el('button', {
    type: 'button',
    class: 'loop-btn-toggle',
    'aria-label': 'A-B 구간 반복 켜기 또는 끄기',
    'aria-pressed': 'false',
    onclick: () => {
      if (isLooping) {
        isLooping = false;
        updateLoopUI();
        toast('⏹️ 구간 반복을 껐습니다.');
      } else {
        if (loopStart === null) {
          loopStart = Math.max(0, Math.round((audio.currentTime || 0) * 10) / 10);
        }
        if (loopEnd === null || loopEnd <= loopStart) {
          const maxDur = audio.duration || audioData.duration || 9999;
          loopEnd = Math.min(maxDur, Math.round((loopStart + 6) * 10) / 10);
        }
        isLooping = true;
        updateLoopUI();
        if (audio.currentTime < loopStart || audio.currentTime >= loopEnd) {
          audio.currentTime = loopStart;
        }
        if (audio.paused) {
          audio.play().then(() => {
            isPlaying = true;
            requestWakeLock();
            syncAudioMediaSession();
            playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
          }).catch(() => {});
        }
        toast(`🔁 구간 반복 시작: ${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)}`);
      }
    }
  }, icon('repeat'), el('span', {text: '구간 반복'}));

  const quick5Btn = el('button', {
    type: 'button',
    class: 'loop-btn-sub',
    'aria-label': '현재 위치부터 5초 빠른 반복',
    onclick: () => {
      const cur = Math.max(0, Math.round((audio.currentTime || 0) * 10) / 10);
      const maxDur = audio.duration || audioData.duration || 9999;
      loopStart = cur;
      loopEnd = Math.min(maxDur, Math.round((cur + 5) * 10) / 10);
      isLooping = true;
      updateLoopUI();
      audio.currentTime = loopStart;
      if (audio.paused) {
        audio.play().then(() => {
          isPlaying = true;
          requestWakeLock();
          syncAudioMediaSession();
          playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
        }).catch(() => {});
      }
      toast(`⚡ 5초 구간 반복 시작 (${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)})`);
    }
  }, '⚡ 5초');

  const quick10Btn = el('button', {
    type: 'button',
    class: 'loop-btn-sub',
    'aria-label': '현재 위치부터 10초 빠른 반복',
    onclick: () => {
      const cur = Math.max(0, Math.round((audio.currentTime || 0) * 10) / 10);
      const maxDur = audio.duration || audioData.duration || 9999;
      loopStart = cur;
      loopEnd = Math.min(maxDur, Math.round((cur + 10) * 10) / 10);
      isLooping = true;
      updateLoopUI();
      audio.currentTime = loopStart;
      if (audio.paused) {
        audio.play().then(() => {
          isPlaying = true;
          requestWakeLock();
          syncAudioMediaSession();
          playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
        }).catch(() => {});
      }
      toast(`⚡ 10초 구간 반복 시작 (${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)})`);
    }
  }, '⚡ 10초');

  const clearLoopBtn = el('button', {
    type: 'button',
    class: 'loop-btn-sub ghost',
    'aria-label': '구간 해제',
    onclick: () => {
      isLooping = false;
      loopStart = null;
      loopEnd = null;
      updateLoopUI();
      toast('구간 설정을 해제했습니다.');
    }
  }, '✕ 해제');

  function updateLoopUI() {
    const hasA = loopStart !== null;
    const hasB = loopEnd !== null;
    const dur = (hasA && hasB) ? Math.max(0, Math.round((loopEnd - loopStart) * 10) / 10) : 0;
    const aStr = hasA ? formatPlayerTime(loopStart) : '--:--';
    const bStr = hasB ? formatPlayerTime(loopEnd) : '--:--';

    setABtn.textContent = hasA ? `📍 A: ${aStr}` : '📍 A 시작';
    setBBtn.textContent = hasB ? `🏁 B: ${bStr}` : '🏁 B 끝';

    loopToggleBtn.classList.toggle('active', isLooping);
    loopToggleBtn.setAttribute('aria-pressed', String(isLooping));
    loopToggleBtn.replaceChildren(
      icon('repeat'),
      document.createTextNode(isLooping ? '반복 중' : '구간 반복')
    );

    if (isLooping && hasA && hasB) {
      loopStatusBadge.className = 'loop-status-badge active';
      loopStatusBadge.textContent = `🔁 ${aStr} ~ ${bStr} (${Math.round(dur)}초 반복 중)`;
    } else if (hasA || hasB) {
      loopStatusBadge.className = 'loop-status-badge ready';
      loopStatusBadge.textContent = `구간: ${aStr} ~ ${bStr}${dur ? ` (${Math.round(dur)}초)` : ''}`;
    } else {
      loopStatusBadge.className = 'loop-status-badge';
      loopStatusBadge.textContent = '구간 미설정';
    }
  }

  const loopBar = el('div', {class: 'audio-loop-bar'},
    el('div', {class: 'audio-loop-left'}, loopStatusBadge),
    el('div', {class: 'audio-loop-right'},
      setABtn, setBBtn, loopToggleBtn, quick5Btn, quick10Btn, clearLoopBtn
    )
  );

  card.append(header, row, loopBar);

  return {
    element: card,
    audio,
    play() {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          isPlaying = true;
          playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
        }).catch((e) => {
          console.warn('Audio play error:', e);
        });
      }
    },
    pause() {
      audio.pause();
      isPlaying = false;
      playBtn.replaceChildren(icon('play'), document.createTextNode('재생'));
    },
    getCurrentTime() {
      return audio.currentTime || 0;
    },
    seekTo(sec) {
      const applySeek = () => {
        try {
          const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
          const target = Math.max(0, Math.min(sec, max));
          audio.currentTime = target;
          rangeInput.value = target;
          updateSliderTime(target);
        } catch (e) {
          console.warn('Audio seek error:', e);
        }
      };

      if (audio.readyState >= 1) {
        applySeek();
      } else {
        audio.addEventListener('loadedmetadata', applySeek, { once: true });
        audio.load();
      }
    },
    setLoop(startSec, endSec) {
      loopStart = Math.max(0, Math.round(startSec * 10) / 10);
      const maxDur = audio.duration || audioData.duration || 9999;
      loopEnd = Math.min(maxDur, Math.max(loopStart + 1, Math.round(endSec * 10) / 10));
      isLooping = true;
      updateLoopUI();
      this.seekTo(loopStart);
      this.play();
    },
    clearLoop() {
      isLooping = false;
      loopStart = null;
      loopEnd = null;
      updateLoopUI();
    },
    getLoopState() {
      return { loopStart, loopEnd, isLooping };
    },
    isPlaying() {
      return isPlaying && !audio.paused;
    },
    destroy() {
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {}
      activeAudios.delete(audio);
      releaseWakeLock();
      exitPocketMode();
      setMediaSessionPlaybackState('none');
    }
  };
}

function renderFeedbackSection(reh, playerInstance, audioCtrl, song = null) {
  const section = el('div', {class: 'feedback-section'});
  const title = el('div', {class: 'feedback-section-title'}, icon('chat'), el('span', {text: '팀원 피드백 (누구나 작성 가능)'}));

  const defaultAuthor = state.myName || read('last_feedback_author', '');
  const authorInput = el('input', {class: 'feedback-input-sm', placeholder: '이름/닉네임 (예: 지은)', value: defaultAuthor});

  const feedbackPartOptions = [
    ['all', '전체 공통'],
    ['lead', '리드 (LEAD)'],
    ['soprano', '소프라노 (SOP)'],
    ['alto', '알토 (ALTO)'],
    ['tenor', '테너 (TENOR)'],
    ['baritone', '바리톤 (BARI)'],
    ['bass', '베이스 (BASS)'],
    ['vp', 'VP (보컬퍼커션)'],
    ['part1', '1번 파트'],
    ['part2', '2번 파트'],
    ['part3', '3번 파트'],
    ['part4', '4번 파트'],
    ['part5', '5번 파트'],
    ['part6', '6번 파트'],
    ['part7', '7번 파트']
  ];
  const validPartKeys = new Set(feedbackPartOptions.map(([k]) => k));
  const autoPart = (song && songMyPart(song)) || state.myPart || 'all';
  const defaultPart = validPartKeys.has(autoPart) ? autoPart : 'all';
  const partSelect = el('select', {class: 'feedback-input-sm'},
    ...feedbackPartOptions.map(([val, label]) => el('option', {value: val, text: label}))
  );
  partSelect.value = defaultPart;

  let selectedTime = 0;
  let activePartFilter = 'all';

  const timeBtn = button('⏱️ 재생시간 가져오기', () => {
    let cur = 0;
    const targetPlayer = audioCtrl || playerInstance;
    if (targetPlayer?.getCurrentTime) {
      cur = Math.floor(targetPlayer.getCurrentTime());
    }
    selectedTime = cur;
    const m = String(Math.floor(cur / 60)).padStart(2, '0');
    const s = String(cur % 60).padStart(2, '0');
    timeBtn.textContent = `⏱️ ${m}:${s} 마디`;
  }, 'button secondary small');

  const textArea = el('textarea', {class: 'feedback-textarea', placeholder: '음정/박자 피드백, 모니터링 소감, 칭찬을 자유롭게 남겨주세요.'});

  const submitBtn = button('피드백 남기기', () => {
    const content = textArea.value.trim();
    if (!content) { toast('피드백 내용을 입력해 주세요.'); return; }
    const author = authorInput.value.trim() || '익명의 단원';
    write('last_feedback_author', author);

    addFeedback({
      rehearsalId: reh.id,
      songId: reh.songId,
      author,
      part: partSelect.value,
      time: selectedTime,
      content
    });
    textArea.value = '';
    selectedTime = 0;
    timeBtn.textContent = '⏱️ 재생시간 가져오기';
    if (activePartFilter !== 'all' && activePartFilter !== partSelect.value) {
      activePartFilter = 'all';
    }
    toast('피드백을 이 기기에 저장했어요. 다른 단원에게 보여주려면 설정 → 백업 내보내기 파일을 공유해 주세요.');
    updateFeed();
  }, 'button primary small');

  const formBox = el('div', {class: 'feedback-form-box'},
    el('div', {class: 'feedback-form-row'}, authorInput, partSelect, timeBtn),
    textArea,
    el('div', {class: 'feedback-form-actions'},
      el('small', {style: 'color: var(--muted); font-size: 11px;', text: '📱 이 기기에만 저장돼요 · 공유는 설정 → 백업 내보내기'}),
      submitBtn
    )
  );

  const partLabelFor = (partKey) => {
    if (!partKey || partKey === 'all') return '전체';
    return PARTS[partKey] || partKey;
  };

  const partFilterBar = el('div', {class: 'chip-group', style: 'margin-bottom: 10px;', hidden: true});
  const feedHost = el('div', {class: 'feedback-feed'});
  function updateFeed() {
    const allFeedbacks = getAllFeedbacks(reh.id);
    if (!allFeedbacks.length) {
      partFilterBar.hidden = true;
      partFilterBar.replaceChildren();
      feedHost.replaceChildren(el('p', {style: 'color: var(--muted); font-size: 12px; text-align: center; padding: 12px;', text: '아직 등록된 피드백이 없습니다. 첫 의견을 남겨보세요!'}));
      return;
    }

    const partCounts = new Map();
    for (const fb of allFeedbacks) {
      const pk = fb.part || 'all';
      partCounts.set(pk, (partCounts.get(pk) || 0) + 1);
    }
    if (activePartFilter !== 'all' && !partCounts.has(activePartFilter)) {
      activePartFilter = 'all';
    }

    const specificParts = [...partCounts.keys()].filter(k => k !== 'all');
    if (specificParts.length > 0) {
      partFilterBar.hidden = false;
      const chipEntries = [
        ['all', `전체 (${allFeedbacks.length})`],
        ...[...partCounts.entries()].map(([pk, cnt]) => [pk, `${partLabelFor(pk)} (${cnt})`])
      ];
      const deduped = [];
      const seen = new Set();
      for (const entry of chipEntries) {
        if (seen.has(entry[0])) continue;
        seen.add(entry[0]);
        deduped.push(entry);
      }
      partFilterBar.replaceChildren(...deduped.map(([pk, label]) => button(label, () => {
        activePartFilter = pk;
        updateFeed();
      }, `chip${activePartFilter === pk ? ' active' : ''}`)));
    } else {
      partFilterBar.hidden = true;
      partFilterBar.replaceChildren();
    }

    const feedbacks = activePartFilter === 'all'
      ? allFeedbacks
      : allFeedbacks.filter(fb => (fb.part || 'all') === activePartFilter);

    const likedSet = new Set(array(read('liked_feedbacks', [])));

    feedHost.replaceChildren(...feedbacks.map(fb => {
      const m = String(Math.floor((fb.time || 0) / 60)).padStart(2, '0');
      const s = String((fb.time || 0) % 60).padStart(2, '0');
      const hasTime = typeof fb.time === 'number' && !isNaN(fb.time) && fb.time >= 0;
      const timeNode = hasTime ? el('button', {
        type: 'button',
        class: 'feedback-time-chip',
        title: `${m}:${s} 구간으로 이동하여 재생`,
        onclick: () => {
          const targetPlayer = audioCtrl || playerInstance;
          if (targetPlayer?.seekTo) {
            targetPlayer.seekTo(fb.time);
            if (typeof targetPlayer.play === 'function') {
              targetPlayer.play();
            }
            if (targetPlayer.element?.scrollIntoView) {
              targetPlayer.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            toast(`▶ ${m}:${s} 녹음 구간으로 이동하여 재생합니다.`);
          }
        }
      }, `⏱️ ${m}:${s}`) : null;

      const loopChip = hasTime ? el('button', {
        type: 'button',
        class: 'feedback-loop-chip',
        title: `${m}:${s} 피드백 구간 집중 반복 연습 (6초간 무한 루프)`,
        onclick: () => {
          const targetPlayer = audioCtrl || playerInstance;
          if (targetPlayer?.setLoop) {
            targetPlayer.setLoop(fb.time, fb.time + 6);
            if (targetPlayer.element?.scrollIntoView) {
              targetPlayer.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            toast(`🔁 ${m}:${s} 피드백 구간 집중 반복(6초)을 시작합니다.`);
          } else if (targetPlayer?.seekTo) {
            targetPlayer.seekTo(fb.time);
            targetPlayer.play?.();
            toast(`▶ ${m}:${s} 녹음 구간으로 이동합니다.`);
          }
        }
      }, icon('repeat'), el('span', {text: '반복'})) : null;

      const timeGroup = hasTime ? el('div', {class: 'feedback-time-group'}, timeNode, loopChip) : null;

      const isLiked = likedSet.has(fb.id);
      const likeBtn = el('button', {
        type: 'button',
        class: `feedback-like-btn${isLiked ? ' liked' : ''}`,
        'aria-pressed': String(isLiked),
        title: isLiked ? '공감 취소' : '이 피드백에 공감하기',
        onclick: () => {
          toggleFeedbackLike(fb.id);
          updateFeed();
        }
      }, `${isLiked ? '❤️' : '🤍'} 공감 ${fb.likes || 0}`);

      return el('div', {class: 'feedback-bubble'},
        el('div', {class: 'feedback-bubble-top'},
          el('span', {class: 'feedback-author'}, `${fb.author} (${partLabelFor(fb.part)})`),
          timeGroup
        ),
        el('p', {class: 'feedback-text', text: fb.content}),
        el('div', {class: 'feedback-bottom-row'},
          el('span', {text: fb.createdAt ? new Date(fb.createdAt).toLocaleDateString('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : ''}),
          likeBtn
        )
      );
    }));
  }

  updateFeed();
  section.append(title, formBox, partFilterBar, feedHost);
  return section;
}

function openAttachMediaModal(reh) {
  const dialog = document.getElementById('attach-media-dialog');
  if (!dialog) return;

  const targetEl = document.getElementById('attach-media-target');
  const form = document.getElementById('attach-media-form');
  const fileInput = document.getElementById('attach-file-input');
  const urlInput = document.getElementById('attach-url-input');
  const cancelBtn = document.getElementById('attach-media-cancel');
  const submitBtn = document.getElementById('attach-media-submit');

  targetEl.textContent = `대상 일지: ${reh.title}`;
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '등록 완료';

  cancelBtn.onclick = () => dialog.close();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();

    if (!file && !url) {
      toast('파일을 선택하거나 온라인 주소를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      if (file) {
        const mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = await saveMediaFile(mediaId, file);
        if (!record) throw new Error('파일 저장에 실패했습니다.');

        const isVideo = file.type?.startsWith('video') || /\.(mp4|webm|mov)$/i.test(file.name);
        attachMediaToRehearsal(reh.id, {
          mediaId,
          isVideo,
          fileName: file.name
        });
      } else if (url) {
        const isVideo = url.includes('youtube.com') || url.includes('youtu.be') || /\.(mp4|webm)$/i.test(url);
        attachMediaToRehearsal(reh.id, {
          mediaUrl: url,
          isVideo,
          fileName: '온라인 미디어'
        });
      }

      state.rehearsals = await loadRehearsals(true);
      dialog.close();
      render();
      toast('🎙️ 연습 음원/영상이 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('미디어 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '등록 완료';
    }
  };

  dialog.showModal();
}

function openNewRehearsalModal() {
  const dialog = document.getElementById('new-rehearsal-dialog');
  if (!dialog) return;

  const form = document.getElementById('new-rehearsal-form');
  const songSelect = document.getElementById('new-reh-song');
  const titleInput = document.getElementById('new-reh-title');
  const dateInput = document.getElementById('new-reh-date');
  const notesInput = document.getElementById('new-reh-notes');
  const fileInput = document.getElementById('new-reh-file');
  const urlInput = document.getElementById('new-reh-url');
  const cancelBtn = document.getElementById('new-reh-cancel');
  const submitBtn = document.getElementById('new-reh-submit');

  songSelect.replaceChildren(
    el('option', { value: '', text: '기타 / 전체 합주' }),
    ...state.songs.map(s => el('option', { value: s.id, text: `${s.title} (${s.artist || '아티스트 미등록'})` }))
  );

  titleInput.value = '';
  dateInput.value = localDateString();
  notesInput.value = '';
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '연습 일지 등록';

  cancelBtn.onclick = () => dialog.close();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('연습 일지 제목을 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const file = fileInput.files?.[0];
      const url = urlInput.value.trim();
      const rehId = `reh-custom-${Date.now()}`;
      let mediaOverride = null;

      let videoObj = null;
      let audioObj = null;

      if (file) {
        const mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = await saveMediaFile(mediaId, file);
        if (!record) throw new Error('파일 저장에 실패했습니다.');

        const isVideo = file.type?.startsWith('video') || /\.(mp4|webm|mov)$/i.test(file.name);
        mediaOverride = {
          mediaId,
          isVideo,
          fileName: file.name
        };
      } else if (url) {
        const isVideo = url.includes('youtube.com') || url.includes('youtu.be') || /\.(mp4|webm)$/i.test(url);
        if (isVideo) {
          videoObj = { type: 'video', url, label: '온라인 영상' };
        } else {
          audioObj = { url, label: '온라인 음원' };
        }
      }

      const newReh = {
        id: rehId,
        songId: songSelect.value || '',
        date: dateInput.value || localDateString(),
        title,
        notes: notesInput.value.trim(),
        video: videoObj,
        audio: audioObj,
        isCustom: true,
        initialFeedbacks: []
      };

      addCustomRehearsal(newReh);
      if (mediaOverride) {
        attachMediaToRehearsal(rehId, mediaOverride);
      }

      state.rehearsals = await loadRehearsals(true);
      dialog.close();
      render();
      toast('✨ 새 연습 일지가 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '연습 일지 등록';
    }
  };

  dialog.showModal();
}

function pickSupportedAudioMime() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function openQuickRecordRehearsalModal(defaultSongId = '') {
  const existing = document.getElementById('quick-record-reh-dialog');
  if (existing) existing.remove();

  let mediaStream = null;
  let recorder = null;
  let chunks = [];
  let recordedBlob = null;
  let recordedUrl = '';
  let timerId = null;
  let elapsedSec = 0;
  let disposed = false; // 창을 닫은 뒤 늦게 도착하는 녹음 완료(onstop)는 무시해 재생 주소가 새지 않게 한다

  const stopStream = () => {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    if (mediaStream) {
      for (const trk of mediaStream.getTracks()) {
        try { trk.stop(); } catch {}
      }
      mediaStream = null;
    }
  };

  const dialog = el('dialog', {
    id: 'quick-record-reh-dialog',
    class: 'stage-modal-dialog',
    'aria-labelledby': 'quick-record-reh-title'
  });

  const songSelect = el('select', { class: 'search-input' },
    el('option', { value: '', text: '기타 / 전체 합주' }),
    ...state.songs.map(s => el('option', { value: s.id, text: `${s.title} (${s.artist || '아카라카'})`, selected: s.id === defaultSongId }))
  );
  const titleInput = el('input', {
    type: 'text',
    class: 'search-input',
    placeholder: '예: 11월 정기합주 런스루 현장 녹음',
    value: `${new Date().toLocaleDateString('ko-KR')} 합주 현장 녹음`
  });
  const notesInput = el('textarea', {
    class: 'search-input',
    rows: 2,
    placeholder: '합주 중 체크한 인토네이션·호흡·리듬 메모 (선택)'
  });

  const timerBadge = el('span', { class: 'voice-rec-timer', text: '00:00' });
  const previewBox = el('div', { style: 'margin-top: 10px;' });
  const saveBtn = button('✨ 연습 일지로 저장', async () => {
    if (!recordedBlob) {
      toast('먼저 마이크로 합주 소리를 녹음해 주세요.');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중…';
    try {
      const ext = recordedBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const fileName = `rehearsal-${Date.now()}.${ext}`;
      const fileObj = new File([recordedBlob], fileName, { type: recordedBlob.type || 'audio/webm' });
      const mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await saveMediaFile(mediaId, fileObj);
      const rehId = `reh-custom-${Date.now()}`;
      addCustomRehearsal({
        id: rehId,
        songId: songSelect.value || '',
        date: localDateString(),
        title: titleInput.value.trim() || '합주 현장 녹음',
        notes: notesInput.value.trim(),
        video: null,
        audio: null,
        isCustom: true,
        initialFeedbacks: []
      });
      attachMediaToRehearsal(rehId, {
        mediaId,
        isVideo: false,
        fileName,
        duration: elapsedSec
      });
      state.rehearsals = await loadRehearsals(true);
      dialog.close();
      render();
      toast('🎙️ 합주 녹음본이 새 연습 일지로 등록되었습니다!');
    } catch (err) {
      toast(`저장 실패: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = '✨ 연습 일지로 저장';
    }
  }, 'button primary small', null, { disabled: true });

  const recToggleBtn = button('🔴 녹음 시작', async () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('이 브라우저에서는 마이크 직접 녹음을 지원하지 않습니다.');
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mimeType = pickSupportedAudioMime();
      recorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      elapsedSec = 0;
      timerBadge.textContent = '00:00';
      timerBadge.classList.add('recording');
      recToggleBtn.textContent = '⏹ 녹음 정지';
      recToggleBtn.className = 'button danger small';
      saveBtn.disabled = true;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        stopStream();
        if (disposed) return;
        timerBadge.classList.remove('recording');
        recToggleBtn.textContent = '🔴 다시 녹음';
        recToggleBtn.className = 'button secondary small';
        if (!chunks.length) return;
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        recordedBlob = new Blob(chunks, { type: recorder?.mimeType || mimeType || 'audio/webm' });
        recordedUrl = URL.createObjectURL(recordedBlob);
        previewBox.replaceChildren(
          el('audio', { controls: true, src: recordedUrl, style: 'width: 100%; height: 40px;' })
        );
        saveBtn.disabled = false;
      };

      recorder.start(250);
      timerId = setInterval(() => {
        elapsedSec += 1;
        timerBadge.textContent = formatPlayerTime(elapsedSec);
      }, 1000);
    } catch (err) {
      stopStream();
      toast('마이크 권한을 허용해 주세요.');
    }
  }, 'button primary small');

  const header = el('div', { class: 'stage-modal-header' },
    el('div', {},
      el('h3', { id: 'quick-record-reh-title', text: '🎙️ 합주 현장 즉석 녹음 & 일지 등록' }),
      el('p', { style: 'font-size: 12.5px; color: var(--muted); margin-top: 2px;', text: '외부 녹음 앱 없이 바로 합주를 녹음하고 타임스탬프 피드백 일지로 저장합니다.' })
    ),
    button('✕', () => dialog.close(), 'icon-button', null, { 'aria-label': '닫기' })
  );

  const body = el('div', { class: 'stage-modal-body', style: 'display: flex; flex-direction: column; gap: 12px;' },
    el('div', { class: 'voice-rec-controls-row' },
      recToggleBtn,
      timerBadge,
      el('span', { style: 'font-size: 12px; color: var(--muted);', text: '녹음 완료 후 바로 들어보고 저장할 수 있습니다.' })
    ),
    previewBox,
    el('label', { style: 'font-size: 12px; font-weight: 700;' }, '연습곡 선택', songSelect),
    el('label', { style: 'font-size: 12px; font-weight: 700;' }, '일지 제목', titleInput),
    el('label', { style: 'font-size: 12px; font-weight: 700;' }, '메모', notesInput),
    el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;' },
      button('취소', () => dialog.close(), 'button secondary small'),
      saveBtn
    )
  );

  dialog.append(header, body);
  dialog.addEventListener('close', () => {
    disposed = true;
    stopStream();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrl = '';
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
}

function renderRehearsal() {
  app.append(
    el('div', {class: 'page-heading'},
      el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
        el('div', {},
          el('p', {class: 'eyebrow', text: 'REHEARSAL & FEEDBACK HUB'}),
          el('h1', {text: '연습 일지 & 팀 피드백'}),
          el('p', {text: '회차별 런스루, 현장 녹음본을 모니터링하고 단원 누구나 자유롭게 피드백을 남겨요.'})
        ),
        el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap;'},
          button('🔴 마이크로 합주 바로 녹음', () => openQuickRecordRehearsalModal(), 'button secondary small', 'mic'),
          button('+ 연습 일지 & 녹음본 등록', () => openNewRehearsalModal(), 'button primary small', 'plus')
        )
      )
    )
  );

  if (!state.rehearsals.length) {
    app.append(emptyState('등록된 연습 일지가 아직 없어요', '첫 합주 연습 일지와 녹음본을 등록해 보세요.', button('+ 연습 일지 등록하기', () => openNewRehearsalModal(), 'button primary')));
    return;
  }

  const findRehearsalSong = (songId) => {
    if (!songId) return null;
    const exact = state.songs.find(s => s.id === songId);
    if (exact) return exact;
    const baseId = String(songId).replace(/-[0-9]+$/, '');
    return state.songs.find(s => String(s.id).replace(/-[0-9]+$/, '') === baseId) || null;
  };

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '연습 일지 제목, 곡명, 메모, 피드백 작성자·내용 검색...',
    value: state.rehearsalFilters.query || '',
    oninput: (e) => {
      state.rehearsalFilters.query = e.target.value;
      updateRehearsalList();
    }
  });

  const songSelect = el('select', {
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.rehearsalFilters.songId = e.target.value;
      updateRehearsalList();
    }
  }, [
    el('option', { value: '', text: '전체 곡' }),
    ...state.songs.map(s => el('option', { value: s.id, text: s.title }))
  ]);
  songSelect.value = state.rehearsalFilters.songId || '';

  const countBadge = el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'});
  const resetFilters = () => {
    state.rehearsalFilters = { query: '', songId: '' };
    searchInput.value = '';
    songSelect.value = '';
    updateRehearsalList();
  };
  const resetBtn = button('필터 초기화', resetFilters, 'button ghost small', 'refresh');

  const filterRow = el('div', {style: 'display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;'},
    el('div', {style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;'},
      el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '곡 필터:'),
      songSelect,
      resetBtn
    ),
    countBadge
  );

  const filterPanel = el('div', {class: 'search-box', style: 'margin-bottom: 20px;'},
    el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
    filterRow
  );

  const listHost = el('div', {class: 'rehearsal-grid'});
  const rehearsalPlayers = [];

  function getFilteredRehearsals() {
    const q = (state.rehearsalFilters.query || '').trim().toLowerCase();
    const songId = state.rehearsalFilters.songId || '';
    let items = songId ? getRehearsalsForSong(state.rehearsals, songId) : [...state.rehearsals];
    if (q) {
      items = items.filter(reh => {
        const song = findRehearsalSong(reh.songId);
        const feedbacks = getAllFeedbacks(reh.id);
        const haystack = [
          reh.title,
          reh.date,
          reh.notes,
          song?.title,
          song?.artist,
          ...feedbacks.flatMap(fb => [fb.author, fb.content, PARTS[fb.part] || fb.part])
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return items;
  }

  function updateRehearsalList() {
    for (const p of rehearsalPlayers) {
      try { p.destroy?.(); } catch {}
      const idx = activePlayers.indexOf(p);
      if (idx >= 0) activePlayers.splice(idx, 1);
    }
    rehearsalPlayers.length = 0;

    const filtered = getFilteredRehearsals();
    const hasFilter = Boolean((state.rehearsalFilters.query || '').trim() || state.rehearsalFilters.songId);
    resetBtn.hidden = !hasFilter;
    countBadge.textContent = hasFilter
      ? `검색 결과 ${filtered.length} / 전체 ${state.rehearsals.length}건`
      : `총 ${state.rehearsals.length}건`;

    if (!filtered.length) {
      listHost.replaceChildren(
        emptyState('조건에 맞는 연습 일지가 없어요', '검색어나 선택한 곡 필터를 초기화해 보세요.', button('필터 초기화', resetFilters, 'button secondary small'))
      );
      return;
    }

    listHost.replaceChildren(...filtered.map(reh => {
      const song = findRehearsalSong(reh.songId);
      let activePlayerInstance = null;
      let audioCtrl = null;

      const mediaBox = el('div', {class: 'rehearsal-media-box'});
      const hasAudio = Boolean(reh.audio?.url && reh.audio.url.trim());
      const hasLocalVideo = Boolean(reh.video?.type === 'local-video' && reh.video?.url);

      if (hasAudio) {
        audioCtrl = renderAudioPlayer(reh.audio, reh.title);
        activePlayerInstance = audioCtrl;
        activePlayers.push(audioCtrl);
        rehearsalPlayers.push(audioCtrl);
        mediaBox.append(audioCtrl.element);
        mediaBox.append(
          el('div', {style: 'display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 12px;'},
            button('📁 녹음본 교체', () => openAttachMediaModal(reh), 'button ghost small', 'upload')
          )
        );
      } else if (hasLocalVideo) {
        const videoEl = el('video', {
          controls: true,
          src: reh.video.url,
          style: 'width: 100%; border-radius: 12px; max-height: 480px; background: #000; margin-bottom: 12px;'
        });
        activePlayerInstance = {
          element: videoEl,
          play: () => videoEl.play().catch(() => {}),
          pause: () => videoEl.pause(),
          seekTo: (sec) => {
            try {
              videoEl.currentTime = sec;
            } catch (e) {
              videoEl.addEventListener('loadedmetadata', () => { videoEl.currentTime = sec; }, { once: true });
            }
          },
          getCurrentTime: () => videoEl.currentTime || 0,
          destroy: () => { videoEl.pause(); videoEl.src = ''; }
        };
        activePlayers.push(activePlayerInstance);
        rehearsalPlayers.push(activePlayerInstance);
        mediaBox.append(videoEl);
        mediaBox.append(
          el('div', {style: 'display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 12px;'},
            button('📁 녹음본/영상 교체', () => openAttachMediaModal(reh), 'button ghost small', 'upload')
          )
        );
      } else if (reh.video?.url) {
        const ytPlayer = createPlayer(mediaBox, reh.video, reh.title);
        activePlayerInstance = ytPlayer;
        activePlayers.push(ytPlayer);
        rehearsalPlayers.push(ytPlayer);
        mediaBox.append(
          el('div', {style: 'display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 12px;'},
            button('📁 녹음본/영상 교체', () => openAttachMediaModal(reh), 'button ghost small', 'upload')
          )
        );
      } else {
        mediaBox.append(
          el('div', {style: 'padding: 24px 16px; border: 2px dashed var(--border); border-radius: 12px; text-align: center; background: var(--surface-soft); margin-bottom: 16px;'},
            el('div', {style: 'font-size: 28px; margin-bottom: 6px;'}, '🎙️'),
            el('h3', {style: 'font-size: 15px; font-weight: 700; margin-bottom: 4px;'}, '연습 녹음본을 올려보세요'),
            el('p', {style: 'font-size: 12px; color: var(--muted); margin-bottom: 14px;'}, '컴퓨터의 녹음 파일(.mp3, .m4a, .wav 등)을 올리면 바로 메인 음원으로 재생되며 아래 구간별 피드백과 싱크를 맞출 수 있습니다.'),
            button('🎙️ 내 컴퓨터에서 녹음본 파일 올리기', () => openAttachMediaModal(reh), 'button primary small', 'music')
          )
        );
      }

      const feedbackSection = renderFeedbackSection(reh, audioCtrl || activePlayerInstance, audioCtrl, song);

      const topActions = el('div', {style: 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap;'},
        song ? button('파트 연습실 이동 ↗', () => openSong(song), 'button primary small', 'play') : null,
        reh.isCustom ? button('삭제', async () => {
          if (confirm(`'${reh.title}' 연습 일지를 삭제할까요?`)) {
            await deleteCustomRehearsal(reh.id);
            state.rehearsals = await loadRehearsals(true);
            render();
            toast('연습 일지를 삭제했습니다.');
          }
        }, 'button secondary small danger') : null
      );

      return el('article', {class: 'rehearsal-card'},
        el('div', {class: 'rehearsal-top'},
          el('div', {},
            el('span', {class: 'rehearsal-song-tag'}, icon('music'), el('span', {text: song?.title || '전체 합주'})),
            el('h2', {style: 'margin-top: 6px; font-size: 20px;', text: reh.title}),
            el('p', {class: 'stage-meta', text: `📅 ${reh.date}`})
          ),
          topActions
        ),
        reh.notes && el('div', {class: 'rehearsal-notes', text: reh.notes}),
        mediaBox,
        feedbackSection
      );
    }));
  }

  app.append(filterPanel, listHost);
  updateRehearsalList();
}

/* -------------------------------------------------------------
 *  SCORES ARCHIVE (악보 창고)
 * ------------------------------------------------------------- */

function openUploadScoreModal(defaultSongId = '') {
  const dialog = document.getElementById('upload-score-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-score-form');
  const songSelect = document.getElementById('score-song-select');
  const titleInput = document.getElementById('score-title-input');
  const categorySelect = document.getElementById('score-category-select');
  const partSelect = document.getElementById('score-part-select');
  const arrangerInput = document.getElementById('score-arranger-input');
  const memoInput = document.getElementById('score-memo-input');
  const fileInput = document.getElementById('score-file-input');
  const urlInput = document.getElementById('score-url-input');
  const cancelBtn = document.getElementById('upload-score-cancel');
  const submitBtn = document.getElementById('upload-score-submit');

  songSelect.replaceChildren(
    el('option', { value: '', text: '기타 / 특정 곡 없음' }),
    ...state.songs.map(s => el('option', {
      value: s.id,
      text: `${s.title} (${s.artist || '아티스트 미등록'})`,
      selected: s.id === defaultSongId
    }))
  );

  titleInput.value = '';
  categorySelect.value = '총보';
  partSelect.value = 'all';
  arrangerInput.value = '';
  memoInput.value = '';
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '악보 등록하기';

  const closeBtn = document.getElementById('upload-score-close');
  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('악보 제목을 입력해 주세요.');
      return;
    }

    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();

    if (!file && !url) {
      toast('악보 또는 MIDI/음원 파일을 선택하거나 온라인 주소를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const scoreId = `score-custom-${Date.now()}`;
      let mediaId = null;
      let fileName = file?.name || '온라인 악보';
      const ext = (file?.name || '').split('.').pop().toLowerCase();
      let fileType = 'link';
      let format = 'link';
      if (file) {
        if (ext === 'pdf') { fileType = 'pdf'; format = 'pdf'; }
        else if (ext === 'mid' || ext === 'midi') { fileType = 'midi'; format = 'midi'; }
        else if (ext === 'nwc' || ext === 'nwctxt') { fileType = 'nwc'; format = ext; }
        else if (ext === 'mscz') { fileType = 'mscz'; format = 'mscz'; }
        else if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) { fileType = 'audio'; format = 'audio'; }
        else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) { fileType = 'image'; format = 'image'; }
        else { fileType = 'other'; format = ext; }
      }
      let fileSize = file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '';

      if (file) {
        mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = await saveMediaFile(mediaId, file, { title });
        if (!record) throw new Error('파일 저장에 실패했습니다.');
      }

      const newScore = {
        id: scoreId,
        songId: songSelect.value || '',
        title,
        category: categorySelect.value || '총보',
        part: partSelect.value || 'all',
        arranger: arrangerInput.value.trim() || '단원 등록',
        memo: memoInput.value.trim(),
        fileType,
        format,
        fileName,
        fileSize,
        fileUrl: url || '',
        mediaId,
        isCustom: true,
        uploadedAt: localDateString()
      };

      addCustomScore(newScore);
      state.scores = await loadScores(true);
      dialog.close();
      render();
      toast('🎼 새 악보가 악보 창고에 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('악보 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '악보 등록하기';
    }
  };

  dialog.showModal();
}

// 악보 미리보기(js/scoreViewer.js)는 처음 악보를 열 때 불러온다.
let scoreViewerPromise = null;
function loadScoreViewer() {
  if (!scoreViewerPromise) {
    scoreViewerPromise = importLazy('./scoreViewer.js').then((mod) => {
      mod.bindApp({ state, getSongTranspose, formatTransposeBadgeText, openSong, openOrDownloadScore, openPitchPipe });
      return mod;
    }).catch((error) => {
      scoreViewerPromise = null;
      throw error;
    });
  }
  return scoreViewerPromise;
}
async function openScorePreviewModal(score, options = {}) {
  try {
    const mod = await loadScoreViewer();
    return mod.openScorePreviewModal(score, options);
  } catch (error) {
    console.warn('score viewer load error:', error);
    toast('악보 미리보기를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
}

function openOrDownloadScore(score, isDownload = false, options = {}) {
  const fileUrl = score.blobUrl || score.fileUrl || score.driveUrl;
  if (!fileUrl) {
    toast('첨부된 악보 파일이 없습니다. 새 악보를 등록해 주세요.');
    return;
  }
  // 직접 등록·백업으로 들어온 주소가 javascript: 같은 스크립트 주소면 열지 않는다
  if (!isSafeLinkUrl(fileUrl)) {
    toast('이 악보 주소는 열 수 없습니다. 악보를 다시 등록해 주세요.');
    return;
  }
  let encodedFileUrl = '';
  if (score.fileUrl) {
    try { encodedFileUrl = encodeURI(decodeURI(score.fileUrl)); } catch { encodedFileUrl = encodeURI(score.fileUrl); }
  }
  const safeUrl = score.blobUrl ? score.blobUrl : (score.driveUrl || encodedFileUrl);
  const fmtKey = getScoreFormatKey(score);
  const isPdf = fmtKey === 'pdf';
  const isInAppPreviewable = Boolean(!score.driveUrl && ['nwc', 'midi', 'mscz', 'pdf'].includes(fmtKey));

  if (!isDownload && isInAppPreviewable) {
    openScorePreviewModal(score, options);
    return;
  }

  if (isDownload || (!isPdf && !score.driveUrl)) {
    const a = document.createElement('a');
    a.href = safeUrl;
    a.download = score.fileName || `${score.title}.${score.format || 'nwc'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast(`📥 '${score.fileName || score.title}' 악보 파일을 다운로드합니다.`);
  } else {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}


// 자료실 화면(js/archivePages.js)은 해당 탭을 처음 열 때 불러온다. render()가 불러온 뒤 그린다.
let archivePagesModule = null;
let archivePagesPromise = null;
function loadArchivePages() {
  if (archivePagesModule) return Promise.resolve(archivePagesModule);
  if (!archivePagesPromise) {
    archivePagesPromise = importLazy('./archivePages.js').then((mod) => {
      mod.bindApp({ app, state, activePlayers, navigate, openSong, isProtectedAuthorized, openProtectedAuthDialog, renderProtectedLockScreen, openUploadScoreModal, openOrDownloadScore, openPitchPipe, render });
      archivePagesModule = mod;
      return mod;
    }).catch((error) => {
      archivePagesPromise = null;
      throw error;
    });
  }
  return archivePagesPromise;
}
const ARCHIVE_PAGE_TABS = new Set(['scores', 'education', 'practiceVideos', 'appreciation', 'memories']);
// 자료실 화면 함수: 모듈이 아직 없으면 render()가 불러온 뒤 다시 그린다.
function renderScores() { if (archivePagesModule) archivePagesModule.renderScores(); else render(); }
function renderEducation() { if (archivePagesModule) archivePagesModule.renderEducation(); else render(); }
function renderPracticeVideos() { if (archivePagesModule) archivePagesModule.renderPracticeVideos(); else render(); }
function renderAppreciation() { if (archivePagesModule) archivePagesModule.renderAppreciation(); else render(); }
function renderMemories() { if (archivePagesModule) archivePagesModule.renderMemories(); else render(); }
function openMemoryLightboxModal(memory) {
  loadArchivePages().then((mod) => mod.openMemoryLightboxModal(memory)).catch(() => toast('영상을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
}

function showQR(song, part = null) {
  const dialog = document.getElementById('qr-dialog');
  if (!dialog) return;
  const url = routeUrl({song: song.id, part}).href;
  const img = document.getElementById('qr-image');
  const title = document.getElementById('qr-target-title');
  const copyBtn = document.getElementById('qr-copy-btn');
  const qrSrc = qrDataUrl(url);
  img.hidden = !qrSrc;
  img.src = qrSrc || '';
  if (!qrSrc) {
    // QR 라이브러리를 아직 못 받았으면 받은 뒤 그림을 채운다
    loadQrLibrary().then(() => {
      const lateSrc = qrDataUrl(url);
      if (lateSrc) { img.src = lateSrc; img.hidden = false; }
    });
  }
  title.textContent = `${song.title}${part ? ` · ${PARTS[part]}` : ''}`;
  copyBtn.onclick = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast('연습 주소를 복사했어요.');
      } else {
        toast('주소 복사 기능이 지원되지 않는 브라우저입니다.');
      }
    } catch {
      toast('주소 복사에 실패했습니다.');
    }
  };
  dialog.showModal();
}

let currentOctave = 4;
let metroTapTimestamps = [];
function openPitchPipe(initialBpm = null) {
  const dialog = document.getElementById('pitch-dialog');
  if (!dialog) return;

  const noteDisplay = document.getElementById('pitch-now-note');
  const freqDisplay = document.getElementById('pitch-now-freq');
  const octaveChipsHost = document.getElementById('pitch-octave-chips');
  const keyboardHost = document.getElementById('pitch-keyboard');
  const stopBtn = document.getElementById('pitch-stop-btn');
  const presetA4 = document.getElementById('pitch-preset-a4');
  const presetC4 = document.getElementById('pitch-preset-c4');

  const tunerBtn = document.getElementById('pitch-tuner-btn');
  const tunerNoteEl = document.getElementById('pitch-tuner-note');
  const tunerDetailEl = document.getElementById('pitch-tuner-detail');
  const tunerMeterEl = document.getElementById('pitch-tuner-meter');

  const metroToggleBtn = document.getElementById('pitch-metro-toggle');
  const metroBpmEl = document.getElementById('pitch-metro-bpm');
  const metroSliderEl = document.getElementById('pitch-metro-slider');
  const metroTapBtn = document.getElementById('pitch-metro-tap');
  const metroDotsEl = document.getElementById('pitch-metro-dots');

  function renderStatus(playing) {
    if (playing) {
      noteDisplay.textContent = playing.note;
      freqDisplay.textContent = `${playing.label} · ${playing.freq} Hz`;
    } else {
      noteDisplay.textContent = '소리 대기 중';
      freqDisplay.textContent = '건반을 눌러 소리를 확인하세요';
    }
  }

  function renderKeyboard() {
    keyboardHost.replaceChildren(...NOTES.map(item => {
      const freq = getNoteFrequency(item.semitone, currentOctave);
      const isCur = getCurrentPlaying()?.semitone === item.semitone && getCurrentPlaying()?.octave === currentOctave;
      const keyBtn = el('button', {
        type: 'button',
        class: `pitch-key${item.accidental ? ' accidental' : ''}${isCur ? ' active' : ''}`,
        'aria-label': `${item.note}${currentOctave} (${item.korean}) ${freq}Hz`,
        onclick: () => {
          playPitch(item.semitone, currentOctave);
          renderKeyboard();
        }
      },
        el('span', {class: 'pitch-key-note', text: item.note}),
        el('span', {class: 'pitch-key-kr', text: item.korean}),
        el('span', {class: 'pitch-key-freq', text: `${Math.round(freq)}Hz`})
      );
      return keyBtn;
    }));
  }

  function renderOctaves() {
    octaveChipsHost.replaceChildren(...OCTAVES.map(oct => {
      const chip = el('button', {
        type: 'button',
        class: `chip${currentOctave === oct.octave ? ' active' : ''}`,
        text: `${oct.octave}옥타브`,
        onclick: () => {
          currentOctave = oct.octave;
          renderOctaves();
          renderKeyboard();
        }
      });
      return chip;
    }));
  }

  function syncTunerUI() {
    if (!tunerBtn || !tunerNoteEl || !tunerDetailEl || !tunerMeterEl) return;
    const active = isVocalTunerRunning();
    tunerBtn.textContent = active ? '마이크 끄기' : '마이크 켜기';
    tunerBtn.className = `button ${active ? 'primary' : 'secondary'} small tuner-ctrl-btn`;
    if (!active) {
      tunerNoteEl.textContent = '대기 중';
      tunerDetailEl.textContent = '마이크를 켜고 소리를 내면 실시간 음정(±센트)을 알려줍니다.';
      tunerMeterEl.style.left = '50%';
      tunerMeterEl.style.width = '0%';
      tunerMeterEl.className = 'pitch-tuner-fill';
    }
  }

  if (tunerBtn) {
    tunerBtn.onclick = async () => {
      if (isVocalTunerRunning()) {
        stopVocalTuner();
        syncTunerUI();
        return;
      }
      tunerBtn.disabled = true;
      await startVocalTuner({
        onDetect: (info) => {
          if (!tunerNoteEl || !tunerDetailEl || !tunerMeterEl) return;
          if (!info) {
            tunerNoteEl.textContent = '듣는 중…';
            tunerDetailEl.textContent = '아~ 하고 일정한 목소리를 내어 보세요';
            return;
          }
          const cents = info.cents;
          const absCents = Math.abs(cents);
          const statusLabel = absCents <= 10 ? '정확 ✨' : cents < 0 ? `낮음 ♭ (${cents}c)` : `높음 ♯ (+${cents}c)`;
          tunerNoteEl.textContent = `${info.displayNote}`;
          tunerDetailEl.textContent = `${info.freq} Hz · ${statusLabel}`;
          const clamped = Math.max(-50, Math.min(50, cents));
          const pct = Math.abs(clamped);
          tunerMeterEl.style.left = clamped >= 0 ? '50%' : `${50 - pct}%`;
          tunerMeterEl.style.width = `${pct}%`;
          tunerMeterEl.className = `pitch-tuner-fill ${absCents <= 10 ? 'in-tune' : 'off-tune'}`;
        },
        onError: (msg) => {
          toast(msg);
          syncTunerUI();
        }
      });
      tunerBtn.disabled = false;
      syncTunerUI();
    };
  }

  function syncMetronomeUI(activeBeat = -1) {
    const bpm = getMetronomeBpm();
    const running = isMetronomeRunning();
    if (metroBpmEl) metroBpmEl.textContent = `${bpm} BPM`;
    if (metroSliderEl) metroSliderEl.value = String(bpm);
    if (metroToggleBtn) {
      metroToggleBtn.textContent = running ? '⏹ 박자 정지' : '▶ 박자 시작';
      metroToggleBtn.className = `button ${running ? 'primary' : 'secondary'} small metronome-ctrl-btn`;
    }
    if (metroDotsEl) {
      const dots = metroDotsEl.querySelectorAll('.metro-dot');
      dots.forEach((d, idx) => {
        d.classList.toggle('active', running && idx === activeBeat);
        d.classList.toggle('accent', running && idx === 0 && activeBeat === 0);
      });
    }
  }

  if (metroSliderEl) {
    metroSliderEl.oninput = (e) => {
      const next = setMetronomeBpm(Number(e.target.value));
      if (metroBpmEl) metroBpmEl.textContent = `${next} BPM`;
    };
  }

  if (metroToggleBtn) {
    metroToggleBtn.onclick = () => {
      if (isMetronomeRunning()) {
        stopMetronome();
        syncMetronomeUI(-1);
      } else {
        startMetronome({
          bpm: getMetronomeBpm(),
          beatsPerBar: 4,
          onBeat: (beatIdx) => syncMetronomeUI(beatIdx)
        });
        syncMetronomeUI(0);
      }
    };
  }

  if (metroTapBtn) {
    metroTapBtn.onclick = () => {
      const now = performance.now();
      metroTapTimestamps = metroTapTimestamps.filter(t => now - t < 2500);
      metroTapTimestamps.push(now);
      if (metroTapTimestamps.length >= 2) {
        const intervals = [];
        for (let i = 1; i < metroTapTimestamps.length; i++) {
          intervals.push(metroTapTimestamps[i] - metroTapTimestamps[i - 1]);
        }
        const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const tappedBpm = setMetronomeBpm(Math.round(60000 / avgMs));
        syncMetronomeUI(-1);
        toast(`⏱️ 탭 템포: ${tappedBpm} BPM`);
      } else {
        toast('박자에 맞춰 한 번 더 탭해 주세요.');
      }
    };
  }

  const unsubscribePitch = subscribePitchState((playing) => {
    renderStatus(playing);
    renderKeyboard();
  });

  if (Number.isFinite(Number(initialBpm)) && Number(initialBpm) >= 30 && !isMetronomeRunning()) {
    setMetronomeBpm(Number(initialBpm));
  }

  renderStatus(getCurrentPlaying());
  renderOctaves();
  renderKeyboard();
  syncTunerUI();
  syncMetronomeUI(-1);

  stopBtn.onclick = () => {
    stopPitch();
    stopVocalTuner();
    stopMetronome();
    syncTunerUI();
    syncMetronomeUI(-1);
  };
  presetA4.onclick = () => { currentOctave = 4; renderOctaves(); playPitch(9, 4); };
  presetC4.onclick = () => { currentOctave = 4; renderOctaves(); playPitch(0, 4); };

  dialog.addEventListener('close', () => {
    stopPitch();
    stopVocalTuner();
    stopMetronome();
    unsubscribePitch();
  }, { once: true });
  dialog.showModal();
}

function renderStartingPitchPanel(song, currentPart = null) {
  if (!song || !song.startingPitches || typeof song.startingPitches !== 'object') {
    return el('div');
  }

  // Determine parts to display
  const availParts = availableParts(song).filter(p => p !== 'full' && p !== 'vp');
  let partKeys = [];

  if (availParts.length) {
    // 영상이 없는 번호 파트도 첫 음이 등록되어 있으면 함께 표시
    const extraNumbered = Object.keys(song.startingPitches)
      .filter(k => /^part\d+$/.test(k) && !availParts.includes(k))
      .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
    partKeys = availParts.every(k => /^part\d+$/.test(k)) ? [...availParts, ...extraNumbered] : availParts;
  } else {
    // If no individual video is uploaded yet, display parts from startingPitches
    const allStartingKeys = Object.keys(song.startingPitches).filter(k => k !== 'full' && k !== 'vp');
    const numbered = allStartingKeys.filter(k => k.startsWith('part'));
    if (numbered.length) {
      partKeys = numbered.sort((a, b) => (parseInt(a.replace('part', ''), 10) || 0) - (parseInt(b.replace('part', ''), 10) || 0));
    } else {
      partKeys = allStartingKeys;
    }
  }

  const semi = getSongTranspose(song.id);
  const { voiceToPart, partToVoice, voiceHint } = getSongVoicePartMapping(song);
  const effectiveCurrentPart = (currentPart && currentPart !== 'full') ? currentPart : (songMyPart(song) || null);
  const partItems = [];
  partKeys.forEach(p => {
    let rawNote = song.startingPitches[p];
    if (!rawNote) {
      if (voiceToPart[p]) rawNote = song.startingPitches[voiceToPart[p]];
      else if (partToVoice[p]) rawNote = song.startingPitches[partToVoice[p]];
    }

    const noteStr = rawNote ? transposeNoteString(rawNote, semi) : '';
    if (noteStr) {
      const parsed = parseNoteString(noteStr);
      if (parsed) {
        let label = PARTS[p] || p.toUpperCase();
        if (voiceHint[p] && label === PARTS[p]) {
          label = `${label} (${voiceHint[p]})`;
        }
        partItems.push({
          partKey: p,
          label,
          noteStr,
          parsed
        });
      }
    }
  });

  if (!partItems.length) return el('div');

  const container = el('section', {class: 'starting-pitch-panel', 'aria-label': '파트별 첫 음 잡기'});

  // Header
  const titleWrap = el('div', {class: 'starting-pitch-title-wrap'},
    el('span', {class: 'starting-pitch-icon'}, '🎵'),
    el('div', {},
      el('h3', {class: 'starting-pitch-title', text: '파트별 첫 음'}),
      el('p', {class: 'starting-pitch-desc', text: '원곡 및 편곡 악보·영상 분석 기반 첫 음정입니다. 당일 목 상태에 맞춰 ±반음 조바꿈(이조)이 가능합니다.'})
    )
  );

  const applySongKeyChange = (nextSemi) => {
    const applied = setSongTranspose(song.id, nextSemi);
    stopPitchSequence();
    stopPitch();
    container.replaceWith(renderStartingPitchPanel(song, currentPart));
    document.querySelectorAll('[data-part-first-note]').forEach(node => {
      const pKey = node.dataset.partFirstNote;
      const updated = getTransposedPartNote(song, pKey);
      const parsedUp = updated ? parseNoteString(updated) : null;
      if (parsedUp) node.textContent = `첫 음 ${parsedUp.displayNote}`;
    });
    const dispKeyAfter = song.musicalKey ? transposeMusicalKey(song.musicalKey, applied) : '';
    toast(applied === 0
      ? `🎹 '${song.title}' 원키${dispKeyAfter ? `(${dispKeyAfter})` : ''}로 복귀했습니다.`
      : `🎹 '${song.title}' 조바꿈: ${formatTransposeBadgeText(applied)}${dispKeyAfter ? ` → ${dispKeyAfter}` : ''}`);
  };

  const transposeGroup = el('div', {class: 'pitch-transpose-group', role: 'group', 'aria-label': '반음 조바꿈(이조) 조절'},
    el('button', {
      type: 'button',
      class: 'pitch-transpose-btn',
      disabled: semi <= -6,
      title: '반음 내리기 (-1 반음)',
      onclick: () => applySongKeyChange(semi - 1)
    }, '♭ -1'),
    el('button', {
      type: 'button',
      class: `pitch-transpose-btn reset${semi !== 0 ? ' active' : ''}`,
      title: semi === 0 ? '현재 원키입니다' : '클릭하면 원키(0)로 되돌립니다',
      onclick: () => { if (semi !== 0) applySongKeyChange(0); }
    }, formatTransposeBadgeText(semi)),
    el('button', {
      type: 'button',
      class: 'pitch-transpose-btn',
      disabled: semi >= 6,
      title: '반음 올리기 (+1 반음)',
      onclick: () => applySongKeyChange(semi + 1)
    }, '♯ +1')
  );

  const displayedKey = song.musicalKey ? transposeMusicalKey(song.musicalKey, semi) : '';
  const vpSinger = song.partNames?.vp;
  const isMyVp = Boolean(vpSinger && (currentPart === 'vp' || songMyPart(song) === 'vp'));
  const metaWrap = el('div', {class: 'starting-pitch-meta'},
    displayedKey ? el('span', {class: 'pitch-key-badge', text: `${semi ? '조바꿈 조성' : '원곡/편곡 조성'}: ${displayedKey}${semi ? ` (${formatTransposeBadgeText(semi)})` : ''}`}) : null,
    transposeGroup,
    song.bpm ? el('button', {
      type: 'button',
      class: 'pitch-key-badge pitch-bpm-badge',
      title: '클릭하면 이 곡의 템포로 메트로놈을 엽니다',
      onclick: () => openPitchPipe(song.bpm)
    }, `⏱️ 템포: ♩=${song.bpm}`) : null,
    vpSinger ? el('span', {
      class: 'pitch-key-badge',
      title: '보컬퍼커션(VP) 담당 단원',
      text: `🥁 VP: ${vpSinger}${isMyVp ? ' (내 파트)' : ''}`
    }) : null
  );

  const header = el('div', {class: 'starting-pitch-header'}, titleWrap, metaWrap);
  const grid = el('div', {class: 'part-pitch-grid'});

  const allNotes = partItems.map(item => item.noteStr);

  const seqStatusBadge = el('div', {
    class: 'pitch-seq-badge',
    style: 'display: none;',
  });

  const seqBtn = el('button', {
    type: 'button',
    class: 'button primary small seq-play-btn',
    title: '악보에서 먼저 시작하는 파트 순서로 음을 잡은 후 화음으로 울려줍니다.',
    onclick: () => {
      if (isPitchSequencePlaying()) {
        stopPitchSequence();
        seqBtn.classList.remove('playing');
        seqBtn.replaceChildren(icon('play'), document.createTextNode('차례대로 듣고 화음 🎵'));
        seqStatusBadge.style.display = 'none';
        toast('⏹️ 시작음 순차 재생을 중지했습니다.');
        return;
      }

      toast('🎶 악보에서 먼저 시작하는 파트 순서로 음을 맞춘 후 전체 화음을 울려줍니다.');
      seqBtn.classList.add('playing');
      seqBtn.replaceChildren(icon('pause'), document.createTextNode('순차 재생 중지'));
      seqStatusBadge.style.display = 'flex';
      seqStatusBadge.textContent = '🎶 전 파트 시작음 시퀀스를 준비 중...';

      // 재생 순서: 악보에서 먼저 시작하는 파트 순(song.entryOrder), 없으면 2번 → 4번 → 1번 → 3번 파트
      const seqOrder = Array.isArray(song.entryOrder) && song.entryOrder.length
        ? song.entryOrder
        : ['part2', 'part4', 'part1', 'part3'];
      const voiceToPartKey = { soprano: 'part1', alto: 'part2', tenor: 'part3', baritone: 'part4', bass: 'part5' };
      const rank = (item) => {
        const idx = seqOrder.indexOf(voiceToPartKey[item.partKey] || item.partKey);
        return idx === -1 ? seqOrder.length : idx;
      };
      const orderedItems = [...partItems].sort((a, b) => rank(a) - rank(b));

      playPitchSequence(orderedItems, {
        keepOrder: true,
        noteDuration: 900,
        gapDuration: 150,
        chordDuration: 2800,
        onStep: (step) => {
          if (step.type === 'note') {
            seqStatusBadge.textContent = `🎵 [${step.index + 1}/${step.total}] ${step.label} (${step.parsed.displayNote} · ${step.parsed.koreanNote}) 울림 중...`;
            updateActiveStates();
          } else if (step.type === 'chord') {
            seqStatusBadge.textContent = `✨ 전체 성부 화음 합창 (${step.notes.join(' · ')})! 함께 화음을 맞춰보세요.`;
            updateActiveStates();
          } else if (step.type === 'finish') {
            seqBtn.classList.remove('playing');
            seqBtn.replaceChildren(icon('play'), document.createTextNode('차례대로 듣고 화음 🎵'));
            seqStatusBadge.style.display = 'none';
            updateActiveStates();
          }
        }
      });
    }
  }, icon('play'), el('span', {text: '차례대로 듣고 화음 🎵'}));

  const chordBtn = el('button', {
    type: 'button',
    class: 'button secondary small chord-play-btn',
    text: '🎶 첫음 화음 전체 듣기',
    onclick: () => {
      if (isPitchSequencePlaying()) {
        stopPitchSequence();
      }
      const playing = playChordStrings(allNotes);
      if (playing) {
        toast('🎶 전체 파트 첫 음 화음을 재생합니다.');
      }
    }
  });

  const stopBtn = el('button', {
    type: 'button',
    class: 'button ghost small stop-pitch-btn',
    text: '⏹️ 소리 끄기',
    onclick: () => {
      stopPitch();
      if (isPitchSequencePlaying()) {
        stopPitchSequence();
      }
    }
  });

  const pipeBtn = el('button', {
    type: 'button',
    class: 'button ghost small',
    text: '🎛️ 전체 피치파이프 열기',
    onclick: () => {
      openPitchPipe(song.bpm);
    }
  });

  const actions = el('div', {class: 'starting-pitch-actions'},
    el('div', {class: 'pitch-action-left'}, seqBtn, chordBtn, stopBtn),
    el('div', {class: 'pitch-action-right'}, pipeBtn)
  );

  function updateActiveStates() {
    const cur = getCurrentPlaying();
    const isChord = Boolean(cur?.isChord);
    const seq = getCurrentSequence();

    chordBtn.classList.toggle('playing', isChord && !seq);

    partItems.forEach(({ partKey, parsed }, idx) => {
      const chip = grid.children[idx];
      if (!chip) return;
      let isActive = false;
      if (seq) {
        if (seq.isChordPhase || isChord) {
          isActive = true;
        } else if (seq.currentItem) {
          isActive = seq.currentItem.partKey ? seq.currentItem.partKey === partKey : (cur && cur.semitone === parsed.semitone && cur.octave === parsed.octave);
        }
      } else if (isChord) {
        isActive = cur.notes?.includes(parsed.displayNote);
      } else if (cur) {
        isActive = cur.semitone === parsed.semitone && cur.octave === parsed.octave;
      }
      chip.classList.toggle('playing', Boolean(isActive));
    });
  }

  partItems.forEach(({ partKey, label, noteStr, parsed }) => {
    const singer = song.partNames?.[partKey] || song.partNames?.[voiceToPart[partKey]] || song.partNames?.[partToVoice[partKey]] || '';
    const isCur = Boolean(effectiveCurrentPart && (
      effectiveCurrentPart === partKey ||
      voiceToPart[effectiveCurrentPart] === partKey ||
      partToVoice[effectiveCurrentPart] === partKey
    ));

    const chip = el('button', {
      type: 'button',
      class: `part-pitch-chip${isCur ? ' current-part' : ''}`,
      'aria-label': `${label}${singer ? ` ${singer}` : ''} 첫 음 ${parsed.displayNote} (${parsed.koreanNote}) ${Math.round(parsed.freq)}Hz`,
      onclick: () => {
        const played = playNoteString(noteStr);
        if (played) {
          toast(`🎵 ${label} 첫 음 ${parsed.displayNote} (${parsed.koreanNote})`);
        }
      }
    },
      isCur ? el('span', {class: 'current-part-pill', text: '내 파트'}) : null,
      el('span', {class: 'part-pitch-role', text: label}),
      singer ? el('span', {class: 'part-pitch-singer', text: singer}) : null,
      el('span', {class: 'part-pitch-note', text: parsed.displayNote}),
      el('span', {class: 'part-pitch-solfege', text: parsed.koreanNote}),
      el('span', {class: 'part-pitch-freq', text: `${Math.round(parsed.freq)}Hz`})
    );

    grid.append(chip);
  });

  const unsubscribe = subscribePitchState(() => {
    if (!container.isConnected) {
      unsubscribe();
      return;
    }
    updateActiveStates();
  });

  updateActiveStates();

  container.append(header, grid, seqStatusBadge, actions);
  return container;
}

function renderPlayerController(player, song, part) {
  let currentRate = 1.0;
  let isPlaying = false;

  const rewindBtn = button('5초 뒤로', () => {
    player.seekRelative(-5);
    toast('⏪ 5초 뒤로 이동');
  }, 'practice-btn-big', 'rewind', {'aria-label': '5초 뒤로 되감기'});

  const playBtn = button('재생 / 정지', () => {
    player.togglePlay();
  }, 'practice-btn-big primary-play', 'play', {'aria-label': '재생 또는 일시정지'});

  const forwardBtn = button('5초 앞으로', () => {
    player.seekRelative(5);
    toast('⏩ 5초 앞으로 이동');
  }, 'practice-btn-big', 'fastforward', {'aria-label': '5초 앞으로 넘기기'});

  const repeatBtn = button('5초 복습', () => {
    player.seekRelative(-5);
    player.play();
    toast('🔄 이전 5초 구간 다시 재생');
  }, 'practice-btn-big', 'repeat', {'aria-label': '이전 5초 구간 다시 재생'});

  const controlRow = el('div', {class: 'practice-control-row'},
    rewindBtn, playBtn, forwardBtn, repeatBtn
  );

  const speedOptions = [
    { rate: 0.75, label: '0.75x 느리게' },
    { rate: 0.9, label: '0.9x' },
    { rate: 1.0, label: '1.0x 보통' },
    { rate: 1.25, label: '1.25x 빠르게' }
  ];
  const speedGroup = el('div', {class: 'practice-speed-group'},
    el('span', {class: 'practice-speed-label', text: '재생 배속:'}),
    ...speedOptions.map(opt => {
      const chip = el('button', {
        type: 'button',
        class: `practice-rate-chip${currentRate === opt.rate ? ' active' : ''}`,
        text: opt.label,
        onclick: () => {
          currentRate = opt.rate;
          player.setRate(opt.rate);
          for (const c of speedGroup.querySelectorAll('.practice-rate-chip')) {
            c.classList.toggle('active', c === chip);
          }
          toast(`재생 배속: ${opt.rate}x`);
        }
      });
      return chip;
    })
  );

  const landscapeBtn = button('가로 확대', () => player.toggleLandscape?.(), 'text-button practice-pitch-btn', 'presentation', {'aria-label': '영상 가로로 확대해서 크게 보기'});
  const pocketBtn = button('화면 절전', () => player.enterPocketMode?.(), 'text-button practice-pitch-btn', 'eye', {'aria-label': '화면 잠금 및 주머니 절전 모드'});
  const pitchBtn = button('첫 음 잡기 (피치파이프)', () => openPitchPipe(song?.bpm), 'text-button practice-pitch-btn', 'music');
  const subrowRight = el('div', {style: 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap;'}, landscapeBtn, pocketBtn, pitchBtn);
  const subrow = el('div', {class: 'practice-subrow'}, speedGroup, subrowRight);

  // --- A-B Section Loop (구간 반복 연습) ---
  const loopStatusBadge = el('span', {class: 'loop-status-badge', text: '구간 미설정'});
  const loopStartTime = el('span', {class: 'loop-time-tag', text: '--:--'});
  const loopEndTime = el('span', {class: 'loop-time-tag', text: '--:--'});

  const loopToggleBtn = el('button', {
    type: 'button',
    class: 'loop-btn-toggle',
    'data-loop-action': 'toggle',
    'aria-label': 'A-B 구간 반복 켜기 또는 끄기',
    'aria-pressed': 'false',
    onclick: () => {
      const active = looper.toggleLoop();
      const st = looper.getState();
      if (active) {
        toast(`🔁 구간 반복 시작: ${formatPlayerTime(st.loopStart)} ~ ${formatPlayerTime(st.loopEnd)}`);
      } else {
        toast('⏹️ 구간 반복을 껐습니다.');
      }
    }
  }, icon('repeat'), '구간 반복');

  const looper = createSectionLooper(player, {
    onStateChange: (st) => {
      const { loopStart, loopEnd, isLooping, duration } = st;
      loopStartTime.textContent = formatPlayerTime(loopStart);
      loopEndTime.textContent = formatPlayerTime(loopEnd);

      loopToggleBtn.classList.toggle('active', isLooping);
      loopToggleBtn.setAttribute('aria-pressed', String(isLooping));
      loopToggleBtn.replaceChildren(
        icon('repeat'),
        document.createTextNode(isLooping ? '반복 중' : '구간 반복')
      );

      if (isLooping) {
        loopStatusBadge.className = 'loop-status-badge active';
        loopStatusBadge.textContent = `🔁 ${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)} (${Math.round(duration)}초 반복 중)`;
      } else if (loopStart !== null || loopEnd !== null) {
        loopStatusBadge.className = 'loop-status-badge ready';
        loopStatusBadge.textContent = `구간: ${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)}${duration ? ` (${Math.round(duration)}초)` : ''}`;
      } else {
        loopStatusBadge.className = 'loop-status-badge';
        loopStatusBadge.textContent = '구간 미설정';
      }
    }
  });

  const setStartBtn = el('button', {
    type: 'button',
    class: 'loop-point-btn',
    'data-loop-action': 'start',
    'aria-label': '현재 재생 위치를 구간 시작점으로 설정',
    onclick: () => {
      const s = looper.setStart();
      toast(`📍 A 시작점: ${formatPlayerTime(s)} 설정`);
    }
  }, '📍 A 시작점');

  const nudgeStartMinus = el('button', {
    type: 'button',
    class: 'loop-nudge-btn',
    'aria-label': '시작점 1초 뒤로',
    onclick: () => {
      const s = looper.nudgeStart(-1);
      toast(`📍 A 시작점: ${formatPlayerTime(s)} (1초 뒤로)`);
    }
  }, '-1s');

  const nudgeStartPlus = el('button', {
    type: 'button',
    class: 'loop-nudge-btn',
    'aria-label': '시작점 1초 앞으로',
    onclick: () => {
      const s = looper.nudgeStart(1);
      toast(`📍 A 시작점: ${formatPlayerTime(s)} (1초 앞으로)`);
    }
  }, '+1s');

  const setEndBtn = el('button', {
    type: 'button',
    class: 'loop-point-btn',
    'data-loop-action': 'end',
    'aria-label': '현재 재생 위치를 구간 끝점으로 설정',
    onclick: () => {
      const e = looper.setEnd();
      toast(`🏁 B 끝점: ${formatPlayerTime(e)} 설정`);
    }
  }, '🏁 B 끝점');

  const nudgeEndMinus = el('button', {
    type: 'button',
    class: 'loop-nudge-btn',
    'aria-label': '끝점 1초 뒤로',
    onclick: () => {
      const e = looper.nudgeEnd(-1);
      toast(`🏁 B 끝점: ${formatPlayerTime(e)} (1초 뒤로)`);
    }
  }, '-1s');

  const nudgeEndPlus = el('button', {
    type: 'button',
    class: 'loop-nudge-btn',
    'aria-label': '끝점 1초 앞으로',
    onclick: () => {
      const e = looper.nudgeEnd(1);
      toast(`🏁 B 끝점: ${formatPlayerTime(e)} (1초 앞으로)`);
    }
  }, '+1s');

  const jumpStartBtn = el('button', {
    type: 'button',
    class: 'loop-btn-sub',
    'aria-label': '시작점 A로 바로 이동',
    onclick: () => {
      const st = looper.getState();
      if (st.loopStart === null) {
        toast('시작점(A)을 먼저 설정해 주세요.');
        return;
      }
      looper.jumpToStart();
      toast(`⏮️ A 시작점(${formatPlayerTime(st.loopStart)})으로 이동`);
    }
  }, '⏮️ A로 점프');

  const clearLoopBtn = el('button', {
    type: 'button',
    class: 'loop-btn-sub ghost',
    'aria-label': '설정된 반복 구간 해제',
    onclick: () => {
      looper.clear();
      toast('구간 설정을 해제했습니다.');
    }
  }, '✕ 해제');

  const preset5Btn = el('button', {
    type: 'button',
    class: 'loop-preset-chip',
    'aria-label': '현재 위치부터 5초 구간 반복',
    onclick: () => {
      const { loopStart, loopEnd } = looper.setQuickPreset(5);
      toast(`⚡ 5초 구간 반복 시작 (${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)})`);
    }
  }, '⚡ 5초');

  const preset10Btn = el('button', {
    type: 'button',
    class: 'loop-preset-chip',
    'aria-label': '현재 위치부터 10초 구간 반복',
    onclick: () => {
      const { loopStart, loopEnd } = looper.setQuickPreset(10);
      toast(`⚡ 10초 구간 반복 시작 (${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)})`);
    }
  }, '⚡ 10초');

  const preset15Btn = el('button', {
    type: 'button',
    class: 'loop-preset-chip',
    'aria-label': '현재 위치부터 15초 구간 반복',
    onclick: () => {
      const { loopStart, loopEnd } = looper.setQuickPreset(15);
      toast(`⚡ 15초 구간 반복 시작 (${formatPlayerTime(loopStart)} ~ ${formatPlayerTime(loopEnd)})`);
    }
  }, '⚡ 15초');

  const getSongSavedLoops = () => {
    const all = object(read('savedLoops', {}));
    return array(all[song.id]).filter(it => it && Number.isFinite(it.start) && Number.isFinite(it.end) && it.end > it.start);
  };
  const setSongSavedLoops = (list) => {
    const all = {...object(read('savedLoops', {}))};
    if (list.length) all[song.id] = list;
    else delete all[song.id];
    write('savedLoops', all);
  };

  const loopCountBadge = el('span', {class: 'practice-accordion-badge'});
  const loopBookmarksBar = el('div', {class: 'loop-bookmarks-bar'});
  function renderLoopBookmarks() {
    const items = getSongSavedLoops();
    loopCountBadge.textContent = items.length ? `저장 ${items.length}개` : 'A-B 집중 반복';
    if (!items.length) {
      loopBookmarksBar.hidden = true;
      loopBookmarksBar.replaceChildren();
      return;
    }
    loopBookmarksBar.hidden = false;
    loopBookmarksBar.replaceChildren(
      el('span', {class: 'loop-bookmark-label', text: '📌 저장 구간:'}),
      ...items.map(bm => el('span', {class: 'loop-bookmark-chip'},
        el('button', {
          type: 'button',
          class: 'loop-bookmark-play',
          title: `${bm.label} (${formatPlayerTime(bm.start)} ~ ${formatPlayerTime(bm.end)}) 구간 반복 재생`,
          onclick: () => {
            looper.setStart(bm.start);
            looper.setEnd(bm.end);
            if (!looper.getState().isLooping) looper.toggleLoop();
            else looper.jumpToStart();
            player.play();
            toast(`🔁 [${bm.label}] (${formatPlayerTime(bm.start)} ~ ${formatPlayerTime(bm.end)}) 구간 반복 시작`);
          }
        }, `${bm.label} (${formatPlayerTime(bm.start)}~${formatPlayerTime(bm.end)})`),
        el('button', {
          type: 'button',
          class: 'loop-bookmark-del',
          'aria-label': `${bm.label} 저장 구간 삭제`,
          title: '저장 구간 삭제',
          onclick: () => {
            setSongSavedLoops(getSongSavedLoops().filter(x => x.id !== bm.id));
            renderLoopBookmarks();
            toast(`'${bm.label}' 저장 구간을 삭제했습니다.`);
          }
        }, '×')
      ))
    );
  }

  const saveLoopBtn = el('button', {
    type: 'button',
    class: 'loop-btn-sub',
    'aria-label': '현재 설정된 A-B 구간을 북마크로 저장',
    onclick: () => {
      let st = looper.getState();
      if (st.loopStart === null || st.loopEnd === null) {
        looper.setQuickPreset(10);
        st = looper.getState();
      }
      const existing = getSongSavedLoops();
      const defaultName = `집중 구간 ${existing.length + 1}`;
      const rawLabel = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt('저장할 연습 구간 이름을 입력해 주세요 (예: 후렴 화음, 전조 구간):', defaultName)
        : defaultName;
      if (rawLabel === null) return;
      const label = rawLabel.trim() || defaultName;
      const entry = {
        id: `lp-${Date.now().toString(36)}`,
        label,
        start: st.loopStart,
        end: st.loopEnd
      };
      setSongSavedLoops([...existing, entry]);
      renderLoopBookmarks();
      toast(`💾 [${label}] (${formatPlayerTime(entry.start)} ~ ${formatPlayerTime(entry.end)}) 구간을 저장했습니다!`);
    }
  }, '💾 구간 저장');

  renderLoopBookmarks();

  const loopPanel = el('div', {class: 'practice-loop-panel', role: 'region', 'aria-label': '구간 반복 연습 (A-B Loop)'},
    el('div', {class: 'practice-loop-header'},
      el('div', {class: 'practice-loop-title-box'},
        loopStatusBadge
      ),
      el('div', {class: 'practice-loop-presets'},
        el('span', {class: 'loop-preset-label', text: '빠른 반복:'}),
        preset5Btn, preset10Btn, preset15Btn
      )
    ),
    el('div', {class: 'practice-loop-body'},
      el('div', {class: 'loop-controls-left'},
        el('div', {class: 'loop-point-unit'},
          setStartBtn,
          loopStartTime,
          nudgeStartMinus,
          nudgeStartPlus
        ),
        el('span', {class: 'loop-separator', text: '~'}),
        el('div', {class: 'loop-point-unit'},
          setEndBtn,
          loopEndTime,
          nudgeEndMinus,
          nudgeEndPlus
        )
      ),
      el('div', {class: 'loop-controls-right'},
        loopToggleBtn,
        saveLoopBtn,
        jumpStartBtn,
        clearLoopBtn
      )
    ),
    loopBookmarksBar
  );

  const loopAccordion = el('details', {
    class: 'practice-accordion practice-loop-accordion',
    open: typeof window !== 'undefined' ? window.innerWidth > 900 : false
  },
    el('summary', {class: 'practice-accordion-summary'},
      el('span', {class: 'practice-accordion-title'}, icon('repeat'), el('strong', {text: '구간 반복 연습 (A-B)'}), loopCountBadge),
      el('span', {class: 'practice-accordion-chevron', 'aria-hidden': 'true'}, icon('chevron-down'))
    ),
    el('div', {class: 'practice-accordion-body'}, loopPanel)
  );

  // 큰 버튼 모드: 악보를 보며 한 손으로 조작할 수 있게 핵심 버튼 4개를 화면 아래에 고정
  const targetPitchPart = (part && part !== 'full') ? part : (songMyPart(song) || part);
  const hasMyFirst = Boolean(getTransposedPartNote(song, targetPitchPart));
  const bigPlayBtn = button('재생', () => player.togglePlay(), 'big-bar-btn primary', 'play', {'aria-label': '재생 또는 일시정지'});
  const bigLoopBtn = button('구간 반복', () => { loopToggleBtn.click(); bigLoopBtn.classList.toggle('active', Boolean(looper.getState().isLooping)); }, 'big-bar-btn', 'repeat', {'aria-label': '구간 반복 켜기/끄기'});
  const bigBar = el('div', {class: 'big-practice-bar', role: 'toolbar', 'aria-label': '큰 버튼 연습 모드', hidden: true},
    button('5초 뒤로', () => { player.seekRelative(-5); }, 'big-bar-btn', 'rewind', {'aria-label': '5초 뒤로'}),
    bigPlayBtn,
    bigLoopBtn,
    button('첫 음', () => {
      const curFirst = getTransposedPartNote(song, targetPitchPart);
      if (curFirst && playNoteString(curFirst)) {
        toast(`🎵 ${PARTS[targetPitchPart] || targetPitchPart} 첫 음 ${parseNoteString(curFirst)?.displayNote || curFirst}`);
      } else {
        toast('등록된 첫 음이 없습니다.');
      }
    }, 'big-bar-btn', 'music', {'aria-label': '내 파트 첫 음 듣기', disabled: !hasMyFirst}),
    button('', () => setBigMode(false), 'big-bar-close', 'close', {'aria-label': '큰 버튼 모드 끄기'})
  );
  async function setBigMode(on) {
    bigBar.hidden = !on;
    document.body.classList.toggle('big-practice-on', on);
    bigModeBtn.classList.toggle('active', on);
    bigModeBtn.setAttribute('aria-pressed', String(on));
    write('bigPracticeMode', on);
    if (on && !isWakeLockActive()) await requestWakeLock();
  }
  const bigModeBtn = button('큰 버튼 모드', () => setBigMode(bigBar.hidden), 'button secondary small big-mode-toggle', 'presentation', {'aria-pressed': 'false', 'aria-label': '큰 버튼 연습 모드 (화면 켜짐 유지)'});

  const panel = el('div', {class: 'practice-controller-panel', role: 'region', 'aria-label': '연습 플레이어 컨트롤러'},
    el('div', {class: 'big-mode-row'}, bigModeBtn), controlRow, subrow, loopAccordion
  );
  // 고정 바는 body에 붙여야 부모 transform 영향 없이 화면 하단에 고정됨
  document.querySelectorAll('.big-practice-bar').forEach(n => n.remove());
  document.body.append(bigBar);
  if (read('bigPracticeMode', false) === true) setTimeout(() => { if (panel.isConnected) setBigMode(true); }, 0);
  const bodyObserver = new MutationObserver(() => { if (!panel.isConnected) { document.body.classList.remove('big-practice-on'); bigBar.remove(); bodyObserver.disconnect(); } });
  bodyObserver.observe(document.getElementById('app') || document.body, {childList: true});

  player.onStateChange(st => {
    isPlaying = st.isPlaying;
    currentRate = st.currentRate;
    playBtn.replaceChildren(icon(isPlaying ? 'pause' : 'play'), document.createTextNode(isPlaying ? '일시정지' : '재생'));
    bigPlayBtn.replaceChildren(icon(isPlaying ? 'pause' : 'play'), el('span', {text: isPlaying ? '일시정지' : '재생'}));
    bigLoopBtn.classList.toggle('active', Boolean(looper.getState().isLooping));
    looper.checkTick();
    if (!panel.isConnected) {
      looper.destroy();
    }
  });

  return panel;
}

function renderDetail(song) {
  const parts = availableParts(song);
  const preferred = preferredPart(song, state.myPart);
  const songPerformances = getPerformancesForSong(state.performances, song.id);
  const songRehearsals = getRehearsalsForSong(state.rehearsals, song.id);
  const songScores = getScoresForSong(state.scores, song.id);
  const songAppreciations = getAppreciationForSong(state.appreciation, song.id);

  app.append(button('목록으로', () => navigate({tab: 'songs'}), 'text-button back-button', 'back'));
  const detail = el('div', {class: 'detail-layout no-cover'},
    el('div', {class: 'detail-content'}, el('p', {class: 'eyebrow', text: 'FIND YOUR VOICE'}), el('h1', {text: song.title}), el('p', {class: 'detail-artist', text: song.artist || '아티스트 미등록'}),
      el('div', {class: 'detail-meta'}, [song.category, levels[song.difficulty], song.arrangement, song.duration ? `⏱ ${song.duration}` : null, song.bpm ? `♩=${song.bpm} BPM` : null, statuses[song.status]].filter(Boolean).map(text => el('span', {class: 'badge', text}))),
      song.openingCue ? el('p', {class: 'detail-opening-cue', text: `🎤 첫 소절 큐: "${song.openingCue}"`}) : null,
      el('div', {class: 'tag-list'}, array(song.tags).map(tag => el('span', {class: 'tag', text: `#${tag}`}))),
      el('div', {class: 'detail-actions'},
        favoriteButton(song),
        button(song.status === 'practice' ? '현재 연습에서 비우기' : '현재 연습에 추가', () => togglePracticeStatus(song), song.status === 'practice' ? 'button secondary' : 'button primary', song.status === 'practice' ? 'close' : 'plus'),
        button('QR 코드', () => showQR(song), 'button secondary', 'qr'),
        button('곡 공유', () => share(song), 'button secondary', 'share'),
        button('영상 / 정보 수정', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'button secondary', 'external'),
        songScores.length ? button(`악보 창고 (${songScores.length})`, () => {
          state.scoreFilters.songId = song.id;
          navigate({tab: 'scores'});
        }, 'button secondary', 'document') : null,
        songPerformances.length ? button(`무대 영상 (${songPerformances.length})`, () => navigate({tab: 'stage'}), 'button secondary', 'stage') : null,
        songRehearsals.length ? button(`연습 일지 & 피드백 (${songRehearsals.length})`, () => {
          state.rehearsalFilters = { query: '', songId: song.id };
          navigate({tab: 'rehearsal'});
        }, 'button secondary', 'notes') : null,
        songAppreciations.length ? button(`감상 레퍼런스 (${songAppreciations.length})`, () => {
          state.appreciationFilters.query = song.title;
          navigate({tab: 'appreciation'});
        }, 'button secondary', 'video') : null
      )
    )
  );
  app.append(detail);
  app.append(renderMasteryControlPanel(song));
  const myPartHere = songMyPart(song);
  if (myPartHere && parts.includes(myPartHere)) app.append(el('section', {class: 'my-part-callout'}, el('p', {class: 'eyebrow', text: 'MY PART'}), button(`${PARTS[myPartHere]}${song.partNames?.[myPartHere] ? ` · ${song.partNames[myPartHere]}` : ''} 바로 연습`, () => startPractice(song, myPartHere), 'button primary', 'play')));
  // 내 파트를 맨 앞에, 카드마다 담당자 이름과 첫 음 표시
  const orderedParts = myPartHere && parts.includes(myPartHere) ? [myPartHere, ...parts.filter(p => p !== myPartHere)] : parts;
  const partsSection = section('파트를 선택해 주세요', '내 목소리를 하나씩 쌓아가요', parts.length ? el('div', {class: 'part-grid'}, orderedParts.map(part => {
    const singer = song.partNames?.[part];
    const first = part === 'full' ? null : parseNoteString(getTransposedPartNote(song, part));
    const isMine = part === myPartHere;
    return button(
      [el('strong', {text: PARTS[part]}),
        singer ? el('span', {class: 'part-singer', text: singer}) : null,
        el('span', {class: 'part-subtitle', text: isMine ? 'MY PART · 바로 연습' : part === 'full' ? '모든 목소리를 함께' : '파트별 연습'}),
        first ? el('span', {class: 'part-first-note', 'data-part-first-note': part, text: `첫 음 ${first.displayNote}`}) : null,
        icon('play')],
      () => startPractice(song, part), `part-button${isMine ? ' my-part' : ''}`,
      null, {'aria-label': `${PARTS[part]}${singer ? ` ${singer}` : ''} ${isMine ? '내 파트 ' : ''}연습 시작${first ? `, 첫 음 ${first.displayNote}` : ''}`}
    );
  })) : emptyState('아직 등록된 연습 영상이 없습니다.', '데이터 편집기에서 파트별 YouTube 주소를 등록해 주세요.', button('영상 등록하기', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'button secondary')),
  button('+ 영상 추가 / 수정', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'text-button', 'external'));
  app.append(partsSection);
  // 파트 선택 바로 아래에 파트별 첫 음
  app.append(renderStartingPitchPanel(song, myPartHere || null));

  if (songScores.length) {
    app.append(section('이 곡의 악보', '총보 및 파트보 악보를 바로 열람하거나 다운로드하세요.',
      el('div', {class: 'score-grid'}, songScores.map(sc => {
        const formatLabel = getScoreFormatLabel(sc);
        return el('article', {class: 'score-card', style: 'padding: 16px;'},
          el('div', {class: 'score-top'},
            el('div', {class: 'score-icon-badge'}, icon('document')),
            el('div', {class: 'score-info'},
              sc.year && el('span', {class: 'badge', style: 'margin-right: 4px; font-weight: 600; background: var(--brand-tint, rgba(25,77,70,0.08)); color: var(--brand);', text: `${sc.year}년`}),
              el('span', {class: 'badge', text: sc.category || '총보'}),
              sc.part && sc.part !== 'all' && el('span', {class: 'badge status-badge', style: 'margin-left: 4px;', text: PARTS[sc.part] || sc.part}),
              el('h3', {style: 'font-size: 15px; font-weight: 700; margin: 4px 0;', text: sc.title}),
              el('p', {style: 'font-size: 11px; color: var(--muted);', text: `${sc.fileSize ? `${sc.fileSize} · ` : ''}${formatLabel}`})
            )
          ),
          el('div', {class: 'score-actions', style: 'margin-top: 8px;'},
            button('악보 열기', () => openOrDownloadScore(sc, false), 'button primary small', 'external'),
            button('다운로드', () => openOrDownloadScore(sc, true), 'button secondary small', 'download'),
            sc.driveUrl ? button('드라이브 ↗', () => window.open(sc.driveUrl, '_blank', 'noopener,noreferrer'), 'button ghost small') : null
          )
        );
      }))
    ));
  }

  if (songAppreciations.length) {
    app.append(section('이 곡의 레퍼런스 감상 영상', '국내외 아카펠라 팀의 커버·공연 레퍼런스를 보며 해석과 밸런스를 참고해 보세요.',
      el('div', {class: 'score-grid'}, songAppreciations.map(vid => {
        return el('article', {class: 'score-card', style: 'padding: 16px;'},
          el('div', {class: 'score-top'},
            el('div', {class: 'score-icon-badge'}, icon('play')),
            el('div', {class: 'score-info'},
              vid.category && el('span', {class: 'badge', style: 'margin-right: 4px;', text: vid.category}),
              vid.artist && el('span', {class: 'badge status-badge', text: vid.artist}),
              el('h3', {style: 'font-size: 15px; font-weight: 700; margin: 4px 0;', text: vid.title}),
              vid.description ? el('p', {style: 'font-size: 11.5px; color: var(--muted);', text: vid.description}) : null
            )
          ),
          el('div', {class: 'score-actions', style: 'margin-top: 8px;'},
            button('인앱 영상 재생', () => openMemoryLightboxModal(vid), 'button primary small', 'play'),
            vid.videoUrl ? button('YouTube ↗', () => window.open(vid.videoUrl, '_blank', 'noopener,noreferrer'), 'button secondary small', 'external') : null
          )
        );
      }))
    ));
  }

  const invalid = Object.entries(object(song.videos)).filter(([, media]) => media?.url?.trim() && !parseYouTube(media).ok);
  if (invalid.length) app.append(el('p', {class: 'notice warning', text: `${invalid.map(([part]) => PARTS[part] || part).join(', ')} 영상 주소를 확인해 주세요. 올바른 YouTube 주소가 아니어서 연습 버튼을 표시하지 않았습니다.`}));
  app.append(section('연습 메모', '우리 팀이 기억해 두면 좋은 것들', el('div', {class: 'memo-panel', text: song.memo || '아직 등록된 메모가 없어요.'})));
}

async function share(song, part = null) {
  const url = routeUrl({song: song.id, part}).href;
  if (navigator.share) {
    try { await navigator.share({title: `${song.title}${part ? ` · ${PARTS[part]}` : ''} | AcaRaca`, url}); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); toast('연습 링크를 복사했어요.'); return; } catch { /* selectable fallback below */ }
  }
  const dialog = document.getElementById('share-dialog'); const input = document.getElementById('share-url'); input.value = url;
  dialog.showModal(); input.focus(); input.select();
}

function recordPractice(song, part) {
  state.recent = [{songId: song.id, part, timestamp: Date.now()}, ...validRecent().filter(record => !(record.songId === song.id && record.part === part))].slice(0, 10);
  write('recent', state.recent);
}

function renderVoiceRecorderPanel(song, part) {
  let mediaStream = null;
  let recorder = null;
  let chunks = [];
  let recordedBlob = null;
  let recordedUrl = null;
  let timerId = null;
  let elapsedSec = 0;
  let disposed = false; // 화면을 떠난 뒤 늦게 도착하는 녹음 완료(onstop)는 무시

  const timerBadge = el('span', { class: 'voice-rec-timer', text: '0:00' });
  const previewWrap = el('div', { class: 'voice-rec-preview' });

  const stopStream = () => {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  };

  const recBtn = button('🔴 내 목소리 셀프 녹음', async () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('이 브라우저에서는 마이크 녹음을 지원하지 않습니다.');
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mimeType = pickSupportedAudioMime();
      recorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      elapsedSec = 0;
      timerBadge.textContent = '0:00';
      timerBadge.classList.add('recording');
      recBtn.textContent = '⏹ 녹음 정지';
      recBtn.className = 'button danger small';

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        stopStream();
        if (disposed) return;
        timerBadge.classList.remove('recording');
        recBtn.textContent = '🔴 다시 셀프 녹음';
        recBtn.className = 'button secondary small';
        if (!chunks.length) return;
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const type = recorder?.mimeType || mimeType || 'audio/webm';
        recordedBlob = new Blob(chunks, { type });
        recordedUrl = URL.createObjectURL(recordedBlob);
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const dateStr = localDateString();
        const fileBase = `${song.title}_${PARTS[part] || part}_셀프녹음_${dateStr}.${ext}`;

        const audioEl = el('audio', { controls: true, src: recordedUrl, class: 'voice-rec-audio' });
        activeAudios.add(audioEl);

        const downloadBtn = button('💾 파일 저장', () => {
          const a = el('a', { href: recordedUrl, download: fileBase });
          document.body.append(a);
          a.click();
          a.remove();
          toast('💾 셀프 녹음 파일을 저장했습니다.');
        }, 'button secondary small', 'download');

        const saveRehBtn = button('📋 연습 일지에 등록', async () => {
          if (!recordedBlob) return;
          saveRehBtn.disabled = true;
          saveRehBtn.textContent = '저장 중...';
          try {
            const file = new File([recordedBlob], fileBase, { type });
            const mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            await saveMediaFile(mediaId, file);
            const rehId = `reh-self-${Date.now()}`;
            addCustomRehearsal({
              id: rehId,
              songId: song.id,
              title: `${song.title} · ${PARTS[part] || part} 셀프 녹음 (${dateStr})`,
              date: dateStr,
              notes: `${PARTS[part] || part} 파트 개인 연습 셀프 녹음본 (${formatPlayerTime(elapsedSec)})`,
              isCustom: true
            });
            attachMediaToRehearsal(rehId, {
              mediaId,
              isVideo: false,
              fileName: file.name
            });
            state.rehearsals = await loadRehearsals(true);
            saveRehBtn.textContent = '✓ 일지 등록됨';
            toast('🎙️ 셀프 녹음본을 연습 일지에 등록했습니다!');
          } catch (err) {
            saveRehBtn.disabled = false;
            saveRehBtn.textContent = '📋 연습 일지에 등록';
            toast('저장 중 오류가 발생했습니다: ' + err.message);
          }
        }, 'button primary small');

        previewWrap.replaceChildren(
          audioEl,
          el('div', { class: 'voice-rec-save-actions' }, downloadBtn, saveRehBtn)
        );
        toast('🎧 녹음이 완료되었습니다. 바로 재생해 음정과 박자를 확인해 보세요!');
      };

      recorder.start(250);
      timerId = setInterval(() => {
        elapsedSec += 1;
        timerBadge.textContent = formatPlayerTime(elapsedSec);
      }, 1000);
      toast('🎙️ 마이크 녹음을 시작했습니다. 파트 영상을 들으며 노래해 보세요.');
    } catch {
      stopStream();
      toast('마이크 권한을 허용해 주세요.');
    }
  }, 'button primary small', 'mic');

  const panel = el('details', { class: 'practice-accordion voice-recorder-panel', 'aria-label': '내 목소리 셀프 녹음기' },
    el('summary', { class: 'practice-accordion-summary' },
      el('span', { class: 'practice-accordion-title' },
        icon('mic'),
        el('strong', { text: '내 목소리 셀프 녹음 · 즉시 모니터' }),
        el('span', { class: 'practice-accordion-badge', text: '마이크 점검' })
      ),
      el('span', { class: 'practice-accordion-chevron', 'aria-hidden': 'true' }, icon('chevron-down'))
    ),
    el('div', { class: 'practice-accordion-body' },
      el('div', { class: 'voice-rec-header' },
        el('p', { class: 'voice-rec-desc', text: '이어폰으로 파트 가이드를 들으며 내 목소리를 녹음해 음정·호흡·박자를 바로 점검하세요.' }),
        el('div', { class: 'voice-rec-controls-row' }, recBtn, timerBadge)
      ),
      previewWrap
    )
  );

  const observer = new MutationObserver(() => {
    if (!panel.isConnected) {
      disposed = true;
      stopStream();
      if (recordedUrl) { URL.revokeObjectURL(recordedUrl); recordedUrl = null; }
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById('app') || document.body, { childList: true });

  return panel;
}

function renderPersonalNotePanel(song, part) {
  const getAllNotes = () => object(read('my_practice_notes', {}));
  const currentEntry = object(getAllNotes()[song.id]);
  const initialText = typeof currentEntry.text === 'string' ? currentEntry.text : '';

  const noteBadge = el('span', {
    class: 'practice-accordion-badge',
    text: initialText.trim() ? '메모 있음' : '비어 있음'
  });

  const saveStatus = el('span', {
    class: 'personal-note-status',
    text: initialText ? '자동 저장됨' : '이 브라우저에 자동 저장'
  });

  const tsChipsBox = el('div', { class: 'note-timestamp-chips' });

  const parseTimestampSec = (mm, ss) => (parseInt(mm, 10) * 60) + parseInt(ss, 10);

  function refreshTimestampChips(text) {
    const matches = [];
    const regex = /\[?(\d{1,2}):(\d{2})\]?/g;
    let m;
    const seen = new Set();
    while ((m = regex.exec(text)) !== null) {
      const sec = parseTimestampSec(m[1], m[2]);
      const label = `${parseInt(m[1], 10)}:${m[2]}`;
      if (!seen.has(sec) && Number.isFinite(sec)) {
        seen.add(sec);
        matches.push({ sec, label });
      }
    }
    const trimmed = String(text || '').trim();
    noteBadge.textContent = matches.length
      ? `구간 ${matches.length}개`
      : (trimmed ? '메모 있음' : '비어 있음');
    if (!matches.length) {
      tsChipsBox.hidden = true;
      tsChipsBox.replaceChildren();
      return;
    }
    tsChipsBox.hidden = false;
    tsChipsBox.replaceChildren(
      el('span', { class: 'note-ts-hint', text: '⏱️ 메모 구간 바로 이동:' }),
      ...matches.map(item => el('button', {
        type: 'button',
        class: 'chip note-ts-chip',
        title: `${item.label} 위치로 이동하여 재생`,
        onclick: () => {
          state.player?.seekTo?.(item.sec);
          state.player?.play?.();
          toast(`⏱️ ${item.label} 구간으로 이동해 재생합니다.`);
        }
      }, `▶ ${item.label}`))
    );
  }

  const saveNote = (val) => {
    const next = { ...getAllNotes() };
    const trimmed = val.trim();
    if (trimmed) {
      next[song.id] = { text: val, updatedAt: new Date().toISOString() };
    } else {
      delete next[song.id];
    }
    write('my_practice_notes', next);
    saveStatus.textContent = trimmed ? '✓ 자동 저장됨' : '비어 있음';
    refreshTimestampChips(val);
  };

  const textarea = el('textarea', {
    class: 'personal-note-textarea',
    rows: 3,
    placeholder: `예: [0:42] ${PARTS[part] || part} 진입 전 숨 미리 쉬기, 후렴 고음 힘 빼고 부르기`,
    value: initialText,
    oninput: (e) => saveNote(e.target.value)
  });

  const insertTsBtn = button('⏱️ 현 위치 타임스탬프 넣기', () => {
    const curSec = Math.max(0, Math.floor(state.player?.getCurrentTime?.() || 0));
    const stamp = `[${formatPlayerTime(curSec)}] `;
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : textarea.value.length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : textarea.value.length;
    const prefix = start > 0 && !/\s$/.test(textarea.value.slice(0, start)) ? '\n' : '';
    textarea.value = textarea.value.slice(0, start) + prefix + stamp + textarea.value.slice(end);
    saveNote(textarea.value);
    textarea.focus();
    const caret = start + prefix.length + stamp.length;
    try { textarea.setSelectionRange(caret, caret); } catch {}
    toast(`⏱️ 현재 위치 ${formatPlayerTime(curSec)} 타임스탬프를 노트에 넣었습니다.`);
  }, 'button secondary small');

  refreshTimestampChips(initialText);

  return el('details', {
    class: 'practice-accordion personal-note-panel',
    'aria-label': '나만의 개인 연습 노트',
    open: Boolean(initialText.trim())
  },
    el('summary', { class: 'practice-accordion-summary' },
      el('span', { class: 'practice-accordion-title' },
        icon('notes'),
        el('strong', { text: '나만의 개인 연습 노트' }),
        noteBadge
      ),
      el('span', { class: 'practice-accordion-chevron', 'aria-hidden': 'true' }, icon('chevron-down'))
    ),
    el('div', { class: 'practice-accordion-body' },
      el('div', { class: 'personal-note-header' },
        el('p', { class: 'personal-note-desc', text: '숨표·발음·음정 주의 구간을 자유롭게 적어두세요. [0:42]처럼 시간을 적으면 원탭 점프 버튼이 생깁니다.' }),
        el('div', { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' },
          saveStatus,
          insertTsBtn
        )
      ),
      textarea,
      tsChipsBox
    )
  );
}

function renderPractice(song, part, record = true) {
  if (record) recordPractice(song, part);
  const parts = availableParts(song); const index = parts.indexOf(part);
  const songRehearsals = getRehearsalsForSong(state.rehearsals, song.id);
  const songPerformances = getPerformancesForSong(state.performances, song.id);
  const songScores = getScoresForSong(state.scores, song.id);
  const rehearsalAudio = songRehearsals[0]?.audio?.url ? songRehearsals[0].audio : null;

  const switchPartAtSameTime = (targetPart) => {
    if (!targetPart || targetPart === part) return;
    const curSec = Math.floor(state.player?.getCurrentTime?.() || 0);
    if (curSec > 1) {
      state.initialSeek = curSec;
      toast(`🔄 ${formatPlayerTime(curSec)} 위치 그대로 ${PARTS[targetPart] || targetPart} 파트로 이어 듣습니다.`);
    }
    startPractice(song, targetPart);
  };

  app.append(button('파트 선택으로', () => openSong(song), 'text-button back-button', 'back'),
    el('div', {class: 'practice-heading'}, el('div', {}, el('p', {class: 'eyebrow', text: 'MAKE THIS MOMENT COUNT'}), el('h1', {text: song.title}), el('p', {text: `${song.artist || ''}${song.duration ? ` · ⏱ ${song.duration}` : ''}${song.bpm ? ` · ♩=${song.bpm} BPM` : ''}`})), el('span', {class: 'part-indicator', text: `${PARTS[part]}${song.partNames?.[part] ? ` · ${song.partNames[part]}` : ''}`})));
  
  const startingPitchPanel = renderStartingPitchPanel(song, part);
  const masteryPanel = renderMasteryControlPanel(song);
  const partSyncBar = parts.length > 1
    ? el('div', {class: 'part-sync-bar', role: 'region', 'aria-label': '현 위치 유지 파트 대조 전환'},
        el('span', {class: 'part-sync-label', text: '🔄 같은 구간 다른 파트 듣기:'}),
        el('div', {class: 'chip-group'},
          ...parts.map(pKey => {
            const singer = song.partNames?.[pKey];
            const label = `${PARTS[pKey] || pKey}${singer ? ` · ${singer}` : ''}`;
            const isActive = pKey === part;
            return button(label, () => switchPartAtSameTime(pKey), `chip${isActive ? ' active' : ''}`, null, {
              'aria-pressed': String(isActive),
              title: isActive ? '현재 연습 중인 파트입니다' : '현재 재생 시간 위치를 그대로 유지한 채 해당 파트로 전환합니다'
            });
          })
        )
      )
    : null;

  const playerHost = el('div', {class: 'player-panel'});
  const playerLayout = el('div', {class: 'practice-layout'}, playerHost);
  state.player = createPlayer(playerHost, song.videos[part], `${song.title} · ${PARTS[part]} 연습`);
  if (typeof state.initialSeek === 'number') {
    const s = state.initialSeek;
    state.initialSeek = null;
    state.player.seekTo(s);
  }
  const controller = renderPlayerController(state.player, song, part);
  const voiceRecorderPanel = renderVoiceRecorderPanel(song, part);
  const personalNotePanel = renderPersonalNotePanel(song, part);
  const shortcutHint = el('p', {
    class: 'practice-shortcut-hint',
    text: '⌨️ 키보드·블루투스 페달 단축키: Space 재생/정지 · ←/→ ±5초 이동 · [ / ] 구간 A·B 설정 · \\ 구간반복 토글 · P 내 파트 첫음'
  });

  // 누적 연습 시간: 영상이 실제로 재생 중일 때만 센다(화면이 꺼진 백그라운드 재생 포함).
  // 화면이 꺼지면 타이머가 느려지므로 고정 5초 대신 실제로 지난 시간(최대 60초)을 더한다.
  let lastPracticeTick = Date.now();
  const practiceTimerId = setInterval(() => {
    if (!controller.isConnected) {
      clearInterval(practiceTimerId);
      return;
    }
    const now = Date.now();
    const elapsedSec = Math.min(60, Math.max(0, (now - lastPracticeTick) / 1000));
    lastPracticeTick = now;
    if (state.player?.isPlaying?.() && elapsedSec >= 1) {
      addSongPracticeSeconds(song.id, Math.round(elapsedSec));
      const timeBadge = masteryPanel.querySelector?.('.mastery-time-badge');
      if (timeBadge) {
        const curProg = getSongProgress(song.id);
        timeBadge.textContent = curProg.practiceSec > 0
          ? `⏱ 누적 ${formatPracticeTotalTime(curProg.practiceSec)}`
          : '⏱ 오늘 첫 연습을 시작해 보세요';
      }
    }
  }, 5000);

  const onPracticeKeydown = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.code === 'Space') {
      if (e.target?.closest?.('button, a, summary')) return;
      e.preventDefault();
      state.player?.togglePlay?.();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      state.player?.seekRelative?.(-5);
      toast('⏪ 5초 뒤로 이동');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      state.player?.seekRelative?.(5);
      toast('⏩ 5초 앞으로 이동');
    } else if (e.key === '[') {
      e.preventDefault();
      controller.querySelector('[data-loop-action="start"]')?.click();
    } else if (e.key === ']') {
      e.preventDefault();
      controller.querySelector('[data-loop-action="end"]')?.click();
    } else if (e.key === '\\') {
      e.preventDefault();
      controller.querySelector('[data-loop-action="toggle"]')?.click();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      const targetPitchPart = (part && part !== 'full') ? part : (songMyPart(song) || part);
      const firstNote = getTransposedPartNote(song, targetPitchPart);
      if (firstNote && playNoteString(firstNote)) {
        toast(`🎵 ${PARTS[targetPitchPart] || targetPitchPart} 첫 음 ${parseNoteString(firstNote)?.displayNote || firstNote}`);
      } else {
        openPitchPipe(song.bpm);
      }
    }
  };
  window.addEventListener('keydown', onPracticeKeydown);
  const keyObserver = new MutationObserver(() => {
    if (!controller.isConnected) {
      clearInterval(practiceTimerId);
      window.removeEventListener('keydown', onPracticeKeydown);
      keyObserver.disconnect();
    }
  });
  keyObserver.observe(document.getElementById('app') || document.body, { childList: true });

  let audioPlayerCtrl = null;
  let abSwitcher = null;

  if (rehearsalAudio) {
    abSwitcher = el('div', {class: 'ab-switcher-box'},
      el('span', {class: 'ab-label', text: '비교 청취:'}),
      el('button', {
        type: 'button',
        class: 'ab-chip active',
        text: '📺 파트 가이드 영상',
        onclick: (e) => {
          for (const b of abSwitcher.querySelectorAll('.ab-chip')) b.classList.toggle('active', b === e.target);
          playerLayout.hidden = false;
          controller.hidden = false;
          if (audioPlayerCtrl) {
            audioPlayerCtrl.element.hidden = true;
            audioPlayerCtrl.pause();
          }
        }
      }),
      el('button', {
        type: 'button',
        class: 'ab-chip',
        text: '🎙️ 우리 팀 현장 녹음본',
        onclick: (e) => {
          for (const b of abSwitcher.querySelectorAll('.ab-chip')) b.classList.toggle('active', b === e.target);
          playerLayout.hidden = true;
          controller.hidden = true;
          state.player?.pause();
          if (!audioPlayerCtrl) {
            audioPlayerCtrl = renderAudioPlayer(rehearsalAudio, `${song.title} 현장 녹음본`);
            playerLayout.parentNode.insertBefore(audioPlayerCtrl.element, controller);
          }
          audioPlayerCtrl.element.hidden = false;
          toast('🎙️ 가이드 음정과 우리 팀의 실제 소리를 비교해 보세요.');
        }
      })
    );
  }

  const isFavNow = state.favorites.has(song.id);
  const favActionBtn = el('button', {
    type: 'button',
    class: `practice-quick-btn${isFavNow ? ' is-fav' : ''}`,
    'aria-pressed': String(isFavNow),
    'aria-label': isFavNow ? '즐겨찾기에서 빼기' : '즐겨찾기에 추가',
    onclick: () => {
      if (state.favorites.has(song.id)) state.favorites.delete(song.id);
      else state.favorites.add(song.id);
      write('favorites', [...state.favorites]);
      const nextFav = state.favorites.has(song.id);
      favActionBtn.classList.toggle('is-fav', nextFav);
      favActionBtn.setAttribute('aria-pressed', String(nextFav));
      favActionBtn.setAttribute('aria-label', nextFav ? '즐겨찾기에서 빼기' : '즐겨찾기에 추가');
      favActionBtn.replaceChildren(icon('heart'), el('span', {text: nextFav ? '저장됨' : '즐겨찾기'}));
      toast(nextFav ? `'${song.title}'을 즐겨찾기에 담았어요.` : `'${song.title}'을 즐겨찾기에서 뺐어요.`);
    }
  }, icon('heart'), el('span', {text: isFavNow ? '저장됨' : '즐겨찾기'}));

  const scoreQuickBtn = songScores.length
    ? el('button', {
        type: 'button',
        class: 'practice-quick-btn primary',
        'aria-label': '연습 화면을 벗어나지 않고 악보 바로 열기',
        onclick: () => openOrDownloadScore(songScores[0], false)
      }, icon('document'), el('span', {text: '악보 보기'}))
    : el('button', {
        type: 'button',
        class: 'practice-quick-btn',
        'aria-label': '악보 창고 열기',
        onclick: () => {
          state.scoreFilters.songId = song.id;
          navigate({tab: 'scores'});
        }
      }, icon('document'), el('span', {text: '악보 창고'}));

  const primaryActions = el('div', {class: 'practice-primary-actions', role: 'group', 'aria-label': '핵심 연습 도구'},
    scoreQuickBtn,
    el('button', {
      type: 'button',
      class: 'practice-quick-btn',
      'aria-label': '실시간 음정 튜너 및 합주 메트로놈 열기',
      onclick: () => openPitchPipe(song.bpm)
    }, icon('music'), el('span', {text: '튜너·박자'})),
    el('button', {
      type: 'button',
      class: 'practice-quick-btn',
      'aria-label': '화면 잠금 및 주머니 절전 모드',
      onclick: () => {
        if (state.player && !state.player.isMounted()) {
          state.player.play();
        }
        enterPocketMode({
          title: `${song.title} (${PARTS[part]})`,
          partLabel: `${song.artist || 'AcaRaca'} · 포켓 절전 모드`
        });
        toast('🔒 화면 절전 모드가 켜졌습니다. 화면을 두 번 탭하면 잠금이 해제됩니다.');
      }
    }, icon('eye'), el('span', {text: '포켓 절전'})),
    favActionBtn
  );

  const secondaryToolButtons = [
    button('처음부터', () => state.player?.restart(), 'button secondary', 'clock'),
    button('가로 확대', () => state.player?.toggleLandscape?.(), 'button secondary', 'presentation', {'aria-label': '영상 가로로 확대해서 크게 보기'}),
    button('화면 켜짐 유지', async () => {
      if (isWakeLockActive()) {
        await releaseWakeLock();
        toast('💡 화면 자동 꺼짐 방지를 해제했습니다.');
      } else {
        const ok = await requestWakeLock();
        if (ok) {
          toast('💡 화면이 꺼지지 않도록 켜짐 유지를 활성화했습니다.');
        } else {
          toast('이 브라우저에서는 화면 켜짐 유지를 지원하지 않습니다.');
        }
      }
    }, 'button secondary', 'sun', {'aria-label': '연습 중 화면 꺼짐 방지 토글'}),
    button('백그라운드·절전 설정', () => navigate({tab: 'settings'}), 'button secondary', 'sparkles', {'aria-label': '모바일 백그라운드 및 절전 재생 설정으로 이동'}),
    button('QR 코드', () => showQR(song, part), 'button secondary', 'qr'),
    button('파트 공유', () => share(song, part), 'button secondary', 'share'),
    songScores.length ? button(`악보 창고 (${songScores.length})`, () => {
      state.scoreFilters.songId = song.id;
      navigate({tab: 'scores'});
    }, 'button secondary', 'document') : null,
    button('영상 수정', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'button secondary', 'external'),
    songPerformances.length ? button('무대 실황', () => navigate({tab: 'stage'}), 'button secondary', 'stage', {'aria-label': '이 곡의 무대 실황 영상 보기'}) : null,
    songRehearsals.length ? button('연습 일지 & 피드백', () => {
      state.rehearsalFilters = { query: '', songId: song.id };
      navigate({tab: 'rehearsal'});
    }, 'button secondary', 'notes', {'aria-label': '이 곡의 연습 일지 및 피드백 보기'}) : null
  ].filter(Boolean);

  const moreToolsDrawer = el('details', {class: 'practice-accordion practice-more-tools'},
    el('summary', {class: 'practice-accordion-summary'},
      el('span', {class: 'practice-accordion-title'},
        icon('more'),
        el('strong', {text: '보조 도구 더보기 (공유 · QR · 아카이브 · 설정)'}),
        el('span', {class: 'practice-accordion-badge', text: `${secondaryToolButtons.length}개`})
      ),
      el('span', {class: 'practice-accordion-chevron', 'aria-hidden': 'true'}, icon('chevron-down'))
    ),
    el('div', {class: 'practice-accordion-body'},
      el('div', {class: 'player-actions'}, ...secondaryToolButtons)
    )
  );
  const switches = el('div', {class: 'part-switcher'}, button('이전 파트', () => switchPartAtSameTime(parts[index - 1]), 'button secondary', 'back', {disabled: index <= 0}),
    el('span', {text: `${Math.max(index + 1, 1)} / ${Math.max(parts.length, 1)} 파트`}), button('다음 파트', () => switchPartAtSameTime(parts[index + 1]), 'button secondary', 'arrow', {disabled: index < 0 || index >= parts.length - 1}));
  
  let setlistNav = null;
  const setIdx = state.setlist ? state.setlist.ids.indexOf(song.id) : -1;
  if (setIdx >= 0) {
    const go = (step) => {
      for (let i = setIdx + step; i >= 0 && i < state.setlist.ids.length; i += step) {
        const target = state.songs.find(s => s.id === state.setlist.ids[i]);
        if (target && availableParts(target).length) { startPractice(target); return; }
      }
    };
    setlistNav = el('div', {class: 'setlist-nav', 'aria-label': '공연 셋리스트 이동'},
      button('이전 곡', () => go(-1), 'button secondary', 'back', {disabled: setIdx <= 0}),
      el('span', {class: 'setlist-nav-label'},
        el('span', {class: 'setlist-nav-title', text: state.setlist.title}),
        el('span', {class: 'setlist-nav-count', text: `${setIdx + 1} / ${state.setlist.ids.length}곡`})),
      button('다음 곡', () => go(1), 'button primary', 'arrow', {disabled: setIdx >= state.setlist.ids.length - 1})
    );
  }

  // 휴대폰에서 연습 영상이 바로 보이도록 영상을 맨 위로 올리고, 첫 음은 한 줄 요약으로 먼저 보여 준다
  const quickPitchPart = (part && part !== 'full') ? part : (songMyPart(song) || part);
  const quickFirstNote = getTransposedPartNote(song, quickPitchPart);
  const quickNoteLabel = quickFirstNote ? (parseNoteString(quickFirstNote)?.displayNote || quickFirstNote) : '';
  const firstNoteStrip = quickFirstNote
    ? el('div', {class: 'practice-first-note-strip', role: 'group', 'aria-label': '내 파트 첫 음 바로 듣기'},
        button(`🎵 ${PARTS[quickPitchPart] || '내 파트'} 첫 음 ${quickNoteLabel} 듣기`, () => {
          if (playNoteString(quickFirstNote)) toast(`🎵 ${PARTS[quickPitchPart] || quickPitchPart} 첫 음 ${quickNoteLabel}`);
          else openPitchPipe(song.bpm);
        }, 'button primary small practice-first-note-play'),
        button('전체 파트 첫 음 ↓', () => {
          startingPitchPanel?.scrollIntoView?.({behavior: 'smooth', block: 'start'});
        }, 'button secondary small practice-first-note-more')
      )
    : null;

  if (abSwitcher) app.append(abSwitcher);
  if (setlistNav) app.append(setlistNav);
  app.append(...[firstNoteStrip, playerLayout, controller, primaryActions, startingPitchPanel, partSyncBar, shortcutHint, masteryPanel, voiceRecorderPanel, personalNotePanel, moreToolsDrawer, switches].filter(Boolean));
}

function renderSettings() {
  app.append(el('div', {class: 'page-heading'}, el('p', {class: 'eyebrow', text: 'MAKE YOURSELF AT HOME'}), el('h1', {text: '나만의 연습실'}), el('p', {text: '내 파트와 화면을 설정하고, 편안하게 연습하세요.'})));
  const names = allMemberNames();
  const namePanel = el('section', {class: 'settings-panel'}, icon('mic'), el('h2', {text: '나는 누구?'}), el('p', {text: '이름을 고르면 곡마다 내가 맡은 파트를 자동으로 찾아 줘요. 이름이 없는 곡은 아래 기본 파트를 사용해요.'}));
  namePanel.append(el('div', {class: 'setting-options name-options'}, names.map(name => button(name, () => {
    state.myName = name; write('myName', name); refreshChrome();
    for (const node of namePanel.querySelectorAll('[data-name]')) { node.classList.toggle('active', node.dataset.name === name); node.setAttribute('aria-pressed', String(node.dataset.name === name)); }
    toast(`${name}님으로 설정했어요. 곡마다 ${name}님의 파트가 먼저 보여요.`);
  }, `choice-button${state.myName === name ? ' active' : ''}`, null, {'data-name': name, 'aria-pressed': String(state.myName === name)}))));
  namePanel.append(button('이름 선택 해제', () => { state.myName = ''; remove('myName'); render(); toast('이름 선택을 해제했어요.'); }, 'text-button'));
  const partPanel = el('section', {class: 'settings-panel'}, icon('mic'), el('h2', {text: '내 기본 파트'}), el('p', {text: '이름이 등록되지 않은 곡에서 사용할 파트예요.'}));
  const longNames = {
    part1: '1번 파트', part2: '2번 파트', part3: '3번 파트',
    part4: '4번 파트', part5: '5번 파트', part6: '6번 파트', part7: '7번 파트',
    lead: 'Lead (리드)', soprano: 'Soprano (소프라노)', alto: 'Alto (알토)', tenor: 'Tenor (테너)',
    baritone: 'Baritone (바리톤)', bass: 'Bass (베이스)', vp: 'Vocal Percussion',
  };
  partPanel.append(el('div', {class: 'setting-options'}, Object.entries(longNames).map(([part, fullName]) => button([el('strong', {text: PARTS[part]}), el('span', {text: fullName})], () => {
    state.myPart = part; state.random = null; write('myPart', part); refreshChrome();
    for (const node of partPanel.querySelectorAll('[data-part]')) { node.classList.toggle('active', node.dataset.part === part); node.setAttribute('aria-pressed', String(node.dataset.part === part)); }
    toast(`${PARTS[part]}를 내 파트로 설정했어요.`);
  }, `choice-button${state.myPart === part ? ' active' : ''}`, null, {'data-part': part, 'aria-pressed': String(state.myPart === part)}))));
  partPanel.append(button('기본 파트 선택 해제', () => { state.myPart = ''; state.random = null; remove('myPart'); render(); toast('기본 파트 선택을 해제했어요.'); }, 'text-button'));
  const themePanel = el('section', {class: 'settings-panel'}, icon('sun'), el('h2', {text: '화면 테마'}), el('p', {text: '지금 연습하기 편한 밝기를 선택하세요.'}));
  themePanel.append(el('div', {class: 'theme-options'}, [['system', '기기 설정'], ['light', '라이트'], ['dark', '다크']].map(([value, label]) => button(label, () => {
    theme = value; write('theme', theme); applyTheme();
    for (const node of themePanel.querySelectorAll('[data-theme-choice]')) { node.classList.toggle('active', node.dataset.themeChoice === theme); node.setAttribute('aria-pressed', String(node.dataset.themeChoice === theme)); }
  }, `choice-button${theme === value ? ' active' : ''}`, null, {'data-theme-choice': value, 'aria-pressed': String(theme === value)}))));
  let autoResumeVal = read('bgAutoResume', true) ?? true;
  let keepAwakeVal = read('bgKeepAwake', true) ?? true;

  const bgPlayPanel = el('section', {class: 'settings-panel'},
    icon('sparkles'),
    el('h2', {text: '모바일 백그라운드 & 연속 재생 설정'}),
    el('p', {text: '스마트폰에서 다른 앱을 쓰거나 화면을 잠갔을 때 끊김 없이 편리하게 연습할 수 있는 기능들입니다.'}),

    el('div', {class: 'setting-toggle-card'},
      el('div', {class: 'setting-toggle-info'},
        el('strong', {text: '앱 / 화면 복귀 시 자동 이어재생'}),
        el('p', {text: '다른 앱(카카오톡, 가사 메모 등)을 보거나 화면 잠금을 풀고 돌아왔을 때, 멈춘 영상을 직전 위치에서 자동으로 즉시 다시 재생합니다.'})
      ),
      button(autoResumeVal ? '켜짐 (자동 재생)' : '꺼짐', (e) => {
        autoResumeVal = !autoResumeVal;
        write('bgAutoResume', autoResumeVal);
        e.currentTarget.textContent = autoResumeVal ? '켜짐 (자동 재생)' : '꺼짐';
        e.currentTarget.className = `button small ${autoResumeVal ? 'primary' : 'secondary'}`;
        toast(autoResumeVal ? '🔄 복귀 시 자동 이어재생을 켰습니다.' : '자동 이어재생을 껐습니다.');
      }, `button small ${autoResumeVal ? 'primary' : 'secondary'}`)
    ),

    el('div', {class: 'setting-toggle-card'},
      el('div', {class: 'setting-toggle-info'},
        el('strong', {text: '연습 중 화면 자동 꺼짐 방지'}),
        el('p', {text: '파트 영상 재생 또는 악보 연습 중 스마트폰 화면이 절전 시간 초과로 저절로 꺼지지 않도록 켜짐 상태를 유지합니다.'})
      ),
      button(keepAwakeVal ? '켜짐 (항상 켜둠)' : '꺼짐', async (e) => {
        keepAwakeVal = !keepAwakeVal;
        write('bgKeepAwake', keepAwakeVal);
        if (keepAwakeVal) {
          await requestWakeLock();
          toast('💡 화면 자동 꺼짐 방지를 켰습니다.');
        } else {
          await releaseWakeLock();
          toast('화면 자동 꺼짐 방지를 껐습니다.');
        }
        e.currentTarget.textContent = keepAwakeVal ? '켜짐 (항상 켜둠)' : '꺼짐';
        e.currentTarget.className = `button small ${keepAwakeVal ? 'primary' : 'secondary'}`;
      }, `button small ${keepAwakeVal ? 'primary' : 'secondary'}`)
    ),

    el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px;'},
      button('🔒 지금 포켓 절전 모드 실행', () => {
        enterPocketMode({
          title: 'AcaRaca 포켓 절전 모드',
          partLabel: '화면 터치 잠금 · 주머니 속 연속 재생 중'
        });
        toast('🔒 화면 절전 모드가 켜졌습니다. 화면을 두 번 탭하면 잠금이 해제됩니다.');
      }, 'button secondary', 'eye'),
      button('📖 모바일 백그라운드 완벽 사용 팁', () => openBackgroundGuideModal(), 'button ghost', 'sparkles')
    )
  );
  const dataPanel = el('section', {class: 'settings-panel'}, icon('library'), el('h2', {text: '연습 자료 관리'}), el('p', {text: '새 곡과 파트 영상을 등록하려면 데이터 편집기를 이용하세요.'}), button('데이터 편집기 열기', () => openAdmin('./admin.html'), 'button secondary', 'external'));
  const backupFileInput = el('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
        // 적용 전에 파일 전체를 검사·정리한다. 백업이 아니면 여기서 멈춰 아무것도 바뀌지 않는다.
        const raw = sanitizeBackup(parsed, {
          resolveSongId,
          validParts: Object.keys(PARTS).filter(p => p !== 'full')
        });
        if (raw.favorites) {
          write('favorites', raw.favorites);
          state.favorites = new Set(raw.favorites);
        }
        if (raw.recent) {
          write('recent', raw.recent);
          state.recent = raw.recent;
        }
        if (raw.progress) {
          write('progress', raw.progress);
          state.progress = raw.progress;
        }
        if (raw.songTranspositions) {
          write('song_transpositions', raw.songTranspositions);
          state.songTranspositions = raw.songTranspositions;
        }
        if (typeof raw.myPart === 'string') {
          state.myPart = raw.myPart;
          if (raw.myPart) write('myPart', raw.myPart);
          else remove('myPart');
        }
        if (typeof raw.myName === 'string') {
          state.myName = raw.myName;
          if (state.myName) write('myName', state.myName);
          else remove('myName');
        }
        if (raw.statusOverrides) {
          write('statusOverrides', raw.statusOverrides);
          state.songs.forEach(song => {
            song.status = raw.statusOverrides[song.id] || song._defaultStatus || song.status;
          });
        }
        const listKeys = {
          customRehearsals: 'custom_rehearsals', teamFeedbacks: 'team_feedbacks', likedFeedbacks: 'liked_feedbacks',
          customScores: 'custom_scores', customMemories: 'custom_memories', likedMemories: 'liked_memories',
          memoryLikeCounts: 'memory_like_counts', customAppreciation: 'custom_appreciation',
          customPracticeVideos: 'custom_practice_videos', customEducation: 'custom_education',
          myPracticeNotes: 'my_practice_notes', savedLoops: 'savedLoops', rehearsalMediaOverrides: 'rehearsal_media_overrides'
        };
        for (const [field, key] of Object.entries(listKeys)) {
          if (raw[field] !== undefined) write(key, raw[field]);
        }
        if (raw.teamFeedbacks) write('feedbacks_seed_v', 2);
        if (raw.stageDeletedIds) {
          try { localStorage.setItem('acaroom_stage_deleted_ids_v1', JSON.stringify(raw.stageDeletedIds)); } catch {}
        }
        if (raw.stageHistory) {
          try { localStorage.setItem('acaroom_stage_history_v2', JSON.stringify(raw.stageHistory)); } catch {}
        }
        if (raw.stageActive) {
          try { localStorage.setItem('acaroom_stage_active_v2', JSON.stringify(raw.stageActive)); } catch {}
        }
        const [rehRes, scoresRes, memoriesRes, eduRes, practiceVidRes, apprecRes] = await Promise.all([
          loadRehearsals(true),
          loadScores(true),
          loadMemories(true),
          loadEducation(true),
          loadPracticeVideos(true),
          loadAppreciation(true)
        ]);
        state.rehearsals = rehRes;
        state.scores = scoresRes;
        state.memories = memoriesRes;
        state.education = eduRes;
        state.practiceVideos = practiceVidRes;
        state.appreciation = apprecRes;
        refreshChrome();
        render();
        toast('📥 연습 기록, 내 프로필, 무대 큐시트 및 커스텀 아카이브 백업을 복원했습니다.');
      } catch (err) {
        toast(`백업 파일을 불러오지 못했습니다: ${err.message}`);
      } finally {
        e.target.value = '';
      }
    }
  });
  const privacyPanel = el('section', {class: 'settings-panel'}, icon('heart'), el('h2', {text: '나의 연습 기록 · 백업 공유'}), el('p', {text: '단원 이름·기본 파트, 즐겨찾기, 최근 연습, 숙련도·연습시간, 반음 조바꿈, 개인 연습 노트, 저장 구간, 무대 큐시트, 연습 피드백 및 직접 등록한 악보·기록·영상 자료는 이 브라우저에 저장됩니다. JSON 백업 파일로 내보내어 다른 기기나 단원과 공유할 수 있습니다.'}),
    !isAvailable() && el('p', {class: 'notice warning', text: '브라우저 저장소를 사용할 수 없어 현재 세션에서만 기록됩니다.'}),
    backupFileInput,
    el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;'},
      button('📤 기록 · 큐시트 백업 내보내기', () => {
        let stageHistory = null;
        let stageActive = null;
        let stageDeletedIds = [];
        try {
          stageHistory = JSON.parse(localStorage.getItem('acaroom_stage_history_v2') || 'null');
          stageActive = JSON.parse(localStorage.getItem('acaroom_stage_active_v2') || 'null');
          stageDeletedIds = JSON.parse(localStorage.getItem('acaroom_stage_deleted_ids_v1') || '[]');
        } catch {}
        const payload = {
          type: 'acaraca-backup',
          version: 2,
          exportedAt: new Date().toISOString(),
          myName: state.myName,
          myPart: state.myPart,
          favorites: [...state.favorites],
          recent: state.recent,
          progress: state.progress,
          songTranspositions: state.songTranspositions,
          statusOverrides: read('statusOverrides', {}),
          customRehearsals: read('custom_rehearsals', []),
          teamFeedbacks: read('team_feedbacks', []),
          likedFeedbacks: read('liked_feedbacks', []),
          customScores: read('custom_scores', []),
          customMemories: read('custom_memories', []),
          likedMemories: read('liked_memories', []),
          memoryLikeCounts: read('memory_like_counts', {}),
          customAppreciation: read('custom_appreciation', []),
          customPracticeVideos: read('custom_practice_videos', []),
          customEducation: read('custom_education', []),
          rehearsalMediaOverrides: read('rehearsal_media_overrides', {}),
          stageDeletedIds: Array.isArray(stageDeletedIds) ? stageDeletedIds : [],
          myPracticeNotes: read('my_practice_notes', {}),
          savedLoops: read('savedLoops', {}),
          stageHistory,
          stageActive
        };
        const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {type: 'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const link = el('a', {href: url, download: `acaraca-backup-${localDateString()}.json`});
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('📤 연습 기록, 아카이브 및 무대 큐시트 백업 파일을 다운로드했습니다.');
      }, 'button secondary'),
      button('📥 백업 파일 불러오기', () => backupFileInput.click(), 'button secondary')
    ),
    button('개인 연습 기록 초기화', () => {
      if (!confirm('즐겨찾기, 최근 연습, 파트 숙련도·조바꿈 기록을 모두 지울까요? 곡 자료와 내 파트 설정은 유지됩니다.')) return;
      for (const key of ['favorites', 'recent', 'progress', 'song_transpositions', 'timer']) remove(key);
      state.favorites.clear(); state.recent = []; state.progress = {}; state.songTranspositions = {};
      refreshChrome();
      render();
      toast('개인 연습 기록을 초기화했어요.');
    }, 'button secondary danger'));
  app.append(el('div', {class: 'settings-grid'}, namePanel, partPanel, themePanel, bgPlayPanel, dataPanel, privacyPanel));
}

function normalizeRoute() {
  if (state.route.cuesheet) {
    const decoded = decodeStageSessionShareParam(state.route.cuesheet);
    if (decoded && Array.isArray(decoded.songs) && decoded.songs.length) {
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('acaroom_stage_autopick', '1');
      } catch {}
      saveActiveStageSession(decoded);
      const currentHist = getStageHistory().filter(h => h.id !== decoded.id);
      saveStageHistory([decoded, ...currentHist]);
      state.stageView = 'live';
      write('stageView', 'live');
      state.route = { tab: 'stage', view: 'live' };
      writeRoute(state.route, { replace: true });
      toast(`📲 공유받은 '${decoded.eventTitle}' 큐시트(${decoded.songs.length}곡)를 열었습니다.`);
      return;
    }
    state.route = { tab: 'stage', view: 'live' };
    writeRoute(state.route, { replace: true });
  }
  if (!state.route.song) return;
  if (resolveSongId(state.route.song) !== state.route.song) {
    state.route = {...state.route, song: resolveSongId(state.route.song)};
    writeRoute(state.route, {replace: true});
  }
  const song = state.songs.find(song => song.id === state.route.song) || resolveSongData(state.songs, state.route.song);
  if (!song || !song.title) { state.route = {tab: 'home'}; writeRoute(state.route, {replace: true}); toast('찾을 수 없는 곡입니다. 홈으로 이동했어요.'); return; }
  if (state.route.part && (!Object.hasOwn(PARTS, state.route.part) || !song.videos?.[state.route.part]?.url?.trim())) {
    state.route = {song: song.id}; writeRoute(state.route, {replace: true}); toast('등록되지 않은 파트입니다. 곡에서 다른 파트를 선택해 주세요.');
  }
}
let lastPractice = '';
function render(options) {
  // 불러오기가 끝나 같은 화면을 다시 그릴 때는 그 사이 열어 둔 더보기 메뉴를 닫지 않는다
  // (닫으면 메뉴용 뒤로가기 기록만 남아 다음 뒤로가기가 아무 반응이 없게 된다)
  if (!(options && options.keepMoreSheet === true)) closeMobileMoreSheet({history: 'none'});
  stopPitch();
  for (const p of activePlayers) { try { p.destroy(); } catch {} }
  activePlayers.length = 0;
  for (const a of activeAudios) {
    try { a.pause(); a.src = ''; } catch {}
  }
  activeAudios.clear();
  cleanupStageLive();
  stopPitch(true);
  app.classList.remove('stage-live-page');
  state.player?.destroy(); state.player = null;
  app.replaceChildren(); destroyDetachedPlayers(); refreshChrome();
  if (state.loading) { app.append(el('div', {class: 'loading-state', role: 'status', text: '연습실을 준비하고 있어요…'})); return; }
  if (state.loadError) {
    app.append(el('div', {class: 'error-state', role: 'alert'}, el('h1', {text: '연습 자료를 불러오지 못했어요'}), el('p', {text: state.loadError}), button('다시 시도', initialize, 'button primary'), button('데이터 편집기 열기', () => openAdmin('./admin.html'), 'button secondary'))); return;
  }
  normalizeRoute(); refreshChrome();
  const song = state.route.song && (state.songs.find(song => song.id === state.route.song) || resolveSongData(state.songs, state.route.song));
  document.title = song ? `${song.title}${state.route.part ? ` · ${PARTS[state.route.part]}` : ''} | AcaRaca` : `${labels[state.route.tab || 'home']} | AcaRaca`;
  // 필요한 자료·화면 코드가 아직 없으면 '불러오는 중'을 보여 주고, 받은 뒤 다시 그린다.
  const needsStageView = !song && state.route.tab === 'stage' && !stageViewModule;
  const needsArchivePages = !song && ARCHIVE_PAGE_TABS.has(state.route.tab) && !archivePagesModule;
  if ((!state.archiveLoaded && !isLightRoute(state.route)) || needsStageView || needsArchivePages) {
    pendingArchiveRender = true;
    app.append(el('div', {class: 'loading-state', role: 'status', text: '자료를 불러오고 있어요…'}));
    Promise.all([loadArchiveData(), needsStageView ? loadStageView() : null, needsArchivePages ? loadArchivePages() : null]).then(() => {
      if (pendingArchiveRender) { pendingArchiveRender = false; render({keepMoreSheet: true}); }
    }).catch((error) => {
      console.warn('screen load error:', error);
      if (!pendingArchiveRender) return;
      pendingArchiveRender = false;
      app.replaceChildren(el('div', {class: 'error-state', role: 'alert'},
        el('h1', {text: '화면을 불러오지 못했어요'}),
        el('p', {text: '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 계속 안 되면 새로고침을 눌러 주세요.'}),
        button('다시 시도', render, 'button primary'),
        // 사용자가 직접 누를 때만 새로고침한다 (자동 새로고침 금지 규칙)
        button('새로고침', () => location.reload(), 'button secondary')));
    });
    return;
  }
  pendingArchiveRender = false;
  if (song && state.route.part) {
    const key = `${song.id}\u0000${state.route.part}`;
    renderPractice(song, state.route.part, lastPractice !== key); lastPractice = key;
  } else {
    lastPractice = '';
    if (song) renderDetail(song);
    else if (state.route.tab === 'songs') renderBrowse();
    else if (state.route.tab === 'practiceVideos') renderPracticeVideos();
    else if (state.route.tab === 'appreciation') renderAppreciation();
    else if (state.route.tab === 'scores') renderScores();
    else if (state.route.tab === 'education') renderEducation();
    else if (state.route.tab === 'stage') renderStage();
    else if (state.route.tab === 'rehearsal') renderRehearsal();
    else if (state.route.tab === 'memories') renderMemories();
    else if (state.route.tab === 'favorites') renderBrowse(true);
    else if (state.route.tab === 'recent') {
      const hasRecent = validRecent().length > 0;
      const headingActions = hasRecent ? button('최근 연습 비우기', confirmClearRecent, 'button secondary small danger', 'trash', {title: '최근 연습한 곡 목록을 모두 비웁니다'}) : null;
      app.append(
        el('div', {class: 'page-heading'},
          el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
            el('div', {},
              el('p', {class: 'eyebrow', text: 'PICK UP WHERE YOU LEFT OFF'}),
              el('h1', {text: '다시, 그 하모니부터'}),
              el('p', {text: '최근 10개의 곡과 파트를 바로 이어서 연습하세요.'})
            ),
            headingActions
          )
        ),
        el('h2', {class: 'sr-only', text: '최근 연습곡 목록'}),
        recentList(10)
      );
    }

    else if (state.route.tab === 'settings') renderSettings();
    else renderHome();
  }
}
// 첫 화면(홈·곡 목록)에 필요 없는 큰 자료(악보 목록 등)는 첫 화면을 띄운 뒤 뒤에서 받는다.
// 그 자료가 필요한 화면은 받을 때까지 '불러오는 중'을 보여 준다.
let archivePromise = null;
let pendingArchiveRender = false;
function loadArchiveData() {
  if (state.archiveLoaded) return Promise.resolve();
  if (!archivePromise) {
    archivePromise = Promise.all([
      loadScores(),
      loadMemories(),
      loadEducation(),
      loadPracticeVideos(),
      loadAppreciation()
    ]).then(([scoresRes, memoriesRes, eduRes, practiceVidRes, apprecRes]) => {
      state.scores = scoresRes;
      state.memories = memoriesRes;
      state.education = eduRes;
      state.practiceVideos = practiceVidRes;
      state.appreciation = apprecRes;
      state.archiveLoaded = true;
      updateHomeArchiveSummary();
    }).catch((error) => {
      archivePromise = null;
      throw error;
    });
  }
  return archivePromise;
}
function homeArchiveSummaryText() {
  if (!state.archiveLoaded) return `아카라카 영상 ${state.performances.length}편, 연습 일지 ${state.rehearsals.length}건 · 감상 영상·악보·기록 자료를 불러오는 중…`;
  return `감상 영상 ${state.appreciation.length}건, 아카라카 영상 ${state.performances.length}편, 악보 ${state.scores.length}건, 우리들의 기록 ${state.memories.length}건, 연습 일지 ${state.rehearsals.length}건이 보관되어 있습니다.`;
}
function updateHomeArchiveSummary() {
  const summary = document.querySelector('.home-archive-summary');
  if (summary) summary.textContent = homeArchiveSummaryText();
}
async function initialize() {
  state.loading = true; state.loadError = ''; render();
  // 곡·공연 화면으로 바로 들어온 경우엔 큰 자료도 처음부터 함께 받는다.
  if (!isLightRoute(readRoute())) loadArchiveData().catch(() => {});
  try {
    const [songRes, perfRes, rehRes] = await Promise.all([
      loadSongs(),
      loadPerformances(),
      loadRehearsals()
    ]);
    state.songs = songRes.songs;
    const savedOverrides = read('statusOverrides', {});
    state.songs.forEach(song => {
      if (!song._defaultStatus) song._defaultStatus = song.status;
      song.status = (savedOverrides && typeof savedOverrides === 'object' && savedOverrides[song.id])
        ? savedOverrides[song.id]
        : song._defaultStatus;
    });
    state.performances = perfRes;
    state.rehearsals = rehRes;
    if (songRes.errors?.length && !songRes.songs.length) state.loadError = songRes.errors.join(' ');
    if (songRes.errors?.length && songRes.songs.length) toast(`${songRes.errors.length}개의 잘못된 데이터 항목을 제외하고 불러왔어요.`);
  } catch (error) { state.loadError = `${error.message || '자료를 확인할 수 없습니다.'} data/songs.json 파일과 HTTP 연결을 확인해 주세요.`; }
  state.loading = false; render();
  // 첫 화면을 띄운 뒤 뒤에서 큰 자료와 무대 화면을 미리 받아 두어, 다른 탭을 누르면 바로 열리게 한다.
  if (!state.loadError) loadArchiveData().then(() => Promise.all([loadStageView(), loadArchivePages(), loadScoreViewer(), loadQrLibrary()])).catch(() => {});
}
window.addEventListener('popstate', () => {
  // 더보기 메뉴를 X·바깥 터치로 닫으며 되돌린 기록이면 화면은 그대로 둔다
  if (suppressNextPopstate) {
    suppressNextPopstate = false;
    return;
  }
  // 휴대폰 뒤로가기: 열린 더보기 메뉴만 닫고 지금 화면(재생 중인 영상 포함)은 유지
  if (document.getElementById('mobile-more-sheet')) {
    closeMobileMoreSheet({history: 'none'});
    return;
  }
  cleanupStageLive();
  stopPitch(true);
  app.classList.remove('stage-live-page');
  state.route = readRoute();
  render();
  app.focus({preventScroll: true});
});

// Close dialogs when clicking outside (on backdrop)
document.addEventListener('click', (e) => {
  if (e.target && e.target.nodeName === 'DIALOG' && e.target.open) {
    const rect = e.target.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      e.target.close();
    }
  }
});

initialize();
