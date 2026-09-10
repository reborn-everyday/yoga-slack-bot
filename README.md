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
| `/yoga send` | 수업·생활습관·주간 동향 중 저장된 일정을 골라 운영/테스트 채널에 즉시 발송 |
| `/yoga test` | `/yoga send`와 동일하며 테스트 채널이 기본 선택됨 |
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
- `Weekly` 모드는 `Asia/Seoul` 또는 `UTC` timezone, 복수 요일 체크박스, 직접 입력하는 시간(`HH:mm`)을 사용합니다. 예: 월·수·금 09:35. 모든 요일을 체크하면 매일 발송합니다.
- `Cron` 모드는 자유로운 반복 주기를 지원합니다. 예: 매일 12시 `0 12 * * *`.
- 각 스케줄은 `type` (`class`, `habit`, `report`), `job name`, `timezone`, `cron`, `message`, `production/test target`, `enabled` 상태를 가집니다. 저장값은 `production` 또는 `test` 입니다.
- 목록은 켜진 스케줄이 먼저 나오고, 각 행에서 토글과 삭제를 할 수 있습니다.

## 일정 유형과 즉시 발송

세 유형은 같은 스케줄 저장소, cron 등록, 발송 함수를 사용합니다. Slack `/yoga schedule`, App Home, 웹 `/admin`에서 유형을 선택할 수 있습니다. 기존 일정은 `class`로 처리됩니다.

| 유형 | 동작 |
|------|------|
| 수업 (`class`) | 기존 참석·늦참·취소와 참석자 목록 |
| 생활습관 (`habit`) | `실천했어요` 버튼으로 즉시 등록, 다시 누르면 취소, 참여자 목록 표시 |
| 주간 동향 (`report`) | 지난주/이번 달 생활습관 순위를 발송 시점에 계산, 참여 버튼 없음 |

`/yoga send`에서 세 유형 모두 선택하고 발송 채널을 지정할 수 있습니다. 비활성 일정도 즉시 발송할 수 있으며, 예약이나 활성 상태를 바꾸지 않습니다. 명령어를 테스트 채널에서 실행하면 테스트 채널이 기본 선택됩니다. 그 외에는 운영 채널이 기본입니다. `/yoga open <내용>`은 기존처럼 실행한 채널에 수업 공지를 보냅니다.

주간 동향은 월요일 09:00(기본 입력값)에 예약하는 것을 권장합니다. 다른 시각, cron, 즉시 발송도 동일하게 지원합니다. 안내 메시지는 선택 입력이며 두 순위표는 자동으로 붙습니다. 새 일정은 관리 화면에서 등록하며 배포만으로 새 공지를 자동 등록하지 않습니다.

## 생활습관 기록과 순위

- 기존 수업 기록: `GOOGLE_SHEETS_ID`의 `Attendance` 탭(또는 `GOOGLE_SHEETS_RANGE`의 탭).
- 생활습관 기록: 같은 스프레드시트의 `HabitParticipation` 탭. 첫 생활습관/주간 동향 발송 시 없으면 자동 생성합니다.
- 생활습관 열: `date`, `scheduleId`, `jobName`, `userId`, `userName`, `status`, `timestamp`, `target`, `occurrenceId`, `createdAt`.
- 운영과 테스트는 기능이 같고 `target`으로 데이터를 분리합니다. 기존 출석은 생활습관 순위에 포함하지 않습니다.
- 같은 환경·생활습관 일정·대상 날짜·사용자 조합은 하루 1회만 집계합니다. 서로 다른 생활습관은 각각 1회입니다.
- 재클릭하면 `cancelled` 상태로 보존하고, 다시 참여하면 같은 행을 `done`으로 갱신합니다. 일정 삭제 후에도 기록은 남습니다. 시간 열은 UTC ISO 형식입니다.
- 같은 날 같은 일정을 재발송하면 회차별 Slack 메시지를 보존하며, 참여 변경 시 해당 환경의 당일 공지 목록을 함께 갱신합니다.
- 지난주: 보고서 timezone 기준 지난 월요일부터 일요일까지. 이번 달: 이번 달 1일부터 발송 시점까지. 참여 날짜는 생활습관 일정의 timezone 기준 공지 날짜입니다. 일관된 집계를 위해 생활습관과 보고서는 같은 timezone을 사용하세요.
- 사용자별 횟수를 내림차순으로 집계하고 각 표에 최대 10명을 표시합니다. 동점자는 공동 순위(1, 1, 3)이며, 10명 경계의 동점은 사용자 ID 순서로 결정합니다.
- 지난 공지에서도 참여·취소할 수 있습니다. 다음 보고서는 그 시점의 유효 기록을 반영하며, 이미 발송한 보고서는 당시 집계 결과를 유지합니다.
- `data/schedules.json`과 `data/active-announcements.json`은 예약 및 메시지 위치 저장용입니다. 장기 참여 기록의 원본은 Google Sheets입니다.

## Tests

```bash
npm test
```

## Production (Google Cloud VM)

- Docker guide: [docs/docker-deploy.md](docs/docker-deploy.md)
- Compose file: [docker-compose.yml](docker-compose.yml)
