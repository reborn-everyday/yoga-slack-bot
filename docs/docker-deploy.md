# Docker 운영 가이드

이 프로젝트는 Slack Socket Mode 기반이라 외부 HTTP 포트 오픈 없이 컨테이너로 상시 실행할 수 있습니다.

## 1) 사전 준비

- Docker Engine + Docker Compose Plugin 설치
- 프로젝트 루트에 `.env` 준비 (`.env.example` 참고)

필수 환경변수:
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_CHANNEL_ID`
- `GOOGLE_SHEETS_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY` 또는 `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`

## 2) Google 서비스 계정 키 설정 방법

현재 설정은 키 파일을 이미지에 `COPY`하는 방식입니다.

- 로컬 파일: `./wellness-architect-485214-800886c92a64.json`
- 컨테이너 경로: `/app/secrets/google-service-account.json`
- `.env` 값: `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/app/secrets/google-service-account.json`

주의:
- 키 파일을 교체/수정하면 반드시 `docker compose up -d --build`로 이미지 재빌드가 필요합니다.

## 3) 실행

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f yoga-slack-bot
```

## 4) 업데이트 배포

```bash
git pull
docker compose up -d --build
docker compose logs -f yoga-slack-bot
```

## 5) 운영 점검

- 상태: `docker compose ps`
- 로그: `docker compose logs --tail=200 yoga-slack-bot`
- 재시작: `docker compose restart yoga-slack-bot`

## 6) 중지

```bash
docker compose down
```
