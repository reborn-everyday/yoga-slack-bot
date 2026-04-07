const fs = require("fs");

const { ensureDirectoryForFile, readJsonFile } = require("./utils");

class AnnouncementStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.announcements = new Map();
  }

  initialize() {
    ensureDirectoryForFile(this.filePath);
    const data = readJsonFile(this.filePath, {});
    for (const [key, value] of Object.entries(data || {})) {
      this.announcements.set(key, value);
    }
  }

  makeKey(scheduleId, occurrenceDate) {
    return `${scheduleId}:${occurrenceDate}`;
  }

  save() {
    ensureDirectoryForFile(this.filePath);
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(Object.fromEntries(this.announcements.entries()), null, 2)
    );
  }

  set(announcement) {
    const key = this.makeKey(announcement.scheduleId, announcement.occurrenceDate);
    this.announcements.set(key, announcement);
    this.save();
  }

  get(scheduleId, occurrenceDate) {
    return this.announcements.get(this.makeKey(scheduleId, occurrenceDate)) || null;
  }
}

module.exports = {
  AnnouncementStore,
};
