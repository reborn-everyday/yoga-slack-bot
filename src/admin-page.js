function renderAdminPage({ defaultTimezone = "Asia/Seoul" } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Yoga Scheduler</title>
    <style>
      :root {
        --bg: #f6f1e8;
        --panel: rgba(255, 252, 247, 0.88);
        --panel-strong: #fffdf8;
        --ink: #1f2a21;
        --muted: #617160;
        --line: rgba(42, 58, 44, 0.14);
        --accent: #c55d32;
        --good: #2f7d4a;
        --bad: #a33c33;
        --shadow: 0 30px 80px rgba(63, 44, 24, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(255, 203, 136, 0.45), transparent 28%),
          radial-gradient(circle at bottom right, rgba(132, 166, 117, 0.24), transparent 34%),
          linear-gradient(160deg, #f8f2e7 0%, #efe5d3 100%);
      }

      .shell {
        width: min(1220px, calc(100% - 32px));
        margin: 32px auto;
        padding: 28px;
        border-radius: 28px;
        background: var(--panel);
        border: 1px solid rgba(255, 255, 255, 0.6);
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }

      .hero {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 24px;
      }

      h1,
      h2,
      h3 {
        margin: 0;
      }

      h1 {
        font-size: clamp(2rem, 3vw, 3rem);
        line-height: 1;
      }

      .subtle {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .panel {
        background: var(--panel-strong);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
      }

      .toolbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 18px;
        flex-wrap: wrap;
      }

      .status {
        min-height: 20px;
        margin: 0 0 14px;
        color: var(--muted);
      }

      .status.error {
        color: var(--bad);
      }

      .status.success {
        color: var(--good);
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        cursor: pointer;
        transition: transform 140ms ease, opacity 140ms ease, background 140ms ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
        transform: none;
      }

      .primary {
        background: var(--accent);
        color: white;
      }

      .ghost {
        background: rgba(197, 93, 50, 0.09);
        color: var(--accent);
      }

      .toggle-on {
        background: rgba(47, 125, 74, 0.14);
        color: var(--good);
      }

      .toggle-off {
        background: rgba(31, 42, 33, 0.08);
        color: var(--ink);
      }

      .danger {
        background: rgba(163, 60, 51, 0.12);
        color: var(--bad);
      }

      form.login {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }

      .login input {
        min-width: 240px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        text-align: left;
        vertical-align: top;
        padding: 14px 12px;
        border-top: 1px solid var(--line);
      }

      th {
        font-size: 0.8rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .empty {
        padding: 28px 12px;
        color: var(--muted);
      }

      .message {
        white-space: pre-wrap;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        background: rgba(197, 93, 50, 0.1);
        color: var(--accent);
        font-size: 0.85rem;
      }

      .enabled {
        background: rgba(47, 125, 74, 0.13);
        color: var(--good);
      }

      .schedule-main {
        font-weight: 600;
      }

      .schedule-meta,
      .channel-meta {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .draft-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .draft-grid .full {
        grid-column: 1 / -1;
      }

      label {
        display: block;
        font-weight: 600;
      }

      .field-note {
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.9rem;
        font-weight: 400;
      }

      input,
      select,
      textarea {
        width: 100%;
        margin-top: 8px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: white;
        padding: 10px 12px;
      }

      textarea {
        min-height: 110px;
        resize: vertical;
      }

      .draft-actions,
      .row-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .draft-actions {
        margin-top: 14px;
      }

      @media (max-width: 900px) {
        .shell {
          width: min(100% - 18px, 100%);
          margin: 12px auto;
          padding: 18px;
        }

        .draft-grid {
          grid-template-columns: 1fr;
        }

        table,
        thead,
        tbody,
        tr,
        th,
        td {
          display: block;
        }

        thead {
          display: none;
        }

        tr {
          border-top: 1px solid var(--line);
          padding: 10px 0;
        }

        td {
          border-top: 0;
          padding: 8px 0;
        }

        td::before {
          content: attr(data-label);
          display: block;
          font-size: 0.78rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <h1>Yoga Scheduler</h1>
        <button id="logoutButton" class="ghost" hidden>Log out</button>
      </header>

      <section id="authPanel" class="panel">
        <h2>Admin Access</h2>
        <p class="subtle">Sign in with the shared admin password to manage schedules.</p>
        <form id="loginForm" class="login">
          <input id="passwordInput" name="password" type="password" placeholder="Admin password" required />
          <button class="primary" type="submit">Log in</button>
        </form>
      </section>

      <section id="appPanel" class="panel" hidden>
        <div class="toolbar">
          <div>
            <h2>Saved schedules</h2>
            <p class="subtle">Enabled schedules are shown first.</p>
          </div>
          <button id="addRowButton" class="primary" type="button">Add a new schedule</button>
        </div>
        <p id="status" class="status"></p>
        <div id="draftPanel"></div>
        <table>
          <thead>
            <tr>
              <th>Job name</th>
              <th>Schedule</th>
              <th>Slack channel</th>
              <th>Message</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="scheduleBody"></tbody>
        </table>
      </section>
    </main>

    <script>
      const DEFAULT_TIMEZONE = ${JSON.stringify(defaultTimezone)};
      const TIMEZONE_OPTIONS = [
        { label: "Asia/Seoul", value: "Asia/Seoul" },
        { label: "UTC", value: "UTC" },
      ];
      const WEEKDAY_OPTIONS = [
        { label: "Monday", value: "monday" },
        { label: "Tuesday", value: "tuesday" },
        { label: "Wednesday", value: "wednesday" },
        { label: "Thursday", value: "thursday" },
        { label: "Friday", value: "friday" },
        { label: "Saturday", value: "saturday" },
        { label: "Sunday", value: "sunday" },
      ];

      const state = {
        draft: null,
        schedules: [],
      };

      const authPanel = document.getElementById("authPanel");
      const appPanel = document.getElementById("appPanel");
      const loginForm = document.getElementById("loginForm");
      const passwordInput = document.getElementById("passwordInput");
      const scheduleBody = document.getElementById("scheduleBody");
      const addRowButton = document.getElementById("addRowButton");
      const statusNode = document.getElementById("status");
      const logoutButton = document.getElementById("logoutButton");
      const draftPanel = document.getElementById("draftPanel");

      function getDefaultDraft() {
        return {
          mode: "weekly",
          name: "",
          timezone: DEFAULT_TIMEZONE,
          weekday: "monday",
          time: "",
          cron: "",
          message: "",
          target: "production",
        };
      }

      function setStatus(message, tone) {
        statusNode.textContent = message || "";
        statusNode.className = tone ? "status " + tone : "status";
      }

      function setAuthorized(authorized) {
        authPanel.hidden = authorized;
        appPanel.hidden = !authorized;
        logoutButton.hidden = !authorized;
        if (!authorized) {
          state.draft = null;
          renderDraft();
        }
      }

      function formatWeekday(value) {
        const match = WEEKDAY_OPTIONS.find((option) => option.value === value);
        return match ? match.label : value;
      }

      function buildPayloadFromDraft(draft) {
        return {
          mode: draft.mode,
          name: draft.name,
          timezone: draft.timezone,
          weekday: draft.mode === "weekly" ? draft.weekday : "",
          time: draft.mode === "weekly" ? draft.time : "",
          cron: draft.mode === "cron" ? draft.cron : "",
          message: draft.message,
          target: draft.target,
        };
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
        });

        if (response.status === 204) return null;

        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        if (!response.ok) {
          const message =
            body && typeof body === "object" && body.error ? body.error : String(body || "Request failed.");
          const error = new Error(message);
          error.status = response.status;
          throw error;
        }

        return body;
      }

      function createCell(label, content) {
        const cell = document.createElement("td");
        cell.dataset.label = label;
        if (content instanceof Node) {
          cell.appendChild(content);
        } else {
          cell.textContent = content;
        }
        return cell;
      }

      function buildSelect(options, value, onChange) {
        const select = document.createElement("select");
        for (const option of options) {
          const node = document.createElement("option");
          node.value = option.value;
          node.textContent = option.label;
          select.appendChild(node);
        }
        select.value = value;
        select.addEventListener("change", onChange);
        return select;
      }

      function renderSchedules() {
        scheduleBody.innerHTML = "";

        if (state.schedules.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 6;
          cell.className = "empty";
          cell.textContent = "No schedules yet. Add the first one above.";
          row.appendChild(cell);
          scheduleBody.appendChild(row);
          return;
        }

        for (const schedule of state.schedules) {
          const row = document.createElement("tr");
          row.appendChild(createCell("Job name", schedule.name));

          const scheduleNode = document.createElement("div");
          const scheduleMain = document.createElement("div");
          scheduleMain.className = "schedule-main";
          scheduleMain.textContent =
            schedule.scheduleMode === "weekly" && schedule.weekday && schedule.time
              ? formatWeekday(schedule.weekday) + " " + schedule.time
              : "Cron: " + schedule.cron;
          const scheduleMeta = document.createElement("span");
          scheduleMeta.className = "schedule-meta";
          scheduleMeta.textContent = schedule.timezone;
          scheduleNode.append(scheduleMain, scheduleMeta);
          row.appendChild(createCell("Schedule", scheduleNode));

          const channelNode = document.createElement("div");
          channelNode.textContent = schedule.channelDisplay || (schedule.target === "test" ? "Test Channel" : "Production Channel");
          row.appendChild(createCell("Slack channel", channelNode));

          const messageNode = document.createElement("div");
          messageNode.className = "message";
          messageNode.textContent = schedule.message;
          row.appendChild(createCell("Message", messageNode));

          const status = document.createElement("span");
          status.className = schedule.enabled ? "pill enabled" : "pill";
          status.textContent = schedule.enabled ? "On" : "Off";
          row.appendChild(createCell("Status", status));

          const actionCell = document.createElement("td");
          actionCell.dataset.label = "Actions";
          const actions = document.createElement("div");
          actions.className = "row-actions";

          const toggleButton = document.createElement("button");
          toggleButton.className = schedule.enabled ? "toggle-on" : "toggle-off";
          toggleButton.textContent = schedule.enabled ? "Turn off" : "Turn on";
          toggleButton.addEventListener("click", async () => {
            try {
              setStatus("Updating schedule...", "");
              await api("/api/schedules/" + schedule.id + "/toggle", { method: "PATCH" });
              await loadSchedules("Schedule updated.");
            } catch (error) {
              if (error.status === 401) {
                setAuthorized(false);
                setStatus("Your admin session expired.", "error");
                return;
              }
              setStatus(error.message, "error");
            }
          });

          const deleteButton = document.createElement("button");
          deleteButton.className = "danger";
          deleteButton.textContent = "Delete";
          deleteButton.addEventListener("click", async () => {
            if (!window.confirm('Delete "' + schedule.name + '"?')) return;
            try {
              setStatus("Deleting schedule...", "");
              await api("/api/schedules/" + schedule.id, { method: "DELETE" });
              await loadSchedules("Schedule deleted.");
            } catch (error) {
              if (error.status === 401) {
                setAuthorized(false);
                setStatus("Your admin session expired.", "error");
                return;
              }
              setStatus(error.message, "error");
            }
          });

          actions.append(toggleButton, deleteButton);
          actionCell.appendChild(actions);
          row.appendChild(actionCell);
          scheduleBody.appendChild(row);
        }
      }

      function renderDraft() {
        draftPanel.innerHTML = "";
        addRowButton.disabled = Boolean(state.draft);
        if (!state.draft) return;

        const wrapper = document.createElement("div");
        wrapper.className = "panel";

        const title = document.createElement("h3");
        title.textContent = "New schedule";
        wrapper.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "draft-grid";

        const nameField = document.createElement("label");
        nameField.textContent = "Job name";
        const nameInput = document.createElement("input");
        nameInput.value = state.draft.name;
        nameInput.placeholder = "Lunch Yoga Monday";
        nameInput.addEventListener("input", (event) => {
          state.draft.name = event.target.value;
        });
        nameField.appendChild(nameInput);
        grid.appendChild(nameField);

        const modeField = document.createElement("label");
        modeField.textContent = "Input mode";
        modeField.appendChild(
          buildSelect(
            [
              { label: "Weekly", value: "weekly" },
              { label: "Cron", value: "cron" },
            ],
            state.draft.mode,
            (event) => {
              state.draft.mode = event.target.value;
              renderDraft();
            }
          )
        );
        grid.appendChild(modeField);

        const timezoneField = document.createElement("label");
        timezoneField.textContent = "Timezone";
        timezoneField.appendChild(
          buildSelect(TIMEZONE_OPTIONS, state.draft.timezone, (event) => {
            state.draft.timezone = event.target.value;
          })
        );
        grid.appendChild(timezoneField);

        if (state.draft.mode === "weekly") {
          const weekdayField = document.createElement("label");
          weekdayField.textContent = "Day of the week";
          weekdayField.appendChild(
            buildSelect(WEEKDAY_OPTIONS, state.draft.weekday, (event) => {
              state.draft.weekday = event.target.value;
            })
          );
          grid.appendChild(weekdayField);

          const timeField = document.createElement("label");
          timeField.textContent = "Time";
          const timeInput = document.createElement("input");
          timeInput.type = "time";
          timeInput.value = state.draft.time;
          timeInput.addEventListener("input", (event) => {
            state.draft.time = event.target.value;
          });
          const timeNote = document.createElement("div");
          timeNote.className = "field-note";
          timeNote.textContent = "Use the weekly picker for normal schedules.";
          timeField.append(timeInput, timeNote);
          grid.appendChild(timeField);
        } else {
          const cronField = document.createElement("label");
          cronField.className = "full";
          cronField.textContent = "Cron";
          const cronInput = document.createElement("input");
          cronInput.value = state.draft.cron;
          cronInput.placeholder = "0 9 * * 1";
          cronInput.addEventListener("input", (event) => {
            state.draft.cron = event.target.value;
          });
          const cronNote = document.createElement("div");
          cronNote.className = "field-note";
          cronNote.textContent = "Raw cron is available for testing.";
          cronField.append(cronInput, cronNote);
          grid.appendChild(cronField);
        }

        const messageField = document.createElement("label");
        messageField.className = "full";
        messageField.textContent = "Message";
        const messageInput = document.createElement("textarea");
        messageInput.value = state.draft.message;
        messageInput.placeholder = "아쉬탕가 @ 11:30, 4층 Idea Hub";
        messageInput.addEventListener("input", (event) => {
          state.draft.message = event.target.value;
        });
        messageField.appendChild(messageInput);
        grid.appendChild(messageField);

        const targetField = document.createElement("label");
        targetField.textContent = "Slack channel target";
        targetField.appendChild(
          buildSelect(
            [
              { label: "Production Channel", value: "production" },
              { label: "Test Channel", value: "test" },
            ],
            state.draft.target,
            (event) => {
              state.draft.target = event.target.value;
            }
          )
        );
        grid.appendChild(targetField);

        wrapper.appendChild(grid);

        const actions = document.createElement("div");
        actions.className = "draft-actions";

        const confirmButton = document.createElement("button");
        confirmButton.className = "primary";
        confirmButton.textContent = "Confirm";
        confirmButton.addEventListener("click", async () => {
          try {
            setStatus("Registering schedule...", "");
            await api("/api/schedules", {
              method: "POST",
              body: JSON.stringify(buildPayloadFromDraft(state.draft)),
            });
            state.draft = null;
            renderDraft();
            await loadSchedules("Schedule registered.");
          } catch (error) {
            if (error.status === 401) {
              setAuthorized(false);
              setStatus("Your admin session expired.", "error");
              return;
            }
            setStatus(error.message, "error");
          }
        });

        const cancelButton = document.createElement("button");
        cancelButton.className = "ghost";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
          state.draft = null;
          renderDraft();
          setStatus("", "");
        });

        actions.append(confirmButton, cancelButton);
        wrapper.appendChild(actions);
        draftPanel.appendChild(wrapper);
      }

      async function loadSchedules(successMessage) {
        try {
          const schedules = await api("/api/schedules");
          state.schedules = schedules;
          setAuthorized(true);
          renderSchedules();
          if (successMessage) setStatus(successMessage, "success");
        } catch (error) {
          if (error.status === 401) {
            setAuthorized(false);
            renderSchedules();
            if (successMessage) setStatus("", "");
            return;
          }
          setStatus(error.message, "error");
        }
      }

      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await api("/api/admin/session", {
            method: "POST",
            body: JSON.stringify({ password: passwordInput.value }),
          });
          passwordInput.value = "";
          await loadSchedules("Signed in.");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      logoutButton.addEventListener("click", async () => {
        await api("/api/admin/session", { method: "DELETE" }).catch(() => null);
        setAuthorized(false);
        setStatus("Signed out.", "");
      });

      addRowButton.addEventListener("click", () => {
        state.draft = getDefaultDraft();
        renderDraft();
        setStatus("", "");
      });

      renderSchedules();
      renderDraft();
      loadSchedules();
    </script>
  </body>
</html>`;
}

module.exports = {
  renderAdminPage,
};
