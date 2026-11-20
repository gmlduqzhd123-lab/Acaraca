// 최근 추가된 기능(첫 음 순서·파트 이름·피치파이프·셋리스트·대체 재생) 회귀 테스트
// 실행: node tests/test-features.js
import assert from 'node:assert';
import fs from 'node:fs';
import { parseNoteString, pitchPipeInfo, lowNoteRecipe, chordVoices, synthesizeWav, isInAppUserAgent } from '../js/pitch.js';
import {
  DEFAULT_ENTRY_ORDER, splitMemberNames, resolveMyPart, collectMemberNames,
  entryRank, orderedPitchItems, parseStageDate, nextStage, daysUntil, resolveStageItemTranspose,
  sortSongs, classifyHorizontalSwipe, localDateString
} from '../js/practiceLogic.js';
import { PARTS, resolveSongId } from '../js/data.js';
import { DEFAULT_STAGE_HISTORY, STAGE_EXTRA_SONG_METADATA, getSongStartingPitchEntries, findUpcomingStage, resolveSongData, parseImportedStageSession } from '../js/stage.js';

const songs = JSON.parse(fs.readFileSync('data/songs.json', 'utf8')).songs;
const byId = Object.fromEntries(songs.map(s => [s.id, s]));
let checks = 0;
const warnings = [];
const ok = (cond, msg) => { assert(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); checks++; };

console.log('Testing recent features...');

// 1. 곡 데이터 무결성: entryOrder · partNames · pitchPipe
for (const s of songs) {
  const parts = Object.keys(s.startingPitches || {}).filter(k => /^part\d+$/.test(k));
  if (s.entryOrder) {
    ok(Array.isArray(s.entryOrder), `${s.id}: entryOrder는 배열`);
    ok(new Set(s.entryOrder).size === s.entryOrder.length, `${s.id}: entryOrder 중복 없음`);
    for (const k of s.entryOrder) ok(parts.includes(k), `${s.id}: entryOrder의 ${k}에 첫 음이 있어야 함`);
  }
  for (const [k, name] of Object.entries(s.partNames || {})) {
    ok(Object.hasOwn(PARTS, k), `${s.id}: partNames 키 ${k}는 앱이 아는 파트`);
    if (/^part\d+$/.test(k) && !parts.includes(k)) warnings.push(`${s.id}: ${k}(${name})에 이름은 있지만 첫 음이 없어 화면에 표시되지 않음`);
    ok(splitMemberNames(name).length > 0, `${s.id}: ${k} 이름이 비어 있지 않음`);
    ok(!/^[A-Z]{2}$/.test(name), `${s.id}: ${k} 이름은 영문 이니셜이 아닌 한글 (${name})`);
  }
  if (s.pitchPipe) {
    ok(pitchPipeInfo(s.pitchPipe), `${s.id}: 피치파이프 대표음 ${s.pitchPipe} 해석 가능`);
    const chord = new Set(parts.map(k => parseNoteString(s.startingPitches[k])?.semitone));
    ok(chord.has(parseNoteString(`${s.pitchPipe}4`).semitone), `${s.id}: 대표음 ${s.pitchPipe}는 첫 화음 안의 음`);
  }
}
ok(songs.every(s => s.pitchPipe), '모든 곡에 피치파이프 대표음이 있음');

