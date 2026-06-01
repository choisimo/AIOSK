# AIOSK 프로젝트 상태 요약

> 최초 작성: 2026-05-29
> 최근 갱신: 2026-05-30
> 상세 감사: [PROJECT_COMPLETENESS_AUDIT.md](PROJECT_COMPLETENESS_AUDIT.md)

## 현재 상태

AIOSK는 데모/MVP 골격이 구현된 상태다. 이전 문서의 "100% 프로덕션 레디" 평가는 현재 코드 증거로는 확인되지 않는다.

## 구현됨

- Express 백엔드 서버와 Socket.IO 초기화
- Swagger UI 및 OpenAPI JSON 제공
- MySQL 기반 모델 계층
- 공개 카테고리/메뉴/주문 API
- JWT 기반 관리자 API, 주문/통계/키오스크 상태/메뉴/카테고리 관리 경로
- EJS 기반 관리자 화면과 DB 기반 로그인/주요 조회 화면
- React + TypeScript 기반 키오스크 UI
- `/healthz` liveness, `/readyz` DB readiness, `/metrics` Prometheus metrics API
- Redux Toolkit 장바구니 상태, React Query API 상태, Material UI 기반 프론트 화면 구성

## 남은 작업

- 관리자 계정 생성 절차의 실제 운영 DB 실행 검증
- 실제 `.env.production` materialization. 2026-05-30 재실행 기준 기본 `npm run ops:preflight`는 `/home/nodove/workspace/AIOSK/.env.production` 파일 부재로 env parsing 전에 실패한다.
- GitHub Actions deploy secrets, repository variable `FRONTEND_API_URL`, tokenized heartbeat 배포 시 optional `FRONTEND_KIOSK_STATUS_TOKEN` 설정
- 실제 secret manager provider/credential, 실제 외부 alert receiver/credential, object storage provider credential/운영 백업 drill 실행 기록, 복잡한 schema 변경 검증 체계 보강
- 실제 운영 URL에서 `npm run ops:smoke`와 `npm run ops:heartbeat-soak` 실행 기록 확보

## 이번 정리

