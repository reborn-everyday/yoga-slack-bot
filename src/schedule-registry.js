class ScheduleRegistry {
  constructor({ cronLib, onTrigger, logger = console }) {
    this.cronLib = cronLib;
    this.onTrigger = onTrigger;
    this.logger = logger;
    this.jobs = new Map();
  }

  unregister(id) {
    const existing = this.jobs.get(id);
    if (existing && typeof existing.stop === "function") {
      existing.stop();
    }
    this.jobs.delete(id);
  }

  syncSchedule(schedule) {
    this.unregister(schedule.id);

    if (!schedule.enabled) return null;
    if (!this.cronLib.validate(schedule.cron)) {
      this.logger.warn(`Skipping invalid cron for schedule ${schedule.id}: ${schedule.cron}`);
      return null;
    }

    const job = this.cronLib.schedule(
      schedule.cron,
      () => {
        Promise.resolve(this.onTrigger(schedule)).catch((error) => {
          this.logger.error(`Failed to run schedule ${schedule.id}:`, error);
        });
      },
      { timezone: schedule.timezone }
    );

    this.jobs.set(schedule.id, job);
    return job;
  }

  syncAll(schedules) {
    const ids = new Set();
    for (const schedule of schedules) {
      ids.add(schedule.id);
      this.syncSchedule(schedule);
    }

    for (const id of [...this.jobs.keys()]) {
      if (!ids.has(id)) this.unregister(id);
    }
  }

  stopAll() {
    for (const id of [...this.jobs.keys()]) {
      this.unregister(id);
    }
  }
}

module.exports = {
  ScheduleRegistry,
};
