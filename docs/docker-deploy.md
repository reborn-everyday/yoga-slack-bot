# Docker 운영 가이드

이 프로젝트는 Slack Socket Mode 기반으로 동작하고, 같은 컨테이너 안에서 작은 관리자 웹 페이지도 함께 제공합니다.

## 1) 사전 준비

- Docker Engine + Docker Compose Plugin 설치
- 프로젝트 루트에 `.env` 준비 (`.env.example` 참고)

필수 환경변수:
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_TEST_CHANNEL_ID`
- `ADMIN_PASSWORD`
- `SCHEDULE_ADMIN_USER_IDS`
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

관리자 페이지는 기본적으로 호스트의 `127.0.0.1:${ADMIN_UI_PORT:-8400}` 으로만 바인딩됩니다.
필요하면 SSH 터널이나 별도 reverse proxy 뒤에서 접근하세요.

## 4) 업데이트 배포

```bash
git pull
docker compose up -d --build
docker compose logs -f yoga-slack-bot
```

주의:
- 스케줄 변경은 Docker volume 안의 런타임 데이터에 저장됩니다.
- `config/schedules.seed.json` 은 빈 volume 을 처음 만들 때만 사용됩니다.
- 이미 실행 중인 환경에 다시 배포해도 기존 volume 이 있으면 관리자 UI에서 바꾼 스케줄이 유지됩니다.

## 5) 운영 점검

- 상태: `docker compose ps`
- 로그: `docker compose logs --tail=200 yoga-slack-bot`
- 재시작: `docker compose restart yoga-slack-bot`
- 관리자 페이지: `http://127.0.0.1:${ADMIN_UI_PORT:-8400}/admin`

## 6) 중지

```bash
docker compose down
```

## 7) 스케줄 설정

스케줄과 메시지는 이제 내장 관리자 UI에서 관리합니다. 등록/토글은 **재시작 없이** 즉시 반영됩니다.

- 웹 UI: `/admin`
- Slack UI: `/yoga schedule` 또는 App Home
- seed 파일: 로컬 `./config/schedules.seed.json`
- 런타임 파일: 컨테이너 `/app/data/schedules.json`
- `config/schedules.seed.json` 을 수정하면 새 volume 을 만들 때의 초기값을 바꿀 수 있습니다.
- 관리자 UI/Slack UI 에서 저장한 변경은 runtime store 만 바꾸며 seed 파일은 자동 반영되지 않습니다.
- `/app/data/active-announcements.json` 은 이미 발송된 공지 메시지 추적용 런타임 파일입니다.

| 필드 | 설명 |
|------|------|
| `name` | 스케줄 이름 |
| `timezone` | `Asia/Seoul` 또는 `UTC` |
| `cron` | 저장되는 최종 cron 표현식 |
| `message` | 발송할 Slack 메시지 |
| `target` | `production` 또는 `test` |
| `enabled` | on/off 상태 |

입력 방식:

- `Weekly`: 요일 + 시간 입력 후 내부적으로 cron 으로 변환
- `Cron`: 테스트용 자유 입력 cron
- 두 방식은 동시에 입력할 수 없고, 하나만 유효합니다.

## 8) 테스트 메시지 발송

슬랙 커맨드 `/yoga test` 로 저장된 스케줄 하나를 골라 테스트 채널에 즉시 메시지를 보낼 수 있습니다.

| 커맨드 | 동작 |
|--------|------|
| `/yoga test` | 저장된 스케줄 선택 후 테스트 채널에 발송 |
| `/yoga schedule` | 스케줄 목록, 등록, on/off 토글 |

`SLACK_TEST_CHANNEL_ID` 가 설정되어 있어야 동작합니다.

## 9) seed 로 다시 초기화

현재 volume 을 버리고 `config/schedules.seed.json` 기준으로 다시 시작하려면:

```bash
docker compose down -v
docker compose up -d --build
```
