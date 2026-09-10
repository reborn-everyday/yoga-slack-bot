const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHabitSummary } = require("../src/habit-summary");

function row(date, userId = "U1", overrides = {}) {
  return { date, userId, scheduleId: "walk", target: "production", status: "done",
    timestamp: `${date}T00:00:00.000Z`, ...overrides };
}

test("weekly and monthly totals cross month boundaries independently and isolate environments", () => {
  const records = [
    row("2026-08-30"), // outside last week
    row("2026-08-31"), row("2026-09-01"), row("2026-09-06"), row("2026-09-07"),
    row("2026-09-08"), // future
    row("2026-09-01", "U2", { target: "test" }),
    row("2026-09-01", "U1", { scheduleId: "stretch" }),
    row("2026-09-02", "U2", { status: "cancelled" }),
    row("2026-09-01"), // duplicate must not inflate totals
  ];
  const summary = buildHabitSummary(records, { target: "production", timezone: "Asia/Seoul" }, new Date("2026-09-07T01:00:00Z"));
  assert.equal(summary.weekly.start, "2026-08-31");
  assert.equal(summary.weekly.end, "2026-09-06");
  assert.equal(summary.monthly.start, "2026-09-01");
  assert.deepEqual(summary.weekly.ranking, [{ rank: 1, userId: "U1", count: 4 }]);
  assert.deepEqual(summary.monthly.ranking, [{ rank: 1, userId: "U1", count: 4 }]);
  assert.equal(buildHabitSummary(records, { target: "test", timezone: "Asia/Seoul" }, new Date("2026-09-07T01:00:00Z")).weekly.ranking[0].userId, "U2");
});

test("calendar boundaries use the selected timezone, including New Year and leap day", () => {
  const now = new Date("2026-12-31T16:00:00Z");
  const records = [row("2026-12-31"), row("2027-01-01", "U2", { timestamp: "2026-12-31T15:30:00Z" })];
  const seoul = buildHabitSummary(records, { target: "production", timezone: "Asia/Seoul" }, now);
  const utc = buildHabitSummary(records, { target: "production", timezone: "UTC" }, now);
  assert.equal(seoul.monthly.start, "2027-01-01");
  assert.equal(seoul.monthly.ranking[0].userId, "U2");
  assert.equal(utc.monthly.start, "2026-12-01");
  assert.equal(utc.monthly.ranking[0].userId, "U1");
  const leap = buildHabitSummary([row("2028-02-29")], { target: "production", timezone: "UTC" }, new Date("2028-03-06T09:00:00Z"));
  assert.equal(leap.weekly.start, "2028-02-28");
  assert.equal(leap.weekly.ranking[0].count, 1);
  assert.deepEqual(leap.monthly.ranking, []);
});

test("ties share ranks, at most ten people are shown, and latest cancellations win", () => {
  const records = Array.from({ length: 12 }, (_, index) => row("2026-09-01", `U${String(index).padStart(2, "0")}`));
  records.push(row("2026-09-02", "U00"));
  records.push(row("2026-09-01", "U01", { status: "cancelled", timestamp: "2026-09-03T00:00:00Z" }));
  const { weekly } = buildHabitSummary(records, { target: "production", timezone: "UTC" }, new Date("2026-09-07T00:00:00Z"));
  assert.equal(weekly.ranking.length, 10);
  assert.deepEqual(weekly.ranking[0], { rank: 1, userId: "U00", count: 2 });
  assert.equal(weekly.ranking[1].rank, 2);
  assert.equal(weekly.ranking[9].rank, 2);
  assert.equal(weekly.ranking.some((user) => user.userId === "U01"), false);
});
