require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const cron = require("node-cron");
const { App } = require("@slack/bolt");

const { AnnouncementStore } = require("./src/announcement-store");
const {
  buildAttendBlocks,
  buildCancelBlocks,
  buildOpenBlocksWithAttendees,
  decodeAnnouncementContext,
} = require("./src/announcement-ui");
const { renderAdminPage } = require("./src/admin-page");
const { AdminSessionStore, startAdminServer } = require("./src/admin-server");
const { AttendanceService } = require("./src/attendance-service");
const { ScheduleRegistry } = require("./src/schedule-registry");
const { ScheduleStore, describeSchedule } = require("./src/schedule-store");
const { logStartupWarnings } = require("./src/startup-warnings");
const {
  ACTION_IDS,
  BLOCK_IDS,
  CALLBACK_IDS,
  buildAddScheduleModalView,
  buildAdminHomeView,
  buildScheduleAdminModalView,
  buildTestPickerModalView,
  extractScheduleDraftFromState,
  extractScheduleFormValues,
  extractTestScheduleSelection,
  isAdminUser,
  parseAdminUserIds,
} = require("./src/slack-admin");
const { getDateString } = require("./src/utils");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const DEFAULT_TIMEZONE = process.env.SCHEDULE_TZ || "Asia/Seoul";
const PRODUCTION_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
const TEST_CHANNEL_ID = process.env.SLACK_TEST_CHANNEL_ID;
const SCHEDULE_STORE_PATH = process.env.SCHEDULE_STORE_PATH || "./data/schedules.json";
const SCHEDULE_SEED_PATH = process.env.SCHEDULE_SEED_PATH || "./config/schedules.seed.json";
const ANNOUNCEMENTS_FILE = process.env.ANNOUNCEMENTS_FILE || "./data/active-announcements.json";
const SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEETS_RANGE = process.env.GOOGLE_SHEETS_RANGE || "Attendance!A:E";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_UI_PORT = Number(process.env.ADMIN_UI_PORT || "8400");
const ADMIN_USER_IDS = parseAdminUserIds(process.env.SCHEDULE_ADMIN_USER_IDS || "");

const announcementStore = new AnnouncementStore({ filePath: ANNOUNCEMENTS_FILE });
announcementStore.initialize();

const scheduleStore = new ScheduleStore({
  filePath: SCHEDULE_STORE_PATH,
  seedPath: SCHEDULE_SEED_PATH,
  defaultTimezone: DEFAULT_TIMEZONE,
});

const attendanceService = new AttendanceService({
  spreadsheetId: SHEETS_SPREADSHEET_ID,
  range: SHEETS_RANGE,
  defaultTimezone: DEFAULT_TIMEZONE,
  credentialsLoader: getServiceAccountCredentials,
});

const scheduleRegistry = new ScheduleRegistry({
  cronLib: cron,
  onTrigger: async (schedule) => {
    await postSavedSchedule(schedule);
  },
});

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed);
    try {
      return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
    } catch (_) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must be JSON or base64-encoded JSON.");
    }
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) {
    return JSON.parse(fs.readFileSync(keyFile, "utf8"));
  }

  throw new Error("Missing Google service account credentials.");
}

function resolveScheduleChannel(target) {
  if (target === "test") return TEST_CHANNEL_ID;
  return PRODUCTION_CHANNEL_ID;
}

function getDecoratedSchedules() {
  return scheduleStore.list().map((schedule) => describeSchedule(schedule, resolveScheduleChannel));
}

function createManualAnnouncementContext(detail) {
  return {
    scheduleId: `manual:${crypto.randomUUID()}`,
    occurrenceDate: getDateString(DEFAULT_TIMEZONE),
    jobName: detail || "Manual yoga open",
    timezone: DEFAULT_TIMEZONE,
  };
}

function createSavedScheduleContext(schedule) {
  return {
    scheduleId: schedule.id,
    occurrenceDate: getDateString(schedule.timezone),
    jobName: schedule.name,
    timezone: schedule.timezone,
  };
}

function createTestScheduleContext(schedule) {
  return {
    scheduleId: `test:${schedule.id}`,
    occurrenceDate: getDateString(schedule.timezone),
    jobName: `${schedule.name} [test]`,
    timezone: schedule.timezone,
  };
}

async function postAnnouncement({ channel, detail, context }) {
  const result = await app.client.chat.postMessage({
    channel,
    text: `🧘 *[요가무리 클래스 오픈]*\n>${detail}`,
    blocks: buildOpenBlocksWithAttendees(detail, [], context),
  });

  announcementStore.set({
    ...context,
    channel,
    detail,
    ts: result.ts,
  });

  return result;
}

