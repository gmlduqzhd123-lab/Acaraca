import assert from 'node:assert';
import fs from 'node:fs';
import {
  STAGE_AI_COMMENTS,
  generateDynamicMCComment,
  DEFAULT_STAGE_HISTORY,
  getSongStartingPitchEntries,
  cleanupStageLive,
  STAGE_ADMIN_PASSWORD,
  promptStagePassword
} from '../js/stage.js';

console.log('Testing Stage Mode Logic...');

// 1. Check AI Comments
assert(typeof STAGE_AI_COMMENTS === 'object', 'STAGE_AI_COMMENTS must be an object');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'], 'bohemian-rhapsody-5 comments exist');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'].wit.includes('퀸'), 'wit comment matches');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'].story.includes('보헤미안 랩소디'), 'story comment matches');
assert(STAGE_AI_COMMENTS['bohemian-rhapsody-5'].brief.length > 5, 'brief comment exists');

// 2. Test Dynamic Generator Fallback
const dummySong = { id: 'dummy-song', title: '아카라카 찬가', artist: '아카라카', category: '응원가', arrangement: '4부' };
const genWit = generateDynamicMCComment(dummySong, 'wit');
const genStory = generateDynamicMCComment(dummySong, 'story');
const genBrief = generateDynamicMCComment(dummySong, 'brief');

assert(genWit.includes('아카라카 찬가'), 'Dynamic wit includes song title');
assert(genStory.includes('아카라카 찬가'), 'Dynamic story includes song title');
assert(genBrief.includes('아카라카 찬가'), 'Dynamic brief includes song title');

// 3. Test Default Stage History ordering (newest first)
assert(Array.isArray(DEFAULT_STAGE_HISTORY), 'DEFAULT_STAGE_HISTORY must be an array');
assert(DEFAULT_STAGE_HISTORY.length >= 4, 'At least 4 default performances');
for (let i = 0; i < DEFAULT_STAGE_HISTORY.length - 1; i++) {
  assert(
    DEFAULT_STAGE_HISTORY[i].updatedAt >= DEFAULT_STAGE_HISTORY[i + 1].updatedAt,
    `Stage history must be sorted newest first! (${DEFAULT_STAGE_HISTORY[i].eventTitle} vs ${DEFAULT_STAGE_HISTORY[i+1].eventTitle})`
  );
}

// 3-1. Verify 2026 여수 생활문화한마당 performance
const yeosu = DEFAULT_STAGE_HISTORY.find(h => h.id === 'stage-2026-yeosu');
assert(yeosu, 'stage-2026-yeosu must exist in DEFAULT_STAGE_HISTORY');
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

console.log('✓ Stage Mode logic unit tests passed successfully!');
