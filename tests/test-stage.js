import assert from 'node:assert';
import fs from 'node:fs';
import {
  STAGE_AI_COMMENTS,
  generateDynamicMCComment,
  getMCCommentVariations,
  DEFAULT_STAGE_HISTORY,
  STAGE_EXTRA_SONG_METADATA,
  resolveSongData,
  DUMMY_STAGE_IDS,
  isDummyStage,
  getSongStartingPitchEntries,
  cleanupStageLive,
  STAGE_ADMIN_PASSWORD,
  promptStagePassword
} from '../js/stage.js';

console.log('Testing Stage Mode Logic...');

// 1. Check AI Comments (2 lines each)
assert(typeof STAGE_AI_COMMENTS === 'object', 'STAGE_AI_COMMENTS must be an object');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody'], 'bohemian-rhapsody comments exist');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody'].story.includes('퀸'), 'story comment mentions Queen');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody'].story.includes('보헤미안 랩소디'), 'story comment matches');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody'].brief.length > 5, 'brief comment exists');
assert(!STAGE_AI_COMMENTS['bohemian-rhapsody-5'], 'merged 5인용 entry removed');

// Verify all STAGE_AI_COMMENTS entries have exactly 2 lines
for (const [songKey, toneMap] of Object.entries(STAGE_AI_COMMENTS)) {
  for (const [tone, comment] of Object.entries(toneMap)) {
    const lines = comment.trim().split('\n');
    assert.strictEqual(lines.length, 2, `STAGE_AI_COMMENTS[${songKey}][${tone}] must have exactly 2 lines`);
  }
}

// 1-1. Check Extra songs comments (Stand By Me, The Lion Sleeps Tonight)
assert(STAGE_AI_COMMENTS['stand-by-me'], 'stand-by-me comments exist');
assert(STAGE_AI_COMMENTS['stand-by-me'].wit.length > 10, 'stand-by-me wit comment exists');
assert(STAGE_AI_COMMENTS['stand-by-me'].story.length > 10, 'stand-by-me story comment exists');
assert(STAGE_AI_COMMENTS['stand-by-me'].brief.length > 5, 'stand-by-me brief comment exists');

assert(STAGE_AI_COMMENTS['the-lion-sleeps-tonight'], 'the-lion-sleeps-tonight comments exist');
assert(STAGE_AI_COMMENTS['the-lion-sleeps-tonight'].wit.includes('위모웨'), 'the-lion-sleeps-tonight wit matches');
assert(STAGE_AI_COMMENTS['the-lion-sleeps-tonight'].story.length > 10, 'the-lion-sleeps-tonight story exists');
assert(STAGE_AI_COMMENTS['the-lion-sleeps-tonight'].brief.length > 5, 'the-lion-sleeps-tonight brief exists');

// 2. Test Dynamic Generator Fallback & 10+ Distinct Variations
const dummySong = { id: 'dummy-song', title: '아카라카 찬가', artist: '아카라카', category: '응원가', arrangement: '4부' };
const genWit = generateDynamicMCComment(dummySong, 'wit');
const genStory = generateDynamicMCComment(dummySong, 'story');
const genBrief = generateDynamicMCComment(dummySong, 'brief');

assert(genWit.includes('아카라카 찬가'), 'Dynamic wit includes song title');
assert(genStory.includes('아카라카 찬가'), 'Dynamic story includes song title');
assert(genBrief.includes('아카라카 찬가'), 'Dynamic brief includes song title');

// 2-1. Verify at least 10 distinct variations and 2-line formatting for each tone
const testSongs = [
  dummySong,
  { id: 'in-your-arms', title: '그대 내 품에', artist: '유재하' },
  { id: 'stand-by-me', title: '스탠바이미', artist: 'Ben E. King' },
  { id: 'the-lion-sleeps-tonight', title: 'The Lion Sleeps Tonight', artist: 'Solomon Linda' },
  { id: 'bohemian-rhapsody', title: '보헤미안 랩소디', artist: 'Pentatonix' }
];

