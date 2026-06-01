# AIOSK 요구사항 및 현행 갭

> 업데이트: 2026-05-30
> 근거: [PROJECT_COMPLETENESS_AUDIT.md](PROJECT_COMPLETENESS_AUDIT.md)

## 목표

AIOSK는 매장 키오스크 주문 화면, 관리자 주문/메뉴/통계 관리, MySQL 기반 데이터 저장, 실시간 주문 알림을 제공하는 풀스택 키오스크 시스템을 목표로 한다.

## 핵심 요구사항

### 공개 키오스크 API

- 카테고리 목록 조회: `GET /api/public/categories`
- 메뉴 목록 조회: `GET /api/public/menus`
- 주문 생성: `POST /api/public/orders`
- 공개 주문 생성 요청은 `items` 1-100개, 각 항목의 `menuId` 1 이상 정수, `quantity` 1-99 정수만 허용해야 하며 주문 금액은 서버의 현재 메뉴 가격으로 계산해야 한다.
- 키오스크 상태 보고: `POST /api/public/kiosk/status`
- 키오스크 React 화면과 응답 필드 계약이 일치해야 한다. 현재 React 서비스 계층에서 공개 API 응답을 화면 타입으로 정규화한다.
- 공개 API 실패는 운영 화면에서 mock 데이터로 대체하지 않고 오류로 노출해야 한다. Mock 데이터는 `VITE_USE_MOCK_DATA=true`로 명시한 경우에만 사용한다.
- 키오스크 주문 완료 화면은 실제 구현된 영수증/주문번호/인쇄 기능만 제공해야 한다.
- 이메일/SMS 알림과 공개 주문 상태 조회 라우트가 없는 QR UI는 해당 백엔드 계약이 생기기 전까지 제공하지 않는다.

### 관리자 API

- 관리자 로그인: `POST /api/admin/login`
- 주문 목록/상세 조회: `GET /api/admin/orders`, `GET /api/admin/orders/:orderId`
- 주문 상태 변경/취소: `PATCH /api/admin/orders/:orderId/status`, `PATCH /api/admin/orders/:orderId/cancel`
- 통계 조회: `GET /api/admin/statistics`, `GET /api/admin/statistics/sales`, `GET /api/admin/statistics/top-menus`, `GET /api/admin/statistics/daily-sales`, `GET /api/admin/statistics/hourly-analysis`, `GET /api/admin/statistics/category-analysis`, `GET /api/admin/statistics/report`
- 키오스크 상태 조회: `GET /api/admin/kiosks/status`
- 메뉴 관리: `GET /api/menus`, `POST /api/menus`, `GET /api/menus/:id`, `PUT /api/menus/:id`, `DELETE /api/menus/:id`, `POST /api/menus/:menuId/image`
- 카테고리 관리: `GET /api/categories`, `POST /api/categories`, `GET /api/categories/:id`, `PUT /api/categories/:id`, `DELETE /api/categories/:id`

### 관리자 화면

- `/admin` 하위 EJS 화면은 로그인, 대시보드, 주문, 메뉴, 카테고리, 통계 화면을 제공해야 한다.
- 로그인, 대시보드, 주문, 메뉴, 카테고리, 통계 화면은 DB 모델 기반 데이터를 사용해야 한다.
- 메뉴/카테고리 CRUD 폼은 `/admin/menus`와 `/admin/categories` 하위 POST 액션으로 생성/수정/삭제를 수행해야 한다.
- 키오스크 상태 수집은 React heartbeat, 공개 저장 API, 관리자 조회 API, 대시보드 요약으로 연결되어야 한다.

### 데이터베이스

- `Admins`, `Categories`, `Menus`, `Orders`, `OrderItems`, `KioskStatuses`, `Sessions` 테이블을 생성한다.
- 운영 가능한 관리자 계정은 `npm run admin:create`로 생성/갱신한다.
- 운영 EJS 관리자 세션은 `SESSION_STORE=mysql`에서 `Sessions` 테이블에 저장해야 한다.
- 주문 생성은 메뉴 가격을 서버에서 확정하고 주문 당시 가격을 `OrderItems.price_per_item`에 저장해야 하며, 주문항목 수량은 품목당 1-99개로 제한한다.

### 운영 요구사항

