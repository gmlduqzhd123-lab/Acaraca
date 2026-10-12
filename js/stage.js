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
  subscribePitchState,
  getCurrentPlaying
} from './pitch.js';
import { requestWakeLock, releaseWakeLock, isWakeLockActive } from './backgroundPlay.js';
import { createPlayer } from './player.js';

export const STAGE_HISTORY_KEY = 'acaroom_stage_history_v2';
export const STAGE_ACTIVE_KEY = 'acaroom_stage_active_v2';
export const STAGE_DELETED_KEY = 'acaroom_stage_deleted_ids_v1';

/**
 * 33개 전 곡에 대한 고품질 AI 추천 멘트 데이터베이스 (유쾌/위트, 감성/스토리, 초간단)
 */
export const STAGE_AI_COMMENTS = {
  'bohemian-rhapsody-5': {
    wit: `“드디어 올 것이 왔습니다! 퀸의 전설적인 명곡,\n목소리 다섯 개로 오페라와 록을 넘나드는 기적을 확인해 보세요!”`,
    story: `“자유와 방황, 오페라와 하드록이 교차하는 불후의 명작 '보헤미안 랩소디'입니다.\n악기 하나 없이 오직 다섯 명의 숨소리와 하모니로 무대를 웅장하게 채웁니다.”`,
    brief: `“다섯 성부의 다채로운 음색으로 재해석한 퀸의 명곡,\n'보헤미안 랩소디' 5인용 버전입니다.”`
  },
  'bohemian-rhapsody-6': {
    wit: `“펜타토닉스 버전으로 꽉 채운 6인 보헤미안 랩소디!\n입으로 연주하는 드럼 비트와 심장을 울리는 서브 베이스에 주목해 주세요!”`,
    story: `“현대 아카펠라의 정수를 보여주는 펜타토닉스의 편곡입니다.\n화려한 보컬 퍼커션과 탄탄한 저음 위에 여섯 목소리의 하모니가 폭발합니다.”`,
    brief: `“보컬 퍼커션과 6성부의 역동적인 앙상블,\n'보헤미안 랩소디' 펜타토닉스 버전입니다.”`
  },
  'mujogeon': {
    wit: `“짜짜라 짜라짜라 짜짜짜! 오늘 무조건 박수 보내주실 거죠?\n아카펠라로 부르는 박상철의 '무조건', 신나게 달립니다!”`,
    story: `“지친 일상에 가장 유쾌하고 뜨거운 비타민이 되어줄 국민 애창곡 '무조건'입니다.\n다섯 목소리가 빚어내는 맛깔나는 트로트 하모니에 빠져보세요.”`,
    brief: `“관객 모두와 하나 되어 신나게 부르는 유쾌한 아카펠라,\n국민 트로트 '무조건'입니다.”`
  },
  'short-hair': {
    wit: `“그녀의 짧은 머리에 반했던 풋풋한 그 시절!\n복고풍 디스코 리듬을 아카펠라로 재현하니 어깨 들썩일 준비 되셨나요?”`,
    story: `“조용필 님의 대표 디스코 명곡 '단발머리'입니다.\n통통 튀는 베이스 라인과 산뜻한 화음으로 첫사랑의 설렘을 노래합니다.”`,
    brief: `“경쾌한 리듬과 산뜻한 보컬 앙상블이 돋보이는\n조용필의 '단발머리'입니다.”`
  },
  'disney-medley-7': {
    wit: `“디즈니 동산에 오신 것을 환영합니다!\n7명이 모여 디즈니 프린세스부터 사자왕까지 목소리로 전부 소환해 드립니다!”`,
    story: `“어린 시절 우리를 꿈꾸게 했던 디즈니 명곡들의 향연!\n7개 성부의 웅장하고 환상적인 하모니로 엮은 스페셜 메들리입니다.”`,
    brief: `“동화 같은 감동과 환상의 세계를 전하는\n7성부의 풍성한 '디즈니 메들리'입니다.”`
  },
  'disney-medley': {
    wit: `“꿈과 희망의 디즈니 세계로 함께 떠나볼까요?\n알라딘부터 라이온킹까지, 목소리로 떠나는 마법 같은 시간입니다!”`,
    story: `“세대를 넘어 사랑받는 디즈니 애니메이션의 명곡들,\n따뜻하고 영롱한 아카펠라 사운드로 추억을 선물합니다.”`,
    brief: `“추억과 감동을 노래하는 따스한 하모니,\n아카펠라 '디즈니 메들리'입니다.”`
  },
  'first-impression': {
    wit: `“첫인상이 너무 강렬하면 눈을 뗄 수 없죠!\n저희 목소리의 강렬한 첫인상에 푹 빠지실 준비 되셨나요?”`,
    story: `“김건모 님의 그루브 넘치는 명곡 '첫인상'입니다.\n세련된 재즈 하모니와 쫄깃한 리듬감을 목소리만으로 세밀하게 묘사합니다.”`,
    brief: `“세련된 그루브와 경쾌한 스윙감이 매력적인\n김건모의 '첫인상'입니다.”`
  },
  'tobacco-shop-girl': {
    wit: `“골목길 담배가게 아가씨에게 고백하려던 그 남자의 파란만장한 이야기!\n한 편의 유쾌한 뮤지컬처럼 펼쳐집니다!”`,
    story: `“송창식 님의 원곡을 유쾌한 드라마처럼 풀어낸 무대입니다.\n익살스러운 연기와 탄탄한 리듬이 어우러진 하모니를 즐겨보세요.”`,
    brief: `“유쾌한 스토리텔링과 박진감 넘치는 하모니,\n송창식의 '담배가게 아가씨'입니다.”`
  },
  'aloha': {
    wit: `“어두운 불빛 아래 촛불 하나~ 달콤한 고백의 밤!\n오늘 여러분과 저희의 무대를 로맨틱하게 밝혀드립니다.”`,
    story: `“가장 따뜻한 고백의 노래, '아로하'입니다.\n감미로운 보컬과 잔잔히 감싸 안는 화음이 무대에 로맨틱한 온기를 전합니다.”`,
    brief: `“달콤하고 포근한 사랑의 메시지,\n쿨과 조정석의 명곡 '아로하'입니다.”`
  },
  'tayo-pororo': {
    wit: `“노는 게 제일 좋아~ 친구들 모여라!\n어른들의 동심까지 완벽하게 소환하는 무대, 박수 칠 준비 됐나요?”`,
    story: `“대한민국 모든 아이들의 영원한 친구 뽀로로와 타요 메들리입니다.\n남녀노소 누구나 미소 짓게 만드는 발랄하고 사랑스러운 하모니를 선물합니다.”`,
    brief: `“신나고 귀여운 동심의 세계로 안내하는\n'타요 뽀로로 메들리'입니다.”`
  },
  'run-the-sky': {
    wit: `“목소리 하나로 저 높은 하늘 끝까지 날아오르는 기분!\n가슴 뻥 뚫릴 준비하시고 힘차게 소리 질러 볼까요?”`,
    story: `“이적 님의 파워풀한 록 명곡 '하늘을 달리다'입니다.\n벅차오르는 에너지와 층층이 쌓여 올라가는 고음 하모니가 카타르시스를 선사합니다.”`,
    brief: `“가슴이 뻥 뚫리는 시원한 질주와 폭발적인 에너지,\n이적의 '하늘을 달리다'입니다.”`
  },
  'speechless': {
    wit: `“더 이상 침묵하지 않겠다! 나오미 스콧의 폭발적인 가창력을\n아카펠라의 웅장한 코러스로 재현해 드립니다!”`,
    story: `“영화 '알라딘'에서 자스민 공주가 당당한 용기를 노래한 'Speechless'입니다.\n억압을 딛고 일어서는 강인한 메시지를 목소리의 웅장함으로 담아냈습니다.”`,
    brief: `“당당한 용기와 압도적인 감동을 선사하는\n알라딘 OST 'Speechless'입니다.”`
  },
  'in-your-arms': {
    wit: `“가을밤, 연인의 품속처럼 따뜻하고 포근하게 감싸 안아 드립니다.\n옆 사람 손을 슬며시 잡고 달콤한 하모니에 빠져보세요.”`,
    story: `“유재하 님의 불멸의 발라드 '그대 내 품에'입니다.\n별빛 아래 연인의 품에 안긴 듯 아련하고 깊은 서정을 아카펠라로 속삭입니다.”`,
    brief: `“서정적이고 아련한 화음으로 전하는\n유재하의 '그대 내 품에'입니다.”`
  },
  'well-done-today': {
    wit: `“오늘 하루도 정말 고생 많으셨습니다!\n여러분의 고단한 일상을 토닥여주는 따뜻한 노래 처방전입니다.”`,
    story: `“옥상달빛의 따뜻한 위로곡 '수고했어, 오늘도'입니다.\n세상을 다정하게 안아주는 부드러운 목소리가 지친 마음에 쉼표가 되어드립니다.”`,
    brief: `“지친 일상에 건네는 가장 다정한 토닥임,\n옥상달빛의 '수고했어 오늘도'입니다.”`
  },
  'daft-punk': {
    wit: `“이 소리가 진짜 사람 입에서 나는 소리냐고요? 네, 100% 생목소리입니다!\n펜타토닉스의 레전드 다프트 펑크 메들리를 만나보시죠!”`,
    story: `“일렉트로닉 댄스 음악의 거장 다프트 펑크의 히트곡들을 목소리로 완벽 구현했습니다.\n인간 목소리가 낼 수 있는 리듬의 한계에 도전하는 놀라운 무대입니다.”`,
    brief: `“입으로 연주하는 미래지향적 전자음악,\n펜타토닉스 스타일의 'Daft Punk'입니다.”`
  },
  'isnt-she-lovely': {
    wit: `“세상에 이렇게 사랑스러운 사람이 또 있을까요?\n바로 지금 저희 앞에 계신 관객 여러분 이야기입니다!”`,
    story: `“스티비 원더가 딸의 탄생을 기뻐하며 만든 소울풀한 명곡입니다.\n행복한 미소와 그루브가 절로 터져 나오는 밝고 경쾌한 하모니를 즐겨보세요.”`,
    brief: `“사랑스러움과 따뜻한 재즈 그루브가 가득한\n스티비 원더의 'Isn't She Lovely'입니다.”`
  },
  'lets-travel': {
    wit: `“메아리 소리가 들려오는 계곡을 찾아 여행을 떠나요!\n답답한 일상을 벗어나 신나게 박수 치며 달려볼까요?”`,
    story: `“조용필 님의 국민 여행송을 파워풀한 아카펠라로 부릅니다.\n가슴 뻥 뚫리는 시원한 에너지를 온몸으로 느껴보세요!”`,
    brief: `“신나는 여행의 설렘과 시원한 에너지를 전하는\n조용필의 '여행을 떠나요'입니다.”`
  },
  'love-song-medley': {
    wit: `“세상의 모든 달콤한 고백을 한 바구니에 담은 러브송 메들리!\n심장이 쿵쾅거리는 첫사랑의 설렘을 느껴보세요!”`,
    story: `“사랑의 시작부터 고백까지, 시대를 아우르는 대표 러브송 메들리입니다.\n한 편의 로맨틱 코미디처럼 펼쳐지는 달콤한 하모니에 빠져보세요.”`,
    brief: `“설렘 가득한 사랑의 순간들을 엮은\n달콤한 '러브송 메들리'입니다.”`
  },
  'l-o-v-e': {
    wit: `“L is for the way you look at me~ 관객 여러분과 사랑에 빠질 시간!\n스윙 리듬에 맞춰 가볍게 리듬을 타보세요!”`,
    story: `“냇 킹 콜의 불멸의 스탠다드 재즈 명곡 'L-O-V-E'입니다.\n부드러운 스윙 리듬과 풍성한 코러스가 클래식하고 고급스러운 분위기를 연출합니다.”`,
    brief: `“클래식하고 로맨틱한 재즈 스윙 하모니,\n냇 킹 콜의 'L-O-V-E'입니다.”`
  },
  'old-pop-medley': {
    wit: `“라디오 다이얼을 돌리던 그 시절 추억의 팝송들!\n입술이 먼저 가사를 기억하는 추억 여행으로 다 함께 떠나보시죠!”`,
    story: `“시대를 풍미했던 올드팝 명곡들을 모아 아카펠라 화음으로 재해석했습니다.\n특유의 빈티지하고 풍성한 화음이 전하는 따스한 낭만을 느껴보세요.”`,
    brief: `“추억과 낭만을 소환하는 감성 충만\n'올드팝 메들리'입니다.”`
  },
  'beautiful-world': {
    wit: `“이 세상이 아름다운 이유는 바로 저희 노래를 들어주시는 여러분 덕분입니다!\n서로를 향해 따뜻한 미소를 보내주세요!”`,
    story: `“박학기, 유리상자의 대표 명곡 '아름다운 세상'입니다.\n서로 다른 목소리가 하나로 어우러져 만들어내는 순수하고 맑은 감동을 전합니다.”`,
    brief: `“마음을 정화하는 따스하고 순수한 화음,\n'아름다운 세상'입니다.”`
  },
  'butterfly': {
    wit: `“국가대표가 된 기분으로 하늘 높이 날아오릅니다!\n나비처럼 힘찬 날갯짓을 시작하니 응원의 박수를 보내주세요!”`,
    story: `“영화 '국가대표'의 주제곡 러브홀릭스의 'Butterfly'입니다.\n날개를 펴고 비상하는 희망찬 메시지를 벅찬 하모니로 노래합니다.”`,
    brief: `“벅찬 감동과 찬란한 비상을 노래하는 대표 힐링송,\n'Butterfly'입니다.”`
  },
  'cherry-blossom-ending': {
    wit: `“봄바람 휘날리며 흩날리는 벚꽃 잎이~ 벚꽃 연금송의 귀환!\n목소리 버전으로 봄 향기를 물씬 풍겨드립니다!”`,
    story: `“버스커 버스커의 봄의 대명사 '벚꽃 엔딩'입니다.\n어쿠스틱한 감성과 설레는 봄의 기운을 아카펠라의 달콤한 화음으로 피워냅니다.”`,
    brief: `“설레는 봄날의 온기를 그대로 머금은\n감미로운 '벚꽃 엔딩'입니다.”`
  },
  'ditto': {
    wit: `“뉴진스의 힙한 감성을 아카펠라로? EXIT 스타일의 편곡!\n신비롭고 몽환적인 비트에 맞춰 고개를 흔들어보세요!”`,
    story: `“뉴진스의 글로벌 히트곡 'Ditto'를 그룹 EXIT의 감각적인 편곡으로 노래합니다.\n몽환적인 코러스와 섬세한 그루브가 돋보이는 트렌디한 무대입니다.”`,
    brief: `“몽환적인 레트로 감성과 감각적인 보컬 앙상블,\n'Ditto' 아카펠라 버전입니다.”`
  },
  'stand-by-me': {
    wit: `“언제나 내 곁을 지켜주는 든든한 노래, 벤 E. 킹의 'Stand by Me'입니다!\n베이스 라인에 맞춰 박수 준비되셨나요? 함께 출발합니다!”`,
    story: `“시대와 국경을 넘어 전 세계인의 마음에 깊은 위로를 건네온 벤 E. 킹의 'Stand by Me'입니다.\n서로를 지탱해 주는 따뜻하고 묵직한 화음을 들려드립니다.”`,
    brief: `“마음을 울리는 따뜻한 위로의 소울 멜로디,\n벤 E. 킹의 'Stand by Me'입니다.”`
  },
  'the-lion-sleeps-tonight': {
    wit: `“아~위모웨 위모웨 위모웨! 오늘 밤 정글의 사자는 잠들었지만 우리 무대의 열정은 잠들지 않습니다!\n신나게 박수 치며 축제를 즐겨볼까요?”`,
    story: `“영화 <라이언 킹>의 흥겨운 명곡으로도 친숙한 'The Lion Sleeps Tonight'입니다.\n통통 튀는 아프리칸 리듬과 매력적인 하이 테너의 팔세토 앙상블을 즐겨보세요.”`,
    brief: `“경쾌하고 이국적인 리듬이 매력적인\n'The Lion Sleeps Tonight'입니다.”`
  },
  'lion-sleeps-tonight': {
    wit: `“아~위모웨 위모웨 위모웨! 오늘 밤 정글의 사자는 잠들었지만 우리 무대의 열정은 잠들지 않습니다!\n신나게 외쳐볼까요?”`,
    story: `“영화 <라이언 킹>의 흥겨운 명곡으로도 친숙한 'The Lion Sleeps Tonight'입니다.\n통통 튀는 아프리칸 리듬과 매력적인 하이 테너의 팔세토 앙상블을 즐겨보세요.”`,
    brief: `“경쾌하고 이국적인 리듬이 매력적인\n'The Lion Sleeps Tonight'입니다.”`
  }
};

