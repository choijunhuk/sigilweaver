# DECISIONS

## 2026-08-28 — Phase 0

- **MediaPipe 자산은 커밋하지 않고 `npm run fetch-assets`로 받는다.**
  wasm(~10MB) + 모델(7.5MB)을 git에 넣으면 클론이 무거워짐. `public/wasm`,
  `public/models`는 gitignore, 스크립트로 재현 가능.
- **Web Worker 이전은 보류, 메인 스레드 + 24fps 스로틀로 시작.**
  §15가 "Phase 0에서 워커 검증, 불가하면 메인 스레드 + 스로틀" 허용.
  먼저 스로틀만으로 Exit Criteria(추론 ≥15fps, 렌더 60fps) 충족 여부를
  실기기에서 측정하고, 미달일 때만 워커 도입 (YAGNI).
- **추론 입력 다운스케일은 getUserMedia 요청 해상도(480×640)로 처리.**
  별도 캔버스 리샘플 단계 생략 — MediaPipe가 내부적으로 224px대로 리사이즈함.
  실기기에서 추론 시간이 목표 초과 시 재검토.
- **Fist/Palm 규칙에서 엄지 마진 가중 ×2 (관대하게).**
  엄지는 MCP-IP-TIP 각도 기반 굽힘도가 다른 손가락 대비 변별력이 낮음.
  주먹 쥘 때 엄지가 덜 굽는 사람이 많아 엄격 적용 시 Ward 인식률 하락.
