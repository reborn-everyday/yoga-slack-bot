# yoga-slack-bot

## Run

```bash
npm install
npm run dev
```

Admin page:

- Set `ADMIN_PASSWORD` and open `http://localhost:8400/admin`
- Register schedules from the built-in page or from Slack UI

## Slack Commands

| 커맨드 | 설명 |
|--------|------|
| `/yoga open <시간> <클래스>` | 채널에 즉시 클래스 오픈 메시지 발송 |
| `/yoga test` | 저장된 스케줄 중 하나를 골라 테스트 채널에 발송 |
| `/yoga schedule` | 스케줄 관리 모달 오픈 (관리자만) |

App Home에서도 저장된 스케줄 목록과 on/off 토글을 볼 수 있습니다.

## Scheduling

- `yoga-schedule.json`은 더 이상 사용하지 않습니다.
- 기본 스케줄 시드는 `config/schedules.seed.json`에 저장되며 git으로 함께 관리합니다.
- Docker Compose는 `/app/data` Docker volume 안에 실제 런타임 스케줄과 공지 상태를 저장합니다.
- 첫 실행 때 `/app/data/schedules.json`이 없으면 `config/schedules.seed.json`으로 초기화합니다.
- 이후 `/admin` 또는 Slack UI에서 바꾼 내용은 런타임 스토어만 변경하며 seed 파일은 자동으로 바뀌지 않습니다.
- `active-announcements.json`은 이미 발송된 Slack 공지를 다시 찾기 위한 런타임 상태 파일입니다.
- 스케줄 등록은 `Weekly` 또는 `Cron` 중 하나만 사용할 수 있습니다.
- `Weekly` 모드는 `Asia/Seoul` 또는 `UTC` timezone, 요일, 시간을 사용합니다.
- `Cron` 모드는 테스트용 자유 입력 cron 을 허용합니다.
- 각 스케줄은 `job name`, `timezone`, `cron`, `message`, `production/test target`, `enabled` 상태를 가집니다. 저장값은 `production` 또는 `test` 입니다.
- 목록은 켜진 스케줄이 먼저 나오고, 각 행에서 토글과 삭제를 할 수 있습니다.

## Tests

```bash
npm test
```

## Production (Google Cloud VM)

- Docker guide: [docs/docker-deploy.md](docs/docker-deploy.md)
- Compose file: [docker-compose.yml](docker-compose.yml)
