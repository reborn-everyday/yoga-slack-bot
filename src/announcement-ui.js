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
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🧘 *오늘 요가할 사람!*\n>${detail}`,
      },
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

function buildOpenBlocksWithAttendees(detail, attendees, context) {
  const blocks = buildOpenBlocks(detail, context);

  let text;
  if (attendees.length === 0) {
    text = "*참석자:* 아직 없음";
  } else {
    const names = attendees.map((attendee) => {
      const mention = `<@${attendee.userId}>`;
      return attendee.status === "late" ? `${mention}(늦참)` : mention;
    });
    text = `*참석자 (${attendees.length}명):* ${names.join(", ")}`;
  }

  blocks.splice(1, 0, {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  });

  return blocks;
}

module.exports = {
  buildAttendBlocks,
  buildCancelBlocks,
  buildInterestBlocks,
  buildOpenBlocksWithAttendees,
  decodeAnnouncementContext,
  encodeAnnouncementContext,
};
