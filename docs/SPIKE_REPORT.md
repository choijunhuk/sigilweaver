# SPIKE_REPORT — Phase 0

목표 (§20 Phase 0 Exit Criteria):
- [ ] 데스크톱: 5종 인장 각 20회 시도 중 ≥18회 정인식
- [ ] Android 실기기: 추론 ≥15fps
- [ ] Android 실기기: 인장 확정 지연(포즈 완성→이벤트) ≤400ms
- [ ] Android 실기기: 렌더 60fps 유지
- [ ] 오인식(의도와 다른 인장 확정) ≤10%

## 측정 방법

HUD 표시 항목:
- `render N fps | infer N fps X.Xms` — 렌더/추론 fps, 1회 추론 시간(지수이동평균)
- `last fire <SIGIL> latency Nms` — 안정화 시작→확정 지연 (§15 FSM 기준)
- `fires BOLT:n WARD:n ...` — 인장별 확정 카운트 (정인식/오인식 수동 집계용)

절차: 인장당 20회 — 포즈를 취하고 확정 플래시 확인 → 손 풀기 → 반복.
의도와 다른 인장이 뜨면 오인식 1회로 집계.

## 결과 (측정 후 기입)

### 데스크톱 (macOS, 웹캠)

| 인장 | 시도 | 정인식 | 오인식 | 비고 |
|---|---|---|---|---|
| Bolt ☝ | 20 | | | |
| Ward ✊ | 20 | | | |
| Pulse 🖐 | 20 | | | |
| Arc ✌ | 20 | | | |
| Focus 🤏 | 20 | | | |

### Android 실기기 (기기명: )

- 추론 fps: / 추론 시간: ms
- 확정 지연: ms (인장별 last fire latency 관찰 범위)
- 렌더 fps:
- 체감 이슈:

## 판정

- Exit Criteria 충족 여부:
- 폴백 필요 여부 (Web Worker / 해상도 조정 / lite 모델):
