const crypto = require("crypto");
const { getDateString } = require("./utils");
const { buildAnnouncementMessage } = require("./announcement-ui");
const { buildHabitSummary } = require("./habit-summary");

function announcementContext(announcement) {
  const { scheduleId, occurrenceDate, jobName, timezone, occurrenceId, type, target } = announcement;
  return { scheduleId, occurrenceDate, jobName, timezone, occurrenceId, type: type || "class",
    target: target || (scheduleId.startsWith("test:") ? "test" : "production") };
}

class AnnouncementService {
  constructor({ client, store, attendance, resolveChannel, clock = () => new Date(), logger = console }) {
    Object.assign(this, { client, store, attendance, resolveChannel, clock, logger });
    this.pending = Promise.resolve();
    this.processedActions = new Set();
  }

  // Serialise writes and message refreshes together, including resends, so a
  // slower Sheets response cannot overwrite a newer list of participants.
  run(task) {
    const result = this.pending.then(task);
    this.pending = result.catch(() => {});
    return result;
  }

  async participants(context) {
    if (context.type !== "habit") return this.attendance.getAttendees(context);
    const records = await this.attendance.getHabitRecords();
    return records.filter((row) => row.target === context.target && row.scheduleId === context.scheduleId &&
      row.date === context.occurrenceDate && row.status === "done");
  }

  send(schedule, { target = schedule.target, channel = this.resolveChannel(target) } = {}) {
    return this.run(async () => {
      if (!["production", "test"].includes(target)) throw new Error("발송 환경을 선택해 주세요.");
      if (!channel) throw new Error(`Slack ${target} 채널이 설정되지 않았어요.`);
      const now = this.clock();
      const type = schedule.type || "class";
      const context = {
        // Preserve Attendance's existing production IDs and historical test prefix.
        scheduleId: type === "class" && target === "test" ? `test:${schedule.id}` : schedule.id,
        occurrenceDate: getDateString(schedule.timezone, now),
        jobName: schedule.name, timezone: schedule.timezone,
        occurrenceId: crypto.randomUUID(), type, target,
      };
      const attendees = type === "report" ? [] : await this.participants(context);
      const summary = type === "report"
        ? buildHabitSummary(await this.attendance.getHabitRecords(), context, now) : null;
      const message = buildAnnouncementMessage(schedule.message, context, attendees, summary);
      const result = await this.client.chat.postMessage({ channel, ...message });
      this.store.set({ ...context, channel, detail: schedule.message, ts: result.ts });
      return result;
    });
  }

  participate(rawContext, user, status, actionId) {
    return this.run(async () => {
      const context = announcementContext(rawContext);
      if (context.type === "report") throw new Error("주간 동향에는 참여할 수 없어요.");
      if (actionId && this.processedActions.has(actionId)) return { duplicate: true };
      let result;
      if (context.type === "habit") {
        result = await this.attendance.toggleHabit(context, user, this.clock());
      } else if (status === "cancelled") {
        result = await this.attendance.deleteAttendance({ ...context, userId: user.id }) ? "cancelled" : "absent";
      } else {
        await this.attendance.appendAttendance({ ...context, userId: user.id,
          userName: user.username || user.name || user.id, status });
        result = status;
      }
      if (actionId) {
        this.processedActions.add(actionId);
        if (this.processedActions.size > 1000) this.processedActions.delete(this.processedActions.values().next().value);
      }
      const announcements = this.store.find(context);
      let refreshFailed = false;
      try {
        const attendees = await this.participants(context);
        const updates = await Promise.allSettled(announcements.map((announcement) => this.client.chat.update({
          channel: announcement.channel, ts: announcement.ts,
          ...buildAnnouncementMessage(announcement.detail, announcementContext(announcement), attendees),
        })));
        refreshFailed = updates.some((update) => update.status === "rejected");
        for (const update of updates) if (update.status === "rejected") this.logger.error("Failed to refresh announcement:", update.reason);
      } catch (error) {
        refreshFailed = true;
        this.logger.error("Failed to load participants:", error);
      }
      return { status: result, refreshFailed };
    });
  }
}

module.exports = { AnnouncementService };
