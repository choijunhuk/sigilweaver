# SIGILWEAVER

손으로 마법 문자를 그려 싸우는, 카메라 기반 모바일 로그라이트 아레나 디펜스.

전면 카메라 앞에서 실제 손으로 고대 인장(Sigil)을 맺어 마법을 시전한다.
Phaser 3 + MediaPipe Hand Landmarker + Capacitor.

**현재 상태: Phase 5 — Vertical Slice** (방 8개 런 + 보스 + 룬 12종 + 인장문 3종 + 튜토리얼/캘리브레이션 + 저장)

- ☝ Bolt · ✊ Ward · 🖐 Pulse · ✌ Arc · 🤏 Focus — 인식 확정 즉시 발동
- 인장문(연계): ✌✌ 연쇄 격류 · 🖐✊☝ 화염 창 · ✊✌🖐 뇌우
- 보스 "침묵의 서기관": 제한 시간 내 봉인 문장을 맺으면 파훼 + 대미지 윈도우
- 데스크톱 디버그: 키 1~5로 인장 강제 발동

## 실행

```bash
npm install
npm run fetch-assets   # MediaPipe wasm + 모델 다운로드 (최초 1회)
npm run dev            # 데스크톱 브라우저 + 웹캠
```

브라우저에서 "카메라 시작" → 손 포즈 5종:
☝ Bolt · ✊ Ward · 🖐 Pulse · ✌ Arc · 🤏 Focus

## Android

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 문서

- [마스터 개발 문서](docs/SIGILWEAVER_MASTER_PROMPT.md) — GDD/TDD/로드맵
- [아키텍처](docs/ARCHITECTURE.md) · [의사결정 기록](docs/DECISIONS.md) · [스파이크 리포트](docs/SPIKE_REPORT.md)

카메라 영상은 저장/전송되지 않는다 (랜드마크만 사용).
