const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { createRequire } = require("module");
const { AttendanceService } = require("../src/attendance-service");
const { ACTION_IDS, BLOCK_IDS, CALLBACK_IDS } = require("../src/slack-admin");
const { createSheets } = require("./helpers/sheets");

test("runtime routes cron and /yoga send through the same flow for every schedule type", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yoga-runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sheets = createSheets({ Attendance: [["date", "userId", "userName", "status", "timestamp", "scheduleId", "jobName"]] });
  const posts = [], ephemeral = [], views = [], jobs = [];
  const handlers = { command: {}, action: {}, view: {}, event: {} };
  const client = {
    chat: {
      async postMessage(message) { posts.push(message); return { ts: `${posts.length}` }; },
      async postEphemeral(message) { ephemeral.push(message); },
      async update() {},
    },
    views: {
      async open(options) { views.push(options.view); },
      async publish() {}, async update() {}, async push() {},
    },
  };
  class App {
    constructor() { this.client = client; }
    async start() {}
  }
  for (const kind of Object.keys(handlers)) App.prototype[kind] = (id, handler) => { handlers[kind][id] = handler; };
  class TestAttendance extends AttendanceService {
    async getSheetsClient() { return sheets.client; }
  }
  const filename = path.resolve(__dirname, "../index.js");
  const originalRequire = createRequire(filename);
  let booted;
  const ready = new Promise((resolve) => { booted = resolve; });
  let adminOptions;
  const replacements = {
    dotenv: { config() {} }, "@slack/bolt": { App },
    "./src/attendance-service": { AttendanceService: TestAttendance },
    "./src/admin-server": {
      AdminSessionStore: class {},
      async startAdminServer(options) { adminOptions = options; booted(); return {}; },
    },
    "node-cron": { ...originalRequire("node-cron"), schedule(expression, callback) {
      const job = { expression, callback, stop() {} }; jobs.push(job); return job;
    } },
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    require: (name) => replacements[name] || originalRequire(name),
    process: { env: {
      SLACK_CHANNEL_ID: "CPROD", SLACK_TEST_CHANNEL_ID: "CTEST", GOOGLE_SHEETS_ID: "sheet",
      ADMIN_PASSWORD: "unused", SCHEDULE_ADMIN_USER_IDS: "UADMIN",
      SCHEDULE_STORE_PATH: path.join(dir, "schedules.json"),
      SCHEDULE_SEED_PATH: path.join(dir, "missing-seed.json"),
      ANNOUNCEMENTS_FILE: path.join(dir, "announcements.json"),
    } },
    console: { log() {}, warn() {}, error() {} }, Buffer,
  }, { filename });
  await ready;
  const store = adminOptions.scheduleStore;
  const ack = async () => {};
  async function command(text, channel_id = "CPROD") {
    await handlers.command["/yoga"]({ command: { text, channel_id, user_id: "UADMIN", trigger_id: "trigger" }, ack, client, respond: async () => {} });
  }
  for (const type of ["class", "habit", "report"]) {
    const values = {};
    for (const [key, value] of Object.entries({ type, timezone: "Asia/Seoul", target: "production" })) {
      values[BLOCK_IDS[key]] = { value: { selected_option: { value } } };
    }
    values[BLOCK_IDS.name] = { value: { value: type } };
    values[BLOCK_IDS.message] = { value: { value: type === "report" ? null : "안내" } };
    values[BLOCK_IDS.mode] = { [ACTION_IDS.scheduleModeChanged]: { selected_option: { value: "weekly" } } };
    values[BLOCK_IDS.weekday] = { value: { selected_options: ["monday", "wednesday", "friday"].map((value) => ({ value })) } };
    values[BLOCK_IDS.time] = { value: { value: "09:35" } };
    await handlers.view[CALLBACK_IDS.scheduleAdd]({
      ack: async (response) => assert.equal(response, undefined), client,
      body: { user: { id: "UADMIN" } }, view: { private_metadata: "{}", state: { values } },
    });
    const schedule = store.list().find((row) => row.type === type);
    assert.ok(schedule);
    assert.equal(schedule.cron, "35 9 * * 1,3,5");
    assert.equal(jobs.at(-1).expression, "35 9 * * 1,3,5");
    for (const target of ["production", "test"]) {
      await command("send", target === "test" ? "CTEST" : "CPROD");
      const modal = views.at(-1);
      assert.equal(modal.callback_id, CALLBACK_IDS.scheduleSend);
      assert.equal(modal.blocks.find((block) => block.block_id === BLOCK_IDS.target).element.initial_option.value, target);
      await handlers.view[CALLBACK_IDS.scheduleSend]({ ack, client, body: { user: { id: "UADMIN" } }, view: {
        private_metadata: modal.private_metadata,
        state: { values: {
          [BLOCK_IDS.sendSchedule]: { value: { selected_option: { value: schedule.id } } },
          [BLOCK_IDS.target]: { value: { selected_option: { value: target } } },
        } },
      } });
      assert.equal(posts.at(-1).channel, target === "test" ? "CTEST" : "CPROD");
      assert.match(ephemeral.at(-1).text, /^메시지를 발송했습니다/);
      if (type === "habit") {
        const action = posts.at(-1).blocks.find((block) => block.type === "actions").elements[0];
        await handlers.action.yoga_habit({ ack, client, body: {
          channel: { id: posts.at(-1).channel }, user: { id: `U_${target}` },
          actions: [{ ...action, action_ts: `click-${target}` }],
        } });
        assert.match(ephemeral.at(-1).text, /실천 기록을 저장/);
        assert.equal(ephemeral.at(-1).blocks, undefined);
      }
    }
    const before = posts.length;
    jobs.at(-1).callback();
    // Cron deliberately does not await its callback; wait for the observable result.
    for (let attempt = 0; posts.length === before && attempt < 20; attempt++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(posts.length, before + 1);
    assert.equal(posts.at(-1).channel, "CPROD");
  }
  assert.match(posts.at(-1).text, /U_production/);
  assert.doesNotMatch(posts.at(-1).text, /U_test/);
  await command("test");
  assert.equal(views.at(-1).blocks.find((block) => block.block_id === BLOCK_IDS.target).element.initial_option.value, "test");
  await command("open 자유 수업", "CTEST");
  assert.equal(posts.at(-1).channel, "CTEST");
  assert.match(posts.at(-1).text, /자유 수업/);
  assert.ok(handlers.action[ACTION_IDS.scheduleModeChanged]);
});
