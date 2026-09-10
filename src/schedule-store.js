const crypto = require("crypto");
const fs = require("fs");
const cron = require("node-cron");

const {
  capitalize,
  ensureDirectoryForFile,
  validateTimeZone,
} = require("./utils");

const VALID_TARGETS = new Set(["production", "test"]);
const SCHEDULE_TYPES = { class: "수업", habit: "생활습관", report: "주간 동향" };
const CREATE_TIMEZONE_OPTIONS = ["Asia/Seoul", "UTC"];
const ALLOWED_CREATE_TIMEZONES = new Set(CREATE_TIMEZONE_OPTIONS);
const WEEKDAY_OPTIONS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const VALID_WEEKDAYS = new Set(WEEKDAY_OPTIONS);
const WEEKDAY_TO_CRON = {
  sunday: "0",
  monday: "1",
  tuesday: "2",
  wednesday: "3",
  thursday: "4",
  friday: "5",
  saturday: "6",
};
const CRON_TO_WEEKDAY = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

function normalizeTargetValue(value) {
  const rawTarget = String(value || "").trim().toLowerCase();
  if (rawTarget === "real") return "production";
  return rawTarget;
}

function createValidationError(fieldErrors) {
  const error = new Error("Invalid schedule input.");
  error.code = "VALIDATION_ERROR";
  error.fieldErrors = fieldErrors;
  return error;
}

function padTimeUnit(value) {
  return String(value).padStart(2, "0");
}

function isValidTimeValue(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

function normalizeWeekdays(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((day) => String(day).trim().toLowerCase()))]
    .sort((a, b) => WEEKDAY_OPTIONS.indexOf(a) - WEEKDAY_OPTIONS.indexOf(b));
}

function buildWeeklyCron(weekdays, time) {
  const [hour, minute] = String(time).split(":").map(Number);
  const days = normalizeWeekdays(weekdays).map((day) => WEEKDAY_TO_CRON[day]).join(",");
  return `${minute} ${hour} * * ${days}`;
}

function parseWeeklyCron(cronExpression) {
  const parts = String(cronExpression || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteRaw, hourRaw, dayOfMonth, month, dayOfWeekRaw] = parts;
  if (dayOfMonth !== "*" || month !== "*") return null;
  if (!/^\d+$/.test(minuteRaw) || !/^\d+$/.test(hourRaw) || !/^(?:[0-7](?:,[0-7])*|\*)$/.test(dayOfWeekRaw)) {
    return null;
  }

  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  const weekdays = dayOfWeekRaw === "*" ? [...WEEKDAY_OPTIONS]
    : normalizeWeekdays(dayOfWeekRaw.split(",").map((day) => CRON_TO_WEEKDAY[day]));
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    return null;
  }

  return {
    weekdays,
    weekday: weekdays.length === 1 ? weekdays[0] : "",
    time: `${padTimeUnit(hour)}:${padTimeUnit(minute)}`,
  };
}

function normalizePersistedScheduleRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("Schedule store contains an invalid record.");
  }

  const name = String(record.name || "").trim();
  const timezone = String(record.timezone || "").trim();
  const cronExpression = String(record.cron || "").trim();
  const message = String(record.message || "").trim();
  const target = normalizeTargetValue(record.target);
  const type = record.type || "class";
  if (!Object.hasOwn(SCHEDULE_TYPES, type)) throw new Error("Invalid schedule type.");

  if (!name) throw new Error("Schedule store contains a record without name.");
  if (!timezone || !validateTimeZone(timezone)) {
    throw new Error(`Schedule ${record.id || "<unknown>"} has an invalid timezone.`);
  }
  if (!cronExpression || !cron.validate(cronExpression)) {
    throw new Error(`Schedule ${record.id || "<unknown>"} has an invalid cron expression.`);
  }
  if (!message && type !== "report") throw new Error(`Schedule ${record.id || "<unknown>"} is missing a message.`);
  if (!VALID_TARGETS.has(target)) {
    throw new Error(`Schedule ${record.id || "<unknown>"} has an invalid target.`);
  }
  if (!record.id || typeof record.id !== "string") {
    throw new Error("Schedule store contains a record without id.");
  }
  if (typeof record.enabled !== "boolean") {
    throw new Error(`Schedule ${record.id} has invalid enabled state.`);
  }
  if (!record.createdAt || !record.updatedAt) {
    throw new Error(`Schedule ${record.id} is missing timestamps.`);
  }

  return {
    id: record.id,
    type,
    name,
    timezone,
    cron: cronExpression,
    message,
    target,
    enabled: record.enabled,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseScheduleFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw new Error(`${label} must contain valid JSON.`);
    }
    throw error;
  }
}

