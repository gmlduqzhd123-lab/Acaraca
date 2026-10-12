import assert from 'node:assert';
import {
  STAGE_AI_COMMENTS,
  generateDynamicMCComment,
  DEFAULT_STAGE_HISTORY
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
assert(DEFAULT_STAGE_HISTORY.length >= 3, 'At least 3 default performances');
for (let i = 0; i < DEFAULT_STAGE_HISTORY.length - 1; i++) {
  assert(
    DEFAULT_STAGE_HISTORY[i].updatedAt >= DEFAULT_STAGE_HISTORY[i + 1].updatedAt,
    `Stage history must be sorted newest first! (${DEFAULT_STAGE_HISTORY[i].eventTitle} vs ${DEFAULT_STAGE_HISTORY[i+1].eventTitle})`
  );
}

console.log('✓ Stage Mode logic unit tests passed successfully!');
