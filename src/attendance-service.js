const { google } = require("googleapis");

const {
  columnNumberToLetter,
  getTimestampString,
  resolveHeaderMap,
} = require("./utils");

const HEADER_LABELS = {
  date: "date",
  scheduleId: "scheduleId",
  jobName: "jobName",
  userId: "userId",
  userName: "userName",
  status: "status",
  timestamp: "timestamp",
};

const HEADER_KEYS = Object.keys(HEADER_LABELS);

function extendHeaderRow(headerRow) {
  const nextHeader = [...headerRow];
  const headerMap = resolveHeaderMap(nextHeader);

  for (const key of HEADER_KEYS) {
    if (headerMap[key] === undefined) {
      headerMap[key] = nextHeader.length;
      nextHeader.push(HEADER_LABELS[key]);
    }
  }

  return {
    changed: nextHeader.length !== headerRow.length,
    headerMap,
    headerRow: nextHeader,
  };
}

function buildAttendanceRow({ totalColumns, headerMap, occurrenceDate, scheduleId, jobName, userId, userName, status, timestamp }) {
  const row = Array(totalColumns).fill("");
  row[headerMap.date] = occurrenceDate;
  row[headerMap.scheduleId] = scheduleId;
  row[headerMap.jobName] = jobName;
  row[headerMap.userId] = userId;
  row[headerMap.userName] = userName;
  row[headerMap.status] = status;
  row[headerMap.timestamp] = timestamp;
  return row;
}

class AttendanceService {
  constructor({
    spreadsheetId,
    range = "Attendance!A:E",
    defaultTimezone = "Asia/Seoul",
    credentialsLoader,
  }) {
    this.spreadsheetId = spreadsheetId;
    this.range = range;
    this.defaultTimezone = defaultTimezone;
    this.credentialsLoader = credentialsLoader;
  }

  isConfigured() {
    return Boolean(this.spreadsheetId && this.credentialsLoader);
  }

  async getSheetsClient() {
    if (!this.isConfigured()) {
      throw new Error("Missing Google Sheets configuration.");
    }

    const credentials = this.credentialsLoader();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    return google.sheets({ version: "v4", auth });
  }

  async loadSheetData() {
    const sheets = await this.getSheetsClient();
    const sheetName = this.range.split("!")[0] || "Attendance";
    const valuesResp = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:ZZ`,
    });

    const values = valuesResp.data.values || [];
    const header = values[0] || [];
    const { changed, headerMap, headerRow } = extendHeaderRow(header);

    if (changed) {
      const lastColLetter = columnNumberToLetter(headerRow.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1:${lastColLetter}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headerRow] },
      });
      values[0] = headerRow;
    }

    return {
      headerMap,
      sheetName,
      sheets,
      totalColumns: headerRow.length,
      values,
    };
  }

  async appendAttendance({ occurrenceDate, scheduleId, jobName, userId, userName, status, timezone }) {
    const { headerMap, sheetName, sheets, totalColumns, values } = await this.loadSheetData();
    const timestamp = getTimestampString(timezone || this.defaultTimezone);
    const rowValues = buildAttendanceRow({
      totalColumns,
      headerMap,
      occurrenceDate,
      scheduleId,
      jobName,
      userId,
      userName,
      status,
      timestamp,
    });

    let existingRowIndex = -1;
    for (let i = 1; i < values.length; i += 1) {
      const row = values[i] || [];
      const rowDate = row[headerMap.date];
      const rowScheduleId = row[headerMap.scheduleId];
      const rowUserId = row[headerMap.userId];
      if (rowDate === occurrenceDate && rowScheduleId === scheduleId && rowUserId === userId) {
        existingRowIndex = i;
        break;
      }
    }

    if (existingRowIndex >= 1) {
      const rowNumber = existingRowIndex + 1;
      const lastColLetter = columnNumberToLetter(totalColumns);
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A${rowNumber}:${lastColLetter}${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
      return;
    }

    const lastColLetter = columnNumberToLetter(totalColumns);
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:${lastColLetter}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowValues] },
    });
  }

  async deleteAttendance({ occurrenceDate, scheduleId, userId }) {
    const { headerMap, sheetName, sheets, values } = await this.loadSheetData();
    const rowsToDelete = [];

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i] || [];
      const rowDate = row[headerMap.date];
      const rowScheduleId = row[headerMap.scheduleId];
      const rowUserId = row[headerMap.userId];
      const rowStatus = row[headerMap.status];
      if (
        rowDate === occurrenceDate &&
        rowScheduleId === scheduleId &&
        rowUserId === userId &&
        (rowStatus === "attend" || rowStatus === "late")
      ) {
        rowsToDelete.push(i);
      }
    }

    if (rowsToDelete.length === 0) return false;

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const sheet = (spreadsheet.data.sheets || []).find(
      (item) => item.properties && item.properties.title === sheetName
    );

    if (!sheet || typeof sheet.properties.sheetId !== "number") {
      throw new Error(`Sheet not found: ${sheetName}`);
    }

    const requests = rowsToDelete
      .sort((a, b) => b - a)
      .map((rowIndex) => ({
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: "ROWS",
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });

    return true;
  }

  async getAttendees({ occurrenceDate, scheduleId }) {
    if (!this.isConfigured()) return [];

    const { headerMap, values } = await this.loadSheetData();
    const attendees = [];

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i] || [];
      const rowDate = row[headerMap.date];
      const rowScheduleId = row[headerMap.scheduleId];
      const rowStatus = row[headerMap.status];

      if (
        rowDate === occurrenceDate &&
        rowScheduleId === scheduleId &&
        (rowStatus === "attend" || rowStatus === "late")
      ) {
        attendees.push({
          userId: row[headerMap.userId],
          userName: row[headerMap.userName],
          status: rowStatus,
        });
      }
    }

    return attendees;
  }
}

module.exports = {
  AttendanceService,
  buildAttendanceRow,
  extendHeaderRow,
};
