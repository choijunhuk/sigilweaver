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

## Phase 0 스파이크 현황

Phase 0은 의도적으로 flat 구조다 (게임 코드 금지, §20). Phase 1에서 아래로 이관:

| 스파이크 파일 | Phase 1 목적지 |
|---|---|
| `src/camera.ts`, `src/tracker.ts` | `src/cv/` |
| `src/features.ts`, `src/classify.ts`, `src/filter.ts` | `src/gesture/` |
| `src/draw.ts`, `src/main.ts` (HUD) | `src/debug/` (랜드마크 시각화) |
| `src/types.ts` | `src/gesture/` + `src/data/` (GestureConfig) |

스파이크 파이프라인 (구현됨):
1. `camera.ts` — getUserMedia 전면 카메라 480×640
2. `tracker.ts` — Hand Landmarker (VIDEO 모드, GPU delegate, numHands 1)
3. `features.ts` — 손목 원점 평행이동 + |손목→중지MCP| 스케일 정규화 + Left 미러
   → 손가락 굽힘도 5 + 핀치 거리 + V 스프레드. 버퍼 재사용(매 프레임 무할당).
4. `classify.ts` — 규칙 기반 5종 + NONE, confidence = 규칙 마진
5. `filter.ts` — 연속 4프레임 확정, 300ms 디바운스, 히스테리시스 해제
6. `main.ts` — 추론 24fps 스로틀 / 렌더 rAF 분리, 성능 HUD, 확정 지연 측정

Phase 1 디렉토리 전체 구조는 마스터 문서 §14 참조.
