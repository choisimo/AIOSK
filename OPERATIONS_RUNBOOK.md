# AIOSK 운영 Runbook

> 최초 작성: 2026-05-28
> 최근 갱신: 2026-05-30
> 근거: 현재 `src/server.js`, `database_schema.sql`, `.env.example`, `.env.docker.example`, `.env.production.example`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `scripts/*`

## 범위와 전제

이 문서는 현재 저장소에 실제로 존재하는 Express 백엔드, MySQL 스키마, EJS 관리자 화면, React 키오스크 프론트, GitHub Actions CI/release/deploy workflow 기준의 운영 절차다.

현재 저장소에는 Dockerfile, 로컬/production compose 파일, GHCR image publish workflow, SSH 기반 원격 compose deploy workflow, production GitHub Environment 승인 gate, compose rollout 스크립트, 전체 rollout 전 `db-migrate.js up` 실행 경로, DB 백업/복구 스크립트, SQL migration/rollback runner, Prometheus/Grafana/Alertmanager 설정, backend app secret의 `*_FILE` 주입 경로가 있다. 실제 secret manager provider/credential, 무중단 전환 전략, 외부 알림 채널, object storage provider CLI/credential 준비는 아직 환경별로 운영자가 명시해야 한다.

EJS 관리자 화면의 Bootstrap, Bootstrap Icons, Chart.js asset은 외부 CDN이 아니라 backend의 `/vendor/...` 경로에서 제공된다. 이 경로는 root production dependencies에서 제공되므로 production image build와 같은 dependency lock을 따른다.

## 필수 설정

백엔드 `.env` 필수 값:

```bash
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=<password>
# 또는 DB_PASSWORD_FILE=/run/secrets/db_password
DB_NAME=kiosk_db
DB_PORT=3306
JWT_SECRET=<at-least-32-characters>
SESSION_SECRET=<at-least-32-characters>
SESSION_STORE=mysql
SESSION_CLEANUP_INTERVAL_MS=900000
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAME_SITE=lax
SESSION_COOKIE_MAX_AGE_MS=86400000
TRUST_PROXY=1
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
LOG_DIR=logs
READINESS_DB_TIMEOUT_MS=2000
REQUEST_BODY_LIMIT=1mb
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=300
AUTH_RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX_REQUESTS=20
SHUTDOWN_TIMEOUT_MS=10000
```

선택 값:

```bash
KIOSK_STATUS_TOKEN=<shared-token>
METRICS_TOKEN=<shared-token>
CORS_ORIGIN=https://kiosk.example.com
SOCKET_CORS_ORIGIN=https://admin.example.com
KIOSK_FRONTEND_URL=https://kiosk.example.com
API_PUBLIC_URL=https://api.example.com
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
```

운영 시작 시 `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `SESSION_SECRET`, `SESSION_STORE=mysql`, `SESSION_COOKIE_SECURE=true`, `METRICS_TOKEN` 또는 `METRICS_TOKEN_FILE` 또는 `ALLOW_OPEN_METRICS=true`, `CORS_ORIGIN`, `SOCKET_CORS_ORIGIN`이 없거나 placeholder 값이면 서버가 시작 전에 실패한다. `PORT`가 설정된 경우 `0..65535` 정수만 허용하며, `PORT=0` ephemeral bind는 운영에서 거부한다. `CORS_ORIGIN`과 `SOCKET_CORS_ORIGIN`은 comma-separated origin 목록을 받으며, 운영에서는 `*`, `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]` origin을 거부한다. `CORS_ORIGIN`을 비우려면 `ALLOW_OPEN_CORS=true`를 명시해야 하며, 운영에서는 edge layer가 별도 origin policy를 강제하는 경우에만 사용한다.
`KIOSK_FRONTEND_URL`은 관리자 사이드바의 키오스크 화면 링크에 쓰이며, 비우면 첫 `CORS_ORIGIN`을 사용한다. `API_PUBLIC_URL`은 Swagger/OpenAPI `servers.url`에 쓰이며 비우면 현재 origin(`/`)을 사용한다.
`REQUEST_BODY_LIMIT`은 JSON과 URL-encoded 요청 파서에 적용되며 `1mb`, `512kb`, `1048576b` 같은 양수 `b`/`kb`/`mb` 단위만 허용한다. 파일 업로드 크기는 별도 `MAX_FILE_SIZE`로 제한한다.
`RATE_LIMIT_*`는 `/api` 전체 요청 제한이고 `AUTH_RATE_LIMIT_*`는 `/api/admin/login`과 `/admin/login` POST 반복 시도 제한이다. 두 제한은 in-process 고정 window 방식이므로 다중 인스턴스/edge 환경에서는 외부 gateway 또는 WAF limit과 함께 운영한다.
`SHUTDOWN_TIMEOUT_MS`는 SIGTERM/SIGINT 종료 시 HTTP 서버, MySQL session cleanup timer, MySQL pool을 닫기 위해 기다리는 최대 시간이다. 제한 시간을 넘기면 프로세스는 실패 코드로 종료한다.

프론트 `frontend/.env` 기본 값:

```bash
VITE_API_URL=http://localhost:3000
VITE_ALLOW_LOCAL_API_URL=true
VITE_USE_MOCK_DATA=false
VITE_APP_VERSION=<release-version>
VITE_KIOSK_STATUS_TOKEN=<only-when-backend-kiosk-token-is-enabled>
```

`VITE_ALLOW_LOCAL_API_URL=true`는 로컬/CI 검증 빌드와 개발 compose 전용이다. `VITE_ALLOW_LOCAL_API_URL`과 `VITE_USE_MOCK_DATA`는 production frontend build에서 `true` 또는 `false`만 허용한다. Frontend build env files are parsed as strict key/value data; malformed env line은 line number만 출력하고 Vite build 전에 실패한다. 운영 frontend image는 `FRONTEND_API_URL` repository variable로 실제 백엔드 URL을 주입해야 하며, Dockerfile은 `VITE_API_URL` 누락과 local address를 기본적으로 거부한다. Backend의 `KIOSK_STATUS_TOKEN`을 브라우저 heartbeat에도 적용하려면 release image build에 `FRONTEND_KIOSK_STATUS_TOKEN` repository variable을 설정한다. 이 값은 `VITE_KIOSK_STATUS_TOKEN`으로 frontend bundle에 포함되므로 secret manager 보호 대상이 아니라 공개 client에 노출되는 shared gate로 분류하고, 강한 보호는 edge/network policy와 함께 둔다. Backend/preflight/frontend release gate는 이 shared token이 설정된 경우 16자 이상, placeholder/공백 없는 값을 요구한다.

## 배포 전 Gate

다음 명령이 모두 통과해야 한다.

```bash
npm ci
npm test
npm run deps:check
npm audit --audit-level=moderate