/**
 * 곡별/톤별 풍성한 맞춤형 2줄 MC 멘트 뱅크 (곡당 12개 이상의 멘트 보장)
 */
export const STAGE_SONG_COMMENT_BANKS = {
  'in-your-arms': {
    story: [
      `“유재하 님의 불멸의 발라드 '그대 내 품에'입니다.\n별빛 아래 연인의 품에 안긴 듯 아련하고 깊은 서정을 아카펠라로 속삭입니다.”`,
      `“가을밤의 낭만을 가득 담아 속삭이듯 노래합니다.\n다섯 성부의 따스한 숨결이 마음에 스며드는 순간을 느껴보세요.”`,
      `“한국 대중음악사의 가장 아름다운 고백송!\n오직 목소리만으로 직조해낸 서정적인 감동 속으로 초대합니다.”`,
      `“사랑하는 사람의 온기가 그리워지는 시간입니다.\n눈을 감고 잔잔하게 퍼져나가는 하모니에 귀 기울여 보세요.”`,
      `“한 줄기 바람처럼 부드럽게 다가오는 멜로디,\n악기 없는 순수 아카펠라로 재해석한 유재하의 명작입니다.”`,
      `“노래가 끝날 때쯤 옆 사람의 손을 슬며시 잡고 싶어질 거예요.\n다정하고 포근한 다섯 목소리의 온도를 느껴보세요.”`,
      `“유재하 님의 애틋한 노랫말이 아카펠라를 만났습니다.\n가슴 깊은 곳을 울리는 섬세한 코러스에 젖어보세요.”`,
      `“감성 발라드의 정수를 다섯 목소리로 들려드립니다.\n첫 소절부터 전해지는 깊은 서정에 푹 빠져보세요.”`,
      `“그 시절 우리의 순수했던 사랑을 소환하는 시간,\n아름다운 화음으로 채워지는 무대를 함께 감상하시죠.”`,
      `“화려한 악기 대신 진솔한 목소리로 전하는 고백,\n'그대 내 품에'의 낭만적인 울림을 선물합니다.”`,
      `“조용히 눈을 감고 마음의 쉼표를 찍어보세요.\n포근하게 감싸 안아주는 하모니가 여러분을 찾아갑니다.”`,
      `“시대를 초월해 사랑받는 불후의 명곡,\n아카펠라 특유의 영롱한 화음으로 새롭게 전해드립니다.”`
    ],
    wit: [
      `“가을밤, 연인의 품속처럼 따뜻하고 포근하게 감싸 안아 드립니다.\n옆 사람 손을 슬며시 잡고 달콤한 하모니에 빠져보세요.”`,
      `“솔로 분들은 조금 외로울 수도 있는 강력한 로맨틱 송!\n하지만 저희 다섯 멤버의 목소리가 꽉 안아드릴 테니 안심하세요!”`,
      `“유재하 님의 감성을 목소리로 완벽 복원했습니다.\n혹시 감동의 눈물이 흐를지 모르니 휴지 준비해 주세요!”`,
      `“오늘 밤 여러분의 고막을 녹여버릴 달콤한 멜로디,\n'그대 내 품에'의 포근한 품속으로 빠져보시죠!”`,
      `“짝사랑 중이신 분 계신가요? 오늘 이 노래로 고백해 보세요!\n저희가 뒤에서 가장 로맨틱한 BGM을 깔아드립니다.”`,
      `“가장 설레는 순간을 목소리로 소환합니다.\n심장 두근거릴 준비하시고 편안하게 감상해 주세요!”`,
      `“쌀쌀한 날씨에 패딩보다 따뜻한 목소리 난로!\n'그대 내 품에'로 마음속 온도를 1도 올려드립니다.”`,
      `“노래 듣고 옆 사람 어깨에 기대셔도 괜찮습니다.\n단, 모르는 사람이라면 양해를 구하고 기대어 주세요!”`,
      `“유재하 님의 명곡을 부를 때마다 저희도 가슴이 뜁니다.\n무대 위의 꿀 떨어지는 하모니를 느껴보세요!”`,
      `“감미로운 멜로디에 취해 집에 가기 싫어지실지도 모릅니다.\n다섯 성부가 속삭이는 감성 속으로 초대합니다.”`,
      `“오늘 밤 가장 로맨틱한 순간이 지금 시작됩니다.\n달콤한 아카펠라의 마법에 푹 빠져보세요!”`,
      `“귀를 기울이시면 저희의 숨소리까지 화음이 되는 걸 들으실 수 있습니다.\n'그대 내 품에'와 함께 낭만적인 밤을 보내세요!”`
    ],
    brief: [
      `“서정적이고 아련한 화음으로 전하는 유재하의 '그대 내 품에'입니다.\n다섯 성부의 따스한 숨결을 느껴보세요.”`,
      `“한국 발라드의 영원한 명작, '그대 내 품에'입니다.\n아카펠라의 감미롭고 깊은 울림을 감상하시죠.”`,
      `“유재하의 감성을 오직 목소리만으로 전해드립니다.\n마음을 울리는 포근한 하모니를 선물합니다.”`,
      `“시대를 초월한 불멸의 사랑 노래, '그대 내 품에'입니다.\n서정적인 앙상블에 귀 기울여 주세요.”`,
      `“가을밤을 수놓는 아련하고 감미로운 코러스,\n유재하의 '그대 내 품에'를 아카펠라로 들려드립니다.”`,
      `“부드러운 음색과 영롱한 화음의 조화,\n'그대 내 품에' 무대를 편안하게 감상하세요.”`,
      `“다섯 목소리로 전하는 따스한 온기와 고백,\n'그대 내 품에'와 함께 낭만을 느껴보세요.”`,
      `“가장 순수하고 깊은 울림을 전하는 시간,\n유재하의 명곡 '그대 내 품에'입니다.”`,
      `“아카펠라 특유의 포근하고 섬세한 호흡,\n'그대 내 품에' 무대로 여러분을 초대합니다.”`,
      `“마음에 쉼표가 되어주는 아름다운 발라드,\n'그대 내 품에'를 감상해 보시죠.”`,
      `“다섯 성부가 빚어내는 아련한 하모니의 감동,\n유재하의 '그대 내 품에'입니다.”`,
      `“은은하게 번져가는 감성 발라드 무대,\n'그대 내 품에'를 아카펠라 버전으로 전합니다.”`
    ]
  },
  'stand-by-me': {
    story: [
      `“시대와 국경을 넘어 전 세계인의 마음에 깊은 위로를 건네온 벤 E. 킹의 'Stand by Me'입니다.\n서로를 지탱해 주는 따뜻하고 묵직한 화음을 들려드립니다.”`,
      `“어두운 밤 혼자 걷는 기분이 들 때 이 노래를 떠올려 보세요.\n목소리가 만들어내는 든든한 응원이 무대를 가득 채웁니다.”`,
      `“우정과 연대의 힘을 노래하는 감동의 아카펠라!\n다섯 성부가 층층이 쌓아 올리는 벅찬 하모니를 느껴보세요.”`,
      `“세상이 등을 돌려도 언제나 곁에 있어줄 친구 같은 노래,\n관객 여러분과 함께 부르고 싶은 'Stand by Me'입니다.”`,
      `“따뜻한 눈빛과 미소로 서로를 바라보게 만드는 마법 같은 곡,\n목소리 하나로 완성하는 감동의 무대입니다.”`,
      `“외로움을 달래주고 용기를 북돋아 주는 영원한 명곡,\n소울풀한 보컬과 끈끈한 하모니에 빠져보세요.”`,
      `“저희와 여러분이 하나 되는 가장 특별한 시간,\n지금 무대 위에서 펼쳐지는 'Stand by Me'를 만나보세요.”`,
      `“사람과 사람이 곁을 지켜줄 때 세상은 살만해지죠.\n목소리의 온기로 여러분 곁을 든든하게 지켜드리겠습니다.”`,
      `“시간이 흘러도 빛바래지 않는 소울 클래식의 위로,\n아카펠라 화음의 깊은 울림 속으로 빠져보세요.”`,
      `“서로의 손을 맞잡듯 완벽하게 어우러지는 다섯 성부,\n'Stand by Me'가 전하는 따스한 포옹을 느껴보세요.”`,
      `“마음속 불안을 잠재우고 든든한 용기를 불어넣는 노래,\n벤 E. 킹의 불후의 명작을 선물합니다.”`,
      `“함께 있기에 두렵지 않다는 소중한 메시지,\n아카펠라로 부르는 'Stand by Me'와 함께해 주세요.”`
    ],
    wit: [
      `“언제나 내 곁을 지켜주는 든든한 노래!\n베이스 라인에 맞춰 박수 준비되셨나요? 'Stand by Me' 출발합니다!”`,
      `“둠 둠 둠~ 심장을 울리는 베이스 리듬이 매력적인 곡입니다.\n신나게 고개를 끄덕이며 자유롭게 즐겨주세요!”`,
      `“클래식한 소울 그루브를 아카펠라의 생동감 넘치는 비트로 재현합니다.\n어깨가 절로 들썩이는 리듬 속으로 함께 가시죠!”`,
      `“영화와 광고로도 너무나 친숙한 그 멜로디!\n익숙한 후렴구가 나오면 마음속으로 함께 따라 불러주세요!”`,
      `“혼자 오셨어도 걱정 마세요, 저희가 곁에 있어 드립니다!\n'Stand by Me'와 함께 외로움 싹 날려버리시죠!”`,
      `“악기 없이 입으로만 연주하는 소울 그루브의 진수!\n신나는 박수로 무대의 흥을 더해 주세요!”`,
      `“첫 소절의 베이스가 울리는 순간 이미 마음을 빼앗기실 겁니다.\n다 함께 즐기는 신나는 'Stand by Me'입니다!”`,
      `“옆 사람과 어깨동무하고 싶어지는 기분 좋은 노래!\n다섯 멤버의 찰떡 호흡에 큰 박수 부탁드립니다!”`,
      `“관객 여러분의 박수 소리가 가장 훌륭한 타악기입니다.\n비트에 맞춰 신나게 손뼉 쳐주실 거죠?”`,
      `“오늘 밤 여러분의 든든한 보디가드가 되어드릴 노래,\n'Stand by Me'의 신나는 무대로 떠나봅니다!”`,
      `“지루할 틈 없는 유쾌한 보컬 퍼커션과 풍성한 코러스!\n소울의 전설 속으로 다 함께 빠져보시죠!”`,
      `“목소리로 심장을 바운스시키는 마법 같은 무대,\n'Stand by Me'와 함께 신나게 흔들어보세요!”`
    ],
    brief: [
      `“마음을 울리는 따뜻한 위로의 소울 멜로디,\n벤 E. 킹의 'Stand by Me'입니다.”`,
      `“전 세계인의 사랑을 받아온 불후의 소울 명작,\n'Stand by Me'를 아카펠라로 전해드립니다.”`,
      `“든든한 베이스와 풍성한 코러스의 조화,\n'Stand by Me' 무대를 편안하게 감상하세요.”`,
      `“서로를 지탱해 주는 따스한 화음의 울림,\n벤 E. 킹의 대표곡 'Stand by Me'입니다.”`,
      `“간결하면서도 묵직한 감동을 선사하는 아카펠라,\n'Stand by Me'를 지금 들려드립니다.”`,
      `“깊은 위로와 소울풀한 감성을 담은 무대,\n'Stand by Me'의 하모니에 귀 기울여 주세요.”`,
      `“시대와 세대를 잇는 클래식 소울 앤섬,\n'Stand by Me' 아카펠라 버전입니다.”`,
      `“목소리만으로 채우는 따뜻하고 든든한 앙상블,\n'Stand by Me' 무대로 초대합니다.”`,
      `“언제 들어도 가슴 뭉클한 소울 명곡,\n'Stand by Me'를 선물합니다.”`,
      `“다섯 성부의 단단한 호흡으로 재해석한\n벤 E. 킹의 'Stand by Me'입니다.”`,
      `“따스한 위로와 용기를 전하는 소울 멜로디,\n'Stand by Me'를 감상해 보시죠.”`,
      `“오랜 세월 사랑받아온 명작의 깊은 울림,\n'Stand by Me' 아카펠라 무대입니다.”`
    ]
  },
  'the-lion-sleeps-tonight': {
    story: [
      `“영화 <라이언 킹>의 흥겨운 명곡으로 친숙한 'The Lion Sleeps Tonight'입니다.\n통통 튀는 아프리칸 리듬과 매력적인 하이 테너의 팔세토 앙상블을 즐겨보세요.”`,
      `“정글 속 동물들이 파티를 열듯 신나는 리듬이 터져 나옵니다.\n아이부터 어른까지 다 함께 미소 짓게 만드는 유쾌한 무대입니다.”`,
      `“입으로 연주하는 역동적인 동물 소리와 타악기 비트!\n목소리만으로 아프리카 대자연을 눈앞에 펼쳐 보입니다.”`,
      `“귓가에 맴도는 중독성 강한 멜로디와 산뜻한 하모니,\n아카펠라의 흥겨움이 폭발하는 명곡입니다.”`,
      `“잠든 사자를 깨우지 않으면서도 신나게 춤추는 기분!\n경쾌한 비트와 리드미컬한 코러스가 무대를 채웁니다.”`,
      `“온 가족이 함께 즐길 수 있는 최고의 축제 곡,\n'The Lion Sleeps Tonight'의 신나는 정글 속으로 출발합니다!”`,
      `“시원하게 뻗어 나가는 고음 솔로와 탄탄한 베이스의 앙상블!\n오늘 공연에서 가장 유쾌한 에너지를 선물해 드립니다.”`,
      `“정글의 밤을 수놓는 밝고 신비로운 목소리의 향연,\n신나게 박수 치며 축제를 만끽해 주세요!”`,
      `“평화로운 정글의 밤을 노래하는 이국적인 멜로디,\n목소리로 완성하는 아프리카의 매혹적인 세계입니다.”`,
      `“동심을 자극하는 발랄한 사운드와 정교한 아카펠라 편곡!\n다채로운 성부의 화음이 선사하는 행복을 느껴보세요.”`,
      `“남녀노소 누구나 어깨를 들썩이게 만드는 흥겨운 축제송,\n'The Lion Sleeps Tonight'과 함께 웃어보세요.”`,
      `“목소리 하나로 그려내는 환상적인 사파리 투어!\n사자가 잠든 밤, 신나는 아카펠라 파티가 열립니다.”`
    ],
    wit: [
      `“아~위모웨 위모웨! 오늘 밤 정글의 사자는 잠들었지만 우리 무대의 열정은 잠들지 않습니다!\n신나게 박수 치며 축제를 즐겨볼까요?”`,
      `“오늘 밤 사자가 잠든 틈을 타서 신나게 파티를 열어봅니다!\n하이 테너의 시원한 돌고래 고음에 주목해 주세요!”`,
      `“걱정과 근심은 잠시 내려놓고 정글로 모험을 떠나볼까요?\n신나는 구호에 맞춰 관객 여러분도 함께 호흡해 주세요!”`,
      `“유쾌함과 에너지가 가득 찬 아카펠라의 대표 스테이지 송!\n멤버들의 익살스러운 무대 매너를 마음껏 즐겨보세요!”`,
      `“반복되는 주문 같은 코러스에 몸을 맡겨보세요.\n어느새 머릿속을 맴돌며 함께 흥얼거리게 되실 겁니다!”`,
      `“입으로 내는 정글의 각종 동물 소리와 밀림의 사운드트랙!\n진짜 악기가 없다는 게 믿기지 않으실 겁니다!”`,
      `“사자가 깨어날까 봐 조마조마하지만 흥은 멈출 수 없습니다!\n다 함께 신나게 박수 치며 달려볼까요?”`,
      `“위모웨 한 번에 스트레스가 싹 풀리는 마성의 주문!\n무대와 객석이 하나 되어 신나게 외쳐보시죠!”`,
      `“목소리만으로 라이언킹 애니메이션을 4D로 체험하는 시간!\n통통 튀는 정글 리듬에 몸을 맡겨보세요!”`,
      `“오늘 공연의 엔도르핀을 책임질 가장 신나는 무대,\n'The Lion Sleeps Tonight'으로 활력을 충전하세요!”`,
      `“사자도 춤추게 만드는 아카펠라의 놀라운 마법!\n유쾌 발랄한 다섯 멤버의 에너지를 받아 가세요!”`,
      `“귓가에 착 감기는 마성의 후렴구 '위모웨'!\n공연이 끝나도 계속 흥얼거리게 되실 겁니다!”`
    ],
    brief: [
      `“경쾌하고 이국적인 정글 리듬이 매력적인\n'The Lion Sleeps Tonight' 아카펠라 버전입니다.”`,
      `“영화 <라이언 킹>의 흥겨운 명곡,\n'The Lion Sleeps Tonight'을 신나게 들려드립니다.”`,
      `“통통 튀는 아프리칸 비트와 청량한 팔세토 하모니,\n'The Lion Sleeps Tonight' 무대입니다.”`,
      `“온 가족이 함께 즐기는 유쾌한 아카펠라,\n'The Lion Sleeps Tonight'을 감상해 보세요.”`,
      `“중독성 넘치는 경쾌한 코러스와 신나는 리듬,\n'The Lion Sleeps Tonight'입니다.”`,
      `“다섯 성부의 다채로운 목소리로 빚어낸 정글 축제,\n'The Lion Sleeps Tonight'을 선물합니다.”`,
      `“발랄한 에너지와 경쾌한 하모니가 가득한 시간,\n'The Lion Sleeps Tonight' 무대로 초대합니다.”`,
      `“귀에 익은 유쾌한 멜로디와 산뜻한 보컬 앙상블,\n'The Lion Sleeps Tonight'입니다.”`,
      `“이국적인 정취와 시원한 고음이 돋보이는 곡,\n'The Lion Sleeps Tonight'을 감상하시죠.”`,
      `“흥겨운 아카펠라 사운드로 전하는 명곡,\n'The Lion Sleeps Tonight'입니다.”`,
      `“어깨가 절로 들썩이는 신나는 무대,\n'The Lion Sleeps Tonight'과 함께해 보세요.”`,
      `“밝고 활기찬 목소리의 에너지를 전하는\n'The Lion Sleeps Tonight'입니다.”`
    ]
  },
  'bohemian-rhapsody-5': {
    story: [
      `“자유와 방황, 오페라와 하드록이 교차하는 불후의 명작 '보헤미안 랩소디'입니다.\n악기 하나 없이 오직 다섯 명의 숨소리와 하모니로 무대를 웅장하게 채웁니다.”`,
      `“목소리 다섯 개로 록 밴드의 오케스트라 사운드를 재현합니다.\n웅장한 하모니와 숨 막히는 긴장감에 몰입해 보세요.”`,
      `“아카펠라 무대 예술의 정점을 보여주는 도전적인 명곡!\n전율을 일으키는 오페라 섹션의 화려한 코러스에 주목해 주세요.”`,
      `“다섯 멤버의 숨소리까지 하나로 맞추어 완성한 기적의 하모니,\n퀸의 에너지를 생생한 목소리로 전달합니다.”`,
      `“가장 깊은 서정부터 폭발하는 하드록 코러스까지!\n사람의 목소리가 빚어내는 무한한 스펙트럼을 감상하시죠.”`,
      `“세계인이 사랑하는 전설의 명곡을 다섯 성부의 숨결로 빚었습니다.\n심장을 두드리는 카타르시스를 느껴보세요.”`,
      `“악기가 없는 것이 아니라 목소리가 악기 그 이상이 되는 시간,\n'보헤미안 랩소디'의 웅장한 전율 속으로 빠져보세요.”`,
      `“목소리로 쌓아 올리는 드라마 한 편을 감상해 보세요.\n한순간도 눈을 뗄 수 없는 앙상블의 진수를 보여드립니다.”`,
      `“복잡한 성부 편곡과 다이내믹한 템포 변화의 향연,\n입으로 연주하는 록 오페라의 전율을 선물합니다.”`,
      `“오늘 무대의 가장 웅장하고 강렬한 하이라이트,\n'보헤미안 랩소디'가 지금 여러분 곁으로 찾아갑니다.”`,
      `“한 곡 안에 담긴 서사시 같은 음악적 드라마,\n다섯 목소리의 한계를 뛰어넘는 도전을 지켜봐 주세요.”`,
      `“퀸의 혼을 담아 부르는 아카펠라의 정수,\n가슴을 울리는 거대한 하모니의 파도를 느껴보세요.”`
    ],
    wit: [
      `“드디어 올 것이 왔습니다! 퀸의 전설적인 명곡,\n목소리 다섯 개로 오페라와 록을 넘나드는 기적을 확인해 보세요!”`,
      `“갈릴레오, 피가로! 무대를 뒤흔드는 오페라틱 아카펠라,\n오늘 공연의 가장 드라마틱한 순간이 펼쳐집니다!”`,
      `“퀸의 프레디 머큐리도 깜짝 놀랄 아카펠라 도전!\n다섯 성부가 뿜어내는 뜨거운 열정에 박수를 보내주세요!”`,
      `“기타 앰프도 드럼도 없이 오직 마이크 다섯 개뿐입니다!\n목소리로 터져 나오는 록 사운드에 전율을 느껴보세요!”`,
      `“이 곡을 연습하며 멤버들의 목에 쉰 소리가 날 정도였습니다!\n피와 땀으로 빚어낸 웅장한 코러스를 기대해 주세요!”`,
      `“머리칼이 쭈뼛 서는 폭발적인 하모니의 롤러코스터!\n안전벨트 매시고 '보헤미안 랩소디'로 질주해 볼까요?”`,
      `“목소리만으로 스타디움 록 콘서트를 재현하는 마법!\n숨죽이고 귀를 기울이시면 전율이 찾아옵니다!”`,
      `“클래식과 록의 파격적인 만남을 다섯 목소리로!\n오늘 공연에서 가장 숨 가쁘고 짜릿한 무대입니다!”`,
      `“갈릴레오를 외치는 순간 소름이 돋아도 책임지지 않습니다!\n퀸의 불후의 명작을 지금 소환합니다!”`,
      `“입으로 터뜨리는 강렬한 디스토션과 파워풀한 코러스!\n아카펠라의 한계를 부수는 무대를 감상하시죠!”`,
      `“저희의 모든 에너지를 쏟아붓는 오늘의 클라이맥스 무대,\n'보헤미안 랩소디'에 아낌없는 환호를 보내주세요!”`,
      `“목소리 다섯 개가 빚어내는 블록버스터 음악 영화,\n퀸의 '보헤미안 랩소디'를 온몸으로 즐겨보세요!”`
    ],
    brief: [
      `“다섯 성부의 다채로운 음색으로 재해석한 퀸의 명곡,\n'보헤미안 랩소디' 5인용 버전입니다.”`,
      `“오페라와 록을 넘나드는 불후의 전설적인 명곡,\n'보헤미안 랩소디'를 아카펠라로 들려드립니다.”`,
      `“웅장한 하모니와 다이내믹한 앙상블이 돋보이는\n퀸의 '보헤미안 랩소디'입니다.”`,
      `“다섯 목소리로 전하는 거대한 감동과 전율,\n'보헤미안 랩소디' 무대를 감상하시죠.”`,
      `“아카펠라 하모니의 정수를 보여주는 대표 명곡,\n'보헤미안 랩소디'를 선물합니다.”`,
      `“정교한 편곡과 폭발적인 에너지가 가득한\n'보헤미안 랩소디' 무대로 초대합니다.”`,
      `“목소리만으로 완성하는 록 오페라 사운드,\n퀸의 '보헤미안 랩소디'입니다.”`,
      `“숨 막히는 긴장감과 전율의 코러스,\n'보헤미안 랩소디' 아카펠라 버전입니다.”`,
      `“인간 목소리의 무한한 표현력을 담아낸 무대,\n'보헤미안 랩소디'를 감상해 보시죠.”`,
      `“오늘 공연의 웅장한 하이라이트 곡,\n퀸의 '보헤미안 랩소디'입니다.”`,
      `“다섯 성부의 열정과 화려한 코러스의 향연,\n'보헤미안 랩소디'를 전해드립니다.”`,
      `“시대를 초월한 록의 전설을 아카펠라로,\n'보헤미안 랩소디'입니다.”`
    ]
  }
};

