# AIOSK 관리자 화면 정리 내역

> 업데이트: 2026-05-30
> 상세 상태: [PROJECT_COMPLETENESS_AUDIT.md](PROJECT_COMPLETENESS_AUDIT.md)

## 해결된 항목

- `/admin/login`만 인증 예외로 두고, `/admin/logout`과 나머지 관리자 화면은 `requireAuth` 뒤에 두었다. `/admin/logout`은 CSRF 토큰을 포함한 POST form으로만 호출된다.
- 관리자 로그인은 하드코딩 계정 대신 `Admins` 테이블의 bcrypt 해시를 검증한다.
- `scripts/create-admin.js`와 `npm run admin:create`를 추가해 관리자 계정을 생성/갱신할 수 있게 했다.
- `/admin/menus`에 대응하는 `src/views/admin/menus.ejs`를 추가했다.
- 대시보드, 주문, 메뉴, 카테고리, 통계 화면을 임시 데이터 대신 모델 조회 기반으로 전환했다.
- 주문 상세 조회, 상태 변경, 취소 버튼은 `/admin/orders/:orderId.json`, `/admin/orders/:orderId/status`, `/admin/orders/:orderId/cancel` 라우트를 호출한다.
- 메뉴/카테고리 생성, 수정, 삭제 폼은 `/admin/menus`와 `/admin/categories` 하위 POST 액션을 호출한다.
- 실제 데이터 경로가 없던 설정 화면, 키오스크 모니터링 화면, 프로필 링크는 관리자 UI에서 제거했다.
- 관리자 실시간 주문 이벤트 수신 이름은 현재 백엔드 Socket.IO emit 계약에 맞췄다.

## 현재 관리자 실행 절차

```bash
cp .env.example .env
mysql -u <user> -p -e "CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema
ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong-password>' npm run admin:create
npm run dev
```

`DB_NAME`이 `kiosk_db`가 아니면 생성할 database 이름과 `CONFIRM_SCHEMA_APPLY` 값을 실제 DB 이름에 맞춘다.

관리자 화면은 `http://localhost:3000/admin`에서 접근한다. 포트는 `PORT` 환경 변수로 바꿀 수 있다.

## 검증 상태와 남은 운영 작업

- 키오스크 상태 수집은 React heartbeat와 DB/API 경로에 연결됐고, 브라우저 E2E가 초기 heartbeat와 관리자 대시보드 요약 렌더링을 확인한다.
- 관리자 로그인, 주문 액션, 통계 조회, 메뉴/카테고리 CRUD는 `npm run test:e2e`에서 실제 MySQL DB/API 레벨로 검증한다.
- React 키오스크와 EJS 관리자 핵심 흐름은 `npm run test:e2e:browser`에서 실제 Chromium으로 검증한다.
- 루트 `npm test`는 정적 검증만 실행하며, DB/API E2E는 `npm run test:e2e`로 분리되어 있다.
- 실제 운영 URL에서 `npm run ops:smoke`와 `npm run ops:heartbeat-soak` 실행 기록 확보는 환경별 작업으로 남아 있다.
