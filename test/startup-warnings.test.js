const test = require("node:test");
const assert = require("node:assert/strict");

const { logStartupWarnings } = require("../src/startup-warnings");

test("logStartupWarnings emits no warnings when required startup config is present", () => {
  const seen = [];
  const warnings = logStartupWarnings({
    productionChannelId: "C_PRODUCTION",
    testChannelId: "C_TEST",
    adminPassword: "secret",
    adminUserIds: new Set(["U1"]),
    logger: {
      warn(message) {
        seen.push(message);
      },
    },
  });

  assert.deepEqual(warnings, []);
  assert.deepEqual(seen, []);
});

test("logStartupWarnings covers the boot-time missing-config cases with production terminology", () => {
  const seen = [];
  const warnings = logStartupWarnings({
    productionChannelId: "",
    testChannelId: "",
    adminPassword: "",
    adminUserIds: new Set(),
    logger: {
      warn(message) {
        seen.push(message);
      },
    },
  });

  assert.deepEqual(warnings, [
    "⚠️ SLACK_CHANNEL_ID is missing. Sending to the production environment is unavailable.",
    "⚠️ SLACK_TEST_CHANNEL_ID is missing. Sending to the test environment is unavailable.",
    "⚠️ ADMIN_PASSWORD is missing. The built-in admin page will reject logins.",
    "⚠️ SCHEDULE_ADMIN_USER_IDS is empty. Slack schedule management is disabled.",
  ]);
  assert.deepEqual(seen, warnings);
});
