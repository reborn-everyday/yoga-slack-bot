const test = require("node:test");
const assert = require("node:assert/strict");

const { ScheduleRegistry } = require("../src/schedule-registry");

test("ScheduleRegistry registers enabled schedules and unregisters disabled ones", async () => {
  const scheduled = [];
  const stopped = [];
  const triggered = [];

  const cronLib = {
    validate(expression) {
      return expression !== "bad";
    },
    schedule(expression, fn, options) {
      scheduled.push({ expression, fn, options });
      return {
        stop() {
          stopped.push(expression);
        },
      };
    },
  };

  const registry = new ScheduleRegistry({
    cronLib,
    onTrigger: async (schedule) => {
      triggered.push(schedule.id);
    },
  });

  registry.syncAll([
    {
      id: "one",
      enabled: true,
      cron: "0 9 * * 1",
      timezone: "Asia/Seoul",
    },
    {
      id: "two",
      enabled: false,
      cron: "0 9 * * 2",
      timezone: "Asia/Seoul",
    },
  ]);

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].options.timezone, "Asia/Seoul");

  await scheduled[0].fn();
  assert.deepEqual(triggered, ["one"]);

  registry.syncSchedule({
    id: "one",
    enabled: false,
    cron: "0 9 * * 1",
    timezone: "Asia/Seoul",
  });

  assert.deepEqual(stopped, ["0 9 * * 1"]);

  registry.syncSchedule({
    id: "bad",
    enabled: true,
    cron: "bad",
    timezone: "Asia/Seoul",
  });

  assert.equal(scheduled.length, 1);
});