cd frontend && npm ci
cd frontend && npm run lint
cd frontend && VITE_API_URL=http://localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build
cd frontend && npm audit --audit-level=moderate
```

MySQL이 준비된 환경에서는 DB/API E2E도 실행한다. `DB_NAME`은 기본적으로 `aiosk_e2e*`만 자동 drop/recreate 된다.

```bash
DB_HOST=127.0.0.1 \
DB_PORT=3306 \
DB_USER=root \
DB_PASSWORD=root \
DB_NAME=aiosk_e2e \
JWT_SECRET=local-e2e-jwt-secret-at-least-32-characters \
E2E_APP_PORT=3100 \
npm run test:e2e
```

`npm run test:e2e`는 `scripts/create-admin.js`로 관리자 계정을 실제 생성하고, 공개 API, 관리자 API, 키오스크 상태 API, EJS 관리자 세션 페이지를 검증한다. E2E runner는 `DB_NAME`이 `aiosk_e2e*`로 시작할 때만 DB reset을 허용한다. 다른 DB 이름을 의도적으로 reset해야 하는 제한 상황에서는 `E2E_ALLOW_UNSAFE_DB=1`을 명시해야 하며, 이 값은 `0` 또는 `1`만 허용한다. E2E runner positional arguments fail before DB reset or server setup: `test:e2e`와 `test:e2e:browser`는 옵션을 env로만 받고, 잘못 붙은 positional argument는 DB reset이나 서버 기동 전에 usage로 실패한다. 두 E2E runner 모두 `E2E_ADMIN_USERNAME`과 `E2E_ADMIN_PASSWORD`로 seed 관리자 계정을 바꿀 수 있다. DB/API E2E runner만 `E2E_UPLOAD_DIR`를 받는다. 이 값이 없으면 OS temporary upload dir을 만들고 테스트 종료 시 정리하며, 값을 주면 caller가 해당 directory cleanup을 책임진다.

React 키오스크와 EJS 관리자 브라우저 흐름은 Playwright Chromium으로 검증한다.

```bash
npx playwright install chromium
DB_HOST=127.0.0.1 \
DB_PORT=3306 \
DB_USER=root \
DB_PASSWORD=root \
DB_NAME=aiosk_e2e_browser \
JWT_SECRET=local-browser-e2e-jwt-secret-at-least-32-characters \
E2E_APP_PORT=3101 \
E2E_FRONTEND_PORT=5174 \
npm run test:e2e:browser
```

운영 compose env를 만든 뒤에는 production preflight를 실행한다. 이 검사는 placeholder secret, `.env.production` 파일 권한 과다 노출, `SESSION_STORE=mysql`, session cleanup/cookie 설정, upload 경로/용량 설정, request body 크기 제한, API/auth rate limit, `COMPOSE_DB_NAME` safe identifier, compose service port `1..65535` 범위, `:latest` 이미지, open/wildcard/localhost CORS, metrics token file 누락 또는 scrape token 불일치, offsite backup 미설정, noop Alertmanager receiver, compose config 오류를 배포 전에 실패시킨다. `COMPOSE_DB_PASSWORD`, `COMPOSE_MYSQL_ROOT_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`는 16자 이상 non-placeholder 운영 비밀번호여야 한다. Production runtime도 metrics token, metrics token file, 또는 명시적 open-metrics 의도를 시작 전에 검증한다. Direct backend/Node entrypoint는 `DB_PASSWORD`, `JWT_SECRET`, `SESSION_SECRET`, `KIOSK_STATUS_TOKEN`, `METRICS_TOKEN`을 값 대신 `*_FILE`로도 제공할 수 있고, preflight는 app secret file의 존재/가독성/빈 값 여부를 확인한다. Production compose의 DB service password는 `COMPOSE_DB_PASSWORD` 계약을 사용한다. `*_FILE=/run/secrets/...` 값은 container 경로이므로 preflight와 host-side Node CLI secret loader는 `AIOSK_SECRETS_DIR` 아래의 matching host file을 검사한다. Production monitoring profile을 쓰는 경우 metrics는 `METRICS_TOKEN_FILE=/run/secrets/metrics_token`으로 제공해야 Prometheus도 같은 token file을 scrape에 사용할 수 있다.

```bash
cp .env.production.example .env.production
# .env.production의 비밀번호, secret, image tag, origin, backup target을 운영 값으로 교체한다.
chmod 600 .env.production
PREFLIGHT_ENV_FILE=.env.production npm run ops:preflight
```

preflight는 실제 env 파일이 `other` 사용자에게 읽기/쓰기/실행 가능하거나 group write/execute, executable bit, special permission bit가 있으면 실패한다. 로컬 백업만 의도적으로 허용해야 하는 제한 환경에서는 `PREFLIGHT_ALLOW_LOCAL_BACKUP_ONLY=1`을 명시한다. `/metrics`를 별도 private network나 edge auth 뒤에 둬 토큰 없이 열어야 하는 제한 환경에서는 runtime env의 `ALLOW_OPEN_METRICS=true`와 preflight env의 `PREFLIGHT_ALLOW_OPEN_METRICS=1`을 함께 명시한다. 외부 알림 채널 없이 구조 검증만 해야 하는 제한 환경에서는 `PREFLIGHT_ALLOW_NOOP_ALERTS=1`을 명시한다. 파일 권한 검사를 우회해야 하는 특수 파일시스템에서는 `PREFLIGHT_ALLOW_WEAK_ENV_FILE_PERMS=1`을 명시하고 배포 기록에 사유를 남긴다. `PREFLIGHT_ALLOW_*`, `PREFLIGHT_VALIDATE_MONITORING`, `SKIP_PREFLIGHT` preflight 제어값은 모두 `0` 또는 `1`만 허용하고, runtime env의 `ALLOW_OPEN_METRICS`와 `ALLOW_OPEN_CORS`는 설정 시 `true` 또는 `false`만 허용한다. `.env.production`의 malformed env line은 secret 값을 echo하지 않고 line number만 출력한 뒤 Docker 검사 전에 실패한다. `SKIP_PREFLIGHT=1 npm run deploy:compose`는 긴급 우회용이며, 우회 사유와 후속 검증 결과를 배포 기록에 남긴다.

Operational verification entrypoints reject positional arguments before preflight or network work: `ops:preflight`, `ops:smoke`, `ops:heartbeat-soak`는 옵션을 env로만 받고, 잘못 붙은 positional argument는 env/compose/network/API 검사 전에 usage로 실패한다.

Secret manager나 Docker/Kubernetes secret을 파일로 sync하는 환경에서는 `.env.production`에 secret 값 대신 파일 경로를 둔다. 같은 secret의 값과 `*_FILE`을 동시에 설정하면 backend가 시작 전에 실패한다.

```bash
DB_PASSWORD_FILE=/run/secrets/db_password
JWT_SECRET_FILE=/run/secrets/aiosk_jwt_secret
SESSION_SECRET_FILE=/run/secrets/aiosk_session_secret
KIOSK_STATUS_TOKEN_FILE=/run/secrets/aiosk_kiosk_status_token
METRICS_TOKEN_FILE=/run/secrets/metrics_token
```

Production compose는 `AIOSK_SECRETS_DIR`을 `/run/secrets`에 read-only로 mount한다. Monitoring profile은 `monitoring/prometheus.secure.yml`을 사용하며 backend metrics scrape token을 `/run/secrets/metrics_token`에서 읽는다. Secret file을 운영할 때는 host의 secret file 경로와 container의 `*_FILE=/run/secrets/...` 경로가 일치하도록 `AIOSK_SECRETS_DIR` 또는 secret 파일명을 맞춘다. Required `JWT_SECRET_FILE`/`SESSION_SECRET_FILE`과 optional `KIOSK_STATUS_TOKEN_FILE`이 누락되거나 비어 있으면 preflight가 실패한다. Direct backend `DB_PASSWORD_FILE`은 app DB 연결 설정에서 읽지만, compose-managed MySQL user password는 여전히 `COMPOSE_DB_PASSWORD`로 DB service에 전달한다. `RUN_SMOKE=1` 배포 smoke는 `SMOKE_METRICS_TOKEN`이 없으면 env의 `METRICS_TOKEN`을 먼저 쓰고, 없으면 `AIOSK_SECRETS_DIR/metrics_token`에서 file-based metrics token을 읽어 `/metrics` smoke에 사용한다.

배포가 끝난 뒤에는 실제 서비스 URL을 대상으로 smoke 검증을 실행한다. 기본 검사는 `/healthz`, `/readyz`, `/metrics`, `/api`, `/api-docs.json`, 공개 카테고리/메뉴, 관리자 로그인 페이지, 인증 경계를 읽기 전용으로 확인한다. 각 HTTP 요청 timeout은 기본 `10000ms`이며 느린 환경에서는 `SMOKE_TIMEOUT_MS`로 늘린다. 이 값은 positive integer millisecond만 허용하고 잘못된 값은 네트워크 요청 전에 실패한다. Smoke base URL 우선순위는 `SMOKE_BASE_URL`, 공통 `BASE_URL`, local default 순서다. Smoke admin credential 우선순위는 `SMOKE_ADMIN_USERNAME`/`SMOKE_ADMIN_PASSWORD`, 공통 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 순서다. 각 credential tier는 username/password가 완전한 pair여야 하며, 상위 tier의 partial pair는 하위 tier 값과 섞지 않고 네트워크 요청 전에 실패한다.

```bash
SMOKE_BASE_URL=https://api.example.com npm run ops:smoke
```

운영 runtime/preflight는 기본적으로 32자 이상의 `METRICS_TOKEN` 또는 `METRICS_TOKEN_FILE`을 요구한다. `npm run ops:smoke`를 직접 실행할 때 protected `/metrics` 검증에는 `SMOKE_METRICS_TOKEN` 또는 `METRICS_TOKEN`을 전달한다. `RUN_SMOKE=1` 배포 smoke는 env의 `METRICS_TOKEN` 또는 file-backed metrics token을 자동 전달한다.

```bash
SMOKE_BASE_URL=https://api.example.com \
SMOKE_METRICS_TOKEN=<metrics-token> \
npm run ops:smoke
```

관리자 계정까지 검증하려면 다음 값을 함께 전달한다. 이 모드는 JWT 로그인, 관리자 키오스크 상태 API, CSRF 기반 EJS session login/logout, 관리자 대시보드 렌더링, logout 후 기존 세션 cookie 차단을 확인한다.

```bash
SMOKE_BASE_URL=https://api.example.com \
SMOKE_ADMIN_USERNAME=admin \
SMOKE_ADMIN_PASSWORD='<password>' \
npm run ops:smoke
```

쓰기 검증은 운영 데이터에 취소 주문 audit row를 남긴다. 임시 카테고리와 메뉴는 정리하지만 주문 row는 삭제 API가 없으므로 `CANCELLED` 상태로 남는 것이 정상이다.

```bash
SMOKE_BASE_URL=https://api.example.com \
SMOKE_ADMIN_USERNAME=admin \
SMOKE_ADMIN_PASSWORD='<password>' \
SMOKE_RUN_WRITE=1 \
npm run ops:smoke
```

키오스크 heartbeat가 지속적으로 갱신되는지는 soak로 확인한다. 기본값은 `ops-heartbeat-soak` kiosk row를 5분 동안 10초 간격으로 갱신한다. 운영에서 `KIOSK_STATUS_TOKEN`을 설정했다면 같은 값을 `SOAK_KIOSK_STATUS_TOKEN`으로 전달한다. 실제 브라우저 키오스크도 같은 header를 보내려면 frontend release image가 matching `FRONTEND_KIOSK_STATUS_TOKEN`으로 publish되어 있어야 한다. 이 값은 16자 이상, placeholder/공백 없는 shared gate여야 한다. Heartbeat soak base URL 우선순위는 `SOAK_BASE_URL`, `SMOKE_BASE_URL`, 공통 `BASE_URL`, local default 순서다. Soak admin credential 우선순위는 `SOAK_ADMIN_USERNAME`/`SOAK_ADMIN_PASSWORD`, `SMOKE_ADMIN_USERNAME`/`SMOKE_ADMIN_PASSWORD`, 공통 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 순서다. 각 credential tier는 username/password가 완전한 pair여야 하며, 상위 tier의 partial pair는 하위 tier 값과 섞지 않고 네트워크 요청 전에 실패한다.

```bash
SOAK_BASE_URL=https://api.example.com \
SOAK_KIOSK_STATUS_TOKEN=<kiosk-status-token> \
npm run ops:heartbeat-soak
```

관리자 계정을 함께 전달하면 soak 중 `/api/admin/kiosks/status`에서 해당 kiosk가 `ONLINE`으로 보이고 최근 heartbeat age가 임계값 이하인지 매 반복 확인한다.

```bash
SOAK_BASE_URL=https://api.example.com \
SOAK_ADMIN_USERNAME=admin \
SOAK_ADMIN_PASSWORD='<password>' \
SOAK_DURATION_MS=300000 \
SOAK_INTERVAL_MS=10000 \
npm run ops:heartbeat-soak
```

동일 환경에서 여러 soak row를 구분하려면 `SOAK_KIOSK_ID`, `SOAK_KIOSK_LABEL`, `SOAK_APP_VERSION`을 지정한다. 요청 timeout과 관리자 상태 freshness 판정은 `SOAK_TIMEOUT_MS`, `SOAK_MAX_AGE_SECONDS`로 조정할 수 있으며, duration/interval/timeout/max-age 값은 모두 양의 정수만 허용된다.

## Docker Compose 실행

로컬 컨테이너 구동 예시:

```bash
cp .env.docker.example .env.docker
# .env.docker의 비밀번호와 secret 값을 수정한다.
docker compose --env-file .env.docker up --build
```

기본 포트:

- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173`
- MySQL: `localhost:3306`

