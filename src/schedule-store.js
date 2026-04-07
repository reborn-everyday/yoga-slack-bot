const crypto = require("crypto");
const fs = require("fs");
const cron = require("node-cron");

const {
  capitalize,
  ensureDirectoryForFile,
  validateTimeZone,
} = require("./utils");

const VALID_TARGETS = new Set(["production", "test"]);
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

function buildWeeklyCron(weekday, time) {
  const [hour, minute] = String(time).split(":").map(Number);
  return `${minute} ${hour} * * ${WEEKDAY_TO_CRON[weekday]}`;
}

function parseWeeklyCron(cronExpression) {
  const parts = String(cronExpression || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteRaw, hourRaw, dayOfMonth, month, dayOfWeekRaw] = parts;
  if (dayOfMonth !== "*" || month !== "*") return null;
  if (!/^\d+$/.test(minuteRaw) || !/^\d+$/.test(hourRaw) || !/^\d+$/.test(dayOfWeekRaw)) {
    return null;
  }

  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  const weekday = CRON_TO_WEEKDAY[dayOfWeekRaw];
  if (!weekday || minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    return null;
  }

  return {
    weekday,
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

  if (!name) throw new Error("Schedule store contains a record without name.");
  if (!timezone || !validateTimeZone(timezone)) {
    throw new Error(`Schedule ${record.id || "<unknown>"} has an invalid timezone.`);
  }
  if (!cronExpression || !cron.validate(cronExpression)) {
    throw new Error(`Schedule ${record.id || "<unknown>"} has an invalid cron expression.`);
  }
  if (!message) throw new Error(`Schedule ${record.id || "<unknown>"} is missing a message.`);
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
  const name = String(input.name || "").trim();
  const timezone = String(input.timezone || "").trim();
  const cronExpression = String(input.cron || "").trim();
  const weekday = String(input.weekday || "").trim().toLowerCase();
  const time = String(input.time || "").trim();
  const message = String(input.message || "").trim();
  const target = normalizeTargetValue(input.target);
  const inputMode = String(input.mode || "").trim().toLowerCase();
  const hasWeeklyInput = Boolean(weekday || time);
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
    fieldErrors.weekday = "Provide either weekday/time or cron, not both.";
    fieldErrors.time = "Provide either weekday/time or cron, not both.";
    fieldErrors.cron = "Provide either weekday/time or cron, not both.";
  } else if (!hasWeeklyInput && !hasCronInput) {
    fieldErrors.mode = "Provide either weekday/time or cron.";
  } else if (hasWeeklyInput) {
    if (!weekday) {
      fieldErrors.weekday = "Day of the week is required for weekly schedules.";
    } else if (!VALID_WEEKDAYS.has(weekday)) {
      fieldErrors.weekday = "Day of the week is invalid.";
    }

    if (!time) {
      fieldErrors.time = "Time is required for weekly schedules.";
    } else if (!isValidTimeValue(time)) {
      fieldErrors.time = "Time must be in HH:mm format.";
    }
  } else if (hasCronInput && !cron.validate(cronExpression)) {
    fieldErrors.cron = "Cron expression is invalid.";
  }

  if (inputMode === "weekly" && hasCronInput) {
    fieldErrors.cron = "Cron must be empty when weekly mode is selected.";
  }
  if (inputMode === "cron" && hasWeeklyInput) {
    fieldErrors.weekday = "Weekly fields must be empty when cron mode is selected.";
    fieldErrors.time = "Weekly fields must be empty when cron mode is selected.";
  }

  if (!message) fieldErrors.message = "Message is required.";
  if (!target) {
    fieldErrors.target = "Target channel is required.";
  } else if (!VALID_TARGETS.has(target)) {
    fieldErrors.target = "Target must be production or test.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw createValidationError(fieldErrors);
  }

  return {
    name,
    timezone,
    cron: hasCronInput ? cronExpression : buildWeeklyCron(weekday, time),
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
    weekday: weekly ? weekly.weekday : "",
    time: weekly ? weekly.time : "",
    weeklyLabel: weekly ? `${capitalize(weekly.weekday)} ${weekly.time}` : "",
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
  CREATE_TIMEZONE_OPTIONS,
  ScheduleStore,
  VALID_WEEKDAYS,
  WEEKDAY_OPTIONS,
  buildWeeklyCron,
  createValidationError,
  describeSchedule,
  normalizeTargetValue,
  normalizePersistedScheduleRecord,
  parseWeeklyCron,
  validateScheduleInput,
};