// 2. 파트 이름 → 내 파트
eq(splitMemberNames('선영 · 희엽'), ['선영', '희엽'], '여러 이름 분리');
eq(resolveMyPart(byId['in-your-arms'], '선영', 'part3'), 'part1', '그대 내 품에: 선영 = 1번');
eq(resolveMyPart(byId['lets-travel'], '선영', 'part3'), 'part3', '여행을 떠나요: 선영 = 3번');
eq(resolveMyPart(byId['bohemian-rhapsody'], '희엽', ''), 'part2', '보헤미안 랩소디: 희엽 = 2번(맞바꿈 반영)');
eq(resolveMyPart({ partNames: { part1: '용석' } }, '선영', 'part4'), 'part4', '내 이름이 없는 곡은 기본 파트');
// 합쳐진 곡의 예전 id(보헤미안 랩소디 · 5인용)는 지금 곡으로 연결
eq(resolveSongId('bohemian-rhapsody-5'), 'bohemian-rhapsody', '예전 5인용 id → 보헤미안 랩소디');
eq(resolveSongId('aloha'), 'aloha', '별칭 없는 id는 그대로');
eq(byId['bohemian-rhapsody-5'], undefined, '5인용 곡은 목록에서 제거');
eq(resolveSongData(songs, 'bohemian-rhapsody-5').id, 'bohemian-rhapsody', '예전 id로 곡 정보 조회');
eq(parseImportedStageSession({ eventTitle: '예전 큐시트', songs: [{ songId: 'bohemian-rhapsody-5', title: '보헤미안 랩소디 · 5인용' }] }).songs[0].songId, 'bohemian-rhapsody', '예전 공유 큐시트의 곡 id 변환');
eq(resolveMyPart(byId['in-your-arms'], '', 'part2'), 'part2', '이름 미설정 시 기본 파트');
const names = collectMemberNames(songs);
for (const n of ['용석', '선영', '희엽', '재우', '휘소', '명현']) ok(names.includes(n), `단원 목록에 ${n}`);
for (const n of ['우성', '유진', '지웅', '태영']) ok(!names.includes(n), `삭제한 이름 ${n} 없음`);

// 3. 첫 음 재생 순서
eq(DEFAULT_ENTRY_ORDER, ['part2', 'part4', 'part1', 'part3'], '기본 순서 2·4·1·3');
const fake = { startingPitches: { part1: 'C4', part2: 'E4', part3: 'G4', part4: 'C3', part5: 'G2' } };
eq(orderedPitchItems(fake).map(i => i.partKey), ['part2', 'part4', 'part1', 'part3', 'part5'], '순서 정보 없으면 2·4·1·3 다음 번호순');
eq(orderedPitchItems({ ...fake, entryOrder: ['part5', 'part1'] }).map(i => i.partKey), ['part5', 'part1', 'part2', 'part3', 'part4'], '저장된 순서 우선, 나머지 번호순');
for (const s of songs.filter(x => Array.isArray(x.entryOrder))) {
  const got = orderedPitchItems(s).map(i => i.partKey);
  eq(got.slice(0, s.entryOrder.length), s.entryOrder.filter(k => got.includes(k)), `${s.id}: 저장된 순서대로 재생`);
}
ok(entryRank({})('part7') > entryRank({})('part3'), '목록 밖 파트는 뒤로');
eq(getSongStartingPitchEntries(byId['in-your-arms']).map(([k]) => k), orderedPitchItems(byId['in-your-arms']).map(i => i.partKey), '무대 모드와 연습실 순서 동일');
eq(getSongStartingPitchEntries(STAGE_EXTRA_SONG_METADATA['stand-by-me'])[0][0], 'lead', 'Stand By Me: 솔로부터');

// 4. 공연 날짜 · 다가오는 공연
eq(parseStageDate('2026.10.24').getDate(), 24, '날짜 해석');
ok(parseStageDate('미정') === null, '날짜 형식 아니면 null');
eq(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 9, 16))?.stage.id, 'stage-2026-yeosu', '10/16 당일은 여수 공연');
eq(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 9, 19))?.stage.id, 'stage-2026-gyowon', '10/19에는 교원예술제');
eq(findUpcomingStage(DEFAULT_STAGE_HISTORY, new Date(2026, 9, 24))?.id, 'stage-2026-jeonnam', '10/24 당일은 광주 공연');
ok(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 9, 25)) === null, '모든 공연이 지나면 없음');
eq(daysUntil(new Date(2026, 9, 24), new Date(2026, 9, 21, 15)), 3, 'D-3 계산');
const gwangju = DEFAULT_STAGE_HISTORY.find(h => h.id === 'stage-2026-jeonnam');
ok(gwangju.revision >= 2, '광주 셋리스트 수정 시 revision 증가');
for (const h of DEFAULT_STAGE_HISTORY) for (const item of h.songs) {
  ok(byId[item.songId] || STAGE_EXTRA_SONG_METADATA[item.songId], `${h.id}: 셋리스트 곡 ${item.songId} 존재`);
}

