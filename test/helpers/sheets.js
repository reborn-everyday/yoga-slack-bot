// In-memory Sheets API boundary; tests exercise the real storage service.
function createSheets(initial = {}) {
  const tabs = structuredClone(initial);
  const calls = [];
  const client = { spreadsheets: {
    async get() { return { data: { sheets: Object.keys(tabs).map((title, sheetId) => ({ properties: { title, sheetId } })) } }; },
    async batchUpdate(options) {
      calls.push(options);
      for (const request of options.requestBody.requests) {
        if (request.addSheet) tabs[request.addSheet.properties.title] = [];
        if (request.deleteDimension) {
          const { sheetId, startIndex, endIndex } = request.deleteDimension.range;
          tabs[Object.keys(tabs)[sheetId]].splice(startIndex, endIndex - startIndex);
        }
      }
      return {};
    },
    values: {
      async get({ range }) {
        const [tab, cells] = range.split("!");
        if (!tabs[tab]) throw new Error(`Unknown sheet: ${tab}`);
        const start = Number(cells.match(/^[A-Z]+(\d+)/)?.[1] || 1) - 1;
        const end = Number(cells.match(/:[A-Z]+(\d+)/)?.[1] || tabs[tab].length);
        return { data: { values: structuredClone(tabs[tab].slice(start, end)) } };
      },
      async update(options) {
        calls.push(options);
        const [tab, cells] = options.range.split("!");
        const start = Number(cells.match(/\d+/)[0]) - 1;
        for (const [offset, row] of options.requestBody.values.entries()) tabs[tab][start + offset] = [...row];
        return {};
      },
      async append(options) {
        calls.push(options);
        tabs[options.range.split("!")[0]].push(...structuredClone(options.requestBody.values));
        return {};
      },
    },
  } };
  return { client, tabs, calls };
}

module.exports = { createSheets };