`docker-compose.yml`은 MySQL 최초 초기화 시 `database_schema.sql`을 `/docker-entrypoint-initdb.d/001-schema.sql`로 적용한다. 기존 `mysql_data` volume이 이미 있으면 init SQL은 다시 실행되지 않는다.

## Release Image Publish

`.github/workflows/release.yml`은 `v*` tag push 또는 수동 dispatch에서 GHCR 이미지를 publish한다.

- publish 전 backend `npm test`, DB shell script syntax check, production preflight structure check, backend audit, frontend lint/build/audit을 실행한다. PR/push CI에서는 DB/API E2E와 browser E2E도 실행한다.
- 수동 dispatch는 명시적인 `image_tag`를 요구하며 `latest`와 `manual`처럼 재사용되는 mutable tag를 거부한다.
- backend image: `ghcr.io/<owner>/aiosk-backend:<tag>`
- frontend image: `ghcr.io/<owner>/aiosk-frontend:<tag>`
- mutable `latest` tag는 publish하지 않는다. production deploy와 rollback은 검증된 immutable release tag로만 수행한다.
- frontend build arg의 `VITE_API_URL`은 GitHub repository variable `FRONTEND_API_URL`로 지정해야 한다. release workflow는 GitHub Environment에 연결되어 있지 않으므로 Environment variable만 설정하면 값이 전달되지 않는다. 값이 없거나 local address이면 release validation/build/publish 전에 실패하고, frontend Dockerfile도 명시적인 예외 없이 local API URL을 거부한다.
- 운영 release 전에는 `npm run ops:github-actions:check`로 `FRONTEND_API_URL` 누락 여부와, backend `KIOSK_STATUS_TOKEN`을 쓰는 배포의 optional `FRONTEND_KIOSK_STATUS_TOKEN` 준비 여부를 확인한다.

