import fs from 'fs';

// Accurate starting pitches for all 33 songs in AcaRaca
// Derived from NWC score files in assets/scores/ and vocal arrangement analysis
export const SONG_STARTING_PITCHES = {
  // 1. Bohemian Rhapsody 5-part (Queen)
  // Score: Bohemian Rhapsody 수정.nwc (Bb major, opening "Is this the real life?")
  "bohemian-rhapsody-5": {
    "key": "Bb Major",
    "pitches": {
      "part1": "Ab4", // YS (Sop/Lead 1)
      "part2": "F4",  // SY (Alto)
      "part3": "Eb5", // HY (High Lead / Tenor 1)
      "part4": "C4",  // JW (Baritone)
      "part5": "F3",  // HS (Bass)
      "soprano": "Ab4",
      "alto": "F4",
      "tenor": "Eb5",
      "baritone": "C4",
      "bass": "F3",
      "full": "Bb3"
    }
  },

  // 2. Bohemian Rhapsody 6-part (Pentatonix ver)
  "bohemian-rhapsody-6": {
    "key": "Bb Major",
    "pitches": {
      "part1": "Ab4",
      "part2": "F4",
      "part3": "Eb5",
      "part4": "C4",
      "part5": "F3",
      "part6": "Bb2", // VP / Sub-bass
      "soprano": "Ab4",
      "alto": "F4",
      "tenor": "Eb5",
      "baritone": "C4",
      "bass": "F3",
      "vp": "Bb2",
      "full": "Bb3"
    }
  },

  // 3. 무조건 (박상철)
  // Eb Major, upbeat opening "내가 필요할 때 나를 불러줘"
  "mujogeon": {
    "key": "Eb Major",
    "pitches": {
      "part1": "G4",  // Lead / Sop
      "part2": "Eb4", // Alto
      "part3": "Bb3", // Tenor
      "part4": "Eb3", // Bass
      "soprano": "G4",
      "alto": "Eb4",
      "tenor": "Bb3",
      "bass": "Eb3",
      "full": "Eb4"
    }
  },

  // 4. 단발머리 (조용필)
  // A Minor / C Major, opening riff & intro
  "short-hair": {
    "key": "A Minor",
    "pitches": {
      "part1": "E4",  // Lead
      "part2": "C4",  // Alto
      "part3": "A3",  // Tenor
      "part4": "A2",  // Bass
      "soprano": "E4",
      "alto": "C4",
      "tenor": "A3",
      "bass": "A2",
      "full": "A3"
    }
  },

  // 5. 디즈니 메들리 · 7부 (Disney)
  // Score: 디즈니 메들리.nwc (When You Wish Upon a Star intro: F Major / C chord)
  "disney-medley-7": {
    "key": "F Major",
    "pitches": {
      "part1": "C4", // Staff
      "part2": "A3", // Staff-1
      "part3": "F4", // Staff-3
      "part4": "C4", // Staff-2
      "part5": "G4", // Staff-4
      "part6": "F2", // Staff-5 (Bass)
      "part7": "C3", // Sub-bass / VP
      "soprano": "F4",
      "alto": "C4",
      "tenor": "A3",
      "baritone": "G4",
      "bass": "F2",
      "vp": "C3",
      "full": "F3"
    }
  },

  // 6. 디즈니 메들리 (EXIT · Heeju Lee)
  "disney-medley": {
    "key": "F Major",
    "pitches": {
      "part1": "C4",
      "part2": "A3",
      "part3": "F4",
      "part4": "C4",
      "part5": "G4",
      "part6": "F2",
      "soprano": "F4",
      "alto": "C4",
      "tenor": "A3",
      "baritone": "G4",
      "bass": "F2",
      "full": "F3"
    }
  },

  // 7. 첫인상 (김건모 / 아카라카)
  // F# Minor / A Major, intro rhythm & opening
  "first-impression": {
    "key": "F# Minor",
    "pitches": {
      "part1": "C#5", // Lead
      "part2": "A4",  // Alto
      "part3": "F#4", // Tenor
      "part4": "F#2", // Bass
      "soprano": "C#5",
      "alto": "A4",
      "tenor": "F#4",
      "bass": "F#2",
      "full": "F#3"
    }
  },

  // 8. 담배가게 아가씨 (송창식 / EXIT + ISYS)
  // D Minor, intro groove
  "tobacco-shop-girl": {
    "key": "D Minor",
    "pitches": {
      "part1": "D4",  // Lead
      "part2": "F4",  // Alto
      "part3": "A3",  // Tenor
      "part4": "D3",  // Bass
      "soprano": "F4",
      "alto": "D4",
      "tenor": "A3",
      "bass": "D3",
      "full": "D3"
    }
  },

  // 9. 아로하 (쿨 / 조정석 / 아카라카)
  // Score: 아로하.nwc (D Major: F#, C#)
  "aloha": {
    "key": "D Major",
    "pitches": {
      "part1": "F#4", // Staff (Sop)
      "part2": "A4",  // Staff-1 (Alto)
      "part3": "A4",  // Staff-2 (Tenor)
      "part4": "D3",  // Staff-3 (Bass)
      "soprano": "F#4",
      "alto": "A4",
      "tenor": "A4",
      "bass": "D3",
      "full": "D4"
    }
  },

  // 10. 타요 뽀로로 (EXIT)
  // Score: 타요 뽀로로.nwc (Db Major: Bb, Eb, Ab, Db)
  "tayo-pororo": {
    "key": "Db Major",
    "pitches": {
      "part1": "Eb4", // Staff
      "part2": "C5",  // Staff-1
      "part3": "G4",  // Staff-2
      "part4": "Db2", // Staff-3 (Bass)
      "soprano": "C5",
      "alto": "G4",
      "tenor": "Eb4",
      "bass": "Db2",
      "full": "Db3"
    }
  },

  // 11. 하늘을 달리다 (이적 / A-Five)
  // E Major, soaring rock harmony
  "run-the-sky": {
    "key": "E Major",
    "pitches": {
      "part1": "B4",  // Lead
      "part2": "G#4", // Alto
      "part3": "E4",  // Tenor
      "part4": "E3",  // Bass
      "soprano": "B4",
      "alto": "G#4",
      "tenor": "E4",
      "bass": "E3",
      "full": "E4"
    }
  },

  // 12. 아카라카 오프닝 (20세기 히트쏭 메들리)
  // Score: 20세기 히트쏭 메들리 수정(혼성7부)arr 김승호.nwc
  "acaroom-opening": {
    "key": "E Major / C# Minor",
    "pitches": {
      "part1": "G#4", // 종미
      "part2": "G#4", // 혜령
      "part3": "E4",  // 수희
      "part4": "C#5", // 현
      "part5": "A4",  // 명현
      "part6": "A2",  // 용석 (Bass)
      "soprano": "C#5",
      "alto": "G#4",
      "tenor": "E4",
      "baritone": "A4",
      "bass": "A2",
      "full": "E4"
    }
  },

  // 13. Speechless (알라딘 OST / Narin)
  // Score: Speechless(알라딘 OST_혼성6부)아카라카.nwc (D Major: F#, C#)
  "speechless": {
    "key": "D Major",
    "pitches": {
      "part1": "A3",  // 종미
      "part2": "F#3", // 혜령
      "part3": "F#3", // 수희
      "part4": "C#5", // 현 (High Lead)
      "part5": "A4",  // 명현
      "part6": "D2",  // 용석 (Bass)
      "soprano": "C#5",
      "alto": "A4",
      "tenor": "A3",
      "baritone": "F#3",
      "bass": "D2",
      "full": "D3"
    }
  },

  // 14. 그대 내 품에 (유재하 / EXIT)
  // Score: 그대_내품에(남자).nwc (C# Minor / E Major)
  "in-your-arms": {
    "key": "C# Minor",
    "pitches": {
      "part1": "E#5", // 선영
      "part2": "G#5", // 용석
      "part3": "D#5", // 희엽
      "part4": "C#3", // 재우 (Bass)
      "part5": "C#5", // 휘소
      "soprano": "G#5",
      "alto": "E#5",
      "tenor": "D#5",
      "baritone": "C#5",
      "bass": "C#3",
      "full": "C#4"
    }
  },

  // 15. 행복한 학교 · 혼성 (별의별)
  "happy-school": {
    "key": "F Major",
    "pitches": {
      "part1": "A4",
      "part2": "F4",
      "part3": "C4",
      "part4": "A3",
      "part5": "F3",
      "soprano": "A4",
      "alto": "F4",
      "tenor": "C4",
      "baritone": "A3",
      "bass": "F3",
      "full": "F4"
    }
  },

  // 16. 학교 가자 (별의별)
  "go-to-school": {
    "key": "G Major",
    "pitches": {
      "part1": "B4",
      "part2": "G4",
      "part3": "D4",
      "part4": "B3",
      "part5": "G3",
      "soprano": "B4",
      "alto": "G4",
      "tenor": "D4",
      "baritone": "B3",
      "bass": "G3",
      "full": "G4"
    }
  },

  // 17. 수고했어 오늘도 (옥상달빛 · 편곡 김승호)
  "well-done-today": {
    "key": "Bb Major",
    "pitches": {
      "part1": "D5",  // Lead
      "part2": "Bb4", // Soprano 2
      "part3": "F4",  // Alto
      "part4": "D4",  // Tenor
      "part5": "Bb3", // Baritone
      "part6": "Bb2", // Bass
      "soprano": "D5",
      "alto": "F4",
      "tenor": "D4",
      "baritone": "Bb3",
      "bass": "Bb2",
      "full": "Bb3"
    }
  },

  // 18. 보헤미안 랩소디 (Queen / Pentatonix)
  "bohemian-rhapsody": {
    "key": "Bb Major",
    "pitches": {
      "part1": "Ab4",
      "part2": "F4",
      "part3": "Eb5",
      "part4": "C4",
      "part5": "F3",
      "soprano": "Ab4",
      "alto": "F4",
      "tenor": "Eb5",
      "baritone": "C4",
      "bass": "F3",
      "full": "Bb3"
    }
  },

  // 19. Daft Punk (Pentatonix)
  "daft-punk": {
    "key": "F# Minor",
    "pitches": {
      "part1": "C#4", // Mitch
      "part2": "A4",  // Kirstie
      "part3": "F#3", // Scott
      "part4": "F#2", // Avi (Bass)
      "soprano": "A4",
      "alto": "C#4",
      "tenor": "F#3",
      "bass": "F#2",
      "full": "F#3"
    }
  },

  // 20. 단소리 (국악 / 아카펠라)
  "dansori": {
    "key": "G Major",
    "pitches": {
      "part1": "D5",
      "part2": "B4",
      "part3": "G4",
      "part4": "G3",
      "soprano": "D5",
      "alto": "B4",
      "tenor": "G4",
      "bass": "G3",
      "full": "G4"
    }
  },

  // 21. Isn't She Lovely (Stevie Wonder / EXIT)
  "isnt-she-lovely": {
    "key": "E Major",
    "pitches": {
      "part1": "B4",
      "part2": "G#4",
      "part3": "E4",
      "part4": "E3",
      "soprano": "B4",
      "alto": "G#4",
      "tenor": "E4",
      "bass": "E3",
      "full": "E4"
    }
  },

  // 22. 여행을 떠나요 (조용필 / 아카라카)
  // Score: 여행을떠나요.nwc (Eb Major: Bb, Eb, Ab)
  "lets-travel": {
    "key": "Eb Major",
    "pitches": {
      "part1": "G4",  // SP CT
      "part2": "Eb4", // AT TN
      "part3": "Eb5", // Solo
      "part4": "Eb3", // Bass
      "soprano": "G4",
      "alto": "Eb4",
      "tenor": "Eb5",
      "bass": "Eb3",
      "full": "Eb4"
    }
  },

  // 23. 러브송 메들리 (EXIT)
  // Score: 러브송 메들리(남자).nwc (F# Major: F#, C#, G#, D#, A#, E#)
  "love-song-medley": {
    "key": "F# Major",
    "pitches": {
      "part1": "A#4", // YS
      "part2": "C#4", // SY
      "part3": "F#5", // HY
      "part4": "F#2", // JW (Bass)
      "soprano": "F#5",
      "alto": "A#4",
      "tenor": "C#4",
      "bass": "F#2",
      "full": "F#3"
    }
  },

  // 24. L.O.V.E. (Nat King Cole / MayTree)
  // Score: love.nwc (G Major)
  "l-o-v-e": {
    "key": "G Major",
    "pitches": {
      "part1": "B4", // Staff (Sop)
      "part2": "D4", // Staff-1 (Alto)
      "part3": "B4", // Staff-2 (Tenor)
      "part4": "G4", // Staff-3 (Baritone)
      "part5": "G2", // Staff-4 (Bass)
      "soprano": "B4",
      "alto": "D4",
      "tenor": "B4",
      "baritone": "G4",
      "bass": "G2",
      "full": "G3"
    }
  },

  // 25. 올드팝 메들리 (아카라카)
  // Score: 올드팝메들리.nwc
  "old-pop-medley": {
    "key": "E Major / C# Minor",
    "pitches": {
      "part1": "B5",
      "part2": "G#5",
      "part3": "B4",
      "part4": "E3",
      "soprano": "B5",
      "alto": "G#5",
      "tenor": "B4",
      "bass": "E3",
      "full": "E4"
    }
  },

  // 26. 아름다운 세상 (유리상자 / 아카라카)
  // Score: 아름다운세상.nwc (Ab Major / Eb chord)
  "beautiful-world": {
    "key": "Ab Major",
    "pitches": {
      "part1": "Ab4", // sop
      "part2": "Eb4", // 유진 (alto)
      "part3": "C5",  // 우성 (tenor)
      "part4": "Bb4", // 지웅 (baritone)
      "part5": "Ab2", // 태영 (bass)
      "soprano": "Ab4",
      "alto": "Eb4",
      "tenor": "C5",
      "baritone": "Bb4",
      "bass": "Ab2",
      "full": "Ab3"
    }
  },

  // 27. Butterfly (러브홀릭스 / 국가대표 OST / 아카라카)
  // Score: Butterfly.nwc (Eb Major: Bb, Eb, Ab)
  "butterfly": {
    "key": "Eb Major",
    "pitches": {
      "part1": "Ab4", // sop
      "part2": "Ab4", // alto
      "part3": "Ab4", // ten
      "part4": "Ab4", // bar
      "part5": "Ab3", // bass
      "soprano": "Ab4",
      "alto": "Ab4",
      "tenor": "Ab4",
      "baritone": "Ab4",
      "bass": "Ab3",
      "full": "Ab3"
    }
  },

  // 28. 벚꽃 엔딩 (버스커 버스커 / 두왑사운즈)
  // Score: 벚꽃엔딩(5부).nwc (D Major: F#, C#)
  "cherry-blossom-ending": {
    "key": "D Major",
    "pitches": {
      "part1": "A4",  // Sop
      "part2": "F#4", // Alt
      "part3": "D5",  // Ten
      "part4": "B4",  // Bar
      "part5": "A2",  // Bass
      "soprano": "A4",
      "alto": "F#4",
      "tenor": "D5",
      "baritone": "B4",
      "bass": "A2",
      "full": "D3"
    }
  },

  // 29. 사랑해 사랑해 (다이아)
  // Score: 다이아-사랑해 사랑해.nwc (F# Major)
  "love-love": {
    "key": "F# Major",
    "pitches": {
      "part1": "G#4", // Staff (Sop)
      "part2": "F#4", // Staff-1 (Alt)
      "part3": "C#5", // Staff-2 (Ten)
      "part4": "A#4", // Staff-3 (Bar)
      "part5": "F#2", // Staff-4 (Bass)
      "soprano": "G#4",
      "alto": "F#4",
      "tenor": "C#5",
      "baritone": "A#4",
      "bass": "F#2",
      "full": "F#3"
    }
  },

  // 30. 캐롤 메들리 (아카펠라 메들리 / EXIT)
  // Score: 캐롤 메들리-EXIT(수정).nwc (B Major: F#, C#, G#, D#, A#)
  "carol-medley": {
    "key": "B Major",
    "pitches": {
      "part1": "E4",
      "part2": "E5",
      "part3": "E5",
      "part4": "E3", // Bass
      "soprano": "E5",
      "alto": "E4",
      "tenor": "E5",
      "bass": "E3",
      "full": "E4"
    }
  },

  // 31. 같은 곳에서 (프로듀스 101)
  "same-place": {
    "key": "G Major",
    "pitches": {
      "part1": "B4",
      "part2": "G4",
      "part3": "E4",
      "part4": "E3",
      "soprano": "B4",
      "alto": "G4",
      "tenor": "E4",
      "bass": "E3",
      "full": "G4"
    }
  },

  // 32. 좋겠다 (성시경)
  "would-be-good": {
    "key": "Ab Major",
    "pitches": {
      "part1": "C5",
      "part2": "Eb5",
      "part3": "Ab4",
      "part4": "Ab3",
      "soprano": "Eb5",
      "alto": "C5",
      "tenor": "Ab4",
      "bass": "Ab3",
      "full": "Ab3"
    }
  },

  // 33. Ditto (NewJeans / EXIT ver)
  "ditto": {
    "key": "F# Minor",
    "pitches": {
      "part1": "C#5", // Lead / Sop
      "part2": "A4",  // Alto
      "part3": "F#4", // Tenor
      "part5": "F#2", // Bass
      "soprano": "C#5",
      "alto": "A4",
      "tenor": "F#4",
      "bass": "F#2",
      "full": "F#3"
    }
  }
};

// Check against data/songs.json
const songsData = JSON.parse(fs.readFileSync('data/songs.json', 'utf8'));
let updatedCount = 0;

songsData.songs.forEach(song => {
  const match = SONG_STARTING_PITCHES[song.id];
  if (match) {
    song.startingPitches = match.pitches;
    song.musicalKey = match.key;
    updatedCount++;
  }
});

fs.writeFileSync('data/songs.json', JSON.stringify(songsData, null, 2), 'utf8');
console.log(`Updated starting pitches for ${updatedCount} / ${songsData.songs.length} songs in data/songs.json`);
