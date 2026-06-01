# AIOSK Frontend

React + TypeScript + Vite 기반 키오스크 UI입니다. 현재 정적 진입 경로는 `/`와 `/kiosk`이며 둘 다 `KioskPage`를 렌더링합니다.

## 실행

```bash
npm ci
npm run dev
```

개발 서버에서는 `VITE_API_URL`이 없으면 `http://localhost:3000`을 사용합니다. 운영 번들에서는 `VITE_API_URL`이 필수이며, local API URL은 `VITE_ALLOW_LOCAL_API_URL=true`로 명시한 로컬/CI 검증 빌드에서만 허용됩니다.
`frontend/.env.example`을 `frontend/.env` 또는 로컬 전용 env 파일로 복사해 `VITE_API_URL`을 백엔드 포트에 맞추세요. Mock 데이터는 개발 서버에서 `VITE_USE_MOCK_DATA=true`로 명시한 경우에만 사용되며, production build와 Docker image build에서는 거부됩니다.
Frontend build env files are parsed as strict key/value data; malformed env line은 line number만 출력하고 Vite build 전에 실패합니다.
Backend가 `KIOSK_STATUS_TOKEN`을 요구하는 운영 배포에서는 repository variable `FRONTEND_KIOSK_STATUS_TOKEN`을 설정해야 release workflow와 Docker build가 matching `VITE_KIOSK_STATUS_TOKEN`을 frontend bundle에 주입합니다. 그러면 heartbeat 요청이 `x-kiosk-status-token` header를 보냅니다. 이 값은 브라우저 번들에 포함되는 lightweight shared gate이며 16자 이상, 공백 없는 값이어야 합니다.

## 검증

```bash
npm run lint
VITE_API_URL=http://localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build
```

2026-05-30 부분 재검증 기준 루트 정적 검증과 OpenAPI coverage 검증, 프론트 lint/build는 통과했습니다. 브라우저 E2E의 전체 통과 기록은 루트 [FRONTEND_TEST_REPORT.md](../FRONTEND_TEST_REPORT.md)의 기존 전체 브라우저 E2E 기록을 참고하세요.

## 현재 범위

- 키오스크 카테고리/메뉴 탐색
- 장바구니 수량 변경 및 주문 플로우
- 주문 완료 영수증/주문번호/인쇄 UI
- 키오스크 상태 heartbeat 전송
- 개발 전용 명시적 mock 데이터 모드 (`VITE_USE_MOCK_DATA=true npm run dev`)

## 운영 증거

- 실제 운영 URL에서 배포 후 smoke와 장시간 heartbeat soak 기록 확보 필요
