# yoga-slack-bot

## Run

```bash
npm install
npm run dev
```

## Slack Commands

| 커맨드 | 설명 |
|--------|------|
| `/yoga open <시간> <클래스>` | 채널에 즉시 클래스 오픈 메시지 발송 |
| `/yoga test [day]` | 테스트 채널에 수동 메시지 발송 (day 생략 시 오늘 요일) |

예시:
- `/yoga test` → 오늘 요일 메시지를 테스트 채널로 발송
- `/yoga test monday` → 월요일 메시지 발송
- `/yoga test tuesday`, `/yoga test thursday` 도 동일

## Production (Google Cloud VM)

- Docker guide: [docs/docker-deploy.md](/Users/yjhong/reborn-everyday/yoga-slack-bot/docs/docker-deploy.md)
- Compose file: [docker-compose.yml](/Users/yjhong/reborn-everyday/yoga-slack-bot/docker-compose.yml)
