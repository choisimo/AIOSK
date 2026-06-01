# AIOSK API 테스트 가이드

> 업데이트: 2026-05-30
> 기준: `src/server.js`, `src/routes/**/*.js`, `src/controllers/**/*.js`

## 전제 조건

```bash
cp .env.example .env
mysql -u <user> -p -e "CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema
ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong-password>' npm run admin:create
npm run dev
```

`db:apply-schema`는 database를 생성하지 않으므로 `DB_NAME`에 해당하는 database를 먼저 만든다.
`DB_NAME`이 `kiosk_db`가 아니면 생성할 database 이름과 `CONFIRM_SCHEMA_APPLY` 값을 실제 DB 이름에 맞춘다.
서버 기본 URL은 `http://localhost:3000`이다. 다른 포트로 실행했다면 아래 예시의 포트도 함께 바꾼다.

## Swagger

- UI: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`

## System

```bash
curl http://localhost:3000/api
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
curl http://localhost:3000/metrics
```

`/api`는 서비스명, 버전, 상태, 문서/헬스 체크 링크를 반환하는 API index다.
`/healthz`는 프로세스 liveness만 확인한다. `/readyz`는 DB `SELECT 1`을 실행하며 DB 연결 실패나 timeout이면 503을 반환한다.
`/metrics`는 Prometheus text format을 반환한다. `METRICS_TOKEN`이 설정된 서버에서는 `x-metrics-token` 또는 `Authorization: Bearer <token>`이 필요하다.

## 공개 API

### 카테고리 조회

```bash
curl http://localhost:3000/api/public/categories
```

### 메뉴 조회

```bash
curl http://localhost:3000/api/public/menus
curl "http://localhost:3000/api/public/menus?categoryId=1"
```

### 주문 생성

공개 주문 생성 요청은 `items` 1-100개를 받으며 각 항목은 `menuId` 1 이상 정수와 `quantity` 1-99 정수만 허용한다. 서버는 현재 메뉴 가격을 조회해 주문 금액을 계산한다.

```bash
curl -X POST http://localhost:3000/api/public/orders \
  -H "Content-Type: application/json" \
  -d '{"items":[{"menuId":1,"quantity":2}]}'
```

### 키오스크 상태 보고

React 키오스크 화면은 브라우저별 `kioskId`를 `localStorage`에 저장하고 `/api/public/kiosk/status`로 60초마다 heartbeat를 보낸다. `KIOSK_STATUS_TOKEN`을 설정한 서버에서는 `x-kiosk-status-token` 또는 `Authorization: Bearer <token>`이 필요하다. React bundle은 optional `VITE_KIOSK_STATUS_TOKEN`이 설정된 경우 `x-kiosk-status-token` header를 보낸다.

```bash
curl -X POST http://localhost:3000/api/public/kiosk/status \
  -H "Content-Type: application/json" \
  -d '{"kioskId":"kiosk-01","label":"Front Counter","status":"ONLINE","appVersion":"local"}'
```

## 관리자 API

### 로그인

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).data.token")
```

### 주문 조회 및 상태 변경

```bash
curl http://localhost:3000/api/admin/orders \
  -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:3000/api/admin/orders/1/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"PREPARING"}'

curl -X PATCH http://localhost:3000/api/admin/orders/1/cancel \
  -H "Authorization: Bearer $TOKEN"
```

상태 값은 `RECEIVED`, `PREPARING`, `COMPLETED`, `CANCELLED` 중 하나다.

### 키오스크 상태 조회

```bash
curl http://localhost:3000/api/admin/kiosks/status \
  -H "Authorization: Bearer $TOKEN"
```

### 카테고리 관리

`CATEGORY_ID`는 실제 테스트용 카테고리 ID로 바꾼다. 삭제 예시는 연결된 메뉴가 없는 테스트 카테고리에서만 실행한다.

