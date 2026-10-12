/**
 * AcaRaca Stage Live Mode (무대 전용 큐시트 & 공연 관리)
 * - 행사이름 및 셋리스트(곡순서) 관리
 * - 파트별 첫음 잡기 (Web Audio API 연동)
 * - 곡소개 멘트 AI 추천 (유쾌/감성/초간단 3톤 + 커스텀 편집)
 * - 컴팩트 한 화면 집중 UI (Screen Wake Lock 지원)
 * - 공연 히스토리 누적 관리 (최신순 정렬)
 */

import { el, icon, button, toast } from './ui.js';
import {
  parseNoteString,
  getNoteFrequency,
  playPitch,
  stopPitch,
  playPitchSequence,
  stopPitchSequence,
  isPitchSequencePlaying,
  playChordStrings,
  subscribePitchState
} from './pitch.js';
import { requestWakeLock, releaseWakeLock, isWakeLockActive } from './backgroundPlay.js';

export const STAGE_HISTORY_KEY = 'acaroom_stage_history_v2';
export const STAGE_ACTIVE_KEY = 'acaroom_stage_active_v2';

/**
 * 33개 전 곡에 대한 고품질 AI 추천 멘트 데이터베이스 (유쾌/위트, 감성/스토리, 초간단)
 */
export const STAGE_AI_COMMENTS = {
  'bohemian-rhapsody-5': {
    wit: `“드디어 올 것이 왔습니다! 퀸의 전설적인 명곡, 목소리 다섯 개로 오페라와 록을 넘나들 수 있을까요? 직접 귀로 확인해 보세요!”`,
    story: `“자유와 방황, 오페라와 하드록이 교차하는 불후의 명작 '보헤미안 랩소디'입니다. 어떠한 악기도 없이 오직 다섯 명의 숨소리와 하모니로 무대를 웅장하게 채웁니다.”`,
    brief: `“다섯 성부의 다채로운 음색으로 재해석한 퀸의 명곡, '보헤미안 랩소디'입니다.”`
  },
  'bohemian-rhapsody-6': {
    wit: `“펜타토닉스 버전으로 꽉 채운 6인 보헤미안 랩소디! 입으로 연주하는 드럼 비트와 심장을 울리는 서브 베이스에 주목해 주세요!”`,
    story: `“현대 아카펠라의 정수를 보여주는 편곡입니다. 화려한 보컬 퍼커션과 탄탄한 저음 위에 여섯 목소리의 하모니가 폭발하는 순간을 선물합니다.”`,
    brief: `“보컬 퍼커션과 6성부의 역동적인 앙상블, '보헤미안 랩소디' 펜타토닉스 버전입니다.”`
  },
  'mujogeon': {
    wit: `“짜짜라 짜라짜라 짜짜짜! 여러분, 오늘 저희에게 무조건 박수 보내주실 거죠? 아카펠라로 부르는 박상철의 '무조건', 신나게 달립니다!”`,
    story: `“지친 일상에 가장 유쾌하고 뜨거운 비타민이 되어줄 국민 애창곡 '무조건'입니다. 다섯 목소리가 빚어내는 맛깔나는 트로트 하모니에 빠져보세요.”`,
    brief: `“관객 모두와 하나 되어 신나게 부르는 유쾌한 아카펠라, '무조건'입니다.”`
  },
  'short-hair': {
    wit: `“그녀의 짧은 머리에 반했던 그 시절! 복고풍 디스코 리듬을 아카펠라로 재현합니다. 어깨 들썩일 준비 되셨나요?”`,
    story: `“조용필 님의 대표 명곡 '단발머리'. 통통 튀는 베이스 라인과 산뜻한 화음으로 첫사랑의 설렘을 노래합니다.”`,
    brief: `“경쾌한 리듬과 산뜻한 보컬 앙상블이 돋보이는 조용필의 '단발머리'입니다.”`
  },
  'disney-medley-7': {
    wit: `“디즈니 동산에 오신 것을 환영합니다! 7명이 모여 디즈니 프린세스부터 사자왕까지 목소리로 전부 소환해 드립니다!”`,
    story: `“어린 시절 우리를 꿈꾸게 했던 디즈니 명곡들을 7개 성부의 웅장하고 환상적인 하모니로 엮은 스페셜 메들리입니다.”`,
    brief: `“동화 같은 감동을 전하는 7성부의 풍성한 '디즈니 메들리'입니다.”`
  },
  'disney-medley': {
    wit: `“꿈과 희망의 디즈니 세계로 함께 떠나볼까요? 알라딘부터 라이온킹까지, 목소리로 떠나는 마법 같은 시간입니다!”`,
    story: `“세대를 넘어 사랑받는 디즈니 애니메이션의 명곡들을 따뜻하고 영롱한 아카펠라 사운드로 전해드립니다.”`,
    brief: `“추억과 감동을 노래하는 아카펠라 '디즈니 메들리'입니다.”`
  },
  'first-impression': {
    wit: `“첫인상이 너무 강렬하면 눈을 뗄 수 없죠! 저희 목소리의 강렬한 첫인상에 푹 빠지실 준비 되셨나요?”`,
    story: `“김건모 님의 그루브 넘치는 명곡 '첫인상'. 세련된 재즈 하모니와 쫄깃한 리듬감을 목소리만으로 세밀하게 묘사합니다.”`,
    brief: `“세련된 그루브와 경쾌한 스윙감이 매력적인 '첫인상'입니다.”`
  },
  'tobacco-shop-girl': {
    wit: `“골목길 담배가게 아가씨에게 고백하려다 수많은 동네 총각들과 경쟁해야 했던 그 남자의 파란만장한 이야기!”`,
    story: `“송창식 님의 원곡을 유쾌한 드라마처럼 풀어낸 곡입니다. 한 편의 뮤지컬을 보듯 멤버들의 익살스러운 연기와 탄탄한 리듬을 즐겨보세요.”`,
    brief: `“유쾌한 스토리텔링과 박진감 넘치는 하모니, '담배가게 아가씨'입니다.”`
  },
  'aloha': {
    wit: `“어두운 불빛 아래 촛불 하나~ 오늘 여러분과 저희의 밤을 달콤하게 밝혀줄 곡입니다. 함께 흥얼거려 주세요!”`,
    story: `“가장 따뜻한 고백의 노래, '아로하'입니다. 감미로운 보컬과 잔잔히 감싸 안는 화음이 무대에 로맨틱한 온기를 전합니다.”`,
    brief: `“달콤하고 포근한 사랑의 메시지, 쿨과 조정석의 명곡 '아로하'입니다.”`
  },
  'tayo-pororo': {
    wit: `“노는 게 제일 좋아~ 친구들 모여라! 어른들의 동심까지 완벽하게 소환해 드립니다. 어린 친구들, 박수 칠 준비 됐나요?”`,
    story: `“대한민국 모든 아이들의 영원한 친구 뽀로로와 타요! 남녀노소 누구나 미소 짓게 만드는 발랄하고 사랑스러운 메들리입니다.”`,
    brief: `“신나고 귀여운 동심의 세계로 안내하는 '타요 뽀로로 메들리'입니다.”`
  },
  'run-the-sky': {
    wit: `“목소리 하나로 저 높은 하늘 끝까지 날아오르는 기분! 가슴 뻥 뚫릴 준비하시고 소리 질러~!”`,
    story: `“이적 님의 파워풀한 록 명곡 '하늘을 달리다'. 벅차오르는 에너지와 층층이 쌓여 올라가는 고음 하모니가 카타르시스를 선사합니다.”`,
    brief: `“가슴이 뻥 뚫리는 시원한 질주와 폭발적인 에너지, '하늘을 달리다'입니다.”`
  },
  'speechless': {
    wit: `“더 이상 침묵하지 않겠다! 나오미 스콧의 폭발적인 성량을 아카펠라의 웅장한 코러스로 재현합니다!”`,
    story: `“영화 '알라딘'에서 자스민 공주가 당당한 용기를 노래한 'Speechless'. 억압을 딛고 일어서는 강인한 메시지를 목소리의 웅장함으로 담아냈습니다.”`,
    brief: `“당당한 용기와 압도적인 감동을 선사하는 알라딘 OST, 'Speechless'입니다.”`
  },
  'in-your-arms': {
    wit: `“가을 밤, 연인의 품속처럼 따뜻하고 포근하게 감싸 안아 드립니다. 옆 사람 손을 슬며시 잡아보세요.”`,
    story: `“유재하 님의 불멸의 발라드 '그대 내 품에'. 별빛 아래 사랑하는 이와 함께 있는 듯한 아련하고 깊은 서정을 아카펠라로 속삭입니다.”`,
    brief: `“서정적이고 아련한 화음으로 전하는 유재하의 '그대 내 품에'입니다.”`
  },
  'well-done-today': {
    wit: `“오늘 하루도 정말 고생 많으셨죠? 여러분의 고단한 퇴근길과 하루를 토닥여주는 노래 처방전입니다.”`,
    story: `“옥상달빛의 따뜻한 위로곡 '수고했어, 오늘도'. 온 세상을 다정하게 안아주는 멤버들의 부드러운 목소리가 지친 마음에 쉼표가 되어드립니다.”`,
    brief: `“지친 일상에 건네는 가장 다정한 토닥임, '수고했어 오늘도'입니다.”`
  },
  'daft-punk': {
    wit: `“이 소리가 정말 사람 입에서 나는 소리냐고요? 네, 100% 생목소리입니다! 펜타토닉스의 레전드 다프트 펑크 메들리!”`,
    story: `“일렉트로닉 댄스 음악의 거장 다프트 펑크의 히트곡들을 목소리로 완벽히 구현해 그래미를 휩쓴 역작. 인간의 목소리가 낼 수 있는 리듬의 한계에 도전합니다.”`,
    brief: `“입으로 연주하는 미래지향적 전자음악, 펜타토닉스 스타일의 'Daft Punk'입니다.”`
  },
  'isnt-she-lovely': {
    wit: `“세상에 이렇게 사랑스러운 사람이 있을까요? 바로 지금 저희 앞에 계신 관객 여러분 이야기입니다!”`,
    story: `“스티비 원더가 딸의 탄생을 기뻐하며 만든 소울풀한 명곡. 행복한 미소와 그루브가 절로 터져 나오는 밝고 경쾌한 하모니입니다.”`,
    brief: `“사랑스러움과 따뜻한 재즈 그루브가 가득한 'Isn\'t She Lovely'입니다.”`
  },
  'lets-travel': {
    wit: `“메아리 소리가 들려오는 계곡 속에 흐르는 물 찾아 그곳으로 여행을 떠나요! 다 함께 박수 치며 달려볼까요?”`,
    story: `“조용필 님의 국민 여행송. 답답한 도심을 벗어나 푸른 자연으로 떠나는 설렘을 파워풀한 보컬과 역동적인 비트로 노래합니다.”`,
    brief: `“신나는 여행의 설렘과 시원한 에너지를 전하는 '여행을 떠나요'입니다.”`
  },
  'love-song-medley': {
    wit: `“세상의 온갖 달콤한 고백송을 한 바구니에 담았습니다! 심장 쿵쾅거릴 준비 하세요!”`,
    story: `“사랑의 시작부터 고백까지, 시대를 아우르는 대표 러브송들을 한 편의 로맨틱 코미디처럼 엮은 달콤한 메들리입니다.”`,
    brief: `“설렘 가득한 사랑의 순간들을 엮은 달콤한 '러브송 메들리'입니다.”`
  },
  'l-o-v-e': {
    wit: `“L is for the way you look at me~ 관객 여러분과 사랑에 빠질 준비가 되었습니다!”`,
    story: `“냇 킹 콜의 불멸의 스탠다드 재즈 명곡 'L-O-V-E'. 부드러운 스윙 리듬과 풍성한 코러스가 클래식하고 고급스러운 분위기를 연출합니다.”`,
    brief: `“클래식하고 로맨틱한 재즈 스윙 하모니, 'L-O-V-E'입니다.”`
  },
  'old-pop-medley': {
    wit: `“라디오에서 흘러나오던 그 시절 감성 팝송들! 입술이 먼저 가사를 기억하는 추억의 여행으로 떠나보시죠!”`,
    story: `“시대를 풍미했던 올드팝 명곡들을 모아 아카펠라 특유의 빈티지하고 풍성한 화음으로 재해석한 특별한 시간입니다.”`,
    brief: `“추억과 낭만을 소환하는 감성 충만 '올드팝 메들리'입니다.”`
  },
  'beautiful-world': {
    wit: `“이 세상이 아름다운 이유는 바로 저희 목소리를 따뜻하게 들어주시는 여러분 덕분입니다!”`,
    story: `“박학기, 유리상자의 명곡 '아름다운 세상'. 서로 다른 목소리가 하나로 어우러져 만들어내는 순수하고 맑은 감동을 전합니다.”`,
    brief: `“마음을 정화하는 따스하고 순수한 화음, '아름다운 세상'입니다.”`
  },
  'butterfly': {
    wit: `“국가대표가 된 기분으로 날아오릅니다! 하늘 높이 날아오르는 나비처럼 힘차게 날개짓을 시작합니다!”`,
    story: `“영화 '국가대표'의 주제곡 러브홀릭스의 'Butterfly'. 날개를 펴고 비상하는 희망찬 메시지를 벅찬 하모니로 노래합니다.”`,
    brief: `“벅찬 감동과 찬란한 비상을 노래하는 대표 힐링송, 'Butterfly'입니다.”`
  },
  'cherry-blossom-ending': {
    wit: `“봄바람 휘날리며 흩날리는 벚꽃 잎이~ 벚꽃 연금송, 목소리 버전으로 봄 향기를 물씬 풍겨드립니다!”`,
    story: `“버스커 버스커의 봄의 대명사 '벚꽃 엔딩'. 어쿠스틱한 감성과 설레는 봄의 기운을 아카펠라의 달콤한 화음으로 피워냅니다.”`,
    brief: `“설레는 봄날의 온기를 그대로 머금은 감미로운 '벚꽃 엔딩'입니다.”`
  },
  'ditto': {
    wit: `“뉴진스의 힙한 감성을 아카펠라로? EXIT 스타일로 해석한 신비롭고 몽환적인 비트를 기대해 주세요!”`,
    story: `“뉴진스의 글로벌 히트곡 'Ditto'를 그룹 EXIT의 감각적인 편곡으로 노래합니다. 몽환적인 코러스와 섬세한 그루브가 돋보입니다.”`,
    brief: `“몽환적인 레트로 감성과 감각적인 보컬 앙상블, 'Ditto' 아카펠라 버전입니다.”`
  }
};

