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
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'], 'bohemian-rhapsody-5 comments exist');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'].wit.includes('퀸'), 'wit comment matches');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'].story.includes('보헤미안 랩소디'), 'story comment matches');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'].brief.length > 5, 'brief comment exists');

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
  { id: 'bohemian-rhapsody-5', title: '보헤미안 랩소디 · 5인용', artist: 'Queen' }
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
assert(DEFAULT_STAGE_HISTORY.length === 3, 'Exactly 3 user-entered performances in DEFAULT_STAGE_HISTORY');
assert(DEFAULT_STAGE_HISTORY.every(h => !isDummyStage(h)), 'No dummy performances in DEFAULT_STAGE_HISTORY');
for (const dummyId of ['stage-2026-spring', 'stage-2025-busking', 'stage-2024-suncheon']) {
  assert(DUMMY_STAGE_IDS.has(dummyId), `DUMMY_STAGE_IDS must track ${dummyId}`);
  assert(!DEFAULT_STAGE_HISTORY.some(h => h.id === dummyId), `Dummy ${dummyId} must not be in default history`);
}

// 3-0. Verify chronological sorting (newest first: 10.24 > 10.23 > 10.16)
assert.strictEqual(DEFAULT_STAGE_HISTORY[0].id, 'stage-2026-jeonnam', '1st should be 10.24 Jeonnam');
assert.strictEqual(DEFAULT_STAGE_HISTORY[0].date, '2026.10.24', '1st date matches');
assert.strictEqual(DEFAULT_STAGE_HISTORY[0].venue, '광주교육연수원', '1st venue matches');
assert.strictEqual(DEFAULT_STAGE_HISTORY[0].songs.length, 8, 'Jeonnam performance must have 8 songs');
const expectedJeonnamSongIds = [
  'in-your-arms',
  'old-pop-medley',
  'love-song-medley',
  'isnt-she-lovely',
  'lets-travel',
  'short-hair',
  'stand-by-me',
  'the-lion-sleeps-tonight'
];
assert.deepStrictEqual(DEFAULT_STAGE_HISTORY[0].songs.map(s => s.songId), expectedJeonnamSongIds);

assert.strictEqual(DEFAULT_STAGE_HISTORY[1].id, 'stage-2026-gyowon', '2nd should be 10.23 Gyowon');
assert.strictEqual(DEFAULT_STAGE_HISTORY[1].date, '2026.10.23', '2nd date matches');
assert.strictEqual(DEFAULT_STAGE_HISTORY[1].venue, '장흥문화예술회관', '2nd venue matches');
assert.strictEqual(DEFAULT_STAGE_HISTORY[1].songs.length, 1, 'Gyowon performance must have 1 song');
assert.strictEqual(DEFAULT_STAGE_HISTORY[1].songs[0].songId, 'bohemian-rhapsody-5');

// 3-1. Verify 2026 여수 생활문화한마당 performance (3rd)
const yeosu = DEFAULT_STAGE_HISTORY.find(h => h.id === 'stage-2026-yeosu');
assert(yeosu, 'stage-2026-yeosu must exist in DEFAULT_STAGE_HISTORY');
assert.strictEqual(DEFAULT_STAGE_HISTORY[2].id, 'stage-2026-yeosu', '3rd should be 10.16 Yeosu');
assert.strictEqual(yeosu.eventTitle, '2026 여수 생활문화한마당', 'Yeosu eventTitle matches');
assert.strictEqual(yeosu.date, '2026.10.16', 'Yeosu date matches');
assert.strictEqual(yeosu.venue, '웅천친수공원', 'Yeosu venue matches');
assert.strictEqual(yeosu.songs.length, 6, 'Yeosu must have 6 songs');
const expectedYeosuSongIds = [
  'love-song-medley',
  'old-pop-medley',
  'bohemian-rhapsody-5',
  'in-your-arms',
  'isnt-she-lovely',
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

// 4. Test Starting Pitch Extraction across all 33 songs
const songs = JSON.parse(fs.readFileSync('data/songs.json', 'utf8')).songs;
assert(songs.length === 33, '33 songs present in songs.json');

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
const appJsSource = fs.readFileSync('js/app.js', 'utf8');
assert(appJsSource.includes('function switchStageSubView(view)'), 'switchStageSubView helper must be defined');
assert(appJsSource.includes("switchStageSubView('live')"), "switchStageSubView('live') must be wired");
assert(appJsSource.includes("switchStageSubView('history')"), "switchStageSubView('history') must be wired");
assert(appJsSource.includes("switchStageSubView('list')"), "switchStageSubView('list') must be wired");

// 8. Test Live Mode Switcher (1곡 보기 vs 전체 큐시트 목록) & Overview renderer in stage.js
const stageJsSource = fs.readFileSync('js/stage.js', 'utf8');
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

console.log('✓ Stage Mode logic unit tests passed successfully!');

