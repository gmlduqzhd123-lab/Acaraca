import {loadSongs, PARTS, CHECKLIST, availableParts, preferredPart} from './data.js';
import {parseYouTube, createPlayer} from './player.js';
import {read, write, remove, isAvailable} from './storage.js';
import {filterSongs} from './search.js';
import {readRoute, writeRoute, routeUrl} from './router.js';
import {el, icon, button, toast, cover, emptyState} from './ui.js';
import {NOTES, OCTAVES, getNoteFrequency, playPitch, stopPitch, getCurrentPlaying, subscribePitchState} from './pitch.js';
import {
  loadPerformances,
  loadRehearsals,
  loadScores,
  loadMemories,
  loadEducation,
  getAllFeedbacks,
  addFeedback,
  toggleFeedbackLike,
  getPerformancesForSong,
  getRehearsalsForSong,
  getScoresForSong,
  addCustomRehearsal,
  attachMediaToRehearsal,
  deleteCustomRehearsal,
  addCustomScore,
  deleteCustomScore,
  addCustomMemory,
  deleteCustomMemory,
  toggleMemoryLike,
  addCustomEducation,
  deleteCustomEducation
} from './archive.js';
import { saveMediaFile } from './mediaStorage.js';

const app = document.getElementById('app');
const labels = {
  home: '홈',
  songs: '전체 곡',
  scores: '악보 창고',
  education: '교육 자료',
  stage: '공연 영상',
  rehearsal: '연습 일지',
  memories: '우리들의 기록',
  favorites: '즐겨찾기',
  recent: '최근 연습',
  settings: '설정'
};
const navIcons = {
  home: 'home',
  songs: 'library',
  scores: 'document',
  education: 'academic',
  stage: 'stage',
  rehearsal: 'notes',
  memories: 'camera',
  favorites: 'heart',
  recent: 'clock',
  settings: 'settings'
};
const levels = {1: '초급', 2: '중급', 3: '고급'};
const statuses = {practice: '현재 연습', complete: '완료', archive: '보관'};
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
const favoriteIds = array(read('favorites', [])).filter(value => typeof value === 'string');
const state = {
  songs: [],
  performances: [],
  rehearsals: [],
  scores: [],
  memories: [],
  education: [],
  loading: true,
  loadError: '',
  favorites: new Set(favoriteIds),
  recent: array(read('recent', [])).filter(value => value && typeof value.songId === 'string' && typeof value.part === 'string' && Number.isFinite(value.timestamp)),
  myPart: Object.keys(PARTS).filter(part => part !== 'full').includes(read('myPart', '')) ? read('myPart', '') : '',
  progress: object(read('progress', {})),
  filters: {query: '', status: '', category: '', difficulty: '', part: ''},
  stageView: 'list',
  stageFilters: {query: '', category: ''},
  scoreFilters: {query: '', category: '', songId: ''},
  educationFilters: {query: '', category: '', target: ''},
  memoryFilters: {category: ''},
  route: readRoute(),
  random: null,
  player: null
};
const activeAudios = new Set();
const activePlayers = [];
const mobileTabs = ['home', 'songs', 'scores', 'education', 'stage', 'rehearsal', 'memories'];
let theme = ['system', 'light', 'dark'].includes(read('theme', 'system')) ? read('theme', 'system') : 'system';
const colorPreference = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'system' ? (colorPreference.matches ? 'dark' : 'light') : theme;
}
applyTheme();
colorPreference.addEventListener('change', applyTheme);

function navigate(route, {replace = false, focus = true} = {}) {
  state.route = route; writeRoute(route, {replace}); render(); window.scrollTo({top: 0, behavior: 'instant'});
  if (focus) app.focus({preventScroll: true});
}
function openSong(song) { navigate({song: song.id}); }
function startPractice(song, part = preferredPart(song, state.myPart)) {
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

function refreshChrome() {
  const activeTab = state.route.song ? 'songs' : state.route.tab || 'home';
  const desktopNav = document.getElementById('desktop-nav');
  if (desktopNav) {
    desktopNav.replaceChildren(...Object.entries(labels).map(([tab, label]) => el('a', {
      class: `nav-link${tab === activeTab ? ' active' : ''}`, href: routeUrl({tab}).href,
      'aria-current': tab === activeTab ? 'page' : null,
      onclick: event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate({tab}); }
    }, icon(navIcons[tab]), el('span', {text: label}))));
  }
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    mobileNav.replaceChildren(...mobileTabs.map(tab => el('a', {
      class: `nav-link${tab === activeTab ? ' active' : ''}`, href: routeUrl({tab}).href,
      'aria-current': tab === activeTab ? 'page' : null,
      onclick: event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate({tab}); }
    }, icon(navIcons[tab]), el('span', {text: labels[tab]}))));
  }
  document.getElementById('sidebar-bottom').replaceChildren(
    button('첫 음 조율 (피치파이프)', () => openPitchPipe(), 'button secondary small', 'music', {style: 'width: 100%; margin-bottom: 12px;'}),
    el('div', {class: 'my-part-mini'}, icon('mic'), el('div', {}, el('span', {text: '나의 목소리'}), el('strong', {text: state.myPart ? PARTS[state.myPart] : '내 파트를 선택해 주세요'})),
      button('변경', () => navigate({tab: 'settings'}), 'text-button')),
    el('p', {class: 'sidebar-tip', text: '서로 다른 목소리, 하나의 하모니.'})
  );
  document.getElementById('topbar-actions').replaceChildren(
    button('조율기', () => openPitchPipe(), 'button secondary small', 'music', {'aria-label': '피치파이프 첫 음 조율기'}),
    button('+ 곡 추가', () => openAdmin('./admin.html?action=new'), 'button secondary small', null, {'aria-label': '새 곡 및 영상 추가'}),
    button('', () => { if (!document.getElementById('song-search')) navigate({tab: 'songs'}); document.getElementById('song-search')?.focus(); }, 'icon-button', 'search', {'aria-label': '곡 검색'}),
    button('', () => navigate({tab: 'settings'}), 'icon-button', 'settings', {'aria-label': '설정 열기'})
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
    el('p', {text: '현재 연습 중인 영상 목록을 모두 비우시겠습니까?\n언제든지 곡 상세 화면이나 전체 곡에서 다시 현재 연습으로 등록할 수 있습니다.'}),
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
      el('div', {class: 'card-meta'}, el('span', {class: 'badge', text: song.category || '기타'}), el('span', {text: levels[song.difficulty]}), song.arrangement && el('span', {text: song.arrangement})),
      el('div', {class: 'card-footer'},
        el('div', {class: 'part-preview'}, parts.length ? parts.slice(0, 3).map(part => el('span', {class: `part-pill${part === state.myPart ? ' mine' : ''}`, text: PARTS[part]})) : el('span', {class: 'part-empty', text: '영상 등록 예정'}), parts.length > 3 && el('span', {class: 'part-more', text: `+${parts.length - 3}`})),
        button('연습 시작', () => openSong(song), 'button primary small', 'play')
      )
    )
  );
}
function songGrid(songs, emptyTitle = '등록된 곡이 없어요', emptyDescription = '데이터 편집기에서 첫 연습곡을 추가해 주세요.', options = {}) {
  return songs.length ? el('div', {class: 'song-grid'}, songs.map(s => songCard(s, options))) : emptyState(emptyTitle, emptyDescription);
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
function progressChecks(songId, part) { return object(object(state.progress[songId])[part]); }
function percentage(songId, part) {
  const checks = progressChecks(songId, part);
  return Math.round(CHECKLIST.filter(check => checks[check.id] === true).length / CHECKLIST.length * 100);
}
function progressBar(percent, label = '연습 진행도') {
  return el('div', {class: 'progress-panel'}, el('div', {class: 'progress-label'}, el('span', {text: label}), el('strong', {text: `${percent}%`})),
    el('div', {class: 'progress-track', role: 'progressbar', 'aria-label': label, 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100}, el('div', {class: 'progress-fill', style: `width: ${percent}%`})));
}
function validRecent() {
  return state.recent.filter(record => state.songs.some(song => song.id === record.songId && availableParts(song).includes(record.part))).slice(0, 10);
}
function recentList(limit) {
  const records = validRecent().slice(0, limit);
  if (!records.length) return emptyState('첫 연습을 시작해 볼까요?', '파트 연습을 시작하면 여기에서 바로 이어갈 수 있어요.', button('연습곡 찾기', () => navigate({tab: 'songs'}), 'button secondary', 'arrow'));
  return el('div', {class: 'recent-list'}, records.map(record => {
    const song = state.songs.find(song => song.id === record.songId);
    return el('article', {class: 'recent-row'}, cover(song, 'recent-art'),
      el('div', {class: 'recent-info'}, el('h3', {}, button(song.title, () => openSong(song), 'title-button')), el('p', {text: `${song.artist || '아티스트 미등록'} · ${new Date(record.timestamp).toLocaleDateString('ko-KR', {month: 'short', day: 'numeric'})}`})),
      el('span', {class: 'recent-part', text: PARTS[record.part]}),
      button('', () => startPractice(song, record.part), 'recent-play', 'play', {'aria-label': `${song.title} ${PARTS[record.part]} 연습 이어가기`})
    );
  }));
}

function renderHome() {
  const practicing = state.songs.filter(song => song.status === 'practice');
  const intro = el('div', {class: 'home-intro'}, el('div', {}, el('p', {class: 'eyebrow', text: 'WELCOME TO YOUR PRACTICE ROOM'}), el('h1', {}, '오늘도, 우리의 ', el('span', {text: '하모니를.'})), el('p', {text: '한 곡씩, 한 파트씩. 함께 만드는 더 좋은 소리.'})), el('span', {class: 'intro-date', text: new Date().toLocaleDateString('ko-KR', {month: 'long', day: 'numeric', weekday: 'long'})}));
  app.append(intro, searchBar(true));
  if (state.songs.length && state.songs.every(song => (song.tags || []).includes('demo'))) app.append(el('p', {class: 'demo-banner', text: '데모 라이브러리입니다. 실제 팀 연습 자료는 데이터 편집기에서 등록해 주세요.'}));
  const pendingMedia = state.songs.filter(song => !availableParts(song).length).length;
  if (pendingMedia) app.append(el('p', {class: 'notice', text: `${pendingMedia}곡의 연습 영상이 아직 등록되지 않았어요. 영상이 등록된 파트부터 연습을 시작해 보세요.`}));
  if (!state.songs.length) { app.append(section('연습 라이브러리', '', songGrid([])), button('데이터 편집기 열기', () => openAdmin('./admin.html'), 'button primary')); return; }
  if (!practicing.length) {
    const emptyPractice = emptyState(
      '현재 연습 중인 곡이 없어요',
      '전체 곡 목록에서 원하는 곡을 찾아 ‘현재 연습에 추가’해 보세요.',
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
      button('모두 보기', () => { state.filters = {query: '', status: 'practice', category: '', difficulty: '', part: ''}; navigate({tab: 'songs'}); }, 'text-button', 'arrow')
    );
    app.append(section('지금 연습 중', `${practicing.length}곡의 하모니를 완성해 가고 있어요`, hero, practiceHeaderActions));
    if (practicing.length > 1) app.append(songGrid(practicing.slice(1, 5)));
  }
  const mine = state.myPart ? state.songs.filter(song => availableParts(song).includes(state.myPart)) : [];
  const myPanel = el('div', {class: 'quick-panel sage'}, el('div', {class: 'quick-panel-title'}, icon('mic'), el('h3', {text: state.myPart ? `내 파트 · ${PARTS[state.myPart]}` : '내 목소리를 찾아보세요'})),
    el('p', {text: state.myPart ? `${PARTS[state.myPart]} 영상이 등록된 ${mine.length}곡을 바로 연습할 수 있어요.` : '기본 파트를 선택하면 내 연습 영상이 먼저 보여요.'}),
    button(state.myPart ? '내 파트 곡 보기' : '내 파트 설정하기', () => { if (!state.myPart) navigate({tab: 'settings'}); else { state.filters = {query: '', status: '', category: '', difficulty: '', part: state.myPart}; navigate({tab: 'songs'}); } }, 'button secondary', 'arrow')
  );
  app.append(section('내 파트', '나에게 맞는 연습으로 바로 연결', myPanel));
  app.append(section('최근 연습', '마지막으로 부르던 파트부터 이어서', recentList(5), button('모두 보기', () => navigate({tab: 'recent'}), 'text-button', 'arrow')));
  const randomPanel = el('div', {class: 'quick-panel sand'});
  function updateRandom() {
    randomPanel.replaceChildren(el('div', {class: 'quick-panel-title'}, icon('shuffle'), el('h3', {text: '오늘은 어떤 곡을 불러볼까요?'})));
    if (state.random) {
      randomPanel.append(el('div', {class: 'random-result'}, cover(state.random, 'recent-art'), el('div', {}, el('strong', {text: state.random.title}), el('p', {text: state.random.artist}))), button('파트 선택 및 연습', () => openSong(state.random), 'button primary', 'play'));
    } else randomPanel.append(el('p', {text: '익숙한 곡도, 새로운 곡도. 가볍게 한 곡 골라보세요.'}));
    randomPanel.append(button(state.random ? '다른 곡 뽑기' : '랜덤 곡 선택', () => {
      const candidates = state.songs.filter(song => state.myPart ? availableParts(song).includes(state.myPart) : availableParts(song).length);
      if (!candidates.length) { toast(state.myPart ? '내 파트 영상이 등록된 곡이 없습니다.' : '아직 등록된 연습 영상이 없습니다.'); return; }
      state.random = candidates[Math.floor(Math.random() * candidates.length)]; updateRandom();
    }, 'button secondary', 'shuffle'));
  }
  updateRandom(); app.append(section('오늘의 랜덤 연습', '새로운 하모니와 만나는 작은 계기', randomPanel));
  app.append(section('연습 라이브러리', `${state.songs.length}곡, 하나의 연습실`, songGrid(state.songs.slice(0, 4)), button('전체 곡 보기', () => navigate({tab: 'songs'}), 'text-button', 'arrow')));

  const archivePanel = el('div', {class: 'quick-panel sage', style: 'margin-top: 16px;'},
    el('div', {class: 'quick-panel-title'}, icon('academic'), el('h3', {text: '아카라카 라운지 & 아카이브'})),
    el('p', {text: `공연 영상 ${state.performances.length}편, 악보 ${state.scores.length}건, 교육 자료 ${state.education.length}건, 팀의 추억 ${state.memories.length}건이 보관되어 있습니다.`}),
    el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;'},
      button('🎬 공연 영상 & 목록', () => navigate({tab: 'stage', view: 'list'}), 'button secondary small', 'stage'),
      button('🎼 악보 창고', () => navigate({tab: 'scores'}), 'button secondary small', 'document'),
      button('🎓 교육 자료', () => navigate({tab: 'education'}), 'button secondary small', 'academic'),
      button('📷 우리들의 기록', () => navigate({tab: 'memories'}), 'button secondary small', 'camera'),
      button('🎙️ 연습 일지 & 피드백', () => navigate({tab: 'rehearsal'}), 'button secondary small', 'notes')
    )
  );
  app.append(section('아카라카 아카이브', '함께 부르고 함께 나눈 모든 기록과 배움', archivePanel));
}