/**
 * 멘트 데이터베이스에 없는 곡도 곡의 메타데이터를 기반으로 자연스러운 MC 멘트를 자동 생성하는 함수
 */
export function generateDynamicMCComment(song, tone = 'story') {
  if (!song) return '“지금 들려드릴 멋진 아카펠라 하모니에 귀 기울여 주세요.”';
  const specific = STAGE_AI_COMMENTS[song.id];
  if (specific && specific[tone]) {
    return specific[tone];
  }

  const title = song.title || '연습곡';
  const artist = song.artist ? `${song.artist}의 ` : '';
  const category = song.category || '아카펠라';
  const arrangement = song.arrangement || '다성부';

  if (tone === 'wit') {
    return `“다음에 들려드릴 곡은 ${artist}'${title}'입니다! ${arrangement}의 꽉 찬 목소리로 선사하는 ${category}의 매력, 귀 쫑긋 세우고 감상해 주세요!”`;
  }
  if (tone === 'brief') {
    return `“${artist}'${title}'을 ${arrangement} 아카펠라 하모니로 전해드립니다.”`;
  }
  // story (default)
  return `“이번 곡은 ${artist}'${title}'입니다. 악기 하나 없이 사람의 온기 어린 목소리만으로 직조해낸 ${category} 하모니의 감동을 느껴보세요.”`;
}

/**
 * 곡의 startingPitches 데이터로부터 재생 가능한 파트별 첫 음 목록을 최적 순서로 추출
 */
export function getSongStartingPitchEntries(songData) {
  if (!songData?.startingPitches) return [];
  const rawPitches = (typeof songData.startingPitches.pitches === 'object')
    ? songData.startingPitches.pitches
    : songData.startingPitches;

  const namedKeys = ['bass', 'baritone', 'tenor', 'alto', 'soprano', 'lead', 'vp'];
  const hasNamed = namedKeys.some(k => Boolean(rawPitches[k]));

  const entries = Object.entries(rawPitches).filter(([part, noteStr]) => {
    if (!noteStr || typeof noteStr !== 'string' || part === 'full') return false;
    if (hasNamed) {
      return !part.startsWith('part');
    }
    return true;
  });

  const orderMap = {
    bass: 1,
    part5: 1,
    baritone: 3,
    part4: 3,
    tenor: 5,
    part3: 5,
    alto: 7,
    part2: 7,
    soprano: 9,
    part1: 9,
    lead: 11,
    vp: 12,
    part6: 13,
    part7: 14
  };

  return entries.sort((a, b) => {
    const pA = parseNoteString(a[1]);
    const pB = parseNoteString(b[1]);
    if (pA && pB && pA.freq !== pB.freq) return pA.freq - pB.freq;
    return (orderMap[a[0]] || 99) - (orderMap[b[0]] || 99);
  });
}