for (const s of testSongs) {
  for (const tone of ['wit', 'story', 'brief']) {
    const variations = getMCCommentVariations(s, tone);
    assert(variations.length >= 10, `Song ${s.id} tone ${tone} must provide at least 10 variations (got ${variations.length})`);
    
    // Check first 10 variations are unique
    const first10 = variations.slice(0, 10);
    const uniqueFirst10 = new Set(first10);
    assert.strictEqual(uniqueFirst10.size, 10, `Song ${s.id} tone ${tone} first 10 variations must be unique`);

    // Check each variation is structured as 2 lines
    for (const v of variations) {
      const lines = v.trim().split('\n');
      assert.strictEqual(lines.length, 2, `Variation must be exactly 2 lines: "${v}"`);
    }
  }
}

// 3. Test Stage History (Only user entered performances, zero dummy items)
assert(Array.isArray(DEFAULT_STAGE_HISTORY), 'DEFAULT_STAGE_HISTORY must be an array');
assert(DEFAULT_STAGE_HISTORY.length === 5, 'Exactly 5 user-entered performances in DEFAULT_STAGE_HISTORY');
assert(DEFAULT_STAGE_HISTORY.every(h => !isDummyStage(h)), 'No dummy performances in DEFAULT_STAGE_HISTORY');
for (const dummyId of ['stage-2026-spring', 'stage-2025-busking', 'stage-2024-suncheon']) {
  assert(DUMMY_STAGE_IDS.has(dummyId), `DUMMY_STAGE_IDS must track ${dummyId}`);
  assert(!DEFAULT_STAGE_HISTORY.some(h => h.id === dummyId), `Dummy ${dummyId} must not be in default history`);
}

// 3-0. Verify chronological sorting (newest first: 12.18 > 12.12 > 10.24 > 10.23 > 10.16)
const stageById = (id) => DEFAULT_STAGE_HISTORY.find(h => h.id === id);
const jeonnam = stageById('stage-2026-jeonnam');
const gyowon = stageById('stage-2026-gyowon');
assert.deepStrictEqual(
  DEFAULT_STAGE_HISTORY.map(h => h.id),
  ['stage-2026-jeongdeok', 'stage-2026-naju', 'stage-2026-jeonnam', 'stage-2026-gyowon', 'stage-2026-yeosu'],
  'default stages must be listed newest first'
);
assert(DEFAULT_STAGE_HISTORY.every((h, i, arr) => i === 0 || (arr[i - 1].updatedAt || 0) >= (h.updatedAt || 0)), 'updatedAt must be newest first');

// 3-0a. 2026 전학공 연말 공연 (12.18 금 18:00, 정덕유치원)
const jeongdeok = stageById('stage-2026-jeongdeok');
assert(jeongdeok, 'stage-2026-jeongdeok must exist');
assert.strictEqual(jeongdeok.eventTitle, '2026 전학공 연말 공연');
assert.strictEqual(jeongdeok.date, '2026.12.18');
assert.strictEqual(jeongdeok.venue, '정덕유치원');
assert(jeongdeok.notes.includes('18:00'), 'start time 18:00 must be noted');
assert.deepStrictEqual(jeongdeok.songs.map(s => s.songId), ['first-impression', 'love-song-medley', 'old-pop-medley', 'carol-medley']);

