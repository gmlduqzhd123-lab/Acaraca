import {loadSongs, PARTS, CHECKLIST, availableParts, preferredPart} from './data.js';
import {parseYouTube, createPlayer} from './player.js';
import {read, write, remove, isAvailable} from './storage.js';
import {filterSongs} from './search.js';
import {readRoute, writeRoute, routeUrl} from './router.js';
import {el, icon, button, toast, cover, emptyState} from './ui.js';

const app = document.getElementById('app');
const labels = {home: '홈', songs: '전체 곡', favorites: '즐겨찾기', recent: '최근 연습', settings: '설정'};
const navIcons = {home: 'home', songs: 'library', favorites: 'heart', recent: 'clock', settings: 'settings'};
const levels = {1: '초급', 2: '중급', 3: '고급'};
const statuses = {practice: '현재 연습', complete: '완료', archive: '보관'};
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
const favoriteIds = array(read('favorites', [])).filter(value => typeof value === 'string');
const state = {
  songs: [], loading: true, loadError: '', favorites: new Set(favoriteIds),
  recent: array(read('recent', [])).filter(value => value && typeof value.songId === 'string' && typeof value.part === 'string' && Number.isFinite(value.timestamp)),
  myPart: Object.keys(PARTS).filter(part => part !== 'full').includes(read('myPart', '')) ? read('myPart', '') : '',
  progress: object(read('progress', {})),
  filters: {query: '', status: '', category: '', difficulty: '', part: ''},
  route: readRoute(), random: null, player: null
};
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