/**
 * 어떤 곡이든 톤에 맞춰 최소 12가지 이상의 자연스러운 2줄 MC 멘트 템플릿을 생성
 */
export function generateToneVariations(title, artist = '', arrangement = '아카펠라', category = '명곡', tone = 'story') {
  const art = artist ? `${artist}의 ` : '';
  if (tone === 'wit') {
    return [
      `“다음 곡은 ${art}'${title}'입니다!\n멤버들의 유쾌한 입담과 통통 튀는 비트에 맞춰 함께 박수쳐 주세요!”`,
      `“이번 무대는 ${art}'${title}'로 신나게 달려봅니다!\n악기 하나 없이 사람 입에서 나오는 화려한 사운드에 깜짝 놀라실 거예요!”`,
      `“관객 여러분, 박수와 함성 장전되셨나요?\n${art}'${title}'의 흥겨운 아카펠라 리듬 속으로 출발합니다!”`,
      `“이 노래가 시작되면 어깨가 가만히 있지 못할 겁니다!\n${art}'${title}'의 중독성 강한 하모니를 온몸으로 즐겨보세요!”`,
      `“오늘 무대에서 가장 유쾌하고 에너제틱한 곡,\n${art}'${title}'의 통통 튀는 매력에 푹 빠져보세요!”`,
      `“숨소리까지 리듬이 되는 아카펠라의 마법!\n${art}'${title}'의 비트박스와 탄탄한 저음에 귀를 기울여 주세요!”`,
      `“눈 깜짝할 사이에 지나갈 신나는 무대,\n${art}'${title}'를 들으시면서 스트레스를 시원하게 날려버리세요!”`,
      `“저희의 화려한 코러스와 익살스러운 무대 매너!\n${art}'${title}'와 함께 공연장 분위기를 한껏 달궈보겠습니다!”`,
      `“첫 소절부터 발끝이 먼저 반응하는 마성의 리듬,\n${art}'${title}'의 산뜻한 하모니 속으로 초대합니다!”`,
      `“관객 여러분의 뜨거운 눈빛 덕분에 저희 목소리가 더 신납니다!\n${art}'${title}', 활기차게 시작해 볼까요?”`,
      `“입으로 연주하는 드럼 비트와 현란한 화음의 향연,\n${art}'${title}'의 신선한 아카펠라 버전을 만나보세요!”`,
      `“모두 함께 손뼉 치며 하나 되는 시간,\n${art}'${title}'의 유쾌한 앙상블에 큰 박수 부탁드립니다!”`
    ];
  }
  if (tone === 'brief') {
    return [
      `“이어서 들려드릴 곡은 ${art}'${title}'입니다.\n정교하고 풍성한 ${arrangement} 하모니로 전해드립니다.”`,
      `“다음 곡은 ${art}'${title}'입니다.\n목소리만으로 채우는 감미로운 앙상블을 감상해 보세요.”`,
      `“많은 사랑을 받아온 명곡, ${art}'${title}'입니다.\n다채로운 성부의 아름다운 음색에 귀 기울여 주세요.”`,
      `“이번 무대는 ${art}'${title}'입니다.\n산뜻하고 세련된 보컬 하모니를 선물합니다.”`,
      `“${art}'${title}'를 아카펠라 버전으로 들려드립니다.\n목소리가 빚어내는 깊은 울림을 느껴보세요.”`,
      `“다음 순서는 ${art}'${title}'입니다.\n각 파트의 숨소리까지 하나가 되는 무대를 감상하시죠.”`,
      `“${art}'${title}'의 낭만적인 멜로디,\n풍성한 코러스와 따뜻한 화음으로 전합니다.”`,
      `“이어지는 곡은 ${art}'${title}'입니다.\n멤버들의 환상적인 보컬 호흡을 기대해 주세요.”`,
      `“${art}'${title}'를 목소리만으로 재해석했습니다.\n원곡과는 또 다른 아카펠라의 매력을 만나보세요.”`,
      `“이번 곡은 ${art}'${title}'입니다.\n가슴을 울리는 따스한 멜로디 속으로 초대합니다.”`,
      `“${art}'${title}'의 서정적인 감동,\n${arrangement}의 아름다운 앙상블로 전해드립니다.”`,
      `“다음으로 전해드릴 곡은 ${art}'${title}'입니다.\n귀를 사로잡는 화려한 코러스와 함께해 주세요.”`
    ];
  }
  // story (default)
  return [
    `“이번에 들려드릴 곡은 ${art}'${title}'입니다.\n악기 하나 없이 사람의 따뜻한 목소리만으로 직조해낸 ${category}의 감동을 전합니다.”`,
    `“별빛 아래 아련한 추억이 깃든 명곡,\n${art}'${title}'의 서정적인 화음이 마음에 포근한 쉼표가 되어드립니다.”`,
    `“노랫말 한 구절 한 구절에 진심을 담아 노래합니다.\n${art}'${title}'의 깊은 울림에 조용히 귀 기울여 보세요.”`,
    `“세월이 흘러도 변치 않는 멜로디의 낭만,\n${art}'${title}'를 아카펠라 특유의 영롱한 코러스로 재해석했습니다.”`,
    `“마음속 깊은 곳을 조용히 두드리는 하모니,\n${art}'${title}'의 감미로운 앙상블 속으로 여러분을 초대합니다.”`,
    `“지친 일상에 건네는 가장 다정한 위로,\n${art}'${title}'의 따스한 숨결을 온전히 느껴보세요.”`,
    `“서로 다른 음색의 목소리가 하나로 빚어내는 순간,\n${art}'${title}'가 전하는 뭉클한 감동을 선물합니다.”`,
    `“가슴속에 간직해둔 아름다운 기억을 소환하는 시간,\n${art}'${title}'의 잔잔한 선율에 몸을 맡겨보세요.”`,
    `“사람의 목소리가 낼 수 있는 가장 순수한 아름다움,\n${art}'${title}'의 애틋하고 깊은 울림을 감상하시죠.”`,
    `“노래가 끝난 뒤에도 오래도록 마음에 머물 노래,\n${art}'${title}'의 서정적인 하모니를 들려드립니다.”`,
    `“포근한 온기로 관객 여러분의 마음을 감싸 안아 드립니다.\n${art}'${title}'의 감성적인 무대를 함께해 주세요.”`,
    `“목소리와 목소리가 만나 완성되는 기적 같은 화음,\n${art}'${title}'의 울림 속으로 빠져보시기 바랍니다.”`
  ];
}