/**
 * 초기 시드용 대표 공연 기록들 (최신순 3개 기본 탑재)
 */
export const DEFAULT_STAGE_HISTORY = [
  {
    id: 'stage-2026-yeosu',
    eventTitle: '2026 여수 생활문화한마당',
    date: '2026.10.16',
    venue: '웅천친수공원',
    notes: '2026 여수 생활문화한마당 공연 큐시트 (장소: 웅천친수공원)',
    updatedAt: 1792144800000,
    currentIndex: 0,
    songs: [
      { songId: 'love-song-medley', title: '러브송 메들리', note: '오프닝 메들리', commentTone: 'story' },
      { songId: 'old-pop-medley', title: '올드팝 메들리', note: '명곡 메들리', commentTone: 'story' },
      { songId: 'bohemian-rhapsody-5', title: '보헤미안 랩소디 · 5인용', note: '5부 하이라이트', commentTone: 'wit' },
      { songId: 'in-your-arms', title: '그대 내 품에', note: '감성 발라드', commentTone: 'story' },
      { songId: 'isnt-she-lovely', title: 'Isn\'t She Lovely', note: '소울풀 그루브', commentTone: 'wit' },
      { songId: 'lets-travel', title: '여행을 떠나요', note: '피날레 호응 유도', commentTone: 'wit' }
    ]
  },
  {
    id: 'stage-2026-spring',
    eventTitle: '2026 아카라카 봄 정기공연 · 청춘 하모니',
    date: '2026.10.12',
    venue: '연세대학교 백양콘서트홀',
    notes: '메인 무대 큐시트 (정기공연)',
    updatedAt: 1791811200000,
    currentIndex: 0,
    songs: [
      { songId: 'butterfly', title: 'Butterfly', note: '오프닝 곡', commentTone: 'story' },
      { songId: 'beautiful-world', title: '아름다운 세상', note: '합창 분위기', commentTone: 'story' },
      { songId: 'bohemian-rhapsody-5', title: '보헤미안 랩소디 · 5인용', note: '하이라이트', commentTone: 'wit' },
      { songId: 'speechless', title: 'Speechless', note: '파워풀 보컬', commentTone: 'story' },
      { songId: 'mujogeon', title: '무조건', note: '관객 호응 유도', commentTone: 'wit' },
      { songId: 'aloha', title: '아로하', note: '앙코르 피날레', commentTone: 'brief' }
    ]
  },
  {
    id: 'stage-2025-busking',
    eventTitle: '2025 아카라카 봄맞이 캠퍼스 버스킹',
    date: '2025.05.20',
    venue: '학생회관 앞 야외 버스킹 무대',
    notes: '야외 버스킹 셋리스트',
    updatedAt: 1747700000000,
    currentIndex: 0,
    songs: [
      { songId: 'cherry-blossom-ending', title: '벚꽃 엔딩', note: '봄 감성 오프닝', commentTone: 'wit' },
      { songId: 'short-hair', title: '단발머리', note: '경쾌한 비트', commentTone: 'wit' },
      { songId: 'first-impression', title: '첫인상', note: '재즈 그루브', commentTone: 'story' },
      { songId: 'lets-travel', title: '여행을 떠나요', note: '단체 박수 유도', commentTone: 'wit' }
    ]
  },
  {
    id: 'stage-2024-suncheon',
    eventTitle: '2024 순천만국가정원 아고라순천 무대',
    date: '2024.10.15',
    venue: '순천만국가정원 남문 스페이스허브광장',
    notes: '초청 야외공연',
    updatedAt: 1729000000000,
    currentIndex: 0,
    songs: [
      { songId: 'old-pop-medley', title: '올드팝 메들리', note: '명곡 메들리', commentTone: 'story' },
      { songId: 'isnt-she-lovely', title: 'Isn\'t She Lovely', note: '소울풀 보컬', commentTone: 'story' },
      { songId: 'l-o-v-e', title: 'L.O.V.E.', note: '스윙 재즈', commentTone: 'brief' },
      { songId: 'tobacco-shop-girl', title: '담배가게 아가씨', note: '뮤지컬 피날레', commentTone: 'wit' }
    ]
  }
];

/**
 * 저장소에서 공연 히스토리 가져오기 (항상 최신순 정렬)
 */
export function getStageHistory() {
  try {
    const raw = localStorage.getItem(STAGE_HISTORY_KEY);
    if (raw === null) {
      saveStageHistory(DEFAULT_STAGE_HISTORY);
      return DEFAULT_STAGE_HISTORY;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const existingIds = new Set(parsed.map(item => item.id));
      let changed = false;
      for (const def of DEFAULT_STAGE_HISTORY) {
        if (!existingIds.has(def.id)) {
          parsed.unshift(JSON.parse(JSON.stringify(def)));
          changed = true;
        }
      }
      const sorted = parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (changed) {
        saveStageHistory(sorted);
      }
      return sorted;
    }
  } catch (e) {
    console.warn('Failed to parse stage history:', e);
  }
  return DEFAULT_STAGE_HISTORY;
}

/**
 * 공연 히스토리 저장
 */
export function saveStageHistory(history) {
  try {
    const sorted = [...history].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    localStorage.setItem(STAGE_HISTORY_KEY, JSON.stringify(sorted));
    return sorted;
  } catch (e) {
    console.error('Failed to save stage history:', e);
    return history;
  }
}

/**
 * 현재 활성화된 무대 세션 가져오기 (없으면 히스토리 최신 또는 기본 생성)
 */
export function getActiveStageSession(allSongs = []) {
  try {
    const raw = localStorage.getItem(STAGE_ACTIVE_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      const yeosuSession = getStageHistory().find(h => h.id === 'stage-2026-yeosu');
      if (yeosuSession && (session.id === 'stage-2026-spring' || session.eventTitle === '새 아카라카 공연' || session.eventTitle === '2026 아카라카 무대 큐시트' || !session.eventTitle)) {
        saveActiveStageSession(JSON.parse(JSON.stringify(yeosuSession)));
        return yeosuSession;
      }
      if (session && Array.isArray(session.songs) && session.songs.length > 0) {
        return session;
      }
    }
  } catch (e) {
    console.warn('Failed to load active stage session:', e);
  }

  // 없으면 히스토리 최상단 항목을 복제해 활성화
  const history = getStageHistory();
  if (history && history.length > 0) {
    const cloned = JSON.parse(JSON.stringify(history[0]));
    saveActiveStageSession(cloned);
    return cloned;
  }

  // 그것도 없으면 기본 세션 생성
  const defaultSession = {
    id: `stage-${Date.now()}`,
    eventTitle: '2026 아카라카 무대 큐시트',
    date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    venue: '공연장',
    notes: '무대 큐시트',
    updatedAt: Date.now(),
    currentIndex: 0,
    songs: (allSongs.slice(0, 5) || []).map(s => ({
      songId: s.id,
      title: s.title,
      note: '',
      commentTone: 'story'
    }))
  };
  saveActiveStageSession(defaultSession);
  return defaultSession;
}

/**
 * 활성 무대 세션 저장 및 히스토리에 자동 반영 (최신순 상단 위치)
 */
