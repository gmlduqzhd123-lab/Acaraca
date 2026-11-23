// 최근 추가된 기능(첫 음 순서·파트 이름·피치파이프·셋리스트·대체 재생) 회귀 테스트
// 실행: node tests/test-features.js
import assert from 'node:assert';
import fs from 'node:fs';
import { parseNoteString, pitchPipeInfo, lowNoteRecipe, chordVoices, synthesizeWav, isInAppUserAgent } from '../js/pitch.js';
import {
  DEFAULT_ENTRY_ORDER, splitMemberNames, resolveMyPart, collectMemberNames,
  entryRank, orderedPitchItems, parseStageDate, nextStage, daysUntil, resolveStageItemTranspose, sanitizeBackup, isSafeLinkUrl,
  sortSongs, classifyHorizontalSwipe, localDateString, isLightRoute, getScoreFormatKey, getScoreFormatLabel
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
eq(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 9, 25))?.stage.id, 'stage-2026-naju', '10/25 이후 다음 공연은 12/12 나주 공연');
eq(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 11, 12))?.stage.id, 'stage-2026-naju', '12/12 당일은 나주 공연');
eq(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 11, 13))?.stage.id, 'stage-2026-jeongdeok', '12/13부터는 12/18 전학공 연말 공연');
eq(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 11, 18))?.stage.id, 'stage-2026-jeongdeok', '12/18 당일도 전학공 연말 공연');
ok(nextStage(DEFAULT_STAGE_HISTORY, new Date(2026, 11, 19)) === null, '모든 공연이 지나면 없음');
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
// 백업 파일 검사: 깨진 항목·스크립트 링크는 버리고, 백업이 아니면 아무것도 적용하지 않음
{
  const bad = sanitizeBackup({
    type: 'acaraca-backup',
    customScores: [null, 'x', { title: 'id 없음' }, { id: 's1', fileUrl: 'javascript:alert(1)', driveUrl: 'https://drive.google.com/x' }],
    customRehearsals: [null], teamFeedbacks: [null, { id: 'fb1', rehearsalId: 'r' }],
    recent: [null, { songId: 'bohemian-rhapsody-5', part: 'part1', timestamp: 1 }],
    favorites: ['bohemian-rhapsody-5', 'bohemian-rhapsody', 3],
    progress: { a: 3, b: 'x', c: { level: 2 } }, songTranspositions: { a: 9, b: 'x' },
    stageHistory: [null, { id: 's', songs: [] }], stageActive: { id: 'z' }, stageDeletedIds: ['stage-2026-yeosu', 1]
  }, { resolveSongId: (id) => (id === 'bohemian-rhapsody-5' ? 'bohemian-rhapsody' : id), validParts: ['part1'] });
  eq(bad.customScores.map(x => x.id), ['s1'], '백업: id 있는 정상 악보만 남김');
  eq(bad.customScores[0].fileUrl, undefined, '백업: javascript: 링크 제거');
  eq(bad.customScores[0].driveUrl, 'https://drive.google.com/x', '백업: 정상 링크 유지');
  eq(bad.customRehearsals, [], '백업: 깨진 연습 일지 제거');
  eq(bad.teamFeedbacks.map(x => x.id), ['fb1'], '백업: 깨진 피드백 제거');
  eq(bad.recent.map(r => r.songId), ['bohemian-rhapsody'], '백업: 최근 연습 정리 + 예전 곡 id 변환');
  eq(bad.favorites, ['bohemian-rhapsody'], '백업: 즐겨찾기 중복·잘못된 값 정리');
  eq(Object.keys(bad.progress).sort(), ['a', 'c'], '백업: 숙련도 잘못된 값 제거');
  eq(bad.songTranspositions, { a: 6 }, '백업: 조바꿈 ±6 제한, 숫자 아닌 값 제거');
  eq(bad.stageHistory.map(s => s.id), ['s'], '백업: 깨진 공연 제거');
  eq(bad.stageActive, undefined, '백업: 곡 목록 없는 현재 공연 무시');
  eq(bad.stageDeletedIds, ['stage-2026-yeosu'], '백업: 지운 공연 목록 유지');
  let rejected = 0;
  for (const notBackup of [null, [1, 2], 'text', { hello: 1 }]) { try { sanitizeBackup(notBackup); } catch { rejected += 1; } }
  eq(rejected, 4, '백업이 아닌 파일은 거부');
}
ok(!isSafeLinkUrl('javascript:alert(1)') && !isSafeLinkUrl(' JavaScript:x') && !isSafeLinkUrl('data:text/html,<b>'), '스크립트 링크 차단');
ok(isSafeLinkUrl('https://a.b/c.pdf') && isSafeLinkUrl('./assets/scores/아로하.nwc') && isSafeLinkUrl('blob:https://x/1') && isSafeLinkUrl('data:application/pdf;base64,AA'), '정상 링크 허용');

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
for (const file of ['js/app.js', 'js/stage.js', 'js/stageStore.js', 'js/scoreViewer.js', 'js/archivePages.js']) {
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

// 9. 휴대폰 사용감 보정 (무대 도구 접기 · 이전/다음 고정 · 영상 먼저 · 홈 3곡 · 한 줄 머리글 · 아이폰 전체화면 · 뒤로가기)
{
  const stageSrc = ['js/stage.js', 'js/stageStore.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const appSrc = ['js/app.js', 'js/scoreViewer.js', 'js/archivePages.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const cssSrc = fs.readFileSync('css/style.css', 'utf8');
  ok(stageSrc.includes("el('details', { class: 'stage-tools-drawer' }"), '무대 큐시트: 보조 도구를 접는 무대 도구 서랍');
  ok(stageSrc.includes("matchMedia('(min-width: 601px)')"), '무대 도구 서랍은 휴대폰에서 기본으로 접힘');
  ok(!stageSrc.includes("'⛶'") && !stageSrc.includes("'🗗'") && !fs.readFileSync('js/player.js', 'utf8').includes('⛶'), '전체화면·가로 확대 버튼은 일부 폰에서 깨지는 기호(⛶) 대신 표시 가능한 글자로');
  ok(stageSrc.includes('fullscreenSupported') && stageSrc.includes('홈 화면에 추가'), '아이폰처럼 전체화면을 지원하지 않으면 홈 화면 추가 안내');
  ok(/\.stage-nav-bar \{\s*position: sticky;/.test(cssSrc), '휴대폰 무대 큐시트 이전/다음 버튼 화면 아래 고정');
  ok(/app\.append\(\.\.\.\[firstNoteStrip, playerLayout, controller, primaryActions, startingPitchPanel/.test(appSrc), '연습실: 영상이 파트별 첫 음 패널보다 먼저');
  ok(appSrc.includes('const HOME_SETLIST_PREVIEW = 3;') && appSrc.includes('나머지 ${hiddenRows.length}곡 펼치기'), '홈 셋리스트 3곡 미리보기 + 펼치기');
  ok(appSrc.includes("daysUntil(date) < 0") && appSrc.includes('+ 다음 공연 만들기'), '지난 공연은 지난 공연으로 표시하고 다음 공연 만들기 안내');
  ok(/header\.topbar \{ flex-wrap: nowrap;/.test(cssSrc) && cssSrc.includes('header.topbar .mobile-settings-btn { display: none; }'), '휴대폰 머리글 한 줄 · 중복 설정 버튼 숨김');
  ok(/\.loop-nudge-btn \{ min-width: 44px; min-height: 38px; \}/.test(cssSrc), '구간 반복 ±1초 버튼 터치 크기 확대');
  ok(appSrc.includes('acaMoreSheet: true') && appSrc.includes("closeMobileMoreSheet({history: 'none'});\n    return;"), '휴대폰 뒤로가기는 더보기 메뉴만 닫음');
  ok(appSrc.includes('function navigateFromMoreSheet(route)'), '더보기 메뉴에서 이동하면 메뉴 기록을 새 화면이 대신함');
}

// 10. 첫 화면 속도: 홈·곡 목록은 큰 자료 없이 먼저 그리고, 무대·악보 미리보기·자료실 화면 코드는 필요할 때 불러온다
{
  eq(isLightRoute({ tab: 'home' }), true, '홈은 큰 자료 없이 바로 그림');
  eq(isLightRoute({ tab: 'songs' }), true, '곡 목록은 큰 자료 없이 바로 그림');
  eq(isLightRoute({ tab: 'favorites' }), true, '즐겨찾기는 큰 자료 없이 바로 그림');
  eq(isLightRoute({ tab: 'recent' }), true, '최근 연습은 큰 자료 없이 바로 그림');
  eq(isLightRoute({}), true, '주소가 비어 있으면 홈');
  eq(isLightRoute({ tab: 'home', song: 'bohemian-rhapsody' }), false, '곡 화면은 악보·감상 자료가 필요');
  eq(isLightRoute({ tab: 'stage', view: 'live' }), false, '무대 화면은 악보 자료가 필요');
  eq(isLightRoute({ tab: 'stage', cuesheet: 'abc' }), false, '공유받은 큐시트는 무대 화면');
  for (const tab of ['scores', 'appreciation', 'memories', 'education', 'practiceVideos', 'rehearsal', 'settings']) {
    eq(isLightRoute({ tab }), false, `${tab} 화면은 큰 자료를 받은 뒤 그림`);
  }
  eq(getScoreFormatKey({ fileName: 'a.NWC' }), 'nwc', 'NWC 악보 형식');
  eq(getScoreFormatKey({ format: 'nwctxt' }), 'nwc', 'NWC 텍스트 악보 형식');
  eq(getScoreFormatKey({ fileUrl: './x/y.pdf' }), 'pdf', 'PDF 악보 형식');
  eq(getScoreFormatKey({ fileName: 'a.midi' }), 'midi', 'MIDI 형식');
  eq(getScoreFormatKey({ fileName: 'a.mscz' }), 'mscz', '뮤즈스코어 형식');
  eq(getScoreFormatKey({ fileName: 'a.hwp' }), 'etc', '그 밖의 형식');
  eq(getScoreFormatKey(null), 'etc', '빈 악보도 오류 없이');
  eq(getScoreFormatLabel({ fileName: 'a.nwc' }), '🎵 NWC 악보', 'NWC 악보 표시 이름');
  eq(getScoreFormatLabel({ format: 'audio' }), '🎙️ 가이드 음원', '가이드 음원 표시 이름');

  const appOnly = fs.readFileSync('js/app.js', 'utf8');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const swSrc = fs.readFileSync('sw.js', 'utf8');
  const staticImports = [...appOnly.matchAll(/^import[\s\S]*?from '(\.\/[^']+)';/gm)].map((m) => m[1]);
  for (const lazy of ['./stage.js', './scoreViewer.js', './archivePages.js']) {
    ok(!staticImports.includes(lazy), `app.js는 ${lazy}를 시작할 때 받지 않음 (필요할 때 불러옴)`);
    // 다시 시도 시 새로 받아오도록 importLazy()를 거쳐 불러온다 (내부에서 import(url) 사용)
    ok(appOnly.includes(`import('${lazy}')`) || appOnly.includes(`importLazy('${lazy}')`), `app.js가 ${lazy}를 필요할 때 불러옴`);
  }
  ok(staticImports.includes('./stageStore.js'), '홈 공연 카드에 필요한 무대 자료(stageStore.js)는 시작할 때 받음');
  // 시작할 때 받는 모듈은 모두 미리 받기(modulepreload) 목록에 있어야 순서대로 기다리지 않는다
  const preloads = new Set([...indexHtml.matchAll(/<link rel="modulepreload" href="\.\/js\/([^"?]+)/g)].map((m) => m[1]));
  ok(preloads.has('app.js'), 'app.js 미리 받기');
  for (const mod of staticImports) ok(preloads.has(mod.replace('./', '')), `시작 모듈 ${mod} 미리 받기`);
  for (const lazy of ['stage.js', 'scoreViewer.js', 'archivePages.js']) ok(!preloads.has(lazy), `필요할 때 불러오는 ${lazy}는 미리 받지 않음`);
  // 오프라인(지하 연습실·공연장)에서도 열리도록 모든 모듈을 저장
  for (const f of fs.readdirSync('js').filter((f) => f.endsWith('.js') && f !== 'admin.js')) {
    ok(swSrc.includes(`'./js/${f}'`), `오프라인 저장 목록(sw.js)에 js/${f} 포함`);
  }
  ok(!/<script src="\.\/js\/vendor\/qrcode-generator[^>]*><\/script>/.test(indexHtml), 'QR 라이브러리는 첫 화면을 막지 않게 나중에 받음');
  ok(/<script src="\.\/ys-qr\.js" defer><\/script>/.test(indexHtml), 'QR 접속 도우미는 defer로 실행');
  ok(/pretendardvariable-dynamic-subset\.min\.css" media="print" onload="this\.media='all'"/.test(indexHtml), '글꼴은 첫 화면을 막지 않게 받은 뒤 적용');
  ok(appOnly.includes("class: 'home-archive-summary'"), '홈 자료 요약은 자료를 받으면 그 자리에서 갱신');
  // 메뉴 아이콘은 화면 크기(20~24px)에 맞게 작게 (예전 150px대 · 25~35KB)
  for (const f of fs.readdirSync('assets/icons/nav').filter((f) => f.endsWith('.png'))) {
    ok(fs.statSync(`assets/icons/nav/${f}`).size < 12000, `메뉴 아이콘 ${f}는 12KB 미만`);
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`);
console.log(`✓ Recent feature tests passed (${checks} checks${warnings.length ? `, ${warnings.length} warnings` : ''})`);
