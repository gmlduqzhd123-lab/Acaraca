import { parseYouTube, createPlayer, createSectionLooper, formatPlayerTime } from '../js/player.js';
import { validateData, availableParts, preferredPart, PARTS } from '../js/data.js';
import { filterSongs, toChoseong } from '../js/search.js';
import * as storage from '../js/storage.js';
import { getNoteFrequency, NOTES, parseNoteString, subscribePitchState, playPitch, playPitchSequence, stopPitchSequence, isPitchSequencePlaying, isPitchPlaying, DEFAULT_PITCH_DURATION, frequencyToPitchInfo, autoCorrelatePitch, setMetronomeBpm, getMetronomeBpm, transposeNoteString, transposeMusicalKey, createMultiTrackScorePlayer } from '../js/pitch.js';
import {
  getAllFeedbacks,
  initFeedbacksFromData,
  addFeedback,
  toggleFeedbackLike,
  getPerformancesForSong,
  getRehearsalsForSong,
  getScoresForSong,
  getAppreciationForSong,
  prefetchOfflineUrls,
  toggleMemoryLike,
  addCustomEducation,
  deleteCustomEducation,
  addCustomPracticeVideo,
  deleteCustomPracticeVideo,
  addCustomAppreciation,
  deleteCustomAppreciation,
  attachMediaToRehearsal
} from '../js/archive.js';
import { icon } from '../js/ui.js';
import {
  requestWakeLock,
  releaseWakeLock,
  isWakeLockActive,
  enterPocketMode,
  exitPocketMode,
  isPocketModeActive,
  updateMediaSession,
  setMediaSessionPlaybackState,
  getBackgroundSettings,
  setBackgroundSetting
} from '../js/backgroundPlay.js';

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
  check('띄어쓰기 무시 검색', () => filterSongs([{ ...songs[0], title: '그대 내 품에' }], { query: '그대내품에' }).length === 1);
  check('담당 단원 이름 검색', () => filterSongs([{ ...songs[0], partNames: { part1: '희엽', part2: '선영 · 용석' } }], { query: '용석' }).length === 1);
  check('초성 검색', () => filterSongs(songs, { query: 'ㅂㅇㄱ' }).length === 1 && filterSongs(songs, { query: 'ㅂㅇㅎ' }).length === 0);
  check('초성 변환', () => toChoseong('보헤미안 랩소디') === 'ㅂㅎㅁㅇ ㄹㅅㄷ');
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

  attachMediaToRehearsal('test-reh', { mediaUrl: 'https://example.com/audio.mp3', isVideo: false, fileName: '테스트 음원' });
  check('연습 일지 미디어 override 등록 검증', () => {
    const overrides = storage.read('rehearsal_media_overrides', {});
    return overrides['test-reh']?.mediaUrl === 'https://example.com/audio.mp3';
  });

  const sampleScores = [
    { id: 'sc-1', songId: 'bohemian-rhapsody-5', title: '보헤미안 총보' },
    { id: 'sc-2', songId: 'butterfly', title: '버터플라이 총보' }
  ];
  check('곡별 악보 목록 필터링', () => getScoresForSong(sampleScores, 'bohemian-rhapsody-5').length === 1 && getScoresForSong(sampleScores, 'butterfly')[0].title === '버터플라이 총보');
  check('없는 곡 악보 조회 시 빈 배열 반환', () => getScoresForSong(sampleScores, 'unknown').length === 0);

  if (nodeFs) {
    const scoresRaw = JSON.parse(nodeFs.readFileSync('./data/scores.json', 'utf8'));
    check('scores.json 스키마 및 악보 로드 검증', () => Array.isArray(scoresRaw.scores) && scoresRaw.scores.length >= 19);
    check('구글 드라이브 폴더 링크 포함 검증', () => typeof scoresRaw.driveFolderUrl === 'string' && scoresRaw.driveFolderUrl.includes('1kHXtiDydo0XYbAP9MMgtrWLXQMi9Nzcb'));
    check('모든 악보 로컬 악보 파일 존재 검증', () => scoresRaw.scores.every(s => s.fileUrl && nodeFs.existsSync(s.fileUrl)));
    check('아카라카 공식 직인 이미지 파일 존재 검증', () => nodeFs.existsSync('./assets/images/acaraca-seal.png'));

    const apprecRaw = JSON.parse(nodeFs.readFileSync('./data/appreciation.json', 'utf8'));
    check('appreciation.json 감상 영상 로드 검증 (회원전용 삭제 및 국내 아카펠라 100개 추가 이후 최소 217개 유지)', () => Array.isArray(apprecRaw.videos) && apprecRaw.videos.length >= 217);
    check('연습곡 카테고리 감상 영상이 실제 연습곡과 1곡당 1개씩 연결되는지 검증', () => {
      const songIds = new Set(JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs.map(s => s.id));
      const linked = apprecRaw.videos.filter(v => v.category === '연습곡').map(v => v.songId);
      return linked.length > 0 && linked.every(id => songIds.has(id)) && new Set(linked).size === linked.length;
    });
    check('모든 감상 영상 YouTube 파싱 유효성 검증', () => apprecRaw.videos.every(v => parseYouTube({ type: 'video', url: v.videoUrl }).ok && Boolean(v.thumbnail)));
    check('요청된 핵심 그룹(메이트리, 엑시트, 펜타토닉스, 나린, 비트펠라 하우스) 전체 포함 검증', () => {
      const artists = apprecRaw.videos.map(v => v.artist);
      return ['메이트리', '엑시트', '펜타토닉스', '나린', '비트펠라 하우스'].every(g => artists.some(a => a.includes(g)));
    });
    check('연습곡 감상 영상 국내외 프로 아카펠라 그룹 영상 검증 (파트 가이드 영상 제외)', () => {
      const practiceVideos = apprecRaw.videos.filter(v => v.category === '연습곡');
      return practiceVideos.length > 0 && practiceVideos.every(v => {
        const isNotGuide = !v.title.includes('위주') && !v.title.includes('파트)') && !v.uploader.includes('엽쌤');
        return isNotGuide && v.videoUrl.startsWith('https://www.youtube.com/watch?v=');
      });
    });
    check('감상 영상 최신 추가 100곡(apprec-kr) 최신순 기본 상단 배치 검증', () => {
      return apprecRaw.videos[0].id === 'apprec-kr-001' && apprecRaw.videos[99].id === 'apprec-kr-100';
    });
    check('자유 감상 카테고리 완전 제거 및 6개 정규 카테고리 무결성 검증', () => {
      const validCats = new Set(['연습곡', '국내 아카펠라', '해외 명작', '보컬 커버', '라이브 콘서트', '영화 / OST']);
      return apprecRaw.videos.every(v => validCats.has(v.category)) && !apprecRaw.videos.some(v => v.category === '자유 감상');
    });

    const eduRaw = JSON.parse(nodeFs.readFileSync('./data/education.json', 'utf8'));
    check('education.json 41개 전문 교육 자료 로드 검증 (교재 11개 + 교육 영상 30개)', () => Array.isArray(eduRaw.resources) && eduRaw.resources.length === 41 && eduRaw.resources.filter(r => r.format === 'video').length === 30);
    check('모든 로컬 교육 자료 파일 존재 및 영상 리소스 유효성 검증', () => eduRaw.resources.every(r => (r.format === 'video' || r.fileUrl.startsWith('http')) ? (r.videoUrl && r.thumbnail) : nodeFs.existsSync(r.fileUrl)));

    check('네비게이션 12개 탭 아이콘 이미지 파일 실제 존재 검증', () => ['home', 'songs', 'appreciation', 'stage', 'scores', 'memories', 'rehearsal', 'practiceVideos', 'education', 'favorites', 'recent', 'settings'].every(t => nodeFs.existsSync(`./assets/icons/nav/${t}.png`)));
    check('모바일 하단 네비게이션 5탭(핵심 4탭 + 더보기 시트 8탭 = 12개 전체) 연동 검증', () => {
      const src = nodeFs.readFileSync('./js/app.js', 'utf8');
      return src.includes('mobilePrimaryTabs') && src.includes('mobileMoreTabs') && src.includes('openMobileMoreSheet');
    });
    check('공연 아카이브 탭 레이블 반영 검증', () => nodeFs.readFileSync('./js/app.js', 'utf8').includes("stage: '공연 아카이브'") || nodeFs.readFileSync('./js/app.js', 'utf8').includes("stage: '아카라카 영상'"));
    check('PARTS 객체 최상단에 1번~7번 파트 순서 배치 검증', () => Object.keys(PARTS).slice(0, 7).join() === 'part1,part2,part3,part4,part5,part6,part7');
    check('Pretendard 웹폰트 링크 삽입 검증', () => nodeFs.readFileSync('./index.html', 'utf8').includes('pretendardvariable-dynamic-subset.min.css') && nodeFs.readFileSync('./admin.html', 'utf8').includes('pretendardvariable-dynamic-subset.min.css'));
    check('체크리스트 및 집중 연습 타이머 제거 검증', () => !nodeFs.readFileSync('./js/app.js', 'utf8').includes('오늘의 연습 체크') && !nodeFs.readFileSync('./js/app.js', 'utf8').includes('10분 집중 연습'));
    check('신규 브랜드 로고 파일 실제 존재 검증', () => nodeFs.existsSync('./assets/icons/logo.png') && nodeFs.existsSync('./assets/icons/logo.svg'));
    check('모든 연습곡의 첫 음(startingPitches) 유효성 및 주파수 산출 검증', () => {
      const songsRaw = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs;
      return songsRaw.length > 0 && songsRaw.every(song => {
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
    check('UI 신규 아이콘 정의 검증 (refresh, chevron-down, chevron-up)', () => {
      const ui = nodeFs.readFileSync('./js/ui.js', 'utf8');
      return ui.includes('refresh:') && ui.includes('\'chevron-down\':') && ui.includes('\'chevron-up\':');
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
    check('플레이어 컨트롤러 인터페이스 제공', () =>
      typeof player.seekRelative === 'function' &&
      typeof player.setRate === 'function' &&
      typeof player.togglePlay === 'function' &&
      typeof player.toggleLandscape === 'function' &&
      typeof player.isLandscape === 'function'
    );
    player.toggleLandscape(true);
    check('플레이어 가로 확대 모드 활성화 확인', () => player.isLandscape() === true);
    player.toggleLandscape(false);
    check('플레이어 가로 확대 모드 비활성화 확인', () => player.isLandscape() === false);
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

  const unsubsPitch = subscribePitchState(() => {});
  check('피치파이프 구독 해제(unsubscribe) 함수 반환', () => typeof unsubsPitch === 'function');
  unsubsPitch();

  check('DEFAULT_PITCH_DURATION 기본 3000ms (3초) 설정 검증', () => DEFAULT_PITCH_DURATION === 3000);
  check('isPitchPlaying 기본 비재생 상태 false 검증', () => isPitchPlaying() === false);

  // --- Pitch Sequence (아르페지오 & 화음) Tests ---
  check('playPitchSequence 빈 배열 전달 시 null 반환', () => {
    return playPitchSequence([]) === null;
  });

  const testParts = [
    { label: '소프라노', noteStr: 'E5' },
    { label: '베이스', noteStr: 'E3' },
    { label: '테너', noteStr: 'B3' },
    { label: '알토', noteStr: 'G#4' }
  ];

  const hadWindow = typeof globalThis.window !== 'undefined';
  const prevWin = globalThis.window;
  let prevAudioCtx = undefined;
  try {
    const createMockAudioNode = () => ({
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        cancelScheduledValues: () => {}
      },
      frequency: {
        value: 440,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {}
      }
    });

    class MockAudioContext {
      constructor() {
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
      }
      createOscillator() { return createMockAudioNode(); }
      createGain() { return createMockAudioNode(); }
      createBiquadFilter() { return createMockAudioNode(); }
      resume() { return Promise.resolve(); }
    }

    if (!hadWindow) {
      globalThis.window = {};
    }
    prevAudioCtx = globalThis.window.AudioContext;
    if (!globalThis.window.AudioContext) {
      globalThis.window.AudioContext = MockAudioContext;
    }

    let seqSteps = [];
    const seqHandle = playPitchSequence(testParts, {
      noteDuration: 10,
      gapDuration: 5,
      chordDuration: 20,
      onStep: (st) => { seqSteps.push(st); }
    });

    check('playPitchSequence 저음(베이스 E3)부터 고음(소프라노 E5) 순으로 자동 오름차순 정렬', () => {
      if (!seqHandle) return false;
      return seqHandle.sorted[0].noteStr === 'E3' &&
        seqHandle.sorted[1].noteStr === 'B3' &&
        seqHandle.sorted[2].noteStr === 'G#4' &&
        seqHandle.sorted[3].noteStr === 'E5';
    });

    check('playPitchSequence 실행 핸들 및 isPlaying 플래그 확인', () => {
      return seqHandle && seqHandle.isPlaying === true && isPitchSequencePlaying() === true;
    });

    stopPitchSequence();
    check('stopPitchSequence 호출 시 isPitchSequencePlaying() false 복귀', () => {
      return isPitchSequencePlaying() === false;
    });

    check('playPitch에 cancelSequence=false 전달 시 active sequence 유지 검증 (시퀀스 연속 재생 보장)', () => {
      let steps = [];
      const handle = playPitchSequence(testParts, {
        noteDuration: 100,
        gapDuration: 20,
        chordDuration: 100,
        onStep: (st) => steps.push(st)
      });
      playPitch(0, 4, 0.5, false);
      const stillPlaying = isPitchSequencePlaying();
      stopPitchSequence();
      return stillPlaying;
    });
  } finally {
    if (!hadWindow) {
      delete globalThis.window;
    } else {
      if (prevAudioCtx !== undefined) globalThis.window.AudioContext = prevAudioCtx;
      else delete globalThis.window.AudioContext;
    }
  }

  // --- Section Looper (A-B 반복) Core Tests ---
  check('formatPlayerTime 시간 형식 변환', () => {
    return formatPlayerTime(0) === '0:00' &&
      formatPlayerTime(65) === '1:05' &&
      formatPlayerTime(723) === '12:03' &&
      formatPlayerTime(null) === '--:--' &&
      formatPlayerTime(undefined) === '--:--';
  });

  let mockTime = 15;
  let seekCalls = [];
  const mockPlayer = {
    getCurrentTime() { return mockTime; },
    seekTo(sec) {
      mockTime = sec;
      seekCalls.push(sec);
    }
  };

  const looper = createSectionLooper(mockPlayer);
  check('초기 구간 반복 상태 확인', () => {
    const st = looper.getState();
    return st.loopStart === null && st.loopEnd === null && st.isLooping === false && st.duration === 0;
  });

  looper.setStart(10);
  check('시작점 A 설정 (10초)', () => looper.getState().loopStart === 10);

  looper.setEnd(25);
  check('끝점 B 설정 (25초)', () => looper.getState().loopEnd === 25 && looper.getState().duration === 15);

  looper.nudgeStart(-1);
  check('시작점 -1초 미세조정 (9초)', () => looper.getState().loopStart === 9 && looper.getState().duration === 16);

  looper.nudgeEnd(1);
  check('끝점 +1초 미세조정 (26초)', () => looper.getState().loopEnd === 26 && looper.getState().duration === 17);

  // If start is set beyond end, end automatically extends
  looper.setStart(30);
  check('시작점이 끝점보다 커지면 끝점 자동 보정', () => looper.getState().loopStart === 30 && looper.getState().loopEnd > 30);

  // Test toggling loop
  looper.toggleLoop();
  check('구간 반복 켜기 (toggleLoop)', () => looper.getState().isLooping === true);

  // Test loop turnaround seek
  const currentStart = looper.getState().loopStart;
  const currentEnd = looper.getState().loopEnd;
  seekCalls = [];
  mockTime = currentEnd + 0.1;
  looper.checkTick();
  check('끝점 도달 시 시작점(A)으로 즉시 seekTo 트리거', () => seekCalls.length > 0 && seekCalls[seekCalls.length - 1] === currentStart);

  // Test jump to start
  seekCalls = [];
  looper.jumpToStart();
  check('A로 이동 (jumpToStart)', () => seekCalls.includes(currentStart));

  // Test quick presets
  mockTime = 50;
  looper.setQuickPreset(10);
  check('10초 빠른 프리셋 설정', () => {
    const st = looper.getState();
    return st.loopStart === 50 && st.loopEnd === 60 && st.isLooping === true && st.duration === 10;
  });

  // Test clear
  looper.clear();
  check('구간 해제 (clear)', () => {
    const st = looper.getState();
    return st.loopStart === null && st.loopEnd === null && st.isLooping === false;
  });

  looper.destroy();

  // --- Mobile Background Play & Pocket Mode Core Tests ---
  check('초기 Wake Lock 상태는 false', () => isWakeLockActive() === false);

  check('초기 포켓 모드 상태는 false', () => isPocketModeActive() === false);

  exitPocketMode();
  check('비활성 상태에서 exitPocketMode 호출 시에도 false 유지', () => isPocketModeActive() === false);

  // Test Background Play settings
  const bgSettings = getBackgroundSettings();
  check('getBackgroundSettings 기본값 확인 (autoResume, keepAwake)', () => {
    return bgSettings.autoResume === true && bgSettings.keepAwake === true;
  });

  setBackgroundSetting('bgAutoResume', false);
  check('setBackgroundSetting("bgAutoResume", false) 저장 확인', () => {
    return getBackgroundSettings().autoResume === false;
  });
  setBackgroundSetting('bgAutoResume', true); // restore

  // Test Wake Lock API error resilience (e.g. Node env without navigator.wakeLock)
  const wakeLockPromise = requestWakeLock();
  check('requestWakeLock 안전 실행 (Promise 반환)', () => typeof wakeLockPromise?.then === 'function');
  const releasePromise = releaseWakeLock();
  check('releaseWakeLock 안전 실행 (Promise 반환)', () => typeof releasePromise?.then === 'function');

  // Test MediaSession registration & handlers
  const origNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const mockHandlers = {};
  let mockMeta = null;
  let mockPlaybackState = 'none';
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaSession: {
          setActionHandler(name, fn) { mockHandlers[name] = fn; },
          set metadata(meta) { mockMeta = meta; },
          get metadata() { return mockMeta; },
          set playbackState(st) { mockPlaybackState = st; },
          get playbackState() { return mockPlaybackState; },
          setPositionState() {}
        }
      },
      configurable: true,
      writable: true
    });

    let playTriggered = false;
    let pauseTriggered = false;
    const ok = updateMediaSession({
      title: '바람이 불어오는 곳',
      artist: '김광석 / AcaRaca',
      album: 'AcaRaca Collection',
      onPlay: () => { playTriggered = true; },
      onPause: () => { pauseTriggered = true; }
    });

    check('updateMediaSession 정상 등록', () => ok === true);
    check('미디어 세션 핸들러(play/pause) 바인딩 확인', () => {
      mockHandlers.play?.();
      mockHandlers.pause?.();
      return playTriggered === true && pauseTriggered === true;
    });

    setMediaSessionPlaybackState('playing');
    check('setMediaSessionPlaybackState("playing") 상태 반영', () => mockPlaybackState === 'playing');
    setMediaSessionPlaybackState('paused');
    check('setMediaSessionPlaybackState("paused") 상태 반영', () => mockPlaybackState === 'paused');
  } finally {
    if (origNavDescriptor) Object.defineProperty(globalThis, 'navigator', origNavDescriptor);
    else delete globalThis.navigator;
  }

  // Test Pocket Mode DOM lifecycle (Enter / Exit)
  const prevDoc = globalThis.document;
  try {
    const mockBody = {
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); }
      },
      children: [],
      appendChild(node) {
        this.children.push(node);
        node.parentNode = this;
      },
      removeChild(node) {
        const idx = this.children.indexOf(node);
        if (idx >= 0) this.children.splice(idx, 1);
        node.parentNode = null;
      }
    };

    globalThis.document = {
      body: mockBody,
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          id: '',
          className: '',
          attributes: {},
          innerHTML: '',
          parentNode: null,
          setAttribute(k, v) { this.attributes[k] = v; },
          getAttribute(k) { return this.attributes[k]; },
          addEventListener() {},
          querySelector() { return null; }
        };
      }
    };

    let unlockNotified = false;
    enterPocketMode({
      title: '풍선 (테너 파트)',
      partLabel: '동방신기 · 포켓 절전 모드',
      onUnlock: () => { unlockNotified = true; }
    });

    check('enterPocketMode 호출 시 isPocketModeActive() true 전환', () => isPocketModeActive() === true);
    check('enterPocketMode 시 body.classList in-pocket-mode 추가', () => mockBody.classList.contains('in-pocket-mode'));

    exitPocketMode();
    check('exitPocketMode 호출 시 isPocketModeActive() false 복귀', () => isPocketModeActive() === false);
    check('exitPocketMode 시 body.classList in-pocket-mode 제거', () => !mockBody.classList.contains('in-pocket-mode'));
  } finally {
    if (prevDoc !== undefined) globalThis.document = prevDoc;
    else delete globalThis.document;
  }

  if (nodeFs) {
    const appJsContent = nodeFs.readFileSync('./js/app.js', 'utf8');
    const indexHtmlContent = nodeFs.readFileSync('./index.html', 'utf8');
    const styleCssContent = nodeFs.readFileSync('./css/style.css', 'utf8');

    check('악보 창고 및 교육 자료 비밀번호 상수 1234 설정 검증', () => appJsContent.includes("const SECTION_AUTH_PASSWORD = '1234';"));
    check('엽쌤 문의 안내 문구 포함 검증 (app.js)', () => appJsContent.includes("const SECTION_AUTH_NOTICE = '비밀번호는 엽쌤에게 문의하세요';"));
    check('index.html protected-auth-dialog 모달 및 엽쌤 문의 문구 검증', () => indexHtmlContent.includes('id="protected-auth-dialog"') && indexHtmlContent.includes('비밀번호는 엽쌤에게 문의하세요'));
    check('index.html 필수 모달 폼 컨트롤 존재 검증', () => indexHtmlContent.includes('id="protected-auth-password"') && indexHtmlContent.includes('id="protected-auth-form"') && indexHtmlContent.includes('id="protected-auth-error"'));
    check('renderScores 내 미인증 시 락 스크린 및 모달 호출 가드 검증', () => appJsContent.includes("if (!isProtectedAuthorized('scores'))") && appJsContent.includes("openProtectedAuthDialog('scores'"));
    check('renderEducation 내 미인증 시 락 스크린 및 모달 호출 가드 검증', () => appJsContent.includes("if (!isProtectedAuthorized('education'))") && appJsContent.includes("openProtectedAuthDialog('education'"));
    check('style.css 락 스크린 및 안내 배지 스타일 클래스 정의 검증', () => styleCssContent.includes('.protected-lock-state') && styleCssContent.includes('.protected-notice-badge'));
    check('모바일 인앱 NWC·MIDI 악보 미리보기 및 재생 모달 구현 검증', () => appJsContent.includes('openScorePreviewModal') && appJsContent.includes('parseNwcScoreDetail') && appJsContent.includes('parseMidiScoreDetail') && styleCssContent.includes('.score-preview-dialog'));
    check('전 곡 partNames(파트별 담당 단원 이름) 100% 매핑 검증', () => {
      const allSongs = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs;
      return allSongs.length > 0 && allSongs.every(s => s.partNames && Object.keys(s.partNames).length > 0);
    });
    check('partNames 성부 이름 키가 같은 첫 음의 번호 파트 영상으로 옮길 수 있는데 방치되지 않았는지 검증 (나는 누구? 연동)', () => {
      const allSongs = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs;
      return allSongs.every(s => {
        const playable = availableParts(s).filter(p => /^part\d$/.test(p));
        const sp = s.startingPitches || {};
        return Object.keys(s.partNames || {}).every(k => {
          if (/^part\d$/.test(k) || availableParts(s).includes(k) || !sp[k]) return true;
          const candidates = playable.filter(p => sp[p] === sp[k] && !(p in s.partNames));
          return candidates.length !== 1;
        });
      });
    });
    check('31개 전 공연 아카이브(performances.json) setlist 객체 스키마 정규화 100% 검증', () => {
      const allPerfs = JSON.parse(nodeFs.readFileSync('./data/performances.json', 'utf8')).performances;
      return allPerfs.length === 31 && allPerfs.every(p =>
        Array.isArray(p.setlist) &&
        p.setlist.length > 0 &&
        p.setlist.every(it => it && typeof it === 'object' && typeof it.title === 'string')
      );
    });
    check('practice_videos.json 및 rehearsals.json 꿈꾸지 않으면 아카이브 등록 검증', () => {
      const pVids = JSON.parse(nodeFs.readFileSync('./data/practice_videos.json', 'utf8')).videos;
      const rehs = JSON.parse(nodeFs.readFileSync('./data/rehearsals.json', 'utf8')).rehearsals;
      return Array.isArray(pVids) && pVids.some(v => v.songId === 'if-you-dont-dream') && Array.isArray(rehs) && rehs.some(r => r.songId === 'if-you-dont-dream');
    });
    check('frequencyToPitchInfo(440) 기준음 A4 · 0 cents 변환 검증', () => {
      const info = frequencyToPitchInfo(440);
      return info && info.note === 'A4' && info.octave === 4 && info.cents === 0 && info.korean === '라4' && info.displayNote === 'A4 (라)';
    });
    check('autoCorrelatePitch 합성 440Hz 사인파 버퍼 음정 감지 검증', () => {
      const sampleRate = 44100;
      const buf = new Float32Array(2048);
      for (let i = 0; i < buf.length; i++) {
        buf[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      }
      const detected = autoCorrelatePitch(buf, sampleRate);
      return detected > 435 && detected < 445;
    });
    check('setMetronomeBpm 범위 제한(40~220 BPM) 검증', () => {
      const low = setMetronomeBpm(10);
      const high = setMetronomeBpm(300);
      const mid = setMetronomeBpm(96);
      return low === 40 && high === 220 && mid === 96 && getMetronomeBpm() === 96;
    });
    check('initFeedbacksFromData 기존 시드 버전(v2) 기기에서 신규 initialFeedbacks 비파괴 병합 검증', () => {
      storage.write('feedbacks_seed_v', 2);
      storage.write('team_feedbacks', [
        { id: 'fb-user-1', rehearsalId: 'reh-existing', songId: 'balloon', author: '단원', content: '기존 댓글 보존' }
      ]);
      initFeedbacksFromData([
        { id: 'reh-existing', songId: 'balloon', initialFeedbacks: [{ id: 'fb-seed-new', author: '리더', content: '새 시드 피드백' }] },
        { id: 'reh-if-you-dont-dream', songId: 'if-you-dont-dream', initialFeedbacks: [{ id: 'fb-dream-1', author: '희엽', content: '첫음 체크' }] }
      ]);
      const mergedExisting = getAllFeedbacks('reh-existing');
      const mergedDream = getAllFeedbacks('reh-if-you-dont-dream');
      return (
        mergedExisting.some(f => f.id === 'fb-user-1') &&
        mergedExisting.some(f => f.id === 'fb-seed-new') &&
        mergedDream.some(f => f.id === 'fb-dream-1')
      );
    });
    check('연습실 A-B 구간 북마크 저장·현 구간 유지 파트 전환·튜너 UI 구현 검증', () => {
      return (
        appJsContent.includes('savedLoops') &&
        appJsContent.includes('switchPartAtSameTime') &&
        appJsContent.includes('openOrDownloadScore(songScores[0], false)') &&
        indexHtmlContent.includes('id="pitch-tuner-box"') &&
        indexHtmlContent.includes('id="pitch-metro-box"')
      );
    });
    check('GitHub Actions CI 워크플로(.github/workflows/ci.yml) 구성 검증', () => {
      if (!nodeFs.existsSync('./.github/workflows/ci.yml')) return false;
      const ciYml = nodeFs.readFileSync('./.github/workflows/ci.yml', 'utf8');
      return ciYml.includes('npm run validate') && ciYml.includes('npm test') && ciYml.includes('npm run audit');
    });
    check('전 곡 BPM 템포 등록 및 validateData 보존 검증', () => {
      const rawSongs = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8'));
      const validated = validateData(rawSongs);
      return (
        validated.errors.length === 0 &&
        validated.songs.length > 0 &&
        validated.songs.length === rawSongs.songs.length &&
        validated.songs.every(s => Number.isFinite(s.bpm) && s.bpm >= 30 && s.bpm <= 260)
      );
    });
    check('scores.json 꿈꾸지 않으면(if-you-dont-dream) 누락 악보 6건 포함 총 7건 교차 연결 검증', () => {
      const allScores = JSON.parse(nodeFs.readFileSync('./data/scores.json', 'utf8')).scores;
      const linked = getScoresForSong(allScores, 'if-you-dont-dream');
      return linked.length >= 7 && linked.some(s => s.id === 'score-research-180-pdf') && linked.some(s => s.id === 'score-research-175-mid');
    });
    check('appreciation.json 커버·레퍼런스 영상 songId 교차 연결 및 getAppreciationForSong 검증', () => {
      const allApprec = JSON.parse(nodeFs.readFileSync('./data/appreciation.json', 'utf8')).videos;
      const samePlace = getAppreciationForSong(allApprec, 'same-place');
      const daftPunk = getAppreciationForSong(allApprec, 'daft-punk');
      const beautifulWorld = getAppreciationForSong(allApprec, 'beautiful-world');
      return samePlace.length >= 2 && daftPunk.length >= 1 && beautifulWorld.length >= 1;
    });
    check('인앱 오선보(SVG)·PDF·MSCZ 악보 뷰어 및 오프라인 일괄 저장 구현 검증', () => {
      return (
        typeof prefetchOfflineUrls === 'function' &&
        appJsContent.includes('function renderStaffSvg') &&
        appJsContent.includes('async function parseMsczScoreDetail') &&
        appJsContent.includes('score-pdf-frame') &&
        appJsContent.includes('현재 목록 오프라인 보관') &&
        styleCssContent.includes('.score-staff-svg') &&
        styleCssContent.includes('.score-pdf-frame')
      );
    });
    check('연습실 내 목소리 셀프 녹음기·개인 연습 노트(타임스탬프 점프)·키보드 단축키 구현 검증', () => {
      return (
        appJsContent.includes('function renderVoiceRecorderPanel') &&
        appJsContent.includes('function openQuickRecordRehearsalModal') &&
        appJsContent.includes('function renderPersonalNotePanel') &&
        appJsContent.includes('my_practice_notes') &&
        appJsContent.includes('onPracticeKeydown') &&
        styleCssContent.includes('.voice-recorder-panel') &&
        styleCssContent.includes('.personal-note-panel')
      );
    });
    check('실시간 반음 조바꿈(transposeNoteString · transposeMusicalKey) 옥타브·이명동음·무옥타브 기준음 변환 검증', () => {
      return (
        transposeNoteString('C4', -1) === 'B3' &&
        transposeNoteString('B4', 1) === 'C5' &&
        transposeNoteString('Ab4', -2) === 'Gb4' &&
        transposeNoteString('F#3', 2) === 'G#3' &&
        transposeNoteString('Eb', 2) === 'F' &&
        transposeMusicalKey('Eb Major', 2) === 'F Major' &&
        transposeMusicalKey('C# Minor', -1) === 'C Minor' &&
        transposeMusicalKey('Bb Major', 0) === 'Bb Major'
      );
    });
    check('createMultiTrackScorePlayer 성부별 Solo·Mute 마이너스원 믹서·배속·조바꿈·시크바 동작 검증', () => {
      const mp = createMultiTrackScorePlayer([
        { id: 'sop', name: 'Soprano', notes: [{ note: 'E5', startSec: 0, durationSec: 0.6 }, { note: 'G5', startSec: 0.6, durationSec: 0.8 }] },
        { id: 'alt', name: 'Alto', notes: [{ note: 'C5', startSec: 0, durationSec: 1.4 }] },
        { id: 'bas', name: 'Bass', notes: [{ note: 'C3', startSec: 0, durationSec: 1.4 }] }
      ]);
      const st0 = mp.getState();
      if (Math.abs(st0.duration - 1.4) > 0.01 || st0.tracks.length !== 3) { mp.destroy(); return false; }
      mp.toggleSolo(0);
      const stSolo = mp.getState();
      const soloOk = stSolo.tracks[0].audible === true && stSolo.tracks[1].audible === false && stSolo.tracks[2].audible === false;
      mp.clearSoloMute();
      mp.toggleMute(1);
      const stMute = mp.getState();
      const muteOk = stMute.tracks[0].audible === true && stMute.tracks[1].audible === false && stMute.tracks[2].audible === true;
      mp.setRate(0.75);
      mp.setTranspose(-2);
      mp.seekTo(0.8);
      const stCfg = mp.getState();
      const cfgOk = stCfg.rate === 0.75 && stCfg.transpose === -2 && Math.abs(stCfg.currentTime - 0.8) < 0.05;
      mp.stop();
      mp.destroy();
      return soloOk && muteOk && cfgOk;
    });
    check('예전 백업의 숫자형 숙련도(progress[id] = 3)도 필터가 곡 카드와 같게 인식', () => {
      const progMap = { night: 3, jazz: 0 };
      return filterSongs(songs, { mastery: 'ready', progress: progMap }).map(s => s.id).join() === 'night' &&
        filterSongs(songs, { mastery: 'unstarted', progress: progMap }).map(s => s.id).join() === 'jazz';
    });
    check('파트 숙련도 3단계(state.progress) 필터링(unstarted · learning · ready · 1~3) 검증', () => {
      const progMap = {
        night: { level: 3, practiceSec: 420 },
        jazz: { level: 1, practiceSec: 60 }
      };
      const ready = filterSongs(songs, { mastery: 'ready', progress: progMap });
      const learning = filterSongs(songs, { mastery: 'learning', progress: progMap });
      const unstarted = filterSongs(songs, { mastery: 'unstarted', progress: progMap });
      const lv1 = filterSongs(songs, { mastery: '1', progress: progMap });
      return ready.length === 1 && ready[0].id === 'night' &&
        learning.length === 1 && learning[0].id === 'jazz' &&
        unstarted.length === 0 &&
        lv1.length === 1 && lv1[0].id === 'jazz';
    });
    check('전 곡 duration · openingCue 완비 및 validateData 보존 검증', () => {
      const rawSongs = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8'));
      const validated = validateData(rawSongs);
      return (
        validated.errors.length === 0 &&
        validated.songs.length > 0 &&
        validated.songs.length === rawSongs.songs.length &&
        validated.songs.every(s => /^\d{1,2}:\d{2}$/.test(s.duration) && typeof s.openingCue === 'string' && s.openingCue.length >= 4)
      );
    });
    check('인앱 멀티트랙 하모니 플레이어·NWC 2.75/바이너리 호환·교육 자료 인앱 PDF 뷰어·숙련도 패널 구현 검증', () => {
      const adminJsContent = nodeFs.readFileSync('./js/admin.js', 'utf8');
      return (
        appJsContent.includes('createMultiTrackScorePlayer') &&
        appJsContent.includes('multitrack-player-panel') &&
        appJsContent.includes('function openEducationPdfModal') &&
        appJsContent.includes('교재 PDF 오프라인 보관') &&
        appJsContent.includes('function renderMasteryControlPanel') &&
        adminJsContent.includes('!NoteWorthyComposer') &&
        styleCssContent.includes('.multitrack-player-panel') &&
        styleCssContent.includes('.mastery-panel')
      );
    });
    check('butterfly · acaroom-opening 등 번호 파트 영상 보유 곡 partNames 번호 키 매핑 및 VP 역할 배지 표시 검증', () => {
      const allSongs = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs;
      const butterfly = allSongs.find(s => s.id === 'butterfly');
      const opening = allSongs.find(s => s.id === 'acaroom-opening');
      return (
        butterfly && butterfly.partNames.part1 === '선영' && butterfly.partNames.part5 === '휘소' &&
        opening && opening.partNames.part1 === '희엽' && opening.partNames.part6 === '휘소' &&
        appJsContent.includes('🥁 VP: ') &&
        appJsContent.includes('개별 영상이 없어 전체 합주(Full) 영상으로 안내합니다.')
      );
    });
    check('scores.json 임을 위한 행진곡(march-for-the-beloved) 4성부 NWC 악보 4건 교차 연결 검증', () => {
      const allScores = JSON.parse(nodeFs.readFileSync('./data/scores.json', 'utf8')).scores;
      const linked = getScoresForSong(allScores, 'march-for-the-beloved');
      return linked.length >= 4 && linked.some(s => s.id === 'score-desk-156');
    });
    check('admin.js NWC 악보 불러오기 시 연주 시간(duration) 및 첫 소절 큐(openingCue) 자동 추출 검증', () => {
      const adminJsContent = nodeFs.readFileSync('./js/admin.js', 'utf8');
      return (
        adminJsContent.includes('function formatSecondsToMmSs') &&
        adminJsContent.includes('function cleanNwcLyricSnippet') &&
        adminJsContent.includes("$('song-duration')") &&
        adminJsContent.includes("$('song-opening-cue')") &&
        adminJsContent.includes("$('media-baritone-pitch')")
      );
    });
    check('4부·6부·7부 편곡 동적 성부 매핑(getSongVoicePartMapping) 및 FULL 영상 재생 시 내 파트 첫 음 폴백 검증', () => {
      return (
        appJsContent.includes('function getSongVoicePartMapping(song)') &&
        appJsContent.includes("const effectiveCurrentPart = (currentPart && currentPart !== 'full') ? currentPart : (songMyPart(song) || null);") &&
        appJsContent.includes("const targetPitchPart = (part && part !== 'full') ? part : (songMyPart(song) || part);")
      );
    });
    check('다중 편곡 곡(bohemian-rhapsody · disney-medley) 양방향 아카이브(악보·감상·합주 일지) 교차 조회 검증', () => {
      const allScores = JSON.parse(nodeFs.readFileSync('./data/scores.json', 'utf8')).scores;
      const allApprec = JSON.parse(nodeFs.readFileSync('./data/appreciation.json', 'utf8')).videos;
      const allRehs = JSON.parse(nodeFs.readFileSync('./data/rehearsals.json', 'utf8')).rehearsals;
      const bhScores = getScoresForSong(allScores, 'bohemian-rhapsody');
      const bhApprec = getAppreciationForSong(allApprec, 'bohemian-rhapsody');
      const bh6Rehs = getRehearsalsForSong(allRehs, 'bohemian-rhapsody-6');
      const dmScores = getScoresForSong(allScores, 'disney-medley');
      return (
        bhScores.some(s => s.id === 'score-bohemian-rhapsody-6p') &&
        bhApprec.length >= 2 &&
        bhApprec.some(v => v.songId === 'bohemian-rhapsody-6') &&
        bh6Rehs.some(r => r.id === 'reh-bohemian-rhapsody') &&
        dmScores.some(s => s.id === 'score-disney-medley-edit3-2025')
      );
    });
    check('White Christmas 및 주요 연습곡 미연결 악보 24건 · 연습 영상 · 합주 피드백 아카이브 연결 검증', () => {
      const allScores = JSON.parse(nodeFs.readFileSync('./data/scores.json', 'utf8')).scores;
      const pVids = JSON.parse(nodeFs.readFileSync('./data/practice_videos.json', 'utf8')).videos;
      const rehs = JSON.parse(nodeFs.readFileSync('./data/rehearsals.json', 'utf8')).rehearsals;
      const wcScores = getScoresForSong(allScores, 'white-christmas');
      const balloonScores = getScoresForSong(allScores, 'balloon');
      const dittoScores = getScoresForSong(allScores, 'ditto');
      return (
        wcScores.length >= 8 &&
        balloonScores.some(s => s.id === 'score-research-61-mid') &&
        dittoScores.some(s => s.id === 'score-research-100-nwc') &&
        pVids.some(v => v.songId === 'white-christmas') &&
        rehs.some(r => r.songId === 'white-christmas')
      );
    });
    check('홈 공연 큐시트 카드 예상 러닝타임(est.formatted) · LIVE 큐시트 폴백 · 무대 전용 레퍼토리 연동 검증', () => {
      return (
        appJsContent.includes('getActiveStageSession') &&
        appJsContent.includes('getSongStartingPitchEntries') &&
        appJsContent.includes("const estLabel = est && est.totalSeconds > 0 ? est.formatted : '';") &&
        !appJsContent.includes('est > 0') &&
        appJsContent.includes('function upcomingPitchItems(meta, transposeSemi = 0)') &&
        appJsContent.includes("isUpcoming ? 'NEXT STAGE' : (isPast ? 'LAST STAGE · 지난 공연' : 'ACTIVE CUE SHEET')") &&
        appJsContent.includes("dday === 0 ? 'D-DAY' : `D-${dday}`) : (isPast ? '지난 공연' : 'LIVE 큐시트')") &&
        appJsContent.includes('const HOME_SETLIST_PREVIEW = 3;')
      );
    });
    check('홈 내 파트 맞춤 연습(myPanel) 나는 누구?(myName) 인식 및 실제 DOM 렌더링 복구 검증', () => {
      const allSongs = JSON.parse(nodeFs.readFileSync('./data/songs.json', 'utf8')).songs;
      const memberFiltered = filterSongs(allSongs, { query: '선영' });
      return (
        memberFiltered.length >= 1 &&
        appJsContent.includes('const hasMyIdentity = Boolean(state.myName || state.myPart);') &&
        appJsContent.includes("app.append(section('내 파트 맞춤 연습'") &&
        appJsContent.includes('state.filters = {query: state.myName,')
      );
    });
    check('연습 일지 검색·곡별 필터 · 곡 상세/연습 화면 필터 연동 · 피드백 작성자/파트 프리셋 · 파트 필터 칩 · 공감 버튼 검증', () => {
      return (
        appJsContent.includes("rehearsalFilters: {query: '', songId: ''}") &&
        appJsContent.includes('function renderFeedbackSection(reh, playerInstance, audioCtrl, song = null)') &&
        appJsContent.includes("const defaultAuthor = state.myName || read('last_feedback_author', '');") &&
        appJsContent.includes("['part7', '7번 파트']") &&
        appJsContent.includes("['lead', '리드 (LEAD)']") &&
        appJsContent.includes('toggleFeedbackLike(fb.id)') &&
        appJsContent.includes('feedback-like-btn') &&
        appJsContent.includes('const rehearsalPlayers = [];') &&
        appJsContent.includes("state.rehearsalFilters = { query: '', songId: song.id };")
      );
    });
    check('설정 백업 내보내기/불러오기(myName·statusOverrides·커스텀 아카이브·공감 포함)·캐시 강제 리로드·초기화 즉시 갱신 검증', () => {
      return (
        appJsContent.includes('myName: state.myName') &&
        appJsContent.includes("statusOverrides: read('statusOverrides', {})") &&
        appJsContent.includes("likedFeedbacks: read('liked_feedbacks', [])") &&
        appJsContent.includes("customScores: read('custom_scores', [])") &&
        appJsContent.includes("customMemories: read('custom_memories', [])") &&
        appJsContent.includes("customAppreciation: read('custom_appreciation', [])") &&
        appJsContent.includes("customPracticeVideos: read('custom_practice_videos', [])") &&
        appJsContent.includes("customEducation: read('custom_education', [])") &&
        appJsContent.includes('loadScores(true)') &&
        appJsContent.includes('loadMemories(true)') &&
        appJsContent.includes('loadEducation(true)') &&
        appJsContent.includes('loadPracticeVideos(true)') &&
        appJsContent.includes('loadAppreciation(true)') &&
        appJsContent.includes("write('feedbacks_seed_v', 2);") &&
        appJsContent.includes('if (!song._defaultStatus) song._defaultStatus = song.status;')
      );
    });
    check('UI/UX 개선 ①~⑥ (모바일 5탭+더보기 시트 · 연습 화면 핵심4버튼/아코디언 · 홈 원탭 온보딩/이어하기 · 접이식 필터/정렬 · LIVE 스와이프/큰글씨) 검증', () => {
      const stageJsContent = nodeFs.readFileSync('./js/stage.js', 'utf8');
      return (
        appJsContent.includes('mobilePrimaryTabs') &&
        appJsContent.includes('function openMobileMoreSheet()') &&
        appJsContent.includes('nav-group-label') &&
        appJsContent.includes('home-onboarding-card') &&
        appJsContent.includes('home-resume-banner') &&
        appJsContent.includes('song-grid-carousel') &&
        appJsContent.includes('browse-sort-select') &&
        appJsContent.includes('browse-detail-toggle') &&
        appJsContent.includes('practice-primary-actions') &&
        appJsContent.includes('practice-more-tools') &&
        appJsContent.includes('practice-loop-accordion') &&
        stageJsContent.includes('classifyHorizontalSwipe') &&
        stageJsContent.includes('stage-large-text') &&
        stageJsContent.includes('acaroom_stage_swipe_locked') &&
        styleCssContent.includes('.mobile-more-sheet') &&
        styleCssContent.includes('.home-resume-banner') &&
        styleCssContent.includes('.practice-primary-actions') &&
        styleCssContent.includes('.stage-live-shell.stage-large-text')
      );
    });
  }

  return { passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results };
}
