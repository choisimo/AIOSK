# AIOSK 포트 설정 가이드

> 업데이트: 2026-05-30
> 기준: `src/server.js`, `.env.example`

## 기본값

서버 기본 포트는 `3000`이다.

```bash
npm run dev
```

접속 URL:

- API 서버: `http://localhost:3000`
- 관리자 화면: `http://localhost:3000/admin`
- Swagger UI: `http://localhost:3000/api-docs`

## 포트 변경

`PORT` 환경 변수로 실행 포트를 바꾼다.

```bash
PORT=4001 npm run dev
```

변경 후 접속 URL:

- API 서버: `http://localhost:4001`
- 관리자 화면: `http://localhost:4001/admin`
- Swagger UI: `http://localhost:4001/api-docs`

## 포트 충돌 확인

```bash
lsof -i :3000
lsof -i :4001
```

이미 사용 중인 포트가 있으면 다른 `PORT` 값을 사용하거나 해당 프로세스를 정상 종료한다.

## 관련 설정

- `.env.example`은 `PORT=3000`을 예시로 제공한다.
- 관리자 계정은 포트 설정과 별개이며 `npm run admin:create`로 생성/갱신한다.
