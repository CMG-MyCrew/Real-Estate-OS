/**
 * REOS Enterprise v4.5.0 - Zillow Gmail Multi-Folder Connector
 *
 * Imports Zillow lead notification emails from configured Gmail labels into
 * DISTRESS_LEADS. This connector does not scrape Zillow pages or issue
 * automated requests to Zillow.
 */
var REOS = REOS || {};

REOS.ZillowGmailConnector = (function () {
  var KEY = 'zillow_gmail_leads';
  var IMPORTS = 'ZILLOW_GMAIL_IMPORTS';
  var ERRORS = 'ZILLOW_GMAIL_ERRORS';
  var IMPORT_HEADERS = [
    'Import ID','Gmail Message ID','Gmail Thread ID','Source Label','External Lead ID',
    'Natural Key','Contact Name','Email','Phone','Property Address','Property URL',
    'Lead Type','Distress Lead ID','Status','Imported At','Details JSON'
  ];
  var ERROR_HEADERS = [
    'Error ID','Gmail Message ID','Source Label','Subject','Error','Payload Snippet',
    'Occurred At','Retryable','Resolved','Details JSON'
  ];
  var DEFAULT_CONFIG = {
    labels: [
      'Zillow/New Leads',
      'Zillow/Buyer Leads',
      'Zillow/Seller Leads',
      'Zillow/Rental Leads'
    ],
    importedLabel: 'Zillow/Imported',
    errorLabel: 'Zillow/Errors',
    maxThreadsPerLabel: 50,
    lookbackDays: 30,
    markRead: false,
    archiveAfterImport: false,
    runDownstreamIngestion: true,
    scoreLeads: true,
    autoPromote: false,
    defaultCity: '',
    defaultState: '',
    defaultAssignedTo: ''
  };

  function ensureSheets() {
    require_('Database');
    REOS.Database.ensureTable(IMPORTS, IMPORT_HEADERS);
    REOS.Database.ensureTable(ERRORS, ERROR_HEADERS);
    return { ok: true, imports: IMPORTS, errors: ERRORS };
  }

  function configure(config) {
    require_('ConnectorRegistry');
    ensureSheets();
    var normalized = normalizeConfig_(config || {});
    ensureLabels_(normalized);
    return REOS.ConnectorRegistry.enable(KEY, normalized);
  }

  function disable() {
    require_('ConnectorRegistry');
    return REOS.ConnectorRegistry.disable(KEY);
  }

  function sync(context) {
    ensureSheets();
    context = context || {};
    var config = normalizeConfig_(context.config || {});
    var options = context.options || {};
    if (options.labels && options.labels.length) config.labels = options.labels;
    if (options.maxThreadsPerLabel) config.maxThreadsPerLabel = Number(options.maxThreadsPerLabel);

    ensureLabels_(config);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return {
        ok: false,
        status: 'Busy',
        message: 'Zillow Gmail sync is already running.',
        recordsFound: 0,
        recordsImported: 0,
        recordsSkipped: 0
      };
    }

    var summary = {
      ok: true,
      status: 'Complete',
      message: 'Zillow Gmail sync completed.',
      labelsScanned: 0,
      recordsFound: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      importedLeadIds: [],
      byLabel: [],
      errors: []
    };

    try {
      config.labels.forEach(function (labelName) {
        var labelResult = syncLabel_(labelName, config);
        summary.labelsScanned += 1;
        summary.recordsFound += labelResult.recordsFound;
        summary.recordsImported += labelResult.recordsImported;
        summary.recordsSkipped += labelResult.recordsSkipped;
        summary.recordsFailed += labelResult.recordsFailed;
        summary.importedLeadIds = summary.importedLeadIds.concat(labelResult.importedLeadIds);
        summary.byLabel.push(labelResult);
        summary.errors = summary.errors.concat(labelResult.errors);
      });

      if (config.runDownstreamIngestion && summary.recordsImported > 0 &&
          REOS.AcquisitionIngestionOrchestrator &&
          typeof REOS.AcquisitionIngestionOrchestrator.run === 'function') {
        summary.downstream = REOS.AcquisitionIngestionOrchestrator.run({
          runConnectors: false,
          scanDuplicates: true,
          scoreLeads: !!config.scoreLeads,
          autoPromote: !!config.autoPromote,
          assignedTo: config.defaultAssignedTo || ''
        });
      }

      if (summary.recordsFailed > 0) {
        summary.ok = false;
        summary.status = summary.recordsImported > 0 ? 'Completed With Errors' : 'Failed';
        summary.message = 'Zillow Gmail sync completed with ' + summary.recordsFailed + ' failed message(s).';
      }

      publish_('acquisition.zillow.gmail.completed', summary);
      return summary;
    } finally {
      lock.releaseLock();
    }
  }

  function syncLabel_(labelName, config) {
    var result = {
      label: labelName,
      recordsFound: 0,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      importedLeadIds: [],
      errors: []
    };
    var query = 'label:"' + escapeQuery_(labelName) + '" newer_than:' + config.lookbackDays + 'd';
    var threads = GmailApp.search(query, 0, config.maxThreadsPerLabel);

    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        result.recordsFound += 1;
        try {
          var messageId = String(message.getId());
          if (wasImported_(messageId)) {
            result.recordsSkipped += 1;
            return;
          }

          var parsed = parseMessage_(message, labelName, config);
          var duplicate = findNaturalDuplicate_(parsed.naturalKey);
          if (duplicate) {
            recordImport_(message, labelName, parsed, duplicate['Distress Lead ID'] || '', 'Duplicate');
            finalizeMessage_(message, config, true);
            result.recordsSkipped += 1;
            return;
          }

          var lead = insertLead_(parsed, config);
          recordImport_(message, labelName, parsed, lead['Distress Lead ID'] || '', 'Imported');
          finalizeMessage_(message, config, true);
          result.recordsImported += 1;
          if (lead['Distress Lead ID']) result.importedLeadIds.push(lead['Distress Lead ID']);
        } catch (error) {
          result.recordsFailed += 1;
          result.errors.push({
            messageId: safeCall_(function () { return message.getId(); }, ''),
            error: error.message || String(error)
          });
          recordError_(message, labelName, error);
          finalizeMessage_(message, config, false);
        }
      });
    });
    return result;
  }

  function parseMessage_(message, labelName, config) {
    var subject = String(message.getSubject() || '').trim();
    var body = String(message.getPlainBody() || '').replace(/\r/g, '');
    var from = String(message.getFrom() || '');
    var replyTo = String(message.getReplyTo() || '');
    var combined = subject + '\n' + body;

    var email = first_(combined, [
      /(?:email|e-mail)\s*[:\-]\s*([^\s<>]+@[^\s<>]+)/i,
      /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
    ]) || extractEmail_(replyTo) || extractEmail_(from);
    var phone = normalizePhone_(first_(combined, [
      /(?:phone|mobile|telephone)\s*[:\-]\s*([+()\d.\-\s]{7,})/i,
      /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/
    ]));
    var name = cleanName_(first_(combined, [
      /(?:name|contact|lead)\s*[:\-]\s*([^\n]{2,80})/i,
      /(?:inquiry|request)\s+from\s+([^\n]{2,80})/i
    ]));
    var propertyUrl = first_(combined, [
      /(https?:\/\/(?:www\.)?zillow\.com\/[^\s<>]+)/i,
      /(https?:\/\/[^\s<>]*zillow[^\s<>]*)/i
    ]).replace(/[),.;]+$/, '');
    var address = cleanAddress_(first_(combined, [
      /(?:property|listing|home|address)\s*[:\-]\s*([^\n]{5,160})/i,
      /(\d{1,6}\s+[^\n,]{2,80},\s*[^\n,]{2,60},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)/
    ]));
    var externalLeadId = first_(combined, [
      /(?:lead|contact|inquiry)\s*(?:id|#)\s*[:\-]\s*([A-Z0-9_-]{4,})/i,
      /zillow[_\s-]*lead[_\s-]*id\s*[:=]\s*([A-Z0-9_-]+)/i
    ]);
    var leadType = detectLeadType_(subject + ' ' + body, labelName);
    var location = splitAddress_(address, config);
    var inquiry = extractInquiry_(body);
    var naturalKey = buildNaturalKey_(externalLeadId, email, phone, address, propertyUrl);

    if (!email && !phone && !address && !propertyUrl) {
      throw new Error('Unable to identify a contact or property from the Zillow email.');
    }

    return {
      sourceLabel: labelName,
      subject: subject,
      contactName: name,
      email: email,
      phone: phone,
      propertyAddress: location.address,
      city: location.city,
      state: location.state,
      zip: location.zip,
      propertyUrl: propertyUrl,
      externalLeadId: externalLeadId,
      leadType: leadType,
      inquiry: inquiry,
      receivedAt: message.getDate(),
      naturalKey: naturalKey,
      rawSnippet: body.substring(0, 1500)
    };
  }

  function insertLead_(parsed, config) {
    var now = new Date();
    return REOS.Database.insert('DISTRESS_LEADS', {
      Address: parsed.propertyAddress,
      City: parsed.city,
      State: parsed.state,
      Zip: parsed.zip,
      'Owner Name': parsed.contactName,
      Phone: parsed.phone,
      Email: parsed.email,
      'Distress Type': mapDistressType_(parsed.leadType),
      Source: 'Zillow Gmail',
      'Source URL': parsed.propertyUrl,
      'External Lead ID': parsed.externalLeadId,
      'Lead Type': parsed.leadType,
      'Assigned To': config.defaultAssignedTo || '',
      Status: 'New',
      Notes: buildNotes_(parsed),
      'Created At': parsed.receivedAt || now,
      'Updated At': now
    }, { idField: 'Distress Lead ID', idPrefix: 'ZIL' });
  }

  function recordImport_(message, labelName, parsed, leadId, status) {
    return REOS.Database.insert(IMPORTS, {
      'Gmail Message ID': String(message.getId()),
      'Gmail Thread ID': String(message.getThread().getId()),
      'Source Label': labelName,
      'External Lead ID': parsed.externalLeadId,
      'Natural Key': parsed.naturalKey,
      'Contact Name': parsed.contactName,
      Email: parsed.email,
      Phone: parsed.phone,
      'Property Address': parsed.propertyAddress,
      'Property URL': parsed.propertyUrl,
      'Lead Type': parsed.leadType,
      'Distress Lead ID': leadId,
      Status: status,
      'Imported At': new Date(),
      'Details JSON': JSON.stringify({ subject: parsed.subject, inquiry: parsed.inquiry })
    }, { idField: 'Import ID', idPrefix: 'ZGMI' });
  }

  function recordError_(message, labelName, error) {
    var body = safeCall_(function () { return message.getPlainBody(); }, '');
    return REOS.Database.insert(ERRORS, {
      'Gmail Message ID': safeCall_(function () { return String(message.getId()); }, ''),
      'Source Label': labelName,
      Subject: safeCall_(function () { return message.getSubject(); }, ''),
      Error: error.message || String(error),
      'Payload Snippet': String(body || '').substring(0, 1000),
      'Occurred At': new Date(),
      Retryable: true,
      Resolved: false,
      'Details JSON': JSON.stringify({ stack: error.stack || '' })
    }, { idField: 'Error ID', idPrefix: 'ZGME' });
  }

  function wasImported_(messageId) {
    return REOS.Database.getAll(IMPORTS).some(function (row) {
      return String(row['Gmail Message ID'] || '') === String(messageId || '');
    });
  }

  function findNaturalDuplicate_(naturalKey) {
    if (!naturalKey) return null;
    var rows = REOS.Database.getAll(IMPORTS);
    for (var i = rows.length - 1; i >= 0; i -= 1) {
      if (String(rows[i]['Natural Key'] || '') === naturalKey &&
          String(rows[i].Status || '') !== 'Failed') return rows[i];
    }
    return null;
  }

  function finalizeMessage_(message, config, success) {
    var target = GmailApp.getUserLabelByName(success ? config.importedLabel : config.errorLabel);
    if (target) message.getThread().addLabel(target);
    if (success && config.markRead) message.markRead();
    if (success && config.archiveAfterImport) message.getThread().moveToArchive();
  }

  function ensureLabels_(config) {
    config.labels.concat([config.importedLabel, config.errorLabel]).forEach(function (name) {
      if (!name) return;
      if (!GmailApp.getUserLabelByName(name)) GmailApp.createLabel(name);
    });
  }

  function normalizeConfig_(config) {
    var merged = Object.assign({}, DEFAULT_CONFIG, config || {});
    merged.labels = Array.isArray(merged.labels) ? merged.labels : String(merged.labels || '').split(',');
    merged.labels = merged.labels.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
    merged.maxThreadsPerLabel = Math.max(1, Math.min(500, Number(merged.maxThreadsPerLabel || 50)));
    merged.lookbackDays = Math.max(1, Math.min(365, Number(merged.lookbackDays || 30)));
    return merged;
  }

  function detectLeadType_(text, labelName) {
    var value = (String(text || '') + ' ' + String(labelName || '')).toLowerCase();
    if (/seller|sell my home|home valuation|owner/.test(value)) return 'Seller';
    if (/rental|rent|tenant|lease/.test(value)) return 'Rental';
    if (/buyer|tour|showing|mortgage|purchase/.test(value)) return 'Buyer';
    return 'Property Inquiry';
  }

  function mapDistressType_(leadType) {
    if (leadType === 'Seller') return 'Seller Lead';
    if (leadType === 'Rental') return 'Rental Inquiry';
    if (leadType === 'Buyer') return 'Buyer Inquiry';
    return 'Listing Inquiry';
  }

  function buildNaturalKey_(externalId, email, phone, address, url) {
    var key = externalId ? 'external:' + externalId : [email, phone, address, url].map(normalizeKey_).filter(Boolean).join('|');
    if (!key) return '';
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key, Utilities.Charset.UTF_8);
    return digest.map(function (byte) {
      var value = byte < 0 ? byte + 256 : byte;
      return ('0' + value.toString(16)).slice(-2);
    }).join('');
  }

  function buildNotes_(parsed) {
    return [
      'Imported from Gmail label: ' + parsed.sourceLabel,
      parsed.externalLeadId ? 'Zillow lead ID: ' + parsed.externalLeadId : '',
      parsed.propertyUrl ? 'Property URL: ' + parsed.propertyUrl : '',
      parsed.inquiry ? 'Inquiry: ' + parsed.inquiry : ''
    ].filter(Boolean).join('\n');
  }

  function splitAddress_(value, config) {
    var raw = String(value || '').trim();
    var result = { address: raw, city: config.defaultCity || '', state: config.defaultState || '', zip: '' };
    var match = raw.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (match) {
      result.address = match[1].trim();
      result.city = match[2].trim();
      result.state = match[3].toUpperCase();
      result.zip = match[4];
    }
    return result;
  }

  function extractInquiry_(body) {
    var match = String(body || '').match(/(?:message|comments?|inquiry)\s*[:\-]\s*([\s\S]{1,1000})/i);
    return match ? match[1].trim().substring(0, 1000) : '';
  }

  function first_(text, patterns) {
    for (var i = 0; i < patterns.length; i += 1) {
      var match = String(text || '').match(patterns[i]);
      if (match && match[1]) return String(match[1]).trim();
    }
    return '';
  }

  function extractEmail_(value) {
    var match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].toLowerCase() : '';
  }

  function normalizePhone_(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.substring(1);
    return digits.length === 10 ? digits : '';
  }

  function cleanName_(value) {
    return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 120);
  }

  function cleanAddress_(value) {
    return String(value || '').replace(/\s+/g, ' ').replace(/\s*\|.*$/, '').trim().substring(0, 220);
  }

  function normalizeKey_(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function escapeQuery_(value) {
    return String(value || '').replace(/"/g, '\\"');
  }

  function safeCall_(fn, fallback) {
    try { return fn(); } catch (error) { return fallback; }
  }

  function require_(name) {
    if (!REOS[name]) throw new Error(name + '.gs is required.');
  }

  function publish_(topic, payload) {
    try {
      if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') {
        REOS.PluginEventBus.publish(topic, payload, 'zillow-gmail-connector');
      }
    } catch (error) {}
  }

  return {
    key: KEY,
    ensureSheets: ensureSheets,
    configure: configure,
    disable: disable,
    sync: sync,
    parseMessage_: parseMessage_,
    normalizeConfig_: normalizeConfig_
  };
})();