// 5. 첫 음 소리 (피치파이프 · 낮은 음 · 대체 재생)
eq(pitchPipeInfo('Bb'), { note: 'Bb', display: 'B♭', korean: '시♭' }, '피치파이프 표시 B♭ (시♭)');
ok(pitchPipeInfo('') === null && pitchPipeInfo('X') === null, '잘못된 대표음은 null');
const f3 = lowNoteRecipe(parseNoteString('F3').freq);
ok(f3.isLow && f3.h[0] < f3.h[1] + 0.01 && f3.level < 1, 'F3: 기본음을 줄이고 배음을 키움');
ok(!lowNoteRecipe(parseNoteString('A4').freq).isLow, 'A4는 일반 음색');
const voices = chordVoices(['C4', 'E4', 'G4', 'F2'].map(n => parseNoteString(n)));
ok(voices.find(v => v.freq < 165).harmonics.length > voices.find(v => v.freq > 300).harmonics.length, '베이스는 배음을 더 많이');
const wav = synthesizeWav(voices, 1000, 0.7);
const dv = new DataView(wav);
eq(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)), 'RIFF', 'WAV 헤더');
eq(dv.getUint32(24, true), 22050, 'WAV 샘플레이트');
let peak = 0; for (let i = 44; i < wav.byteLength; i += 2) peak = Math.max(peak, Math.abs(dv.getInt16(i, true)));
ok(peak / 32767 <= 0.71 && peak / 32767 >= 0.69, `WAV 최고치 0.7 (찢어짐 없음): ${(peak / 32767).toFixed(3)}`);
ok(isInAppUserAgent('Mozilla/5.0 (Linux; Android 14; wv) KAKAOTALK/10.9.5'), '카카오톡 인앱 감지');
ok(!isInAppUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/129 Mobile Safari/537.36'), '일반 크롬은 인앱 아님');

// 큐시트 곡 조바꿈: 큐시트 값(0 포함) 우선, 없으면 연습실에서 저장한 곡 조바꿈 (홈 카드·무대 화면 공통)
eq(resolveStageItemTranspose({ songId: 'a' }, { a: 2 }), 2, '큐시트 값 없으면 곡 조바꿈 사용');
eq(resolveStageItemTranspose({ songId: 'a', transpose: -1 }, { a: 2 }), -1, '큐시트 값 우선');
eq(resolveStageItemTranspose({ songId: 'a', transpose: 0 }, { a: 2 }), 0, '큐시트에서 원키(0)로 정하면 원키');
eq(resolveStageItemTranspose({ songId: 'a', transpose: null }, { a: 2 }), 2, 'null은 값 없음으로 취급');
eq(resolveStageItemTranspose({ songId: 'a' }, { a: 9 }), 6, '±6으로 제한');
eq(resolveStageItemTranspose({ songId: 'b' }, { a: 2 }), 0, '저장값 없으면 0');

// 6. 연습실 정렬 (sortSongs) · LIVE 무대 스와이프 판별 (classifyHorizontalSwipe)
const sampleSortSongs = [
  { id: 'c', title: '풍선', difficulty: 2 },
  { id: 'a', title: '가을 우체국 앞에서', difficulty: 1 },
  { id: 'b', title: '보헤미안 랩소디', difficulty: 3 }
];
const sampleProg = { c: { level: 3 }, b: { level: 1 } };
const sampleRecent = [
  { songId: 'b', timestamp: 100 },
  { songId: 'c', timestamp: 500 },
  { songId: 'b', timestamp: 800 }
];
eq(sortSongs(sampleSortSongs, '').map(s => s.id), ['c', 'a', 'b'], '기본 정렬은 원래 순서 유지');
eq(sortSongs(sampleSortSongs, 'title').map(s => s.id), ['a', 'b', 'c'], '가나다순 정렬');
eq(sortSongs(sampleSortSongs, 'mastery-asc', { progress: sampleProg }).map(s => s.id), ['a', 'b', 'c'], '덜 익힌 순(0→1→3) 정렬');
eq(sortSongs(sampleSortSongs, 'recent', { recent: sampleRecent }).map(s => s.id), ['b', 'c', 'a'], '최근 연습순(최신 timestamp 우선) 정렬');
eq(sortSongs(sampleSortSongs, 'difficulty-desc').map(s => s.id), ['b', 'c', 'a'], '난이도 높은 순 정렬');
eq(sortSongs(sampleSortSongs, 'difficulty-asc').map(s => s.id), ['a', 'c', 'b'], '난이도 낮은 순 정렬');

eq(classifyHorizontalSwipe(-80, 10), 'next', '왼쪽으로 충분히 밀면 다음 곡');
eq(classifyHorizontalSwipe(80, -15), 'prev', '오른쪽으로 충분히 밀면 이전 곡');
eq(classifyHorizontalSwipe(-30, 5), null, '짧은 이동은 스와이프 무시');
eq(classifyHorizontalSwipe(-70, 90), null, '세로 스크롤이 더 크면 스와이프 무시');

// 7. 현지 시각 기준 날짜 (새벽에 하루 전 날짜가 찍히지 않음)
eq(localDateString(new Date(2026, 10, 20, 0, 30)), '2026-11-20', '자정 직후도 오늘 날짜');
eq(localDateString(new Date(2026, 0, 5, 8, 59), '.'), '2026.01.05', '오전 9시 전도 오늘 날짜 · 점 구분');
for (const file of ['js/app.js', 'js/stage.js']) {
  ok(!/toISOString\(\)\.slice\(0,\s*10\)/.test(fs.readFileSync(file, 'utf8')), `${file}: 날짜 기본값은 세계 표준시(toISOString)가 아닌 localDateString 사용`);
}

// 8. 악보 데이터: 파일이 실제로 있고, 엉뚱한 곡에 연결되지 않음
const allScores = JSON.parse(fs.readFileSync('data/scores.json', 'utf8')).scores;
for (const sc of allScores) {
  if (!sc.fileUrl || /^https?:/i.test(sc.fileUrl)) continue;
  ok(!/%[0-9A-F]{2}/i.test(sc.fileUrl), `${sc.id}: 파일 경로에 깨진 글자(%28 등)가 없어야 함`);
  ok(fs.existsSync(sc.fileUrl.replace(/^\.\//, '')), `${sc.id}: 악보 파일이 실제로 있어야 함 (${sc.fileUrl})`);
}
const scoreById = Object.fromEntries(allScores.map(s => [s.id, s]));
eq(scoreById['score-desk-014'].songId, 'isnt-she-lovely', "Isn't she lovely 악보는 Isn't She Lovely 곡에 연결");
eq(scoreById['score-desk-079'].songId, 'white-christmas', 'White Christmas 악보는 White Christmas 곡에 연결');
for (const sc of allScores.filter(s => s.songId === 'l-o-v-e')) {
  ok(!/(dive|open.?door|i love you|perhaps|tender|lover|lovely|this.?love|need is love|falling|tell)/i.test(sc.title), `L.O.V.E.에 다른 곡 악보가 섞이지 않음: ${sc.title}`);
}
ok(!allScores.some(s => s.songId === 'would-be-good' && /좋을텐데/.test(s.title)), "'좋겠다'에 다른 곡 '좋을텐데' 악보가 섞이지 않음");

for (const w of warnings) console.warn(`⚠ ${w}`);
console.log(`✓ Recent feature tests passed (${checks} checks${warnings.length ? `, ${warnings.length} warnings` : ''})`);
