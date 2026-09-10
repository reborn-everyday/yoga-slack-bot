const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  ScheduleStore,
  describeSchedule,
  validateScheduleInput,
  parseWeeklyCron,
  WEEKDAY_OPTIONS,
} = require("../src/schedule-store");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yoga-store-"));
}

function createSeedSchedule(overrides = {}) {
  return {
    id: "seed-1",
    name: "Seed Yoga",
    timezone: "Asia/Seoul",
    cron: "0 9 * * 1",
    message: "Seed flow",
    target: "test",
    enabled: true,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
    ...overrides,
  };
}

test("ScheduleStore persists weekly and cron schedules, sorts enabled first, and deletes", () => {
  const dir = createTempDir();
  const storePath = path.join(dir, "data", "schedules.json");

  const store = new ScheduleStore({
    filePath: storePath,
    defaultTimezone: "Asia/Seoul",
    clock: () => new Date("2026-04-07T00:00:00.000Z"),
  });

  const initial = store.initialize();
  assert.equal(initial.length, 0);

  const weekly = store.create({
    mode: "weekly",
    name: "Friday Yoga",
    timezone: "Asia/Seoul",
    weekday: "friday",
    time: "09:00",
    cron: "",
    message: "Friday flow",
    target: "test",
  });
  assert.equal(weekly.cron, "0 9 * * 5");

  const rawCron = store.create({
    mode: "cron",
    name: "Cron Test",
    timezone: "UTC",
    weekday: "",
    time: "",
    cron: "15 4 * * 2",
    message: "Tuesday cron flow",
    target: "production",
  });

  assert.equal(store.list().length, 2);
  assert.equal(weekly.enabled, true);

  const toggled = store.toggle(weekly.id);
  assert.equal(toggled.enabled, false);

  const listed = store.list();
  assert.equal(listed[0].id, rawCron.id);
  assert.equal(listed[1].id, weekly.id);

  const deleted = store.delete(rawCron.id);
  assert.equal(deleted.id, rawCron.id);
  assert.equal(store.list().length, 1);

  const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, weekly.id);
  assert.equal(persisted[0].enabled, false);

  const described = describeSchedule(weekly, (target) => (target === "test" ? "C_TEST" : "C_PRODUCTION"));
  assert.equal(described.scheduleMode, "weekly");
  assert.equal(described.weekday, "friday");
  assert.equal(described.time, "09:00");
  assert.equal(described.channelDisplay, "Test Channel");
});

test("validateScheduleInput rejects invalid combinations", () => {
  assert.throws(
    () =>
      validateScheduleInput({
        name: "",
        mode: "cron",
        timezone: "Nope/Invalid",
        weekday: "monday",
        time: "09:00",
        cron: "not cron",
        message: "",
        target: "wrong",
      }),
    (error) => {
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.match(error.fieldErrors.timezone, /Asia\/Seoul or UTC/);
      assert.match(error.fieldErrors.cron, /both|invalid|empty/);
      assert.match(error.fieldErrors.weekday, /both|empty/);
      return true;
    }
  );

  assert.throws(
    () =>
      validateScheduleInput({
        name: "Yoga",
        mode: "weekly",
        timezone: "UTC",
        weekday: "",
        time: "",
        cron: "",
        message: "Flow",
        target: "production",
      }),
    (error) => {
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.match(error.fieldErrors.mode, /either weekday\/time or cron/);
      return true;
    }
  );
});