export function saveActiveStageSession(session) {
  if (!session) return;
  session.updatedAt = Date.now();
  try {
    localStorage.setItem(STAGE_ACTIVE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save active stage session:', e);
  }

  // 히스토리에도 동기화 반영
  const history = getStageHistory();
  const existingIdx = history.findIndex(h => h.id === session.id);
  let updatedHistory;
  if (existingIdx >= 0) {
    updatedHistory = [...history];
    updatedHistory[existingIdx] = JSON.parse(JSON.stringify(session));
  } else {
    updatedHistory = [JSON.parse(JSON.stringify(session)), ...history];
  }
  saveStageHistory(updatedHistory);
}

/**
 * 새 빈 무대 세션 생성
 */
export function createNewStageSession(title = '새로운 아카라카 공연') {
  const newSession = {
    id: `stage-${Date.now()}`,
    eventTitle: title,
    date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    venue: '메인 무대',
    notes: '새 큐시트',
    updatedAt: Date.now(),
    currentIndex: 0,
    songs: []
  };
  saveActiveStageSession(newSession);
  return newSession;
}

/**
 * 공연 히스토리 항목 삭제
 */
export function deleteStageHistoryItem(id) {
  const history = getStageHistory().filter(item => item.id !== id);
  saveStageHistory(history);
  const active = getActiveStageSession();
  if (active && active.id === id) {
    if (history.length > 0) {
      saveActiveStageSession(JSON.parse(JSON.stringify(history[0])));
    } else {
      createNewStageSession();
    }
  }
}

export const STAGE_ADMIN_PASSWORD = '1234';

/**
 * 셋리스트 편집, 복제, 삭제 등 편집 기능 실행 전 비밀번호 확인 모달
 */
export function promptStagePassword({ actionName = '편집', onSuccess, onCancel }) {
  const existing = document.getElementById('stage-auth-dialog');
  if (existing) existing.remove();

  const dialog = el('dialog', {
    id: 'stage-auth-dialog',
    class: 'stage-modal-dialog stage-auth-dialog',
    'aria-labelledby': 'stage-auth-title'
  });

  const header = el('div', { class: 'stage-modal-header' },
    el('h3', { id: 'stage-auth-title', text: '🔒 관리자 비밀번호 확인' }),
    button('✕', () => dialog.close(), 'icon-button', null, { 'aria-label': '닫기' })
  );

  const desc = el('p', {
    style: 'font-size: 13.5px; color: var(--muted); margin: 0 0 16px; line-height: 1.5;',
    text: `${actionName} 작업을 진행하려면 비밀번호를 입력해 주세요.`
  });

  const input = el('input', {
    type: 'password',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    maxlength: '10',
    placeholder: '비밀번호 4자리',
    autocomplete: 'current-password',
    style: 'width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 20px; letter-spacing: 6px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); text-align: center;'
  });

  const errEl = el('div', {
    style: 'color: #ef4444; font-size: 12.5px; margin-top: 8px; font-weight: 600; display: none;',
    text: '비밀번호가 일치하지 않습니다.'
  });

  function submit() {
    const val = input.value.trim();
    if (val === STAGE_ADMIN_PASSWORD) {
      dialog.close();
      if (typeof onSuccess === 'function') onSuccess();
    } else {
      errEl.style.display = 'block';
      errEl.textContent = '비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
      input.classList.add('error');
      input.select();
      input.focus();
    }
  }

  const confirmBtn = button('확인', () => submit(), 'button primary', null, { style: 'flex: 1;' });
  const cancelBtn = button('취소', () => dialog.close(), 'button secondary', null, { style: 'flex: 1;' });

  const actions = el('div', { style: 'display: flex; gap: 8px; margin-top: 18px;' }, cancelBtn, confirmBtn);

  const body = el('div', { class: 'stage-modal-body', style: 'padding-top: 6px;' },
    desc,
    input,
    errEl,
    actions
  );

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  dialog.append(header, body);

  dialog.addEventListener('close', () => {
    dialog.remove();
    if (typeof onCancel === 'function') onCancel();
  });

  document.body.append(dialog);
  dialog.showModal();
  setTimeout(() => input.focus(), 60);
}

let activeStageLiveCleanup = null;

/**
 * 무대 전용 큐시트 화면 렌더러 (한 화면 집중 UI)
 */
export function renderStageLiveView({ container, songs, navigate, onSwitchView }) {
  if (typeof activeStageLiveCleanup === 'function') {
    activeStageLiveCleanup();
    activeStageLiveCleanup = null;
  }

  const session = getActiveStageSession(songs);
  if (!session.songs || session.songs.length === 0) {
    session.songs = (songs.slice(0, 5) || []).map(s => ({
      songId: s.id,
      title: s.title,
      note: '',
      commentTone: 'story'
    }));
    saveActiveStageSession(session);
  }

  let activeIndex = typeof session.currentIndex === 'number' ? session.currentIndex : 0;
  if (activeIndex < 0) activeIndex = 0;
  if (activeIndex >= session.songs.length) activeIndex = session.songs.length - 1;

  let liveMode = 'focus'; // 'focus' | 'overview'
  try {
    const savedMode = localStorage.getItem('acaroom_stage_live_submode');
    if (savedMode === 'overview' || savedMode === 'focus') liveMode = savedMode;
  } catch {}

  let currentTone = 'story';
  const customComments = {}; // songId -> custom edited comment

  const shell = el('section', {
    class: 'stage-live-shell',
    role: 'region',
    'aria-label': '아카라카 무대 전용 큐시트'
  });
  container.replaceChildren(shell);

  // Screen Wake Lock 자동 요청
  requestWakeLock().then(() => {
    updateWakeLockBtnState();
  });

  // Pitch Subscription for real-time wave/active note highlight
  let currentPitchPart = null;
  const unsubscribePitch = subscribePitchState((playing) => {
    currentPitchPart = playing ? playing.note : null;
    updatePitchPlayingUI(playing);
  });

  // Keyboard navigation on stage (arrow keys, space for pitch)
  function handleKeyDown(e) {
    if (e.target && e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      if (activeIndex < session.songs.length - 1) {
        stopPitch(true);
        activeIndex++;
        session.currentIndex = activeIndex;
        saveActiveStageSession(session);
        if (liveMode === 'focus') renderCurrentSong();
        else renderOverviewView();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      if (activeIndex > 0) {
        stopPitch(true);
        activeIndex--;
        session.currentIndex = activeIndex;
        saveActiveStageSession(session);
        if (liveMode === 'focus') renderCurrentSong();
        else renderOverviewView();
      }
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (liveMode === 'focus' && playAllBtn) playAllBtn.click();
    } else if (e.key === 'Escape') {
      stopPitch(true);
    }
  }
  window.addEventListener('keydown', handleKeyDown);

  // Shell 컴포넌트들
  const header = el('div', { class: 'stage-live-header' });
  const focusViewArea = el('div', { class: 'stage-focus-view-area' });
  const setlistBar = el('div', { class: 'stage-setlist-bar', role: 'tablist', 'aria-label': '곡 순서 셋리스트' });
  const heroCard = el('div', { class: 'stage-hero-card' });
  const pitchCard = el('div', { class: 'stage-pitch-card' });
  const mcCard = el('div', { class: 'stage-mc-card' });
  const navBar = el('div', { class: 'stage-nav-bar' });
  focusViewArea.append(setlistBar, heroCard, pitchCard, mcCard, navBar);

  const overviewViewArea = el('div', { class: 'stage-overview-view-area' });

  shell.append(header, focusViewArea, overviewViewArea);

  let wakeLockBtn;
  let fullscreenBtn;

  function updateWakeLockBtnState() {
    if (!wakeLockBtn) return;
    const active = isWakeLockActive();
    wakeLockBtn.textContent = active ? '● 화면 켜짐 유지 ON' : '○ 화면 유지 OFF';
    wakeLockBtn.className = `stage-wake-pill${active ? '' : ' inactive'}`;
    wakeLockBtn.setAttribute('aria-pressed', String(active));
  }

  function updateFsBtn() {
    if (!fullscreenBtn) return;
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    fullscreenBtn.textContent = isFs ? '🗗' : '⛶';
    fullscreenBtn.title = isFs ? '전체화면 나가기' : '전체화면 전환';
  }
  document.addEventListener('fullscreenchange', updateFsBtn);
  document.addEventListener('webkitfullscreenchange', updateFsBtn);

  function renderHeader() {
    wakeLockBtn = button(
      isWakeLockActive() ? '● 화면 켜짐 유지 ON' : '○ 화면 유지 OFF',
      async () => {
        if (isWakeLockActive()) {
          await releaseWakeLock();
          toast('화면 자동 꺼짐 방지가 해제되었습니다.');
        } else {
          const success = await requestWakeLock();
          if (success) toast('무대 모드: 화면 켜짐이 유지됩니다.');
        }
        updateWakeLockBtnState();
      },
      `stage-wake-pill${isWakeLockActive() ? '' : ' inactive'}`,
      null,
      { 'aria-label': '화면 켜짐 유지 토글', title: '무대 조명 아래에서 스마트폰 화면이 꺼지지 않게 고정합니다' }
    );

    const liveBadge = el('div', { class: 'stage-live-pill' },
      el('span', { class: 'stage-live-dot' }),
      'LIVE 무대'
    );

    const titleEl = el('h2', { class: 'stage-event-title', text: session.eventTitle || '2026 아카라카 공연' });
    const metaEl = el('div', { class: 'stage-event-meta', text: `📅 ${session.date || ''} · 📍 ${session.venue || '공연 무대'}` });

    const titleRow = el('div', { class: 'stage-event-title-wrap' },
      titleEl,
      button('✏️', () => {
        promptStagePassword({
          actionName: '행사명 및 셋리스트 편집',
          onSuccess: () => {
            openSetlistEditModal({
              session,
              songs,
              onSaveSession: (updated) => {
                Object.assign(session, updated);
                saveActiveStageSession(session);
                if (activeIndex >= session.songs.length) {
                  activeIndex = Math.max(0, session.songs.length - 1);
                  session.currentIndex = activeIndex;
                }
                renderAll();
              }
            });
          }
        });
      }, 'text-button', null, { title: '행사명 및 셋리스트 편집' })
    );

    const modeFocusBtn = button('🎤 1곡 집중', () => {
      if (liveMode === 'focus') return;
      stopPitch(true);
      liveMode = 'focus';
      try { localStorage.setItem('acaroom_stage_live_submode', 'focus'); } catch {}
      renderAll();
    }, `stage-mode-btn${liveMode === 'focus' ? ' active' : ''}`, null, { role: 'radio', 'aria-checked': String(liveMode === 'focus'), title: '1곡씩 크게 조율하며 진행하는 실전 무대 모드' });

    const modeOverviewBtn = button('📋 전체 목록', () => {
      if (liveMode === 'overview') return;
      stopPitch(true);
      liveMode = 'overview';
      try { localStorage.setItem('acaroom_stage_live_submode', 'overview'); } catch {}
      renderAll();
    }, `stage-mode-btn${liveMode === 'overview' ? ' active' : ''}`, null, { role: 'radio', 'aria-checked': String(liveMode === 'overview'), title: '전체 셋리스트와 파트별 첫 음을 한눈에 보는 큐시트 목록' });

    const modeSwitcher = el('div', { class: 'stage-live-mode-switch', role: 'radiogroup', 'aria-label': '큐시트 보기 방식' },
      modeFocusBtn, modeOverviewBtn
    );

    const headerLeft = el('div', { class: 'stage-header-left' },
      el('div', { class: 'stage-live-badge-row' }, liveBadge, wakeLockBtn, modeSwitcher),
      titleRow,
      metaEl
    );

    const copyBtn = button('📋 셋리스트 복사', copyFullSetlist, 'button secondary small', null, { title: '단원 공지용 전체 셋리스트 텍스트 복사' });

    const historyBtn = button('📜 공연 히스토리', () => {
      openStageHistoryModal({
        songs,
        onSelectSession: (selected) => {
          saveActiveStageSession(selected);
          renderStageLiveView({ container, songs, navigate, onSwitchView });
        }
      });
    }, 'button secondary small', null, { title: '역대 공연 셋리스트 보관함 열기' });

    const editBtn = button('⚙️ 셋리스트 편집', () => {
      promptStagePassword({
        actionName: '셋리스트 편집',
        onSuccess: () => {
          openSetlistEditModal({
            session,
            songs,
            onSaveSession: (updated) => {
              Object.assign(session, updated);
              saveActiveStageSession(session);
              if (activeIndex >= session.songs.length) {
                activeIndex = Math.max(0, session.songs.length - 1);
                session.currentIndex = activeIndex;
              }
              renderAll();
            }
          });
        }
      });
    }, 'button secondary small', null, { title: '곡 순서 변경 및 추가/삭제' });

    const archiveBtn = button('🎬 무대 영상', () => {
      if (typeof onSwitchView === 'function') onSwitchView('list');
    }, 'button secondary small', null, { title: '아카라카 실황 영상 아카이브로 전환' });

    fullscreenBtn = button('⛶', () => {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFs) {
        if (shell.requestFullscreen) {
          shell.requestFullscreen().catch(() => {});
        } else if (shell.webkitRequestFullscreen) {
          shell.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    }, 'button secondary small icon-only', null, { title: '전체화면 전환', 'aria-label': '전체화면' });

    const actions = el('div', { class: 'stage-header-actions' }, copyBtn, historyBtn, editBtn, archiveBtn, fullscreenBtn);

    header.replaceChildren(headerLeft, actions);
  }

  function renderSetlistBar() {
    setlistBar.replaceChildren();
    session.songs.forEach((item, idx) => {
      const isCur = idx === activeIndex;
      const isDone = idx < activeIndex;
      const chip = button(
        `${idx + 1}. ${item.title}${item.note ? ` (${item.note})` : ''}`,
        () => {
          stopPitch(true);
          activeIndex = idx;
          session.currentIndex = activeIndex;
          saveActiveStageSession(session);
          renderCurrentSong();
        },
        `stage-chip-btn${isCur ? ' active' : ''}${isDone ? ' completed' : ''}`,
        isDone ? 'check' : null,
        {
          role: 'tab',
          'aria-selected': String(isCur),
          title: `${idx + 1}번째 곡으로 이동`
        }
      );
      setlistBar.append(chip);
      if (isCur) {
        // Active chip이 잘 보이게 자동 스크롤
        setTimeout(() => {
          chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 50);
      }
    });
  }

  function getCurrentSongData() {
    const item = session.songs[activeIndex];
    if (!item) return null;
    return songs.find(s => s.id === item.songId) || {
      id: item.songId,
      title: item.title,
      artist: '아카라카',
      category: '아카펠라',
      arrangement: '다성부',
      startingPitches: null
    };
  }

  let playAllBtn;
  let partButtons = [];

  function updatePitchPlayingUI(playing) {
    if (!playAllBtn) return;
    const isPlaying = isPitchSequencePlaying() || Boolean(playing);
    playAllBtn.classList.toggle('playing', isPlaying);
    playAllBtn.textContent = isPlaying ? '⏹ 첫 음 재생 멈추기' : '▶ 첫 음 전체 듣기 (아르페지오 + 화음)';

    partButtons.forEach(({ btn, part, noteStr }) => {
      if (!playing) {
        btn.classList.remove('active');
      } else if (playing.isChord) {
        btn.classList.add('active');
      } else if (playing.part) {
        btn.classList.toggle('active', playing.part === part);
      } else {
        const isMatch = playing.displayNote === noteStr || playing.note === noteStr;
        btn.classList.toggle('active', Boolean(isMatch));
      }
    });
  }

  function renderHero(songData, item) {
    const keyStr = songData?.musicalKey || songData?.startingPitches?.key;
    const title = `${activeIndex + 1}. ${songData ? songData.title : (item?.title || '곡명 미지정')}`;
    const artistArrangement = `${songData?.artist || '아카라카'} · ${songData?.arrangement || '혼성 아카펠라'}`;

    const badges = el('div', { class: 'stage-hero-meta-row' },
      el('span', { class: 'stage-hero-badge', text: `진행: ${activeIndex + 1} / ${session.songs.length} 곡` }),
      songData?.category ? el('span', { class: 'stage-hero-badge', text: songData.category }) : null,
      keyStr ? el('span', { class: 'stage-hero-badge', text: `조성: ${keyStr}` }) : null,
      item?.note ? el('span', { class: 'stage-hero-badge', style: 'background: rgba(234, 179, 8, 0.2); color: #fde047;', text: item.note }) : null
    );

    const titleEl = el('h3', { class: 'stage-hero-title', text: title });
    const artistEl = el('p', { class: 'stage-hero-artist', text: artistArrangement });

    heroCard.replaceChildren(badges, titleEl, artistEl);
  }

  function renderPitchCard(songData) {
    partButtons = [];
    const pitchEntries = getSongStartingPitchEntries(songData);

    const header = el('div', { class: 'stage-pitch-header' },
      el('div', { class: 'stage-pitch-title' },
        icon('music'),
        '파트별 첫 음 조율'
      ),
      button('정지 ⏹', () => {
        stopPitch(true);
        updatePitchPlayingUI(null);
      }, 'text-button', null, { title: '소리 즉시 멈추기' })
    );

    playAllBtn = button('▶ 첫 음 전체 듣기 (아르페지오 + 화음)', () => {
      if (isPitchSequencePlaying()) {
        stopPitchSequence();
        updatePitchPlayingUI(null);
        return;
      }

      if (!pitchEntries.length) {
        toast('이 곡의 첫 음 정보가 등록되어 있지 않습니다.');
        return;
      }

      // Convert pitch entries to notes array for playPitchSequence
      const noteItems = pitchEntries.map(([part, noteStr]) => ({
        part,
        noteStr,
        parsed: parseNoteString(noteStr),
        label: `${part.toUpperCase()}: ${noteStr}`
      })).filter(it => it.parsed);

      playPitchSequence(noteItems, {
        noteDuration: 900,
        gapDuration: 160,
        chordDuration: 2800,
        onStep: (step) => {
          if (step.type === 'note' && step.item) {
            updatePitchPlayingUI({ ...step.item.parsed, part: step.item.part });
          } else if (step.type === 'chord') {
            updatePitchPlayingUI({ isChord: true });
          } else if (step.type === 'finish') {
            updatePitchPlayingUI(null);
          }
        }
      });
      updatePitchPlayingUI({ isPlaying: true });
    }, 'stage-pitch-play-all-btn');

    const grid = el('div', { class: 'stage-pitch-parts-grid' });

    if (pitchEntries.length === 0) {
      grid.append(el('p', { style: 'color: #94a3b8; font-size: 13px;', text: '등록된 첫 음이 없습니다.' }));
    } else {
      const partLabels = {
        soprano: 'SOPRANO',
        alto: 'ALTO',
        tenor: 'TENOR',
        baritone: 'BARITONE',
        bass: 'BASS',
        lead: 'LEAD',
        vp: 'VP',
        part1: '1번 파트',
        part2: '2번 파트',
        part3: '3번 파트',
        part4: '4번 파트',
        part5: '5번 파트',
        part6: '6번 파트',
        part7: '7번 파트'
      };

      pitchEntries.forEach(([part, noteStr]) => {
        const parsed = parseNoteString(noteStr);
        const partName = partLabels[part] || part.toUpperCase();
        const displayNote = parsed ? parsed.displayNote : noteStr;
        const koreanNote = parsed ? parsed.koreanNote : '';

        const partBtn = el('button', {
          type: 'button',
          class: 'stage-part-sound-btn',
          'aria-label': `${partName} 파트 첫 음 ${displayNote} (${koreanNote}) 재생`,
          onclick: () => {
            if (parsed) {
              if (isPitchSequencePlaying()) {
                stopPitchSequence();
              }
              playPitch(parsed.semitone, parsed.octave, 0.6);
            }
          }
        },
          el('span', { class: 'stage-part-name', text: partName }),
          el('span', { class: 'stage-part-note', text: displayNote }),
          koreanNote ? el('span', { style: 'font-size: 11px; opacity: 0.85;', text: koreanNote }) : null
        );

        partButtons.push({ btn: partBtn, part, noteStr: displayNote });
        grid.append(partBtn);
      });
    }

    pitchCard.replaceChildren(header, playAllBtn, grid);
  }

  function renderMCCard(songData) {
    const header = el('div', { class: 'stage-mc-header' });
    const title = el('div', { class: 'stage-mc-title' },
      icon('mic'),
      'AI 곡소개 멘트 추천'
    );

    const item = session.songs[activeIndex];
    if (item && item.commentTone) {
      currentTone = item.commentTone;
    }

    const toneBtns = [
      ['wit', '💡 유쾌/위트'],
      ['story', '✨ 감성/스토리'],
      ['brief', '⚡ 초간단']
    ].map(([toneKey, label]) => {
      return button(label, () => {
        currentTone = toneKey;
        if (item) {
          item.commentTone = toneKey;
          saveActiveStageSession(session);
        }
        renderMCCard(songData);
      }, `stage-tone-btn${currentTone === toneKey ? ' active' : ''}`);
    });

    const toneTabs = el('div', { class: 'stage-tone-tabs' }, ...toneBtns);
    header.append(title, toneTabs);

    const savedCommentKey = `${songData?.id || activeIndex}_${currentTone}`;
    const commentText = (item && item.customComment) || customComments[savedCommentKey] || generateDynamicMCComment(songData, currentTone);

    const bubble = el('div', {
      class: 'stage-speech-bubble',
      contenteditable: 'true',
      spellcheck: 'false',
      title: '클릭하여 직접 멘트를 수정할 수 있습니다',
      oninput: (e) => {
        const val = e.target.textContent;
        customComments[savedCommentKey] = val;
        if (item) {
          item.customComment = val;
          saveActiveStageSession(session);
        }
      }
    }, commentText);

    const copyBtn = button('📋 멘트 복사', async () => {
      const text = bubble.textContent.trim();
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {}
      }
      if (!copied) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          copied = true;
        } catch {}
      }
      toast(copied ? '곡소개 멘트가 복사되었습니다!' : '멘트 복사를 지원하지 않는 브라우저입니다.');
    }, 'button secondary small', null, { title: '클립보드에 복사' });

    const regenerateBtn = button('🔄 다른 추천', () => {
      const variations = [
        generateDynamicMCComment(songData, currentTone),
        `“이어서 들려드릴 곡은 ${songData?.title || '아카펠라 곡'}입니다. 각 파트의 숨소리까지 하나가 되는 무대를 함께 만끽해 보세요!”`,
        `“관객 여러분과 함께하는 특별한 순간, ${songData?.artist ? `${songData.artist}의 ` : ''}'${songData?.title}' 하모니 속으로 초대합니다.”`
      ];
      const cur = bubble.textContent;
      const next = variations.find(v => v !== cur) || variations[0];
      bubble.textContent = next;
      customComments[savedCommentKey] = next;
      if (item) {
        item.customComment = next;
        saveActiveStageSession(session);
      }
      toast('새로운 추천 멘트로 변경되었습니다.');
    }, 'button secondary small', null, { title: '다른 멘트 제안' });

    const actions = el('div', { class: 'stage-mc-actions' }, copyBtn, regenerateBtn);

    mcCard.replaceChildren(header, bubble, actions);
  }

  function renderNavBar() {
    const isFirst = activeIndex === 0;
    const isLast = activeIndex >= session.songs.length - 1;

    const prevBtn = button('◀ 이전 곡', () => {
      if (activeIndex > 0) {
        stopPitch(true);
        activeIndex--;
        session.currentIndex = activeIndex;
        saveActiveStageSession(session);
        renderCurrentSong();
      }
    }, 'stage-nav-btn prev', null, { disabled: isFirst, title: '이전 곡으로 돌아가기' });

    let nextBtn;
    if (isLast) {
      nextBtn = button('🏁 공연 완료 및 기록 저장', () => {
        stopPitch(true);
        session.updatedAt = Date.now();
        saveActiveStageSession(session);
        toast('🎉 멋진 공연 수고하셨습니다! 이번 공연 기록이 히스토리에 안전하게 저장되었습니다.');
      }, 'stage-nav-btn next', null, { title: '공연 셋리스트를 히스토리에 최종 보관합니다' });
    } else {
      nextBtn = button('다음 곡 진행 ▷', () => {
        stopPitch(true);
        activeIndex++;
        session.currentIndex = activeIndex;
        saveActiveStageSession(session);
        renderCurrentSong();
      }, 'stage-nav-btn next', null, { title: '다음 순서 곡으로 이동' });
    }

    navBar.replaceChildren(prevBtn, nextBtn);
  }

  function renderCurrentSong() {
    if (!session.songs || session.songs.length === 0) {
      setlistBar.replaceChildren();
      heroCard.replaceChildren(
        el('h3', { class: 'stage-hero-title', text: '등록된 셋리스트 곡이 없습니다' }),
        el('p', { class: 'stage-hero-artist', text: '상단의 [⚙️ 셋리스트 편집] 버튼을 눌러 공연 곡들을 추가해 주세요.' })
      );
      pitchCard.replaceChildren();
      mcCard.replaceChildren();
      navBar.replaceChildren(
        button('⚙️ 셋리스트 편집하기', () => {
          promptStagePassword({
            actionName: '셋리스트 편집',
            onSuccess: () => {
              openSetlistEditModal({
                session,
                songs,
                onSaveSession: (updated) => {
                  saveActiveStageSession(updated);
                  renderAll();
                }
              });
            }
          });
        }, 'stage-nav-btn next')
      );
      return;
    }
    const item = session.songs[activeIndex] || session.songs[0];
    const songData = getCurrentSongData();
    renderSetlistBar();
    renderHero(songData, item);
    renderPitchCard(songData);
    renderMCCard(songData);
    renderNavBar();
  }

  function copyFullSetlist() {
    const lines = [
      `[ACARACA 공연 큐시트]`,
      `행사명: ${session.eventTitle || '아카라카 공연'}`,
      `일시: ${session.date || ''} · 장소: ${session.venue || '공연장'}`,
      `총 ${session.songs.length}곡 레퍼토리`,
      ``,
      ...session.songs.map((item, i) => {
        const sd = songs.find(x => x.id === item.songId);
        const key = sd?.musicalKey || sd?.startingPitches?.key ? ` (Key: ${sd.musicalKey || sd.startingPitches.key})` : '';
        const note = item.note ? ` - ${item.note}` : '';
        return `${i + 1}. ${item.title}${key}${note}`;
      }),
      ``,
      `* AcaRaca 아카펠라 무대 큐시트`
    ];
    const text = lines.join('\n');
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast('전체 셋리스트가 클립보드에 복사되었습니다! (카톡 공지용)');
      }).catch(() => {});
      copied = true;
    }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('전체 셋리스트가 클립보드에 복사되었습니다! (카톡 공지용)');
      } catch {
        toast('클립보드 복사를 지원하지 않는 브라우저입니다.');
      }
    }
  }

  function renderOverviewView() {
    overviewViewArea.replaceChildren();

    const topBar = el('div', { class: 'stage-overview-top-bar' },
      el('div', { class: 'stage-overview-top-left' },
        el('span', { class: 'stage-hero-badge', text: `총 ${session.songs.length}곡 레퍼토리` }),
        el('span', { class: 'stage-overview-hint-text', text: '곡을 누르면 1곡 집중 모드로 이동하며, 첫 음 배지를 누르면 조율음을 듣습니다.' })
      ),
      el('div', { class: 'stage-overview-top-actions' },
        button('📋 셋리스트 텍스트 복사', copyFullSetlist, 'button secondary small', 'copy', { title: '단원 공유용 텍스트 복사' })
      )
    );

    if (!session.songs || session.songs.length === 0) {
      overviewViewArea.append(
        topBar,
        el('div', { style: 'text-align: center; color: #94a3b8; padding: 40px 20px;' },
          el('p', { text: '등록된 셋리스트 곡이 없습니다. 상단 [⚙️ 셋리스트 편집] 버튼을 눌러 곡을 추가해 주세요.' })
        )
      );
      return;
    }

    const list = el('div', { class: 'stage-overview-list' });

    session.songs.forEach((item, idx) => {
      const isCur = idx === activeIndex;
      const songData = songs.find(s => s.id === item.songId) || {
        id: item.songId,
        title: item.title,
        artist: '아카라카',
        category: '아카펠라',
        arrangement: '다성부',
        startingPitches: null
      };
      const keyStr = songData?.musicalKey || songData?.startingPitches?.key;
      const pitchEntries = getSongStartingPitchEntries(songData);

      const savedCommentKey = `${session.id}_${item.songId}`;
      const mcComment = item.customComment || customComments[savedCommentKey] || (STAGE_AI_COMMENTS[item.songId] && STAGE_AI_COMMENTS[item.songId][item.commentTone || 'story']) || generateDynamicMCComment(songData, item.commentTone || 'story');

      const card = el('article', {
        class: `stage-overview-card${isCur ? ' is-current' : ''}`,
        'aria-current': isCur ? 'true' : null
      });

      const numBadge = el('div', { class: 'stage-overview-num-badge', text: String(idx + 1) });
      const songTitle = el('h4', {
        class: 'stage-overview-song-title',
        text: item.title,
        title: `${item.title} 1곡 집중 모드로 보기`,
        onclick: () => {
          stopPitch(true);
          activeIndex = idx;
          session.currentIndex = activeIndex;
          saveActiveStageSession(session);
          liveMode = 'focus';
          try { localStorage.setItem('acaroom_stage_live_submode', 'focus'); } catch {}
          renderAll();
        }
      });
      const songMeta = el('p', {
        class: 'stage-overview-song-meta',
        text: `${songData.artist || '아카라카'} · ${songData.arrangement || '혼성 아카펠라'}`
      });

      const titleRow = el('div', { class: 'stage-overview-title-row' },
        songTitle,
        keyStr ? el('span', { class: 'stage-key-badge', text: `Key: ${keyStr}` }) : null,
        item.note ? el('span', { class: 'stage-hero-badge', style: 'background: rgba(234, 179, 8, 0.2); color: #fde047;', text: item.note }) : null,
        isCur ? el('span', { class: 'stage-current-badge', text: '현재 진행곡' }) : null
      );

      const leftWrap = el('div', { class: 'stage-overview-card-left' },
        numBadge,
        el('div', { class: 'stage-overview-title-wrap' }, titleRow, songMeta)
      );

      const focusBtn = button('🎤 1곡 집중 보기', () => {
        stopPitch(true);
        activeIndex = idx;
        session.currentIndex = activeIndex;
        saveActiveStageSession(session);
        liveMode = 'focus';
        try { localStorage.setItem('acaroom_stage_live_submode', 'focus'); } catch {}
        renderAll();
      }, isCur ? 'button primary small' : 'button secondary small', null, { title: `${idx + 1}번 곡 집중 모드로 전환` });

      const cardHeader = el('div', { class: 'stage-overview-card-header' }, leftWrap, focusBtn);

      const pitchChipsWrap = el('div', { class: 'stage-overview-pitch-chips' });
      if (pitchEntries.length === 0) {
        pitchChipsWrap.append(el('span', { style: 'font-size: 11.5px; color: #94a3b8;', text: '첫 음 정보 없음' }));
      } else {
        const shortLabels = {
          soprano: 'S', alto: 'A', tenor: 'T', baritone: 'Bar', bass: 'B', lead: 'Lead', vp: 'VP',
          part1: 'P1', part2: 'P2', part3: 'P3', part4: 'P4', part5: 'P5', part6: 'P6', part7: 'P7'
        };

        pitchEntries.forEach(([part, noteStr]) => {
          const parsed = parseNoteString(noteStr);
          const shortPart = shortLabels[part] || part.toUpperCase().slice(0, 3);
          const displayNote = parsed ? parsed.displayNote : noteStr;

          const chip = el('button', {
            type: 'button',
            class: 'stage-overview-pitch-chip',
            title: `${part} 첫 음 ${displayNote} 재생`,
            onclick: (e) => {
              e.stopPropagation();
              if (parsed) {
                stopPitch(true);
                playPitch(parsed.semitone, parsed.octave, 0.6);
                chip.classList.add('playing');
                setTimeout(() => chip.classList.remove('playing'), 800);
              }
            }
          },
            el('strong', { text: shortPart }),
            document.createTextNode(` ${displayNote}`)
          );
          pitchChipsWrap.append(chip);
        });
      }

      let chordBtn = null;
      if (pitchEntries.length > 0) {
        const notesList = pitchEntries.map(([, noteStr]) => noteStr);
        chordBtn = button('🔊 전체 화음', (e) => {
          e.stopPropagation();
          const isPlaying = playChordStrings(notesList, 0.4);
          if (chordBtn) chordBtn.classList.toggle('playing', Boolean(isPlaying));
        }, 'stage-overview-chord-btn', null, { title: '이 곡의 전체 파트 시작 화음 동시 재생' });
      }

      const pitchBar = el('div', { class: 'stage-overview-pitch-bar' },
        el('span', { class: 'stage-overview-pitch-label' }, icon('music'), document.createTextNode('첫 음')),
        pitchChipsWrap,
        chordBtn
      );

      const mcBox = el('div', { class: 'stage-overview-mc-box' },
        icon('mic'),
        el('span', { text: mcComment })
      );

      card.append(cardHeader, pitchBar, mcBox);
      list.append(card);
    });

    overviewViewArea.append(topBar, list);
  }

  function updateLiveModeDisplay() {
    const isFocus = liveMode === 'focus';
    focusViewArea.hidden = !isFocus;
    overviewViewArea.hidden = isFocus;

    if (isFocus) {
      renderCurrentSong();
    } else {
      renderOverviewView();
    }
  }

  function renderAll() {
    renderHeader();
    updateLiveModeDisplay();
  }

  renderAll();

  activeStageLiveCleanup = () => {
    unsubscribePitch();
    stopPitch(true);
    releaseWakeLock();
    window.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('fullscreenchange', updateFsBtn);
    document.removeEventListener('webkitfullscreenchange', updateFsBtn);
  };

  return activeStageLiveCleanup;
}