function reosZillowGmailEnsureSheets() {
  return REOS.ZillowGmailConnector.ensureSheets();
}

function reosZillowGmailConfigure(config) {
  return REOS.ZillowGmailConnector.configure(config);
}

function reosZillowGmailDisable() {
  return REOS.ZillowGmailConnector.disable();
}

function reosZillowGmailSync(options) {
  var connector = REOS.ConnectorRegistry.get(REOS.ZillowGmailConnector.key);
  return REOS.ZillowGmailConnector.sync({
    connector: connector,
    config: connector ? REOS.ConnectorRegistry.getConfig(connector) : {},
    options: options || {}
  });
}

function reosConnectorHandleZillowGmail(context) {
  return REOS.ZillowGmailConnector.sync(context || {});
}

function reosZillowGmailInstallDefaultTrigger() {
  reosZillowGmailRemoveTriggers();
  ScriptApp.newTrigger('reosZillowGmailScheduledSync')
    .timeBased()
    .everyMinutes(5)
    .create();
  return { ok: true, schedule: 'Every 5 minutes' };
}

function reosZillowGmailRemoveTriggers() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'reosZillowGmailScheduledSync') {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return { ok: true, removed: removed };
}

function reosZillowGmailScheduledSync() {
  return REOS.AcquisitionConnectorManager.run(REOS.ZillowGmailConnector.key, {});
}