async function postSavedSchedule(schedule) {
  const channel = resolveScheduleChannel(schedule.target);
  if (!channel) {
    console.warn(`⚠️ Missing Slack channel for target "${schedule.target}" on schedule ${schedule.id}.`);
    return null;
  }

  return postAnnouncement({
    channel,
    detail: schedule.message,
    context: createSavedScheduleContext(schedule),
  });
}

async function postScheduleToTestChannel(schedule) {
  if (!TEST_CHANNEL_ID) {
    throw new Error("Missing SLACK_TEST_CHANNEL_ID.");
  }

  return postAnnouncement({
    channel: TEST_CHANNEL_ID,
    detail: schedule.message,
    context: createTestScheduleContext(schedule),
  });
}

async function updateAnnouncementWithAttendees(client, context) {
  const announcement = announcementStore.get(context.scheduleId, context.occurrenceDate);
  if (!announcement) return;

  const attendees = await attendanceService.getAttendees({
    occurrenceDate: context.occurrenceDate,
    scheduleId: context.scheduleId,
  });

  await client.chat.update({
    channel: announcement.channel,
    ts: announcement.ts,
    text: `🧘 *[요가무리 클래스 오픈]*\n>${announcement.detail}`,
    blocks: buildOpenBlocksWithAttendees(announcement.detail, attendees, {
      scheduleId: announcement.scheduleId,
      occurrenceDate: announcement.occurrenceDate,
      jobName: announcement.jobName,
      timezone: announcement.timezone,
    }),
  });
}

async function publishHome(client, userId) {
  const view = buildAdminHomeView({
    schedules: getDecoratedSchedules(),
    authorized: isAdminUser(userId, ADMIN_USER_IDS),
  });

  await client.views.publish({
    user_id: userId,
    view,
  });
}

async function refreshAdminModal(client, rootViewId) {
  if (!rootViewId) return;

  try {
    await client.views.update({
      view_id: rootViewId,
      view: buildScheduleAdminModalView({
        schedules: getDecoratedSchedules(),
      }),
    });
  } catch (_) {
    // Root modal may not be open. That's okay.
  }
}

async function refreshAdminSurfaces(client, userId, rootViewId) {
  const tasks = [publishHome(client, userId)];
  if (rootViewId) tasks.push(refreshAdminModal(client, rootViewId));
  await Promise.allSettled(tasks);
}

function parseMetadata(rawValue) {
  try {
    return JSON.parse(rawValue || "{}");
  } catch (_) {
    return {};
  }
}

function mapValidationErrorsToSlack(fieldErrors) {
  const mapping = {
    name: BLOCK_IDS.name,
    mode: BLOCK_IDS.mode,
    timezone: BLOCK_IDS.timezone,
    weekday: BLOCK_IDS.weekday,
    time: BLOCK_IDS.time,
    cron: BLOCK_IDS.cron,
    message: BLOCK_IDS.message,
    target: BLOCK_IDS.target,
  };

  return Object.entries(fieldErrors).reduce((acc, [key, value]) => {
    if (mapping[key]) acc[mapping[key]] = value;
    return acc;
  }, {});
}

app.command("/yoga", async ({ command, ack, respond, client }) => {
  await ack();

  const text = String(command.text || "").trim();

  if (text.startsWith("open")) {
    const detail = text.replace(/^open/, "").trim();
    if (!detail) {
      await respond({
        text: "사용법: `/yoga open <시간> <클래스>`",
        response_type: "ephemeral",
      });
      return;
    }

    const context = createManualAnnouncementContext(detail);
    await postAnnouncement({
      channel: command.channel_id,
      detail,
      context,
    });
    return;
  }

  if (text.startsWith("test")) {
    if (!TEST_CHANNEL_ID) {
      await respond({
        text: "`SLACK_TEST_CHANNEL_ID`를 설정해 주세요.",
        response_type: "ephemeral",
      });
      return;
    }

    const schedules = scheduleStore.list();
    if (schedules.length === 0) {
      await respond({
        text: "테스트할 저장된 스케줄이 아직 없어요.",
        response_type: "ephemeral",
      });
      return;
    }

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildTestPickerModalView({
        schedules: getDecoratedSchedules(),
        requestChannelId: command.channel_id,
      }),
    });
    return;
  }

  if (text.startsWith("schedule")) {
    if (!isAdminUser(command.user_id, ADMIN_USER_IDS)) {
      await respond({
        text: "이 기능은 스케줄 관리자만 사용할 수 있어요.",
        response_type: "ephemeral",
      });
      return;
    }

    try {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildScheduleAdminModalView({
          schedules: getDecoratedSchedules(),
        }),
      });
    } catch (error) {
      console.error("Failed to open schedule admin modal:", error);
      await respond({
        text: "스케줄 관리 창을 여는 중 오류가 발생했어요.",
        response_type: "ephemeral",
      });
    }
    return;
  }

  await respond({
    text:
      "사용법: `/yoga open <시간> <클래스>`\n" +
      "테스트: `/yoga test`\n" +
      "스케줄 관리: `/yoga schedule`",
    response_type: "ephemeral",
  });
});

