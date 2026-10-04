import { parseYouTube, createPlayer } from '../js/player.js';
import { validateData, availableParts, preferredPart } from '../js/data.js';
import { filterSongs } from '../js/search.js';
import * as storage from '../js/storage.js';
import { getNoteFrequency, NOTES } from '../js/pitch.js';
import {
  getAllFeedbacks,
  addFeedback,
  toggleFeedbackLike,
  getPerformancesForSong,
  getRehearsalsForSong,
  getScoresForSong,
  toggleMemoryLike,
  addCustomEducation,
  deleteCustomEducation,
  addCustomPracticeVideo,
  deleteCustomPracticeVideo,
  addCustomAppreciation,
  deleteCustomAppreciation
} from '../js/archive.js';

/** Run from an HTTP browser console: (await import('./tests/core-tests.js')).runCoreTests() */
export function runCoreTests() {
  const results = [];
  const check = (name, test) => {
    try {
      if (!test()) throw new Error('예상한 결과와 다릅니다.');
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    }
  };
  // Official YouTube IFrame API sample; the playlist below is a parsing fixture only.
  const videoId = 'M7lc1UVf-VE';
  const playlistId = 'PL1234567890abcdefghij';
  const video = (url) => parseYouTube({ type: 'video', url });
  const playlist = (url) => parseYouTube({ type: 'playlist', url });
  const validVideo = { type: 'video', url: `https://www.youtube.com/watch?v=${videoId}` };
  [
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://m.youtube.com/watch?v=${videoId}`,
    `https://music.youtube.com/watch?v=${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
  ].forEach((url) => check(`영상 주소: ${url}`, () => video(url).videoId === videoId && video(url).ok));
  check('재생목록 주소', () => playlist(`https://youtube.com/playlist?list=${playlistId}`).embedUrl.endsWith(`videoseries?list=${playlistId}`));
  check('video + list는 단일 영상 임베드', () => {
    const parsed = video(`https://youtube.com/watch?v=${videoId}&list=${playlistId}`);
    return parsed.ok && !parsed.embedUrl.includes('list=') && parsed.playlistId === playlistId;
  });
  check('playlist + video는 재생목록 임베드', () => playlist(`https://youtube.com/watch?v=${videoId}&list=${playlistId}`).embedUrl.includes('videoseries'));
  check('HTTP 주소를 HTTPS로 정규화', () => video(`http://youtube.com/watch?v=${videoId}`).originalUrl.startsWith('https://'));
  check('빈 URL 별도 상태', () => video('   ').empty && !video('').ok);
  check('영상 종류에 재생목록만 입력하면 오류', () => !video(`https://youtube.com/playlist?list=${playlistId}`).ok);
  check('재생목록 종류에 영상만 입력하면 오류', () => !playlist(`https://youtu.be/${videoId}`).ok);
  [
    `https://youtube.com.evil.test/watch?v=${videoId}`,
    `https://evil.test/youtube.com/watch?v=${videoId}`,
    `https://youtube.com@evil.test/watch?v=${videoId}`,
    `https://user:password@youtube.com/watch?v=${videoId}`,
    'javascript:alert(1)',
    `ftp://youtube.com/watch?v=${videoId}`,
    `https://youtube.com:8080/watch?v=${videoId}`,
    'https://youtube.com/watch?v=invalid',
    `https://youtube.com/something/${videoId}`,
    `https://youtu.be/${videoId}/extra`,
  ].forEach((url) => check(`안전하지 않은 주소 거부: ${url}`, () => !video(url).ok && !video(url).empty));

  const songs = [
    { id: 'night', title: '밤양갱', artist: 'BIBI', category: 'K-POP', difficulty: 2, status: 'practice', memo: '화음을 맞춰요', tags: ['sweet'], videos: { alto: validVideo, full: validVideo } },
    { id: 'jazz', title: 'Morning Harmony', artist: 'AcaRoom', category: 'JAZZ', difficulty: 1, status: 'complete', tags: [], videos: { bass: validVideo } },
  ];
  check('정상 스키마', () => validateData({ version: 1, songs }, { warn: false }).songs.length === 2);
  check('songs 배열 필수', () => validateData({ songs: {} }, { warn: false }).errors.length > 0);
  check('빈 배열 허용', () => validateData({ songs: [] }, { warn: false }).errors.length === 0);
  check('잘못된 개별 항목만 제거', () => validateData({ songs: [null, ...songs, { ...songs[0], id: 'wrong', difficulty: 9 }] }, { warn: false }).songs.length === 2);
  check('중복 ID 제거 및 오류 보고', () => {
    const result = validateData({ songs: [...songs, songs[0]] }, { warn: false });
    return result.songs.length === 2 && result.errors.some((message) => message.includes('중복'));
  });
  check('잘못된 status 거부', () => validateData({ songs: [{ ...songs[0], status: 'unknown' }] }, { warn: false }).songs.length === 0);
  check('잘못된 media type 거부', () => validateData({ songs: [{ ...songs[0], videos: { alto: { type: 'unknown', url: '' } } }] }, { warn: false }).errors.length > 0);
  check('안전하지 않은 썸네일 제거', () => validateData({ songs: [{ ...songs[0], thumbnail: 'javascript:alert(1)' }] }, { warn: false }).songs[0].thumbnail === '');
  check('잘못된 선택 필드 정규화', () => {
    const result = validateData({ songs: [{ ...songs[0], tags: ['keep', 9], memo: {} }] }, { warn: false });
    return result.songs.length === 1 && result.songs[0].tags.join() === 'keep' && result.songs[0].memo === '';
  });
  check('빈 객체와 빈 URL은 연습 가능한 파트에서 제외', () => availableParts({ videos: { alto: {}, bass: { type: 'video', url: '' }, vp: null } }).length === 0);
  check('잘못된 URL 경고 및 정상 곡 유지', () => {
    const result = validateData({ songs: [{ ...songs[0], videos: { alto: { type: 'video', url: 'https://evil.test/' } } }] }, { warn: false });
    return result.songs.length === 1 && result.warnings.length > 0 && !availableParts(result.songs[0]).length;
  });
  check('내 파트 우선 선택', () => preferredPart(songs[0], 'alto') === 'alto');
  check('없는 내 파트는 FULL 선택', () => preferredPart(songs[0], 'bass') === 'full');
  check('번호 파트와 성부 이름 상호 대응', () => {
    const songWithNumbers = { videos: { part1: validVideo, part2: validVideo } };
    return preferredPart(songWithNumbers, 'soprano') === 'part1' && preferredPart(songWithNumbers, 'alto') === 'part2';
  });
  check('번호 파트 검색 및 필터링', () => {
    const testList = [{ id: 'test1', title: '테스트곡', videos: { part1: validVideo } }];
    return filterSongs(testList, { part: 'part1' }).length === 1 && filterSongs(testList, { query: '1번 파트' }).length === 1;
  });
  check('미디어 없는 곡은 null', () => preferredPart({ videos: {} }, 'alto') === null);
  check('한글 검색', () => filterSongs(songs, { query: ' 밤양 ' }).length === 1);
  check('영문 대소문자 검색', () => filterSongs(songs, { query: 'bibi' }).length === 1);
  check('메모 검색', () => filterSongs(songs, { query: '화음' }).length === 1);
  check('태그 검색', () => filterSongs(songs, { query: 'SWEET' }).length === 1);
  check('파트 이름 검색', () => filterSongs(songs, { query: 'ALTO' }).length === 1);
  check('검색 결과 없음', () => filterSongs(songs, { query: '존재하지않음' }).length === 0);
  check('빈 검색어 전체 복원', () => filterSongs(songs, { query: '  ' }).length === 2);
  check('모든 필터 동시 적용', () => filterSongs(songs, { query: '밤양갱 alto', status: 'practice', category: 'K-POP', difficulty: '2', part: 'alto' }).length === 1);
  check('즐겨찾기 필터', () => filterSongs(songs, { status: 'favorite', favorites: ['jazz'] })[0]?.id === 'jazz');
  check('필터의 충돌은 결과 없음', () => filterSongs(songs, { category: 'JAZZ', part: 'alto' }).length === 0);

  check('A4 기준음 주파수 440Hz', () => getNoteFrequency(9, 4) === 440.0);
  check('C4 가온도 주파수 261.63Hz', () => Math.abs(getNoteFrequency(0, 4) - 261.63) < 0.1);
  check('C3 저음 옥타브 주파수 절반', () => Math.abs(getNoteFrequency(0, 3) - 130.81) < 0.1);
  check('C5 고음 옥타브 주파수 2배', () => Math.abs(getNoteFrequency(0, 5) - 523.25) < 0.1);
  check('피치파이프 반음 12개 음계', () => NOTES.length === 12);

  const samplePerfs = [
    { id: 'p1', setlist: [{ songId: 'night' }] },
    { id: 'p2', setlist: [{ songId: 'butterfly' }] }
  ];
  const sampleRehs = [
    { id: 'r1', songId: 'night' },
    { id: 'r2', songId: 'butterfly' }
  ];
  check('곡별 공연 영상 필터링', () => getPerformancesForSong(samplePerfs, 'night').length === 1 && getPerformancesForSong(samplePerfs, 'night')[0].id === 'p1');
  check('곡별 연습 일지 필터링', () => getRehearsalsForSong(sampleRehs, 'butterfly').length === 1 && getRehearsalsForSong(sampleRehs, 'butterfly')[0].id === 'r2');

  const fb = addFeedback({
    rehearsalId: 'test-reh',
    songId: 'night',
    author: '테스트단원',
    part: 'alto',
    time: 75,
    content: '화음 밸런스 점검'
  });
  check('팀원 피드백 등록 및 필드 확인', () => fb && fb.author === '테스트단원' && fb.time === 75 && fb.part === 'alto');
  check('등록된 피드백 전체 조회', () => getAllFeedbacks('test-reh').some(item => item.id === fb.id));
  const liked = toggleFeedbackLike(fb.id);
  check('피드백 공감 토글', () => liked === true && getAllFeedbacks('test-reh').find(item => item.id === fb.id)?.likes === 1);

  const sampleScores = [
    { id: 'sc-1', songId: 'bohemian-rhapsody-5', title: '보헤미안 총보' },
    { id: 'sc-2', songId: 'butterfly', title: '버터플라이 총보' }
  ];
  check('곡별 악보 목록 필터링', () => getScoresForSong(sampleScores, 'bohemian-rhapsody-5').length === 1 && getScoresForSong(sampleScores, 'butterfly')[0].title === '버터플라이 총보');
  check('없는 곡 악보 조회 시 빈 배열 반환', () => getScoresForSong(sampleScores, 'unknown').length === 0);

  const memLikeRes = toggleMemoryLike('test-mem-1');
  check('기록 공감 토글 및 카운트 증가', () => memLikeRes.isLiked === true && memLikeRes.count === 1);
  const memUnlikeRes = toggleMemoryLike('test-mem-1');
  check('기록 공감 취소 및 카운트 복원', () => memUnlikeRes.isLiked === false && memUnlikeRes.count === 0);

  const eduItem = addCustomEducation({ id: 'test-edu-1', title: '초등 아카펠라 발성 워크숍', format: 'ppt' });
  check('교육 자료 추가 기능', () => eduItem.id === 'test-edu-1' && eduItem.format === 'ppt');
  deleteCustomEducation('test-edu-1');
  check('교육 자료 삭제 기능', () => !storage.read('custom_education', []).some(e => e.id === 'test-edu-1'));

  const pVid = addCustomPracticeVideo({ id: 'test-pvid-1', title: '단발머리 파트 연습', part: '소프라노', sourceType: 'youtube' });
  check('연습 영상 추가 기능', () => pVid.id === 'test-pvid-1' && pVid.part === '소프라노' && pVid.sourceType === 'youtube');
  deleteCustomPracticeVideo('test-pvid-1');
  check('연습 영상 삭제 기능', () => !storage.read('custom_practice_videos', []).some(v => v.id === 'test-pvid-1'));

  const apprecItem = addCustomAppreciation({ id: 'test-apprec-1', title: 'Daft Punk Medley', artist: 'Pentatonix' });
  check('아카펠라 감상 영상 추가 기능', () => apprecItem.id === 'test-apprec-1' && apprecItem.artist === 'Pentatonix');
  deleteCustomAppreciation('test-apprec-1');
  check('아카펠라 감상 영상 삭제 기능', () => !storage.read('custom_appreciation', []).some(a => a.id === 'test-apprec-1'));

  const fbFallback = addFeedback({
    rehearsalId: 'test-reh',
    author: '   ',
    time: -10,
    content: '피드백 내용'
  });
  check('피드백 작성자 공백 시 익명의 단원 fallback 및 음수 시간 보정', () => fbFallback.author === '익명의 단원' && fbFallback.time === 0);
  check('빈 피드백 내용은 등록 거부', () => addFeedback({ rehearsalId: 'test-reh', content: '   ' }) === null);

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const fakeValues = new Map();
    let blocked = false;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem(key) { if (blocked) throw new Error('blocked'); return fakeValues.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw new Error('quota'); fakeValues.set(key, value); },
        removeItem(key) { if (blocked) throw new Error('blocked'); fakeValues.delete(key); },
      },
    });
    check('저장 namespace 및 값 복원', () => storage.write('test:core', { n: 1 }) && fakeValues.has('acaroom:v1:test:core') && storage.read('test:core').n === 1);
    fakeValues.set('acaroom:v1:test:corrupt', '{invalid');
    check('손상된 저장값 fallback', () => storage.read('test:corrupt', 'fallback') === 'fallback');
    blocked = true;
    check('차단된 저장소 가용성', () => !storage.isAvailable());
    check('quota 오류시 세션 메모리 유지', () => !storage.write('test:core', { n: 2 }) && storage.read('test:core').n === 2);
    storage.remove('test:core');
    blocked = false;
    check('차단 중 삭제한 값은 다시 나타나지 않음', () => storage.read('test:core', 'deleted') === 'deleted');
    storage.remove('test:core');
    storage.remove('test:corrupt');
  } catch (error) {
    results.push({ name: '저장소 오류 시뮬레이션', passed: false, error: error.message });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }

  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    const player = createPlayer(container, validVideo, '<script>안전한 영상명</script>');
    check('클릭 전 iframe 없음', () => container.querySelector('iframe') === null);
    check('외부 링크 fallback 항상 제공', () => container.querySelector('a')?.rel === 'noopener noreferrer');
    container.querySelector('button').click();
    check('클릭 후 iframe 한 개', () => container.querySelectorAll('iframe').length === 1);
    check('iframe에 안전한 텍스트 title', () => container.querySelector('iframe').title === '<script>안전한 영상명</script>');
    player.restart();
    check('다시 보기 시 iframe 중복 없음', () => container.querySelectorAll('iframe').length === 1);
    check('플레이어 컨트롤러 인터페이스 제공', () => typeof player.seekRelative === 'function' && typeof player.setRate === 'function' && typeof player.togglePlay === 'function');
    player.destroy();
    check('destroy 시 플레이어 제거', () => container.childElementCount === 0);
  }
  return { passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results };
}
