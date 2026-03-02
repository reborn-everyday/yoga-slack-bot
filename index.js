require("dotenv").config();
const fs = require("fs");
const { App } = require("@slack/bolt");
const cron = require("node-cron");
const { google } = require("googleapis");

// Socket Mode로 실행 (개발/초기 MVP에 최적)   [oai_citation:7‡docs.slack.dev](https://docs.slack.dev/apis/events-api/using-socket-mode?utm_source=chatgpt.com)
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const SCHEDULE_TZ = process.env.SCHEDULE_TZ || "Asia/Seoul";
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
const SCHEDULE_CONFIG_PATH = process.env.SCHEDULE_CONFIG_PATH || "./yoga-schedule.json";
const SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEETS_RANGE = process.env.GOOGLE_SHEETS_RANGE || "Attendance!A:E";

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed);
    try {
      return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
    } catch (err) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must be JSON or base64-encoded JSON.");
    }
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) {
    return JSON.parse(fs.readFileSync(keyFile, "utf8"));
  }

  throw new Error("Missing Google service account credentials.");
}

function getDateString(tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getTimestampString(tz) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function columnNumberToLetter(num) {
  let n = num;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "A";
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveHeaderMap(headerRow) {
  const map = {};
  const aliases = {
    date: ["date", "날짜", "일자"],
    userId: ["userid", "user_id", "user id", "사용자id", "유저id", "슬랙id", "slack id"],
    userName: ["username", "user_name", "user name", "이름", "닉네임", "유저명", "사용자명"],
    status: ["status", "상태", "참석", "구분"],
    timestamp: ["timestamp", "time", "시간", "등록시간", "기록시간"],
  };

  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (!normalized) return;
    for (const [key, list] of Object.entries(aliases)) {
      if (list.includes(normalized)) {
        map[key] = index;
      }
    }
  });

  return map;
}

async function getSheetsClient() {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function appendAttendance({ date, userId, userName, status }) {
  if (!SHEETS_SPREADSHEET_ID) throw new Error("Missing GOOGLE_SHEETS_ID.");
  const sheets = await getSheetsClient();
  const timestamp = getTimestampString(SCHEDULE_TZ);

  const sheetName = SHEETS_RANGE.split("!")[0] || "Attendance";
  const valuesResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
    range: `${sheetName}!A:ZZ`,
  });
  const values = valuesResp.data.values || [];
  const header = values[0] || [];
  const headerMap = resolveHeaderMap(header);

  const totalColumns = Math.max(header.length || 0, 5);
  const lastColLetter = columnNumberToLetter(totalColumns);

  const makeRow = () => {
    const row = Array(totalColumns).fill("");
    if (headerMap.date !== undefined) row[headerMap.date] = date;
    if (headerMap.userId !== undefined) row[headerMap.userId] = userId;
    if (headerMap.userName !== undefined) row[headerMap.userName] = userName;
    if (headerMap.status !== undefined) row[headerMap.status] = status;
    if (headerMap.timestamp !== undefined) row[headerMap.timestamp] = timestamp;
    if (headerMap.date === undefined) row[0] = date;
    if (headerMap.userId === undefined) row[1] = userId;
    if (headerMap.userName === undefined) row[2] = userName;
    if (headerMap.status === undefined) row[3] = status;
    if (headerMap.timestamp === undefined) row[4] = timestamp;
    return row;
  };

  let existingRowIndex = -1;
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i] || [];
    const rowDate = headerMap.date !== undefined ? row[headerMap.date] : row[0];
    const rowUserId = headerMap.userId !== undefined ? row[headerMap.userId] : row[1];
    if (rowDate === date && rowUserId === userId) {
      existingRowIndex = i;
      break;
    }
  }

  const rowValues = makeRow();

  if (existingRowIndex >= 1) {
    const rowNumber = existingRowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_SPREADSHEET_ID,
      range: `${sheetName}!A${rowNumber}:${lastColLetter}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowValues] },
    });
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
    range: `${sheetName}!A:${lastColLetter}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowValues] },
  });
}

async function deleteAttendance({ date, userId }) {
  if (!SHEETS_SPREADSHEET_ID) throw new Error("Missing GOOGLE_SHEETS_ID.");
  const sheets = await getSheetsClient();

  const sheetName = SHEETS_RANGE.split("!")[0] || "Attendance";
  const valuesResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
    range: `${sheetName}!A:ZZ`,
  });
  const values = valuesResp.data.values || [];
  const header = values[0] || [];
  const headerMap = resolveHeaderMap(header);

  const headerOffset = 1;
  const rowsToDelete = [];
  for (let i = headerOffset; i < values.length; i += 1) {
    const row = values[i] || [];
    const rowDate = headerMap.date !== undefined ? row[headerMap.date] : row[0];
    const rowUserId = headerMap.userId !== undefined ? row[headerMap.userId] : row[1];
    const rowStatus = headerMap.status !== undefined ? row[headerMap.status] : row[3];
    if (rowDate === date && rowUserId === userId && (rowStatus === "attend" || rowStatus === "late")) {
      rowsToDelete.push(i);
    }
  }

  if (rowsToDelete.length === 0) return false;

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
  });
  const sheet = (spreadsheet.data.sheets || []).find(
    (s) => s.properties && s.properties.title === sheetName
  );
  if (!sheet || typeof sheet.properties.sheetId !== "number") {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const requests = rowsToDelete
    .sort((a, b) => b - a)
    .map((rowIndex) => ({
      deleteDimension: {
        range: {
          sheetId: sheet.properties.sheetId,
          dimension: "ROWS",
          startIndex: rowIndex,
          endIndex: rowIndex + 1,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEETS_SPREADSHEET_ID,
    requestBody: { requests },
  });

  return true;
}

function buildInterestBlocks() {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "오늘 요가할 사람!" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "저요!" },
          action_id: "yoga_interest",
          value: "interest",
        },
      ],
    },
  ];
}