function loadScheduleRecords(filePath, label) {
  const parsed = parseScheduleFile(filePath, label);
  if (parsed === null) return null;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON array.`);
  }

  try {
    let hadLegacyTarget = false;
    const records = parsed.map((record) => {
      if (String(record && record.target ? record.target : "").trim().toLowerCase() === "real") {
        hadLegacyTarget = true;
      }
      return normalizePersistedScheduleRecord(record);
    });
    return {
      hadLegacyTarget,
      records,
    };
  } catch (error) {
    throw new Error(`${label} contains invalid schedule data: ${error.message}`);
  }
}

function validateScheduleInput(input) {
  const fieldErrors = {};
  const type = input.type || "class";
  if (!Object.hasOwn(SCHEDULE_TYPES, type)) fieldErrors.type = "일정 유형을 선택해 주세요.";
  const name = String(input.name || "").trim();
  const timezone = String(input.timezone || "").trim();
  const cronExpression = String(input.cron || "").trim();
  // Accept the previous single-day API while new forms submit an array.
  const weekdayField = input.weekdays !== undefined ? "weekdays" : "weekday";
  const weekdays = normalizeWeekdays(input.weekdays ?? input.weekday);
  const time = String(input.time || "").trim();
  const message = String(input.message || "").trim();
  const target = normalizeTargetValue(input.target);
  const inputMode = String(input.mode || "").trim().toLowerCase();
  const hasWeeklyInput = Boolean(weekdays.length || time);
  const hasCronInput = Boolean(cronExpression);

  if (!name) fieldErrors.name = "Job name is required.";
  if (!timezone) {
    fieldErrors.timezone = "Timezone is required.";
  } else if (!ALLOWED_CREATE_TIMEZONES.has(timezone)) {
    fieldErrors.timezone = "Timezone must be Asia/Seoul or UTC.";
  }

  if (inputMode && !new Set(["weekly", "cron"]).has(inputMode)) {
    fieldErrors.mode = "Schedule mode must be weekly or cron.";
  }

  if (hasWeeklyInput && hasCronInput) {
    fieldErrors[weekdayField] = "Provide either weekday/time or cron, not both.";
    fieldErrors.time = "Provide either weekday/time or cron, not both.";
    fieldErrors.cron = "Provide either weekday/time or cron, not both.";
  } else if (!hasWeeklyInput && !hasCronInput) {
    fieldErrors.mode = "Provide either weekday/time or cron.";
  } else if (hasWeeklyInput) {
    if (!weekdays.length) {
      fieldErrors[weekdayField] = "요일을 하나 이상 선택해 주세요.";
    } else if (weekdays.some((day) => !VALID_WEEKDAYS.has(day))) {
      fieldErrors[weekdayField] = "선택한 요일이 올바르지 않습니다.";
    }

    if (!time) {
      fieldErrors.time = "Time is required for weekly schedules.";
    } else if (!isValidTimeValue(time)) {
      fieldErrors.time = "24시간 형식 HH:mm으로 입력해 주세요. 예: 09:35 (00:00~23:59)";
    }
  } else if (hasCronInput && !cron.validate(cronExpression)) {
    fieldErrors.cron = "Cron expression is invalid.";
  }

  if (inputMode === "weekly" && hasCronInput) {
    fieldErrors.cron = "Cron must be empty when weekly mode is selected.";
  }
  if (inputMode === "cron" && hasWeeklyInput) {
    fieldErrors[weekdayField] = "Weekly fields must be empty when cron mode is selected.";
    fieldErrors.time = "Weekly fields must be empty when cron mode is selected.";
  }

  if (input.weekdays !== undefined && !Array.isArray(input.weekdays)) {
    fieldErrors.weekdays = "요일은 목록으로 입력해 주세요.";
  }

  if (!message && type !== "report") fieldErrors.message = "Message is required.";
  if (message.length > 2500) fieldErrors.message = "Message must be at most 2500 characters.";
  if (name.length > 100) fieldErrors.name = "Job name must be at most 100 characters.";
  if (!target) {
    fieldErrors.target = "Target channel is required.";
  } else if (!VALID_TARGETS.has(target)) {
    fieldErrors.target = "Target must be production or test.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw createValidationError(fieldErrors);
  }

  return {
    type,
    name,
    timezone,
    cron: hasCronInput ? cronExpression : buildWeeklyCron(weekdays, time),
    message,
    target,
  };
}

function describeSchedule(schedule, resolveChannelId) {
  const weekly = parseWeeklyCron(schedule.cron);
  const channelId = resolveChannelId ? resolveChannelId(schedule.target) : "";
  const targetLabel = schedule.target === "test" ? "Test Channel" : "Production Channel";

  return {
    ...schedule,
    channelId: channelId || "",
    channelDisplay: targetLabel,
    scheduleMode: weekly ? "weekly" : "cron",
    weekdays: weekly ? weekly.weekdays : [],
    weekday: weekly ? weekly.weekday : "",
    time: weekly ? weekly.time : "",
    weeklyLabel: weekly ? `${weekly.weekdays.map(capitalize).join(", ")} ${weekly.time}` : "",
  };
}

class ScheduleStore {
  constructor({ filePath, seedPath = null, defaultTimezone = "Asia/Seoul", clock = () => new Date() }) {
    this.filePath = filePath;
    this.seedPath = seedPath;
    this.defaultTimezone = defaultTimezone;
    this.clock = clock;
    this.schedules = [];
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this.list();

    ensureDirectoryForFile(this.filePath);
    const existing = loadScheduleRecords(this.filePath, "Schedule store");

    if (existing === null) {
      this.schedules = this.loadSeedSchedules();
      this.save();
    } else {
      this.schedules = existing.records;
      if (existing.hadLegacyTarget) this.save();
    }

    this.initialized = true;
    return this.list();
  }

  loadSeedSchedules() {
    if (!this.seedPath) return [];

    const seedSchedules = loadScheduleRecords(this.seedPath, "Schedule seed file");
    return seedSchedules ? seedSchedules.records : [];
  }

  save() {
    ensureDirectoryForFile(this.filePath);
    fs.writeFileSync(this.filePath, JSON.stringify(this.schedules, null, 2));
  }

  ensureInitialized() {
    if (!this.initialized) this.initialize();
  }

  list() {
    this.ensureInitialized();
    return [...this.schedules].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  get(id) {
    this.ensureInitialized();
    return this.schedules.find((schedule) => schedule.id === id) || null;
  }

  create(input) {
    this.ensureInitialized();
    const validated = validateScheduleInput(input);
    const now = this.clock().toISOString();
    const schedule = {
      id: crypto.randomUUID(),
      ...validated,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.push(schedule);
    this.save();
    return schedule;
  }

  toggle(id) {
    this.ensureInitialized();
    const schedule = this.get(id);
    if (!schedule) {
      const error = new Error("Schedule not found.");
      error.code = "NOT_FOUND";
      throw error;
    }

    schedule.enabled = !schedule.enabled;
    schedule.updatedAt = this.clock().toISOString();
    this.save();
    return schedule;
  }

  delete(id) {
    this.ensureInitialized();
    const index = this.schedules.findIndex((schedule) => schedule.id === id);
    if (index === -1) {
      const error = new Error("Schedule not found.");
      error.code = "NOT_FOUND";
      throw error;
    }

    const [removed] = this.schedules.splice(index, 1);
    this.save();
    return removed;
  }
}

module.exports = {
  SCHEDULE_TYPES,
  CREATE_TIMEZONE_OPTIONS,
  ScheduleStore,
  VALID_WEEKDAYS,
  WEEKDAY_OPTIONS,
  buildWeeklyCron,
  createValidationError,
  describeSchedule,
  normalizeTargetValue,
  normalizeWeekdays,
  normalizePersistedScheduleRecord,
  parseWeeklyCron,
  validateScheduleInput,
};
