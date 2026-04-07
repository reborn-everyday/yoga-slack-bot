const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { renderAdminPage } = require("../src/admin-page");
const { AdminSessionStore, createAdminRequestHandler } = require("../src/admin-server");
const { ScheduleStore, describeSchedule } = require("../src/schedule-store");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yoga-admin-"));
}

function createMockRequest({ method, url, headers = {}, body }) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
    },
    end(chunk = "") {
      this.body += chunk;
    },
  };
}

async function invoke(handler, requestOptions) {
  const req = createMockRequest(requestOptions);
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

test("admin handler requires auth and supports create/list/toggle/delete", async () => {
  const dir = createTempDir();
  const store = new ScheduleStore({
    filePath: path.join(dir, "data", "schedules.json"),
    defaultTimezone: "Asia/Seoul",
  });
  store.initialize();

  const createdIds = [];
  const deletedIds = [];
  const toggledIds = [];

  const handler = createAdminRequestHandler({
    adminPassword: "secret",
    pageHtml: renderAdminPage(),
    scheduleStore: store,
    sessionStore: new AdminSessionStore(),
    serializeSchedule: (schedule) =>
      describeSchedule(schedule, (target) => (target === "test" ? "C_TEST" : "C_PRODUCTION")),
    onScheduleCreated: async (schedule) => {
      createdIds.push(schedule.id);
    },
    onScheduleDeleted: async (schedule) => {
      deletedIds.push(schedule.id);
    },
    onScheduleToggled: async (schedule) => {
      toggledIds.push(schedule.id);
    },
  });

  let response = await invoke(handler, {
    method: "GET",
    url: "/api/schedules",
  });
  assert.equal(response.statusCode, 401);

  response = await invoke(handler, {
    method: "POST",
    url: "/api/admin/session",
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(response.statusCode, 401);

  response = await invoke(handler, {
    method: "POST",
    url: "/api/admin/session",
    body: JSON.stringify({ password: "secret" }),
  });
  assert.equal(response.statusCode, 200);

  const cookie = response.headers["Set-Cookie"].split(";")[0];
  assert.match(cookie, /admin_session=/);

  response = await invoke(handler, {
    method: "POST",
    url: "/api/schedules",
    headers: { cookie },
    body: JSON.stringify({
      name: "Lunch Yoga Monday",
      timezone: "Asia/Seoul",
      mode: "weekly",
      weekday: "monday",
      time: "09:00",
      cron: "",
      message: "Monday lunch class",
      target: "real",
    }),
  });
  assert.equal(response.statusCode, 201);
  const created = JSON.parse(response.body);
  assert.equal(createdIds.length, 1);
  assert.equal(created.scheduleMode, "weekly");
  assert.equal(created.target, "production");
  assert.equal(created.channelDisplay, "Production Channel");

  response = await invoke(handler, {
    method: "GET",
    url: "/api/schedules",
    headers: { cookie },
  });
  assert.equal(response.statusCode, 200);
  const schedules = JSON.parse(response.body);
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].weekday, "monday");
  assert.equal(schedules[0].target, "production");

  response = await invoke(handler, {
    method: "PATCH",
    url: `/api/schedules/${created.id}/toggle`,
    headers: { cookie },
  });
  assert.equal(response.statusCode, 200);
  const toggled = JSON.parse(response.body);
  assert.equal(toggled.enabled, false);
  assert.equal(toggledIds.length, 1);

  response = await invoke(handler, {
    method: "POST",
    url: "/api/schedules",
    headers: { cookie },
    body: JSON.stringify({
      name: "Cron Test",
      timezone: "UTC",
      mode: "cron",
      weekday: "",
      time: "",
      cron: "*/15 * * * *",
      message: "Cron flow",
      target: "test",
    }),
  });
  assert.equal(response.statusCode, 201);
  const cronSchedule = JSON.parse(response.body);
  assert.equal(cronSchedule.scheduleMode, "cron");

  response = await invoke(handler, {
    method: "POST",
    url: "/api/schedules",
    headers: { cookie },
    body: JSON.stringify({
      name: "Broken",
      timezone: "UTC",
      mode: "cron",
      weekday: "monday",
      time: "09:00",
      cron: "bad cron",
      message: "Broken",
      target: "production",
    }),
  });
  assert.equal(response.statusCode, 400);

  response = await invoke(handler, {
    method: "DELETE",
    url: `/api/schedules/${created.id}`,
    headers: { cookie },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(deletedIds.length, 1);
});
