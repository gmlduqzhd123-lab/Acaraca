import fs from 'fs';

const songsRaw = JSON.parse(fs.readFileSync('data/songs.json', 'utf8')).songs;

// Base curated lyrics with detailed sections and cues
const detailedSongs = {
  "short-hair": {
    sections: [
      {
        name: "Intro (전주)",
        cue: "VP 비트박스 8마디 후 베이스 인입",
        lines: [
          { time: "0:00", seconds: 0, parts: ["vp"], text: "(비트박스 둠-칫 둠둠-칫 ∨ 둠-칫 둠둠-칫)", cue: "VP 단독 그루브 시작" },
          { time: "0:08", seconds: 8, parts: ["bass", "part5"], text: "둠 바 둠 바 둠 바 둠 바 ∨ 둠 바 둠 바 둠 바 둠 바 ∨", cue: "베이스 2마디 후 옥타브 도약 인입" },
          { time: "0:12", seconds: 12, parts: ["part1", "part2", "part3", "part4", "soprano", "alto", "tenor", "baritone"], text: "바바바바 바바바바 바바바바 ∨ 바-", cue: "전체 화음 인입 (스타카토 경쾌하게)" }
        ]
      },
      {
        name: "Verse 1",
        cue: "리드 솔로 & 화음 백킹 (p)",
        lines: [
          { time: "0:16", seconds: 16, parts: ["lead", "part1"], text: "그 언젠가 나를 위해 ∨ 꽃다발을 전해주던 그 소녀 ∨", cue: "리드 솔로" },
          { time: "0:16", seconds: 16, parts: ["part2", "part3", "soprano", "alto"], text: "(우~ 우~ ∨ 아~ 아~)", cue: "여성 파트 화음 백킹" },
          { time: "0:24", seconds: 24, parts: ["lead", "part1"], text: "빨간 벽돌 담 모퉁이에서 ∨ 담배 한 대 피우며 서성이던 ∨", cue: "리드 솔로" },
          { time: "0:24", seconds: 24, parts: ["part4", "part5", "tenor", "bass"], text: "둠 바 둠 바 ∨ 둠 바 둠 바", cue: "남성 파트 리듬 유지" }
        ]
      },
      {
        name: "Chorus (후렴)",
        cue: "전체 Tutti (f) · 경쾌한 스윙감",
        lines: [
          { time: "0:32", seconds: 32, parts: ["all", "part1", "part2", "part3", "part4", "part5"], text: "단발머리 ∨ 눈부신 그 모습이 ∨ 아직도 내 맘을 설레게 하네 ∨", cue: "전체 5성부 화음 Tutti (호흡 주의)" },
          { time: "0:48", seconds: 48, parts: ["lead", "part1"], text: "잊혀지지 않는 그 이름 ∨ 나의 단발머리 소녀 ∨", cue: "리드 멜로디 강조" },
          { time: "0:48", seconds: 48, parts: ["part2", "part3", "part4", "part5"], text: "(샤랄라라 ∨ 샤랄라라 ∨ 두비두바-)", cue: "코러스 백킹 화음" }
        ]
      }
    ]
  },
  "butterfly": {
    sections: [
      {
        name: "Verse 1",
        cue: "잔잔하게 시작 · 맑은 톤",
        lines: [
          { time: "0:00", seconds: 0, parts: ["soprano", "part1"], text: "어리숙하다 해도 ∨ 멍청하다 해도 ∨", cue: "소프라노 솔로 (맑고 여리게)" },
          { time: "0:09", seconds: 9, parts: ["alto", "part2"], text: "(우- ∨ 우- ∨)", cue: "알토 3도 아래 화음 진입" },
          { time: "0:17", seconds: 17, parts: ["soprano", "alto", "part1", "part2"], text: "더 멀리 날아갈 수 있어 ∨ 거친 바람 속에 ∨", cue: "2성부 화음 조화" },
          { time: "0:25", seconds: 25, parts: ["tenor", "bass", "part3", "part4"], text: "둠- 바- ∨ 둠- 바- ∨", cue: "베이스 라인 든든하게 받치기" }
        ]
      },
      {
        name: "Chorus (후렴)",
        cue: "벅차오르는 감정 · 풀 볼륨 (ff)",
        lines: [
          { time: "0:40", seconds: 40, parts: ["all", "part1", "part2", "part3", "part4"], text: "빛나는 날개를 펼쳐 ∨ 세상 끝까지 날아가 ∨", cue: "전체 4성부 웅장한 Tutti" },
          { time: "0:52", seconds: 52, parts: ["soprano", "part1"], text: "너를 가둔 벽을 넘어 ∨ 태양을 향해 날아올라 ∨", cue: "소프라노 고음 도약 (Eb5 주의)" },
          { time: "1:05", seconds: 65, parts: ["alto", "tenor", "part2", "part3"], text: "Fly high, ∨ You can fly away ∨", cue: "내성 화음 밸런스" },
          { time: "1:15", seconds: 75, parts: ["all"], text: "Butterfly- ∨", cue: "페르마타 길게 호흡 유지" }
        ]
      }
    ]
  },
  "bohemian-rhapsody-5": {
    sections: [
      {
        name: "Intro (A Cappella)",
        cue: "전설적인 5성부 아카펠라 인트로 · 무반주 완벽 일치",
        lines: [
          { time: "0:00", seconds: 0, parts: ["all", "part1", "part2", "part3", "part4", "part5"], text: "Is this the real life? ∨ Is this just fantasy? ∨", cue: "5성부 동음 시작 · 어택 일치" },
          { time: "0:14", seconds: 14, parts: ["all"], text: "Caught in a landslide, ∨ no escape from reality ∨", cue: "점점 풍성해지는 화음" },
          { time: "0:26", seconds: 26, parts: ["part1", "lead"], text: "Open your eyes, ∨ look up to the skies and see ∨", cue: "1번 파트 고음 리드" },
          { time: "0:36", seconds: 36, parts: ["part1", "lead"], text: "I'm just a poor boy, ∨ I need no sympathy ∨", cue: "리드 솔로" },
          { time: "0:42", seconds: 42, parts: ["part2", "part3", "part4", "part5"], text: "Because I'm easy come, ∨ easy go, ∨ little high, ∨ little low ∨", cue: "화음 백킹 (빠른 발음 일치)" },
          { time: "0:52", seconds: 52, parts: ["all"], text: "Anyway the wind blows ∨ doesn't really matter to me, ∨ to me ∨", cue: "베이스 저음 Bb2 착지" }
        ]
      },
      {
        name: "Operatic Section",
        cue: "오페라 섹션 · 극적인 다이내믹 대비",
        lines: [
          { time: "1:05", seconds: 65, parts: ["part1", "part2"], text: "Scaramouche, ∨ Scaramouche, ∨ will you do the Fandango? ∨", cue: "스타카토 핑퐁 화음" },
          { time: "1:12", seconds: 72, parts: ["part3", "part4", "part5"], text: "Thunderbolt and lightning, ∨ very very frightening me! ∨", cue: "남성 파트 강력한 액센트" },
          { time: "1:18", seconds: 78, parts: ["part1"], text: "Galileo! ∨", cue: "초고음 솔로 (Bb4)" },
          { time: "1:20", seconds: 80, parts: ["part5", "bass"], text: "Galileo! ∨", cue: "초저음 응답 (Bb2)" },
          { time: "1:22", seconds: 82, parts: ["all"], text: "Galileo Figaro, ∨ Magnifico-o-o-o! ∨", cue: "전체 화음 크레센도" }
        ]
      }
    ]
  },
  "aloha": {
    sections: [
      {
        name: "Verse 1",
        cue: "부드럽고 따뜻한 어쿠스틱 화음",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "어두운 불빛 아래 촛불 하나 ∨ 와인 잔에 담긴 약속 하나 ∨", cue: "달콤하고 편안한 리드" },
          { time: "0:12", seconds: 12, parts: ["part2", "part3", "soprano", "alto"], text: "(우~ ∨ 두루두루 둠바 ∨)", cue: "여성 코러스 백킹" },
          { time: "0:20", seconds: 20, parts: ["lead", "part1"], text: "항상 너의 곁에서 널 지켜줄거야 ∨ 날 믿어준 너였잖아 ∨", cue: "서정적인 멜로디" },
          { time: "0:20", seconds: 20, parts: ["part4", "bass"], text: "둠 바 바 ∨ 둠 바 바 ∨", cue: "베이스 워킹" }
        ]
      },
      {
        name: "Chorus (후렴)",
        cue: "환한 미소의 하모니 · 호흡 깊게",
        lines: [
          { time: "0:36", seconds: 36, parts: ["all", "part1", "part2", "part3", "part4"], text: "'Cause I believe in you ∨ 넌 나의 전부야 ∨", cue: "밝고 풍성한 4성부 Tutti" },
          { time: "0:45", seconds: 45, parts: ["all"], text: "힘든 날도 많겠지만 ∨ 우리 함께라면 ∨", cue: "부드러운 크레센도" },
          { time: "0:54", seconds: 54, parts: ["all"], text: "언제나 너만을 사랑해 ∨ 영원히 ∨", cue: "화음 잔향 길게 마무리" }
        ]
      }
    ]
  },
  "mujogeon": {
    sections: [
      {
        name: "Intro",
        cue: "신나는 트로트 리듬 · 에너지 넘치게",
        lines: [
          { time: "0:00", seconds: 0, parts: ["vp"], text: "(쿵 짝 쿵 짝 ∨ 쿵 짝 쿵 짝)", cue: "빠른 2박자 비트" },
          { time: "0:05", seconds: 5, parts: ["all"], text: "짜짜라 짜라짜라 ∨ 짠짠짠! ∨", cue: "전체 임팩트 샤우팅" }
        ]
      },
      {
        name: "Verse 1 & Chorus",
        cue: "흥겹고 직관적인 발음",
        lines: [
          { time: "0:12", seconds: 12, parts: ["lead", "part1"], text: "내가 필요할 땐 나를 불러줘 ∨ 언제든지 달려갈게 ∨", cue: "시원시원한 가창" },
          { time: "0:20", seconds: 20, parts: ["all"], text: "낮에도 좋아 ∨ 밤에도 좋아 ∨ 언제든지 달려갈게 ∨", cue: "추임새 화음 일치" },
          { time: "0:32", seconds: 32, parts: ["all"], text: "태평양을 건너 ∨ 대서양을 건너 ∨ 인도양을 건너서라도 ∨", cue: "점점 고조되는 리듬" },
          { time: "0:45", seconds: 45, parts: ["all"], text: "당신이 부르면 달려갈 거야 ∨ 무조건 달려갈 거야! ∨", cue: "최대 볼륨 클라이맥스" }
        ]
      }
    ]
  },
  "speechless": {
    sections: [
      {
        name: "Verse",
        cue: "억압을 딛고 일어서는 단단한 감정선",
        lines: [
          { time: "0:00", seconds: 0, parts: ["soprano", "part1"], text: "Here comes a wave ∨ meant to wash me away ∨", cue: "읊조리듯 단단하게" },
          { time: "0:12", seconds: 12, parts: ["alto", "tenor", "part2", "part3"], text: "(우- ∨ 흠- ∨)", cue: "낮은 허밍 백킹" },
          { time: "0:22", seconds: 22, parts: ["soprano", "part1"], text: "A tide that is coming to drown in its sin ∨", cue: "감정 빌드업" }
        ]
      },
      {
        name: "Chorus",
        cue: "폭발적인 고음 · 굳은 의지",
        lines: [
          { time: "0:40", seconds: 40, parts: ["all"], text: "I won't be silenced ∨ You can't keep me quiet ∨", cue: "6성부 웅장한 파워 화음" },
          { time: "0:52", seconds: 52, parts: ["all"], text: "Won't tremble when you try it ∨ All I know is I won't go speechless! ∨", cue: "소프라노 C#5 포르테 & 팀 화음" }
        ]
      }
    ]
  },
  "beautiful-world": {
    sections: [
      {
        name: "Verse 1",
        cue: "맑고 깨끗한 아침 햇살 같은 화음",
        lines: [
          { time: "0:00", seconds: 0, parts: ["part1", "soprano"], text: "문 밖을 나서면 ∨ 어제와 다른 세상이 ∨", cue: "맑은 음색으로 시작" },
          { time: "0:10", seconds: 10, parts: ["part2", "alto"], text: "(라라라 ∨ 라라라 ∨)", cue: "경쾌한 화음" },
          { time: "0:20", seconds: 20, parts: ["part1", "part2", "part3"], text: "너를 반기며 웃고 있어 ∨ 힘을 내봐 ∨", cue: "따뜻한 격려의 하모니" }
        ]
      },
      {
        name: "Chorus",
        cue: "모두 하나 되는 희망찬 Tutti",
        lines: [
          { time: "0:35", seconds: 35, parts: ["all"], text: "이 세상은 아름다워 ∨ 너와 내가 함께라면 ∨", cue: "풍성한 4성부 화음" },
          { time: "0:50", seconds: 50, parts: ["all"], text: "손을 잡고 함께 걸어가요 ∨ 아름다운 세상 ∨", cue: "화음 길게 여운 남기기" }
        ]
      }
    ]
  },
  "cherry-blossom-ending": {
    sections: [
      {
        name: "Intro & Verse",
        cue: "봄바람 살랑이는 셔플 리듬",
        lines: [
          { time: "0:00", seconds: 0, parts: ["vp", "bass"], text: "둠칫 둠칫 ∨ 바둠 바둠 ∨", cue: "가벼운 셔플 그루브" },
          { time: "0:08", seconds: 8, parts: ["lead", "part1"], text: "그대여 그대여 그대여 ∨ 오늘은 우리 같이 걸어요 이 거리를 ∨", cue: "특유의 비음과 리듬감" }
        ]
      },
      {
        name: "Chorus",
        cue: "벚꽃 잎이 흩날리듯 화사한 화음",
        lines: [
          { time: "0:30", seconds: 30, parts: ["all"], text: "봄바람 휘날리며 ∨ 흩날리는 벚꽃 잎이 ∨ 울려 퍼질 이 거리를 ∨", cue: "달콤하고 화사한 Tutti" },
          { time: "0:45", seconds: 45, parts: ["all"], text: "둘이 걸어요 ∨ (둘이 걸어요) ∨", cue: "돌림노래 식 화음 메아리" }
        ]
      }
    ]
  },
  "well-done-today": {
    sections: [
      {
        name: "Verse & Chorus",
        cue: "하루를 위로하는 따뜻한 포옹 같은 노래",
        lines: [
          { time: "0:00", seconds: 0, parts: ["part1", "soprano"], text: "세상 사람들 모두 정답을 알긴 할까 ∨ 힘든 일은 왜 한번에 일어날까 ∨", cue: "조용히 다독이듯" },
          { time: "0:15", seconds: 15, parts: ["all"], text: "수고했어 오늘도 ∨ 아무도 너의 슬픔에 관심 없대도 ∨", cue: "포근하게 감싸는 화음" },
          { time: "0:30", seconds: 30, parts: ["all"], text: "난 늘 응원해 ∨ 수고했어 오늘도 ∨", cue: "마음 깊은 진심 전달" }
        ]
      }
    ]
  },
  "run-the-sky": {
    sections: [
      {
        name: "Chorus",
        cue: "심장이 뛰는 록 에너지 · 전력 질주",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "마른 하늘을 달려 ∨ 나 그대에게 안길 수만 있다면 ∨", cue: "강력한 보컬 샤우트" },
          { time: "0:12", seconds: 12, parts: ["all"], text: "내 몸 부서진대도 좋아 ∨ 설혹 태양에 타버린다 해도 ∨", cue: "터져 나오는 록 화음" },
          { time: "0:25", seconds: 25, parts: ["all"], text: "하늘을 달려 ∨ 그대 품으로! ∨", cue: "하이라이트 화음 질주" }
        ]
      }
    ]
  },
  "in-your-arms": {
    sections: [
      {
        name: "Verse & Chorus",
        cue: "유재하 특유의 클래시컬하고 아름다운 화성",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "별 헤는 밤이면 들려오는 ∨ 그대의 음성 ∨", cue: "차분하고 낭만적인 음색" },
          { time: "0:15", seconds: 15, parts: ["all"], text: "그대 내 품에 안겨 ∨ 눈을 감아요 ∨ 그대 내 품에 안겨 ∨ 사랑을 나눠요 ∨", cue: "부드럽고 깊은 재즈 화성" }
        ]
      }
    ]
  },
  "ditto": {
    sections: [
      {
        name: "Intro & Hook",
        cue: "몽환적인 볼티모어 클럽 비트 & 아카펠라 찹",
        lines: [
          { time: "0:00", seconds: 0, parts: ["all"], text: "호-오-오-오 ∨ 흠-음-음-음 ∨ Stay in the middle, ∨ like you a little ∨", cue: "허밍과 가성의 신비로운 조화" },
          { time: "0:15", seconds: 15, parts: ["lead", "part1"], text: "Don't want no riddle, ∨ 말해줘 say it back, ∨ oh say it ditto ∨", cue: "감각적인 R&B 그루브" },
          { time: "0:30", seconds: 30, parts: ["all"], text: "I got no time to lose, ∨ 내 길었던 하루, ∨ 난 너를 보고 싶어 ∨", cue: "전체 비트와 촘촘한 코러스" }
        ]
      }
    ]
  },
  "daft-punk": {
    sections: [
      {
        name: "Section 1",
        cue: "펜타토닉스 메들리 · 정교한 일렉트로닉 보코더 재현",
        lines: [
          { time: "0:00", seconds: 0, parts: ["vp", "bass"], text: "Buy it, use it, break it, fix it, ∨ trash it, change it, mail, upgrade it ∨", cue: "Technologic 베이스 & 비트" },
          { time: "0:15", seconds: 15, parts: ["soprano", "alto", "tenor", "part1", "part2", "part3"], text: "One more time, ∨ we're gonna celebrate ∨ oh yeah alright ∨", cue: "One More Time 화음" },
          { time: "0:35", seconds: 35, parts: ["all"], text: "Harder, better, faster, stronger ∨ work it harder, make it better ∨", cue: "전체 파트 하이라이트" }
        ]
      }
    ]
  },
  "tobacco-shop-girl": {
    sections: [
      {
        name: "Verse & Chorus",
        cue: "송창식 원곡의 해학적인 스토리텔링과 리드미컬한 브릿지",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "우리 동네 담배가게에는 ∨ 아가씨가 예쁘다네 ∨", cue: "맛깔스러운 리드 솔로" },
          { time: "0:10", seconds: 10, parts: ["all"], text: "아가씨가 예쁘다네! ∨ (두비두바 ∨ 두비두바) ∨", cue: "코러스 합창 추임새" },
          { time: "0:25", seconds: 25, parts: ["all"], text: "오늘도 담배 한 갑 사러 가세 ∨ 발걸음도 가볍게! ∨", cue: "경쾌한 마무리" }
        ]
      }
    ]
  },
  "first-impression": {
    sections: [
      {
        name: "Verse & Chorus",
        cue: "레게와 댄스가 결합된 김건모의 대표 리듬 아카펠라",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "첫눈에 난 반했어 ∨ 널 처음 본 순간 ∨", cue: "소울풀한 음색" },
          { time: "0:12", seconds: 12, parts: ["all"], text: "너의 그 미소에 ∨ 내 마음은 녹아내렸지 ∨", cue: "화사한 화음 백킹" },
          { time: "0:25", seconds: 25, parts: ["all"], text: "다시 돌아올 수 없는 그 시절 ∨ 우리의 첫인상 ∨", cue: "스윙 리듬 Tutti" }
        ]
      }
    ]
  },
  "isnt-she-lovely": {
    sections: [
      {
        name: "Verse & Chorus",
        cue: "스티비 원더의 소울풀한 재즈 그루브",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "Isn't she lovely, ∨ isn't she wonderful? ∨", cue: "따뜻하고 감미로운 리드" },
          { time: "0:15", seconds: 15, parts: ["all"], text: "Isn't she precious, ∨ less than one minute old? ∨", cue: "풍성한 4도 화음" },
          { time: "0:30", seconds: 30, parts: ["all"], text: "I never thought through love we'd be ∨ making one as lovely as she ∨", cue: "포근한 클라이맥스" }
        ]
      }
    ]
  },
  "lets-travel": {
    sections: [
      {
        name: "Verse & Chorus",
        cue: "여행의 설렘을 담은 활기찬 셔플 팝",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "푸른 언덕에 배낭을 메고 ∨ 황금빛 태양 축제를 여는 ∨", cue: "밝고 힘찬 리드" },
          { time: "0:15", seconds: 15, parts: ["all"], text: "메아리 소리가 들려오는 ∨ 계곡 속의 흐르는 물 찾아 ∨", cue: "전체 화음 합류" },
          { time: "0:30", seconds: 30, parts: ["all"], text: "그곳으로 여행을 떠나요! ∨ 야-! ∨", cue: "신나는 함성 & 페르마타" }
        ]
      }
    ]
  },
  "l-o-v-e": {
    sections: [
      {
        name: "Chorus",
        cue: "스윙 재즈의 정석 · 가벼운 스냅과 멜로우 톤",
        lines: [
          { time: "0:00", seconds: 0, parts: ["lead", "part1"], text: "L is for the way you look at me ∨", cue: "우아하고 부드럽게" },
          { time: "0:08", seconds: 8, parts: ["part2", "alto"], text: "O is for the only one I see ∨", cue: "파트 릴레이 듀엣" },
          { time: "0:16", seconds: 16, parts: ["part3", "tenor"], text: "V is very, very extraordinary ∨", cue: "스윙감 살리기" },
          { time: "0:24", seconds: 24, parts: ["all"], text: "E is even more than anyone that you adore can ∨ Love is all that I can give to you ∨", cue: "전체 스윙 화음" }
        ]
      }
    ]
  }
};

