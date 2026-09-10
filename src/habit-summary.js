const { getDateString, getTimestampString } = require("./utils");

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function rankParticipants(records) {
  const totals = new Map();
  for (const row of records) {
    totals.set(row.userId, (totals.get(row.userId) || 0) + 1);
  }
  const sorted = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  let rank = 0;
  return sorted.slice(0, 10).map(([userId, count], index) => {
    if (index === 0 || count !== sorted[index - 1][1]) rank = index + 1;
    return { rank, userId, count };
  });
}

function buildHabitSummary(records, { target, timezone }, now = new Date()) {
  const today = getDateString(timezone, now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const thisMonday = shiftDate(today, -((weekday + 6) % 7));
  const lastMonday = shiftDate(thisMonday, -7);
  const monthStart = `${today.slice(0, 7)}-01`;
  // One record per environment / schedule / local date / user. If an imported
  // sheet contains duplicates, use the latest state instead of counting twice.
  const unique = new Map();
  for (const row of records) {
    if (row.target !== target || !row.userId || !row.scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    if (row.timestamp && new Date(row.timestamp) > now) continue;
    const key = JSON.stringify([row.scheduleId, row.date, row.userId]);
    const previous = unique.get(key);
    if (!previous || row.timestamp >= previous.timestamp) unique.set(key, row);
  }
  const active = [...unique.values()].filter((row) => row.status === "done");
  return {
    asOf: getTimestampString(timezone, now), timezone,
    weekly: {
      start: lastMonday, end: shiftDate(thisMonday, -1),
      ranking: rankParticipants(active.filter((row) => row.date >= lastMonday && row.date < thisMonday)),
    },
    monthly: {
      start: monthStart, end: today,
      ranking: rankParticipants(active.filter((row) => row.date >= monthStart && row.date <= today)),
    },
  };
}

module.exports = { buildHabitSummary };