app.action("yoga_interest", async ({ ack, body, client }) => {
  await ack();

  const channelId = body.channel && body.channel.id;
  const userId = body.user && body.user.id;
  const action = body.actions && body.actions[0];
  const context = action && decodeAnnouncementContext(action.value);

  if (!channelId || !userId || !context) {
    return;
  }

  await client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    blocks: buildAttendBlocks(context),
    text: "오늘 참여 형태를 선택해 주세요.",
  });
});

async function handleAttendanceAction({ ack, body, client, status }) {
  await ack();

  const channelId = body.channel && body.channel.id;
  const user = body.user || {};
  const action = body.actions && body.actions[0];
  const context = action && decodeAnnouncementContext(action.value);

  if (!channelId || !user.id || !context) return;

  try {
    await attendanceService.appendAttendance({
      occurrenceDate: context.occurrenceDate,
      scheduleId: context.scheduleId,
      jobName: context.jobName || "Yoga",
      userId: user.id,
      userName: user.username || user.name || user.id,
      status,
      timezone: context.timezone || DEFAULT_TIMEZONE,
    });

    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      blocks: buildCancelBlocks(context),
      text: "참석 등록이 완료됐어요.",
    });

    await updateAnnouncementWithAttendees(client, context);
  } catch (error) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      text: `참석 등록에 실패했어요: ${error.message}`,
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
  const action = body.actions && body.actions[0];
  const context = action && decodeAnnouncementContext(action.value);

  if (!channelId || !user.id || !context) return;

  try {
    const removed = await attendanceService.deleteAttendance({
      occurrenceDate: context.occurrenceDate,
      scheduleId: context.scheduleId,
      userId: user.id,
    });

    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      text: removed ? "취소가 완료됐어요." : "이미 취소되었거나 신청 내역이 없어요.",
    });

    if (removed) {
      await updateAnnouncementWithAttendees(client, context);
    }
  } catch (error) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: user.id,
      text: `취소에 실패했어요: ${error.message}`,
    });
  }
});

app.event("app_home_opened", async ({ event, client }) => {
  await publishHome(client, event.user);
});

app.action(ACTION_IDS.scheduleAdminAddOpen, async ({ ack, body, client }) => {
  await ack();

  if (!isAdminUser(body.user && body.user.id, ADMIN_USER_IDS)) return;

  const view = buildAddScheduleModalView({
    defaultTimezone: DEFAULT_TIMEZONE,
    metadata: {
      source: body.view && body.view.type,
      userId: body.user.id,
      ...(body.view && body.view.type === "modal"
        ? { rootViewId: body.view.root_view_id || body.view.id }
        : {}),
    },
  });

  if (body.view && body.view.type === "modal") {
    await client.views.push({
      trigger_id: body.trigger_id,
      view,
    });
    return;
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view,
  });
});

app.action(ACTION_IDS.scheduleAdminToggle, async ({ ack, body, action, client }) => {
  await ack();

  if (!isAdminUser(body.user && body.user.id, ADMIN_USER_IDS)) return;

  try {
    const schedule = scheduleStore.toggle(action.value);
    scheduleRegistry.syncSchedule(schedule);
    const rootViewId = body.view && body.view.type === "modal" ? body.view.root_view_id || body.view.id : null;
    await refreshAdminSurfaces(client, body.user.id, rootViewId);
  } catch (error) {
    console.error("Failed to toggle schedule:", error);
  }
});

app.action(ACTION_IDS.scheduleAdminDelete, async ({ ack, body, action, client }) => {
  await ack();

  if (!isAdminUser(body.user && body.user.id, ADMIN_USER_IDS)) return;

  try {
    const removed = scheduleStore.delete(action.value);
    scheduleRegistry.unregister(removed.id);
    const rootViewId = body.view && body.view.type === "modal" ? body.view.root_view_id || body.view.id : null;
    await refreshAdminSurfaces(client, body.user.id, rootViewId);
  } catch (error) {
    console.error("Failed to delete schedule:", error);
  }
});