운영 배포용 tag는 변경 이력과 rollback 기준이 되므로 `v1.0.0` 같은 고정 tag를 사용한다.

## Production Compose 배포

production compose는 로컬 build가 아니라 registry image를 pull해서 실행한다.

```bash
cp .env.production.example .env.production
# .env.production의 image tag, DB 비밀번호, JWT/SESSION secret, Grafana 비밀번호를 수정한다.
npm run deploy:compose
```

monitoring profile까지 함께 기동:

```bash
MONITORING_PROFILE=1 npm run deploy:compose
```

`scripts/deploy-compose.sh`는 기본적으로 `.env.production`과 `docker-compose.prod.yml`을 사용하며, `docker compose pull`, DB service 기동, DB health/running 상태 확인, backend image의 `db-migrate.js up`, `up -d --remove-orphans`, `ps`를 순서대로 실행한다. 다른 경로가 필요하면 `ENV_FILE`, `COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`을 지정한다. `MONITORING_PROFILE`, `RUN_MIGRATIONS`, `RUN_SMOKE`, `SKIP_PREFLIGHT`는 모두 `0` 또는 `1`만 허용한다. `SKIP_PREFLIGHT=1`이어도 local deploy는 env 파일의 malformed env line을 line number만 출력하고 Docker 명령 전에 실패한다.

Migration runner는 배포 env 파일의 `COMPOSE_DB_NAME`을 읽어 `CONFIRM_MIGRATION_APPLY`에 넣고 실행된다. 기존 DB에 pending migration을 적용하지 않는 긴급 재기동이나 이미 수동 적용을 검증한 rollback 절차에서는 `RUN_MIGRATIONS=0`으로 생략할 수 있지만, 배포 기록에 사유와 별도 migration 검증 결과를 남긴다.

```bash
RUN_MIGRATIONS=0 npm run deploy:compose
```

배포 직후 smoke까지 같은 명령에서 실행하려면 `RUN_SMOKE=1`을 지정한다. 기본 smoke 대상은 `http://127.0.0.1:${COMPOSE_BACKEND_PORT:-3000}`이며, reverse proxy의 실제 HTTPS URL을 검증하려면 `SMOKE_BASE_URL`을 명시한다. Metrics가 token file로 보호된 배포에서는 `scripts/deploy-compose.sh`가 `AIOSK_SECRETS_DIR/metrics_token`을 읽어 smoke에 전달한다. `SMOKE_RUN_WRITE`와 `SMOKE_SKIP_ADMIN_SESSION`은 설정 시 `0`, `1`, `true`, `false`만 허용한다.

```bash
RUN_SMOKE=1 SMOKE_BASE_URL=https://api.example.com npm run deploy:compose
```

production compose 기본 바인딩:

- Backend API: `0.0.0.0:${COMPOSE_BACKEND_PORT:-3000}`
- Frontend: `0.0.0.0:${COMPOSE_FRONTEND_PORT:-5173}`
- MySQL: `127.0.0.1:${COMPOSE_DB_PORT:-3306}`
- Prometheus/Alertmanager/Grafana: `127.0.0.1` 바인딩

서비스는 `restart: unless-stopped`와 healthcheck를 사용한다. `docker-compose.prod.yml`도 MySQL 최초 volume 초기화에만 `database_schema.sql`을 적용하므로, 기존 volume의 schema 변경은 migration runner로 관리한다. 기본 compose deploy는 전체 backend/frontend rollout 전에 DB service만 먼저 띄우고 `db-migrate.js up`을 실행한다.

## Remote Compose Deploy

`.github/workflows/deploy-compose.yml`은 수동 dispatch로 원격 호스트에서 production compose를 실행한다. 이 workflow는 third-party SSH action 없이 runner의 `ssh`와 `tar` 스트리밍을 사용하고, `environment` input을 GitHub Environment에 연결한다. 운영 저장소에서는 해당 Environment에 required reviewer를 설정해 승인 gate로 사용한다.

Remote env is restored from backup after failed deploy attempts before remote rollout completion. 원격 runner는 image tag를 env 파일에 반영하기 전 `${DEPLOY_ENV_FILE}.bak.<timestamp>`를 만들고, `scripts/deploy-compose.sh`가 실패하면 그 백업을 다시 복사해 실패한 tag가 다음 배포 입력으로 남지 않게 한다.

workflow dispatch의 `image_tag`는 `latest`가 아닌 immutable release tag여야 하며, `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY` secret은 SSH 준비 전에 검증된다.

GitHub Environment 보호 규칙은 저장소 파일만으로 강제할 수 없으므로 실제 GitHub API 상태를 audit한다. Environment 보호 규칙 audit와 Actions secret/variable audit는 모두 `gh api --jq`를 사용하므로 인증된 `gh` CLI가 있으면 실행할 수 있다.

```bash
GITHUB_REPOSITORY=<owner>/<repo> \
GITHUB_ENVIRONMENT=production \
npm run ops:github-env:check

GITHUB_REPOSITORY=<owner>/<repo> \
GITHUB_ENVIRONMENT=production \
npm run ops:github-actions:check
```

기본 audit는 required reviewer 1명 이상과 deployment branch policy를 요구한다. custom branch policy가 켜져 있으면 기본 branch policy 이름으로 저장소 default branch를 요구하며, 필요하면 `GITHUB_ENV_REQUIRED_BRANCH_POLICIES=main,release/*`처럼 명시한다. 브랜치 정책을 다른 릴리스 절차에서 강제하는 경우에만 `GITHUB_ENV_REQUIRE_BRANCH_POLICY=0`을 명시하고 배포 기록에 사유를 남긴다.

2026-05-30 재실행 기준 현재 이 작업공간의 원격 저장소 `choisimo/AIOSK`의 `production` Environment는 `choisimo` required reviewer와 `main` custom deployment branch policy로 설정되어 있으며 `GITHUB_ENVIRONMENT=production npm run ops:github-env:check`가 통과한다.

GitHub Actions secret/variable audit는 배포 workflow가 요구하는 secret 이름이 repository 또는 선택한 Environment에 존재하는지, release workflow가 요구하는 `FRONTEND_API_URL`이 repository variable에 존재하는지를 확인하며 값은 읽지 않는다. Backend에서 `KIOSK_STATUS_TOKEN`을 켜는 배포를 위해 optional `FRONTEND_KIOSK_STATUS_TOKEN` repository variable도 권장 항목으로 경고한다. 2026-05-30 재실행 기준 `choisimo/AIOSK`의 repository secrets, production environment secrets, repository variables, production environment variables는 모두 비어 있으므로 `GITHUB_ENVIRONMENT=production npm run ops:github-actions:check`는 `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY`, `FRONTEND_API_URL` 누락으로 실패하고 `DEPLOY_KNOWN_HOSTS`, `FRONTEND_KIOSK_STATUS_TOKEN` 누락을 경고한다.

`GITHUB_REQUIRED_ACTION_SECRETS`, `GITHUB_RECOMMENDED_ACTION_SECRETS`, `GITHUB_REQUIRED_ACTION_VARIABLES`, `GITHUB_RECOMMENDED_ACTION_VARIABLES`로 audit 대상 이름을 바꿀 수 있지만, comma-separated 항목은 GitHub secret/variable identifier 문자(`A-Z`, `a-z`, `0-9`, `_`)만 사용할 수 있다. 필수 목록은 빈 항목만으로 override할 수 없으며, invalid CSV는 GitHub API 호출 전에 실패한다.