- `.env` 기반 DB/JWT/PORT 설정을 사용한다.
- 로그 파일과 개인/생성 산출물은 Git에 포함하지 않는다.
- Swagger UI와 OpenAPI JSON을 제공한다.
- API 테스트 문서는 서버가 실제 제공하는 `/api`, `/api-docs`, `/api-docs.json`, API 엔드포인트만 안내해야 하며, OpenAPI spec은 운영 smoke 대상인 `/api`, `/api-docs.json`, `/healthz`, `/readyz`, `/metrics`와 live API 경로를 포함해야 한다.
- 루트 `npm test`는 `scripts/verify-static.js`로 JavaScript/EJS 기본 검사와 문서/라우트/OpenAPI/운영 계약 정적 검증을 실행해야 한다.
- GitHub Actions CI는 루트 정적 검증, 루트 audit, DB shell script syntax check, 프론트 lint/build/audit, MySQL 기반 DB/API E2E, Playwright 브라우저 E2E, migration smoke, Docker image build, Prometheus/Alertmanager/Grafana 설정 검증을 실행해야 한다.
- Release workflow는 publish 전 기본 검증을 실행하고 backend/frontend container image를 고정 tag로 registry에 publish해야 한다.
- 최소 DB/API 자동 테스트와 React/EJS 브라우저 자동 테스트를 제공해야 한다.

## 현재 확인된 갭

- 공개 API와 관리자 API 핵심 DB 흐름은 `npm run test:e2e`로 검증된다.
- React 키오스크 주문 흐름과 EJS 관리자 로그인/주문 상태 변경/카테고리·메뉴 생성은 `npm run test:e2e:browser`에서 실제 Express, Vite, MySQL, Playwright Chromium으로 검증된다.
- 키오스크 상태 수집은 DB/API와 React heartbeat로 연결됐고, 브라우저 E2E가 초기 heartbeat와 관리자 대시보드 요약 렌더링을 확인한다. 지속 갱신은 `npm run ops:heartbeat-soak`로 별도 검증한다.
- DB 스키마에는 기본 관리자 seed가 없다. 관리자 생성 스크립트는 테스트 DB E2E에서 검증되며, 실제 운영 DB 실행 검증은 환경별로 필요하다.
- Docker/compose와 운영 runbook, 헬스/레디니스/metrics API, Prometheus/Grafana/Alertmanager 로컬 설정, DB 백업/복구/retention/upload hook, `/opt/aiosk/.env.production` 기반 systemd timer 예시, SQL migration/rollback runner, GHCR image publish workflow, SSH 기반 remote compose deploy workflow, production GitHub Environment gate/audit, GitHub Actions deploy secret/variable audit, production compose rollout 스크립트는 추가됐다. 실제 `.env.production` materialization, GitHub Actions deploy secrets와 repository variable `FRONTEND_API_URL`, tokenized heartbeat 배포 시 optional `FRONTEND_KIOSK_STATUS_TOKEN`, 원격 host secret 파일, 외부 알림 채널, object storage provider CLI/credential 운영은 환경별 작업으로 남아 있다.

## 완료 판정 기준

- 루트 `npm test` 정적 계약 검증과 프론트 lint/build가 통과한다.
- 실제 MySQL DB에서 공개 주문 생성, 키오스크 상태 저장/조회, 관리자 로그인, 주문 상태 변경, 메뉴/카테고리 CRUD, 통계 조회가 검증된다.
- 관리자 계정 생성 절차가 문서화되고 실제 운영 DB에서 실행 검증된다.
- 실제 `.env.production`과 필요한 secret file이 운영 host에 materialize되고 `npm run ops:preflight` 통과 기록이 확보된다.
- `GITHUB_ENVIRONMENT=production npm run ops:github-env:check`와 `GITHUB_ENVIRONMENT=production npm run ops:github-actions:check`가 통과한다. Actions audit 통과에는 `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`, repository variable `FRONTEND_API_URL`이 필요하며, backend `KIOSK_STATUS_TOKEN`을 쓰는 배포는 optional `FRONTEND_KIOSK_STATUS_TOKEN`도 release 전에 준비해야 한다.
- 실제 secret manager provider/credential, 외부 alert receiver/credential, object storage provider CLI/credential과 운영 백업/복구 drill 기록이 확보된다.
- 실제 운영 URL에서 `npm run ops:smoke`와 `npm run ops:heartbeat-soak` 실행 기록이 확보된다.
- README, API 가이드, 상태 보고서가 현재 코드와 일치한다.
- `.history/`, 쿠키, 로그, 로컬 `.env` 같은 생성/개인 파일이 Git에 남지 않는다.
