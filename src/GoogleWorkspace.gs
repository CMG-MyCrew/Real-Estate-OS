/** REOS Enterprise v3.0 - Google Workspace Integration Adapter */
var REOS = REOS || {};

REOS.GoogleWorkspace = (function () {
  function execute(action, options) {
    switch (String(action || '')) {
      case 'createCalendarEvent': return createCalendarEvent(options);
      case 'sendEmail': return sendEmail(options);
      case 'createDriveFolder': return createDriveFolder(options);
      case 'exportDocumentPdf': return exportDocumentPdf(options);
      default: throw new Error('Unknown Google Workspace action: ' + action);
    }
  }
  function createCalendarEvent(options) {
    return REOS.Calendar.createEvent(options.title, options.startTime, options.endTime, options);
  }
  function sendEmail(options) {
    return REOS.Notifications.sendEmail({ to: options.to, subject: options.subject, body: options.body, module: 'GoogleWorkspace' }, options || {});
  }
  function createDriveFolder(options) {
    return REOS.GoogleDrive.getOrCreateFolder(options.recordId, options.recordType, options.displayName);
  }
  function exportDocumentPdf(options) {
    return REOS.Templates.generatePdf(options.documentId);
  }
  return { execute: execute };
})();