// 3-0b. 2026 나주 공연 (광주교대 멘토링, 12.12 토 14:00)
const naju = stageById('stage-2026-naju');
assert(naju, 'stage-2026-naju must exist');
assert.strictEqual(naju.date, '2026.12.12');
assert(naju.eventTitle.includes('나주') && naju.eventTitle.includes('광주교대 멘토링'));
assert(naju.notes.includes('14:00'), 'start time 14:00 must be noted');
assert.deepStrictEqual(naju.songs.map(s => s.songId), ['if-you-dont-dream']);
assert(jeonnam, 'stage-2026-jeonnam must exist');
assert.strictEqual(jeonnam.date, '2026.10.24', '1st date matches');
assert.strictEqual(jeonnam.venue, '광주교육연수원', '1st venue matches');
assert.strictEqual(jeonnam.songs.length, 6, 'Jeonnam performance must have 6 songs');
const expectedJeonnamSongIds = [
  'love-song-medley',
  'isnt-she-lovely',
  'in-your-arms',
  'old-pop-medley',
  'short-hair',
  'lets-travel'
];
assert.deepStrictEqual(jeonnam.songs.map(s => s.songId), expectedJeonnamSongIds);

assert(gyowon, 'stage-2026-gyowon must exist');
assert.strictEqual(gyowon.date, '2026.10.23', '2nd date matches');
assert.strictEqual(gyowon.venue, '장흥문화예술회관', '2nd venue matches');
assert.strictEqual(gyowon.songs.length, 1, 'Gyowon performance must have 1 song');
assert.strictEqual(gyowon.songs[0].songId, 'bohemian-rhapsody');

// 3-1. Verify 2026 여수 생활문화한마당 performance (3rd)
const yeosu = DEFAULT_STAGE_HISTORY.find(h => h.id === 'stage-2026-yeosu');
assert(yeosu, 'stage-2026-yeosu must exist in DEFAULT_STAGE_HISTORY');
assert.strictEqual(yeosu.eventTitle, '2026 여수 생활문화한마당', 'Yeosu eventTitle matches');
assert.strictEqual(yeosu.date, '2026.10.16', 'Yeosu date matches');
assert.strictEqual(yeosu.venue, '웅천친수공원', 'Yeosu venue matches');
assert.strictEqual(yeosu.songs.length, 5, 'Yeosu must have 5 songs');
const expectedYeosuSongIds = [
  'love-song-medley',
  'bohemian-rhapsody',
  'in-your-arms',
  'old-pop-medley',
  'lets-travel'
];
assert.deepStrictEqual(
  yeosu.songs.map(s => s.songId),
  expectedYeosuSongIds,
  'Yeosu cue sheet song IDs and order must match'
);

