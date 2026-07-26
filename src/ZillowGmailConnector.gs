/**
 * REOS Enterprise - Zillow Gmail Multi-Folder Leads Connector.
 * Scans configured Gmail labels, parses Zillow lead notifications, and stores
 * deduplicated records in a dedicated staging table.
 */
var REOS = REOS || {};

REOS.ZillowGmailConnector = (function () {
  var TABLE = 'ZILLOW_GMAIL_LEADS';
  var HEADERS = [
    'Lead ID','Gmail Message ID','Thread ID','Received At','Source Label','From','Subject',
    'Buyer Name','Buyer Email','Buyer Phone','Property Address','Listing URL','Message',
    'Raw Snippet','Status','Created At'
  ];

  function ensureSheet() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
    REOS.Database.ensureTable(TABLE, HEADERS);
    return TABLE;
  }

  function handle(context) {
    context = context || {};
    var config = context.config || {};
    var options = context.options || {};
    ensureSheet();

    var labels = normalizeLabels_(config.labels || config.gmailLabels || config.folders || ['Zillow']);
    var maxThreads = Math.max(1, Math.min(Number(options.maxThreads || config.maxThreads || 100), 500));
    var querySuffix = String(config.query || '').trim();
    var existing = existingMessageIds_();
    var found = 0;
    var imported = 0;
    var skipped = 0;
    var errors = [];

    labels.forEach(function (labelName) {
      try {
        var query = 'label:"' + escapeQuery_(labelName) + '"';
        if (querySuffix) query += ' ' + querySuffix;
        var threads = GmailApp.search(query, 0, maxThreads);

        threads.forEach(function (thread) {
          thread.getMessages().forEach(function (message) {
            found++;
            var messageId = message.getId();
            if (existing[messageId]) {
              skipped++;
              return;
            }

            var parsed = parseMessage_(message);
            REOS.Database.insert(TABLE, {
              'Gmail Message ID': messageId,
              'Thread ID': thread.getId(),
              'Received At': message.getDate(),
              'Source Label': labelName,
              'From': message.getFrom(),
              'Subject': message.getSubject(),
              'Buyer Name': parsed.name,
              'Buyer Email': parsed.email,
              'Buyer Phone': parsed.phone,
              'Property Address': parsed.address,
              'Listing URL': parsed.url,
              'Message': parsed.message,
              'Raw Snippet': parsed.snippet,
              'Status': 'New'
            }, { idField: 'Lead ID', idPrefix: 'ZGL' });

            existing[messageId] = true;
            imported++;
          });
        });
      } catch (error) {
        errors.push(labelName + ': ' + (error.message || String(error)));
      }
    });

    return {
      ok: errors.length === 0,
      status: errors.length ? 'Failed' : 'Complete',
      message: errors.length ? errors.join(' | ') : 'Zillow Gmail scan completed.',
      recordsFound: found,
      recordsImported: imported,
      recordsSkipped: skipped,
      labelsScanned: labels
    };
  }

  function parseMessage_(message) {
    var plain = String(message.getPlainBody() || '');
    var html = String(message.getBody() || '');
    var text = plain || stripHtml_(html);
    return {
      name: firstMatch_(text, [/(?:name|buyer)\s*[:\-]\s*([^\n\r]+)/i, /New inquiry from\s+([^\n\r]+)/i]),
      email: firstMatch_(text, [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i]),
      phone: firstMatch_(text, [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/]),
      address: firstMatch_(text, [/(?:property|address|listing)\s*[:\-]\s*([^\n\r]+)/i]),
      url: firstMatch_(html + '\n' + text, [/https?:\/\/[^\s"'<>]+/i]),
      message: firstMatch_(text, [/(?:message|comments?)\s*[:\-]\s*([\s\S]{1,1000})/i]),
      snippet: text.replace(/\s+/g, ' ').trim().slice(0, 1000)
    };
  }

  function existingMessageIds_() {
    return REOS.Database.getAll(TABLE).reduce(function (map, row) {
      var id = String(row['Gmail Message ID'] || '');
      if (id) map[id] = true;
      return map;
    }, {});
  }

  function normalizeLabels_(value) {
    var labels = Array.isArray(value) ? value : String(value || '').split(',');
    return labels.map(function (item) { return String(item || '').trim(); })
      .filter(function (item, index, all) { return item && all.indexOf(item) === index; });
  }

  function firstMatch_(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var match = String(text || '').match(patterns[i]);
      if (match) return String(match[1] || match[0] || '').trim();
    }
    return '';
  }

  function stripHtml_(html) {
    return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
  }

  function escapeQuery_(value) {
    return String(value || '').replace(/"/g, '\\"');
  }

  return {
    ensureSheet: ensureSheet,
    handle: handle,
    run: handle,
    scan: handle
  };
})();