- Git에 포함되어 있던 `.history/` 393개 파일과 `cookies.txt`를 제거했다.
- 라우트에 연결되지 않은 legacy 컨트롤러와 미사용 React 관리자 API 파일을 제거했다.
- 비활성 라우트에만 걸려 있던 bulk delete/register 잔여 심볼을 제거했다.
- 공개 API 응답을 React 화면 타입으로 정규화하고, 누락된 `Order.findById` 모델 함수를 복구했다.
- 남아 있던 React 관리자 인증 slice/토큰 주입 잔여 코드를 제거했다.
- 어떤 화면도 읽지 않던 Redux 주문 상태 slice와 주문 mutation dispatch를 제거했다.
- 미사용 프론트 UI 확장 컴포넌트/props, 백엔드 모델 생성자 잔여 코드, 관리자 공용 JS의 미사용 Socket.IO/utility 표면을 추가로 정리했다.
- EJS 관리자 layout의 추출 inline script 출력 누락을 수정하고, 페이지별 직접 Socket.IO 연결을 공용 shared socket event bridge로 통합했다.
- 임시 `/api` 테스트 메시지를 정식 API index 응답으로 바꾸고, Express/Socket.IO CORS를 `CORS_ORIGIN`/`SOCKET_CORS_ORIGIN` env 계약으로 정리했다.
- 운영 모드에서 누락된 DB env, 약한 `JWT_SECRET`/`SESSION_SECRET`, `SESSION_STORE=memory`, 누락되거나 localhost/wildcard인 CORS origin을 시작 전에 거부하고, 관리자 세션을 MySQL `Sessions` 테이블에 저장하도록 정리했다.
- SIGTERM/SIGINT/unhandled rejection 종료 경로에서 HTTP server, MySQL session cleanup timer, MySQL pool을 닫고 `SHUTDOWN_TIMEOUT_MS`로 대기 시간을 제한하도록 정리했다. 이 값은 env example, compose, production preflight, runtime guard에 연결돼 있다.
- 누락돼 있던 키오스크 메뉴 placeholder와 관리자/API 문서 favicon을 SVG 정적 자산으로 추가하고 stale asset reference를 정적 검증에서 차단했다.
- `npm run admin:create` 관리자 계정 생성 스크립트를 추가했다. Admin bootstrap은 `ADMIN_ENV_FILE`과 production compose env의 `COMPOSE_DB_*` fallback을 지원한다.
- EJS 관리자 로그인/대시보드/주문/메뉴/카테고리/통계 화면을 DB 모델 기반으로 전환했다.
- EJS 관리자 메뉴/카테고리 생성/수정/삭제 폼을 서버 POST 액션에 연결했다.
- 서버에서 제공되지 않는 루트 HTML 테스트 페이지와 미연결 프론트 테스트 셸 스크립트를 제거했다.
- API 테스트 가이드를 현재 Swagger/curl 계약 기준으로 갱신했다.
- 실제 전송 API가 없던 키오스크 이메일/SMS 알림 mock UI를 제거했다.
- 영수증 인쇄, 관리자 주문 상세, 관리자 공용 알림의 동적 HTML 삽입 경로에 escaping guard를 추가했다.
- 관리자 CSV 리포트의 메뉴/카테고리명은 CSV escaping helper와 spreadsheet formula prefix guard를 거친다.
- 프론트 공개 API 실패를 mock 데이터로 숨기던 fallback을 제거하고 mock 데이터 사용을 개발 서버의 명시적 환경 변수로 제한했다. production build와 Docker image build는 `VITE_USE_MOCK_DATA=true`를 거부한다.
- 프론트 API 기본 URL은 개발 모드에서만 `http://localhost:3000`으로 fallback하고, 운영 bundle/image는 `VITE_API_URL` 누락 또는 local address를 기본적으로 거부하도록 정리했다. 로컬 compose/CI 예외는 `VITE_ALLOW_LOCAL_API_URL=true`로 명시한다. Frontend production build flag인 `VITE_ALLOW_LOCAL_API_URL`과 `VITE_USE_MOCK_DATA`는 `true` 또는 `false`만 허용한다.
- 추적 중이던 `frontend/.env.development`가 백엔드 `3001`과 mock mode를 강제해 현재 계약과 충돌하므로 제거했고, 로컬 프론트 env는 ignore하고 `frontend/.env.example`만 추적 가능하도록 정리했다.
- 실제 데이터 경로가 없던 관리자 설정/키오스크 모니터링 화면과 프로필 링크를 제거했다.
- 관리자 실시간 주문 이벤트명을 현재 백엔드 Socket.IO emit 계약에 맞췄다.
- 코드에서 import되지 않는 루트/프론트 npm 의존성을 제거하고 타입 전용 패키지를 개발 의존성으로 옮겼다.
- 루트 `npm test` placeholder를 `scripts/verify-static.js` 기반 JavaScript/EJS 기본 검사와 문서/라우트/OpenAPI/운영 계약 정적 검증으로 교체했다.
- 일반 `npm audit fix` 후 루트와 프론트 audit이 0건으로 통과한다.
- GitHub Actions CI로 루트 정적 검증/audit, DB shell script syntax check, 프론트 lint/build/audit, DB/API E2E, migration smoke, Docker image build, Prometheus/Alertmanager/Grafana 설정 검증을 실행하도록 추가했다.
- Vite `manualChunks` 설정으로 프론트 빌드의 500 kB 초과 청크 경고를 제거했다.
- `npm run test:e2e`와 GitHub Actions MySQL 서비스 job으로 실제 DB/API 핵심 흐름을 자동 검증한다.
- DB/API E2E에서 발견한 주문 목록/인기 메뉴 통계의 MySQL `LIMIT ?` prepared statement 오류를 수정했다.
- `KioskStatuses` 기반 키오스크 상태 수집, 공개 heartbeat API, 관리자 조회 API, React heartbeat, 대시보드 상태 요약을 추가했다.
- `Sessions` 테이블과 MySQL-backed session store를 추가해 운영 EJS 관리자 세션이 기본 MemoryStore에 남지 않도록 했다.
- 문서/env에만 있던 `UPLOAD_DIR`, `MAX_FILE_SIZE`, `LOG_DIR`를 실제 업로드 경로, Multer 제한, Winston 로그 디렉터리에 연결하고, 미지원 `.env.example`/`.env.production.example` placeholder 키를 제거했다.
- `READINESS_DB_TIMEOUT_MS`, `REQUEST_BODY_LIMIT`, API/auth rate limit 설정을 env/compose/preflight/runtime guard에 연결해 readiness timeout, 요청 크기 제한, 반복 요청 제한 설정 drift를 줄였다.
- 추적 중이던 `uploads/menus/README.md` 테스트 fixture를 제거하고, 런타임 업로드/로그/백업/빌드 산출물과 루트 로컬 `.env.*` 재유입을 `.gitignore`와 정적 검증으로 차단했다.
- Swagger/OpenAPI 서버 URL의 hard-coded localhost를 제거하고, 기본 현재 origin 또는 `API_PUBLIC_URL`을 사용하도록 정리했다.
- Swagger/OpenAPI가 `/api`, `/api-docs.json`, 헬스/메트릭, 공개 API, 관리자 주문/통계/키오스크 상태/메뉴/카테고리 경로를 포함하도록 보강했고 정적 검증이 live path coverage를 확인한다.
- 관리자 사이드바의 stale `http://localhost:5175` 키오스크 링크를 `KIOSK_FRONTEND_URL` 또는 `CORS_ORIGIN` 기반 링크로 교체했다.
- EJS 관리자 화면의 Bootstrap, Bootstrap Icons, Chart.js CDN 의존을 제거하고 backend가 root production dependency에서 `/vendor/...` local assets를 제공하게 했다.
- Local vendor asset 요청이 EJS 관리자 로그인 CSRF session cookie를 바꾸지 않도록 static middleware를 flash middleware 앞에 두고, 로그인 성공 시 session save 후 redirect하도록 보강했다.
- Deprecated `connect-flash` dependency를 제거하고 EJS 관리자 flash message 기능을 local session middleware로 대체했다.
- `/healthz` liveness, `/readyz` DB readiness, `/metrics` Prometheus metrics API, Docker backend healthcheck를 추가했다.
- Prometheus scrape 설정과 기본 backend down/5xx/latency alert rule을 추가했다.
- CI가 기본 Prometheus config와 token-secured production Prometheus config를 모두 검증하고, release validation도 Docker 기반 monitoring config 검증을 image publish 전에 실행하도록 보강했다.
- Alertmanager noop route와 Grafana datasource/dashboard provisioning을 추가했다.
- `npm run test:e2e`가 테스트 DB에서 `scripts/create-admin.js`와 EJS 관리자 세션 페이지를 검증하도록 확장했다.
- `npm test`와 `npm run test:e2e`가 관리자 inline script 렌더링과 중복 socket 생성 방지를 검증하도록 확장했다.
- 정적 검증이 임시 런타임 marker 재유입을 차단하도록 확장했다.
- 정적 검증이 핵심 정적 자산 존재 여부와 stale placeholder/favicon 참조를 검사하도록 확장했다.
- 정적 검증이 production runtime config guard, `Sessions` 스키마 계약, upload env 계약, 미지원 `.env.example`/`.env.production.example` 키 금지를 확인하고, DB/API E2E가 관리자 세션 cookie의 `HttpOnly`/`SameSite=Lax` 속성과 MySQL session row 생성을 확인하도록 확장했다.
- `scripts/e2e-browser.js`와 `npm run test:e2e:browser`를 추가해 실제 MySQL, Express, Vite, Playwright Chromium으로 React 키오스크 주문 흐름, EJS 관리자 로그인/주문 상태 변경/카테고리·메뉴 생성, DB 반영을 검증한다.
- GitHub Actions CI에 browser E2E job을 추가했고 Docker image build가 DB/API E2E와 browser E2E 통과 뒤 실행되도록 조정했다.
- `scripts/production-preflight.sh`와 `npm run ops:preflight`를 추가해 production env/compose, env 파일 권한, placeholder secret, 16자 이상 compose DB/Grafana 운영 비밀번호, `SESSION_STORE=mysql`, upload 경로/용량 설정, request body 크기 제한, API/auth rate limit, pinned image tag, wildcard/localhost CORS, session cookie, metrics scrape, offsite backup, noop Alertmanager receiver, Grafana dashboard JSON을 배포 전에 검증한다.
- `scripts/github-environment-audit.sh`와 `npm run ops:github-env:check`를 추가해 실제 GitHub Environment required reviewer와 deployment branch policy를 감사할 수 있게 했다.
- `choisimo/AIOSK`에 `production` GitHub Environment를 생성하고 `choisimo` required reviewer와 `main` custom deployment branch policy를 설정했다. `GITHUB_ENVIRONMENT=production npm run ops:github-env:check`가 required reviewer, deployment branch policy, `main` policy까지 통과함을 확인했다.
- `scripts/github-actions-secrets-audit.sh`와 `npm run ops:github-actions:check`를 추가해 deploy workflow가 요구하는 GitHub Actions secret, release workflow가 요구하는 repository variable `FRONTEND_API_URL`, tokenized heartbeat release에 필요한 권장 repository variable `FRONTEND_KIOSK_STATUS_TOKEN`의 존재 여부를 감사할 수 있게 했다.
- 2026-05-30 재실행 기준 `choisimo/AIOSK`의 repository/environment secrets와 repository/environment variables는 비어 있어 `GITHUB_ENVIRONMENT=production npm run ops:github-actions:check`가 `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`, repository variable `FRONTEND_API_URL` 누락으로 실패하고 `DEPLOY_KNOWN_HOSTS`, `FRONTEND_KIOSK_STATUS_TOKEN` 누락을 경고한다.
- 2026-05-30 재실행 기준 `npm run ops:github-env:check`는 통과했고 `npm run ops:github-actions:check`는 위 secret/variable 누락으로 실패한다.
- release workflow가 `FRONTEND_API_URL` 누락 또는 local address를 frontend image publish 전에 거부하도록 했고, deploy workflow가 `latest` tag와 필수 SSH secret 누락을 원격 연결 전에 거부하도록 했다.
- `src/utils/envSecrets.js`를 추가해 backend app secret을 `*_FILE`로 주입할 수 있게 했고, production compose와 preflight가 `JWT_SECRET_FILE`, `SESSION_SECRET_FILE`, `KIOSK_STATUS_TOKEN_FILE`, `METRICS_TOKEN_FILE`을 인식하도록 연결했다.
- `npm test`와 임시 production env preflight로 secret file loader와 `JWT_SECRET_FILE`/`SESSION_SECRET_FILE`/`KIOSK_STATUS_TOKEN_FILE`/`METRICS_TOKEN_FILE` 기반 검증 경로를 확인했다. Preflight와 host-side Node CLI secret loader는 `/run/secrets/...` container path를 `AIOSK_SECRETS_DIR` host path로 해석하고, required secret file 누락 시 nonzero로 실패한다.
- 라우트/컨트롤러 등록 경로와 depcheck를 재검사해 새 orphan route/controller 또는 unused dependency가 없음을 확인했고, 주석 처리된 과거 대안 코드 블록을 정리했다.
- 프론트 키오스크, EJS 관리자 브라우저 코드, 백엔드 모델/Socket.IO 경로의 개발용 `console.log`/`console.debug`를 제거했고, 백엔드 `src/` 런타임 오류 로그는 `console.error` 대신 구조화 logger로 통일했다. 주문 실패/전역 브라우저 오류의 중복 `console.warn`/`console.error` side effect도 화면 피드백으로 대체했다.
- 에러/보안 로그의 request header/body/query, access log URL query, Error `cause`/`details`에서 Authorization, Cookie, password, token, secret 계열 값을 재귀적으로 마스킹하도록 logger redaction을 추가했고 `npm test`에서 검증한다.
- `npm run deploy:compose`와 remote compose deploy는 기본적으로 production preflight를 먼저 실행한다. 긴급 우회는 `SKIP_PREFLIGHT=1`로만 가능하며, local deploy의 `SKIP_PREFLIGHT` 값은 `0` 또는 `1`만 허용한다.
- `npm run deploy:compose`와 remote compose deploy는 기본적으로 DB service를 먼저 기동하고 health/running 상태를 확인한 뒤 새 backend image에서 `db-migrate.js up`을 실행한다. 호환성이 확인된 긴급 재기동이나 수동 migration 완료 후에만 `RUN_MIGRATIONS=0`으로 생략한다.
- `scripts/ops-smoke.js`와 `npm run ops:smoke`를 추가해 배포 후 실제 서비스 URL에서 read-only HTTP/DB 상태, 선택적 관리자 JWT와 CSRF 기반 EJS session login/logout, 선택적 임시 쓰기 경로를 검증한다.
- `RUN_SMOKE=1 npm run deploy:compose`로 compose 기동 직후 smoke를 실행할 수 있게 했고, secure metrics 배포에서는 `METRICS_TOKEN` 또는 `AIOSK_SECRETS_DIR/metrics_token`을 smoke token으로 자동 전달한다. Remote deploy bundle과 deploy workflow의 `run_smoke`/`smoke_base_url` 입력에도 smoke 실행 경로를 연결했다.
- `scripts/heartbeat-soak.js`와 `npm run ops:heartbeat-soak`를 추가해 키오스크 heartbeat 반복 전송과 선택적 관리자 상태 조회 검증을 실행할 수 있게 했다.
- `scripts/db-backup.sh`가 partial backup artifact를 남기지 않도록 temporary file에 먼저 쓰고 gzip 검증 통과 뒤 최종 `.sql.gz`로 move하게 했다. Fake `mysqldump` 회귀 검증이 실패 시 artifact cleanup과 성공 시 최종 artifact 생성을 확인한다.
- `scripts/db-restore.sh`가 corrupt `.sql.gz` archive에 대해 `mysql` restore stream을 시작하지 않도록 사전 `gzip -t` 검증을 추가했다. `ALLOW_PRODUCTION_RESTORE`와 restore drill의 `ALLOW_UNSAFE_RESTORE_DRILL`은 `0` 또는 `1`만 허용하며, fake `mysql` 회귀 검증이 invalid flag/corrupt archive 차단과 valid archive restore 호출을 확인한다.
- `scripts/db-restore-drill.sh`와 `npm run db:restore:drill`을 추가해 백업 파일을 scratch DB에 복구하고 핵심 테이블 존재/row count를 검증할 수 있게 했다.
- `OPERATIONS_RUNBOOK.md`에 운영 점검, 장애 대응, rollback 절차를 추가했다.
- Dockerfile/compose 기반 로컬 컨테이너 구성을 추가했고, DB 백업/복구/schema 적용 스크립트를 추가했다.
- Backend production image는 E2E/verifier/deploy helper가 아니라 migration/admin/schema/backup/restore 운영 스크립트만 포함하도록 좁혔고, image 내부 npm script surface도 이 runtime command들만 노출하도록 pruning했다.
- GHCR image publish workflow와 registry image 기반 production compose rollout 스크립트를 추가했다.
- SSH 기반 remote compose deploy workflow와 재사용 가능한 원격 배포 스크립트를 추가했다.
- DB 백업 gzip 검증, retention, 외부 보관 디렉터리 복사 옵션, provider CLI 기반 upload hook과 `/opt/aiosk/.env.production`을 읽는 systemd timer 예시를 추가했다. DB 백업/복구/복구 drill/schema 적용 shell script는 production compose env의 `COMPOSE_DB_*` fallback과 명시 env file override를 지원한다.
- baseline 이후 SQL migration/rollback runner와 `KioskStatuses`/`Sessions` migration 파일을 추가했다. Migration runner는 `MIGRATION_ENV_FILE`과 production compose env의 `COMPOSE_DB_*` fallback을 지원하고 `COMPOSE_DB_BIND`를 host-side DB connection에 반영한다. Mutating migration은 현재 image에 없는 `orphaned` row나 checksum이 달라진 `changed` row가 있으면 `migration history drift`로 실패해 schema 변경을 시작하지 않는다.
- Docker 빌드 컨텍스트에서 로컬 산출물이 빠지도록 루트/프론트 `.dockerignore`를 추가했다.
- 삭제 항목과 로컬 env 변형 파일 재생성을 막기 위해 `.gitignore`와 `scripts/verify-static.js`의 pruned artifact absence guard를 보강했다.
- README 프로젝트 구조 섹션을 현재 파일 구조에 맞게 정리하고 malformed code fence와 pruned runtime file 참조를 정적 검증에서 차단했다.