/**
 * 특정 곡과 톤에 대한 최소 10~15개 이상의 고유 2줄 MC 멘트 추천 목록을 반환
 */
export function getMCCommentVariations(song, tone = 'story') {
  if (!song) {
    return generateToneVariations('아카라카', '', '아카펠라', '하모니', tone);
  }
  const title = song.title || '연습곡';
  const artist = song.artist || '';
  const arrangement = song.arrangement || '아카펠라';
  const category = song.category || '명곡';

  const songId = song.id || '';
  const normalizedId = songId.replace(/-[0-9]+$/, '');
  const bank = STAGE_SONG_COMMENT_BANKS[songId] || STAGE_SONG_COMMENT_BANKS[normalizedId];
  const bespokeList = (bank && bank[tone]) ? bank[tone] : [];

  const dynamicList = generateToneVariations(title, artist, arrangement, category, tone);

  // STAGE_AI_COMMENTS primary item
  const specific = STAGE_AI_COMMENTS[songId] || STAGE_AI_COMMENTS[normalizedId];
  const primeComment = specific && specific[tone] ? specific[tone] : null;

  const combined = [];
  const seen = new Set();

  function add(item) {
    if (!item) return;
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      combined.push(trimmed);
    }
  }

  if (primeComment) add(primeComment);
  bespokeList.forEach(add);
  dynamicList.forEach(add);

  return combined;
}

