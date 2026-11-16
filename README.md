# AcaRaca · 우리의 아카펠라 연습실 & 무대 큐시트

아카펠라 팀 **아카라카(AcaRaca)** 단원들이 연습곡을 찾고, 파트별 가이드 영상을 연습하고, 악보를 미리 보고, 실전 무대 큐시트(첫 음 피치파이프 & MC 멘트)까지 한곳에서 관리하는 정적 웹 애플리케이션(PWA)입니다.

---

## 주요 기능

- **아카라카 연습실 (`data/songs.json`, 총 34곡)**
  - 전 곡 파트별 연습 가이드 영상, 전체 합주 영상(`videos.full`), 곡별 기준 템포(`bpm`), 연주 시간(`duration`), 첫 소절 가사·진입 큐(`openingCue`) 완비
  - 성부별(`soprano` · `alto` · `tenor` · `baritone` · `bass` · `lead` · `vp`) 또는 번호별(`part1`~`part7`) 파트 연습 지원
  - **나는 누구? (`partNames`) & 파트 숙련도 3단계 트래커 (`state.progress`)**: 34곡 전체 파트 담당자 매핑 및 복수 담당자 분리 인식 지원 — 내 이름을 선택하면 곡마다 내가 맡은 파트가 최우선으로 표시되며, 곡별 숙련도(`🌱 음정 익히는 중` · `🎵 암보 연습 중` · `✨ 무대 준비 완료`) 체크와 자동 누적 연습 시간 기록 및 숙련도별 모아보기를 지원합니다.
  - **실시간 반음 조바꿈 (`±반음 Key Transposition`, `-6`~`+6` 반음)**: 당일 목 상태나 무대 환경에 맞춰 연습실·피치파이프·LIVE 무대 큐시트에서 곡 조성(`musicalKey`), 기준음(`pitchPipe`), 전 파트 첫 음(`startingPitches`)과 화음을 즉시 이조합니다.
  - **Web Audio 피치파이프 · 실시간 마이크 음정 튜너 · 곡 BPM 연동 메트로놈**: 마이크 기반 실시간 음정 측정(`±센트` 오차 게이지)과 곡 템포(`bpm`) 자동 연동 메트로놈(`40`~`220 BPM`)을 내장했습니다.
  - **내 목소리 셀프 녹음기 & 개인 연습 노트**: 외부 앱 없이 연습 화면과 연습 일지에서 바로 마이크로 녹음해 들어보고 파일 저장 또는 연습 일지에 원클릭 등록할 수 있으며, 곡별 개인 연습 노트에 `[0:42]` 타임스탬프를 적으면 원탭 구간 점프 버튼이 생성됩니다.
  - **실전 파트 연습 컨트롤러 & 키보드/블루투스 페달 단축키**: 배속 조절(`0.75x`~`1.25x`), 5초 탐색/복습, **A–B 구간 반복 및 곡별 북마크 저장(`savedLoops`)**, **현 재생 위치 유지 파트 대조 전환**, 연습 화면 내 **인앱 악보 바로 열기**, 키보드·풋페달 단축키(`Space` · `←/→` · `[` / `]` · `\` · `P`), 큰 버튼 모드, 화면 꺼짐 방지(`Wake Lock`), 주머니 절전 모드 지원

- **공연 아카이브 & LIVE 무대 큐시트 (`js/stage.js`, `data/performances.json`)**
  - **LIVE 무대 모드 (`1곡 집중 보기` / `전체 큐시트 목록`)**: 행사명·일자·장소·셋리스트 관리, **예상 러닝타임 자동 산출 & 무대 실전 경과 스톱워치**, **무대 내 인앱 악보 즉시 열람**, **첫 소절 가사·진입 큐(`openingCue`) 표시**, **곡별 실시간 반음 조바꿈**, **무음 시각 템포 펄스(`⏱️ 무음 템포 ♩=BPM`)**, **34곡 전용 3톤 MC 멘트 & 초대형 보면대 프롬프터** 지원
  - **원클릭 큐시트 링크(`?cuesheet=...`) · 현장 QR 공유 · 오프라인 악보 일괄 저장 · A4 큐시트 인쇄**: 기기 내장 QR 생성기로 오프라인에서도 QR 스캔 또는 링크 클릭 한 번으로 조바꿈 키를 포함한 공연 큐시트를 단원 전원에게 동기화하고, 공연장 와이파이 불안정에 대비해 **큐시트 전 곡 악보를 기기 캐시에 원클릭 오프라인 저장**하며, **A4 큐시트 인쇄 뷰**와 JSON 내보내기/가져오기를 함께 지원합니다.
  - **아카라카 실황 영상 아카이브**: 31개 무대 실황 영상 및 정규화된 공연별 셋리스트 연동

- **악보 창고 (`data/scores.json`, 총 1,069개 악보)**
  - 아카라카 및 한국아카펠라교육연구회 통합 악보 아카이브 (연습곡 34곡 전 곡 악보 매핑 완료, `NWC` · `PDF` · `MIDI` · `MSCZ` · `기타` 포맷별 필터 및 현재 목록 오프라인 일괄 보관 제공)
  - **인앱 멀티트랙 하모니 플레이어 (`성부별 Solo · Mute 마이너스원 믹서`) & 5선지 오선보(`SVG`) 뷰어**: 전 532개 NWC(`v1.70`~`v2.75` 바이너리/텍스트 100% 호환)·MIDI·MSCZ 악보에서 실제 박자·음길이 기반 전 성부 하모니를 합성 재생하며, **내 파트만 듣기(`🎧 Solo`)** 또는 **내 파트만 끄고 나머지 화음에 맞춰 부르기(`🔇 Mute` 마이너스원)**, 배속(`0.75x`~`1.25x`), 실시간 반음 조바꿈, 구간 시크바 탐색을 지원합니다.

- **아카펠라 감상 (`data/appreciation.json`, 217개 영상)** · **연습 일지 (`data/rehearsals.json`)** · **연습 영상 (`data/practice_videos.json`)** · **우리들의 기록 (`data/memories.json`)** · **교육 자료 (`data/education.json`, 41개 자료 · 인앱 교재 PDF 뷰어 & 오프라인 일괄 보관)**

- **데이터 편집기 (`admin.html`, `js/admin.js`) & 자동 품질 검증 (`.github/workflows/ci.yml`)**
  - 곡·파트별 YouTube 주소, BPM, 연주 시간(`duration`), 첫 소절 큐(`openingCue`) 편집 및 NWC `v1.70`~`v2.75` 악보 드래그 앤 드롭 시 조성·템포(`BPM`)·첫 음·진입 순서 자동 추출기 내장
  - GitHub Actions CI를 통해 `main` 브랜치 푸시·PR 시 스키마 검증, 단위 테스트, 정적 무결성 감사를 자동 수행합니다.

---

## 로컬 실행 및 검증 명령

```bash
# 정적 파일 서버 실행 (http://localhost:8000)
python3 -m http.server 8000

# 데이터 스키마 및 YouTube 주소 검증
npm run validate

# 전체 단위 테스트 및 무대 모드·오프라인·데이터 무결성 테스트 실행
npm test
npm run audit

# 등록된 YouTube 영상이 아직 재생 가능한지 확인 (인터넷 필요, GitHub Actions에서 매주 월요일 자동 실행)
npm run check-links
```

---

## 프로젝트 구조

```text
.
├── index.html                 # 메인 연습실 & 무대 큐시트 앱 엔트리
├── admin.html                 # 데이터 편집기 (NWC 첫음 자동 추출기 포함)
├── sw.js                      # 오프라인 캐시 및 PWA Service Worker
├── manifest.json              # PWA 웹 앱 매니페스트
├── ys-qr.js                   # QR 모달 헬퍼
├── css/
│   ├── style.css              # 메인 스타일시트 (다크/라이트 테마 & 반응형 & 인앱 악보 뷰어)
│   └── admin.css              # 데이터 편집기 스타일시트
├── js/
│   ├── app.js                 # 메인 라우팅, 연습실, 인앱 NWC/MIDI 뷰어, 백업/복원
│   ├── stage.js               # LIVE 무대 큐시트, 피치파이프 조율, MC 멘트, QR·URL 공유
│   ├── pitch.js               # Web Audio API 신디사이저 & 피치파이프 엔진
│   ├── player.js              # YouTube IFrame API 플레이어 & A-B 구간 반복기
│   ├── archive.js             # 공연·악보·연습일지·감상·교육 아카이브 로더
│   ├── backgroundPlay.js      # Screen Wake Lock, MediaSession, 주머니 모드
│   ├── mediaStorage.js        # IndexedDB 대용량 미디어/악보 저장소
│   ├── data.js                # 곡 데이터 정규화 및 유효성 검증
│   ├── router.js              # URL 쿼리 라우터 (?tab, ?song, ?part, ?view, ?cuesheet)
│   ├── search.js              # 곡 검색 및 다중 필터
│   ├── storage.js             # LocalStorage 래퍼
│   ├── ui.js                  # DOM 헬퍼 및 아이콘·토스트 컴포넌트
│   └── admin.js               # 데이터 편집기 & NWC 바이너리 파서
├── data/
│   ├── songs.json             # 34개 연습곡 메타데이터, 파트 영상, 첫 음, 담당자
│   ├── scores.json            # 1,069개 악보 아카이브 메타데이터
│   ├── performances.json      # 31개 아카라카 무대 실황 영상 및 셋리스트
│   ├── appreciation.json      # 217개 국내외 아카펠라 감상 영상
│   ├── rehearsals.json        # 합주 연습 일지 및 타임스탬프 피드백
│   ├── practice_videos.json   # 파트별·전체 합주 연습 영상 보관소
│   ├── memories.json          # 우리들의 기록 (숏츠·사진 앨범)
│   └── education.json         # 41개 아카펠라 발성·화성·리듬 교육 자료
└── tests/
    ├── core-tests.js          # 코어 데이터·파서·유틸리티 단위 테스트
    ├── test-stage.js          # 무대 큐시트·공유 링크·피치 연동 테스트
    └── audit-files.cjs        # 오프라인 에셋 및 JSON 참조 무결성 감사
```
