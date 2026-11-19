# AcaRaca 작업 규칙

아카라카(아카펠라 팀) 연습실 웹앱. 정적 사이트(바닐라 JS)이며 GitHub Pages가 `main` 브랜치를 그대로 배포한다.
이 저장소는 여러 작업 세션이 동시에 수정하므로 아래 규칙을 지킨다.

## 작업 방식 (필수)
- `main`에 직접 push하지 않는다. 항상 작업 브랜치 → PR → CI(`AcaRaca Quality & Integrity CI`) 통과 → 병합.
- 작업 시작 전에 `git fetch origin main` 후 최신 `main` 위에서 시작한다. 오래된 브랜치로 덮어쓰지 않는다.
- 병합 전 로컬에서 확인: `npm run validate && npm test && npm run audit`
- 배포 파일을 바꾸면 `sw.js` 첫 줄 `CACHE_NAME`의 버전 숫자를 1 올린다 (다른 세션이 먼저 올렸으면 그 다음 숫자).
- 사용 중인 화면을 강제로 새로고침하지 않는다 (`location.reload()` 자동 호출 금지. 새 버전 안내 바만 사용).

## 데이터 규칙
- 곡 데이터: `data/songs.json`. 파트 첫 음은 `startingPitches.partN`, 재생 순서는 `entryOrder`(악보에서 먼저 시작하는 파트 순), 담당자는 `partNames`, 무대 대표음은 `pitchPipe`(옥타브 없이, 첫 화음에 포함된 음).
- 첫 음은 반드시 파트 영상 또는 NWC 악보(`scripts/nwc-entry-order.cjs`로 분석)로 확인한 값만 넣는다. 추측하지 않는다.
- 단원 이니셜은 한글 이름으로 표기: YS=용석, SY=선영, HY=희엽, JW=재우, HS=휘소, MH=명현.
- 악보 위쪽 줄이 1번 파트, 아래쪽 줄이 마지막 파트.
- 공연(무대 큐시트) 기본값: `js/stage.js`의 `DEFAULT_STAGE_HISTORY`. 기존 공연의 셋리스트를 바꾸면 그 공연의 `revision`을 1 올려야 이미 저장된 휴대폰에도 반영된다.

## 코드 구조
- `js/app.js`: 화면 렌더링. 상태에 의존하지 않는 계산은 `js/practiceLogic.js`에 둔다 (테스트 대상).
- `js/pitch.js`: 첫 음·화음 소리. 카카오톡 등 인앱 브라우저는 WAV 대체 재생(`synthesizeWav`)을 쓴다. 단음은 리미터를 거치지 않는다(낮은 음 깨짐 방지).
- 새 기능에는 `tests/test-features.js`에 테스트를 추가한다.

## 사용자 응대
- 사용자는 한국어로 소통한다. 결과는 한국어로, 개발 용어 없이 설명한다.
- 실제 휴대폰에서 확인하지 못한 것(소리, 화면 잠금 재생 등)은 확인하지 못했다고 분명히 말한다.
