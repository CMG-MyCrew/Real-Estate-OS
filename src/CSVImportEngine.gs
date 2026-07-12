/**
 * REOS Enterprise v4.2.1 - CSV Import Engine
 * Sprint 7.1 Increment 2: Google Drive CSV ingestion into DISTRESS_LEADS.
 */
var REOS = REOS || {};

REOS.CSVImportEngine = (function () {
  var IMPORTS = 'CSV_CONNECTOR_IMPORTS';
  var PROCESSED = 'CSV_PROCESSED_FILES';
  var LEADS = 'DISTRESS_LEADS';

  var IMPORT_HEADERS = [
    'CSV Import ID','Connector Key','File ID','File Name','Rows Found','Rows Imported',
    'Rows Skipped','Duplicates','Status','Message','Started At','Completed At','Details JSON'
  ];

  var PROCESSED_HEADERS = [
    'Processed File ID','Connector Key','File ID','File Name','File Updated At',
    'Content Hash','Status','Rows Imported','Processed At'
  ];

  var LEAD_HEADERS = [
    'Distress Lead ID','Address','City','State','Zip','Owner Name','Owner Mailing Address',
    'Distress Type','Distress Score','Estimated Value','Estimated Repairs','Suggested Offer',
    'Lead Source','Status','Notes','Imported Deal ID','Created At','Updated At'
  ];

  var ALIASES = {
    address: ['address','property address','site address','street address','property_address','situs address'],
    city: ['city','property city','site city','situs city'],
    state: ['state','property state','site state','situs state'],
    zip: ['zip','zipcode','zip code','postal code','property zip','situs zip'],
    ownerName: ['owner','owner name','property owner','taxpayer name','grantee'],
    ownerMailingAddress: ['owner mailing address','mailing address','mail address','owner address'],
    estimatedValue: ['estimated value','market value','assessed value','property value','avm','arv'],
    estimatedRepairs: ['estimated repairs','repair cost','repairs','rehab cost'],
    suggestedOffer: ['suggested offer','offer amount','mao','maximum allowable offer'],
    notes: ['notes','comments','description','case notes'],
    parcelId: ['parcel id','parcel','apn','account number','property id'],
    distressType: ['distress type','lead type','source type','category']
  };

  function ensureSheets() {
    REOS.Database.ensureTable(IMPORTS, IMPORT_HEADERS);
    REOS.Database.ensureTable(PROCESSED, PROCESSED_HEADERS);
    REOS.Database.ensureTable(LEADS, LEAD_HEADERS);
    return { ok: true, imports: IMPORTS, processed: PROCESSED, leads: LEADS };
  }

  function previewFile(fileId, options) {
    options = options || {};
    var parsed = parseFile_(fileId, options);
    return {
      ok: true,
      fileId: parsed.file.getId(),
      fileName: parsed.file.getName(),
      headers: parsed.headers,
      rowsFound: parsed.rows.length,
      preview: parsed.rows.slice(0, Number(options.limit || 10)).map(function (row) {
        return normalizeRow_(row, parsed.headers, options);
      })
    };
  }

  function validateFile(fileId, options) {
    options = options || {};
    var parsed = parseFile_(fileId, options);
    var normalizedHeaders = parsed.headers.map(normalizeHeader_);
    var hasAddress = ALIASES.address.some(function (alias) {
      return normalizedHeaders.indexOf(alias) !== -1;
    });
    return {
      ok: hasAddress,
      fileId: parsed.file.getId(),
      fileName: parsed.file.getName(),
      rowsFound: parsed.rows.length,
      headers: parsed.headers,
      missingRequired: hasAddress ? [] : ['Address'],
      message: hasAddress ? 'CSV is valid.' : 'CSV must contain a recognizable property address column.'
    };
  }

  function importFile(fileId, options) {
    ensureSheets();
    options = options || {};
    var started = new Date();
    var parsed = parseFile_(fileId, options);
    var connectorKey = String(options.connectorKey || 'county_csv');
    var sourceName = String(options.sourceName || connectorKey);

    if (!options.force && wasProcessed_(connectorKey, parsed.file)) {
      return {
        ok: true,
        skippedFile: true,
        status: 'Skipped',
        message: 'File was already processed.',
        recordsFound: parsed.rows.length,
        recordsImported: 0,
        recordsSkipped: parsed.rows.length,
        duplicates: 0,
        fileId: parsed.file.getId(),
        fileName: parsed.file.getName()
      };
    }

    var validation = validateFile(fileId, options);
    if (!validation.ok) throw new Error(validation.message);

    var existing = buildExistingIndex_();
    var imported = 0;
    var skipped = 0;
    var duplicates = 0;
    var errors = [];

    parsed.rows.forEach(function (row, index) {
      try {
        var lead = normalizeRow_(row, parsed.headers, {
          connectorKey: connectorKey,
          sourceName: sourceName,
          distressType: options.distressType || sourceName,
          defaultState: options.defaultState || '',
          defaultCity: options.defaultCity || ''
        });

        if (!lead.address) {
          skipped++;
          return;
        }

        var key = leadKey_(lead.address, lead.city, lead.state, lead.zip);
        if (existing[key]) {
          duplicates++;
          skipped++;
          return;
        }

        REOS.Database.insert(LEADS, {
          Address: lead.address,
          City: lead.city,
          State: lead.state,
          Zip: lead.zip,
          'Owner Name': lead.ownerName,
          'Owner Mailing Address': lead.ownerMailingAddress,
          'Distress Type': lead.distressType,
          'Distress Score': lead.distressScore,
          'Estimated Value': lead.estimatedValue,
          'Estimated Repairs': lead.estimatedRepairs,
          'Suggested Offer': lead.suggestedOffer,
          'Lead Source': lead.leadSource,
          Status: 'New',
          Notes: lead.notes,
          'Imported Deal ID': '',
          'Created At': new Date(),
          'Updated At': new Date()
        }, { idField: 'Distress Lead ID', idPrefix: 'DLEAD' });

        existing[key] = true;
        imported++;
      } catch (error) {
        skipped++;
        if (errors.length < 25) errors.push({ row: index + 2, message: error.message || String(error) });
      }
    });

    var completed = new Date();
    var result = {
      ok: true,
      status: 'Complete',
      message: 'CSV import completed.',
      connectorKey: connectorKey,
      fileId: parsed.file.getId(),
      fileName: parsed.file.getName(),
      recordsFound: parsed.rows.length,
      recordsImported: imported,
      recordsSkipped: skipped,
      duplicates: duplicates,
      errors: errors
    };

    REOS.Database.insert(IMPORTS, {
      'Connector Key': connectorKey,
      'File ID': parsed.file.getId(),
      'File Name': parsed.file.getName(),
      'Rows Found': parsed.rows.length,
      'Rows Imported': imported,
      'Rows Skipped': skipped,
      'Duplicates': duplicates,
      'Status': 'Complete',
      'Message': result.message,
      'Started At': started,
      'Completed At': completed,
      'Details JSON': JSON.stringify(result)
    }, { idField: 'CSV Import ID', idPrefix: 'CSVIMP' });

    markProcessed_(connectorKey, parsed.file, imported);
    return result;
  }

  function importConnector(context) {
    ensureSheets();
    context = context || {};
    var connector = context.connector || {};
    var config = context.config || {};
    var connectorKey = connector['Connector Key'] || config.connectorKey || 'county_csv';
    var sourceName = connector.Name || connectorKey;
    var files = findFiles_(config, context.options || {});

    var totals = { found: 0, imported: 0, skipped: 0, duplicates: 0 };
    var results = [];

    files.forEach(function (file) {
      var result = importFile(file.getId(), {
        connectorKey: connectorKey,
        sourceName: sourceName,
        distressType: connector['Source Category'] || sourceName,
        defaultState: config.defaultState || '',
        defaultCity: config.defaultCity || '',
        delimiter: config.delimiter || '',
        force: !!(context.options && context.options.forceFiles)
      });
      totals.found += Number(result.recordsFound || 0);
      totals.imported += Number(result.recordsImported || 0);
      totals.skipped += Number(result.recordsSkipped || 0);
      totals.duplicates += Number(result.duplicates || 0);
      results.push(result);
    });

    return {
      ok: true,
      status: 'Complete',
      message: files.length ? 'Processed ' + files.length + ' CSV file(s).' : 'No matching CSV files found.',
      connectorKey: connectorKey,
      filesFound: files.length,
      recordsFound: totals.found,
      recordsImported: totals.imported,
      recordsSkipped: totals.skipped,
      duplicates: totals.duplicates,
      files: results
    };
  }

  function findFiles_(config, options) {
    config = config || {};
    options = options || {};
    var files = [];

    if (options.fileId || config.fileId) {
      files.push(getDriveFile_(options.fileId || config.fileId));
      return files;
    }

    if (!config.driveFolderId) return files;

    var folderId = String(config.driveFolderId || '').trim();

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(folderId)) {
      throw new Error(
        'The Google Drive folder ID is invalid: "' + folderId + '".'
      );
    }

    var iterator;

    try {
      iterator = DriveApp.getFolderById(folderId).getFiles();
    } catch (error) {
      throw new Error(
        'Unable to access the Google Drive folder. ' +
        'Confirm the folder ID and permissions. Folder ID: ' +
        folderId + '. Details: ' +
        (error.message || String(error))
      );
    }
    var pattern = String(config.filePattern || '.csv').toLowerCase().replace('*', '');
    while (iterator.hasNext()) {
      var file = iterator.next();
      var name = file.getName().toLowerCase();
      if (file.getMimeType() === MimeType.CSV || name.slice(-4) === '.csv') {
        if (!pattern || name.indexOf(pattern) !== -1) files.push(file);
      }
    }
    files.sort(function (a, b) { return b.getLastUpdated().getTime() - a.getLastUpdated().getTime(); });
    var maxFiles = Number(config.maxFilesPerRun || 20);
    return files.slice(0, maxFiles);
  }

  function getDriveFile_(fileId) {
    var value = String(fileId || '').trim();

    if (!value) {
      throw new Error(
        'No Google Drive file ID was provided. ' +
        'Pass a valid Drive file ID or configure fileId on the connector.'
      );
    }

    // Accept either a raw Drive ID or a complete Google Drive URL.
    var urlMatch = value.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      value.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (urlMatch) {
      value = urlMatch[1];
    }

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(value)) {
      throw new Error(
        'The Google Drive file ID is invalid: "' + value + '". ' +
        'Use the ID from the Drive file URL.'
      );
    }

    try {
      var file = DriveApp.getFileById(value);

      // Force an access check so permission/deleted-file errors are caught here.
      file.getName();

      return file;
    } catch (error) {
      throw new Error(
        'Unable to access the Google Drive file. ' +
        'Confirm the file ID is correct and the Apps Script account has access. ' +
        'File ID: ' + value + '. Details: ' +
        (error.message || String(error))
      );
    }
  }

  function parseFile_(fileId, options) {
    options = options || {};
    var file = getDriveFile_(fileId);
    var text = file.getBlob().getDataAsString(options.charset || 'UTF-8');
    text = text.replace(/^\uFEFF/, '');
    var delimiter = options.delimiter || detectDelimiter_(text);
    var matrix = Utilities.parseCsv(text, delimiter);
    if (!matrix.length) throw new Error('CSV is empty: ' + file.getName());
    var headers = matrix.shift().map(function (h) { return String(h || '').trim(); });
    return { file: file, headers: headers, rows: matrix.filter(nonEmptyRow_) };
  }

  function normalizeRow_(row, headers, options) {
    options = options || {};
    var source = {};
    headers.forEach(function (header, index) { source[normalizeHeader_(header)] = row[index]; });
    var value = function (field) {
      var aliases = ALIASES[field] || [];
      for (var i = 0; i < aliases.length; i++) {
        var v = source[aliases[i]];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };

    var address = normalizeAddress_(value('address'));
    var city = titleCase_(value('city') || options.defaultCity || '');
    var state = normalizeState_(value('state') || options.defaultState || '');
    var zip = normalizeZip_(value('zip'));
    var ownerName = titleCase_(value('ownerName'));
    var ownerMailingAddress = value('ownerMailingAddress');
    var distressType = value('distressType') || options.distressType || options.sourceName || '';
    var estimatedValue = number_(value('estimatedValue'));
    var estimatedRepairs = number_(value('estimatedRepairs'));
    var suggestedOffer = number_(value('suggestedOffer'));
    var score = baseDistressScore_(distressType);
    var parcelId = value('parcelId');
    var notes = [value('notes'), parcelId ? 'Parcel/APN: ' + parcelId : ''].filter(Boolean).join(' | ');

    return {
      address: address,
      city: city,
      state: state,
      zip: zip,
      ownerName: ownerName,
      ownerMailingAddress: ownerMailingAddress,
      distressType: distressType,
      distressScore: score,
      estimatedValue: estimatedValue,
      estimatedRepairs: estimatedRepairs,
      suggestedOffer: suggestedOffer,
      leadSource: options.sourceName || options.connectorKey || 'Live CSV Connector',
      notes: notes
    };
  }

  function buildExistingIndex_() {
    return REOS.Database.getAll(LEADS).reduce(function (map, lead) {
      map[leadKey_(lead.Address, lead.City, lead.State, lead.Zip)] = true;
      return map;
    }, {});
  }

  function wasProcessed_(connectorKey, file) {
    var updated = file.getLastUpdated().toISOString();
    return REOS.Database.getAll(PROCESSED).some(function (row) {
      return String(row['Connector Key']) === String(connectorKey) &&
        String(row['File ID']) === String(file.getId()) &&
        String(row['File Updated At']) === updated &&
        String(row.Status) === 'Complete';
    });
  }

  function markProcessed_(connectorKey, file, imported) {
    REOS.Database.insert(PROCESSED, {
      'Connector Key': connectorKey,
      'File ID': file.getId(),
      'File Name': file.getName(),
      'File Updated At': file.getLastUpdated().toISOString(),
      'Content Hash': Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, file.getBlob().getBytes())).slice(0, 32),
      'Status': 'Complete',
      'Rows Imported': imported,
      'Processed At': new Date()
    }, { idField: 'Processed File ID', idPrefix: 'CSVFILE' });
  }

  function leadKey_(address, city, state, zip) {
    return [address, city, state, zip].map(function (v) {
      return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }).join('|');
  }

  function normalizeHeader_(value) { return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' '); }
  function normalizeAddress_(value) { return titleCase_(String(value || '').replace(/\s+/g, ' ').trim()); }
  function normalizeState_(value) { return String(value || '').trim().toUpperCase().slice(0, 2); }
  function normalizeZip_(value) { var m = String(value || '').match(/\d{5}/); return m ? m[0] : String(value || '').trim(); }
  function titleCase_(value) { return String(value || '').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function number_(value) { var n = Number(String(value || '').replace(/[$,%\s,]/g, '')); return isNaN(n) ? 0 : n; }
  function nonEmptyRow_(row) { return row.some(function (cell) { return cell !== '' && cell !== null; }); }
  function detectDelimiter_(text) { var line = String(text || '').split(/\r?\n/)[0] || ''; return line.split('\t').length > line.split(',').length ? '\t' : ','; }
  function baseDistressScore_(type) {
    var t = String(type || '').toLowerCase();
    if (t.indexOf('tax') !== -1) return 85;
    if (t.indexOf('probate') !== -1) return 82;
    if (t.indexOf('code') !== -1) return 78;
    if (t.indexOf('vacant') !== -1) return 76;
    if (t.indexOf('absentee') !== -1) return 72;
    return 65;
  }

  return {
    ensureSheets: ensureSheets,
    previewFile: previewFile,
    validateFile: validateFile,
    importFile: importFile,
    importConnector: importConnector
  };
})();

function reosCsvEnsureSheets() { return REOS.CSVImportEngine.ensureSheets(); }
function reosCsvPreview(fileId, options) { return REOS.CSVImportEngine.previewFile(fileId, options); }
function reosCsvValidate(fileId, options) { return REOS.CSVImportEngine.validateFile(fileId, options); }
function reosCsvImport(fileId, options) { return REOS.CSVImportEngine.importFile(fileId, options); }
function reosCsvImportConnector(context) { return REOS.CSVImportEngine.importConnector(context); }

function reosCsvPreviewConfiguredFile() {
  var fileIdOrUrl = 'PASTE_ACTUAL_GOOGLE_DRIVE_FILE_ID_OR_URL_HERE';

  return {
    preview: reosCsvPreview(fileIdOrUrl),
    validation: reosCsvValidate(fileIdOrUrl)
  };
}
