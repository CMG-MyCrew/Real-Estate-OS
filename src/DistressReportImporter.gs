/**
 * REOS Enterprise v3.4.4
 * Distress Report → Deal Analyzer Importer
 */

var REOS = REOS || {};

REOS.DistressReportImporter = (function () {
  var IMPORTS = 'DISTRESS_REPORT_IMPORTS';
  var LEADS = 'DISTRESS_LEADS';
  var DEALS = 'DEALS';

  function ensureSheets() {
    REOS.Database.ensureTable(IMPORTS, ['Import ID','Source Name','Rows Found','Rows Imported','Rows Skipped','Status','Message','Created At']);
    REOS.Database.ensureTable(LEADS, ['Distress Lead ID','Address','City','State','Zip','Owner Name','Owner Mailing Address','Distress Type','Distress Score','Estimated Value','Estimated Repairs','Suggested Offer','Lead Source','Status','Notes','Imported Deal ID','Created At','Updated At']);
    if (REOS.DealAnalyzer && REOS.DealAnalyzer.ensureSheets) REOS.DealAnalyzer.ensureSheets();
  }

  function importFromDistressLeads() {
    ensureSheets();

    var rows = REOS.Database.getAll(LEADS);
    var imported = 0;
    var skipped = 0;
    var created = [];

    rows.forEach(function (lead) {
      if (lead['Imported Deal ID']) {
        skipped++;
        return;
      }

      var deal = createDealFromLead_(lead);
      markImported_(lead['Distress Lead ID'], deal['Deal ID']);

      imported++;
      created.push(deal);

      if (Number(lead['Estimated Value'] || 0) > 0) {
        REOS.DealAnalyzer.analyzeDeal(deal['Deal ID'], {
          purchasePrice: lead['Suggested Offer'],
          arv: lead['Estimated Value'],
          repairCost: lead['Estimated Repairs'],
          holdingCost: 0,
          closingCost: 0,
          financingCost: 0,
          sellingCost: 0,
          assignmentFee: 10000
        });
      }
    });

    var log = REOS.Database.insert(IMPORTS, {
      'Source Name': 'DISTRESS_LEADS',
      'Rows Found': rows.length,
      'Rows Imported': imported,
      'Rows Skipped': skipped,
      Status: 'Complete',
      Message: 'Distress leads imported to Deal Analyzer.',
      'Created At': new Date()
    }, { idField: 'Import ID', idPrefix: 'DIMP' });

    publish_('distress.import.completed', { importLog: log, created: created.length });

    return {
      ok: true,
      rowsFound: rows.length,
      imported: imported,
      skipped: skipped,
      createdDeals: created,
      importLog: log
    };
  }

  function addLead(input) {
    ensureSheets();
    input = input || {};
    return REOS.Database.insert(LEADS, {
      Address: input.address || '',
      City: input.city || '',
      State: input.state || '',
      Zip: input.zip || '',
      'Owner Name': input.ownerName || '',
      'Owner Mailing Address': input.ownerMailingAddress || '',
      'Distress Type': input.distressType || '',
      'Distress Score': input.distressScore || '',
      'Estimated Value': num_(input.estimatedValue),
      'Estimated Repairs': num_(input.estimatedRepairs),
      'Suggested Offer': num_(input.suggestedOffer),
      'Lead Source': input.leadSource || 'Off-Market SFR Distress Report',
      Status: input.status || 'New',
      Notes: input.notes || '',
      'Imported Deal ID': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Distress Lead ID', idPrefix: 'DLEAD' });
  }

  function seedDemoLeads() {
    var a = addLead({
      address: '742 Walnut St',
      city: 'Jacksonville',
      state: 'FL',
      zip: '32206',
      ownerName: 'Demo Absentee Owner',
      distressType: 'Absentee Owner; Tax Delinquent',
      distressScore: 82,
      estimatedValue: 175000,
      estimatedRepairs: 28000,
      suggestedOffer: 95000,
      notes: 'Demo off-market SFR lead.'
    });

    var b = addLead({
      address: '1198 Maple Ave',
      city: 'Detroit',
      state: 'MI',
      zip: '48206',
      ownerName: 'Demo Probate Lead',
      distressType: 'Probate; Vacant',
      distressScore: 74,
      estimatedValue: 110000,
      estimatedRepairs: 22000,
      suggestedOffer: 58000,
      notes: 'Demo probate/vacant SFR lead.'
    });

    return [a, b];
  }

  function createDealFromLead_(lead) {
    return REOS.DealAnalyzer.createDeal({
      address: lead.Address,
      city: lead.City,
      state: lead.State,
      zip: lead.Zip,
      source: lead['Lead Source'] || 'Off-Market SFR Distress Report',
      sellerName: lead['Owner Name'] || '',
      status: 'New'
    });
  }

  function markImported_(leadId, dealId) {
    return REOS.Database.update(LEADS, 'Distress Lead ID', leadId, {
      Status: 'Imported',
      'Imported Deal ID': dealId,
      'Updated At': new Date()
    });
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(LEADS);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      leads: rows.length,
      imported: rows.filter(function (r) { return !!r['Imported Deal ID']; }).length,
      pending: rows.filter(function (r) { return !r['Imported Deal ID']; }).length,
      imports: REOS.Database.getAll(IMPORTS).length
    };
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  function num_(v) {
    var n = Number(v || 0);
    return isNaN(n) ? 0 : n;
  }

  return {
    ensureSheets: ensureSheets,
    addLead: addLead,
    seedDemoLeads: seedDemoLeads,
    importFromDistressLeads: importFromDistressLeads,
    summary: summary
  };
})();

function reosDistressImporterEnsureSheets() {
  REOS.DistressReportImporter.ensureSheets();
  SpreadsheetApp.getUi().alert('Distress Report Importer sheets ready.');
}

function reosDistressImporterSeedDemo() {
  var result = REOS.DistressReportImporter.seedDemoLeads();
  SpreadsheetApp.getUi().alert('Distress Lead Demo', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosDistressImporterRun() {
  var result = REOS.DistressReportImporter.importFromDistressLeads();
  SpreadsheetApp.getUi().alert('Distress Import Complete', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosDistressImporterSummary() {
  var result = REOS.DistressReportImporter.summary();
  SpreadsheetApp.getUi().alert('Distress Importer Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
