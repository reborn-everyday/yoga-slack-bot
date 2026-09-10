const { SCHEDULE_TYPES, normalizeWeekdays } = require("./schedule-store");

const ACTION_IDS = {
  scheduleAdminAddOpen: "schedule_admin_add_open",
  scheduleAdminDelete: "schedule_admin_delete",
  scheduleAdminToggle: "schedule_admin_toggle",
  scheduleModeChanged: "schedule_mode_changed",
};

const CALLBACK_IDS = {
  scheduleAdd: "schedule_admin_add_view",
  scheduleSend: "schedule_send_view",
};

const BLOCK_IDS = {
  cron: "schedule_cron",
  message: "schedule_message",
  mode: "schedule_mode",
  name: "schedule_name",
  type: "schedule_type",
  target: "schedule_target",
  sendSchedule: "send_schedule",
  time: "schedule_time",
  timezone: "schedule_timezone",
  weekday: "schedule_weekday",
};

const MODE_OPTIONS = [
  { label: "Weekly", value: "weekly" },
  { label: "Cron", value: "cron" },
];

const TIMEZONE_OPTIONS = [
  { label: "Asia/Seoul", value: "Asia/Seoul" },
  { label: "UTC", value: "UTC" },
];

const WEEKDAY_OPTIONS = [
  { label: "Monday", value: "monday" },
  { label: "Tuesday", value: "tuesday" },
  { label: "Wednesday", value: "wednesday" },
  { label: "Thursday", value: "thursday" },
  { label: "Friday", value: "friday" },
  { label: "Saturday", value: "saturday" },
  { label: "Sunday", value: "sunday" },
];