/**
 * 멘트 데이터베이스와 동적 생성기를 통합하여 자연스러운 2줄 MC 멘트를 반환하는 함수
 */
export function generateDynamicMCComment(song, tone = 'story', index = 0) {
  const vars = getMCCommentVariations(song, tone);
  return vars[index % vars.length] || vars[0];
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
 * 메인 33곡 외 무대 큐시트에 등록된 특별 레퍼토리 메타데이터 (첫 음 및 곡 정보)
 */
export const STAGE_EXTRA_SONG_METADATA = {
  'stand-by-me': {
    id: 'stand-by-me',
    title: 'Stand By Me (스탠바이미)',
    artist: 'Ben E. King',
    category: 'Pop / Soul',
    arrangement: '혼성 5부',
    musicalKey: 'A Major',
    difficulty: 2,
    status: 'practice',
    tags: ['무대 레퍼토리', '소울', '명곡'],
    videos: {
      full: {
        type: 'video',
        url: 'https://www.youtube.com/watch?v=BTCfQ667QUY'
      }
    },
    startingPitches: {
      key: 'A Major',
      pitches: {
        bass: 'A2',
        baritone: 'C#3',
        tenor: 'E3',
        alto: 'A3',
        soprano: 'C#4'
      }
    }
  },
  'the-lion-sleeps-tonight': {
    id: 'the-lion-sleeps-tonight',
    title: 'The Lion Sleeps Tonight',
    artist: 'The Tokens',
    category: 'Pop / World',
    arrangement: '혼성 5부',
    musicalKey: 'F Major',
    difficulty: 2,
    status: 'practice',
    tags: ['무대 레퍼토리', '아카펠라', '라이온킹'],
    videos: {
      full: {
        type: 'video',
        url: 'https://www.youtube.com/watch?v=OQlByoPdG6c'
      }
    },
    startingPitches: {
      key: 'F Major',
      pitches: {
        bass: 'F2',
        baritone: 'A2',
        tenor: 'C3',
        alto: 'F3',
        soprano: 'C4'
      }
    }
  }
};
STAGE_EXTRA_SONG_METADATA['lion-sleeps-tonight'] = STAGE_EXTRA_SONG_METADATA['the-lion-sleeps-tonight'];

/**
 * 곡 ID를 통해 메인 songs 및 추가 무대 레퍼토리에서 메타데이터 검색
 */
export function resolveSongData(songs, songId, fallbackTitle = '') {
  if (Array.isArray(songs)) {
    const found = songs.find(s => s.id === songId);
    if (found) return found;
  }
  if (STAGE_EXTRA_SONG_METADATA[songId]) {
    return STAGE_EXTRA_SONG_METADATA[songId];
  }
  return {
    id: songId,
    title: fallbackTitle || songId,
    artist: '아카라카',
    category: '아카펠라',
    arrangement: '다성부',
    startingPitches: null
  };
}

/**
 * 사용자 직접 입력 공연 셋리스트 (최신순 3건 정렬)
 * 사용자가 직접 입력하지 않은 임의 더미 공연은 기본 히스토리에 포함하지 않음
 */
export const DEFAULT_STAGE_HISTORY = [
  {
    id: 'stage-2026-jeonnam',
    eventTitle: '2026 전교조 전남지부 참교육실천대회 찬조 공연',
    date: '2026.10.24',
    venue: '광주교육연수원',
    notes: '2026 전교조 전남지부 참교육실천대회 찬조 공연 큐시트 (장소: 광주교육연수원)',
    updatedAt: 1792836000000,
    currentIndex: 0,
    songs: [
      { songId: 'in-your-arms', title: '그대 내 품에', note: '감성 발라드', commentTone: 'story' },
      { songId: 'old-pop-medley', title: '올드팝 메들리', note: '명곡 메들리', commentTone: 'story' },
      { songId: 'love-song-medley', title: '러브송 메들리', note: '로맨틱 앙상블', commentTone: 'story' },
      { songId: 'isnt-she-lovely', title: 'Isn\'t She Lovely', note: '소울풀 그루브', commentTone: 'wit' },
      { songId: 'lets-travel', title: '여행을 떠나요', note: '신나는 에너지', commentTone: 'wit' },
      { songId: 'short-hair', title: '단발머리', note: '경쾌한 비트', commentTone: 'wit' },
      { songId: 'stand-by-me', title: 'Stand By Me (스탠바이미)', note: '따뜻한 위로', commentTone: 'story' },
      { songId: 'the-lion-sleeps-tonight', title: 'The Lion Sleeps Tonight', note: '위모웨 피날레', commentTone: 'wit' }
    ]
  },
  {
    id: 'stage-2026-gyowon',
    eventTitle: '2026 제19회 교원예술제',
    date: '2026.10.23',
    venue: '장흥문화예술회관',
    notes: '2026 제19회 교원예술제 무대 큐시트 (장소: 장흥문화예술회관)',
    updatedAt: 1792749600000,
    currentIndex: 0,
    songs: [
      { songId: 'bohemian-rhapsody-5', title: '보헤미안 랩소디 · 5인용', note: '퀸 오페라 하이라이트', commentTone: 'wit' }
    ]
  },
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
  }
];