function renderBrowse(favoritesOnly = false) {
  const pageHeading = el('div', {class: 'page-heading'},
    el('div', {class: 'section-heading'},
      el('div', {},
        el('p', {class: 'eyebrow', text: favoritesOnly ? 'YOUR FAVORITES' : 'THE PRACTICE LIBRARY'}),
        el('h1', {text: favoritesOnly ? '자꾸 부르고 싶은 곡' : '어떤 하모니를 만들어 볼까요?'}),
        el('p', {text: favoritesOnly ? '마음에 담아둔 곡을 한곳에서 만나보세요.' : '곡, 아티스트, 파트를 검색하고 나에게 맞는 연습을 찾아보세요.'})
      ),
      !favoritesOnly && button('+ 새 곡 / 영상 추가', () => openAdmin('./admin.html?action=new'), 'button primary small')
    )
  );
  app.append(pageHeading);
  const filterContainer = el('div', {class: 'filter-panel'});
  const results = el('div', {id: 'song-results', 'aria-live': 'polite'});
  const base = () => favoritesOnly ? state.songs.filter(song => state.favorites.has(song.id)) : state.songs;
  function updateResults() {
    const matches = filterSongs(base(), {...state.filters, favorites: [...state.favorites]});
    const active = Object.values(state.filters).filter(value => String(value).trim()).length;
    const summary = el('div', {class: 'filter-summary'}, el('span', {}, el('strong', {text: String(matches.length)}), '곡', active ? ` · 필터 ${active}개 적용` : ''), active && button('필터 초기화', () => { state.filters = {query: '', status: '', category: '', difficulty: '', part: ''}; document.getElementById('song-search').value = ''; updateFilters(); updateResults(); }, 'text-button', 'close'));
    results.replaceChildren(el('h2', {class: 'sr-only', text: favoritesOnly ? '즐겨찾기 곡 목록' : '곡 검색 결과'}), summary, songGrid(matches,
      favoritesOnly && !state.favorites.size ? '즐겨찾기가 아직 없어요' : '찾는 곡이 없어요', favoritesOnly && !state.favorites.size ? '곡의 하트 버튼을 눌러 즐겨찾기에 담아보세요.' : '다른 검색어를 입력하거나 필터를 초기화해 보세요.'));
  }
  function updateFilters() {
    const statusOptions = [['', '전체'], ['practice', '현재 연습'], ['complete', '완료'], ['favorite', '즐겨찾기']];
    const statusRow = el('div', {class: 'filter-row'}, el('span', {class: 'filter-label', text: '상태'}), el('div', {class: 'chip-group'}, statusOptions.map(([value, label]) => button(label, () => { state.filters.status = value; updateFilters(); updateResults(); }, `chip${state.filters.status === value ? ' active' : ''}`, null, {'aria-pressed': String(state.filters.status === value)}))));
    const fields = [
      ['category', '장르', [...new Set(state.songs.map(song => song.category).filter(Boolean))].sort().map(value => [value, value])],
      ['difficulty', '난이도', Object.entries(levels)], ['part', '파트', Object.entries(PARTS)]
    ];
    filterContainer.replaceChildren(statusRow, el('div', {class: 'filter-selects'}, fields.map(([key, label, options]) => {
      const select = el('select', {id: `filter-${key}`, class: state.filters[key] ? 'active' : '', onchange: event => { state.filters[key] = event.target.value; event.target.classList.toggle('active', Boolean(event.target.value)); updateResults(); }}, el('option', {value: '', text: `모든 ${label}`}), options.map(([value, text]) => el('option', {value, text, selected: String(state.filters[key]) === String(value)})));
      return el('label', {for: `filter-${key}`}, el('span', {text: label}), select);
    })));
  }
  app.append(searchBar(false, updateResults), filterContainer, results); updateFilters(); updateResults();
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
    el('div', {class: 'stage-setlist-items'}, perf.setlist.map(item => {
      const song = state.songs.find(s => s.id === item.songId);
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
        ...perf.setlist.map(item => {
          const song = state.songs.find(s => s.id === item.songId);
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
      el('div', {class: 'stage-setlist-items'}, perf.setlist.map(item => {
        const song = state.songs.find(s => s.id === item.songId);
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

function renderStage() {
  if (state.route.view && (state.route.view === 'list' || state.route.view === 'cards')) {
    state.stageView = state.route.view;
  }

  app.append(
    el('div', {class: 'page-heading'},
      el('p', {class: 'eyebrow', text: 'OUR STAGE ARCHIVE'}),
      el('h1', {text: '우리의 무대 영상'}),
      el('p', {text: '정기 공연, 버스킹, 축제 등 관객과 함께 호흡한 소중한 순간들을 모아봅니다.'})
    )
  );

  if (!state.performances.length) {
    app.append(emptyState('등록된 공연 영상이 아직 없어요', '새로운 무대 실황 영상이 곧 등록됩니다.'));
    return;
  }

  // 1. View Mode Switcher Tabs
  const currentView = state.stageView || 'list';
  const viewTabs = el('div', {class: 'stage-view-tabs', role: 'tablist', 'aria-label': '공연 영상 보기 방식'},
    button('📋 목록으로 보기', () => {
      state.stageView = 'list';
      writeRoute({tab: 'stage', view: 'list'}, {replace: true});
      render();
    }, `stage-tab-btn${currentView === 'list' ? ' active' : ''}`, null, {role: 'tab', 'aria-selected': String(currentView === 'list')}),
    button('🎬 영상 카드로 보기', () => {
      state.stageView = 'cards';
      writeRoute({tab: 'stage', view: 'cards'}, {replace: true});
      render();
    }, `stage-tab-btn${currentView === 'cards' ? ' active' : ''}`, null, {role: 'tab', 'aria-selected': String(currentView === 'cards')})
  );

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

  const topControls = el('div', {class: 'stage-controls-panel'},
    el('div', {class: 'stage-tabs-row'},
      viewTabs,
      el('div', {class: 'stage-summary-text', id: 'stage-summary-count'})
    ),
    el('div', {class: 'search-box', style: 'margin-bottom: 20px;'},
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
      const setlistMatch = perf.setlist?.some(item =>
        (item.title || '').toLowerCase().includes(q) || (item.artist || '').toLowerCase().includes(q)
      );

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
  const audio = new Audio(audioData.url);
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

  const header = el('div', {class: 'audio-player-header'},
    el('span', {text: `🎙️ ${audioData.label || title}`}),
    rateBtn
  );

  const playBtn = button('재생', () => {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      playBtn.replaceChildren(icon('play'), document.createTextNode('재생'));
    } else {
      audio.play().then(() => {
        isPlaying = true;
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
    timeLabel.textContent = `${m}:${s}`;
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

  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration && !isNaN(audio.duration)) {
      rangeInput.max = audio.duration;
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!isScrubbing) {
      rangeInput.value = audio.currentTime;
      updateSliderTime(audio.currentTime);
    }
  });

  audio.addEventListener('ended', () => {
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

  card.append(header, row);

  return {
    element: card,
    audio,
    play() {
      audio.play().then(() => {
        isPlaying = true;
        playBtn.replaceChildren(icon('pause'), document.createTextNode('일시정지'));
      }).catch(() => {});
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
      const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
      audio.currentTime = Math.max(0, Math.min(sec, max));
      rangeInput.value = audio.currentTime;
      updateSliderTime(audio.currentTime);
    },
    isPlaying() {
      return isPlaying && !audio.paused;
    }
  };
}

function renderFeedbackSection(reh, playerInstance, audioCtrl) {
  const section = el('div', {class: 'feedback-section'});
  const title = el('div', {class: 'feedback-section-title'}, icon('chat'), el('span', {text: '팀원 피드백 (누구나 작성 가능)'}));

  const lastAuthor = read('last_feedback_author', '');
  const authorInput = el('input', {class: 'feedback-input-sm', placeholder: '이름/닉네임 (예: 지은)', value: lastAuthor});
  const partSelect = el('select', {class: 'feedback-input-sm'},
    el('option', {value: 'all', text: '전체 공통'}),
    el('option', {value: 'soprano', text: '소프라노'}),
    el('option', {value: 'alto', text: '알토'}),
    el('option', {value: 'tenor', text: '테너'}),
    el('option', {value: 'baritone', text: '바리톤'}),
    el('option', {value: 'bass', text: '베이스'}),
    el('option', {value: 'vp', text: 'VP'}),
    el('option', {value: 'part1', text: '1번 파트'}),
    el('option', {value: 'part2', text: '2번 파트'}),
    el('option', {value: 'part3', text: '3번 파트'}),
    el('option', {value: 'part4', text: '4번 파트'}),
    el('option', {value: 'part5', text: '5번 파트'})
  );

  let selectedTime = 0;
  const timeBtn = button('⏱️ 재생시간 가져오기', () => {
    let cur = 0;
    if (audioCtrl?.isPlaying && audioCtrl.isPlaying()) {
      cur = Math.floor(audioCtrl.getCurrentTime());
    } else if (playerInstance?.getCurrentTime) {
      cur = Math.floor(playerInstance.getCurrentTime());
    } else if (audioCtrl?.getCurrentTime) {
      cur = Math.floor(audioCtrl.getCurrentTime());
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
    toast('피드백을 등록했어요. 팀원 누구나 열람할 수 있습니다.');
    updateFeed();
  }, 'button primary small');

  const formBox = el('div', {class: 'feedback-form-box'},
    el('div', {class: 'feedback-form-row'}, authorInput, partSelect, timeBtn),
    textArea,
    el('div', {class: 'feedback-form-actions'},
      el('small', {style: 'color: var(--muted); font-size: 11px;', text: '팀원 모두에게 즉시 공개됩니다'}),
      submitBtn
    )
  );

  const feedHost = el('div', {class: 'feedback-feed'});
  function updateFeed() {
    const feedbacks = getAllFeedbacks(reh.id);
    if (!feedbacks.length) {
      feedHost.replaceChildren(el('p', {style: 'color: var(--muted); font-size: 12px; text-align: center; padding: 12px;', text: '아직 등록된 피드백이 없습니다. 첫 의견을 남겨보세요!'}));
      return;
    }
    feedHost.replaceChildren(...feedbacks.map(fb => {
      const m = String(Math.floor((fb.time || 0) / 60)).padStart(2, '0');
      const s = String((fb.time || 0) % 60).padStart(2, '0');
      const timeNode = fb.time ? el('button', {
        type: 'button',
        class: 'feedback-time-chip',
        title: `${m}:${s} 위치로 이동`,
        onclick: () => {
          let jumped = false;
          if (audioCtrl?.isPlaying && audioCtrl.isPlaying()) {
            audioCtrl.seekTo(fb.time);
            jumped = true;
          } else if (playerInstance?.seekTo) {
            playerInstance.seekTo(fb.time);
            playerInstance.play();
            jumped = true;
          } else if (audioCtrl?.seekTo) {
            audioCtrl.seekTo(fb.time);
            audioCtrl.play();
            jumped = true;
          }
          if (jumped) toast(`▶ ${m}:${s} 구간으로 이동합니다.`);
        }
      }, `⏱️ ${m}:${s}`) : null;

      const likedKeys = new Set(read('liked_feedbacks', []));
      const isLiked = likedKeys.has(fb.id);
      const likeBtn = button(`❤️ ${fb.likes || 0}`, () => {
        toggleFeedbackLike(fb.id);
        updateFeed();
      }, `feedback-like-btn${isLiked ? ' liked' : ''}`, null, {'aria-label': '피드백 공감'});

      return el('div', {class: 'feedback-bubble'},
        el('div', {class: 'feedback-bubble-top'},
          el('span', {class: 'feedback-author'}, `${fb.author} (${fb.part === 'all' ? '전체' : (PARTS[fb.part] || fb.part)})`),
          timeNode
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
  section.append(title, formBox, feedHost);
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
  dateInput.value = new Date().toISOString().slice(0, 10);
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
        date: dateInput.value || new Date().toISOString().slice(0, 10),
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

function renderRehearsal() {
  app.append(
    el('div', {class: 'page-heading'},
      el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
        el('div', {},
          el('p', {class: 'eyebrow', text: 'REHEARSAL & FEEDBACK HUB'}),
          el('h1', {text: '연습 일지 & 팀 피드백'}),
          el('p', {text: '회차별 런스루, 현장 녹음본을 모니터링하고 단원 누구나 자유롭게 피드백을 남겨요.'})
        ),
        button('+ 연습 일지 & 녹음본 등록', () => openNewRehearsalModal(), 'button primary small', 'plus')
      )
    )
  );

  if (!state.rehearsals.length) {
    app.append(emptyState('등록된 연습 일지가 아직 없어요', '첫 합주 연습 일지와 녹음본을 등록해 보세요.', button('+ 연습 일지 등록하기', () => openNewRehearsalModal(), 'button primary')));
    return;
  }

  const list = el('div', {class: 'rehearsal-grid'}, state.rehearsals.map(reh => {
    const song = state.songs.find(s => s.id === reh.songId);
    let activePlayerInstance = null;
    let audioCtrl = null;

    const mediaBox = el('div', {class: 'rehearsal-media-box'});
    if (reh.video?.url) {
      if (reh.video.type === 'local-video') {
        const videoEl = el('video', {
          controls: true,
          src: reh.video.url,
          style: 'width: 100%; border-radius: 12px; max-height: 480px; background: #000; margin-bottom: 12px;'
        });
        activePlayerInstance = {
          play: () => videoEl.play(),
          pause: () => videoEl.pause(),
          seekTo: (sec) => { videoEl.currentTime = sec; },
          getCurrentTime: () => videoEl.currentTime || 0,
          destroy: () => { videoEl.pause(); videoEl.src = ''; }
        };
        activePlayers.push(activePlayerInstance);
        mediaBox.append(videoEl);
      } else {
        const videoHost = el('div');
        activePlayerInstance = createPlayer(videoHost, reh.video, reh.title);
        activePlayers.push(activePlayerInstance);
        mediaBox.append(videoHost);
      }
    }

    if (reh.audio?.url && reh.audio.url.trim()) {
      audioCtrl = renderAudioPlayer(reh.audio, reh.title);
      mediaBox.append(audioCtrl.element);
    }

    if (!reh.video?.url && (!reh.audio?.url || !reh.audio.url.trim())) {
      mediaBox.append(
        el('div', {style: 'padding: 24px 16px; border: 2px dashed var(--border); border-radius: 12px; text-align: center; background: var(--surface-soft); margin-bottom: 16px;'},
          el('div', {style: 'font-size: 28px; margin-bottom: 6px;'}, '🎙️'),
          el('h3', {style: 'font-size: 15px; font-weight: 700; margin-bottom: 4px;'}, '연습 녹음본 또는 영상을 올려보세요'),
          el('p', {style: 'font-size: 12px; color: var(--muted); margin-bottom: 14px;'}, '컴퓨터의 녹음 파일(.mp3, .m4a, .wav 등)을 올리면 바로 재생하며 아래 구간별 피드백과 싱크를 맞출 수 있습니다.'),
          button('🎙️ 내 컴퓨터에서 녹음본/영상 파일 올리기', () => openAttachMediaModal(reh), 'button primary small', 'music')
        )
      );
    } else {
      mediaBox.append(
        el('div', {style: 'display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 12px;'},
          button('📁 녹음본/영상 파일 교체', () => openAttachMediaModal(reh), 'button ghost small', 'upload')
        )
      );
    }

    const feedbackSection = renderFeedbackSection(reh, activePlayerInstance, audioCtrl);

    const topActions = el('div', {style: 'display: flex; gap: 8px; align-items: center;'},
      song ? button('파트 연습실 이동', () => openSong(song), 'button primary small', 'play') : null,
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

  app.append(list);
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
      toast('악보 파일(PDF 또는 이미지)을 선택하거나 온라인 주소를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const scoreId = `score-custom-${Date.now()}`;
      let mediaId = null;
      let fileName = file?.name || '온라인 악보';
      let fileType = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '') ? 'pdf' : (file?.type?.startsWith('image') || /\.(jpg|png|jpeg|webp)$/i.test(file?.name || '')) ? 'image' : 'link';
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
        fileName,
        fileSize,
        fileUrl: url || '',
        mediaId,
        isCustom: true,
        uploadedAt: new Date().toISOString().slice(0, 10)
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

function openOrDownloadScore(score, isDownload = false) {
  const fileUrl = score.blobUrl || score.fileUrl;
  if (!fileUrl) {
    toast('첨부된 악보 파일이 없습니다. 새 악보를 등록해 주세요.');
    return;
  }
  if (isDownload) {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = score.fileName || `${score.title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('📥 악보 파일을 다운로드합니다.');
  } else {
    window.open(fileUrl, '_blank');
  }
}


function renderScores() {
  const songOptions = [{ value: '', label: '전체 곡 악보 보기' }];
  for (const s of state.songs) {
    if (state.scores.some(sc => sc.songId === s.id)) {
      songOptions.push({ value: s.id, label: s.title });
    }
  }

  const categoryOptions = ['전체', '총보', '파트보', '가사/리드시트'];

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'OUR SCORE ARCHIVE'}),
        el('h1', {text: '악보 창고'}),
        el('p', {text: '우리 팀의 총보, 파트보, 가사지 모음. 언제 어디서나 바로 열람하고 다운로드하세요.'})
      ),
      button('+ 새 악보 올리기', () => openUploadScoreModal(), 'button primary small', 'plus')
    )
  );

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '악보 제목, 곡명, 편곡자 검색...',
    value: state.scoreFilters.query || '',
    oninput: (e) => {
      state.scoreFilters.query = e.target.value;
      updateScoreList();
    }
  });

  const categoryChips = el('div', {class: 'chip-group'},
    categoryOptions.map(cat => button(cat, () => {
      state.scoreFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateScoreList();
    }, `chip${(state.scoreFilters.category === cat || (!state.scoreFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const songSelect = el('select', {
    class: 'filter-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12px;',
    onchange: (e) => {
      state.scoreFilters.songId = e.target.value;
      updateScoreList();
    }
  }, songOptions.map(opt => el('option', {
    value: opt.value,
    text: opt.label,
    selected: state.scoreFilters.songId === opt.value
  })));

  const filterPanel = el('section', {class: 'filter-panel', style: 'margin-bottom: 24px;'},
    el('div', {style: 'margin-bottom: 12px;'}, searchInput),
    el('div', {style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;'},
      categoryChips,
      songSelect
    )
  );

  const gridContainer = el('div', {class: 'score-grid'});

  function getFilteredScores() {
    const q = (state.scoreFilters.query || '').trim().toLowerCase();
    const cat = state.scoreFilters.category || '';
    const sId = state.scoreFilters.songId || '';

    return state.scores.filter(sc => {
      if (cat && sc.category !== cat) return false;
      if (sId && sc.songId !== sId) return false;
      if (q) {
        const song = state.songs.find(s => s.id === sc.songId);
        const matchTitle = sc.title.toLowerCase().includes(q);
        const matchSong = song?.title?.toLowerCase().includes(q);
        const matchArranger = sc.arranger?.toLowerCase().includes(q);
        const matchMemo = sc.memo?.toLowerCase().includes(q);
        if (!matchTitle && !matchSong && !matchArranger && !matchMemo) return false;
      }
      return true;
    });
  }

  function updateScoreList() {
    const filtered = getFilteredScores();
    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('조건에 맞는 악보가 없습니다', '검색어를 바꾸거나 새 악보를 직접 등록해 보세요.', button('+ 악보 등록하기', () => openUploadScoreModal(), 'button primary small'))
      );
      return;
    }

    gridContainer.replaceChildren(...filtered.map(sc => {
      const song = state.songs.find(s => s.id === sc.songId);

      const badges = el('div', {class: 'score-badges'},
        el('span', {class: 'badge', text: sc.category || '총보'}),
        sc.part && sc.part !== 'all' && el('span', {class: 'status-badge', text: PARTS[sc.part] || sc.part}),
        song && el('span', {class: 'part-pill', text: song.title})
      );

      const iconBadge = el('div', {class: 'score-icon-badge'}, icon('document'));

      const top = el('div', {class: 'score-top'},
        iconBadge,
        el('div', {class: 'score-info'},
          badges,
          el('h2', {class: 'score-title', text: sc.title}),
          el('p', {class: 'score-arranger', text: `${sc.arranger || '아카라카'} ${sc.uploadedAt ? `· ${sc.uploadedAt}` : ''}`})
        )
      );

      const memo = sc.memo ? el('p', {class: 'score-memo', text: sc.memo}) : null;

      const metaRow = el('div', {class: 'score-meta-row'},
        el('span', {text: `${sc.pages || ''} ${sc.fileSize ? `· ${sc.fileSize}` : ''}`.trim() || '악보 자료'}),
        el('span', {class: 'badge', style: 'font-size: 10px;', text: sc.fileType === 'pdf' ? 'PDF 악보' : sc.fileType === 'image' ? '악보 이미지' : '클라우드'})
      );

      const actions = el('div', {class: 'score-actions'},
        button('📖 악보 열기', () => openOrDownloadScore(sc, false), 'button primary small', 'external'),
        button('📥 다운로드', () => openOrDownloadScore(sc, true), 'button secondary small', 'download'),
        song ? button('연습실 ↗', () => openSong(song), 'button ghost small') : null,
        sc.isCustom ? button('삭제', async () => {
          if (confirm(`'${sc.title}' 악보를 삭제할까요?`)) {
            await deleteCustomScore(sc.id);
            state.scores = await loadScores(true);
            render();
            toast('악보를 삭제했습니다.');
          }
        }, 'button secondary small danger', 'trash') : null
      );

      return el('article', {class: 'score-card'}, top, memo, metaRow, actions);
    }));
  }

  updateScoreList();
  app.append(heading, filterPanel, gridContainer);
}


/* -------------------------------------------------------------
 *  ACAPELLA EDUCATION (아카펠라 교육 자료)
 * ------------------------------------------------------------- */

function openUploadEducationModal() {
  const dialog = document.getElementById('upload-education-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-education-form');
  const titleInput = document.getElementById('edu-title-input');
  const categorySelect = document.getElementById('edu-category-select');
  const targetSelect = document.getElementById('edu-target-select');
  const authorInput = document.getElementById('edu-author-input');
  const descInput = document.getElementById('edu-desc-input');
  const fileInput = document.getElementById('edu-file-input');
  const urlInput = document.getElementById('edu-url-input');
  const cancelBtn = document.getElementById('upload-edu-cancel');
  const submitBtn = document.getElementById('upload-edu-submit');

  titleInput.value = '';
  categorySelect.value = '교재 / PDF';
  targetSelect.value = '초등 학생용';
  authorInput.value = read('last_feedback_author', '아카라카 교육연구회');
  descInput.value = '';
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '교육 자료 등록하기';

  const closeBtn = document.getElementById('upload-education-close');
  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('자료 제목을 입력해 주세요.');
      return;
    }

    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();

    if (!file && !url) {
      toast('내 컴퓨터에서 파일을 선택하거나 온라인 링크를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const eduId = `edu-custom-${Date.now()}`;
      let mediaId = null;
      let fileUrl = url || '';
      let format = 'other';
      let fileName = '';
      let fileSize = '';

      if (file) {
        mediaId = `media-edu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        fileName = file.name;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        fileSize = sizeMb >= 1 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;

        const record = await saveMediaFile(mediaId, file, { title });
        if (!record) throw new Error('파일 저장에 실패했습니다.');

        if (record.isPpt || /\.(ppt|pptx)$/i.test(fileName)) format = 'ppt';
        else if (record.isPdf || /\.pdf$/i.test(fileName)) format = 'pdf';
        else if (record.isVideo) format = 'video';
        else if (record.isAudio) format = 'audio';
        else format = 'file';
      } else if (url) {
        if (url.includes('youtube.com') || url.includes('youtu.be')) format = 'video';
        else if (/\.pdf($|\?)/i.test(url)) format = 'pdf';
        else if (/\.(ppt|pptx)($|\?)/i.test(url)) format = 'ppt';
        else format = 'link';
      }

      const category = categorySelect.value;
      const target = targetSelect.value;
      const author = authorInput.value.trim() || '아카라카';
      const description = descInput.value.trim();

      const newEdu = {
        id: eduId,
        title,
        category,
        format,
        target,
        author,
        date: new Date().toISOString().slice(0, 10),
        description,
        fileName,
        fileSize,
        fileUrl,
        mediaId,
        isCustom: true
      };

      addCustomEducation(newEdu);
      state.education = await loadEducation(true);
      dialog.close();
      render();
      toast('🎓 교육 자료가 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('자료 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '교육 자료 등록하기';
    }
  };

  dialog.showModal();
}

function openOrDownloadEducation(edu, forceDownload = false) {
  const fileUrl = edu.blobUrl || edu.fileUrl || edu.videoUrl;
  if (!fileUrl) {
    toast('첨부된 파일이나 링크가 없습니다.');
    return;
  }

  if (edu.format === 'video' && !forceDownload) {
    if (fileUrl.includes('youtube') || fileUrl.includes('youtu.be')) {
      openMemoryLightboxModal({
        id: edu.id,
        title: edu.title,
        type: 'video',
        category: '강의 / 교육 영상',
        videoUrl: fileUrl,
        date: edu.date,
        venue: '교육 영상',
        author: edu.author,
        description: edu.description
      });
      return;
    }
  }

  if (forceDownload || edu.format === 'ppt' || edu.format === 'file') {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = edu.fileName || `${edu.title}.${edu.format === 'ppt' ? 'pptx' : edu.format === 'pdf' ? 'pdf' : 'dat'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast(`📥 '${edu.title}' 파일을 다운로드합니다.`);
  } else {
    window.open(fileUrl, '_blank');
  }
}

function renderEducation() {
  const categoryOptions = ['전체', '교재 / PDF', '발표 슬라이드 (PPT)', '강의 / 교육 영상', '발성 & 화음 지도안'];
  const targetOptions = ['전체 대상', '초등 학생용', '교사 연수용', '아카펠라 동아리', '공통'];

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'ACAPELLA EDUCATION & WORKSHOPS'}),
        el('h1', {text: '아카펠라 교육 자료'}),
        el('p', {text: '선생님과 학생이 함께하는 아카펠라 지도법, 워크숍 슬라이드(PPT), 교재 PDF, 수업 강의 영상 자료실입니다.'})
      ),
      button('+ 새 교육 자료 올리기', () => openUploadEducationModal(), 'button primary small', 'plus')
    )
  );

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '자료 제목, 강사, 주제, 교육 대상 검색...',
    value: state.educationFilters.query || '',
    oninput: (e) => {
      state.educationFilters.query = e.target.value;
      updateEduList();
    }
  });

  const categoryChips = el('div', {class: 'chip-group', style: 'margin-bottom: 12px;'},
    categoryOptions.map(cat => button(cat, () => {
      state.educationFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateEduList();
    }, `chip${(state.educationFilters.category === cat || (!state.educationFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const targetSelect = el('select', {
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.educationFilters.target = e.target.value === '전체 대상' ? '' : e.target.value;
      updateEduList();
    }
  }, targetOptions.map(t => el('option', {value: t, selected: (!state.educationFilters.target && t === '전체 대상') || state.educationFilters.target === t}, t)));

  const filterRow = el('div', {style: 'display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;'},
    categoryChips,
    el('div', {style: 'display: flex; align-items: center; gap: 8px;'},
      el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '대상별:'),
      targetSelect
    )
  );

  const filterPanel = el('div', {class: 'search-box', style: 'margin-bottom: 20px;'},
    el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
    filterRow
  );

  const gridContainer = el('div', {class: 'edu-grid'});

  function getFilteredEducation() {
    const q = (state.educationFilters.query || '').trim().toLowerCase();
    const cat = state.educationFilters.category || '';
    const tgt = state.educationFilters.target || '';

    return state.education.filter(item => {
      if (cat && item.category !== cat) return false;
      if (tgt && item.target && !item.target.includes(tgt) && !tgt.includes(item.target)) return false;
      if (q) {
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchAuthor = item.author?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchTarget = item.target?.toLowerCase().includes(q);
        const matchTags = item.tags?.some(t => t.toLowerCase().includes(q));
        if (!matchTitle && !matchAuthor && !matchDesc && !matchTarget && !matchTags) return false;
      }
      return true;
    });
  }

  function updateEduList() {
    const filtered = getFilteredEducation();
    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('조건에 맞는 교육 자료가 없습니다', '검색어를 바꾸거나 새 아카펠라 교육 자료를 등록해 보세요.', button('+ 자료 등록하기', () => openUploadEducationModal(), 'button primary small', 'plus'))
      );
      return;
    }

    gridContainer.replaceChildren(...filtered.map(item => {
      const fmt = item.format || (item.fileName?.endsWith('.pptx') || item.fileName?.endsWith('.ppt') ? 'ppt' : item.fileName?.endsWith('.pdf') ? 'pdf' : item.videoUrl ? 'video' : 'other');

      let iconType = 'document';
      let iconClass = 'other';
      let formatLabel = '자료';

      if (fmt === 'ppt') {
        iconType = 'presentation';
        iconClass = 'ppt';
        formatLabel = '📊 PPT 슬라이드';
      } else if (fmt === 'pdf') {
        iconType = 'document';
        iconClass = 'pdf';
        formatLabel = '📑 PDF 교재';
      } else if (fmt === 'video') {
        iconType = 'play';
        iconClass = 'video';
        formatLabel = '🎬 교육 영상';
      } else if (fmt === 'audio') {
        iconType = 'audio';
        iconClass = 'audio';
        formatLabel = '🎵 실습 음원';
      } else {
        iconType = 'academic';
        iconClass = 'other';
        formatLabel = '📂 교육 자료';
      }

      const iconBadge = el('div', {class: `edu-icon-badge ${iconClass}`}, icon(iconType));

      const badges = el('div', {class: 'edu-badges'},
        el('span', {class: 'badge', text: formatLabel}),
        item.target && el('span', {class: 'status-badge', text: item.target}),
        item.category && item.category !== formatLabel && el('span', {class: 'part-pill', text: item.category})
      );

      const top = el('div', {class: 'edu-top'},
        iconBadge,
        el('div', {class: 'edu-info'},
          badges,
          el('h2', {class: 'edu-title', text: item.title}),
          el('p', {class: 'edu-author', text: `${item.author || '아카라카'} ${item.date ? `· ${item.date}` : ''}`})
        )
      );

      const desc = item.description ? el('p', {class: 'edu-desc', text: item.description}) : null;

      const metaRow = el('div', {class: 'edu-meta-row'},
        el('span', {text: `${item.slides || item.pages || ''} ${item.fileSize ? `· ${item.fileSize}` : ''}`.trim() || '아카펠라 교육 자산'}),
        el('span', {class: 'badge', style: 'font-size: 10.5px;', text: item.format?.toUpperCase() || '자료'})
      );

      const actions = el('div', {class: 'edu-actions'},
        fmt === 'video'
          ? button('🎬 영상 보기', () => openOrDownloadEducation(item, false), 'button primary small', 'play')
          : fmt === 'ppt'
          ? button('📥 PPT 다운로드', () => openOrDownloadEducation(item, true), 'button primary small', 'download')
          : button('📖 자료 열기', () => openOrDownloadEducation(item, false), 'button primary small', 'external'),
        (item.blobUrl || item.fileUrl) && fmt !== 'ppt'
          ? button('📥 다운로드', () => openOrDownloadEducation(item, true), 'button secondary small', 'download')
          : null,
        item.isCustom ? button('삭제', async () => {
          if (confirm(`'${item.title}' 교육 자료를 삭제할까요?`)) {
            await deleteCustomEducation(item.id);
            state.education = await loadEducation(true);
            render();
            toast('교육 자료를 삭제했습니다.');
          }
        }, 'button secondary small danger', 'trash') : null
      );

      return el('article', {class: 'edu-card'}, top, desc, metaRow, actions);
    }));
  }

  updateEduList();
  app.append(heading, filterPanel, gridContainer);
}


/* -------------------------------------------------------------
 *  MEMORIES & MOMENTS (우리들의 기록)
 * ------------------------------------------------------------- */

function openUploadMemoryModal(defaultSongId = '') {
  const dialog = document.getElementById('upload-memory-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-memory-form');
  const titleInput = document.getElementById('mem-title-input');
  const categorySelect = document.getElementById('mem-category-select');
  const dateInput = document.getElementById('mem-date-input');
  const venueInput = document.getElementById('mem-venue-input');
  const authorInput = document.getElementById('mem-author-input');
  const descInput = document.getElementById('mem-desc-input');
  const tagsInput = document.getElementById('mem-tags-input');
  const fileInput = document.getElementById('mem-file-input');
  const urlInput = document.getElementById('mem-url-input');
  const cancelBtn = document.getElementById('upload-mem-cancel');
  const submitBtn = document.getElementById('upload-mem-submit');

  titleInput.value = '';
  categorySelect.value = '숏츠 영상';
  dateInput.value = new Date().toISOString().slice(0, 10);
  venueInput.value = '';
  authorInput.value = read('last_feedback_author', '아카라카');
  descInput.value = '';
  tagsInput.value = '';
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '기록 올리기';

  const closeBtn = document.getElementById('upload-memory-close');
  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('기록 제목을 입력해 주세요.');
      return;
    }

    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();

    if (!file && !url) {
      toast('사진/영상 파일을 선택하거나 YouTube 숏츠 주소를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const memId = `mem-custom-${Date.now()}`;
      let mediaId = null;
      let mediaUrl = url || '';
      let thumbnail = '';
      let type = 'photo';

      if (file) {
        mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = await saveMediaFile(mediaId, file, { title });
        if (!record) throw new Error('파일 저장에 실패했습니다.');
        type = file.type.startsWith('video') ? 'video' : 'photo';
      } else if (url) {
        type = url.includes('/shorts/') ? 'shorts' : (url.includes('youtube.com') || url.includes('youtu.be')) ? 'video' : 'photo';
        const ytInfo = parseYouTube({ type: 'video', url });
        if (ytInfo.ok && ytInfo.videoId) {
          thumbnail = `https://img.youtube.com/vi/${ytInfo.videoId}/hqdefault.jpg`;
        }
      }

      const tags = tagsInput.value
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const newMemory = {
        id: memId,
        title,
        category: categorySelect.value || '기록',
        type,
        date: dateInput.value || new Date().toISOString().slice(0, 10),
        venue: venueInput.value.trim(),
        author: authorInput.value.trim() || '아카라카',
        description: descInput.value.trim(),
        tags,
        mediaUrl,
        thumbnail,
        mediaId,
        likes: 0,
        isCustom: true
      };

      addCustomMemory(newMemory);
      state.memories = await loadMemories(true);
      dialog.close();
      render();
      toast('✨ 우리들의 기록에 새 이야기가 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('기록 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '기록 올리기';
    }
  };

  dialog.showModal();
}

function openMemoryLightboxModal(memory) {
  const dialog = document.getElementById('memory-lightbox-dialog');
  if (!dialog) return;

  const titleEl = document.getElementById('lightbox-title');
  const badgeEl = document.getElementById('lightbox-badge');
  const containerEl = document.getElementById('lightbox-media-container');
  const descEl = document.getElementById('lightbox-desc');
  const metaEl = document.getElementById('lightbox-meta');
  const likeBtn = document.getElementById('lightbox-like-btn');
  const closeBtn = document.getElementById('memory-lightbox-close');

  const cleanupLightbox = () => {
    while (activePlayers.length) {
      const ap = activePlayers.pop();
      if (ap && typeof ap.destroy === 'function') ap.destroy();
    }
    containerEl.replaceChildren();
  };

  if (closeBtn) closeBtn.onclick = () => { cleanupLightbox(); dialog.close(); };
  dialog.onclick = (e) => {
    if (e.target === dialog) { cleanupLightbox(); dialog.close(); }
  };
  dialog.onclose = () => cleanupLightbox();

  titleEl.textContent = memory.title;
  badgeEl.textContent = memory.category || (memory.type === 'shorts' ? '숏츠' : '사진');
  descEl.textContent = memory.description || '';
  metaEl.textContent = `📅 ${memory.date || ''} ${memory.venue ? `· 📍 ${memory.venue}` : ''} ${memory.author ? `· ✍️ ${memory.author}` : ''}`;

  containerEl.replaceChildren();

  if (memory.type === 'shorts' || (memory.videoUrl && memory.videoUrl.includes('youtube')) || (memory.mediaUrl && memory.mediaUrl.includes('youtube'))) {
    const videoUrl = memory.videoUrl || memory.mediaUrl;
    const playerHost = el('div', {style: 'width: 100%; max-width: 380px; aspect-ratio: 9/16; max-height: 60vh;'});
    const p = createPlayer(playerHost, { type: 'video', url: videoUrl }, memory.title);
    if (p && typeof p.mount === 'function') {
      p.mount();
    }
    activePlayers.push(p);
    containerEl.append(playerHost);
  } else if (memory.type === 'video' || (memory.mediaUrl && /\.(mp4|webm|mov)$/i.test(memory.mediaUrl))) {
    const videoEl = el('video', {
      controls: true,
      autoplay: true,
      src: memory.mediaUrl,
      style: 'max-width: 100%; max-height: 60vh; border-radius: 8px;'
    });
    activePlayers.push({
      destroy: () => { videoEl.pause(); videoEl.src = ''; }
    });
    containerEl.append(videoEl);
  } else {
    const imgUrl = memory.mediaUrl || memory.thumbnail;
    const imgEl = el('img', {
      src: imgUrl,
      alt: memory.title,
      style: 'max-width: 100%; max-height: 60vh; object-fit: contain;'
    });
    containerEl.append(imgEl);
  }

  const likedKeys = new Set(read('liked_memories', []));
  const isLiked = likedKeys.has(memory.id);
  likeBtn.className = `button secondary small${isLiked ? ' primary' : ''}`;
  likeBtn.textContent = `❤️ ${memory.likes || 0}`;

  likeBtn.onclick = () => {
    const res = toggleMemoryLike(memory.id);
    likeBtn.className = `button secondary small${res.isLiked ? ' primary' : ''}`;
    likeBtn.textContent = `❤️ ${res.count}`;
    render();
  };

  dialog.showModal();
}

function renderMemories() {
  const categoryOptions = ['전체', '숏츠 영상', '사진 앨범', '비하인드', '공연 추억'];

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'OUR MOMENTS & STORIES'}),
        el('h1', {text: '우리들의 기록'}),
        el('p', {text: '아카라카의 무대 뒤 이야기, 숏츠 영상, 사진 앨범. 함께 만들어가는 소중한 순간들을 기록합니다.'})
      ),
      button('+ 우리들의 기록 올리기', () => openUploadMemoryModal(), 'button primary small', 'camera')
    )
  );

  const categoryChips = el('div', {class: 'chip-group', style: 'margin-bottom: 24px;'},
    categoryOptions.map(cat => button(cat, () => {
      state.memoryFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateMemoryList();
    }, `chip${(state.memoryFilters.category === cat || (!state.memoryFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const gridContainer = el('div', {class: 'memory-grid'});

  function getFilteredMemories() {
    const cat = state.memoryFilters.category || '';
    if (!cat) return state.memories;
    return state.memories.filter(m => m.category === cat || (cat === '숏츠 영상' && m.type === 'shorts') || (cat === '사진 앨범' && m.type === 'photo'));
  }

  function updateMemoryList() {
    const filtered = getFilteredMemories();
    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('등록된 기록이 아직 없어요', '연습실 숏츠 영상이나 무대 사진을 첫 번째로 올려보세요!', button('+ 기록 올리기', () => openUploadMemoryModal(), 'button primary small'))
      );
      return;
    }

    gridContainer.replaceChildren(...filtered.map(mem => {
      const isShorts = mem.type === 'shorts';
      const thumbUrl = mem.thumbnail || mem.mediaUrl || 'https://img.youtube.com/vi/kJ0nfArx9GI/hqdefault.jpg';

      const mediaWrap = el('div', {
        class: `memory-media-wrap${isShorts ? ' is-shorts' : ''}`,
        onclick: () => openMemoryLightboxModal(mem)
      },
        el('img', {class: 'memory-thumb', src: thumbUrl, alt: mem.title, loading: 'lazy'}),
        el('span', {class: 'memory-type-pill', text: isShorts ? '📱 숏츠' : mem.type === 'video' ? '🎬 영상' : '📷 사진'}),
        el('div', {class: 'memory-play-btn'},
          el('div', {class: 'memory-play-circle'}, icon(isShorts || mem.type === 'video' ? 'play' : 'eye'))
        )
      );

      const titleNode = el('h2', {
        class: 'memory-card-title',
        text: mem.title,
        onclick: () => openMemoryLightboxModal(mem)
      });

      const descNode = mem.description ? el('p', {class: 'memory-card-desc', text: mem.description}) : null;

      const tagsNode = mem.tags?.length ? el('div', {class: 'memory-tags-row'},
        mem.tags.map(t => el('span', {class: 'memory-tag', text: `#${t}`}))
      ) : null;

      const likedKeys = new Set(read('liked_memories', []));
      const isLiked = likedKeys.has(mem.id);

      const likeBtn = button(`❤️ ${mem.likes || 0}`, (e) => {
        e.stopPropagation();
        const res = toggleMemoryLike(mem.id);
        likeBtn.className = `memory-like-button${res.isLiked ? ' liked' : ''}`;
        likeBtn.textContent = `❤️ ${res.count}`;
      }, `memory-like-button${isLiked ? ' liked' : ''}`);

      const footer = el('div', {class: 'memory-footer'},
        el('span', {text: `📅 ${mem.date || ''} ${mem.venue ? `· ${mem.venue}` : ''}`}),
        el('div', {style: 'display: flex; align-items: center; gap: 8px;'},
          likeBtn,
          mem.isCustom ? button('삭제', async (e) => {
            e.stopPropagation();
            if (confirm(`'${mem.title}' 기록을 삭제할까요?`)) {
              await deleteCustomMemory(mem.id);
              state.memories = await loadMemories(true);
              render();
              toast('기록을 삭제했습니다.');
            }
          }, 'button secondary small danger', 'trash') : null
        )
      );

      const body = el('div', {class: 'memory-body'}, titleNode, descNode, tagsNode, footer);

      return el('article', {class: 'memory-card'}, mediaWrap, body);
    }));
  }

  updateMemoryList();
  app.append(heading, categoryChips, gridContainer);
}

function showQR(song, part = null) {
  const dialog = document.getElementById('qr-dialog');
  if (!dialog) return;
  const url = routeUrl({song: song.id, part}).href;
  const img = document.getElementById('qr-image');
  const title = document.getElementById('qr-target-title');
  const copyBtn = document.getElementById('qr-copy-btn');
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
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
function openPitchPipe() {
  const dialog = document.getElementById('pitch-dialog');
  if (!dialog) return;

  const noteDisplay = document.getElementById('pitch-now-note');
  const freqDisplay = document.getElementById('pitch-now-freq');
  const octaveChipsHost = document.getElementById('pitch-octave-chips');
  const keyboardHost = document.getElementById('pitch-keyboard');
  const stopBtn = document.getElementById('pitch-stop-btn');
  const presetA4 = document.getElementById('pitch-preset-a4');
  const presetC4 = document.getElementById('pitch-preset-c4');

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

  subscribePitchState((playing) => {
    renderStatus(playing);
    renderKeyboard();
  });

  renderStatus(getCurrentPlaying());
  renderOctaves();
  renderKeyboard();

  stopBtn.onclick = () => stopPitch();
  presetA4.onclick = () => { currentOctave = 4; renderOctaves(); playPitch(9, 4); };
  presetC4.onclick = () => { currentOctave = 4; renderOctaves(); playPitch(0, 4); };

  dialog.addEventListener('close', () => stopPitch(), { once: true });
  dialog.showModal();
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

  const pitchBtn = button('첫 음 조율 (피치파이프)', () => openPitchPipe(), 'text-button practice-pitch-btn', 'music');
  const subrow = el('div', {class: 'practice-subrow'}, speedGroup, pitchBtn);

  const panel = el('div', {class: 'practice-controller-panel', role: 'region', 'aria-label': '연습 플레이어 컨트롤러'},
    controlRow, subrow
  );

  player.onStateChange(st => {
    isPlaying = st.isPlaying;
    currentRate = st.currentRate;
    playBtn.replaceChildren(icon(isPlaying ? 'pause' : 'play'), document.createTextNode(isPlaying ? '일시정지' : '재생'));
  });

  return panel;
}

function renderDetail(song) {
  const parts = availableParts(song);
  const preferred = preferredPart(song, state.myPart);
  const songPerformances = getPerformancesForSong(state.performances, song.id);
  const songRehearsals = getRehearsalsForSong(state.rehearsals, song.id);
  const songScores = getScoresForSong(state.scores, song.id);

  app.append(button('목록으로', () => navigate({tab: 'songs'}), 'text-button back-button', 'back'));
  const detail = el('div', {class: 'detail-layout'},
    el('div', {class: 'detail-cover'}, cover(song, 'detail-cover-image')),
    el('div', {class: 'detail-content'}, el('p', {class: 'eyebrow', text: 'FIND YOUR VOICE'}), el('h1', {text: song.title}), el('p', {class: 'detail-artist', text: song.artist || '아티스트 미등록'}),
      el('div', {class: 'detail-meta'}, [song.category, levels[song.difficulty], song.arrangement, statuses[song.status]].filter(Boolean).map(text => el('span', {class: 'badge', text}))),
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
        songRehearsals.length ? button(`연습 일지 & 피드백 (${songRehearsals.length})`, () => navigate({tab: 'rehearsal'}), 'button secondary', 'notes') : null
      ),
      preferred && progressBar(percentage(song.id, preferred), `${PARTS[preferred]} 연습 진행도`)
    )
  );
  app.append(detail);
  if (state.myPart && parts.includes(state.myPart)) app.append(el('section', {class: 'my-part-callout'}, el('p', {class: 'eyebrow', text: 'MY PART'}), button(`${PARTS[state.myPart]} 바로 연습`, () => startPractice(song, state.myPart), 'button primary', 'play')));
  const partsSection = section('파트를 선택해 주세요', '내 목소리를 하나씩 쌓아가요', parts.length ? el('div', {class: 'part-grid'}, parts.map(part => button(
    [el('strong', {text: PARTS[part]}), el('span', {class: 'part-subtitle', text: part === state.myPart ? 'MY PART · 바로 연습' : part === 'full' ? '모든 목소리를 함께' : '파트별 연습'}), icon('play')],
    () => startPractice(song, part), `part-button${part === state.myPart ? ' my-part' : ''}`,
    null, {'aria-label': `${PARTS[part]} ${part === state.myPart ? '내 파트 ' : ''}연습 시작`}
  ))) : emptyState('아직 등록된 연습 영상이 없습니다.', '데이터 편집기에서 파트별 YouTube 주소를 등록해 주세요.', button('영상 등록하기', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'button secondary')),
  button('+ 영상 추가 / 수정', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'text-button', 'external'));
  app.append(partsSection);

  if (songScores.length) {
    app.append(section('이 곡의 악보', '총보 및 파트보 악보를 바로 열람하거나 다운로드하세요.',
      el('div', {class: 'score-grid'}, songScores.map(sc => {
        return el('article', {class: 'score-card', style: 'padding: 16px;'},
          el('div', {class: 'score-top'},
            el('div', {class: 'score-icon-badge'}, icon('document')),
            el('div', {class: 'score-info'},
              el('span', {class: 'badge', text: sc.category || '총보'}),
              sc.part && sc.part !== 'all' && el('span', {class: 'status-badge', style: 'margin-left: 4px;', text: PARTS[sc.part] || sc.part}),
              el('h3', {style: 'font-size: 15px; font-weight: 700; margin: 4px 0;', text: sc.title}),
              el('p', {style: 'font-size: 11px; color: var(--muted);', text: `${sc.pages || ''} ${sc.fileSize ? `· ${sc.fileSize}` : ''}`})
            )
          ),
          el('div', {class: 'score-actions', style: 'margin-top: 8px;'},
            button('📖 악보 열기', () => openOrDownloadScore(sc, false), 'button primary small', 'external'),
            button('📥 다운로드', () => openOrDownloadScore(sc, true), 'button secondary small', 'download')
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

function renderPractice(song, part, record = true) {
  if (record) recordPractice(song, part);
  const parts = availableParts(song); const index = parts.indexOf(part);
  const songRehearsals = getRehearsalsForSong(state.rehearsals, song.id);
  const songPerformances = getPerformancesForSong(state.performances, song.id);
  const rehearsalAudio = songRehearsals[0]?.audio?.url ? songRehearsals[0].audio : null;

  app.append(button('파트 선택으로', () => openSong(song), 'text-button back-button', 'back'),
    el('div', {class: 'practice-heading'}, el('div', {}, el('p', {class: 'eyebrow', text: 'MAKE THIS MOMENT COUNT'}), el('h1', {text: song.title}), el('p', {text: song.artist})), el('span', {class: 'part-indicator', text: PARTS[part]})));
  
  const playerHost = el('div', {class: 'player-panel'});
  const playerLayout = el('div', {class: 'practice-layout'}, playerHost);
  state.player = createPlayer(playerHost, song.videos[part], `${song.title} · ${PARTS[part]} 연습`);
  const controller = renderPlayerController(state.player, song, part);

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

  const actions = el('div', {class: 'player-actions'},
    button('처음부터', () => state.player?.restart(), 'button secondary', 'clock'),
    button('QR 코드', () => showQR(song, part), 'button secondary', 'qr'),
    button('파트 공유', () => share(song, part), 'button secondary', 'share'),
    button('영상 수정', () => openAdmin(`./admin.html?song=${encodeURIComponent(song.id)}`), 'button secondary', 'external'),
    songPerformances.length ? button('무대 실황', () => navigate({tab: 'stage'}), 'button secondary', 'stage', {'aria-label': '이 곡의 무대 실황 영상 보기'}) : null,
    songRehearsals.length ? button('연습 일지 & 피드백', () => navigate({tab: 'rehearsal'}), 'button secondary', 'notes', {'aria-label': '이 곡의 연습 일지 및 피드백 보기'}) : null,
    favoriteButton(song)
  );
  const switches = el('div', {class: 'part-switcher'}, button('이전 파트', () => startPractice(song, parts[index - 1]), 'button secondary', 'back', {disabled: index <= 0}),
    el('span', {text: `${Math.max(index + 1, 1)} / ${Math.max(parts.length, 1)} 파트`}), button('다음 파트', () => startPractice(song, parts[index + 1]), 'button secondary', 'arrow', {disabled: index < 0 || index >= parts.length - 1}));
  
  if (abSwitcher) app.append(abSwitcher);
  app.append(playerLayout, controller, actions, switches);
  const progressHost = el('div'); const updateProgress = () => progressHost.replaceChildren(progressBar(percentage(song.id, part)));
  updateProgress();
  const checklist = el('section', {class: 'checklist-panel'}, el('p', {class: 'eyebrow', text: 'ONE STEP AT A TIME'}), el('h2', {text: '오늘의 연습 체크'}), el('p', {text: '작은 반복이 우리의 소리를 완성해요.'}), progressHost);
  for (const check of CHECKLIST) {
    const input = el('input', {type: 'checkbox', checked: progressChecks(song.id, part)[check.id] === true, onchange: event => {
      const songProgress = {...object(state.progress[song.id])};
      songProgress[part] = {...progressChecks(song.id, part), [check.id]: event.target.checked};
      // defineProperty keeps arbitrary JSON song IDs (including __proto__) as ordinary own keys.
      Object.defineProperty(state.progress, song.id, {value: songProgress, enumerable: true, configurable: true, writable: true});
      write('progress', state.progress); updateProgress();
    }});
    checklist.append(el('label', {class: 'check-item'}, input, el('span', {text: check.label})));
  }
  app.append(el('div', {class: 'practice-content'}, checklist, renderTimer()));
}

const duration = 10 * 60 * 1000;
const savedTimer = object(read('timer', {}));
const timer = {
  running: savedTimer.running === true && Number.isFinite(savedTimer.endAt),
  endAt: Number.isFinite(savedTimer.endAt) ? savedTimer.endAt : null,
  remainingMs: Number.isFinite(savedTimer.remainingMs) ? Math.max(0, Math.min(duration, savedTimer.remainingMs)) : duration,
  completed: savedTimer.completed === true
};
let timerNodes = null;
function timerRemaining() { return timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remainingMs; }
function saveTimer() { write('timer', timer); }
function tickTimer() {
  const remaining = timerRemaining();
  if (timer.running && remaining === 0) { timer.running = false; timer.remainingMs = 0; timer.completed = true; saveTimer(); toast('10분 집중 연습을 마쳤어요. 수고했어요!'); }
  if (!timerNodes?.value.isConnected) return;
  const seconds = Math.ceil(timerRemaining() / 1000);
  timerNodes.value.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  timerNodes.status.textContent = timer.completed ? '오늘의 집중 연습 완료!' : timer.running ? '지금, 내 목소리에 집중하는 시간' : timer.remainingMs < duration ? '잠깐 쉬어 가도 괜찮아요.' : '10분 동안 온전히 나의 목소리에';
  timerNodes.toggle.textContent = timer.running ? '일시정지' : timer.remainingMs === duration || timer.remainingMs === 0 ? '시작' : '재개';
}
function renderTimer() {
  const value = el('p', {class: 'timer-value', text: '10:00', 'aria-label': '집중 연습 남은 시간'});
  const status = el('p', {class: 'timer-status'});
  const toggle = button('시작', () => {
    if (timer.running) { timer.remainingMs = timerRemaining(); timer.running = false; }
    else { if (!timer.remainingMs) timer.remainingMs = duration; timer.endAt = Date.now() + timer.remainingMs; timer.running = true; timer.completed = false; }
    saveTimer(); tickTimer();
  }, 'button primary');
  timerNodes = {value, status, toggle};
  const panel = el('section', {class: 'timer-panel'}, icon('clock'), el('p', {class: 'eyebrow', text: 'A MOMENT FOR YOUR VOICE'}), el('h2', {text: '10분 집중 연습'}), value, status,
    el('div', {class: 'timer-controls'}, toggle, button('초기화', () => { timer.running = false; timer.endAt = null; timer.remainingMs = duration; timer.completed = false; saveTimer(); tickTimer(); }, 'button secondary')));
  setTimeout(tickTimer, 0); return panel;
}
setInterval(tickTimer, 1000);
document.addEventListener('visibilitychange', tickTimer);
window.addEventListener('pageshow', tickTimer);

function renderSettings() {
  app.append(el('div', {class: 'page-heading'}, el('p', {class: 'eyebrow', text: 'MAKE YOURSELF AT HOME'}), el('h1', {text: '나만의 연습실'}), el('p', {text: '내 파트와 화면을 설정하고, 편안하게 연습하세요.'})));
  const partPanel = el('section', {class: 'settings-panel'}, icon('mic'), el('h2', {text: '내 기본 파트'}), el('p', {text: '선택한 파트가 있는 곡에서 바로 연습할 수 있어요.'}));
  const longNames = {
    lead: 'Lead (리드)', soprano: 'Soprano (소프라노)', alto: 'Alto (알토)', tenor: 'Tenor (테너)',
    baritone: 'Baritone (바리톤)', bass: 'Bass (베이스)', vp: 'Vocal Percussion',
    part1: '1번 파트', part2: '2번 파트', part3: '3번 파트',
    part4: '4번 파트', part5: '5번 파트', part6: '6번 파트', part7: '7번 파트',
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
  const dataPanel = el('section', {class: 'settings-panel'}, icon('library'), el('h2', {text: '연습 자료 관리'}), el('p', {text: '새 곡과 파트 영상을 등록하려면 데이터 편집기를 이용하세요.'}), button('데이터 편집기 열기', () => openAdmin('./admin.html'), 'button secondary', 'external'));
  const privacyPanel = el('section', {class: 'settings-panel'}, icon('heart'), el('h2', {text: '나의 연습 기록'}), el('p', {text: '즐겨찾기, 최근 연습, 체크리스트는 이 브라우저에만 저장돼요. 다른 기기와 자동으로 동기화되지 않습니다.'}),
    !isAvailable() && el('p', {class: 'notice warning', text: '브라우저 저장소를 사용할 수 없어 현재 세션에서만 기록됩니다.'}),
    button('개인 연습 기록 초기화', () => {
      if (!confirm('즐겨찾기, 최근 연습, 체크리스트와 타이머 기록을 모두 지울까요? 곡 자료와 내 파트 설정은 유지됩니다.')) return;
      for (const key of ['favorites', 'recent', 'progress', 'timer']) remove(key);
      state.favorites.clear(); state.recent = []; state.progress = {}; timer.running = false; timer.endAt = null; timer.remainingMs = duration; timer.completed = false;
      toast('개인 연습 기록을 초기화했어요.');
    }, 'button secondary danger'));
  app.append(el('div', {class: 'settings-grid'}, partPanel, themePanel, dataPanel, privacyPanel));
}

function normalizeRoute() {
  if (!state.route.song) return;
  const song = state.songs.find(song => song.id === state.route.song);
  if (!song) { state.route = {tab: 'home'}; writeRoute(state.route, {replace: true}); toast('찾을 수 없는 곡입니다. 홈으로 이동했어요.'); return; }
  if (state.route.part && (!Object.hasOwn(PARTS, state.route.part) || !song.videos[state.route.part]?.url?.trim())) {
    state.route = {song: song.id}; writeRoute(state.route, {replace: true}); toast('등록되지 않은 파트입니다. 곡에서 다른 파트를 선택해 주세요.');
  }
}
let lastPractice = '';
function render() {
  stopPitch();
  for (const p of activePlayers) { try { p.destroy(); } catch {} }
  activePlayers.length = 0;
  for (const a of activeAudios) {
    try { a.pause(); a.src = ''; } catch {}
  }
  activeAudios.clear();
  state.player?.destroy(); state.player = null; timerNodes = null;
  app.replaceChildren(); refreshChrome();
  if (state.loading) { app.append(el('div', {class: 'loading-state', role: 'status', text: '연습실을 준비하고 있어요…'})); return; }
  if (state.loadError) {
    app.append(el('div', {class: 'error-state', role: 'alert'}, el('h1', {text: '연습 자료를 불러오지 못했어요'}), el('p', {text: state.loadError}), button('다시 시도', initialize, 'button primary'), button('데이터 편집기 열기', () => openAdmin('./admin.html'), 'button secondary'))); return;
  }
  normalizeRoute(); refreshChrome();
  const song = state.route.song && state.songs.find(song => song.id === state.route.song);
  document.title = song ? `${song.title}${state.route.part ? ` · ${PARTS[state.route.part]}` : ''} | AcaRaca` : `${labels[state.route.tab || 'home']} | AcaRaca`;
  if (song && state.route.part) {
    const key = `${song.id}\u0000${state.route.part}`;
    renderPractice(song, state.route.part, lastPractice !== key); lastPractice = key;
  } else {
    lastPractice = '';
    if (song) renderDetail(song);
    else if (state.route.tab === 'songs') renderBrowse();
    else if (state.route.tab === 'scores') renderScores();
    else if (state.route.tab === 'education') renderEducation();
    else if (state.route.tab === 'stage') renderStage();
    else if (state.route.tab === 'rehearsal') renderRehearsal();
    else if (state.route.tab === 'memories') renderMemories();
    else if (state.route.tab === 'favorites') renderBrowse(true);
    else if (state.route.tab === 'recent') app.append(el('div', {class: 'page-heading'}, el('p', {class: 'eyebrow', text: 'PICK UP WHERE YOU LEFT OFF'}), el('h1', {text: '다시, 그 하모니부터'}), el('p', {text: '최근 10개의 곡과 파트를 바로 이어서 연습하세요.'})), el('h2', {class: 'sr-only', text: '최근 연습곡 목록'}), recentList(10));
    else if (state.route.tab === 'settings') renderSettings();
    else renderHome();
  }
}
async function initialize() {
  state.loading = true; state.loadError = ''; render();
  try {
    const [songRes, perfRes, rehRes, scoresRes, memoriesRes, eduRes] = await Promise.all([
      loadSongs(),
      loadPerformances(),
      loadRehearsals(),
      loadScores(),
      loadMemories(),
      loadEducation()
    ]);
    state.songs = songRes.songs;
    const savedOverrides = read('statusOverrides', {});
    if (savedOverrides && typeof savedOverrides === 'object') {
      state.songs.forEach(song => {
        if (savedOverrides[song.id]) {
          song.status = savedOverrides[song.id];
        }
      });
    }
    state.performances = perfRes;
    state.rehearsals = rehRes;
    state.scores = scoresRes;
    state.memories = memoriesRes;
    state.education = eduRes;
    if (songRes.errors?.length && !songRes.songs.length) state.loadError = songRes.errors.join(' ');
    if (songRes.errors?.length && songRes.songs.length) toast(`${songRes.errors.length}개의 잘못된 데이터 항목을 제외하고 불러왔어요.`);
  } catch (error) { state.loadError = `${error.message || '자료를 확인할 수 없습니다.'} data/songs.json 파일과 HTTP 연결을 확인해 주세요.`; }
  state.loading = false; render();
}
window.addEventListener('popstate', () => { state.route = readRoute(); render(); app.focus({preventScroll: true}); });

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