function buildAttendBlocks() {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "오늘 참여 형태를 선택해 주세요." },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "참석" },
          action_id: "yoga_attend",
          value: "attend",
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "늦참" },
          action_id: "yoga_late",
          value: "late",
        },
      ],
    },
  ];
}

function buildCancelBlocks() {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "참석 등록이 완료됐어요." },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "취소" },
          action_id: "yoga_cancel",
          value: "cancel",
          style: "danger",
        },
      ],
    },
  ];
}

function buildOpenBlocks(detail) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🧘 *오늘 요가할 사람!*\n>${detail}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "저요!" },
          action_id: "yoga_interest",
          value: "interest",
        },
      ],
    },
  ];
}

function loadScheduleConfig() {
  const raw = fs.readFileSync(SCHEDULE_CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function getScheduleMessageForToday(config, tz) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  })
    .format(new Date())
    .toLowerCase();
  return (config.messages || {})[weekday];
}

app.command("/yoga", async ({ command, ack, respond }) => {
  await ack();

  // 사용 예: /yoga open 19:30 vinyasa
  const text = (command.text || "").trim();

  if (text.startsWith("open")) {
    const detail = text.replace("open", "").trim();
    await respond({
      text: `🧘 *[요가무리 클래스 오픈]*\n>${detail}`,
      blocks: buildOpenBlocks(detail),
      response_type: "in_channel",
    });
    return;
  }

  await respond({
    text: "사용법: `/yoga open <시간> <클래스>` (버튼으로 참여)",
    response_type: "ephemeral",
  });
});

app.action("yoga_interest", async ({ ack, body, client }) => {
  await ack();
  const channelId = body.channel && body.channel.id;
  const userId = body.user && body.user.id;
  if (!channelId || !userId) return;

  await client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    blocks: buildAttendBlocks(),
    text: "오늘 참여 형태를 선택해 주세요.",
  });
});

async function handleAttendanceAction({ ack, body, client, status }) {
  await ack();
  const channelId = body.channel && body.channel.id;
  const user = body.user || {};
  if (!channelId || !user.id) return;

  const date = getDateString(SCHEDULE_TZ);
  try {
    await appendAttendance({
      date,
      userId: user.id,
      userName: user.username || user.name || user.id,
      status,
    });
    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      blocks: buildCancelBlocks(),
      text: "참석 등록이 완료됐어요.",
    });
  } catch (err) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      text: `참석 등록에 실패했어요: ${err.message}`,
    });
  }
}

app.action("yoga_attend", async ({ ack, body, client }) => {
  await handleAttendanceAction({ ack, body, client, status: "attend" });
});

app.action("yoga_late", async ({ ack, body, client }) => {
  await handleAttendanceAction({ ack, body, client, status: "late" });
});

app.action("yoga_cancel", async ({ ack, body, client }) => {
  await ack();
  const channelId = body.channel && body.channel.id;
  const user = body.user || {};
  if (!channelId || !user.id) return;

  const date = getDateString(SCHEDULE_TZ);
  try {
    const removed = await deleteAttendance({ date, userId: user.id });
    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      text: removed ? "취소가 완료됐어요." : "이미 취소되었거나 신청 내역이 없어요.",
    });
  } catch (err) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      text: `취소에 실패했어요: ${err.message}`,
    });
  }
});

(async () => {
  await app.start();
  console.log("⚡️ Yogamuri bot is running (Socket Mode)");

  if (!SLACK_CHANNEL_ID) {
    console.warn("⚠️ SLACK_CHANNEL_ID is missing. Scheduled messages will not be sent.");
    return;
  }

  const scheduleConfig = loadScheduleConfig();
  const scheduleExpression = scheduleConfig.schedule || "0 9 * * 1,2,4";

  cron.schedule(
    scheduleExpression,
    async () => {
      try {
        const config = loadScheduleConfig();
        const tz = config.timezone || SCHEDULE_TZ;
        const channel = config.channelId || SLACK_CHANNEL_ID;
        const detail = getScheduleMessageForToday(config, tz);
        if (!detail) {
          console.warn("⚠️ No scheduled message for today.");
          return;
        }
        await app.client.chat.postMessage({
          channel,
          text: `🧘 *[요가무리 클래스 오픈]*\n>${detail}`,
          blocks: buildOpenBlocks(detail),
        });
      } catch (err) {
        console.error("Failed to post scheduled yoga message:", err);
      }
    },
    { timezone: SCHEDULE_TZ }
  );
})();
