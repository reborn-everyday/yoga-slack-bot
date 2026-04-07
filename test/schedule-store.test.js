const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  ScheduleStore,
  describeSchedule,
  validateScheduleInput,
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