// 3-2. Verify Extra Song Metadata and starting pitches
assert(STAGE_EXTRA_SONG_METADATA['stand-by-me'], 'stand-by-me metadata exists');
assert(STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'], 'the-lion-sleeps-tonight metadata exists');

const standByMePitches = getSongStartingPitchEntries(STAGE_EXTRA_SONG_METADATA['stand-by-me']);
assert(standByMePitches.length === 5, 'stand-by-me has 5 pitch entries');
const lionPitches = getSongStartingPitchEntries(STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight']);
// 악보 화면에서 확인된 솔로·소프라노 첫 음만 등록 (알토·베이스 미확인)
assert(lionPitches.length === 2, 'the-lion-sleeps-tonight has 2 verified pitch entries');
assert(standByMePitches[0][0] === 'lead' && lionPitches[0][0] === 'lead', 'extra songs play in score entry order (solo first)');

// 4. Test Starting Pitch Extraction across all songs
const songs = JSON.parse(fs.readFileSync('data/songs.json', 'utf8')).songs;
assert(songs.length > 0, 'songs.json must contain songs');

songs.forEach((song) => {
  const entries = getSongStartingPitchEntries(song);
  assert(entries.length > 0, `Song ${song.id} must yield non-empty pitch entries`);
  entries.forEach(([part, noteStr]) => {
    assert(typeof part === 'string' && part.length > 0, `Part key valid for ${song.id}`);
    assert(typeof noteStr === 'string' && noteStr.length > 0, `Note string valid for ${song.id} - ${part}`);
  });
});

// 5. Test cleanupStageLive executes safely
assert.doesNotThrow(() => {
  cleanupStageLive();
}, 'cleanupStageLive must not throw');

// 6. Test Stage Admin Password
assert.strictEqual(STAGE_ADMIN_PASSWORD, '1234', 'Stage admin password must be 1234');
assert.strictEqual(typeof promptStagePassword, 'function', 'promptStagePassword must be an exported function');

// 7. Test Stage Sub-view switching logic in app.js
const appJsSource = ['js/app.js', 'js/scoreViewer.js', 'js/archivePages.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
assert(appJsSource.includes('function switchStageSubView(view)'), 'switchStageSubView helper must be defined');
assert(appJsSource.includes("switchStageSubView('live')"), "switchStageSubView('live') must be wired");
assert(appJsSource.includes("switchStageSubView('history')"), "switchStageSubView('history') must be wired");
assert(appJsSource.includes("switchStageSubView('list')"), "switchStageSubView('list') must be wired");

// 8. Test Live Mode Switcher (1곡 보기 vs 전체 큐시트 목록) & Overview renderer in stage.js
const stageJsSource = ['js/stage.js', 'js/stageStore.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
assert(stageJsSource.includes('stage-live-mode-switch'), 'stage-live-mode-switch container must be present in stage.js');
assert(stageJsSource.includes('1곡 보기'), '1곡 보기 button must be present');
assert(stageJsSource.includes('전체 큐시트 목록') || stageJsSource.includes('전체 목록'), '전체 큐시트 목록 button must be present');
assert(stageJsSource.includes('function renderOverviewView()'), 'renderOverviewView function must be present');
assert(stageJsSource.includes('function copyFullSetlist()'), 'copyFullSetlist function must be present');
assert(stageJsSource.includes('playChordStrings'), 'playChordStrings must be imported and used for chords');
assert(stageJsSource.includes('updateOverviewPitchUI'), 'updateOverviewPitchUI must synchronize overview button states');

// 9. Test Pitch Audio: 3-second Auto Stop and Blank-Area Mute Listener
const pitchJsSource = fs.readFileSync('js/pitch.js', 'utf8');
assert(pitchJsSource.includes('export const DEFAULT_PITCH_DURATION = 3000;'), 'DEFAULT_PITCH_DURATION must be exported as 3000ms');
assert(pitchJsSource.includes('singlePitchTimer'), 'singlePitchTimer must be present for auto-stop');
assert(pitchJsSource.includes('pointerdown'), 'Blank screen pointerdown listener must be present');
assert(pitchJsSource.includes('PITCH_TRIGGER_SELECTORS'), 'PITCH_TRIGGER_SELECTORS must be defined');
assert(stageJsSource.includes('scheduleStagePitchAutoStop(3000)'), 'Stage mode must schedule 3000ms auto-stop');
assert(stageJsSource.includes('btn.blur()'), 'Stage mode must blur buttons on stop to clear focus/hover state');

// 10. Test Stage History Action Buttons Order (왼쪽부터 무대 큐시트 시작, 복제, 삭제)
assert(stageJsSource.includes("el('div', { class: 'stage-history-actions' }, loadBtn, cloneBtn, deleteBtn)"), "stage.js actions order must be loadBtn, cloneBtn, deleteBtn");
assert(appJsSource.includes("el('div', { class: 'stage-history-actions' }, loadBtn, cloneBtn, deleteBtn)"), "app.js actions order must be loadBtn, cloneBtn, deleteBtn");
assert(stageJsSource.includes("el('div', { class: 'stage-header-actions' }, copyBtn, historyBtn, archiveBtn, editBtn, fullscreenBtn)"), "stage-header-actions order must place editBtn to the right of archiveBtn");

// 11. Test Practice Video Link Buttons & Modal (상세 페이지로 즉시 직접 이동)
import { openSongPracticeVideoModal } from '../js/stage.js';
assert.strictEqual(typeof openSongPracticeVideoModal, 'function', 'openSongPracticeVideoModal must be an exported function');
assert(stageJsSource.includes('stage-practice-video-btn'), 'stage-practice-video-btn must be present in stage.js');
assert(stageJsSource.includes('stage-overview-video-btn'), 'stage-overview-video-btn must be present in stage.js');
assert(stageJsSource.includes('🎬 연습실 영상'), '🎬 연습실 영상 button text must be present in stage.js');
assert(stageJsSource.includes('navigate({ song: targetSongId })'), 'Stage mode practice button must navigate directly to song detail page');
assert(STAGE_EXTRA_SONG_METADATA['stand-by-me'].videos?.full?.url, 'stand-by-me has full video URL');
assert(STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'].videos?.full?.url, 'the-lion-sleeps-tonight has full video URL');

const songsData = JSON.parse(fs.readFileSync('./data/songs.json', 'utf8'));
let navigatedSong = null;
openSongPracticeVideoModal({
  song: { songId: 'old-pop-medley' },
  songs: songsData.songs,
  navigate: (route) => { navigatedSong = route.song; }
});
assert.strictEqual(navigatedSong, 'old-pop-medley', 'openSongPracticeVideoModal must immediately navigate to song detail page');

// 12. Test Previous / Next Performance Navigation Buttons
import { getChronologicalPerformanceList } from '../js/stage.js';
assert.strictEqual(typeof getChronologicalPerformanceList, 'function', 'getChronologicalPerformanceList must be an exported function');
const chronologicalList = getChronologicalPerformanceList();
assert(Array.isArray(chronologicalList), 'getChronologicalPerformanceList must return an array');
assert(chronologicalList.length >= 3, 'Must contain at least the 3 default performances');
// Check chronological order (10.16 여수 -> 10.23 교원 -> 10.24 전남)
const yeosuIdx = chronologicalList.findIndex(p => p.id === 'stage-2026-yeosu');
const gyowonIdx = chronologicalList.findIndex(p => p.id === 'stage-2026-gyowon');
const jeonnamIdx = chronologicalList.findIndex(p => p.id === 'stage-2026-jeonnam');
assert(yeosuIdx !== -1 && gyowonIdx !== -1 && jeonnamIdx !== -1, 'All 3 default performances must be present');
assert(yeosuIdx < gyowonIdx, 'Yeosu (10.16) must come before Gyowon (10.23)');
assert(gyowonIdx < jeonnamIdx, 'Gyowon (10.23) must come before Jeonnam (10.24)');

assert(stageJsSource.includes('stage-perf-nav-wrap'), 'stage.js must include stage-perf-nav-wrap');
assert(stageJsSource.includes('◀ 그 전 공연'), 'stage.js must include ◀ 그 전 공연 button');
assert(stageJsSource.includes('그 후 공연 ▶'), 'stage.js must include 그 후 공연 ▶ button');
assert(stageJsSource.includes('Ctrl+ArrowLeft / Ctrl+ArrowRight'), 'stage.js must support Ctrl+Arrow keyboard navigation for performances');

// 13. Test Cue Sheet Export / Import Serialization & URL Share Parameter (?cuesheet=...)
import {
  serializeStageSession,
  parseImportedStageSession,
  encodeStageSessionShareParam,
  decodeStageSessionShareParam,
  buildStageShareUrl,
  openStageShareModal,
  printStageCueSheet
} from '../js/stage.js';
const exportedJson = serializeStageSession(jeonnam);
assert(exportedJson.includes('"type": "acaraca-stage-cuesheet"'), 'Exported JSON must contain acaraca-stage-cuesheet type');
const reimported = parseImportedStageSession(exportedJson);
assert.strictEqual(reimported.eventTitle, jeonnam.eventTitle, 'Reimported eventTitle must match');
assert.strictEqual(reimported.songs.length, jeonnam.songs.length, 'Reimported song count must match');

const encodedParam = encodeStageSessionShareParam(jeonnam);
assert(encodedParam && typeof encodedParam === 'string' && !encodedParam.includes('='), 'encodeStageSessionShareParam must return URL-safe Base64 string');
const decodedSession = decodeStageSessionShareParam(encodedParam);
assert(decodedSession && decodedSession.eventTitle === jeonnam.eventTitle, 'decodeStageSessionShareParam must restore eventTitle');
assert.strictEqual(decodedSession.songs.length, jeonnam.songs.length, 'decodeStageSessionShareParam must restore all songs');
const shareHref = buildStageShareUrl(jeonnam, 'https://gmlduqzhd123-lab.github.io/Acaraca/index.html');
assert(shareHref.includes('tab=stage') && shareHref.includes('view=live') && shareHref.includes('cuesheet='), 'buildStageShareUrl must include tab=stage, view=live, and cuesheet param');
assert.strictEqual(typeof openStageShareModal, 'function', 'openStageShareModal must be exported');
assert.strictEqual(typeof printStageCueSheet, 'function', 'printStageCueSheet must be exported');

// 14. Test All Songs Dedicated STAGE_AI_COMMENTS Coverage & Print Styles
for (const song of songsData.songs) {
  const c = STAGE_AI_COMMENTS[song.id];
  assert(c && c.wit && c.story && c.brief, `Song '${song.id}' (${song.title}) must have dedicated wit/story/brief STAGE_AI_COMMENTS`);
}
const styleCssSource = fs.readFileSync('css/style.css', 'utf8');
assert(styleCssSource.includes('@media print') && styleCssSource.includes('.stage-print-sheet'), 'css/style.css must include @media print rules for .stage-print-sheet');

// 15. Test Silent Stage Visual Tempo Pulse, Offline Cue-Sheet Score Prefetch, and Shortcuts
import { prefetchStageScoresOffline } from '../js/stage.js';
assert.strictEqual(typeof prefetchStageScoresOffline, 'function', 'prefetchStageScoresOffline must be exported');
assert(Number.isFinite(STAGE_EXTRA_SONG_METADATA['stand-by-me'].bpm), 'stand-by-me extra metadata must include bpm');
assert(Number.isFinite(STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'].bpm), 'the-lion-sleeps-tonight extra metadata must include bpm');
assert(stageJsSource.includes('toggleStageVisualTempo'), 'stage.js must include silent visual tempo pulse toggle');
assert(stageJsSource.includes('무음 템포'), 'stage.js must render silent tempo pulse button');
assert(stageJsSource.includes('큐시트 악보 오프라인 저장'), 'stage.js must include offline cue-sheet score prefetch button');
assert(styleCssSource.includes('.stage-tempo-btn.pulsing'), 'css/style.css must include .stage-tempo-btn.pulsing styles');

// 16. Test Runtime Estimation, Stage Transposition Round-Trip, Stopwatch, In-App Score, Opening Cue & Large Prompter
import { parseDurationSeconds, estimateSetlistDurationSeconds } from '../js/stage.js';
assert.strictEqual(parseDurationSeconds('3:45'), 225, 'parseDurationSeconds("3:45") must return 225');
assert.strictEqual(parseDurationSeconds('1:02:05'), 3725, 'parseDurationSeconds("1:02:05") must return 3725');
assert.strictEqual(parseDurationSeconds(''), 0, 'parseDurationSeconds("") must return 0');

const estJeonnam = estimateSetlistDurationSeconds(jeonnam, songsData.songs);
assert(estJeonnam.musicSeconds > 600, 'Estimated music seconds for 6-song setlist must exceed 10 minutes');
assert(estJeonnam.totalSeconds === estJeonnam.musicSeconds + estJeonnam.mcSeconds, 'Total seconds must equal music + MC transition seconds');
assert(estJeonnam.formatted.startsWith('약 ') && estJeonnam.formatted.endsWith('분'), 'Formatted runtime must be in Korean minutes');

// Verify per-item transpose (-6 ~ +6) round-trip in JSON export/import and ?cuesheet= share param
const transposedSession = {
  ...JSON.parse(JSON.stringify(jeonnam)),
  songs: jeonnam.songs.map((s, idx) => ({
    ...s,
    ...(idx === 0 ? { transpose: -2 } : idx === 1 ? { transpose: 3 } : {})
  }))
};
const exportedWithKey = serializeStageSession(transposedSession);
const reimportedWithKey = parseImportedStageSession(exportedWithKey);
assert.strictEqual(reimportedWithKey.songs[0].transpose, -2, 'Imported JSON cue sheet must preserve -2 transpose');
assert.strictEqual(reimportedWithKey.songs[1].transpose, 3, 'Imported JSON cue sheet must preserve +3 transpose');
assert.strictEqual(reimportedWithKey.songs[2].transpose, undefined, 'Zero transpose should remain omitted');

const shareWithKey = encodeStageSessionShareParam(transposedSession);
const decodedWithKey = decodeStageSessionShareParam(shareWithKey);
assert.strictEqual(decodedWithKey.songs[0].transpose, -2, 'Decoded share param must preserve -2 transpose');
assert.strictEqual(decodedWithKey.songs[1].transpose, 3, 'Decoded share param must preserve +3 transpose');

// Verify extra stage songs & all 34 songs have duration & openingCue
assert(STAGE_EXTRA_SONG_METADATA['stand-by-me'].duration && STAGE_EXTRA_SONG_METADATA['stand-by-me'].openingCue, 'stand-by-me must include duration and openingCue');
assert(STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'].duration && STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'].openingCue, 'the-lion-sleeps-tonight must include duration and openingCue');
for (const song of songsData.songs) {
  assert(parseDurationSeconds(song.duration) >= 60, `Song '${song.id}' must have valid duration >= 60s`);
  assert(typeof song.openingCue === 'string' && song.openingCue.length >= 4, `Song '${song.id}' must have openingCue`);
}

// Verify Stage Live View UI hooks (stopwatch, in-app score, openingCue, transpose, large prompter)
assert(stageJsSource.includes('stage-stopwatch-pill'), 'stage.js must include stage stopwatch');
assert(stageJsSource.includes('stage-inapp-score-btn'), 'stage.js must include in-app stage score button');
assert(stageJsSource.includes('stage-opening-cue-bar'), 'stage.js must include opening cue bar');
assert(stageJsSource.includes('stage-transpose-group'), 'stage.js must include stage key transposition controls');
assert(stageJsSource.includes('prompter-expanded') && stageJsSource.includes('대형 프롬프터'), 'stage.js must include expandable large MC prompter');

// 17. Test march-for-the-beloved extra stage metadata, MC comments & stage transpose forwarding to in-app score modal
assert(STAGE_EXTRA_SONG_METADATA['march-for-the-beloved'], 'march-for-the-beloved must be registered in STAGE_EXTRA_SONG_METADATA');
assert.strictEqual(STAGE_EXTRA_SONG_METADATA['march-for-the-beloved'].bpm, 76, 'march-for-the-beloved bpm must be 76');
assert(STAGE_AI_COMMENTS['march-for-the-beloved']?.wit && STAGE_AI_COMMENTS['march-for-the-beloved']?.story && STAGE_AI_COMMENTS['march-for-the-beloved']?.brief, 'march-for-the-beloved must have wit/story/brief STAGE_AI_COMMENTS');
assert(stageJsSource.includes("openStageSongScore(targetSongId, songTitle = '악보', transposeSemi = 0)"), 'openStageSongScore must accept transposeSemi and forward it to onOpenScore');
assert(appJsSource.includes('openScorePreviewModal(score, options = {})'), 'openScorePreviewModal must accept options.transpose from stage mode');

console.log('✓ Stage Mode logic unit tests passed successfully!');