/**
 * 활성 무대 뷰의 리스너 및 오디오 정지 정리
 */
export function cleanupStageLive() {
  if (typeof activeStageLiveCleanup === 'function') {
    activeStageLiveCleanup();
    activeStageLiveCleanup = null;
  }
}

/**
 * 공연 히스토리 & 보관함 모달 (최신순 정렬)
 */
export function openStageHistoryModal({ songs, onSelectSession }) {
  const existing = document.getElementById('stage-history-dialog');
  if (existing) existing.remove();

  const dialog = el('dialog', {
    id: 'stage-history-dialog',
    class: 'stage-modal-dialog',
    'aria-labelledby': 'stage-history-modal-title'
  });

  const header = el('div', { class: 'stage-modal-header' },
    el('div', {},
      el('h3', { id: 'stage-history-modal-title', text: '📜 공연 히스토리 & 셋리스트 보관함' }),
      el('p', { style: 'font-size: 13px; color: var(--muted); margin-top: 4px;', text: '최신 공연이 항상 상단에 표시됩니다. 과거 공연 셋리스트를 불러와 무대를 시작할 수 있습니다.' })
    ),
    button('✕', () => dialog.close(), 'icon-button', null, { 'aria-label': '닫기' })
  );

  const newBtn = button('+ 새 공연 셋리스트 만들기', () => {
    promptStagePassword({
      actionName: '새 공연 셋리스트 생성',
      onSuccess: () => {
        const newSession = createNewStageSession('새 아카라카 공연');
        dialog.close();
        if (typeof onSelectSession === 'function') onSelectSession(newSession);
      }
    });
  }, 'button primary small');

  const topBar = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;' },
    el('strong', { text: '역대 공연 목록' }),
    newBtn
  );

  const historyContainer = el('div', { class: 'stage-history-list' });

  function renderHistoryCards() {
    historyContainer.replaceChildren();
    const history = getStageHistory();

    if (!history.length) {
      historyContainer.append(el('p', { style: 'text-align: center; color: var(--muted); padding: 30px;', text: '저장된 공연 히스토리가 없습니다.' }));
      return;
    }

    history.forEach((item) => {
      const card = el('article', { class: 'stage-history-card' });

      const top = el('div', { class: 'stage-history-top' },
        el('div', {},
          el('h4', { class: 'stage-history-title', text: item.eventTitle || '아카라카 공연' }),
          el('div', { class: 'stage-history-date', text: `📅 ${item.date || ''} · 📍 ${item.venue || '공연장'}` })
        ),
        el('span', { class: 'stage-hero-badge', text: `${item.songs?.length || 0}곡` })
      );

      const songsRow = el('div', { class: 'stage-history-songs-row' },
        (item.songs || []).map((s, i) => el('span', { class: 'stage-history-song-tag', text: `${i + 1}. ${s.title}` }))
      );

      const loadBtn = button('무대 큐시트 시작', () => {
        dialog.close();
        if (typeof onSelectSession === 'function') onSelectSession(item);
      }, 'button primary small', 'play');

      const cloneBtn = button('📋 복제', () => {
        promptStagePassword({
          actionName: `'${item.eventTitle}' 셋리스트 복제`,
          onSuccess: () => {
            const cloned = JSON.parse(JSON.stringify(item));
            cloned.id = `stage-${Date.now()}`;
            cloned.eventTitle = `${item.eventTitle} (복사본)`;
            cloned.date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
            cloned.updatedAt = Date.now();
            const currentHist = getStageHistory();
            saveStageHistory([cloned, ...currentHist]);
            toast('셋리스트가 복제되었습니다.');
            renderHistoryCards();
          }
        });
      }, 'button secondary small');

      const deleteBtn = button('🗑️', () => {
        promptStagePassword({
          actionName: `'${item.eventTitle}' 공연 기록 삭제`,
          onSuccess: () => {
            if (confirm(`'${item.eventTitle}' 공연 기록을 완전히 삭제하시겠습니까?`)) {
              deleteStageHistoryItem(item.id);
              toast('공연 기록이 삭제되었습니다.');
              renderHistoryCards();
            }
          }
        });
      }, 'button secondary small icon-only', null, { title: '공연 기록 삭제' });

      const actions = el('div', { class: 'stage-history-actions' }, deleteBtn, cloneBtn, loadBtn);

      card.append(top, songsRow, actions);
      historyContainer.append(card);
    });
  }

  renderHistoryCards();

  const body = el('div', { class: 'stage-modal-body' }, topBar, historyContainer);
  dialog.append(header, body);

  dialog.addEventListener('close', () => {
    dialog.remove();
  });

  document.body.append(dialog);
  dialog.showModal();
}

