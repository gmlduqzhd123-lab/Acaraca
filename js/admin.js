import { PARTS, validateData } from './data.js';
import { parseYouTube } from './player.js';

const $ = (id) => document.getElementById(id);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const textValue = (value) => typeof value === 'string' ? value : value == null ? '' : String(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const state = {
  document: { version: 1, songs: [] },
  selected: null,
  documentDirty: false,
  formDirty: false,
  sourceToken: 0,
  source: '새 데이터',
};

function notice(message, type = 'success') {
  const node = $('admin-message');
  node.textContent = message;
  node.className = `admin-notice${type === 'success' ? '' : ` admin-notice-${type}`}`;
  node.hidden = false;
}

function makeElement(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function updateState() {
  $('document-state').textContent = state.documentDirty ? '다운로드할 변경사항 있음' : '변경사항 없음';
  $('form-state').textContent = state.formDirty ? '변경사항 적용 필요' : state.selected === null ? '새 곡' : '편집 중';
  $('song-count').textContent = String(state.document.songs.length);
  $('source-info').textContent = `${state.source} · ${state.document.songs.length}곡`;
}

function markDocumentChanged() {
  state.documentDirty = true;
  $('json-panel').hidden = true;
  $('validation-panel').hidden = true;
  updateState();
}

function confirmDraftDiscard() {
  return !state.formDirty || window.confirm('현재 곡에 적용하지 않은 입력이 있습니다. 입력을 버리고 계속할까요?');
}

function confirmDocumentReplace() {
  return !(state.documentDirty || state.formDirty) || window.confirm('다운로드하지 않은 변경사항 또는 적용하지 않은 입력이 있습니다. 현재 데이터를 교체할까요?');
}

function buildMediaFields() {
  for (const [part, label] of Object.entries(PARTS)) {
    const fieldset = makeElement('fieldset', undefined, 'admin-media-field');
    fieldset.append(makeElement('legend', label));
    const typeLabel = makeElement('label', '자료 종류', 'admin-field');
    typeLabel.htmlFor = `media-${part}-type`;
    const select = makeElement('select', undefined, 'admin-input');
    select.id = `media-${part}-type`;
    select.name = `${part}-type`;
    select.required = true;
    for (const [value, title] of [['video', 'video · 영상'], ['playlist', 'playlist · 재생목록']]) {
      const option = makeElement('option', title);
      option.value = value;
      select.append(option);
    }
    typeLabel.append(select);
    const urlLabel = makeElement('label', 'YouTube URL', 'admin-field');
    urlLabel.htmlFor = `media-${part}-url`;
    const input = makeElement('input', undefined, 'admin-input');
    input.id = `media-${part}-url`;
    input.name = `${part}-url`;
    input.type = 'url';
    input.autocomplete = 'off';
    input.placeholder = 'https://www.youtube.com/…';
    input.setAttribute('aria-describedby', `media-${part}-feedback`);
    urlLabel.append(input);
    const feedback = makeElement('p', 'URL 없음 · 이 파트는 표시하지 않습니다.', 'admin-media-feedback');
    feedback.id = `media-${part}-feedback`;
    fieldset.append(typeLabel, urlLabel, feedback);
    $('media-fields').append(fieldset);
    input.addEventListener('input', () => checkMediaField(part));
    select.addEventListener('change', () => checkMediaField(part));
  }
}

function checkMediaField(part) {
  const input = $(`media-${part}-url`);
  const feedback = $(`media-${part}-feedback`);
  const parsed = parseYouTube({ type: $(`media-${part}-type`).value, url: input.value.trim() });
  const invalid = !parsed.empty && !parsed.ok;
  input.setAttribute('aria-invalid', String(invalid));
  feedback.classList.toggle('is-invalid', invalid);
  feedback.textContent = parsed.empty ? 'URL 없음 · 이 파트는 표시하지 않습니다.' : parsed.ok ? `✓ ${parsed.type === 'playlist' ? '재생목록' : '영상'} URL 확인됨` : parsed.error || 'YouTube URL을 확인해 주세요.';
  return parsed;
}

function setSelectValue(select, value) {
  select.querySelectorAll('[data-invalid-option]').forEach((node) => node.remove());
  const string = textValue(value);
  if (!Array.from(select.options).some((option) => option.value === string)) {
    const option = makeElement('option', `잘못된 값: ${string || '(없음)'}`);
    option.value = string;
    option.dataset.invalidOption = 'true';
    select.append(option);
  }
  select.value = string;
}

function nextId() {
  const ids = new Set(state.document.songs.filter(isRecord).map((song) => song.id));
  let number = 1;
  while (ids.has(`song-${String(number).padStart(3, '0')}`)) number += 1;
  return `song-${String(number).padStart(3, '0')}`;
}

function fillForm(index) {
  const existing = index === null ? null : state.document.songs[index];
  const song = isRecord(existing) ? existing : {};
  state.selected = index;
  state.formDirty = false;
  for (const field of ['id', 'title', 'artist', 'category', 'arrangement', 'thumbnail', 'memo']) {
    $(`song-${field}`).value = index === null && field === 'id' ? nextId() : textValue(song[field]);
  }
  $('song-tags').value = Array.isArray(song.tags) ? song.tags.map(textValue).join(', ') : textValue(song.tags);
  setSelectValue($('song-difficulty'), index === null ? 2 : song.difficulty);
  setSelectValue($('song-status'), index === null ? 'practice' : song.status);
  const videos = isRecord(song.videos) ? song.videos : {};
  for (const part of Object.keys(PARTS)) {
    const media = isRecord(videos[part]) ? videos[part] : {};
    setSelectValue($(`media-${part}-type`), media.type ?? 'video');
    $(`media-${part}-url`).value = textValue(media.url);
    checkMediaField(part);
  }
  $('form-title').textContent = index === null ? '새 곡 추가' : textValue(song.title) || '곡 수정';
  $('save-song').textContent = index === null ? '곡 추가' : '변경사항 적용';
  $('reset-form').textContent = index === null ? '입력 초기화' : '입력 되돌리기';
  updateState();
  renderList();
}

function renderGenres() {
  const genres = Array.from(new Set(state.document.songs.filter(isRecord).map((song) => song.category).filter((category) => typeof category === 'string' && category.trim())));
  $('genre-options').replaceChildren(...genres.map((genre) => {
    const option = makeElement('option');
    option.value = genre;
    return option;
  }));
}

function listButton(label, ariaLabel, action, danger = false) {
  const button = makeElement('button', label, `admin-button ${danger ? 'admin-button-danger' : 'admin-button-secondary'}`);
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', action);
  return button;
}

function renderList() {
  const query = $('song-search').value.trim().toLocaleLowerCase();
  const nodes = [];
  state.document.songs.forEach((entry, index) => {
    const song = isRecord(entry) ? entry : {};
    if (query && ![song.title, song.artist, song.id].map(textValue).join(' ').toLocaleLowerCase().includes(query)) return;
    const title = textValue(song.title) || '(곡명 없음 — 수정 필요)';
    const item = makeElement('li', undefined, `admin-song-row${state.selected === index ? ' is-selected' : ''}`);
    const edit = makeElement('button', undefined, 'admin-song-edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `${title} 수정`);
    edit.setAttribute('aria-pressed', String(state.selected === index));
    edit.append(makeElement('span', String(index + 1).padStart(2, '0'), 'admin-song-number'));
    const copy = makeElement('span', undefined, 'admin-song-copy');
    copy.append(makeElement('strong', title), makeElement('small', [song.artist, song.id].map(textValue).filter(Boolean).join(' · ') || '필수 정보를 입력해 주세요.'));
    edit.append(copy);
    edit.addEventListener('click', () => {
      if (!confirmDraftDiscard()) return;
      fillForm(index);
      if (window.matchMedia('(max-width: 760px)').matches) $('song-form').scrollIntoView({ block: 'start', behavior: 'auto' });
      $('song-title').focus({ preventScroll: true });
    });
    const actions = makeElement('div', undefined, 'admin-row-actions');
    const up = listButton('↑', `${title} 순서 위로`, () => moveSong(index, -1));
    const down = listButton('↓', `${title} 순서 아래로`, () => moveSong(index, 1));
    up.disabled = index === 0;
    down.disabled = index === state.document.songs.length - 1;
    actions.append(up, down, listButton('삭제', `${title} 삭제`, () => deleteSong(index), true));
    item.append(edit, actions);
    nodes.push(item);
  });
  $('song-list').replaceChildren(...nodes);
  $('list-empty').hidden = nodes.length > 0;
  $('list-empty').textContent = query ? '검색 결과가 없습니다. 검색어를 지워 전체 곡을 확인하세요.' : '첫 번째 연습곡을 추가해 보세요.';
  renderGenres();
}

function moveSong(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.document.songs.length) return;
  [state.document.songs[index], state.document.songs[target]] = [state.document.songs[target], state.document.songs[index]];
  if (state.selected === index) state.selected = target;
  else if (state.selected === target) state.selected = index;
  markDocumentChanged();
  renderList();
  notice('곡 순서를 변경했습니다. 다운로드한 JSON에 이 순서가 적용됩니다.');
}

function deleteSong(index) {
  const entry = state.document.songs[index];
  const title = isRecord(entry) ? textValue(entry.title) || '이 곡' : '이 항목';
  const draftWarning = state.selected === index && state.formDirty ? ' 현재 입력 중인 변경사항도 삭제됩니다.' : '';
  if (!window.confirm(`“${title}”을 목록에서 삭제할까요?${draftWarning}`)) return;
  state.document.songs.splice(index, 1);
  if (state.selected === index) fillForm(null);
  else if (state.selected > index) state.selected -= 1;
  markDocumentChanged();
  renderList();
  notice('곡을 삭제했습니다. 원본 파일은 다운로드한 JSON으로 교체할 때 변경됩니다.');
}

function safeThumbnail(value) {
  if (!value) return true;
  try {
    const url = new URL(value, document.baseURI);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function readFormSong() {
  const original = state.selected === null ? {} : state.document.songs[state.selected];
  const old = isRecord(original) ? original : {};
  const song = { ...old };
  for (const field of ['id', 'title', 'artist', 'category', 'arrangement', 'thumbnail', 'memo']) song[field] = $(`song-${field}`).value.trim();
  song.difficulty = Number($('song-difficulty').value);
  song.status = $('song-status').value;
  song.tags = Array.from(new Set($('song-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean)));
  const oldVideos = isRecord(old.videos) ? old.videos : {};
  song.videos = { ...oldVideos };
  for (const part of Object.keys(PARTS)) {
    const url = $(`media-${part}-url`).value.trim();
    const type = $(`media-${part}-type`).value;
    const oldMedia = isRecord(oldVideos[part]) ? oldVideos[part] : null;
    song.videos[part] = url || oldMedia ? { ...(oldMedia || {}), type, url } : null;
  }
  return song;
}

function getValidation(documentData = state.document) {
  const result = validateData(documentData, { warn: false });
  const errors = [...result.errors];
  const warnings = [...result.warnings];
  if (Array.isArray(documentData.songs)) {
    documentData.songs.forEach((song, index) => {
      if (!isRecord(song)) return;
      const label = `${index + 1}번째 곡 “${textValue(song.title) || textValue(song.id) || '제목 없음'}”`;
      if (song.thumbnail && (typeof song.thumbnail !== 'string' || !safeThumbnail(song.thumbnail))) errors.push(`${label}: 썸네일은 HTTP(S) 또는 안전한 상대 URL이어야 합니다.`);
      if (!isRecord(song.videos)) return;
      for (const [part, media] of Object.entries(song.videos)) {
        if (!isRecord(media) || !media.url) continue;
        if (typeof media.url !== 'string') {
          errors.push(`${label} · ${PARTS[part] || part}: URL은 문자열이어야 합니다.`);
          continue;
        }
        const parsed = parseYouTube(media);
        if (!parsed.ok && !parsed.empty) errors.push(`${label} · ${PARTS[part] || part}: ${parsed.error || 'YouTube URL을 확인해 주세요.'}`);
      }
    });
  }
  let json = '';
  try {
    json = `${JSON.stringify(documentData, null, 2)}\n`;
    JSON.parse(json);
  } catch (error) {
    errors.push(`JSON 파일을 생성할 수 없습니다: ${error.message}`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], json };
}

function renderValidation(result, scroll = false) {
  $('validation-panel').hidden = false;
  $('validation-state').textContent = result.errors.length ? '수정 필요' : '검증 완료';
  $('validation-summary').textContent = result.errors.length ? `오류 ${result.errors.length}개를 수정한 뒤 다운로드해 주세요. 빈 YouTube URL은 오류가 아닙니다.` : `필수값과 중복 ID, 미디어 형식이 정상입니다. ${state.document.songs.length}곡을 다운로드할 수 있습니다.`;
  const lines = [...result.errors.map((error) => `오류 · ${error}`), ...result.warnings.map((warning) => `안내 · ${warning}`)];
  $('validation-messages').replaceChildren(...lines.map((line) => makeElement('li', line)));
  if (scroll) $('validation-panel').scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

function draftIsApplied() {
  if (!state.formDirty) return true;
  notice('현재 곡에 적용하지 않은 입력이 있습니다. “곡 추가” 또는 “변경사항 적용”을 눌러 목록에 반영한 뒤 계속해 주세요.', 'warning');
  $('save-song').focus();
  return false;
}

function saveSong(event) {
  event.preventDefault();
  const song = readFormSong();
  const candidate = { ...state.document, songs: [...state.document.songs] };
  const index = state.selected === null ? candidate.songs.length : state.selected;
  candidate.songs[index] = song;
  // Validate this song separately so a malformed imported neighbor can still be repaired later.
  const result = getValidation({ version: 1, songs: [song] });
  if (candidate.songs.some((other, otherIndex) => otherIndex !== index && isRecord(other) && textValue(other.id).trim() === song.id)) result.errors.push(`“${song.id}” ID가 다른 곡에서 사용 중입니다. 고유한 ID를 입력해 주세요.`);
  if (result.errors.length) {
    renderValidation(result);
    notice(result.errors.join(' '), 'error');
    const invalidPart = Object.keys(PARTS).find((part) => !checkMediaField(part).ok && !checkMediaField(part).empty);
    if (invalidPart) $(`media-${invalidPart}-url`).focus();
    else $('song-id').focus();
    return;
  }
  const isNew = state.selected === null;
  state.document.songs = candidate.songs;
  fillForm(index);
  markDocumentChanged();
  notice(`“${song.title}” ${isNew ? '곡을 추가' : '변경사항을 적용'}했습니다. 파일을 다운로드해 보관하세요.`);
}

function replaceDocument(raw, source) {
  if (!isRecord(raw) || !Array.isArray(raw.songs)) throw new Error('JSON 최상위에는 songs 배열이 필요합니다. README의 데이터 구조를 확인해 주세요.');
  state.document = clone(raw);
  if (!Object.hasOwn(state.document, 'version')) state.document.version = 1;
  state.source = source;
  state.documentDirty = false;
  state.formDirty = false;
  $('song-search').value = '';
  $('json-panel').hidden = true;
  fillForm(state.document.songs.length ? 0 : null);
  const result = getValidation();
  renderValidation(result);
  notice(result.errors.length ? `${state.document.songs.length}개 항목을 가져왔습니다. 검증 오류가 있는 항목도 보존했으니 수정 후 다운로드하세요.` : `${state.document.songs.length}곡을 불러왔습니다. 곡을 선택해 자료를 편집하세요.`, result.errors.length ? 'warning' : 'success');
}

async function loadCurrent(manual = true) {
  if (location.protocol === 'file:') {
    $('file-warning').hidden = false;
    return;
  }
  if (manual && !confirmDocumentReplace()) return;
  const token = ++state.sourceToken;
  const dirtyAtStart = state.documentDirty || state.formDirty;
  $('load-current').disabled = true;
  try {
    const response = await fetch('./data/songs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`파일 응답 ${response.status}`);
    const raw = await response.json();
    if (token !== state.sourceToken) return;
    if (!dirtyAtStart && (state.documentDirty || state.formDirty) && !confirmDocumentReplace()) return;
    replaceDocument(raw, '현재 data/songs.json');
  } catch (error) {
    if (token !== state.sourceToken) return;
    notice(`data/songs.json을 불러오지 못했습니다. HTTP 환경과 파일 경로를 확인하거나 로컬 JSON 파일을 가져오세요. ${error.message}`, 'error');
    updateState();
  } finally {
    $('load-current').disabled = false;
  }
}

async function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!confirmDocumentReplace()) {
    event.target.value = '';
    return;
  }
  const token = ++state.sourceToken;
  try {
    const raw = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    if (token !== state.sourceToken) return;
    replaceDocument(raw, `가져온 파일: ${file.name}`);
  } catch (error) {
    notice(`JSON 파일을 가져오지 못했습니다. 파일의 JSON 문법과 songs 배열을 확인해 주세요. ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function previewJSON() {
  if (!draftIsApplied()) return;
  const result = getValidation();
  renderValidation(result);
  if (!result.json) return;
  $('json-content').textContent = result.json;
  $('json-panel').hidden = false;
  $('json-panel').scrollIntoView({ block: 'start', behavior: 'auto' });
  $('json-content').focus({ preventScroll: true });
}

function downloadJSON() {
  if (!draftIsApplied()) return;
  const result = getValidation();
  renderValidation(result);
  if (result.errors.length) {
    notice('다운로드 전에 데이터 오류를 수정해 주세요. 잘못된 YouTube URL은 수정하거나 비워둘 수 있습니다.', 'error');
    $('validation-panel').scrollIntoView({ block: 'nearest', behavior: 'auto' });
    return;
  }
  try {
    const blob = new Blob([result.json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = makeElement('a');
    link.href = url;
    link.download = 'songs.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.documentDirty = false;
    updateState();
    notice('songs.json 다운로드를 시작했습니다. GitHub 저장소의 data/songs.json을 이 파일로 교체하세요.');
  } catch (error) {
    notice(`다운로드를 시작하지 못했습니다. JSON 미리보기의 내용을 복사해 songs.json으로 저장할 수 있습니다. ${error.message}`, 'error');
  }
}

function initialize() {
  buildMediaFields();
  fillForm(null);
  $('song-form').addEventListener('submit', saveSong);
  $('song-form').addEventListener('input', () => { state.formDirty = true; updateState(); });
  $('song-form').addEventListener('change', () => { state.formDirty = true; updateState(); });
  $('song-search').addEventListener('input', renderList);
  $('add-song').addEventListener('click', () => {
    if (!confirmDraftDiscard()) return;
    fillForm(null);
    $('song-form').scrollIntoView({ block: 'start', behavior: 'auto' });
    $('song-title').focus({ preventScroll: true });
  });
  $('reset-form').addEventListener('click', () => { if (confirmDraftDiscard()) fillForm(state.selected); });
  $('load-current').addEventListener('click', () => loadCurrent(true));
  $('import-file').addEventListener('change', importFile);
  $('validate-data').addEventListener('click', () => { if (draftIsApplied()) renderValidation(getValidation(), true); });
  $('preview-json').addEventListener('click', previewJSON);
  $('download-json').addEventListener('click', downloadJSON);
  $('close-preview').addEventListener('click', () => { $('json-panel').hidden = true; $('preview-json').focus(); });
  window.addEventListener('beforeunload', (event) => {
    if (!state.documentDirty && !state.formDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  loadCurrent(false);
}

initialize();
