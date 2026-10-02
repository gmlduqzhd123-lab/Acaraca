import { parseYouTube, createPlayer } from '../js/player.js';
import { validateData, availableParts, preferredPart } from '../js/data.js';
import { filterSongs } from '../js/search.js';
import * as storage from '../js/storage.js';

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
    player.destroy();
    check('destroy 시 플레이어 제거', () => container.childElementCount === 0);
  }
  return { passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results };
}
