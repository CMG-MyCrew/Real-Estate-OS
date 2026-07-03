/**
 * REOS Enterprise v3.0 - Task Framework
 *
 * Provides task CRUD, due-date filtering, follow-up creation, and completion.
 */

var REOS = REOS || {};

REOS.Tasks = (function () {
  const SHEET = REOS.CONFIG.SHEETS.TASKS;
  const ID_FIELD = 'Task ID';

  const HEADERS = [
    'Task ID', 'Created Date', 'Client ID', 'Lead ID', 'Opportunity ID',
    'Task', 'Category', 'Priority', 'Due Date', 'Days Remaining',
    'Status', 'Assigned To', 'Completed Date', 'Notes', 'Active',
    'Created At', 'Updated At'
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

  function create(task) {
    REOS.Security.requirePermission('tasks:write');
    ensureSheet();

    task = task || {};
    task['Created Date'] = task['Created Date'] || new Date();
    task.Priority = task.Priority || 'Medium';
    task.Status = task.Status || 'Not Started';
    task.Active = task.Active === false ? false : true;
    task['Days Remaining'] = calculateDaysRemaining_(task['Due Date']);

    const validation = REOS.Validation.validateRecord(task, {
      required: ['Task', 'Due Date'],
      dateFields: ['Created Date', 'Due Date', 'Completed Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, task, {
      idField: ID_FIELD,
      idPrefix: REOS.CONFIG.IDS.TASK
    });

    REOS.Logger.audit('Task created', { taskId: created[ID_FIELD], clientId: created['Client ID'] });
    return created;
  }

  function update(taskId, changes) {
    REOS.Security.requirePermission('tasks:write');
    ensureSheet();

    changes = changes || {};
    if (Object.prototype.hasOwnProperty.call(changes, 'Due Date')) {
      changes['Days Remaining'] = calculateDaysRemaining_(changes['Due Date']);
    }

    const updated = REOS.Database.update(SHEET, ID_FIELD, taskId, changes);
    REOS.Logger.audit('Task updated', { taskId: taskId });
    return updated;
  }

  function complete(taskId, notes) {
    return update(taskId, {
      Status: 'Completed',
      'Completed Date': new Date(),
      Notes: notes || ''
    });
  }

  function get(taskId) {
    REOS.Security.requirePermission('tasks:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, taskId);
  }

  function listActive() {
    REOS.Security.requirePermission('tasks:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (task) {
      return task.Active !== false && String(task.Status || '').toLowerCase() !== 'completed';
    });
  }

  function dueToday() {
    return listActive().filter(function (task) {
      return isSameDay_(task['Due Date'], new Date());
    });
  }

  function overdue() {
    const today = startOfDay_(new Date());
    return listActive().filter(function (task) {
      const due = toDate_(task['Due Date']);
      return due && startOfDay_(due).getTime() < today.getTime();
    });
  }

  function upcoming(days) {
    days = Number(days || 7);
    const today = startOfDay_(new Date());
    const end = new Date(today);
    end.setDate(end.getDate() + days);

    return listActive().filter(function (task) {
      const due = toDate_(task['Due Date']);
      if (!due) return false;
      const time = startOfDay_(due).getTime();
      return time >= today.getTime() && time <= end.getTime();
    });
  }

  function createFollowUp(clientId, dueDate, notes) {
    return create({
      'Client ID': clientId,
      Task: 'Follow up with client',
      Category: 'Follow-up',
      Priority: 'High',
      'Due Date': dueDate,
      Notes: notes || '',
      Status: 'Not Started'
    });
  }

  function refreshDaysRemaining() {
    REOS.Security.requirePermission('tasks:write');
    ensureSheet();

    const tasks = REOS.Database.getAll(SHEET);
    tasks.forEach(function (task) {
      if (task[ID_FIELD]) {
        REOS.Database.update(SHEET, ID_FIELD, task[ID_FIELD], {
          'Days Remaining': calculateDaysRemaining_(task['Due Date'])
        });
      }
    });
    REOS.Logger.info('Task days remaining refreshed', { count: tasks.length });
    return tasks.length;
  }

  function calculateDaysRemaining_(dateValue) {
    const date = toDate_(dateValue);
    if (!date) return '';
    return Math.ceil((startOfDay_(date).getTime() - startOfDay_(new Date()).getTime()) / 86400000);
  }

  function toDate_(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function startOfDay_(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isSameDay_(a, b) {
    const da = toDate_(a);
    const db = toDate_(b);
    if (!da || !db) return false;
    return startOfDay_(da).getTime() === startOfDay_(db).getTime();
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    complete: complete,
    get: get,
    listActive: listActive,
    dueToday: dueToday,
    overdue: overdue,
    upcoming: upcoming,
    createFollowUp: createFollowUp,
    refreshDaysRemaining: refreshDaysRemaining
  };
})();

function showTasks() {
  const html = HtmlService.createHtmlOutputFromFile('Tasks')
    .setWidth(900)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Tasks');
}

function tasksGetDashboard() {
  return {
    dueToday: REOS.Tasks.dueToday(),
    overdue: REOS.Tasks.overdue(),
    upcoming: REOS.Tasks.upcoming(7)
  };
}

function tasksCreate(task) {
  return REOS.Tasks.create(task);
}

function tasksComplete(taskId) {
  return REOS.Tasks.complete(taskId);
}