/**
 * 사용자가 직접 입력하지 않은 과거 임시/샘플 더미 공연 ID 목록 (발견 즉시 히스토리에서 영구 삭제)
 */
export const DUMMY_STAGE_IDS = new Set([
  'stage-2026-spring',
  'stage-2025-busking',
  'stage-2024-suncheon',
  'stage-2024-winter'
]);

/**
 * 미입력 더미 공연 판별 헬퍼
 */
export function isDummyStage(item) {
  if (!item) return false;
  if (DUMMY_STAGE_IDS.has(item.id)) return true;
  const title = item.eventTitle || '';
  if (
    title.includes('청춘 하모니') ||
    title.includes('봄맞이 캠퍼스 버스킹') ||
    title.includes('아고라순천')
  ) {
    return true;
  }
  return false;
}

/**
 * 저장소에서 공연 히스토리 가져오기 (항상 최신순 정렬)
 * - 사용자가 직접 입력하지 않은 샘플/더미 공연은 영구 배제
 */
export function getStageHistory() {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_STAGE_HISTORY.filter(item => !isDummyStage(item));
  }
  try {
    let deletedIds = new Set();
    try {
      const dRaw = localStorage.getItem(STAGE_DELETED_KEY);
      if (dRaw) deletedIds = new Set(JSON.parse(dRaw));
    } catch (_) {}

    const raw = localStorage.getItem(STAGE_HISTORY_KEY);
    if (raw === null) {
      const initial = DEFAULT_STAGE_HISTORY.filter(item => !isDummyStage(item) && !deletedIds.has(item.id));
      saveStageHistory(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // 1. 기존에 저장되어 있던 미입력 더미/샘플 공연 영구 배제 및 삭제된 ID 배제
      const cleaned = parsed.filter(item => !isDummyStage(item) && !deletedIds.has(item.id));
      let changed = cleaned.length !== parsed.length;

      // 2. 사용자가 직접 추가를 요청한 기본 공연(참교육실천대회, 교원예술제, 여수 등)이 누락되어 있고 삭제하지 않았다면 반영
      const existingIds = new Set(cleaned.map(item => item.id));
      for (const def of DEFAULT_STAGE_HISTORY) {
        if (!existingIds.has(def.id) && !deletedIds.has(def.id) && !isDummyStage(def)) {
          cleaned.push(JSON.parse(JSON.stringify(def)));
          changed = true;
        }
      }

      const sorted = cleaned.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (changed) {
        saveStageHistory(sorted);
      }
      return sorted;
    }
  } catch (e) {
    console.warn('Failed to parse stage history:', e);
  }
  return DEFAULT_STAGE_HISTORY.filter(item => !isDummyStage(item));
}

/**
 * 공연 히스토리 저장
 */
export function saveStageHistory(history) {
  if (typeof localStorage === 'undefined') return history;
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
 * 역대 공연 셋리스트를 날짜순(오래된 순 -> 최신 순)으로 정렬하여 반환
 */
export function getChronologicalPerformanceList() {
  const history = getStageHistory();
  return [...history].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.updatedAt || 0) - (b.updatedAt || 0);
  });
}

/**
 * 현재 활성화된 무대 세션 가져오기 (없으면 히스토리 최신 또는 기본 생성)
 */
