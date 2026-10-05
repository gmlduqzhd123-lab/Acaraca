import { parseYouTube, createPlayer } from '../js/player.js';
import { validateData, availableParts, preferredPart, PARTS } from '../js/data.js';
import { filterSongs } from '../js/search.js';
import * as storage from '../js/storage.js';
import { getNoteFrequency, NOTES, parseNoteString } from '../js/pitch.js';
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

let nodeFs = null;
if (typeof process !== 'undefined' && process.versions?.node) {
  try {
    const fsMod = await import('node:fs');
    nodeFs = fsMod.default || fsMod;
  } catch (e) {}
}

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
  check('음정 문자열 파싱 Ab4', () => {
    const p = parseNoteString('Ab4');
    return p && p.semitone === 8 && p.octave === 4 && p.displayNote === 'A♭4' && p.koreanNote === '라♭4';
  });
  check('음정 문자열 파싱 F#3', () => {
    const p = parseNoteString('F#3');
    return p && p.semitone === 6 && p.octave === 3 && p.displayNote === 'F♯3' && p.koreanNote === '파♯3';
  });
  check('음정 문자열 파싱 Eb5', () => {
    const p = parseNoteString('Eb5');
    return p && p.semitone === 3 && p.octave === 5 && p.displayNote === 'E♭5';
  });
  check('음정 문자열 파싱 유니코드 플랫/샵 호환', () => {
    const p1 = parseNoteString('B♭2');
    const p2 = parseNoteString('C♯5');
    return p1?.semitone === 10 && p1?.octave === 2 && p2?.semitone === 1 && p2?.octave === 5;
  });
  check('곡 데이터 startingPitches 및 musicalKey 보존', () => {
    const result = validateData({
      songs: [{
        ...songs[0],
        startingPitches: { part1: 'Ab4', soprano: 'Ab4', alto: 'F4' },
        musicalKey: 'Bb Major'
      }]
    }, { warn: false });
    return result.songs[0].startingPitches?.part1 === 'Ab4' && result.songs[0].musicalKey === 'Bb Major';
  });

  const samplePerfs = [
    { id: 'p1', setlist: [{ songId: 'night' }] },
    { id: 'p2', setlist: [{ songId: 'butterfly' }] }
  ];
  const sampleRehs = [
    { id: 'r1', songId: 'night' },
    { id: 'r2', songId: 'butterfly' }
  ];
  check('곡별 아카라카 영상 필터링', () => getPerformancesForSong(samplePerfs, 'night').length === 1 && getPerformancesForSong(samplePerfs, 'night')[0].id === 'p1');
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

  if (nodeFs) {
    const scoresRaw = JSON.parse(nodeFs.readFileSync('./data/scores.json', 'utf8'));
    check('scores.json 스키마 및 19개 구글 드라이브 악보 로드 검증', () => Array.isArray(scoresRaw.scores) && scoresRaw.scores.length === 19);
    check('구글 드라이브 폴더 링크 포함 검증', () => typeof scoresRaw.driveFolderUrl === 'string' && scoresRaw.driveFolderUrl.includes('1kHXtiDydo0XYbAP9MMgtrWLXQMi9Nzcb'));
    check('모든 악보 로컬 NWC 파일 및 드라이브 링크 존재 검증', () => scoresRaw.scores.every(s => s.fileUrl && s.driveUrl && nodeFs.existsSync(s.fileUrl)));
    check('아카라카 공식 직인 이미지 파일 존재 검증', () => nodeFs.existsSync('./assets/images/acaraca-seal.png'));

    const apprecRaw = JSON.parse(nodeFs.readFileSync('./data/appreciation.json', 'utf8'));
    check('appreciation.json 133개 감상 영상 로드 검증', () => Array.isArray(apprecRaw.videos) && apprecRaw.videos.length === 133);
    check('연습실 33곡 원곡 아카펠라 감상 영상 및 연습곡 카테고리 검증', () => apprecRaw.videos.filter(v => v.category === '연습곡').length === 33);
    check('모든 감상 영상 YouTube 파싱 유효성 검증', () => apprecRaw.videos.every(v => parseYouTube({ type: 'video', url: v.videoUrl }).ok && Boolean(v.thumbnail)));
    check('요청된 핵심 그룹(메이트리, 엑시트, 펜타토닉스, 나린, 비트펠라 하우스) 전체 포함 검증', () => {
      const artists = apprecRaw.videos.map(v => v.artist);
      return ['메이트리', '엑시트', '펜타토닉스', '나린', '비트펠라 하우스'].every(g => artists.some(a => a.includes(g)));
    });
    check('33개 연습곡 감상 영상 국내외 프로 아카펠라 그룹 영상 검증', () => {
      const practiceVideos = apprecRaw.videos.filter(v => v.category === '연습곡');
      return practiceVideos.length === 33 && practiceVideos.every(v => {
        const isNotGuide = !v.title.includes('위주') && !v.title.includes('파트)') && !v.uploader.includes('엽쌤');
        return isNotGuide && v.videoUrl.startsWith('https://www.youtube.com/watch?v=');
      });
    });

    const eduRaw = JSON.parse(nodeFs.readFileSync('./data/education.json', 'utf8'));
    check('education.json 41개 전문 교육 자료 로드 검증 (교재 11개 + 교육 영상 30개)', () => Array.isArray(eduRaw.resources) && eduRaw.resources.length === 41 && eduRaw.resources.filter(r => r.format === 'video').length === 30);
    check('모든 로컬 교육 자료 파일 존재 및 영상 리소스 유효성 검증', () => eduRaw.resources.every(r => (r.format === 'video' || r.fileUrl.startsWith('http')) ? (r.videoUrl && r.thumbnail) : nodeFs.existsSync(r.fileUrl)));

    check('네비게이션 12개 탭 아이콘 이미지 파일 실제 존재 검증', () => ['home', 'songs', 'appreciation', 'stage', 'scores', 'memories', 'rehearsal', 'practiceVideos', 'education', 'favorites', 'recent', 'settings'].every(t => nodeFs.existsSync(`./assets/icons/nav/${t}.png`)));
    check('모바일 하단 네비게이션 12개 전체 탭 연동 검증', () => nodeFs.readFileSync('./js/app.js', 'utf8').includes('const mobileTabs = Object.keys(labels);'));
    check('아카라카 영상 탭 레이블 반영 검증', () => nodeFs.readFileSync('./js/app.js', 'utf8').includes("stage: '아카라카 영상'"));
    check('PARTS 객체 최상단에 1번~7번 파트 순서 배치 검증', () => Object.keys(PARTS).slice(0, 7).join() === 'part1,part2,part3,part4,part5,part6,part7');
    check('Pretendard 웹폰트 링크 삽입 검증', () => nodeFs.readFileSync('./index.html', 'utf8').includes('pretendardvariable.min.css') && nodeFs.readFileSync('./admin.html', 'utf8').includes('pretendardvariable.min.css'));
    check('체크리스트 및 집중 연습 타이머 제거 검증', () => !nodeFs.readFileSync('./js/app.js', 'utf8').includes('오늘의 연습 체크') && !nodeFs.readFileSync('./js/app.js', 'utf8').includes('10분 집중 연습'));
    check('신규 브랜드 로고 파일 실제 존재 검증', () => nodeFs.existsSync('./assets/icons/logo.png') && nodeFs.existsSync('./assets/icons/logo.svg'));
    check('33곡 모든 연습곡의 첫 음(startingPitches) 유효성 및 주파수 산출 검증', () => {
      const songsRaw = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs;
      return songsRaw.length === 33 && songsRaw.every(song => {
        if (!song.startingPitches || typeof song.startingPitches !== 'object') return false;
        return Object.values(song.startingPitches).every(noteStr => {
          if (!noteStr) return true;
          const parsed = parseNoteString(noteStr);
          return parsed && typeof parsed.freq === 'number' && parsed.freq > 0;
        });
      });
    });
    check('CSS 파일 중괄호(Brace) 밸런스 완전성 검증', () => {
      const css = nodeFs.readFileSync('./css/style.css', 'utf8');
      let count = 0;
      for (const ch of css) {
        if (ch === '{') count++;
        else if (ch === '}') count--;
        if (count < 0) return false;
      }
      return count === 0;
    });
  }

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




  // Test recent practice storage, item removal, and full clearing
  storage.write('recent', [{ songId: 'bohemian-rhapsody', part: 'part3', timestamp: 123456 }, { songId: 'aloha', part: 'part4', timestamp: 123457 }]);
  let recents = storage.read('recent', []);
  check('최근 연습 데이터 기록 검증', () => recents.length === 2 && recents[0].songId === 'bohemian-rhapsody');
  recents = recents.filter(r => !(r.songId === 'bohemian-rhapsody' && r.part === 'part3'));
  storage.write('recent', recents);
  check('최근 연습 개별 항목 삭제 검증', () => storage.read('recent', []).length === 1 && storage.read('recent', [])[0].songId === 'aloha');
  storage.remove('recent');
  check('최근 연습 전체 비우기 검증', () => storage.read('recent', []).length === 0);
  check('최근 연습 비우기 UI 함수 구현 검증', () => nodeFs.readFileSync('./js/app.js', 'utf8').includes('clearRecentPractice') && nodeFs.readFileSync('./js/app.js', 'utf8').includes('confirmClearRecent'));

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

    const container2 = document.createElement('div');
    const player2 = createPlayer(container2, validVideo, 'seek test');
    player2.seekTo(36);
    check('seekTo(36) 첫 클릭 시 즉시 iframe 마운트 및 start=36 파라미터 적용', () => {
      const iframeEl = container2.querySelector('iframe');
      return iframeEl && iframeEl.src.includes('start=36');
    });
    player2.destroy();
  }



  return { passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results };
}
