# AIOSK 관리자 접근 가이드

> 업데이트: 2026-05-30
> 기준: `src/routes/webAdmin.routes.js`, `src/controllers/webAdmin.controller.js`, `scripts/create-admin.js`

## 현재 동작

- EJS 관리자 화면은 `/admin` 하위에서 제공된다.
- `/admin/login`만 인증 없이 접근 가능하다.
- `/admin/logout`과 그 외 `/admin` 하위 화면은 `req.session.admin`이 있어야 접근 가능하다.
- `/admin/logout`은 CSRF 토큰을 포함한 POST form으로만 제공된다.
- 로그인은 `Admins` 테이블의 bcrypt 해시와 입력 비밀번호를 비교한다.
- 기본 관리자 비밀번호는 코드나 문서에 제공하지 않는다.

## 관리자 계정 생성

`DB_NAME`에 해당하는 database를 먼저 생성하고, guarded schema apply를 실행한 뒤 관리자 계정을 만든다.

```bash
mysql -u <user> -p -e "CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema
ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong-password>' npm run admin:create
```

`DB_NAME`이 `kiosk_db`가 아니면 생성할 database 이름과 `CONFIRM_SCHEMA_APPLY` 값을 실제 DB 이름에 맞춘다.
동일한 username이 이미 있으면 비밀번호 해시를 갱신한다.

## 접속

```bash
npm run dev
```

- 관리자 화면: `http://localhost:3000/admin`
- 로그인 화면: `http://localhost:3000/admin/login`
- API 문서: `http://localhost:3000/api-docs`

`PORT` 환경 변수를 설정하면 포트를 바꿀 수 있다.

## 관리자 화면 범위

- DB 기반: 로그인, 대시보드, 주문 목록/상세, 주문 상태 변경, 주문 취소, 메뉴 목록/생성/수정/삭제, 카테고리 목록/생성/수정/삭제, 통계 조회
- 자동 검증: `npm run test:e2e`가 실제 MySQL DB/API 레벨에서 관리자 로그인, 주문 액션, 통계 조회, 메뉴/카테고리 CRUD와 EJS 관리자 세션 페이지를 확인한다.
- 브라우저 검증: `npm run test:e2e:browser`가 React 키오스크 주문 흐름과 EJS 관리자 로그인/주문 상태 변경/카테고리·메뉴 생성을 실제 Chromium으로 확인한다.
- 키오스크 상태: React heartbeat와 `/api/public/kiosk/status`가 `KioskStatuses`에 저장하고, 대시보드와 `/api/admin/kiosks/status`가 이를 조회한다.
- 보완 필요: 실제 운영 URL에서 배포 후 smoke와 장시간 heartbeat soak 기록 확보
- 제거됨: 실제 데이터 경로가 없던 설정 화면, 키오스크 모니터링 화면, 프로필 링크

## 문제 해결

- 로그인 실패: `Admins` 테이블에 계정이 있는지 확인하고 `npm run admin:create`로 비밀번호를 갱신한다.
- `/admin` 리다이렉트 반복: 브라우저 세션 쿠키를 지우고 다시 로그인한다.
- DB 오류: `.env`의 `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`와 `npm run db:apply-schema` 적용 여부를 확인한다.
- 포트 충돌: `PORT=4001 npm run dev`처럼 다른 포트로 실행한다.
