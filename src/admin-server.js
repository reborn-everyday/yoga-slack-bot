const crypto = require("crypto");
const http = require("http");

function json(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function text(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, cookie) => {
      const [name, ...rest] = cookie.split("=");
      acc[name] = rest.join("=");
      return acc;
    }, {});
}

function createSessionCookie(token) {
  return `admin_session=${token}; HttpOnly; Path=/; SameSite=Strict`;
}

function clearSessionCookie() {
  return "admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict";
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

class AdminSessionStore {
  constructor() {
    this.sessions = new Map();
  }

  create() {
    const token = crypto.randomUUID();
    this.sessions.set(token, { createdAt: Date.now() });
    return token;
  }

  has(token) {
    return Boolean(token && this.sessions.has(token));
  }

  delete(token) {
    if (token) this.sessions.delete(token);
  }
}

function createAdminRequestHandler({
  adminPassword,
  pageHtml,
  scheduleStore,
  sessionStore,
  onScheduleCreated,
  onScheduleDeleted,
  onScheduleToggled,
  serializeSchedule = (schedule) => schedule,
}) {
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const cookies = parseCookies(req.headers.cookie);
    const isAuthenticated = sessionStore.has(cookies.admin_session);

    try {
      if (req.method === "GET" && url.pathname === "/admin") {
        return text(res, 200, pageHtml);
      }

      if (req.method === "POST" && url.pathname === "/api/admin/session") {
        if (!adminPassword) {
          return json(res, 503, { error: "ADMIN_PASSWORD is not configured." });
        }

        const body = await readJsonBody(req);
        if (body.password !== adminPassword) {
          return json(res, 401, { error: "Invalid admin password." });
        }

        const token = sessionStore.create();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": createSessionCookie(token),
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "DELETE" && url.pathname === "/api/admin/session") {
        sessionStore.delete(cookies.admin_session);
        res.writeHead(204, { "Set-Cookie": clearSessionCookie() });
        res.end();
        return;
      }

      if (!isAuthenticated) {
        return json(res, 401, { error: "Admin session required." });
      }

      if (req.method === "GET" && url.pathname === "/api/schedules") {
        return json(res, 200, scheduleStore.list().map(serializeSchedule));
      }

      if (req.method === "POST" && url.pathname === "/api/schedules") {
        const body = await readJsonBody(req);
        const schedule = scheduleStore.create(body);
        if (onScheduleCreated) await onScheduleCreated(schedule);
        return json(res, 201, serializeSchedule(schedule));
      }

      if (
        req.method === "PATCH" &&
        /^\/api\/schedules\/[^/]+\/toggle$/.test(url.pathname)
      ) {
        const scheduleId = url.pathname.split("/")[3];
        const schedule = scheduleStore.toggle(scheduleId);
        if (onScheduleToggled) await onScheduleToggled(schedule);
        return json(res, 200, serializeSchedule(schedule));
      }

      if (
        req.method === "DELETE" &&
        /^\/api\/schedules\/[^/]+$/.test(url.pathname)
      ) {
        const scheduleId = url.pathname.split("/")[3];
        const schedule = scheduleStore.delete(scheduleId);
        if (onScheduleDeleted) await onScheduleDeleted(schedule);
        return json(res, 200, serializeSchedule(schedule));
      }

      return json(res, 404, { error: "Not found." });
    } catch (error) {
      if (error.code === "VALIDATION_ERROR") {
        return json(res, 400, { error: Object.values(error.fieldErrors).join(" ") });
      }
      if (error.code === "NOT_FOUND") {
        return json(res, 404, { error: error.message });
      }
      return json(res, 500, { error: error.message || "Internal server error." });
    }
  };
}

function startAdminServer(options) {
  const server = http.createServer(createAdminRequestHandler(options));
  return new Promise((resolve) => {
    server.listen(options.port, options.host || "0.0.0.0", () => resolve(server));
  });
}

module.exports = {
  AdminSessionStore,
  createAdminRequestHandler,
  startAdminServer,
};
