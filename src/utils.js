const fs = require("fs");
const path = require("path");

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallbackValue;
    throw error;
  }
}

function getDateString(timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTimestampString(timezone, date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getWeekdayName(timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(date)
    .toLowerCase();
}

function validateTimeZone(timezone) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
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
    scheduleId: ["scheduleid", "schedule_id", "schedule id", "스케줄id", "일정id"],
    jobName: ["jobname", "job_name", "job name", "수업명", "클래스명", "일정명"],
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

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

module.exports = {
  capitalize,
  columnNumberToLetter,
  ensureDirectoryForFile,
  getDateString,
  getTimestampString,
  getWeekdayName,
  normalizeHeader,
  readJsonFile,
  resolveHeaderMap,
  validateTimeZone,
};