필수 GitHub Secrets:

- `DEPLOY_SSH_HOST`: 원격 호스트명 또는 IP
- `DEPLOY_SSH_USER`: 원격 SSH 사용자
- `DEPLOY_SSH_PRIVATE_KEY`: 배포용 private key

필수 GitHub Variables:

- `FRONTEND_API_URL`: release image build에 주입할 실제 backend API URL. repository variable로 설정한다.

권장 GitHub Variables:

- `FRONTEND_KIOSK_STATUS_TOKEN`: backend `KIOSK_STATUS_TOKEN`을 켠 브라우저 키오스크 release에서 matching heartbeat header를 bundle에 넣기 위한 browser-visible token. repository variable로 설정하며, token 없는 배포에서는 비워둔다.

선택 GitHub Secrets:

- `DEPLOY_SSH_PORT`: 기본값 `22`, 설정 시 `1..65535` 정수만 허용한다.
- `DEPLOY_KNOWN_HOSTS`: `ssh-keyscan` 대신 고정 host key를 쓰려면 설정한다. 운영에서는 이 값을 사용하는 편이 안전하다.

원격 호스트 전제:

- Docker와 Docker Compose plugin이 설치되어 있어야 한다.
- `remote_path` 기본값은 `/opt/aiosk`다.
- 원격 `remote_path/.env.production`은 배포 전에 운영자가 만들어야 한다. workflow는 이 파일을 생성하지 않고, `AIOSK_BACKEND_IMAGE`, `AIOSK_FRONTEND_IMAGE`만 선택한 `image_tag`로 갱신한다. 파일 권한은 `chmod 600 .env.production` 또는 group read가 필요한 경우 `chmod 640 .env.production`처럼 `other` 접근 없이 설정한다.
- workflow는 `docker-compose.prod.yml`, `.env.production.example`, `database_schema.sql`, `monitoring/`, `database/migrations/`, deploy/preflight/DB/smoke/soak 운영 스크립트를 원격 경로에 복사한다. GitHub Environment와 secret/variable audit helper는 원격 호스트가 아니라 GitHub/로컬 runner에서만 실행한다.

수동 실행 입력:

- `environment`: GitHub Environment 이름, 기본 `production`
- `image_tag`: 배포할 GHCR tag, 예: `v1.0.0`
- `remote_path`: 원격 경로, 기본 `/opt/aiosk`
- `remote_env_file`: 원격 경로 기준 env 파일, 기본 `.env.production`
- `compose_project_name`: 기본 `aiosk`
- `monitoring_profile`: `1`이면 monitoring profile 포함
- `run_migrations`: 기본 `1`. `1`이면 전체 compose rollout 전에 DB service를 띄우고 새 backend image의 `db-migrate.js up`을 실행한다.
- `run_smoke`: `1`이면 remote compose 기동 직후 읽기 전용 smoke 실행
- `smoke_base_url`: smoke 대상 backend URL. 비우면 remote host의 `http://127.0.0.1:${COMPOSE_BACKEND_PORT:-3000}`를 사용한다.

로컬에서 같은 경로를 직접 실행하려면 다음 환경 변수를 설정한다.

```bash
DEPLOY_SSH_HOST=<host> \
DEPLOY_SSH_USER=<user> \
SSH_KEY_FILE=~/.ssh/aiosk_deploy_key \
AIOSK_BACKEND_IMAGE=ghcr.io/<owner>/aiosk-backend:v1.0.0 \
AIOSK_FRONTEND_IMAGE=ghcr.io/<owner>/aiosk-frontend:v1.0.0 \
RUN_SMOKE=1 \
SMOKE_BASE_URL=https://api.example.com \
npm run deploy:remote
```

호환성이 이미 검증된 긴급 재기동에서 migration을 의도적으로 생략해야 할 때만 `RUN_MIGRATIONS=0 npm run deploy:remote`를 사용한다.
deploy shell entrypoints reject positional arguments before local or remote actions: `deploy:compose`와 `deploy:remote`의 배포 옵션은 환경 변수로만 전달하고, positional argument가 붙으면 docker/ssh 실행 전에 usage로 실패한다.
deploy remote SSH files fail before SSH commands: `SSH_KEY_FILE` 또는 `SSH_KNOWN_HOSTS_FILE`을 지정하면 읽을 수 있고 비어 있지 않은 파일이어야 하며, 잘못된 경로나 빈 파일은 원격 명령 전에 실패한다.

## 최초 DB 준비

운영 DB를 생성한 뒤 guarded schema apply 스크립트로 baseline을 적용한다.