/**
 * 셋리스트 편집 및 공연 정보 설정 모달
 */
export function openSetlistEditModal({ session, songs, onSaveSession }) {
  const existing = document.getElementById('stage-setlist-dialog');
  if (existing) existing.remove();

  const draft = JSON.parse(JSON.stringify(session));

  const dialog = el('dialog', {
    id: 'stage-setlist-dialog',
    class: 'stage-modal-dialog',
    'aria-labelledby': 'stage-setlist-modal-title'
  });

  const header = el('div', { class: 'stage-modal-header' },
    el('h3', { id: 'stage-setlist-modal-title', text: '⚙️ 셋리스트 편집 및 공연 정보' }),
    button('✕', () => dialog.close(), 'icon-button', null, { 'aria-label': '닫기' })
  );

  // Form Fields
  const preventEnter = (e) => { if (e.key === 'Enter') e.preventDefault(); };
  const titleInput = el('input', { type: 'text', class: 'search-input', value: draft.eventTitle || '', placeholder: '공연/행사 이름', onkeydown: preventEnter });
  const dateInput = el('input', { type: 'text', class: 'search-input', value: draft.date || '', placeholder: '공연 일자 (예: 2026.10.12)', onkeydown: preventEnter });
  const venueInput = el('input', { type: 'text', class: 'search-input', value: draft.venue || '', placeholder: '공연 장소 (예: 백양콘서트홀)', onkeydown: preventEnter });

  const fieldsGrid = el('div', { class: 'stage-edit-fields-grid' },
    el('label', { style: 'display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600;' }, '행사 이름', titleInput),
    el('label', { style: 'display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600;' }, '공연 일자', dateInput),
    el('label', { style: 'display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; grid-column: span 2;' }, '공연 장소', venueInput)
  );

  // Song Adder Dropdown
  const songSelect = el('select', { class: 'search-input', style: 'flex: 1;' },
    songs.map(s => el('option', { value: s.id, text: `${s.title} (${s.arrangement || s.category || ''})` }))
  );

  const addSongBtn = button('+ 곡 추가', () => {
    const selectedId = songSelect.value;
    const selectedSong = songs.find(s => s.id === selectedId);
    if (selectedSong) {
      draft.songs.push({
        songId: selectedSong.id,
        title: selectedSong.title,
        note: '',
        commentTone: 'story'
      });
      renderSongList();
    }
  }, 'button secondary small');

  const addRow = el('div', { style: 'display: flex; gap: 8px; margin: 12px 0;' }, songSelect, addSongBtn);

  // Songs list
  const listContainer = el('div', { class: 'stage-edit-list' });

  function renderSongList() {
    listContainer.replaceChildren();
    if (!draft.songs.length) {
      listContainer.append(el('p', { style: 'color: var(--muted); text-align: center; padding: 20px;', text: '등록된 곡이 없습니다. 위에서 곡을 추가해 주세요.' }));
      return;
    }

    draft.songs.forEach((s, idx) => {
      const row = el('div', { class: 'stage-edit-item' });

      const left = el('div', { class: 'stage-edit-item-left' },
        el('span', { class: 'stage-edit-num', text: `${idx + 1}` }),
        el('span', { class: 'stage-edit-name', text: s.title })
      );

      const noteInput = el('input', {
        type: 'text',
        class: 'search-input small',
        placeholder: '메모 (오프닝, 앙코르 등)',
        value: s.note || '',
        style: 'max-width: 140px; padding: 4px 8px; font-size: 12px;',
        oninput: (e) => { s.note = e.target.value; }
      });

      const upBtn = button('▲', () => {
        if (idx > 0) {
          const temp = draft.songs[idx - 1];
          draft.songs[idx - 1] = draft.songs[idx];
          draft.songs[idx] = temp;
          renderSongList();
        }
      }, 'button secondary small icon-only', null, { disabled: idx === 0, title: '위로 이동' });

      const downBtn = button('▼', () => {
        if (idx < draft.songs.length - 1) {
          const temp = draft.songs[idx + 1];
          draft.songs[idx + 1] = draft.songs[idx];
          draft.songs[idx] = temp;
          renderSongList();
        }
      }, 'button secondary small icon-only', null, { disabled: idx === draft.songs.length - 1, title: '아래로 이동' });

      const delBtn = button('🗑️', () => {
        draft.songs.splice(idx, 1);
        renderSongList();
      }, 'button secondary small icon-only danger', null, { title: '이 곡 삭제' });

      const actions = el('div', { class: 'stage-edit-actions' }, noteInput, upBtn, downBtn, delBtn);

      row.append(left, actions);
      listContainer.append(row);
    });
  }

  renderSongList();

  const footerActions = el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;' },
    button('취소', () => dialog.close(), 'button secondary small'),
    button('저장 및 큐시트 적용', () => {
      draft.eventTitle = titleInput.value.trim() || '아카라카 공연';
      draft.date = dateInput.value.trim();
      draft.venue = venueInput.value.trim();
      draft.currentIndex = Math.max(0, Math.min(draft.currentIndex || 0, Math.max(0, draft.songs.length - 1)));
      dialog.close();
      if (typeof onSaveSession === 'function') onSaveSession(draft);
      toast('셋리스트가 저장되었습니다.');
    }, 'button primary small')
  );

  const body = el('div', { class: 'stage-modal-body' },
    fieldsGrid,
    el('strong', { text: '곡 순서 셋리스트 (순서 변경 / 삭제)' }),
    addRow,
    listContainer,
    footerActions
  );

  dialog.append(header, body);

  dialog.addEventListener('close', () => {
    dialog.remove();
  });

  document.body.append(dialog);
  dialog.showModal();
}