app.action(ACTION_IDS.scheduleModeChanged, async ({ ack, body, action, client }) => {
  await ack();

  if (!isAdminUser(body.user && body.user.id, ADMIN_USER_IDS)) return;
  if (!body.view) return;

  const metadata = parseMetadata(body.view.private_metadata);
  const draft = extractScheduleDraftFromState(body.view.state.values, DEFAULT_TIMEZONE);
  draft.mode = action.selected_option && action.selected_option.value === "cron" ? "cron" : "weekly";

  if (draft.mode === "cron") {
    draft.weekday = "monday";
    draft.time = "";
  } else {
    draft.cron = "";
  }

  try {
    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: buildAddScheduleModalView({
        defaultTimezone: DEFAULT_TIMEZONE,
        metadata,
        values: draft,
      }),
    });
  } catch (error) {
    console.error("Failed to switch schedule mode:", error);
  }
});

app.view(CALLBACK_IDS.scheduleAdd, async ({ ack, body, view, client }) => {
  if (!isAdminUser(body.user && body.user.id, ADMIN_USER_IDS)) {
    await ack({
      response_action: "errors",
      errors: {
        [BLOCK_IDS.name]: "Only schedule admins can save schedules.",
      },
    });
    return;
  }

  try {
    const input = extractScheduleFormValues(view, DEFAULT_TIMEZONE);
    const schedule = scheduleStore.create(input);
    scheduleRegistry.syncSchedule(schedule);
    const metadata = parseMetadata(view.private_metadata);
    await ack();
    await refreshAdminSurfaces(client, body.user.id, metadata.rootViewId);
  } catch (error) {
    if (error.code === "VALIDATION_ERROR") {
      await ack({
        response_action: "errors",
        errors: mapValidationErrorsToSlack(error.fieldErrors),
      });
      return;
    }

    await ack({
      response_action: "errors",
      errors: {
        [BLOCK_IDS.name]: error.message || "Failed to save schedule.",
      },
    });
  }
});

app.view(CALLBACK_IDS.scheduleTest, async ({ ack, body, view, client }) => {
  const scheduleId = extractTestScheduleSelection(view);
  if (!scheduleId) {
    await ack({
      response_action: "errors",
      errors: {
        [BLOCK_IDS.testSchedule]: "Choose a saved schedule.",
      },
    });
    return;
  }

  const schedule = scheduleStore.get(scheduleId);
  if (!schedule) {
    await ack({
      response_action: "errors",
      errors: {
        [BLOCK_IDS.testSchedule]: "That schedule no longer exists.",
      },
    });
    return;
  }

  await ack();

  try {
    await postScheduleToTestChannel(schedule);

    const metadata = parseMetadata(view.private_metadata);
    if (metadata.requestChannelId) {
      await client.chat.postEphemeral({
        channel: metadata.requestChannelId,
        user: body.user.id,
        text: `테스트 메시지를 발송했습니다. (${schedule.name} / <#${TEST_CHANNEL_ID}>)`,
      });
    }
  } catch (error) {
    const metadata = parseMetadata(view.private_metadata);
    if (metadata.requestChannelId) {
      await client.chat.postEphemeral({
        channel: metadata.requestChannelId,
        user: body.user.id,
        text: `테스트 메시지 발송에 실패했어요: ${error.message}`,
      });
    }
  }
});

(async () => {
  scheduleStore.initialize();

  await app.start();
  console.log("⚡️ Yogamuri bot is running (Socket Mode)");
  scheduleRegistry.syncAll(scheduleStore.list());
  logStartupWarnings({
    productionChannelId: PRODUCTION_CHANNEL_ID,
    testChannelId: TEST_CHANNEL_ID,
    adminPassword: ADMIN_PASSWORD,
    adminUserIds: ADMIN_USER_IDS,
    logger: console,
  });

  const sessionStore = new AdminSessionStore();
  await startAdminServer({
    adminPassword: ADMIN_PASSWORD,
    pageHtml: renderAdminPage({ defaultTimezone: DEFAULT_TIMEZONE }),
    port: Number.isFinite(ADMIN_UI_PORT) ? ADMIN_UI_PORT : 8400,
    scheduleStore,
    sessionStore,
    serializeSchedule: (schedule) => describeSchedule(schedule, resolveScheduleChannel),
    onScheduleCreated: async (schedule) => {
      scheduleRegistry.syncSchedule(schedule);
    },
    onScheduleDeleted: async (schedule) => {
      scheduleRegistry.unregister(schedule.id);
    },
    onScheduleToggled: async (schedule) => {
      scheduleRegistry.syncSchedule(schedule);
    },
  });

  console.log(`🌿 Admin page available on port ${ADMIN_UI_PORT || 8400}`);
})();