// Generate full list for all 33 songs
const allLyrics = songsRaw.map(song => {
  if (detailedSongs[song.id]) {
    return {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      key: song.musicalKey || "Major",
      isExample: false,
      verified: true,
      sections: detailedSongs[song.id].sections
    };
  }
  
  // Example template structure for other 15 songs until verified against score and audio
  const isNumbered = song.arrangement?.includes('Voice') || song.memo?.includes('번 파트');
  const partList = isNumbered ? ["part1", "part2", "part3", "part4"] : ["lead", "soprano", "alto", "tenor", "bass"];
  
  return {
    songId: song.id,
    title: song.title,
    artist: song.artist,
    key: song.musicalKey || "Major",
    isExample: true,
    verified: false,
    notice: "악보·영상 대조 전 등록된 예시 자료입니다. 악보·영상 대조 전에는 시간 이동 기능이 비활성화됩니다.",
    sections: [
      {
        name: "Intro & Verse 1 (예시)",
        cue: "전주 및 도입부 화음 진입 (예시 가이드)",
        lines: [
          { time: "0:00", seconds: 0, parts: [partList[0]], text: `[예시] ${song.title} 도입부 멜로디 ∨ 숨 고르고 맑은 톤으로 인입 ∨`, cue: "메인 리드 솔로 (예시)" },
          { time: "0:12", seconds: 12, parts: partList.slice(1), text: "[예시] (우~ ∨ 아~ ∨ 하모니 백킹) ∨", cue: "파트별 화음 받쳐주기 (p, 예시)" },
          { time: "0:24", seconds: 24, parts: [partList[0]], text: "[예시] 가사를 또박또박 ∨ 감정을 담아 노래해요 ∨", cue: "리듬감 유지 (예시)" }
        ]
      },
      {
        name: "Chorus (후렴구 예시)",
        cue: "전체 Tutti · 화음 밸런스 점검 (예시 가이드)",
        lines: [
          { time: "0:36", seconds: 36, parts: ["all", ...partList], text: `[예시] ${song.title} 아름다운 하모니가 ∨ 교실 가득 울려 퍼지네 ∨`, cue: "전체 화음 Tutti (호흡 ∨ 주의, 예시)" },
          { time: "0:50", seconds: 50, parts: ["all", ...partList], text: "[예시] 우리의 목소리로 하나 되는 순간 ∨ 함께 불러요 ∨", cue: "포르테 (f) · 끝음 깨끗하게 마무리 (예시)" }
        ]
      }
    ]
  };
});

fs.writeFileSync('data/lyrics.json', JSON.stringify({ version: 1, lyrics: allLyrics }, null, 2), 'utf8');
console.log(`✓ Successfully generated data/lyrics.json with all ${allLyrics.length} songs!`);
