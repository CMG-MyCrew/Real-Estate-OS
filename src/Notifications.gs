/**
 * REOS Enterprise v3.0 - Notification Framework
 *
 * Email notification helpers and daily digest generation.
 */

var REOS = REOS || {};

REOS.Notifications = (function () {
  const SHEET = 'NOTIFICATIONS';
  const ID_FIELD = 'Notification ID';

  const HEADERS = [
    'Notification ID', 'Date', 'Channel', 'Recipient', 'Subject', 'Body',
    'Status', 'Related Module', 'Related Record ID', 'Error', 'Created At', 'Updated At'
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

  function sendEmail(config, payload) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();

    config = config || {};
    payload = payload || {};
    const recipient = config.to || payload.email || payload.Email || REOS.Security.getCurrentUserEmail();
    const subject = merge_(config.subject || 'REOS Notification', payload);
    const body = merge_(config.body || 'A REOS automation event occurred.', payload);

    const notification = {
      Date: new Date(),
      Channel: 'Email',
      Recipient: recipient,
      Subject: subject,
      Body: body,
      Status: 'Pending',
      'Related Module': config.module || payload.module || '',
      'Related Record ID': payload.recordId || payload['Record ID'] || ''
    };

    const created = REOS.Database.insert(SHEET, notification, {
      idField: ID_FIELD,
      idPrefix: 'N'
    });

    try {
      GmailApp.sendEmail(recipient, subject, body);
      const updated = REOS.Database.update(SHEET, ID_FIELD, created[ID_FIELD], { Status: 'Sent' });
      REOS.Logger.audit('Notification email sent', { notificationId: created[ID_FIELD], recipient: recipient });
      return updated;
    } catch (error) {
      REOS.Database.update(SHEET, ID_FIELD, created[ID_FIELD], { Status: 'Error', Error: error.message });
      throw error;
    }
  }

  function dailyDigest() {
    REOS.Security.requirePermission('reports:read');
    const dashboard = REOS.Dashboard.getExecutiveDashboard();
    const email = REOS.Security.getCurrentUserEmail();
    // Preserve the existing daily digest (including any PA/Philadelphia
    // data supplied by the current dashboard) byte-for-byte before appending
    // a separately labeled NJ/DE county-status section. Staged code only.
    const originalBody = [
      'REOS Daily Digest',
      '',
      'Active Leads: ' + value_(dashboard.crm, 'activeLeadsCount'),
      'Overdue Tasks: ' + value_(dashboard.tasks, 'overdueCount'),
      'Active Transactions: ' + value_(dashboard.transactions, 'activeCount'),
      'Rental Cash Flow: $' + value_(dashboard.rentals, 'monthlyCashFlow'),
      'Monthly Net Profit: $' + value_(value_(dashboard.finance, 'currentMonth', {}), 'netProfit')
    ].join('\n');

    // This does not read county sheets or run collectors. If the NJ/DE
    // staging module is missing or has drifted, fail visible rather than
    // suppressing the warning or inventing acquisition lead counts.
    let njdeCountyAppendix = '';
    try {
      if (REOS.NJDEMorningReport &&
          typeof REOS.NJDEMorningReport.renderText === 'function') {
        njdeCountyAppendix = REOS.NJDEMorningReport.renderText();
      } else {
        njdeCountyAppendix = '\nREOS COUNTY MORNING REPORT — NJ / DE\n' +
          'Status: UNAVAILABLE — county reporting module not deployed.\n' +
          'Live NJ/DE distress feeds: NOT CERTIFIED; new leads: NOT AVAILABLE.';
      }
    } catch (error) {
      njdeCountyAppendix = '\nREOS COUNTY MORNING REPORT — NJ / DE\n' +
        'Status: HOLD — state report validation failed; no live data certified.\n' +
        'New distress leads: NOT AVAILABLE (no verified results).';
    }
    const body = originalBody + '\n' + njdeCountyAppendix;

    return sendEmail({
      to: email,
      subject: 'REOS Daily Digest',
      body: body,
      module: 'Dashboard'
    }, { recordId: 'DAILY_DIGEST' });
  }

  function merge_(template, payload) {
    return String(template || '').replace(/{{\s*([^}]+)\s*}}/g, function (_, key) {
      key = String(key || '').trim();
      return payload[key] !== undefined ? payload[key] : '';
    });
  }

  function value_(obj, key, fallback) {
    return obj && !obj.error && obj[key] !== undefined ? obj[key] : (fallback || 0);
  }

  return {
    ensureSheet: ensureSheet,
    sendEmail: sendEmail,
    dailyDigest: dailyDigest
  };
})();

function notificationsDailyDigest() {
  return REOS.Notifications.dailyDigest();
}
