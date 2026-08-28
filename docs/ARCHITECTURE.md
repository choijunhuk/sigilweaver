# SIGILWEAVER — Architecture (draft, Phase 0)

마스터 문서: [SIGILWEAVER_MASTER_PROMPT.md](./SIGILWEAVER_MASTER_PROMPT.md) §14–§15 참조.

## 파이프라인 (목표 구조)

```
[CameraSource] → [HandTracker(MediaPipe)] → [LandmarkFrame]
      → [GestureClassifier] → [TemporalFilter/FSM] → [GestureEvent]
      → [PhraseMatcher(토큰 버퍼)] → [CastEvent]
      → [SpellResolver] → [CombatEvent] → [EventBus] → 게임 시스템들
```

핵심 규칙:
- CV 파이프라인은 Phaser를 모른다. `GestureSource` 인터페이스만 노출.
  구현체: `CameraGestureSource` / `ReplayGestureSource` / `ButtonGestureSource`.
- 전투 로직은 렌더링을 모른다 (headless 테스트 가능).
- 시스템 간 통신은 타입 정의된 EventBus 하나.
- 콘텐츠는 `data/` JSON (zod 검증), 코드에 하드코딩 금지.

## 현재 구조 (Phase 5 — Vertical Slice)

Phase 3~5 추가분: `src/combat/` — 순수 헤드리스 전투 시뮬레이션
(`world` 엔티티/스펠/상태이상, `rooms` 방 8개 런 구조, `boss` 침묵의 서기관
봉인 기믹, `runes` 데이터 훅 실행기, `content` zod 로더),
`src/meta/save.ts` (schemaVersion + 마이그레이션 체인),
`src/core/audio.ts` (WebAudio 신스 SFX + 앰비언트 BGM 수직 레이어링),
씬: Boot→Calibration→Menu→Game(방 진행+튜토리얼)→Reward/Event 오버레이→Result.
콘텐츠는 전부 `data/` JSON: spells, enemies 4종, phrases 3종, runes 12종,
events 3종, stages/chapter1.

## Phase 1 시점 구조

```
src/
├── core/     EventBus(타입 이벤트맵), Rng(mulberry32 시드), log(카테고리, 릴리스 무음)
├── cv/       camera(getUserMedia 720p), tracker(MediaPipe 래퍼) — Phaser 무관
├── gesture/  features(정규화·특징), classify(규칙 5종), filter(FSM), types
├── data/     schemas(zod), load(parseData — 로드 시 검증 실패는 즉시 throw)
├── game/     main(Phaser 720×1280 세로) + scenes/ Boot→Menu→Game→Result
└── debug/    spike(스파이크 HUD 페이지 /spike.html), draw(랜드마크 시각화)
data/         config/gesture.json (임계값 — 코드에 하드코딩 없음)
tests/        events, rng, data, classify(합성 특징), filter(FSM) — vitest 20개
```

진입점 2개: `index.html`(게임) / `spike.html`(제스처 스파이크·디버그 유지).

## 스파이크 파이프라인 (Phase 0에서 검증됨)
1. `camera.ts` — getUserMedia 전면 카메라 480×640
2. `tracker.ts` — Hand Landmarker (VIDEO 모드, GPU delegate, numHands 1)
3. `features.ts` — 손목 원점 평행이동 + |손목→중지MCP| 스케일 정규화 + Left 미러
   → 손가락 굽힘도 5 + 핀치 거리 + V 스프레드. 버퍼 재사용(매 프레임 무할당).
4. `classify.ts` — 규칙 기반 5종 + NONE, confidence = 규칙 마진
5. `filter.ts` — 연속 4프레임 확정, 300ms 디바운스, 히스테리시스 해제
6. `main.ts` — 추론 24fps 스로틀 / 렌더 rAF 분리, 성능 HUD, 확정 지연 측정

Phase 1 디렉토리 전체 구조는 마스터 문서 §14 참조.
