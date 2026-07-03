/**
 * REOS Enterprise v3.0 - Calendar Automation Framework
 *
 * Creates calendar events from automation payloads and supports showing,
 * inspection, closing, and follow-up reminders.
 */

var REOS = REOS || {};

REOS.Calendar = (function () {
  const SHEET = 'CALENDAR_EVENTS';
  const ID_FIELD = 'Calendar Event ID';

  const HEADERS = [
    'Calendar Event ID', 'Date Created', 'Title', 'Start Time', 'End Time',
    'Calendar Event URL', 'Related Module', 'Related Record ID', 'Status',
    'Notes', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createEvent(title, startTime, endTime, options) {
    REOS.Security.requirePermission('tasks:write');
    ensureSheet();

    options = options || {};
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.createEvent(
      title,
      toDate_(startTime),
      toDate_(endTime),
      {
        description: options.description || '',
        location: options.location || '',
        guests: options.guests || '',
        sendInvites: options.sendInvites === true
      }
    );

    const created = REOS.Database.insert(SHEET, {
      'Date Created': new Date(),
      Title: title,
      'Start Time': startTime,
      'End Time': endTime,
      'Calendar Event URL': event.getHtmlLink(),
      'Related Module': options.module || '',
      'Related Record ID': options.recordId || '',
      Status: 'Created',
      Notes: options.notes || ''
    }, {
      idField: ID_FIELD,
      idPrefix: 'CE'
    });

    REOS.Logger.audit('Calendar event created', { calendarEventId: created[ID_FIELD], title: title });
    return created;
  }

  function createEventFromAutomation(config, payload) {
    config = config || {};
    payload = payload || {};

    const start = config.startTime ? new Date(config.startTime) : relativeDate_(config.startInDays || 0, config.hour || 9);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + Number(config.durationMinutes || 30));

    return createEvent(
      merge_(config.title || 'REOS Event', payload),
      start,
      end,
      {
        description: merge_(config.description || '', payload),
        location: merge_(config.location || '', payload),
        module: config.module || payload.module || '',
        recordId: payload.recordId || payload['Record ID'] || '',
        notes: 'Created by automation.'
      }
    );
  }

  function createClosingEvent(transaction) {
    return createEvent(
      'Closing - ' + transaction.Address,
      transaction['Closing Date'],
      addHours_(transaction['Closing Date'], 1),
      {
        module: 'Transactions',
        recordId: transaction['Transaction ID'],
        location: transaction['Title Company'] || '',
        description: 'Transaction closing for ' + transaction.Address
      }
    );
  }

  function relativeDate_(days, hour) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    date.setHours(Number(hour || 9), 0, 0, 0);
    return date;
  }

  function addHours_(value, hours) {
    const date = toDate_(value);
    date.setHours(date.getHours() + Number(hours || 1));
    return date;
  }

  function toDate_(value) {
    if (!value) return new Date();
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function merge_(template, payload) {
    return String(template || '').replace(/{{\s*([^}]+)\s*}}/g, function (_, key) {
      key = String(key || '').trim();
      return payload[key] !== undefined ? payload[key] : '';
    });
  }

  return {
    ensureSheet: ensureSheet,
    createEvent: createEvent,
    createEventFromAutomation: createEventFromAutomation,
    createClosingEvent: createClosingEvent
  };
})();

function calendarCreateEventFromAutomation(config, payload) {
  return REOS.Calendar.createEventFromAutomation(config, payload || {});
}