export function getActiveStageSession(allSongs = []) {
  try {
    const raw = localStorage.getItem(STAGE_ACTIVE_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      // 만약 활성 세션이 미입력 더미 공연이거나 기본 템플릿이면 히스토리 최신(여수 등)으로 즉시 교체
      if (isDummyStage(session) || session.eventTitle === '새 아카라카 공연' || session.eventTitle === '2026 아카라카 무대 큐시트' || !session.eventTitle) {
        const history = getStageHistory();
        const fallback = history[0] || DEFAULT_STAGE_HISTORY[0];
        saveActiveStageSession(JSON.parse(JSON.stringify(fallback)));
        return fallback;
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
    eventTitle: '2026 여수 생활문화한마당',
    date: '2026.10.16',
    venue: '웅천친수공원',
    notes: '2026 여수 생활문화한마당 공연 큐시트 (장소: 웅천친수공원)',
    updatedAt: Date.now(),
    currentIndex: 0,
    songs: (DEFAULT_STAGE_HISTORY[0]?.songs || []).map(s => ({ ...s }))
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
 * 공연 히스토리 항목 삭제 (삭제 기록 영구 보존)
 */
export function deleteStageHistoryItem(id) {
  try {
    const deletedRaw = localStorage.getItem(STAGE_DELETED_KEY);
    const deletedSet = new Set(deletedRaw ? JSON.parse(deletedRaw) : []);
    deletedSet.add(id);
    localStorage.setItem(STAGE_DELETED_KEY, JSON.stringify([...deletedSet]));
  } catch (e) {
    console.warn('Failed to track deleted stage id:', e);
  }

  const history = getStageHistory().filter(item => item.id !== id);
  saveStageHistory(history);
  const active = getActiveStageSession();
  if (active && active.id === id) {
    if (history.length > 0) {
      saveActiveStageSession(JSON.parse(JSON.stringify(history[0])));
    } else {
      createNewStageSession('새 아카라카 공연');
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
    if (!playing) {
      clearStagePitchAutoStop();
    }
    updatePitchPlayingUI(playing);
    updateOverviewPitchUI(playing);
  });

  function navigateToPerformance(target) {
    if (!target) return;
    clearStagePitchAutoStop();
    stopPitch(true);
    if (typeof activeStageLiveCleanup === 'function') {
      activeStageLiveCleanup();
    }
    saveActiveStageSession(target);
    renderStageLiveView({ container, songs, navigate, onSwitchView });
    toast(`[${target.eventTitle}] 큐시트로 이동했습니다.`);
  }

  // Keyboard navigation on stage (arrow keys, space for pitch, Ctrl+Arrow for performance switch)
  function handleKeyDown(e) {
    if (e.target && e.target.matches('input, textarea, select, [contenteditable="true"]')) return;

    // Ctrl+ArrowLeft / Ctrl+ArrowRight: 그 전 공연 / 그 후 공연 전환
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
      const perfList = getChronologicalPerformanceList();
      const curIdx = perfList.findIndex(p => p.id === session.id);
      const resIdx = curIdx >= 0 ? curIdx : perfList.findIndex(p => p.eventTitle === session.eventTitle);
      if (resIdx > 0) {
        e.preventDefault();
        navigateToPerformance(perfList[resIdx - 1]);
        return;
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
      const perfList = getChronologicalPerformanceList();
      const curIdx = perfList.findIndex(p => p.id === session.id);
      const resIdx = curIdx >= 0 ? curIdx : perfList.findIndex(p => p.eventTitle === session.eventTitle);
      if (resIdx >= 0 && resIdx < perfList.length - 1) {
        e.preventDefault();
        navigateToPerformance(perfList[resIdx + 1]);
        return;
      }
    }

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
      clearStagePitchAutoStop();
      stopPitch(true);
      updatePitchPlayingUI(null);
      updateOverviewPitchUI(null);
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

    const perfList = getChronologicalPerformanceList();
    const curPerfIdx = perfList.findIndex(p => p.id === session.id);
    const resolvedPerfIdx = curPerfIdx >= 0 ? curPerfIdx : perfList.findIndex(p => p.eventTitle === session.eventTitle);
    const prevPerf = resolvedPerfIdx > 0 ? perfList[resolvedPerfIdx - 1] : null;
    const nextPerf = (resolvedPerfIdx >= 0 && resolvedPerfIdx < perfList.length - 1) ? perfList[resolvedPerfIdx + 1] : null;

    const prevPerfBtn = button('◀ 그 전 공연', () => {
      if (prevPerf) navigateToPerformance(prevPerf);
    }, 'stage-perf-nav-btn prev', null, {
      disabled: !prevPerf,
      title: prevPerf ? `그 전 공연으로 이동: ${prevPerf.eventTitle} (${prevPerf.date || ''})` : '그 전 공연이 없습니다 (첫 번째 공연)'
    });

    const perfCountBadge = el('button', {
      type: 'button',
      class: 'stage-perf-nav-count-btn',
      title: `현재 공연: ${session.eventTitle} (${(resolvedPerfIdx >= 0 ? resolvedPerfIdx + 1 : 1)}/${perfList.length || 1}) · 클릭 시 전체 공연 목록 열기`,
      onclick: () => {
        openStageHistoryModal({
          songs,
          onSelectSession: (selected) => {
            saveActiveStageSession(selected);
            renderStageLiveView({ container, songs, navigate, onSwitchView });
          }
        });
      }
    }, `${resolvedPerfIdx >= 0 ? resolvedPerfIdx + 1 : 1} / ${perfList.length || 1}`);

    const nextPerfBtn = button('그 후 공연 ▶', () => {
      if (nextPerf) navigateToPerformance(nextPerf);
    }, 'stage-perf-nav-btn next', null, {
      disabled: !nextPerf,
      title: nextPerf ? `그 후 공연으로 이동: ${nextPerf.eventTitle} (${nextPerf.date || ''})` : '그 후 공연이 없습니다 (마지막 공연)'
    });

    const perfNavWrap = el('div', { class: 'stage-perf-nav-wrap', role: 'group', 'aria-label': '공연 목록 이동' },
      prevPerfBtn,
      perfCountBadge,
      nextPerfBtn
    );

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
      }, 'text-button', null, { title: '행사명 및 셋리스트 편집' }),
      perfNavWrap
    );

    const modeFocusBtn = button('🎤 1곡 보기', () => {
      if (liveMode === 'focus') return;
      stopPitch(true);
      liveMode = 'focus';
      try { localStorage.setItem('acaroom_stage_live_submode', 'focus'); } catch {}
      renderAll();
    }, `stage-mode-btn${liveMode === 'focus' ? ' active' : ''}`, null, { role: 'radio', 'aria-checked': String(liveMode === 'focus'), title: '1곡씩 크게 조율하며 진행하는 실전 1곡 보기 모드' });

    const modeOverviewBtn = button('📋 전체 큐시트 목록', () => {
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
    return resolveSongData(songs, item.songId, item.title);
  }

  let playAllBtn;
  let partButtons = [];
  let stagePitchAutoStopTimer = null;

  function clearStagePitchAutoStop() {
    if (stagePitchAutoStopTimer) {
      clearTimeout(stagePitchAutoStopTimer);
      stagePitchAutoStopTimer = null;
    }
  }

  function scheduleStagePitchAutoStop(duration = 3000) {
    clearStagePitchAutoStop();
    if (duration > 0) {
      stagePitchAutoStopTimer = setTimeout(() => {
        stagePitchAutoStopTimer = null;
        stopPitch(true);
        updatePitchPlayingUI(null);
        updateOverviewPitchUI(null);
      }, duration);
    }
  }

  function updatePitchPlayingUI(playing) {
    const isPlaying = isPitchSequencePlaying() || Boolean(playing);
    if (playAllBtn) {
      playAllBtn.classList.toggle('playing', isPlaying);
      playAllBtn.textContent = isPlaying ? '⏹ 첫 음 재생 멈추기' : '▶ 첫 음 전체 듣기 (아르페지오 + 화음)';
      if (!isPlaying) {
        try { playAllBtn.blur(); } catch {}
      }
    }

    partButtons.forEach(({ btn, part, semitone, octave, noteStr }) => {
      if (!playing) {
        btn.classList.remove('active', 'playing');
        try { btn.blur(); } catch {}
      } else if (playing.isChord) {
        btn.classList.add('active');
      } else if (playing.part && playing.part === part) {
        btn.classList.add('active');
      } else if (typeof semitone === 'number' && typeof octave === 'number' && playing.semitone === semitone && playing.octave === octave) {
        btn.classList.add('active');
      } else {
        const isMatch = (playing.displayNote && playing.displayNote === noteStr) || (playing.note && playing.note === noteStr);
        btn.classList.toggle('active', Boolean(isMatch));
        if (!isMatch) {
          try { btn.blur(); } catch {}
        }
      }
    });
  }

  let overviewPitchItems = [];
  let activeOverviewElement = null;

  function updateOverviewPitchUI(playing) {
    if (!overviewPitchItems || !overviewPitchItems.length) return;
    if (!playing) {
      activeOverviewElement = null;
      overviewPitchItems.forEach(item => {
        item.el.classList.remove('playing', 'active');
        try { item.el.blur(); } catch {}
      });
      return;
    }

    overviewPitchItems.forEach(item => {
      if (activeOverviewElement) {
        const isMatch = item.el === activeOverviewElement;
        item.el.classList.toggle('playing', isMatch);
        if (!isMatch) {
          try { item.el.blur(); } catch {}
        }
      } else if (item.type === 'chord' && playing.isChord) {
        item.el.classList.add('playing');
      } else if (item.type === 'single' && !playing.isChord) {
        const match = (playing.semitone === item.parsed?.semitone && playing.octave === item.parsed?.octave);
        item.el.classList.toggle('playing', Boolean(match));
        if (!match) {
          try { item.el.blur(); } catch {}
        }
      } else {
        item.el.classList.remove('playing', 'active');
        try { item.el.blur(); } catch {}
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

    const resolvedSong = songData || resolveSongData(songs, item?.songId || item?.id, item?.title);
    const targetSongId = resolvedSong?.id || item?.songId || item?.id;

    const videoBtn = button('🎬 연습실 영상', () => {
      stopPitch(true);
      cleanupStageLive();
      if (typeof navigate === 'function' && targetSongId) {
        navigate({ song: targetSongId });
      } else if (typeof navigate === 'function') {
        navigate({ tab: 'songs' });
      }
    }, 'stage-practice-video-btn', null, { title: `${resolvedSong?.title || item?.title || '해당 곡'} 아카라카 연습실 상세 페이지로 바로 이동` });

    const topRow = el('div', { class: 'stage-hero-top-row' },
      badges,
      videoBtn
    );

    const titleEl = el('h3', { class: 'stage-hero-title', text: title });
    const artistEl = el('p', { class: 'stage-hero-artist', text: artistArrangement });

    heroCard.replaceChildren(topRow, titleEl, artistEl);
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
        clearStagePitchAutoStop();
        stopPitch(true);
        updatePitchPlayingUI(null);
        updateOverviewPitchUI(null);
      }, 'text-button', null, { title: '소리 즉시 멈추기' })
    );

    playAllBtn = button('▶ 첫 음 전체 듣기 (아르페지오 + 화음)', () => {
      clearStagePitchAutoStop();
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
          'data-pitch-trigger': 'true',
          'aria-label': `${partName} 파트 첫 음 ${displayNote} (${koreanNote}) 재생 (3초 후 자동 종료)`,
          onclick: (e) => {
            e.stopPropagation();
            if (isPitchSequencePlaying()) {
              stopPitchSequence();
              updatePitchPlayingUI(null);
              clearStagePitchAutoStop();
              return;
            }
            if (parsed) {
              const current = getCurrentPlaying();
              if (current && !current.isChord && current.semitone === parsed.semitone && current.octave === parsed.octave) {
                // 이미 재생 중인 음을 다시 누르면 즉시 멈춤 및 초기화 (토글)
                clearStagePitchAutoStop();
                stopPitch(true);
                updatePitchPlayingUI(null);
                try { partBtn.blur(); } catch {}
                return;
              }
              clearStagePitchAutoStop();
              const res = playPitch(parsed.semitone, parsed.octave, 0.6, true, 3000, { part, displayNote });
              if (res) {
                res.part = part;
                res.displayNote = displayNote;
                updatePitchPlayingUI(res);
                scheduleStagePitchAutoStop(3000);
              } else {
                updatePitchPlayingUI(null);
              }
            }
          }
        },
          el('span', { class: 'stage-part-name', text: partName }),
          el('span', { class: 'stage-part-note', text: displayNote }),
          koreanNote ? el('span', { style: 'font-size: 11px; opacity: 0.85;', text: koreanNote }) : null
        );

        partButtons.push({
          btn: partBtn,
          part,
          semitone: parsed ? parsed.semitone : null,
          octave: parsed ? parsed.octave : null,
          noteStr: displayNote
        });
        grid.append(partBtn);
      });
    }

    pitchCard.replaceChildren(header, playAllBtn, grid);
    updatePitchPlayingUI(getCurrentPlaying());
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
          item.commentVariationIndex = 0;
          const newVars = getMCCommentVariations(songData, currentTone);
          item.customComment = newVars[0];
          saveActiveStageSession(session);
        }
        renderMCCard(songData);
      }, `stage-tone-btn${currentTone === toneKey ? ' active' : ''}`);
    });

    const toneTabs = el('div', { class: 'stage-tone-tabs' }, ...toneBtns);
    header.append(title, toneTabs);

    const variations = getMCCommentVariations(songData, currentTone);
    const savedCommentKey = `${songData?.id || activeIndex}_${currentTone}`;
    const commentText = (item && item.customComment) || customComments[savedCommentKey] || variations[item?.commentVariationIndex || 0] || variations[0];

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
      const vars = getMCCommentVariations(songData, currentTone);
      const curIdx = typeof item?.commentVariationIndex === 'number' ? item.commentVariationIndex : 0;
      const nextIdx = (curIdx + 1) % vars.length;
      if (item) item.commentVariationIndex = nextIdx;
      const next = vars[nextIdx];
      bubble.textContent = next;
      customComments[savedCommentKey] = next;
      if (item) {
        item.customComment = next;
        saveActiveStageSession(session);
      }
      toast(`새로운 추천 멘트 (${nextIdx + 1}/${vars.length})`);
    }, 'button secondary small', null, { title: '다른 멘트 제안 (클릭할 때마다 10가지 이상 새로운 멘트 추천)' });

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
        const sd = resolveSongData(songs, item.songId, item.title);
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
        el('span', { class: 'stage-overview-hint-text', text: '곡을 누르면 1곡 보기 모드로 이동하며, 첫 음 배지를 누르면 조율음을 듣습니다.' })
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
      const songData = resolveSongData(songs, item.songId, item.title);
      const keyStr = songData?.musicalKey || songData?.startingPitches?.key;
      const pitchEntries = getSongStartingPitchEntries(songData);

      const savedCommentKey = `${session.id}_${item.songId}`;
      const mcVariations = getMCCommentVariations(songData, item.commentTone || 'story');
      const curVarIdx = typeof item.commentVariationIndex === 'number' ? item.commentVariationIndex : 0;
      const mcComment = item.customComment || customComments[savedCommentKey] || mcVariations[curVarIdx % mcVariations.length] || mcVariations[0];

      const card = el('article', {
        class: `stage-overview-card${isCur ? ' is-current' : ''}`,
        'aria-current': isCur ? 'true' : null
      });

      const numBadge = el('div', { class: 'stage-overview-num-badge', text: String(idx + 1) });
      const songTitle = el('h4', {
        class: 'stage-overview-song-title',
        text: item.title,
        title: `${item.title} 1곡 보기 모드로 이동`,
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
      const songMeta = el('span', {
        class: 'stage-overview-song-meta',
        text: `${songData.artist || '아카라카'} · ${songData.arrangement || '혼성 아카펠라'}`
      });

      const titleRow = el('div', { class: 'stage-overview-title-row' },
        songTitle,
        keyStr ? el('span', { class: 'stage-key-badge', text: `Key: ${keyStr}` }) : null,
        item.note ? el('span', { class: 'stage-note-badge', text: item.note }) : null,
        isCur ? el('span', { class: 'stage-current-badge', text: '현재 진행곡' }) : null,
        songMeta
      );

      const leftWrap = el('div', { class: 'stage-overview-card-left' },
        numBadge,
        titleRow
      );

      const resolvedSong = songData || resolveSongData(songs, item?.songId || item?.id, item?.title);
      const targetSongId = resolvedSong?.id || item?.songId || item?.id;

      const videoBtn = button('🎬 연습실 영상', (e) => {
        e.stopPropagation();
        stopPitch(true);
        cleanupStageLive();
        if (typeof navigate === 'function' && targetSongId) {
          navigate({ song: targetSongId });
        } else if (typeof navigate === 'function') {
          navigate({ tab: 'songs' });
        }
      }, 'button secondary small stage-overview-video-btn', null, { title: `${item.title} 아카라카 연습실 상세 페이지로 바로 이동` });

      const focusBtn = button('🎤 1곡 보기', () => {
        stopPitch(true);
        activeIndex = idx;
        session.currentIndex = activeIndex;
        saveActiveStageSession(session);
        liveMode = 'focus';
        try { localStorage.setItem('acaroom_stage_live_submode', 'focus'); } catch {}
        renderAll();
      }, 'button secondary small stage-overview-focus-btn', null, { title: `${idx + 1}번 곡 1곡 보기 모드로 전환` });

      const headerActions = el('div', { class: 'stage-overview-header-actions' },
        videoBtn,
        focusBtn
      );

      const cardHeader = el('div', { class: 'stage-overview-card-header' }, leftWrap, headerActions);

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
            'data-pitch-trigger': 'true',
            title: `${part} 첫 음 ${displayNote} 재생 (3초 후 자동 종료, 빈 화면 터치 시 꺼짐)`,
            onclick: (e) => {
              e.stopPropagation();
              if (isPitchSequencePlaying()) {
                stopPitchSequence();
                updateOverviewPitchUI(null);
                clearStagePitchAutoStop();
                return;
              }
              if (parsed) {
                const current = getCurrentPlaying();
                if (current && !current.isChord && current.semitone === parsed.semitone && current.octave === parsed.octave) {
                  clearStagePitchAutoStop();
                  stopPitch(true);
                  activeOverviewElement = null;
                  updateOverviewPitchUI(null);
                  try { chip.blur(); } catch {}
                  return;
                }
                clearStagePitchAutoStop();
                const res = playPitch(parsed.semitone, parsed.octave, 0.6, true, 3000, { part, displayNote });
                activeOverviewElement = res ? chip : null;
                updateOverviewPitchUI(res);
                if (res) {
                  scheduleStagePitchAutoStop(3000);
                }
              }
            }
          },
            el('strong', { text: shortPart }),
            document.createTextNode(` ${displayNote}`)
          );
          overviewPitchItems.push({ type: 'single', el: chip, parsed, songIndex: idx, part });
          pitchChipsWrap.append(chip);
        });
      }

      let chordBtn = null;
      if (pitchEntries.length > 0) {
        const notesList = pitchEntries.map(([, noteStr]) => noteStr);
        chordBtn = button('🔊 전체 화음', (e) => {
          e.stopPropagation();
          if (isPitchSequencePlaying()) {
            stopPitchSequence();
            updateOverviewPitchUI(null);
            clearStagePitchAutoStop();
            return;
          }
          const current = getCurrentPlaying();
          if (current && current.isChord) {
            clearStagePitchAutoStop();
            stopPitch(true);
            activeOverviewElement = null;
            updateOverviewPitchUI(null);
            try { chordBtn.blur(); } catch {}
            return;
          }
          clearStagePitchAutoStop();
          const res = playChordStrings(notesList, 0.4, true, 3000);
          activeOverviewElement = res ? chordBtn : null;
          updateOverviewPitchUI(res);
          if (res) {
            scheduleStagePitchAutoStop(3000);
          }
        }, 'stage-overview-chord-btn', null, { title: '이 곡의 전체 파트 시작 화음 동시 재생 (3초 후 자동 종료, 빈 화면 터치 시 꺼짐)' });
        chordBtn.dataset.pitchTrigger = 'true';
        overviewPitchItems.push({ type: 'chord', el: chordBtn, notesList, songIndex: idx });
      }

      const pitchBar = el('div', { class: 'stage-overview-pitch-bar' },
        el('span', { class: 'stage-overview-pitch-label' }, icon('music'), document.createTextNode('첫 음')),
        pitchChipsWrap,
        chordBtn
      );

      const mcTextEl = el('span', { class: 'stage-overview-mc-text', text: mcComment });
      const mcRefreshBtn = el('button', {
        type: 'button',
        class: 'stage-overview-mc-refresh-btn',
        title: '다른 추천 멘트 보기 (10가지 이상)',
        onclick: (e) => {
          e.stopPropagation();
          const vars = getMCCommentVariations(songData, item.commentTone || 'story');
          const curIdx = typeof item.commentVariationIndex === 'number' ? item.commentVariationIndex : 0;
          const nextIdx = (curIdx + 1) % vars.length;
          item.commentVariationIndex = nextIdx;
          const next = vars[nextIdx];
          mcTextEl.textContent = next;
          item.customComment = next;
          customComments[savedCommentKey] = next;
          saveActiveStageSession(session);
          toast(`[${item.title}] 멘트 변경 (${nextIdx + 1}/${vars.length})`);
        }
      }, icon('refresh'));

      const mcBox = el('div', { class: 'stage-overview-mc-box' },
        icon('mic'),
        mcTextEl,
        mcRefreshBtn
      );

      const cardBody = el('div', { class: 'stage-overview-card-body' }, pitchBar, mcBox);

      card.append(cardHeader, cardBody);
      list.append(card);
    });

    overviewViewArea.append(topBar, list);
    updateOverviewPitchUI(getCurrentPlaying());
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
    clearStagePitchAutoStop();
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

      const actions = el('div', { class: 'stage-history-actions' }, loadBtn, cloneBtn, deleteBtn);

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

  const allAvailableSongs = [...songs];
  for (const extra of Object.values(STAGE_EXTRA_SONG_METADATA)) {
    if (!allAvailableSongs.some(s => s.id === extra.id)) {
      allAvailableSongs.push(extra);
    }
  }

  // Song Adder Dropdown
  const songSelect = el('select', { class: 'search-input', style: 'flex: 1;' },
    allAvailableSongs.map(s => el('option', { value: s.id, text: `${s.title} (${s.arrangement || s.category || ''})` }))
  );

  const addSongBtn = button('+ 곡 추가', () => {
    const selectedId = songSelect.value;
    const selectedSong = allAvailableSongs.find(s => s.id === selectedId);
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

/**
 * 무대 큐시트에서 곡별 아카라카 연습실 영상 및 파트별 영상을 즉시 재생하는 팝업 모달
 */
export function openSongPracticeVideoModal({ song, songs, navigate }) {
  if (!song) return;
  const songId = song.songId || song.id || '';
  const fullSong = resolveSongData(songs, songId, song.title || '');
  const targetId = fullSong?.id || songId;

  // 상세 페이지로 바로 이동 (사용자 요구사항 반영)
  if (typeof navigate === 'function' && targetId) {
    stopPitch(true);
    cleanupStageLive();
    navigate({ song: targetId });
    return;
  }

  const songTitle = fullSong.title || song.title || '곡명 미지정';

  const existing = document.getElementById('stage-practice-video-dialog');
  if (existing) {
    existing.close();
    existing.remove();
  }

  const dialog = el('dialog', {
    id: 'stage-practice-video-dialog',
    class: 'stage-modal-dialog stage-practice-video-modal',
    'aria-labelledby': 'stage-practice-video-title'
  });

  const closeBtn = el('button', {
    type: 'button',
    class: 'dialog-close-x',
    'aria-label': '닫기',
    onclick: () => dialog.close()
  }, '✕');

  const categoryBadge = fullSong.category ? el('span', { class: 'stage-hero-badge', text: fullSong.category }) : null;
  const keyStr = fullSong.musicalKey || fullSong.startingPitches?.key;
  const keyBadge = keyStr ? el('span', { class: 'stage-key-badge', text: `Key: ${keyStr}` }) : null;

  const header = el('div', { class: 'stage-modal-header' },
    el('div', { style: 'flex: 1; min-width: 0;' },
      el('div', { style: 'display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;' },
        el('span', { class: 'badge', style: 'background: rgba(45, 212, 191, 0.2); color: #2dd4bf; border-color: rgba(45, 212, 191, 0.4);', text: '🎬 아카라카 연습실 영상' }),
        categoryBadge,
        keyBadge
      ),
      el('h3', { id: 'stage-practice-video-title', text: songTitle }),
      fullSong.artist ? el('p', { style: 'margin: 4px 0 0; font-size: 13px; color: var(--muted);', text: `${fullSong.artist} · ${fullSong.arrangement || '아카펠라'}` }) : null
    ),
    closeBtn
  );

  const partLabels = {
    full: '전체 합창 영상',
    lead: '리드 (Lead)',
    soprano: '소프라노 (Soprano)',
    alto: '알토 (Alto)',
    tenor: '테너 (Tenor)',
    baritone: '바리톤 (Baritone)',
    bass: '베이스 (Bass)',
    vp: '보컬퍼커션 (VP)',
    part1: '1번 파트',
    part2: '2번 파트',
    part3: '3번 파트',
    part4: '4번 파트',
    part5: '5번 파트',
    part6: '6번 파트',
    part7: '7번 파트'
  };

  const videoEntries = [];
  if (fullSong && fullSong.videos && typeof fullSong.videos === 'object') {
    for (const [key, vData] of Object.entries(fullSong.videos)) {
      if (!vData) continue;
      const url = typeof vData === 'string' ? vData : vData.url;
      if (url && typeof url === 'string' && url.trim().length > 0) {
        videoEntries.push({
          key,
          label: partLabels[key] || key.toUpperCase(),
          url: url.trim()
        });
      }
    }
  }

  let activePlayer = null;
  const playerHost = el('div', { class: 'stage-practice-player-host' });

  function mountActiveVideo(videoItem) {
    if (activePlayer) {
      try { activePlayer.destroy?.(); } catch {}
      activePlayer = null;
    }
    if (videoItem && videoItem.url) {
      activePlayer = createPlayer(playerHost, videoItem.url, `${songTitle} - ${videoItem.label}`);
    } else {
      const query = encodeURIComponent(`아카펠라 ${songTitle} ${fullSong?.artist || ''}`);
      const ytSearchUrl = `https://www.youtube.com/results?search_query=${query}`;
      playerHost.replaceChildren(
        el('div', { class: 'stage-video-empty-state', style: 'padding: 28px 16px; text-align: center; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.15);' },
          el('p', { style: 'font-size: 15px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px;', text: '등록된 공식 연습실 영상이 없습니다' }),
          el('p', { style: 'font-size: 12.5px; color: #94a3b8; margin-bottom: 16px;', text: 'YouTube에서 해당 곡의 다양한 아카펠라 영상을 직접 검색해 보실 수 있습니다.' }),
          el('a', {
            href: ytSearchUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'button secondary small',
            text: 'YouTube에서 영상 검색하기 ↗'
          })
        )
      );
    }
  }

  const partSelectorBar = el('div', { class: 'stage-video-part-bar' });
  if (videoEntries.length > 1) {
    videoEntries.forEach((vItem, i) => {
      const partBtn = button(vItem.label, () => {
        mountActiveVideo(vItem);
        partSelectorBar.querySelectorAll('.stage-video-part-chip').forEach(b => b.classList.remove('active'));
        partBtn.classList.add('active');
      }, `stage-video-part-chip${i === 0 ? ' active' : ''}`);
      partSelectorBar.append(partBtn);
    });
  }

  mountActiveVideo(videoEntries[0] || null);

  const footerActions = el('div', { class: 'stage-video-modal-footer' });

  const gotoPracticeRoomBtn = button('아카라카 연습실 상세 페이지로 이동 ↗', () => {
    dialog.close();
    if (typeof navigate === 'function' && fullSong.id) {
      navigate({ song: fullSong.id });
    }
  }, 'button primary small', 'arrow', { title: '악보 창고, 가사 및 전체 파트 연습 페이지로 이동' });

  const dismissBtn = button('닫기', () => dialog.close(), 'button secondary small');

  footerActions.append(gotoPracticeRoomBtn, dismissBtn);

  const body = el('div', { class: 'stage-modal-body' },
    partSelectorBar.children.length ? partSelectorBar : null,
    playerHost,
    footerActions
  );

  dialog.append(header, body);
  document.body.append(dialog);
  dialog.showModal();

  dialog.addEventListener('close', () => {
    if (activePlayer) {
      try { activePlayer.destroy?.(); } catch {}
      activePlayer = null;
    }
    dialog.remove();
  });
}
