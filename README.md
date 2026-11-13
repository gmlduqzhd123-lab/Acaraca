# AcaRaca · 우리의 아카펠라 연습실 & 무대 큐시트

아카펠라 팀 **아카라카(AcaRaca)** 단원들이 연습곡을 찾고, 파트별 가이드 영상을 연습하고, 악보를 미리 보고, 실전 무대 큐시트(첫 음 피치파이프 & MC 멘트)까지 한곳에서 관리하는 정적 웹 애플리케이션(PWA)입니다.

---

## 주요 기능

- **아카라카 연습실 (`data/songs.json`, 총 35곡)**
  - 전 곡 파트별 연습 가이드 영상 및 전체 합주 영상(`videos.full`) 완비
  - 성부별(`soprano` · `alto` · `tenor` · `baritone` · `bass` · `lead` · `vp`) 또는 번호별(`part1`~`part7`) 파트 연습 지원
  - **나는 누구? (`partNames`)**: 35곡 전체 파트 담당자 매핑 및 복수 담당자 분리 인식 지원 — 내 이름을 선택하면 곡마다 내가 맡은 파트가 최우선으로 표시됩니다.
  - **Web Audio 피치파이프 · 실시간 마이크 음정 튜너 · 합주 메트로놈**: 곡별 조성(`musicalKey`), 피치파이프 기준음(`pitchPipe`), 성부별 첫 음(`startingPitches`) 재생은 물론, 마이크 기반 실시간 음정 측정(`±센트` 오차 게이지)과 탭 템포 지원 메트로놈(`40`~`220 BPM`)을 내장했습니다.
  - **실전 파트 연습 컨트롤러**: 배속 조절(`0.75x`~`1.25x`), 5초 탐색/복습, **A–B 구간 반복 및 곡별 북마크 저장(`savedLoops`)**, **현 재생 위치 유지 파트 대조 전환**, 연습 화면 내 **인앱 악보 바로 열기**, 큰 버튼 모드, 화면 꺼짐 방지(`Wake Lock`), 주머니 절전 모드 지원

- **공연 아카이브 & LIVE 무대 큐시트 (`js/stage.js`, `data/performances.json`)**
  - **LIVE 무대 모드 (`1곡 집중 보기` / `전체 큐시트 목록`)**: 행사명·일자·장소·셋리스트 관리, 성부별 첫 음 즉시 조율, **35곡 전 곡 전용 3톤(유쾌·감성·초간단) MC 멘트** 추천 및 커스텀 편집
  - **원클릭 큐시트 링크(`?cuesheet=...`) · 현장 QR 공유 · A4 큐시트 인쇄**: 별도 파일 전송 없이 QR 스캔 또는 링크 클릭 한 번으로 단원 전원에게 공연 큐시트를 즉시 동기화하며, 보면대·무대 바닥 부착용 **A4 큐시트 인쇄 뷰**와 JSON 내보내기/가져오기를 함께 지원합니다.
  - **아카라카 실황 영상 아카이브**: 31개 무대 실황 영상 및 정규화된 공연별 셋리스트 연동

- **악보 창고 (`data/scores.json`, 총 1,069개 악보)**
  - 아카라카 및 한국아카펠라교육연구회 통합 악보 아카이브 (연습곡 35곡 전 곡 악보 매핑 완료, `NWC` · `PDF` · `MIDI` · `기타` 포맷별 필터 제공)
  - **모바일 인앱 `.nwc` · `.nwctxt` · `.mid` 미리보기 & Web Audio 재생 뷰어**: PC 전용 프로그램 없이 스마트폰·태블릿에서 바로 성부 구성, 조성/박자/템포, 가사, 성부별 첫 음과 도입부 멜로디를 확인하고 소리로 들어볼 수 있으며, 동일 곡의 여러 악보 간 즉시 전환도 지원합니다.

- **아카펠라 감상 (`data/appreciation.json`, 217개 영상)** · **연습 일지 (`data/rehearsals.json`)** · **연습 영상 (`data/practice_videos.json`)** · **우리들의 기록 (`data/memories.json`)** · **교육 자료 (`data/education.json`, 41개 자료)**

- **데이터 편집기 (`admin.html`, `js/admin.js`) & 자동 품질 검증 (`.github/workflows/ci.yml`)**
  - 곡·파트별 YouTube 주소 편집, `.nwc` / `.nwctxt` 악보 파일 드래그 앤 드롭 시 조성·첫 음·진입 순서 자동 추출기 내장
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
│   ├── songs.json             # 35개 연습곡 메타데이터, 파트 영상, 첫 음, 담당자
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
