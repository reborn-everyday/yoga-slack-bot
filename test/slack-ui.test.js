const test = require("node:test");
const assert = require("node:assert/strict");

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
  getDefaultDraft,
  isAdminUser,
  parseAdminUserIds,
} = require("../src/slack-admin");
const {
  buildOpenBlocksWithAttendees,
  decodeAnnouncementContext,
} = require("../src/announcement-ui");

const sampleSchedule = {
  id: "schedule-1",
  name: "Lunch Yoga Monday",
  timezone: "Asia/Seoul",
  cron: "0 9 * * 1",
  message: "Monday lunch class",
  target: "production",
  enabled: true,
  channelId: "C_PRODUCTION",
  channelDisplay: "Production Channel",
  scheduleMode: "weekly",
  weekday: "monday",
  time: "09:00",
  weeklyLabel: "Monday 09:00",
};

test("Slack admin helpers enforce allowlist and render home/modal views", () => {
  const admins = parseAdminUserIds("U1, U2");
  assert.equal(isAdminUser("U1", admins), true);
  assert.equal(isAdminUser("U9", admins), false);

  const unauthorizedHome = buildAdminHomeView({
    schedules: [sampleSchedule],
    authorized: false,
  });
  assert.match(unauthorizedHome.blocks[0].text.text, /일부 사용자/);

  const homeView = buildAdminHomeView({
    schedules: [sampleSchedule],
    authorized: true,
  });
  assert.equal(homeView.type, "home");
  assert.equal(homeView.blocks[1].elements[0].action_id, ACTION_IDS.scheduleAdminAddOpen);

  const modalView = buildScheduleAdminModalView({
    schedules: [sampleSchedule],
  });
  assert.equal("external_id" in modalView, false);
  assert.match(modalView.blocks[2].text.text, /\*channel:\* Production Channel/);
  assert.match(modalView.blocks[2].text.text, /\*timezone:\* Asia\/Seoul/);
  assert.match(modalView.blocks[2].text.text, /\*status:\* On/);
  const actionsBlock = modalView.blocks.find((block) => block.type === "actions" && block.elements.length > 1);
  assert.equal(actionsBlock.elements[0].action_id, ACTION_IDS.scheduleAdminToggle);
  assert.equal(actionsBlock.elements[1].action_id, ACTION_IDS.scheduleAdminDelete);
});

test("Slack add/test modals round-trip schedule form values", () => {
  const addModal = buildAddScheduleModalView({
    defaultTimezone: "Asia/Seoul",
    metadata: { source: "modal", rootViewId: "VROOT1", userId: "U1" },
    values: getDefaultDraft("Asia/Seoul"),
  });
  assert.equal(addModal.callback_id, CALLBACK_IDS.scheduleAdd);
  assert.deepEqual(JSON.parse(addModal.private_metadata), {
    source: "modal",
    rootViewId: "VROOT1",
    userId: "U1",
  });
  const modeBlock = addModal.blocks.find((block) => block.block_id === BLOCK_IDS.mode);
  assert.equal(modeBlock.element.action_id, ACTION_IDS.scheduleModeChanged);

  const weeklyFormValues = extractScheduleFormValues({
    state: {
      values: {
        schedule_name: { value: { value: "Lunch Yoga Monday" } },
        schedule_mode: {
          schedule_mode_changed: { selected_option: { value: "weekly" } },
        },
        schedule_timezone: { value: { selected_option: { value: "Asia/Seoul" } } },
        schedule_weekday: { value: { selected_option: { value: "monday" } } },
        schedule_time: { value: { selected_time: "09:00" } },
        schedule_message: { value: { value: "Monday lunch class" } },
        schedule_target: {
          value: { selected_option: { value: "production" } },
        },
      },
    },
  });

  assert.deepEqual(weeklyFormValues, {
    name: "Lunch Yoga Monday",
    mode: "weekly",
    timezone: "Asia/Seoul",
    weekday: "monday",
    time: "09:00",
    cron: "",
    message: "Monday lunch class",
    target: "production",
  });

  const legacyDraft = extractScheduleDraftFromState(
    {
      schedule_target: {
        value: { selected_option: { value: "real" } },
      },
    },
    "Asia/Seoul"
  );
  assert.equal(legacyDraft.target, "production");

  const cronDraft = extractScheduleDraftFromState(
    {
      schedule_name: { value: { value: "Cron Test" } },
      schedule_mode: {
        schedule_mode_changed: { selected_option: { value: "cron" } },
      },
      schedule_timezone: { value: { selected_option: { value: "UTC" } } },
      schedule_cron: { value: { value: "*/15 * * * *" } },
      schedule_message: { value: { value: "Cron flow" } },
      schedule_target: {
        value: { selected_option: { value: "test" } },
      },
    },
    "Asia/Seoul"
  );
  assert.deepEqual(cronDraft, {
    name: "Cron Test",
    mode: "cron",
    timezone: "UTC",
    weekday: "",
    time: "",
    cron: "*/15 * * * *",
    message: "Cron flow",
    target: "test",
  });

  const testModal = buildTestPickerModalView({
    schedules: [sampleSchedule],
    requestChannelId: "C123",
  });
  assert.equal(testModal.callback_id, CALLBACK_IDS.scheduleTest);
  assert.equal(testModal.blocks[0].element.options[0].value, "schedule-1");
  assert.match(testModal.blocks[0].element.options[0].text.text, /^name: Lunch Yoga Monday \| status: on$/);

  const selectedScheduleId = extractTestScheduleSelection({
    state: {
      values: {
        test_schedule: {
          value: { selected_option: { value: "schedule-1" } },
        },
      },
    },
  });

  assert.equal(selectedScheduleId, "schedule-1");
});

test("Announcement blocks preserve the context used by /yoga open and attendance actions", () => {
  const context = {
    scheduleId: "manual:1",
    occurrenceDate: "2026-04-07",
    jobName: "Manual yoga open",
    timezone: "Asia/Seoul",
  };

  const blocks = buildOpenBlocksWithAttendees("Manual class", [], context);
  const actionBlock = blocks.find((block) => block.type === "actions");
  const decoded = decodeAnnouncementContext(actionBlock.elements[0].value);

  assert.deepEqual(decoded, context);
});