function parseAdminUserIds(rawValue) {
  return new Set(
    String(rawValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isAdminUser(userId, adminUserIds) {
  if (!userId || !adminUserIds) return false;
  if (adminUserIds instanceof Set) return adminUserIds.has(userId);
  return new Set(adminUserIds).has(userId);
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function optionFor(value, label) {
  return {
    text: { type: "plain_text", text: label },
    value,
  };
}

function getOptionLabel(options, value, fallback) {
  const found = options.find((option) => option.value === value);
  return found ? found.label : fallback;
}

function getStaticSelectOption(options, value, fallbackLabel) {
  return optionFor(value, getOptionLabel(options, value, fallbackLabel));
}

function getScheduleDisplayText(schedule) {
  if (schedule.scheduleMode === "weekly" && schedule.weeklyLabel) {
    return schedule.weeklyLabel;
  }
  return `Cron \`${schedule.cron}\``;
}

function getSlackChannelDisplay(schedule) {
  return schedule.channelDisplay || `${schedule.target === "test" ? "Test Channel" : "Production Channel"}`;
}

function buildScheduleBlocks(schedules) {
  if (schedules.length === 0) {
    return [
      {
        type: "section",
        text: { type: "mrkdwn", text: "등록된 스케줄이 아직 없어요." },
      },
    ];
  }

  return schedules.flatMap((schedule, index) => {
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*${schedule.name}* · ${SCHEDULE_TYPES[schedule.type || "class"]}`,
            `*schedule:* ${getScheduleDisplayText(schedule)}`,
            `*timezone:* ${schedule.timezone}`,
            `*channel:* ${getSlackChannelDisplay(schedule)}`,
            `*status:* ${schedule.enabled ? "On" : "Off"}`,
            `*message:* ${truncateText(schedule.message, 120)}`,
          ].join("\n"),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: ACTION_IDS.scheduleAdminToggle,
            value: schedule.id,
            text: {
              type: "plain_text",
              text: schedule.enabled ? "Turn off" : "Turn on",
            },
            style: schedule.enabled ? "danger" : "primary",
          },
          {
            type: "button",
            action_id: ACTION_IDS.scheduleAdminDelete,
            value: schedule.id,
            text: {
              type: "plain_text",
              text: "Delete",
            },
            style: "danger",
            confirm: {
              title: { type: "plain_text", text: "Delete schedule?" },
              text: {
                type: "mrkdwn",
                text: `삭제하면 *${schedule.name}* 스케줄이 바로 제거돼요.`,
              },
              confirm: { type: "plain_text", text: "Delete" },
              deny: { type: "plain_text", text: "Cancel" },
            },
          },
        ],
      },
    ];

    if (index < schedules.length - 1) blocks.push({ type: "divider" });
    return blocks;
  });
}

function buildScheduleAdminModalView({ schedules }) {
  return {
    type: "modal",
    callback_id: "schedule_admin_root",
    title: { type: "plain_text", text: "Yoga Schedules" },
    close: { type: "plain_text", text: "Close" },
    blocks: [
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: ACTION_IDS.scheduleAdminAddOpen,
            text: { type: "plain_text", text: "Add schedule" },
            style: "primary",
            value: "open_add",
          },
        ],
      },
      { type: "divider" },
      ...buildScheduleBlocks(schedules),
    ],
  };
}

function buildAdminHomeView({ schedules, authorized }) {
  if (!authorized) {
    return {
      type: "home",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "이 워크스페이스에서는 일부 사용자만 스케줄 관리 기능을 사용할 수 있어요.",
          },
        },
      ],
    };
  }

  return {
    type: "home",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Yoga Scheduler*\nApp Home에서 스케줄을 확인하고 바로 관리할 수 있어요.",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: ACTION_IDS.scheduleAdminAddOpen,
            text: { type: "plain_text", text: "Add schedule" },
            style: "primary",
            value: "open_add",
          },
        ],
      },
      { type: "divider" },
      ...buildScheduleBlocks(schedules),
    ],
  };
}

function getDefaultDraft(defaultTimezone = "Asia/Seoul") {
  return {
    type: "class",
    cron: "",
    message: "",
    mode: "weekly",
    name: "",
    target: "production",
    time: "09:00",
    timezone: defaultTimezone,
    weekdays: ["monday"],
  };
}

function normalizeDraftValues(values = {}, defaultTimezone = "Asia/Seoul") {
  const normalizedTarget = String(values.target || "").trim().toLowerCase();
  return {
    ...getDefaultDraft(defaultTimezone),
    ...values,
    weekdays: normalizeWeekdays(values.weekdays ?? values.weekday ?? ["monday"]),
    type: Object.hasOwn(SCHEDULE_TYPES, values.type) ? values.type : "class",
    mode: values.mode === "cron" ? "cron" : "weekly",
    target: normalizedTarget === "test" ? "test" : "production",
    timezone: ["Asia/Seoul", "UTC"].includes(values.timezone) ? values.timezone : defaultTimezone,
  };
}

function buildModeInput(values) {
  return {
    type: "input",
    block_id: BLOCK_IDS.mode,
    dispatch_action: true,
    label: { type: "plain_text", text: "Input mode" },
    element: {
      type: "static_select",
      action_id: ACTION_IDS.scheduleModeChanged,
      initial_option: getStaticSelectOption(MODE_OPTIONS, values.mode, "Weekly"),
      options: MODE_OPTIONS.map((option) => optionFor(option.value, option.label)),
    },
  };
}

function buildTimezoneInput(values) {
  return {
    type: "input",
    block_id: BLOCK_IDS.timezone,
    label: { type: "plain_text", text: "Timezone" },
    element: {
      type: "static_select",
      action_id: "value",
      initial_option: getStaticSelectOption(
        TIMEZONE_OPTIONS,
        values.timezone,
        values.timezone || "Asia/Seoul"
      ),
      options: TIMEZONE_OPTIONS.map((option) => optionFor(option.value, option.label)),
    },
  };
}

function buildWeeklyInputs(values) {
  return [
    {
      type: "input",
      block_id: BLOCK_IDS.weekday,
      label: { type: "plain_text", text: "요일 (여러 개 선택 가능)" },
      element: {
        type: "checkboxes",
        action_id: "value",
        ...(values.weekdays.length ? { initial_options: WEEKDAY_OPTIONS
          .filter((option) => values.weekdays.includes(option.value))
          .map((option) => optionFor(option.value, option.label)) } : {}),
        options: WEEKDAY_OPTIONS.map((option) => optionFor(option.value, option.label)),
      },
    },
    {
      type: "input",
      block_id: BLOCK_IDS.time,
      label: { type: "plain_text", text: "시간 (HH:mm)" },
      hint: { type: "plain_text", text: "24시간 형식으로 분까지 입력해 주세요. 예: 09:35, 18:07" },
      element: {
        type: "plain_text_input",
        action_id: "value",
        placeholder: { type: "plain_text", text: "09:35" },
        min_length: 5,
        max_length: 5,
        initial_value: values.time || "",
      },
    },
  ];
}

function buildCronInput(values) {
  return {
    type: "input",
    block_id: BLOCK_IDS.cron,
    label: { type: "plain_text", text: "Cron" },
    element: {
      type: "plain_text_input",
      action_id: "value",
      initial_value: values.cron || "",
      placeholder: { type: "plain_text", text: "0 9 * * 1" },
    },
  };
}

function buildAddScheduleModalView({
  defaultTimezone = "Asia/Seoul",
  metadata = {},
  values = {},
}) {
  const draft = normalizeDraftValues(values, defaultTimezone);
  const blocks = [
    {
      type: "input",
      block_id: BLOCK_IDS.name,
      label: { type: "plain_text", text: "Job name" },
      element: {
        type: "plain_text_input",
        action_id: "value",
        initial_value: draft.name,
        max_length: 100,
        placeholder: { type: "plain_text", text: "Lunch Yoga Monday" },
      },
    },
    {
      type: "input", block_id: BLOCK_IDS.type,
      label: { type: "plain_text", text: "일정 유형" },
      element: { type: "static_select", action_id: "value",
        initial_option: optionFor(draft.type, SCHEDULE_TYPES[draft.type]),
        options: Object.entries(SCHEDULE_TYPES).map(([value, label]) => optionFor(value, label)),
      },
    },
    buildModeInput(draft),
    buildTimezoneInput(draft),
    ...(draft.mode === "cron" ? [buildCronInput(draft)] : buildWeeklyInputs(draft)),
    {
      type: "input",
      block_id: BLOCK_IDS.message,
      optional: true,
      hint: { type: "plain_text", text: "수업·생활습관은 필수입니다. 주간 동향은 안내 문구이며 순위는 자동으로 생성됩니다." },
      label: { type: "plain_text", text: "Message" },
      element: {
        type: "plain_text_input",
        action_id: "value",
        initial_value: draft.message,
        max_length: 2500,
        multiline: true,
        placeholder: { type: "plain_text", text: "아쉬탕가 @ 11:30, 4층 Idea Hub" },
      },
    },
    buildTargetInput(draft.target),
  ];

  return {
    type: "modal",
    callback_id: CALLBACK_IDS.scheduleAdd,
    private_metadata: JSON.stringify(metadata),
    title: { type: "plain_text", text: "Add Schedule" },
    submit: { type: "plain_text", text: "Confirm" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

function buildTargetInput(target) {
  return {
    type: "input", block_id: BLOCK_IDS.target,
    label: { type: "plain_text", text: "발송 채널" },
    element: { type: "static_select", action_id: "value",
      initial_option: optionFor(target, target === "test" ? "Test Channel" : "Production Channel"),
      options: [optionFor("production", "Production Channel"), optionFor("test", "Test Channel")],
    },
  };
}

function buildSendModalView({ schedules, requestChannelId, target = "production" }) {
  return {
    type: "modal", callback_id: CALLBACK_IDS.scheduleSend,
    private_metadata: JSON.stringify({ requestChannelId }),
    title: { type: "plain_text", text: "즉시 발송" },
    submit: { type: "plain_text", text: "발송" },
    close: { type: "plain_text", text: "취소" },
    blocks: [
      {
        type: "input", block_id: BLOCK_IDS.sendSchedule,
        label: { type: "plain_text", text: "일정 선택" },
        element: { type: "static_select", action_id: "value",
          placeholder: { type: "plain_text", text: "수업·생활습관·주간 동향" },
          options: schedules.map((schedule) => optionFor(schedule.id,
            truncateText(`${SCHEDULE_TYPES[schedule.type || "class"]} · ${schedule.name}`, 75))),
        },
      },
      buildTargetInput(target),
      { type: "context", elements: [{ type: "mrkdwn", text: "선택한 채널에 지금 한 번 발송합니다. 예약 일정은 그대로 유지됩니다." }] },
    ],
  };
}

function getStateAction(values, blockId, actionId = "value") {
  return values[blockId] && values[blockId][actionId] ? values[blockId][actionId] : null;
}

function extractScheduleDraftFromState(stateValues, defaultTimezone = "Asia/Seoul") {
  const values = stateValues || {};
  const days = getStateAction(values, BLOCK_IDS.weekday) || {};
  const time = getStateAction(values, BLOCK_IDS.time) || {};
  return normalizeDraftValues(
    {
      type: ((getStateAction(values, BLOCK_IDS.type) || {}).selected_option || {}).value || "class",
      cron: (getStateAction(values, BLOCK_IDS.cron) || {}).value || "",
      message: (getStateAction(values, BLOCK_IDS.message) || {}).value || "",
      mode:
        ((getStateAction(values, BLOCK_IDS.mode, ACTION_IDS.scheduleModeChanged) || {}).selected_option || {})
          .value || "",
      name: (getStateAction(values, BLOCK_IDS.name) || {}).value || "",
      target: ((getStateAction(values, BLOCK_IDS.target) || {}).selected_option || {}).value || "",
      time: time.value ?? time.selected_time ?? "",
      timezone: ((getStateAction(values, BLOCK_IDS.timezone) || {}).selected_option || {}).value || "",
      weekdays: days.selected_options?.map((option) => option.value)
        ?? (days.selected_option ? [days.selected_option.value] : []),
    },
    defaultTimezone
  );
}

function extractScheduleFormValues(view, defaultTimezone = "Asia/Seoul") {
  return extractScheduleDraftFromState(view.state.values, defaultTimezone);
}

function extractSendSelection(view) {
  const values = view.state.values;
  return {
    scheduleId: getStateAction(values, BLOCK_IDS.sendSchedule)?.selected_option?.value,
    target: getStateAction(values, BLOCK_IDS.target)?.selected_option?.value,
  };
}

module.exports = {
  ACTION_IDS,
  BLOCK_IDS,
  CALLBACK_IDS,
  CREATE_TIMEZONE_OPTIONS: TIMEZONE_OPTIONS.map((option) => option.value),
  WEEKDAY_OPTIONS,
  buildAddScheduleModalView,
  buildAdminHomeView,
  buildScheduleAdminModalView,
  buildSendModalView,
  extractScheduleDraftFromState,
  extractScheduleFormValues,
  extractSendSelection,
  getDefaultDraft,
  isAdminUser,
  parseAdminUserIds,
};
