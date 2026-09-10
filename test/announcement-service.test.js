const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AnnouncementService } = require("../src/announcement-service");
const { AnnouncementStore } = require("../src/announcement-store");
const { AttendanceService } = require("../src/attendance-service");
const { createSheets } = require("./helpers/sheets");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yoga-send-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "announcements.json");
  const store = new AnnouncementStore({ filePath });
  store.initialize();
  const sheets = createSheets({ Attendance: [["날짜", "사용자ID", "이름", "상태", "시간", "scheduleId", "jobName"]] });
  const attendance = new AttendanceService({ spreadsheetId: "sheet", credentialsLoader: () => ({}) });
  attendance.getSheetsClient = async () => sheets.client;
  const posts = [], updates = [];
  const client = { chat: {
    async postMessage(message) { posts.push(message); return { ts: String(posts.length) }; },
    async update(message) { updates.push(message); return {}; },
  } };
  const options = { client, store, attendance, resolveChannel: (target) => `C_${target}`,
    clock: () => new Date("2026-09-07T01:00:00Z"), logger: { error() {} } };
  const service = new AnnouncementService(options);
  return { service, store, attendance, sheets, posts, updates, options, filePath };
}

const schedule = { id: "walk", name: "Walk", message: "10분 걷기", timezone: "Asia/Seoul", target: "production", enabled: false };
function context(post) {
  return JSON.parse(post.blocks.find((block) => block.type === "actions").elements[0].value);
}

test("one send path supports all three types in both environments, even disabled schedules", async (t) => {
  const { service, posts, sheets } = fixture(t);
  for (const type of ["class", "habit", "report"]) {
    for (const target of ["production", "test"]) {
      await service.send({ ...schedule, type }, { target });
      const post = posts.at(-1);
      assert.equal(post.channel, `C_${target}`);
      assert.doesNotMatch(post.text, /\[test\]|테스트/);
      const buttons = post.blocks.filter((block) => block.type === "actions").flatMap((block) => block.elements);
      assert.equal(buttons.length, type === "report" ? 0 : 1);
      if (type !== "report") assert.equal(context(post).target, target);
      if (type === "habit") assert.equal(buttons[0].action_id, "yoga_habit");
      if (type === "report") {
        assert.match(post.text, /지난주 순위/);
        assert.match(post.text, /이번 달 순위/);
        assert.match(post.text, /아직 참여 기록이 없습니다/);
      }
    }
  }
  assert.equal(sheets.calls.filter((call) => call.requestBody.requests?.[0]?.addSheet).length, 1);
});

test("habit registration, retry, cancellation, resend and restart retain one daily record", async (t) => {
  const { service, posts, updates, sheets, store, options, filePath } = fixture(t);
  await service.send({ ...schedule, type: "habit" });
  const first = context(posts[0]);
  await Promise.all([
    service.participate(first, { id: "U1" }, "toggle", "click-1"),
    service.participate(first, { id: "U1" }, "toggle", "click-1"),
    service.participate(first, { id: "U2" }, "toggle", "click-2"),
  ]);
  assert.equal(sheets.tabs.HabitParticipation.length, 3);
  await service.send({ ...schedule, type: "habit" });
  const second = context(posts[1]);
  assert.notEqual(first.occurrenceId, second.occurrenceId);
  assert.match(JSON.stringify(posts[1]), /<@U1>/);
  assert.equal(store.find(first).length, 2);
  await service.participate(first, { id: "U1" }, "toggle", "click-3");
  assert.equal(sheets.tabs.HabitParticipation[1][5], "cancelled");
  assert.equal(sheets.tabs.HabitParticipation.length, 3);
  assert.deepEqual(updates.slice(-2).map((update) => update.ts), ["1", "2"]);
  assert.doesNotMatch(JSON.stringify(updates.at(-1)), /<@U1>/);
  assert.match(JSON.stringify(updates.at(-1)), /<@U2>/);

  const reloaded = new AnnouncementStore({ filePath });
  reloaded.initialize();
  const restarted = new AnnouncementService({ ...options, store: reloaded });
  await restarted.participate(second, { id: "U1" }, "toggle", "click-4");
  assert.equal(sheets.tabs.HabitParticipation[1][5], "done");
  assert.equal(sheets.tabs.HabitParticipation.length, 3);
  assert.match(JSON.stringify(updates.at(-1)), /<@U1>/);
  assert.equal(sheets.calls.filter((call) => call.range?.startsWith("HabitParticipation")).every((call) => call.valueInputOption === "RAW"), true);
});

test("habit participation and report totals are isolated by environment", async (t) => {
  const { service, posts, sheets } = fixture(t);
  await service.send({ ...schedule, type: "habit" });
  await service.send({ ...schedule, type: "habit" }, { target: "test" });
  await service.participate(context(posts[0]), { id: "UPROD" }, "toggle", "p");
  await service.participate(context(posts[1]), { id: "UTEST" }, "toggle", "t");
  assert.equal(sheets.tabs.HabitParticipation.length, 3);
  await service.send({ ...schedule, type: "report" });
  assert.match(posts.at(-1).text, /<@UPROD> · 1회/);
  assert.doesNotMatch(posts.at(-1).text, /UTEST/);
  await service.send({ ...schedule, type: "report" }, { target: "test" });
  assert.match(posts.at(-1).text, /<@UTEST> · 1회/);
  assert.doesNotMatch(posts.at(-1).text, /UPROD/);
});

test("legacy class buttons still register, update to late, cancel and refresh after restart", async (t) => {
  const { service, store, sheets, updates } = fixture(t);
  const legacy = { scheduleId: "old-class", occurrenceDate: "2026-09-07", jobName: "Yoga", timezone: "Asia/Seoul" };
  store.set({ ...legacy, channel: "C_production", ts: "old", detail: "Yoga" });
  await service.participate(legacy, { id: "U1" }, "attend", "1");
  await service.participate(legacy, { id: "U1" }, "late", "2");
  assert.equal(sheets.tabs.Attendance.length, 2);
  assert.equal(sheets.tabs.Attendance[1][3], "late");
  assert.equal(updates.at(-1).ts, "old");
  assert.match(JSON.stringify(updates.at(-1)), /늦참/);
  await service.participate(legacy, { id: "U1" }, "cancelled", "3");
  assert.equal(sheets.tabs.Attendance.length, 1);
});

test("a Slack refresh failure does not roll back participation or apply a retry twice", async (t) => {
  const { service, posts, sheets, options } = fixture(t);
  await service.send({ ...schedule, type: "habit" });
  options.client.chat.update = async () => { throw new Error("message_not_found"); };
  const result = await service.participate(context(posts[0]), { id: "U1" }, "toggle", "once");
  assert.equal(result.refreshFailed, true);
  assert.equal(result.status, "done");
  assert.deepEqual(await service.participate(context(posts[0]), { id: "U1" }, "toggle", "once"), { duplicate: true });
  assert.equal(sheets.tabs.HabitParticipation[1][5], "done");
  await assert.rejects(service.send({ ...schedule, type: "report" }, { target: "invalid" }));
  await service.send({ ...schedule, type: "report" }); // queue recovers after errors
});