```bash
curl http://localhost:3000/api/categories \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트 카테고리","sort_order":99}'

CATEGORY_ID=1

curl http://localhost:3000/api/categories/$CATEGORY_ID \
  -H "Authorization: Bearer $TOKEN"

curl -X PUT http://localhost:3000/api/categories/$CATEGORY_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트 카테고리 수정","sort_order":100}'

curl -X DELETE http://localhost:3000/api/categories/$CATEGORY_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 메뉴 관리

`MENU_ID`와 `CATEGORY_ID`는 실제 테스트용 ID로 바꾼다. 주문에 연결된 메뉴 삭제는 DB 제약 조건이나 운영 정책에 따라 실패할 수 있으므로 새 테스트 메뉴에서만 삭제를 확인한다.

```bash
curl "http://localhost:3000/api/menus?category_id=$CATEGORY_ID&status=FOR_SALE" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/menus \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트 메뉴","description":"API 테스트용","price":4500,"category_id":1,"status":"FOR_SALE"}'

MENU_ID=1

curl http://localhost:3000/api/menus/$MENU_ID \
  -H "Authorization: Bearer $TOKEN"

curl -X PUT http://localhost:3000/api/menus/$MENU_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트 메뉴 수정","price":5000,"status":"SOLD_OUT"}'

curl -X DELETE http://localhost:3000/api/menus/$MENU_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 통계 조회

```bash
START_DATE=2026-05-01
END_DATE=2026-05-30

curl "http://localhost:3000/api/admin/statistics?startDate=$START_DATE&endDate=$END_DATE" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/sales?startDate=$START_DATE&endDate=$END_DATE" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/top-menus?limit=10" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/daily-sales" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/hourly-analysis" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/category-analysis" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/report?format=json" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/admin/statistics/report?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o sales-report.csv
```

### 메뉴 이미지 업로드

```bash
curl -X POST http://localhost:3000/api/menus/1/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/menu-image.jpg"
```

## 관리자 화면

- EJS 관리자 화면: `http://localhost:3000/admin`
- 로그인은 `Admins` 테이블의 bcrypt 해시를 사용한다.
- 계정이 없거나 비밀번호를 바꿔야 하면 `npm run admin:create`를 다시 실행한다.

## 자동화 검증

- 루트 `npm test`는 `scripts/verify-static.js`로 JavaScript/EJS 기본 검사와 문서/라우트/OpenAPI/운영 계약 정적 검증을 실행한다.
- `npm run test:e2e`는 `aiosk_e2e*` 테스트 DB를 drop/recreate 한 뒤 `scripts/create-admin.js`로 관리자 계정을 만들고, 실제 Express 서버와 MySQL로 공개 주문 생성, 키오스크 상태 heartbeat, 관리자 로그인, 메뉴/카테고리 CRUD, 주문 상태 변경, 통계 조회, EJS 관리자 세션 페이지 렌더링을 검증한다.
- `npm run test:e2e:browser`는 실제 Express 서버, Vite dev server, Playwright Chromium으로 React 키오스크 메뉴 선택, 장바구니 추가, 주문 완료, DB 저장과 EJS 관리자 로그인, 주문 상태 변경, 카테고리/메뉴 생성, DB 반영을 검증한다.
- GitHub Actions CI는 MySQL 서비스 컨테이너에서 migration smoke, `npm run test:e2e`, `npm run test:e2e:browser`를 실행하고 Docker image build도 확인한다.

```bash
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD=root DB_NAME=aiosk_e2e npm run test:e2e
npx playwright install chromium
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD=root DB_NAME=aiosk_e2e_browser npm run test:e2e:browser
```

## 검증 한계

- 루트의 오래된 HTML 테스트 페이지는 제거됐다. 서버는 `public/` 디렉터리만 정적 제공한다.
- 브라우저 E2E는 핵심 React 주문 흐름과 EJS 관리자 주문/카탈로그 흐름을 검증한다. 메뉴 이미지 파일 업로드는 JWT 관리자 API의 `/api/menus/:menuId/image` 경로로 별도 제공되며 현재 브라우저 E2E 범위에는 포함하지 않는다.
