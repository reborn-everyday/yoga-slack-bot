function countAdminUsers(adminUserIds) {
  if (!adminUserIds) return 0;
  if (typeof adminUserIds.size === "number") return adminUserIds.size;
  if (Array.isArray(adminUserIds)) return adminUserIds.length;
  return new Set(adminUserIds).size;
}

function logStartupWarnings({
  productionChannelId,
  testChannelId,
  adminPassword,
  adminUserIds,
  logger = console,
}) {
  const warnings = [];

  if (!productionChannelId) {
    warnings.push("⚠️ SLACK_CHANNEL_ID is missing. Production schedules will be skipped.");
  }

  if (!testChannelId) {
    warnings.push("⚠️ SLACK_TEST_CHANNEL_ID is missing. Test schedules and /yoga test will be unavailable.");
  }

  if (!adminPassword) {
    warnings.push("⚠️ ADMIN_PASSWORD is missing. The built-in admin page will reject logins.");
  }

  if (countAdminUsers(adminUserIds) === 0) {
    warnings.push("⚠️ SCHEDULE_ADMIN_USER_IDS is empty. Slack schedule management is disabled.");
  }

  for (const warning of warnings) {
    logger.warn(warning);
  }

  return warnings;
}

module.exports = {
  logStartupWarnings,
};