function refreshChrome() {
  const activeTab = state.route.song ? 'songs' : state.route.tab || 'home';
  for (const id of ['desktop-nav', 'mobile-nav']) {
    const nav = document.getElementById(id);
    nav.replaceChildren(...Object.entries(labels).map(([tab, label]) => el('a', {
      class: `nav-link${tab === activeTab ? ' active' : ''}`, href: routeUrl({tab}).href,
      'aria-current': tab === activeTab ? 'page' : null,
      onclick: event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate({tab}); }
    }, icon(navIcons[tab]), el('span', {text: label}))));
  }
  document.getElementById('sidebar-bottom').replaceChildren(
    el('div', {class: 'my-part-mini'}, icon('mic'), el('div', {}, el('span', {text: '나의 목소리'}), el('strong', {text: state.myPart ? PARTS[state.myPart] : '내 파트를 선택해 주세요'})),
      button('변경', () => navigate({tab: 'settings'}), 'text-button')),
    el('p', {class: 'sidebar-tip', text: '서로 다른 목소리, 하나의 하모니.'})
  );
  document.getElementById('topbar-actions').replaceChildren(
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

function songCard(song) {
  const parts = availableParts(song);
  return el('article', {class: 'song-card'},
    el('div', {class: 'cover-wrap'}, cover(song),
      el('span', {class: `status-badge ${song.status}`, text: statuses[song.status]}),
      button('', () => openSong(song), 'cover-play', 'play', {'aria-label': `${song.title} 곡과 파트 보기`})
    ),
    el('div', {class: 'card-body'},
      el('div', {class: 'card-title-row'}, el('h3', {class: 'card-title'}, button(song.title, () => openSong(song), 'title-button', null, {title: song.title})), favoriteButton(song)),
      el('p', {class: 'card-artist', text: song.artist || '아티스트 미등록'}),
      el('div', {class: 'card-meta'}, el('span', {class: 'badge', text: song.category || '기타'}), el('span', {text: levels[song.difficulty]}), song.arrangement && el('span', {text: song.arrangement})),
      el('div', {class: 'card-footer'},
        el('div', {class: 'part-preview'}, parts.length ? parts.slice(0, 3).map(part => el('span', {class: `part-pill${part === state.myPart ? ' mine' : ''}`, text: PARTS[part]})) : el('span', {class: 'part-empty', text: '영상 등록 예정'}), parts.length > 3 && el('span', {class: 'part-more', text: `+${parts.length - 3}`})),
        button('연습 시작', () => startPractice(song), 'button primary small', 'play')
      )
    )
  );
}
function songGrid(songs, emptyTitle = '등록된 곡이 없어요', emptyDescription = '데이터 편집기에서 첫 연습곡을 추가해 주세요.') {
  return songs.length ? el('div', {class: 'song-grid'}, songs.map(songCard)) : emptyState(emptyTitle, emptyDescription);
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
  if (!state.songs.length) { app.append(section('연습 라이브러리', '', songGrid([])), el('a', {class: 'button primary', href: './admin.html', text: '데이터 편집기 열기'})); return; }
  const featured = practicing[0] || state.songs[0];
  const hero = el('div', {class: 'hero-panel'},
    el('div', {class: 'hero-copy'}, el('span', {class: 'hero-tag', text: 'TODAY’S SPOTLIGHT'}), el('h3', {class: 'hero-title', text: featured.title}), el('p', {class: 'hero-text', text: `${featured.artist || '아티스트 미등록'} · ${featured.arrangement || '함께 부르는 즐거움'}`}),
      el('div', {class: 'hero-actions'}, button('지금 연습하기', () => startPractice(featured), 'button primary', 'play'), button('곡과 파트 보기', () => openSong(featured), 'button ghost', 'arrow')),
      el('div', {class: 'hero-bottom'}, icon('mic'), el('span', {text: availableParts(featured).length ? `${availableParts(featured).length}개 파트 · ${levels[featured.difficulty]}` : '팀의 연습 영상을 기다리고 있어요'}))
    ), el('div', {class: 'hero-art'}, cover(featured, 'hero-cover'), el('span', {class: 'hero-art-label', text: 'MAKE ROOM FOR HARMONY'}))
  );
  app.append(section('지금 연습 중', `${practicing.length}곡의 하모니를 완성해 가고 있어요`, hero, button('모두 보기', () => { state.filters = {query: '', status: 'practice', category: '', difficulty: '', part: ''}; navigate({tab: 'songs'}); }, 'text-button', 'arrow')));
  if (practicing.length > 1) app.append(songGrid(practicing.slice(1, 5)));
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
      randomPanel.append(el('div', {class: 'random-result'}, cover(state.random, 'recent-art'), el('div', {}, el('strong', {text: state.random.title}), el('p', {text: state.random.artist}))), button('바로 연습', () => startPractice(state.random), 'button primary', 'play'));
    } else randomPanel.append(el('p', {text: '익숙한 곡도, 새로운 곡도. 가볍게 한 곡 골라보세요.'}));
    randomPanel.append(button(state.random ? '다른 곡 뽑기' : '랜덤 곡 선택', () => {
      const candidates = state.songs.filter(song => state.myPart ? availableParts(song).includes(state.myPart) : availableParts(song).length);
      if (!candidates.length) { toast(state.myPart ? '내 파트 영상이 등록된 곡이 없습니다.' : '아직 등록된 연습 영상이 없습니다.'); return; }
      state.random = candidates[Math.floor(Math.random() * candidates.length)]; updateRandom();
    }, 'button secondary', 'shuffle'));
  }
  updateRandom(); app.append(section('오늘의 랜덤 연습', '새로운 하모니와 만나는 작은 계기', randomPanel));
  app.append(section('연습 라이브러리', `${state.songs.length}곡, 하나의 연습실`, songGrid(state.songs.slice(0, 4)), button('전체 곡 보기', () => navigate({tab: 'songs'}), 'text-button', 'arrow')));
}