```sql
CREATE DATABASE IF NOT EXISTS kiosk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

현재 `database_schema.sql`은 `db:apply-schema`가 적용하는 신규 DB용 baseline 스키마다. 기존 운영 DB에 적용하기 전에는 반드시 백업을 만든다.

```bash
CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema
SCHEMA_ENV_FILE=.env.production CONFIRM_SCHEMA_APPLY=kiosk_db npm run db:apply-schema
```

기본 환경 파일은 `.env`이며, production compose env로 실행하려면 `SCHEMA_ENV_FILE=.env.production`을 지정한다. Schema apply는 `DB_*` 값을 우선 사용하고, production compose env의 `COMPOSE_DB_NAME`, `COMPOSE_DB_USER`, `COMPOSE_DB_PASSWORD`, `COMPOSE_DB_PORT`, `COMPOSE_DB_BIND`를 fallback으로 사용한다. `DB_NAME`이 `aiosk_e2e*`가 아닌 경우 `CONFIRM_SCHEMA_APPLY=<DB_NAME>`이 필요하다.

## Schema Migration

`database/migrations/*.up.sql`과 `*.down.sql`은 baseline 이후 schema 변경을 이력으로 관리한다. `scripts/db-migrate.js`는 migration file load 단계에서 예상 형식 밖의 파일이나 하위 디렉터리를 거부하고, 모든 `*.up.sql`에 matching `*.down.sql`이 있으며 고아 `*.down.sql`이 없는지 확인한 뒤 `SchemaMigrations` 테이블을 만들고 적용된 migration의 checksum을 기록한다. 지원 command는 `status`, `up`, `down`뿐이며, 다른 command는 DB 설정 파싱이나 연결 전에 usage로 실패한다. `status`의 추가 인자와 `up`/`down`의 두 번째 초과 인자는 unexpected migration CLI arguments fail before DB config parsing 계약으로 DB 설정 파싱이나 연결 전에 실패한다. `up [limit]`와 `down [count]`의 선택 인자는 migration up/down count arguments must be safe positive integers 계약을 따른다. 너무 큰 정수, 부분 숫자, `0`은 DB 연결 전에 실패한다.
기본 환경 파일은 `.env`이며, production compose env로 실행하려면 `MIGRATION_ENV_FILE=.env.production`을 지정한다. Migration runner는 `DB_*` 값을 우선 사용하고, production compose env의 `COMPOSE_DB_NAME`, `COMPOSE_DB_USER`, `COMPOSE_DB_PASSWORD`, `COMPOSE_DB_PORT`, `COMPOSE_DB_BIND`를 fallback으로 사용한다. `DB_PASSWORD_FILE=/run/secrets/db_password` 같은 file-backed DB password는 `AIOSK_SECRETS_DIR` 아래 host file로 해석된다.

상태 확인:

```bash
npm run db:migrate:status
MIGRATION_ENV_FILE=.env.production npm run db:migrate:status
```

적용:

```bash
CONFIRM_MIGRATION_APPLY=kiosk_db npm run db:migrate -- up
MIGRATION_ENV_FILE=.env.production CONFIRM_MIGRATION_APPLY=kiosk_db npm run db:migrate -- up
```

마지막 migration rollback:

```bash
CONFIRM_MIGRATION_ROLLBACK=kiosk_db npm run db:rollback
MIGRATION_ENV_FILE=.env.production CONFIRM_MIGRATION_ROLLBACK=kiosk_db npm run db:rollback
```

`DB_NAME`이 `aiosk_e2e*`로 시작하면 confirmation 없이 migration smoke test에 사용할 수 있다. 운영 DB에서 `up` 또는 `down`을 실행하기 전에는 `npm run db:backup`으로 백업을 만들고, `npm run db:migrate:status`에서 `changed` 또는 `orphaned` 항목이 없는지 확인한다. Migration runner는 mutating `up`/`down` 실행 전에 같은 검사를 다시 수행하며, checksum이 바뀐 migration이나 현재 image에 없는 applied row가 있으면 `migration history drift`로 보고 schema 변경을 시작하지 않는다. 이 실패는 DB가 현재 image와 다른 schema history를 갖고 있다는 뜻이므로, 동일 image/env로 status를 재확인한 뒤 missing migration file 복구, 올바른 release image 선택, 또는 별도 복구 계획으로 처리한다.

## 관리자 계정 생성

기본 seed 계정은 없다. 배포 후 다음 명령으로 관리자 계정을 생성하거나 비밀번호를 갱신한다.

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong-password>' npm run admin:create
ADMIN_USERNAME=admin ADMIN_PASSWORD_FILE=/run/secrets/admin_password npm run admin:create
ADMIN_ENV_FILE=.env.production ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong-password>' npm run admin:create
```

평문 비밀번호는 로그에 남기지 않는다. 같은 username으로 다시 실행하면 bcrypt 해시를 새로 만들어 비밀번호를 갱신한다. Secret file 기반 bootstrap은 `ADMIN_PASSWORD_FILE`을 사용할 수 있으며, `/run/secrets/...` 값은 `AIOSK_SECRETS_DIR` 아래 host file로 해석된다. `ADMIN_PASSWORD`와 `ADMIN_PASSWORD_FILE`을 동시에 설정하면 DB 연결 전에 실패한다. Production compose env로 실행할 때는 `ADMIN_ENV_FILE=.env.production`을 지정한다. Admin bootstrap은 `DB_*` 값을 우선 사용하고, production compose env의 `COMPOSE_DB_NAME`, `COMPOSE_DB_USER`, `COMPOSE_DB_PASSWORD`, `COMPOSE_DB_PORT`, `COMPOSE_DB_BIND`를 fallback으로 사용한다. admin:create CLI fallback options require explicit values: `--username`과 `--password`를 쓰는 경우 다음 토큰이 비어 있거나 다른 option 토큰이면 DB 연결 전에 실패한다. admin:create unsupported CLI options fail before DB pool loading: 지원 option은 `--username`, `--password`뿐이며, 값이 `--`로 시작해야 하는 특수한 경우에는 환경 변수 `ADMIN_USERNAME`/`ADMIN_PASSWORD`를 사용한다. admin:create duplicate CLI fallback options fail before DB pool loading: 같은 fallback option을 두 번 넘기면 뒤쪽 값이 조용히 무시되지 않고 DB 연결 전에 실패한다. admin:create unexpected positional arguments fail before DB pool loading: `--username`/`--password`와 그 값 외의 bare argument는 DB 연결 전에 usage로 실패한다.

## 백업과 복구

백업:

```bash
BACKUP_ENV_FILE=.env.production npm run db:backup -- backups/kiosk_db_$(date +%Y%m%d_%H%M%S).sql.gz
```

백업 스크립트는 `mysqldump`와 `gzip`이 필요하다. backend Docker image에는 MySQL client가 포함되어 있어 컨테이너에서도 실행할 수 있다.

선택 설정:

```bash
BACKUP_DIR=/var/backups/aiosk
BACKUP_VERIFY=1
BACKUP_RETENTION_DAYS=14
BACKUP_MIN_KEEP=7
BACKUP_REMOTE_DIR=/mnt/aiosk-backups
BACKUP_UPLOAD_COMMAND='rclone copy "$BACKUP_FILE" "remote:aiosk-backups/$BACKUP_DB_NAME/"'
```

- 기본 환경 파일은 저장소 루트의 `.env`다. 다른 파일을 쓰려면 `BACKUP_ENV_FILE=/path/to/env npm run db:backup`, `RESTORE_ENV_FILE=/path/to/env npm run db:restore`, `DRILL_ENV_FILE=/path/to/env npm run db:restore:drill`처럼 실행한다. DB operation shell script는 `DB_*` 값을 우선 사용하고, production compose env의 `COMPOSE_DB_NAME`, `COMPOSE_DB_USER`, `COMPOSE_DB_PASSWORD`, `COMPOSE_DB_PORT`, `COMPOSE_DB_BIND`를 fallback으로 사용한다. DB shell env files are parsed as literal key/value data; shell code와 command substitution은 실행하지 않고 malformed env line은 line number만 출력한 뒤 `mysql`/`mysqldump` 전에 실패한다. Shell DB password도 `DB_PASSWORD_FILE`을 지원하며 `/run/secrets/...` 값은 `AIOSK_SECRETS_DIR` 아래 host file로 해석한다. `DB_PASSWORD`와 `DB_PASSWORD_FILE`을 동시에 설정하면 `mysql`/`mysqldump` 실행 전에 실패한다. `DB_NAME`/`COMPOSE_DB_NAME`은 shell DB client 실행 전에 letters/numbers/underscores only identifier로 검증된다. Option-like backup/schema paths fail before DB shell work; 파일명이 `-`로 시작해야 한다면 `./-file.sql.gz`처럼 경로를 명시한다. DB shell operation positional arguments fail before mysql clients: `db:backup`/`db:restore`/`db:restore:drill`/`db:apply-schema`는 지원 개수보다 많은 positional argument가 붙으면 `mysql`/`mysqldump` 실행 전에 usage로 실패한다.
- `BACKUP_VERIFY=1`이면 생성된 gzip 백업을 `gzip -t`로 검증한다. `BACKUP_VERIFY`는 `0` 또는 `1`만 허용하며, 오타 값은 `mysqldump` 실행 전에 실패한다. Backup은 같은 디렉터리의 temporary file에 먼저 쓰고 검증 통과 뒤 최종 경로로 move하므로 dump 실패나 gzip 검증 실패가 지정한 backup artifact를 남기지 않는다.
- `BACKUP_RETENTION_DAYS`를 설정하면 만료된 `${DB_NAME}_*.sql.gz` 백업을 삭제한다.
- `BACKUP_MIN_KEEP`은 retention 삭제 중에도 보존할 최소 백업 수다.
- `BACKUP_REMOTE_DIR`은 마운트된 외부 디스크, NFS, 또는 rclone mount 같은 외부 보관 경로를 가정한다.
- `BACKUP_UPLOAD_COMMAND`를 설정하면 앞뒤 공백을 제거한 뒤 gzip 검증과 `BACKUP_REMOTE_DIR` 복사 이후 `bash -c`로 실행한다. Blank 값은 `mysqldump` 전에 실패한다. 명령에는 `BACKUP_FILE`, `BACKUP_BASENAME`, `BACKUP_DB_NAME` 환경 변수가 전달된다.
- `BACKUP_UPLOAD_COMMAND` 예시는 `rclone copy "$BACKUP_FILE" "remote:aiosk-backups/$BACKUP_DB_NAME/"`, `aws s3 cp "$BACKUP_FILE" "s3://bucket/aiosk/$BACKUP_BASENAME"` 형태다.
- 스크립트는 `rclone`, `aws`, `gsutil` 같은 provider CLI를 설치하거나 credential을 발급하지 않는다. 해당 CLI와 credential은 systemd unit 또는 컨테이너 실행 환경에 미리 준비해야 한다.

systemd timer 예시는 `deploy/systemd/aiosk-db-backup.service`와 `deploy/systemd/aiosk-db-backup.timer`에 있다. `/opt/aiosk` 경로로 배포한 경우 unit은 `/opt/aiosk/.env.production`을 `EnvironmentFile`과 `BACKUP_ENV_FILE`로 사용한다. 다음 흐름으로 등록한다.

```bash
sudo cp deploy/systemd/aiosk-db-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aiosk-db-backup.timer
systemctl list-timers aiosk-db-backup.timer
```

복구:

```bash
ALLOW_PRODUCTION_RESTORE=1 npm run db:restore -- backups/kiosk_db_YYYYMMDD_HHMMSS.sql.gz
RESTORE_ENV_FILE=.env.production ALLOW_PRODUCTION_RESTORE=1 npm run db:restore -- backups/kiosk_db_YYYYMMDD_HHMMSS.sql.gz
```

`db:restore`는 기본적으로 `aiosk_restore*` 또는 `aiosk_e2e*` DB에만 복구한다. 운영 DB 복구는 `ALLOW_PRODUCTION_RESTORE=1`을 명시해야 하며, `ALLOW_PRODUCTION_RESTORE`는 `0` 또는 `1`만 허용한다. `.sql.gz` 백업은 `mysql`을 실행하기 전에 `gzip -t`로 먼저 검증하므로 손상된 gzip archive가 DB restore stream을 시작하지 않는다.

복구 drill:

```bash
npm run db:restore:drill -- backups/kiosk_db_YYYYMMDD_HHMMSS.sql.gz
DRILL_SOURCE_DB_NAME=kiosk_db npm run db:restore:drill
DRILL_ENV_FILE=.env.production npm run db:restore:drill -- backups/kiosk_db_YYYYMMDD_HHMMSS.sql.gz
```

`db:restore:drill`은 백업 파일을 `aiosk_restore*` scratch DB에 복구한 뒤 `Admins`, `Categories`, `Menus`, `Orders`, `OrderItems`, `KioskStatuses`, `Sessions` 테이블 존재와 row count 조회를 확인한다. 백업 파일을 지정하지 않으면 `DRILL_SOURCE_DB_NAME` 또는 `DB_NAME`으로 임시 백업을 만들고 그 파일을 복구한다. 기본적으로 scratch DB는 drill 종료 시 삭제하며, 장애 분석을 위해 보존하려면 `DRILL_KEEP_DB=1`을 지정한다. `DRILL_KEEP_DB`와 `ALLOW_UNSAFE_RESTORE_DRILL`은 `0` 또는 `1`만 허용한다.

## 기동과 기본 점검

백엔드:

```bash
npm start
```

기본 점검:

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
curl http://localhost:3000/metrics
curl http://localhost:3000/api
curl http://localhost:3000/api-docs.json
```

관리자 로그인:

```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'
```

키오스크 상태 heartbeat:

```bash
curl -X POST http://localhost:3000/api/public/kiosk/status \
  -H "Content-Type: application/json" \
  -d '{"kioskId":"kiosk-01","label":"Front Counter","status":"ONLINE","appVersion":"local"}'
```

`KIOSK_STATUS_TOKEN`을 설정했다면 `x-kiosk-status-token` 또는 `Authorization: Bearer <token>`을 함께 보낸다.

## 관측 지점

로그 파일:

- `logs/error.log`: 에러 로그
- `logs/combined.log`: 전체 애플리케이션 로그
- `logs/access.log`: HTTP 접근 로그

응답 헤더:

- `X-Request-ID`: 요청별 식별자

헬스 체크:

- `/healthz`: 프로세스 liveness. DB를 확인하지 않는다.
- `/readyz`: DB `SELECT 1` readiness. DB 연결 실패나 `READINESS_DB_TIMEOUT_MS` timeout이면 503을 반환한다.
- Docker backend image healthcheck는 `/readyz`를 사용한다.

Metrics:

- `/metrics`: Prometheus text format. HTTP 요청 수, 요청 시간 histogram, process uptime, process memory를 제공한다.
- `METRICS_TOKEN`을 설정하면 `x-metrics-token` 또는 `Authorization: Bearer <token>`이 필요하다. Production runtime은 32자 이상의 `METRICS_TOKEN` 또는 `METRICS_TOKEN_FILE`을 요구하고, production preflight/monitoring profile은 Prometheus scrape를 위해 `METRICS_TOKEN_FILE=/run/secrets/metrics_token`을 요구한다. 토큰 없는 metrics 노출은 `ALLOW_OPEN_METRICS=true`와 `PREFLIGHT_ALLOW_OPEN_METRICS=1`을 명시해야 하며, `ALLOW_OPEN_METRICS` 값은 설정 시 `true` 또는 `false`만 허용한다.
- 로컬 monitoring stack은 `docker compose --profile monitoring --env-file .env.docker up prometheus alertmanager grafana`로 구동한다.
- 로컬 Prometheus는 `monitoring/prometheus.yml`을 사용하고, production compose monitoring profile은 `/metrics` token scrape를 위해 `monitoring/prometheus.secure.yml`을 사용한다. Alert rule은 `monitoring/alerts.yml`, Alertmanager는 `monitoring/alertmanager.yml`, Grafana datasource/dashboard는 `monitoring/grafana/`에 있다.
- `monitoring/alertmanager.yml`의 기본 receiver는 구조 검증용 `noop`이다. 운영 배포 전에는 Slack, email, PagerDuty, webhook 등 실제 receiver를 설정해야 하며, production preflight는 `PREFLIGHT_ALLOW_NOOP_ALERTS=1`이 없으면 noop receiver를 실패시킨다.

Logging:

- backend logger는 request header/body/query/params, access log URL query, 404 error URL query를 기록할 때 Authorization, Cookie, password, token, secret 계열 값을 `[REDACTED]`로 마스킹한다.
- backend `src/` 런타임 코드는 `console.*` 대신 Winston logger를 사용하고, frontend/admin 브라우저 런타임 코드는 화면 피드백과 중복되는 `console.*` side effect를 남기지 않는다.
- `npm test`는 logger redaction, Error `cause`/`details` redaction, raw morgan `:url` 재발 방지, backend/browser runtime `console.*` 금지를 정적으로 검증한다.
- EJS 관리자 화면의 POST 요청은 세션 기반 CSRF 토큰을 요구한다. `/admin/login` form, 메뉴/카테고리 form, 주문 상태 변경 fetch가 토큰을 전달하지 않으면 403 또는 로그인 화면 redirect로 실패한다.

관리자 화면:

- `/admin`: 매출/주문/최근 주문/키오스크 상태 요약
- `/admin/orders`: 주문 목록과 상태 변경
- `/admin/menus`: 메뉴 CRUD
- `/admin/categories`: 카테고리 CRUD
- `/admin/statistics`: 통계와 리포트 화면

주의해서 볼 신호:

- `logs/combined.log`의 `Admin API login failed`, `Web admin login failed`, `CSRF token validation failed`, `Rate limit exceeded`, `Upload rejected`
- `logs/error.log`의 DB 연결 오류, JWT 오류, 업로드 오류
- `logs/combined.log`의 `Slow request detected`
- `logs/access.log`의 4xx/5xx 증가
- `/readyz` 503 증가
- `/api/admin/kiosks/status`에서 `offline` 증가

## 장애 대응

### DB 연결 실패

증상:

- `/api`는 응답하지만 카테고리/메뉴/주문/관리자 API가 500을 반환한다.
- 로그에 `ECONNREFUSED`, `Error connecting to the database via db.js`가 남는다.

조치:

1. `.env`의 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`을 확인한다.
2. MySQL 프로세스와 네트워크 접근을 확인한다.
3. `mysql -u <user> -p <database>`로 직접 접속한다.
4. 스키마가 누락됐다면 백업을 만든 뒤 `database_schema.sql` 적용 여부를 확인한다.

### 관리자 로그인 실패

증상:

- `/api/admin/login` 또는 `/admin/login`에서 인증 실패가 발생한다.

조치:

1. `Admins` 테이블에 계정이 있는지 확인한다.
2. 비밀번호가 불확실하면 `ADMIN_USERNAME=admin ADMIN_PASSWORD='<new-password>' npm run admin:create`를 실행한다.
3. `JWT_SECRET` 누락 시 API 로그인은 500을 반환하므로 `.env`를 확인한다.
4. `NODE_ENV=production`에서 DB env, `PORT`, `JWT_SECRET`, `SESSION_SECRET`, `SESSION_STORE=mysql`, `SESSION_COOKIE_SECURE=true`, `CORS_ORIGIN`, `SOCKET_CORS_ORIGIN`이 누락되거나 placeholder/local/wildcard/부분 숫자 값이면 서버가 시작 전에 실패한다. `PORT=0`은 운영에서 거부되고, `KIOSK_FRONTEND_URL`과 `API_PUBLIC_URL`도 설정된 경우 local address를 거부한다.
5. HTTPS reverse proxy 뒤에서 EJS 관리자 로그인이 유지되지 않으면 `TRUST_PROXY=1`, `SESSION_COOKIE_SECURE=true`, `Sessions` 테이블 존재 여부를 확인한다.

### 주문 생성 실패

증상:

- `POST /api/public/orders`가 400 또는 500을 반환한다.

조치:

1. 요청 body가 `{"items":[{"menuId":1,"quantity":2}]}` 형태인지 확인한다.
2. 해당 메뉴가 존재하고 `Menus.status = 'FOR_SALE'`인지 확인한다.
3. `OrderItems` foreign key 오류가 있는지 `logs/error.log`를 확인한다.

### 키오스크 상태 미수신

증상:

- 대시보드 키오스크 요약이 `온라인 0 / 전체 0`이거나 `/api/admin/kiosks/status`에 최근 heartbeat가 없다.

조치:

1. React 프론트의 `VITE_API_URL`이 백엔드 URL과 일치하는지 확인한다.
2. 브라우저 개발자 도구에서 `/api/public/kiosk/status` 요청 실패 여부를 확인한다.
3. 서버에 `KIOSK_STATUS_TOKEN`을 설정했다면 키오스크 요청에도 같은 토큰을 전달하는지 확인한다.
4. `KioskStatuses.last_seen_at`이 갱신되는지 DB에서 확인한다.

## Rollback

코드 rollback:

1. 이전에 검증된 git revision 또는 배포 artifact로 되돌린다.
2. `npm ci`, `npm test`, `npm run test:e2e`를 실행한다.
3. 백엔드를 재시작하고 `SMOKE_BASE_URL=<service-url> npm run ops:smoke`로 `/api`, `/api-docs.json`, `/readyz`, `/metrics`, 공개 API, 관리자 로그인 페이지를 확인한다.

compose production rollback:

1. `.env.production`의 `AIOSK_BACKEND_IMAGE`, `AIOSK_FRONTEND_IMAGE`를 이전 검증 tag로 되돌린다.
2. `npm run deploy:compose`를 실행한다.
3. `docker compose --env-file .env.production -f docker-compose.prod.yml ps`와 `SMOKE_BASE_URL=<service-url> npm run ops:smoke` 결과를 확인한다.

remote compose rollback:

1. `.github/workflows/deploy-compose.yml`을 수동 실행하면서 이전 검증 tag를 `image_tag`로 입력한다.
2. workflow summary와 원격 `docker compose ps` 상태를 확인한다.
3. `SMOKE_BASE_URL=<service-url> npm run ops:smoke` 결과를 확인한다.

DB rollback:

- schema 변경 rollback은 `CONFIRM_MIGRATION_ROLLBACK=<DB_NAME> npm run db:rollback`으로 마지막 migration의 `*.down.sql`을 적용한다.
- 데이터 손실 가능성이 있는 rollback 전에는 `npm run db:backup` 또는 운영 백업 시스템으로 만든 MySQL 백업을 확보한다.
- migration runner로 되돌릴 수 없는 데이터 손상은 백업 파일을 `npm run db:restore`로 복구한다.
- 운영 DB에 복구하기 전 같은 백업 파일로 `npm run db:restore:drill -- <backup.sql.gz>`를 실행해 scratch DB 복구 가능성을 먼저 확인한다.
- 복구 전후로 `Admins`, `Categories`, `Menus`, `Orders`, `OrderItems`, `KioskStatuses`, `Sessions` 테이블 존재 여부와 주문 조회를 확인한다.

## 남은 운영 갭

- GHCR image publish, SSH 기반 remote compose deploy workflow, `production` GitHub Environment 승인 gate, backend app secret의 `*_FILE` 주입 경로는 있지만 실제 secret manager provider/credential, blue/green 또는 canary 전환은 아직 환경별 작업이다. `npm run ops:preflight`는 원격 host의 env 파일 권한과 compose 구성을 검증하는 gate로 제공되고, `npm run ops:smoke`와 `npm run ops:heartbeat-soak`는 배포 후 HTTP/DB 경로 확인용으로 제공된다.
- DB 백업/복구, restore drill, retention, systemd timer 예시, 외부 보관 디렉터리 복사 옵션, provider CLI 기반 upload command hook은 있지만 provider CLI 설치와 credential 관리는 환경별 작업이다. Preflight는 offsite backup target 또는 upload hook이 없으면 실패한다.
- Prometheus/Grafana/Alertmanager 로컬 설정과 noop receiver 차단 preflight는 있지만 Slack, email, PagerDuty 같은 실제 외부 알림 receiver와 credential은 환경별 작업이다.
- React 키오스크와 EJS 관리자 핵심 브라우저 E2E는 `npm run test:e2e:browser`로 제공된다. 배포 후 HTTP/API smoke는 `npm run ops:smoke`, heartbeat 지속 갱신 검증은 `npm run ops:heartbeat-soak`로 제공된다. 실제 object storage credential, 외부 알림 채널, 운영 URL에서의 smoke/soak 실행 기록은 환경별 작업이다.