test("multiple weekly days persist as a single cron with minute precision", () => {
  const dir = createTempDir();
  try {
    const filePath = path.join(dir, "schedules.json");
    const store = new ScheduleStore({ filePath });
    for (const type of ["class", "habit", "report"]) {
      const row = store.create({ type, name: type, message: "안내", timezone: "Asia/Seoul", target: "test",
        mode: "weekly", weekdays: ["friday", "monday", "wednesday", "monday"], time: "18:07" });
      assert.equal(row.cron, "7 18 * * 1,3,5");
    }
    const rows = new ScheduleStore({ filePath }).list().map((row) => describeSchedule(row));
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.scheduleMode, "weekly");
      assert.deepEqual(row.weekdays, ["monday", "wednesday", "friday"]);
      assert.equal(row.weeklyLabel, "Monday, Wednesday, Friday 18:07");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("daily and Sunday cron parsing, minute boundaries and weekly validation", () => {
  const input = { name: "Yoga", message: "안내", timezone: "UTC", target: "production", mode: "weekly", weekdays: ["monday"] };
  for (const [time, cron] of [["00:00", "0 0 * * 1"], ["09:35", "35 9 * * 1"], ["23:59", "59 23 * * 1"]]) {
    assert.equal(validateScheduleInput({ ...input, time }).cron, cron);
  }
  const daily = validateScheduleInput({ ...input, weekdays: WEEKDAY_OPTIONS, time: "09:35" });
  assert.deepEqual(parseWeeklyCron(daily.cron).weekdays, WEEKDAY_OPTIONS);
  assert.deepEqual(parseWeeklyCron("35 9 * * *").weekdays, WEEKDAY_OPTIONS);
  assert.deepEqual(parseWeeklyCron("35 9 * * 0,7").weekdays, ["sunday"]);
  assert.equal(parseWeeklyCron("35 9 * * 8"), null);
  assert.equal(parseWeeklyCron("*/5 9 * * 1,3"), null);
  for (const time of ["24:00", "09:60", "9:35", "09:3", "09:35:00", "noon"]) {
    assert.throws(() => validateScheduleInput({ ...input, time }), (error) => Boolean(error.fieldErrors.time));
  }
  for (const weekdays of [[], ["invalid"], ["monday", "invalid"], "monday"]) {
    assert.throws(() => validateScheduleInput({ ...input, weekdays, time: "09:35" }), (error) => Boolean(error.fieldErrors.weekdays));
  }
  assert.throws(() => validateScheduleInput({ ...input, time: "09:35", cron: "0 9 * * *" }),
    (error) => Boolean(error.fieldErrors.weekdays && error.fieldErrors.cron));
  assert.equal(validateScheduleInput({ ...input, mode: "cron", weekdays: [], cron: "*/5 * * * *" }).cron, "*/5 * * * *");
});

test("all schedule types share persistence and validation, legacy rows default to class", () => {
  const dir = createTempDir();
  try {
    const filePath = path.join(dir, "schedules.json");
    const store = new ScheduleStore({ filePath });
    const input = { name: "일정", timezone: "Asia/Seoul", mode: "weekly", weekday: "monday", time: "09:00", target: "production" };
    store.create({ ...input, message: "수업" });
    store.create({ ...input, type: "habit", message: "걷기" });
    store.create({ ...input, type: "report", message: "" });
    assert.deepEqual(new ScheduleStore({ filePath }).list().map((row) => row.type), ["class", "habit", "report"]);
    assert.throws(() => store.create({ ...input, type: "habit" }), /Invalid schedule input/);
    assert.throws(() => store.create({ ...input, type: "other", message: "x" }), /Invalid schedule input/);
    assert.throws(() => store.create({ ...input, message: "x".repeat(2501) }), /Invalid schedule input/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("ScheduleStore accepts legacy real targets and rewrites them to production", () => {
  const dir = createTempDir();
  const storePath = path.join(dir, "data", "schedules.json");

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      [
        createSeedSchedule({
          id: "legacy-1",
          target: "real",
        }),
      ],
      null,
      2
    )
  );

  const store = new ScheduleStore({
    filePath: storePath,
  });

  const schedules = store.initialize();
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].target, "production");

  const persisted = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(persisted[0].target, "production");

  const created = store.create({
    mode: "cron",
    name: "Legacy Input",
    timezone: "UTC",
    weekday: "",
    time: "",
    cron: "0 10 * * 3",
    message: "Legacy input flow",
    target: "real",
  });
  assert.equal(created.target, "production");
});

test("ScheduleStore initializes missing runtime state from the seed file once", () => {
  const dir = createTempDir();
  const storePath = path.join(dir, "data", "schedules.json");
  const seedPath = path.join(dir, "config", "schedules.seed.json");
  const seedSchedule = createSeedSchedule();

  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.writeFileSync(seedPath, JSON.stringify([seedSchedule], null, 2));

  const seededStore = new ScheduleStore({
    filePath: storePath,
    seedPath,
  });

  const initial = seededStore.initialize();
  assert.equal(initial.length, 1);
  assert.equal(initial[0].id, seedSchedule.id);
  assert.equal(JSON.parse(fs.readFileSync(storePath, "utf8"))[0].id, seedSchedule.id);

  fs.writeFileSync(
    seedPath,
    JSON.stringify([createSeedSchedule({ id: "seed-2", name: "New Seed Yoga" })], null, 2)
  );

  const secondStore = new ScheduleStore({
    filePath: storePath,
    seedPath,
  });
  const secondInitial = secondStore.initialize();
  assert.equal(secondInitial.length, 1);
  assert.equal(secondInitial[0].id, seedSchedule.id);
});

test("ScheduleStore initializes empty when both runtime store and seed file are missing", () => {
  const dir = createTempDir();
  const storePath = path.join(dir, "data", "schedules.json");
  const seedPath = path.join(dir, "config", "missing-seed.json");

  const store = new ScheduleStore({
    filePath: storePath,
    seedPath,
  });

  const initial = store.initialize();
  assert.deepEqual(initial, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")), []);
});

test("ScheduleStore fails clearly when the seed file is invalid", () => {
  const dir = createTempDir();
  const storePath = path.join(dir, "data", "schedules.json");
  const seedPath = path.join(dir, "config", "schedules.seed.json");

  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.writeFileSync(seedPath, "{not json");

  assert.throws(
    () =>
      new ScheduleStore({
        filePath: storePath,
        seedPath,
      }).initialize(),
    /Schedule seed file must contain valid JSON/
  );

  fs.writeFileSync(seedPath, JSON.stringify([createSeedSchedule({ timezone: "Nope/Invalid" })], null, 2));

  assert.throws(
    () =>
      new ScheduleStore({
        filePath: storePath,
        seedPath,
      }).initialize(),
    /Schedule seed file contains invalid schedule data/
  );
});