function renderBrowse(favoritesOnly = false) {
  app.append(el('div', {class: 'page-heading'}, el('p', {class: 'eyebrow', text: favoritesOnly ? 'YOUR FAVORITES' : 'THE PRACTICE LIBRARY'}), el('h1', {text: favoritesOnly ? '자꾸 부르고 싶은 곡' : '어떤 하모니를 만들어 볼까요?'}), el('p', {text: favoritesOnly ? '마음에 담아둔 곡을 한곳에서 만나보세요.' : '곡, 아티스트, 파트를 검색하고 나에게 맞는 연습을 찾아보세요.'})));
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

function renderDetail(song) {
  const parts = availableParts(song);
  const preferred = preferredPart(song, state.myPart);
  app.append(button('목록으로', () => navigate({tab: 'songs'}), 'text-button back-button', 'back'));
  const detail = el('div', {class: 'detail-layout'},
    el('div', {class: 'detail-cover'}, cover(song, 'detail-cover-image')),
    el('div', {class: 'detail-content'}, el('p', {class: 'eyebrow', text: 'FIND YOUR VOICE'}), el('h1', {text: song.title}), el('p', {class: 'detail-artist', text: song.artist || '아티스트 미등록'}),
      el('div', {class: 'detail-meta'}, [song.category, levels[song.difficulty], song.arrangement, statuses[song.status]].filter(Boolean).map(text => el('span', {class: 'badge', text}))),
      el('div', {class: 'tag-list'}, array(song.tags).map(tag => el('span', {class: 'tag', text: `#${tag}`}))),
      el('div', {class: 'detail-actions'}, favoriteButton(song), button('곡 공유', () => share(song), 'button secondary', 'share')),
      preferred && progressBar(percentage(song.id, preferred), `${PARTS[preferred]} 연습 진행도`)
    )
  );
  app.append(detail);
  if (state.myPart && parts.includes(state.myPart)) app.append(el('section', {class: 'my-part-callout'}, el('p', {class: 'eyebrow', text: 'MY PART'}), button(`${PARTS[state.myPart]} 바로 연습`, () => startPractice(song, state.myPart), 'button primary', 'play')));
  const partsSection = section('파트를 선택해 주세요', '내 목소리를 하나씩 쌓아가요', parts.length ? el('div', {class: 'part-grid'}, parts.map(part => button(
    [el('strong', {text: PARTS[part]}), el('span', {class: 'part-subtitle', text: part === state.myPart ? 'MY PART · 바로 연습' : part === 'full' ? '모든 목소리를 함께' : '파트별 연습'}), icon('play')],
    () => startPractice(song, part), `part-button${part === state.myPart ? ' my-part' : ''}`,
    null, {'aria-label': `${PARTS[part]} ${part === state.myPart ? '내 파트 ' : ''}연습 시작`}
  ))) : emptyState('아직 등록된 연습 영상이 없습니다.', '데이터 편집기에서 파트별 YouTube 주소를 등록해 주세요.', el('a', {href: './admin.html', class: 'button secondary', text: '데이터 편집기 열기'})));
  app.append(partsSection);
  const invalid = Object.entries(object(song.videos)).filter(([, media]) => media?.url?.trim() && !parseYouTube(media).ok);
  if (invalid.length) app.append(el('p', {class: 'notice warning', text: `${invalid.map(([part]) => PARTS[part] || part).join(', ')} 영상 주소를 확인해 주세요. 올바른 YouTube 주소가 아니어서 연습 버튼을 표시하지 않았습니다.`}));
  app.append(section('연습 메모', '우리 팀이 기억해 두면 좋은 것들', el('div', {class: 'memo-panel', text: song.memo || '아직 등록된 메모가 없어요.'})));
}

async function share(song, part = null) {
  const url = routeUrl({song: song.id, part}).href;
  if (navigator.share) {
    try { await navigator.share({title: `${song.title}${part ? ` · ${PARTS[part]}` : ''} | AcaRoom`, url}); return; }
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
  app.append(button('파트 선택으로', () => openSong(song), 'text-button back-button', 'back'),
    el('div', {class: 'practice-heading'}, el('div', {}, el('p', {class: 'eyebrow', text: 'MAKE THIS MOMENT COUNT'}), el('h1', {text: song.title}), el('p', {text: song.artist})), el('span', {class: 'part-indicator', text: PARTS[part]})));
  const playerHost = el('div', {class: 'player-panel'});
  const playerLayout = el('div', {class: 'practice-layout'}, playerHost);
  state.player = createPlayer(playerHost, song.videos[part], `${song.title} · ${PARTS[part]} 연습`);
  const actions = el('div', {class: 'player-actions'}, button('처음부터', () => state.player?.restart(), 'button secondary', 'clock'),
    favoriteButton(song), button('파트 공유', () => share(song, part), 'button secondary', 'share'));
  const switches = el('div', {class: 'part-switcher'}, button('이전 파트', () => startPractice(song, parts[index - 1]), 'button secondary', 'back', {disabled: index <= 0}),
    el('span', {text: `${Math.max(index + 1, 1)} / ${Math.max(parts.length, 1)} 파트`}), button('다음 파트', () => startPractice(song, parts[index + 1]), 'button secondary', 'arrow', {disabled: index < 0 || index >= parts.length - 1}));
  app.append(playerLayout, actions, switches);
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
  const longNames = {lead: 'Lead', soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor', baritone: 'Baritone', bass: 'Bass', vp: 'Vocal Percussion'};
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
  const dataPanel = el('section', {class: 'settings-panel'}, icon('library'), el('h2', {text: '연습 자료 관리'}), el('p', {text: '새 곡과 파트 영상을 등록하려면 데이터 편집기를 이용하세요.'}), el('a', {class: 'button secondary', href: './admin.html'}, icon('external'), '데이터 편집기 열기'));
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
  state.player?.destroy(); state.player = null; timerNodes = null;
  app.replaceChildren(); refreshChrome();
  if (state.loading) { app.append(el('div', {class: 'loading-state', role: 'status', text: '연습실을 준비하고 있어요…'})); return; }
  if (state.loadError) {
    app.append(el('div', {class: 'error-state', role: 'alert'}, el('h1', {text: '연습 자료를 불러오지 못했어요'}), el('p', {text: state.loadError}), button('다시 시도', initialize, 'button primary'), el('a', {class: 'button secondary', href: './admin.html', text: '데이터 편집기 열기'}))); return;
  }
  normalizeRoute(); refreshChrome();
  const song = state.route.song && state.songs.find(song => song.id === state.route.song);
  document.title = song ? `${song.title}${state.route.part ? ` · ${PARTS[state.route.part]}` : ''} | AcaRoom` : `${labels[state.route.tab || 'home']} | AcaRoom`;
  if (song && state.route.part) {
    const key = `${song.id}\u0000${state.route.part}`;
    renderPractice(song, state.route.part, lastPractice !== key); lastPractice = key;
  } else {
    lastPractice = '';
    if (song) renderDetail(song);
    else if (state.route.tab === 'songs') renderBrowse();
    else if (state.route.tab === 'favorites') renderBrowse(true);
    else if (state.route.tab === 'recent') app.append(el('div', {class: 'page-heading'}, el('p', {class: 'eyebrow', text: 'PICK UP WHERE YOU LEFT OFF'}), el('h1', {text: '다시, 그 하모니부터'}), el('p', {text: '최근 10개의 곡과 파트를 바로 이어서 연습하세요.'})), el('h2', {class: 'sr-only', text: '최근 연습곡 목록'}), recentList(10));
    else if (state.route.tab === 'settings') renderSettings();
    else renderHome();
  }
}
async function initialize() {
  state.loading = true; state.loadError = ''; render();
  try {
    const result = await loadSongs(); state.songs = result.songs;
    if (result.errors?.length && !result.songs.length) state.loadError = result.errors.join(' ');
    if (result.errors?.length && result.songs.length) toast(`${result.errors.length}개의 잘못된 데이터 항목을 제외하고 불러왔어요.`);
  } catch (error) { state.loadError = `${error.message || '자료를 확인할 수 없습니다.'} data/songs.json 파일과 HTTP 연결을 확인해 주세요.`; }
  state.loading = false; render();
}
window.addEventListener('popstate', () => { state.route = readRoute(); render(); app.focus({preventScroll: true}); });
initialize();
