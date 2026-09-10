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
| `type` | `class` (수업), `habit` (생활습관), `report` (주간 동향). 기존 일정은 `class` |
| `name` | 스케줄 이름 |
| `timezone` | `Asia/Seoul` 또는 `UTC` |
| `cron` | 저장되는 최종 cron 표현식 |
| `message` | 발송할 Slack 메시지 |
| `target` | `production` 또는 `test` |
| `enabled` | on/off 상태 |

입력 방식:

- `Weekly`: 요일을 여러 개 체크하고 시간을 `HH:mm`으로 직접 입력합니다. 예: 월·수·금 09:35 → `35 9 * * 1,3,5`. 모든 요일을 선택하면 매일 발송합니다.
- `Cron`: 매일 등 자유로운 반복 주기를 위한 cron
- 두 방식은 동시에 입력할 수 없고, 하나만 유효합니다.

## 8) 즉시 발송과 신규 유형

`/yoga send`로 수업·생활습관·주간 동향을 선택하고 운영 또는 테스트 채널에 즉시 발송합니다. 두 환경은 같은 기능을 제공하며 기록과 순위는 환경별로 분리됩니다. `/yoga test`는 테스트 채널을 기본 선택하는 호환 명령입니다.

새 환경변수나 Slack slash command 등록은 필요하지 않습니다. 기존 `/yoga` 명령의 하위 명령으로 동작합니다. 두 채널에 봇이 참여해 있어야 합니다.

기존 스케줄과 출석 탭은 유지됩니다. 생활습관 기록용 `HabitParticipation` 탭은 첫 생활습관 또는 주간 동향 발송 때 자동 생성됩니다. 기존 서비스 계정의 스프레드시트 편집 권한을 사용합니다. 새 유형의 스케줄은 배포 후 관리자 화면에서 등록하세요. 주간 동향 기본 입력값은 월요일 09:00입니다.

집계 규칙 및 데이터 구조는 [README](../README.md#생활습관-기록과-순위)를 참고하세요.

## 9) seed 로 다시 초기화

현재 volume 을 버리고 `config/schedules.seed.json` 기준으로 다시 시작하려면:

```bash
docker compose down -v
docker compose up -d --build
```
