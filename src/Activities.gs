/**
 * REOS Enterprise v3.0 - Activities Framework
 *
 * Tracks calls, texts, emails, meetings, notes, and updates client last contact.
 */

var REOS = REOS || {};

REOS.Activities = (function () {
  const SHEET = REOS.CONFIG.SHEETS.ACTIVITIES;
  const ID_FIELD = 'Activity ID';

  const HEADERS = [
    'Activity ID', 'Date', 'Time', 'Client ID', 'Lead ID', 'Opportunity ID',
    'Activity Type', 'Subject', 'Notes', 'Outcome', 'Next Action',
    'Follow-up Date', 'Assigned To', 'Status', 'Created By', 'Created At', 'Updated At'
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

  function create(activity) {
    REOS.Security.requirePermission('crm:write');
    ensureSheet();

    activity = activity || {};
    const now = new Date();
    activity.Date = activity.Date || now;
    activity.Time = activity.Time || Utilities.formatDate(now, REOS.CONFIG.APP.TIME_ZONE, 'HH:mm');
    activity.Status = activity.Status || 'Completed';
    activity['Created By'] = activity['Created By'] || REOS.Security.getCurrentUserEmail();

    const validation = REOS.Validation.validateRecord(activity, {
      required: ['Activity Type', 'Subject'],
      dateFields: ['Date', 'Follow-up Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, activity, {
      idField: ID_FIELD,
      idPrefix: REOS.CONFIG.IDS.ACTIVITY
    });

    if (created['Client ID']) {
      updateClientLastContact_(created['Client ID'], created.Date);
      if (created['Follow-up Date']) {
        REOS.Tasks.createFollowUp(created['Client ID'], created['Follow-up Date'], created['Next Action'] || created.Subject);
      }
    }

    REOS.Logger.audit('Activity created', { activityId: created[ID_FIELD], clientId: created['Client ID'] });
    return created;
  }

  function listForClient(clientId) {
    REOS.Security.requirePermission('crm:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (activity) {
      return String(activity['Client ID'] || '') === String(clientId || '');
    });
  }

  function listRecent(limit) {
    REOS.Security.requirePermission('crm:read');
    ensureSheet();
    limit = Number(limit || 25);
    return REOS.Database.getAll(SHEET).slice(-limit).reverse();
  }

  function updateClientLastContact_(clientId, date) {
    try {
      REOS.CRM.updateContact(clientId, { 'Last Contact': date });
    } catch (error) {
      REOS.Logger.warn('Unable to update client last contact', { clientId: clientId, error: error.message });
    }
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    listForClient: listForClient,
    listRecent: listRecent
  };
})();

function activitiesCreate(activity) {
  return REOS.Activities.create(activity);
}

function activitiesRecent(limit) {
  return REOS.Activities.listRecent(limit);
}
