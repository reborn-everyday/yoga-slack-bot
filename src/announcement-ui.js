function encodeAnnouncementContext(context) {
  return JSON.stringify(context);
}

function decodeAnnouncementContext(value) {
  try {
    const parsed = JSON.parse(value);
    if (
      parsed &&
      typeof parsed.scheduleId === "string" &&
      typeof parsed.occurrenceDate === "string"
    ) {
      return parsed;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function buildInterestBlocks(context) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "오늘 요가할 사람!" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "저요!" },
          action_id: "yoga_interest",
          value: encodeAnnouncementContext(context),
        },
      ],
    },
  ];
}

function buildAttendBlocks(context) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "오늘 참여 형태를 선택해 주세요." },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "참석" },
          action_id: "yoga_attend",
          value: encodeAnnouncementContext(context),
          style: "primary",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "늦참" },
          action_id: "yoga_late",
          value: encodeAnnouncementContext(context),
        },
      ],
    },
  ];
}

function buildCancelBlocks(context) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "참석 등록이 완료됐어요." },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "취소" },
          action_id: "yoga_cancel",
          value: encodeAnnouncementContext(context),
          style: "danger",
        },
      ],
    },
  ];
}

function buildOpenBlocks(detail, context) {
  const habit = context.type === "habit";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${habit ? "🌱 *생활습관 실천*" : "🧘 *오늘 요가할 사람!*"}\n>${detail}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: habit ? "실천했어요" : "저요!" },
          action_id: habit ? "yoga_habit" : "yoga_interest",
          value: encodeAnnouncementContext(context),
        },
      ],
    },
  ];
}

function buildOpenBlocksWithAttendees(detail, attendees, context) {
  const blocks = buildOpenBlocks(detail, context);
  const label = context.type === "habit" ? "참여자" : "참석자";

  let text;
  if (attendees.length === 0) {
    text = `*${label}:* 아직 없음`;
  } else {
    const names = attendees.map((attendee) => {
      const mention = `<@${attendee.userId}>`;
      return attendee.status === "late" ? `${mention}(늦참)` : mention;
    });
    text = `*${label} (${attendees.length}명):* ${names.join(", ")}`;
  }

  blocks.splice(1, 0, {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  });

  if (context.type === "habit") blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "같은 생활습관은 하루 1회 집계해요. 다시 누르면 취소돼요." }],
  });

  return blocks;
}

function buildAnnouncementMessage(detail, context, attendees = [], summary = null) {
  if (context.type !== "report") {
    return {
      text: `${context.type === "habit" ? "🌱 생활습관 실천" : "🧘 요가무리 클래스 오픈"}\n${detail}`,
      blocks: buildOpenBlocksWithAttendees(detail, attendees, context),
    };
  }
  const sections = ["📊 *생활습관 주간 동향*", detail].filter(Boolean);
  for (const [key, title] of [["weekly", "지난주"], ["monthly", "이번 달"]]) {
    const period = summary[key];
    const ranking = period.ranking.length
      ? period.ranking.map((row) => `${row.rank}위 · <@${row.userId}> · ${row.count}회`).join("\n")
      : "아직 참여 기록이 없습니다.";
    sections.push(`*${title} 순위 (${period.start} ~ ${period.end})*\n${ranking}`);
  }
  sections.push(`집계 기준: ${summary.asOf} (${summary.timezone})\n생활습관별 하루 1회 · 공동 순위 · 최대 10명`);
  return {
    text: sections.join("\n\n"),
    blocks: sections.map((text) => ({ type: "section", text: { type: "mrkdwn", text } })),
  };
}

module.exports = {
  buildAnnouncementMessage,
  buildAttendBlocks,
  buildCancelBlocks,
  buildInterestBlocks,
  buildOpenBlocksWithAttendees,
  decodeAnnouncementContext,
  encodeAnnouncementContext,
};
