/**
 * REOS Enterprise v3.0 - AI Report Generation
 *
 * Sprint 7 foundation for branded Google Docs and PDF-ready AI reports.
 * Generates acquisition packets, seller summaries, negotiation guides,
 * investment snapshots, and stores output in Google Drive.
 */

var REOS = REOS || {};

REOS.AIReports = (function () {
  const REPORT_VERSION = '1.0.0';
  const FOLDER_PROPERTY = 'REOS_AI_REPORTS_FOLDER_ID';
  const DEFAULT_FOLDER_NAME = 'REOS AI Reports';

  function generateLeadReport(leadOrId, options) {
    REOS.Security.requirePermission('ai:use');
    REOS.Security.requirePermission('leads:read');
    options = options || {};

    const lead = resolveLead_(leadOrId);
    const summaryResult = REOS.AISummaries.generateLeadSummary(lead, { skipLog: true });
    const report = buildReportModel_(lead, summaryResult);

    if (options.format === 'model') return { ok: true, report: report };

    const doc = createGoogleDoc_(report, options);
    const pdf = options.createPdf === false ? null : createPdfCopy_(doc.file, report);

    REOS.Logger.audit('AI lead report generated', {
      leadId: lead['Lead ID'] || '',
      docUrl: doc.url,
      pdfUrl: pdf ? pdf.url : ''
    });

    return {
      ok: true,
      version: REPORT_VERSION,
      leadId: lead['Lead ID'] || '',
      reportTitle: report.title,
      googleDocUrl: doc.url,
      googleDocId: doc.id,
      pdfUrl: pdf ? pdf.url : '',
      pdfId: pdf ? pdf.id : '',
      generatedAt: REOS.nowIso_(),
      report: report
    };
  }

  function generateSellerSummary(leadOrId, options) {
    options = options || {};
    options.reportType = 'seller-summary';
    return generateLeadReport(leadOrId, options);
  }

  function generateNegotiationGuide(leadOrId, options) {
    options = options || {};
    options.reportType = 'negotiation-guide';
    return generateLeadReport(leadOrId, options);
  }

  function generateInvestmentSnapshot(leadOrId, options) {
    options = options || {};
    options.reportType = 'investment-snapshot';
    return generateLeadReport(leadOrId, options);
  }

  function getReportsFolder() {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(FOLDER_PROPERTY);
    if (folderId) {
      try { return DriveApp.getFolderById(folderId); } catch (ignore) {}
    }
    const folders = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DEFAULT_FOLDER_NAME);
    props.setProperty(FOLDER_PROPERTY, folder.getId());
    return folder;
  }

  function setReportsFolder(folderId) {
    REOS.Security.requireAdmin();
    const folder = DriveApp.getFolderById(folderId);
    PropertiesService.getScriptProperties().setProperty(FOLDER_PROPERTY, folder.getId());
    return { ok: true, folderId: folder.getId(), folderName: folder.getName(), url: folder.getUrl() };
  }

  function buildReportModel_(lead, summaryResult) {
    const summary = summaryResult.summary;
    const qualification = summaryResult.qualification;
    const action = summaryResult.action;
    const offer = summaryResult.offerGuidance;
    const title = 'REOS Acquisition Report - ' + sanitizeTitle_(lead['Property Address'] || lead['Lead ID'] || 'Lead');

    return {
      title: title,
      reportType: 'acquisition-report',
      version: REPORT_VERSION,
      generatedAt: REOS.nowIso_(),
      lead: lead,
      sections: {
        executiveSummary: summary.executiveSummary,
        propertySnapshot: summary.propertyOverview,
        sellerProfile: summary.sellerProfile,
        distressAnalysis: {
          motivationSummary: summary.motivationSummary,
          distressSignals: qualification.distressSignals || [],
          motivationTags: qualification.motivationTags || []
        },
        leadScore: {
          score: qualification.score,
          grade: qualification.grade,
          confidence: qualification.confidence,
          urgency: qualification.urgency,
          scoreFactors: qualification.scoreFactors || []
        },
        negotiationStrategy: buildNegotiationStrategy_(lead, qualification, action),
        offerRecommendation: offer,
        investmentMetrics: buildInvestmentMetrics_(lead, offer),
        riskMatrix: buildRiskMatrix_(summary, qualification),
        actionPlan: action.actionPlan || [],
        recommendedNextSteps: buildRecommendedNextSteps_(action, qualification)
      }
    };
  }

  function createGoogleDoc_(report, options) {
    const folder = getReportsFolder();
    const doc = DocumentApp.create(report.title);
    const file = DriveApp.getFileById(doc.getId());
    folder.addFile(file);
    try { DriveApp.getRootFolder().removeFile(file); } catch (ignore) {}

    const body = doc.getBody();
    body.clear();
    addTitle_(body, report.title);
    addParagraph_(body, 'Generated: ' + report.generatedAt);
    addParagraph_(body, 'Report Version: ' + report.version);

    addHeading_(body, 'Executive Summary');
    addParagraph_(body, report.sections.executiveSummary);

    addHeading_(body, 'Property Snapshot');
    addKeyValueTable_(body, report.sections.propertySnapshot);

    addHeading_(body, 'Seller Profile');
    addKeyValueTable_(body, report.sections.sellerProfile);

    addHeading_(body, 'Distress & Motivation Analysis');
    addParagraph_(body, report.sections.distressAnalysis.motivationSummary);
    addBulletList_(body, 'Motivation Tags', report.sections.distressAnalysis.motivationTags);
    addBulletList_(body, 'Distress Signals', report.sections.distressAnalysis.distressSignals);

    addHeading_(body, 'AI Lead Score');
    addKeyValueTable_(body, report.sections.leadScore);

    addHeading_(body, 'Negotiation Strategy');
    addBulletList_(body, 'Seller Talking Points', report.sections.negotiationStrategy.sellerTalkingPoints);
    addBulletList_(body, 'Objection Handling', report.sections.negotiationStrategy.objectionHandling);
    addBulletList_(body, 'Price Reduction Opportunities', report.sections.negotiationStrategy.priceReductionOpportunities);

    addHeading_(body, 'Offer Recommendation');
    addKeyValueTable_(body, report.sections.offerRecommendation);

    addHeading_(body, 'Investment Metrics');
    addKeyValueTable_(body, report.sections.investmentMetrics);

    addHeading_(body, 'Risk Matrix');
    addRiskTable_(body, report.sections.riskMatrix);

    addHeading_(body, 'Action Plan');
    addActionPlanTable_(body, report.sections.actionPlan);

    addHeading_(body, 'Recommended Next Steps');
    addBulletList_(body, null, report.sections.recommendedNextSteps);

    addParagraph_(body, 'Disclaimer: This report is preliminary and should be verified with property records, title review, market comps, repair estimates, tax records, and professional due diligence before making investment decisions.');

    doc.saveAndClose();
    return { id: doc.getId(), url: doc.getUrl(), file: file };
  }

  function createPdfCopy_(docFile, report) {
    const folder = getReportsFolder();
    const blob = docFile.getAs(MimeType.PDF).setName(report.title + '.pdf');
    const pdf = folder.createFile(blob);
    return { id: pdf.getId(), url: pdf.getUrl(), file: pdf };
  }

  function buildNegotiationStrategy_(lead, qualification, action) {
    const owner = lead['Owner Name'] || 'the seller';
    const address = lead['Property Address'] || 'the property';
    return {
      sellerTalkingPoints: [
        'Confirm whether ' + owner + ' is still interested in selling ' + address + '.',
        'Ask what outcome matters most: speed, certainty, price, repairs, or convenience.',
        'Confirm property condition, occupancy, liens, taxes, and timeline.',
        'Position the offer around certainty, fast closing, and reduced seller burden.'
      ],
      objectionHandling: [
        'If price is too low: anchor on repair risk, holding costs, closing certainty, and as-is convenience.',
        'If seller needs time: offer a flexible closing timeline when feasible.',
        'If seller is comparing offers: ask about net proceeds, contingencies, and closing certainty.',
        'If seller is unsure: schedule a follow-up and send a simple written summary.'
      ],
      priceReductionOpportunities: (qualification.riskFlags || []).concat(qualification.missingData || []).slice(0, 6),
      recommendedPrimaryAction: action.primaryAction,
      recommendedChannel: action.recommendedChannel
    };
  }

  function buildInvestmentMetrics_(lead, offer) {
    const estimatedValue = number_(lead['Estimated Value']);
    const askingPrice = number_(lead['Asking Price']);
    const offerHigh = number_(offer.high);
    const offerLow = number_(offer.low);
    const targetOffer = offerHigh || askingPrice || 0;
    const equityCapture = estimatedValue && targetOffer ? estimatedValue - targetOffer : 0;
    const equityCapturePercent = estimatedValue && equityCapture ? Math.round((equityCapture / estimatedValue) * 100) : 0;
    return {
      estimatedValue: estimatedValue,
      askingPrice: askingPrice,
      conservativeOffer: offerLow,
      targetOffer: targetOffer,
      estimatedEquityCapture: equityCapture,
      estimatedEquityCapturePercent: equityCapturePercent + '%',
      flipPotential: equityCapturePercent >= 30 ? 'Strong' : equityCapturePercent >= 18 ? 'Moderate' : 'Needs Review',
      rentalPotential: number_(lead['Monthly Rent']) > 0 ? 'Rent data available' : 'Needs rent estimate',
      underwritingStatus: estimatedValue && targetOffer ? 'Preliminary' : 'Incomplete data'
    };
  }

  function buildRiskMatrix_(summary, qualification) {
    const rows = [];
    (qualification.riskFlags || []).forEach(function (risk) { rows.push({ risk: risk, severity: 'High', mitigation: 'Verify before offer or include contingency.' }); });
    (qualification.missingData || []).forEach(function (item) { rows.push({ risk: 'Missing ' + item, severity: 'Medium', mitigation: 'Collect data before final underwriting.' }); });
    if (!rows.length) rows.push({ risk: 'No major flags detected', severity: 'Low', mitigation: 'Continue normal due diligence.' });
    return rows;
  }

  function buildRecommendedNextSteps_(action, qualification) {
    const steps = [
      action.primaryAction + ' by ' + action.dueDate + '.',
      'Review AI score factors and confirm seller motivation.',
      'Verify property value, repair estimate, taxes, liens, and ownership.',
      'Update lead status and next follow-up date after outreach.'
    ];
    if ((qualification.missingData || []).length) steps.push('Resolve missing data: ' + qualification.missingData.join(', ') + '.');
    return steps;
  }

  function addTitle_(body, text) { body.appendParagraph(text).setHeading(DocumentApp.ParagraphHeading.TITLE); }
  function addHeading_(body, text) { body.appendParagraph(text).setHeading(DocumentApp.ParagraphHeading.HEADING1); }
  function addParagraph_(body, text) { body.appendParagraph(String(text || '')); }

  function addBulletList_(body, label, items) {
    if (label) body.appendParagraph(label).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    items = items || [];
    if (!items.length) body.appendListItem('None noted.');
    items.forEach(function (item) { body.appendListItem(String(item)); });
  }

  function addKeyValueTable_(body, obj) {
    const rows = Object.keys(obj || {}).map(function (key) {
      let value = obj[key];
      if (Array.isArray(value)) value = value.join(', ');
      if (typeof value === 'object' && value !== null) value = REOS.toJson_(value);
      return [key, String(value === undefined || value === null ? '' : value)];
    });
    if (!rows.length) rows.push(['No data', '']);
    body.appendTable([['Field', 'Value']].concat(rows));
  }

  function addRiskTable_(body, rows) {
    const table = [['Risk', 'Severity', 'Mitigation']].concat((rows || []).map(function (row) {
      return [row.risk || '', row.severity || '', row.mitigation || ''];
    }));
    body.appendTable(table);
  }

  function addActionPlanTable_(body, actions) {
    const table = [['Action', 'Priority', 'Due In Days', 'Reason']].concat((actions || []).map(function (action) {
      return [action.name || '', action.priority || '', String(action.dueInDays || 0), action.reason || ''];
    }));
    body.appendTable(table.length > 1 ? table : [['Action', 'Priority', 'Due In Days', 'Reason'], ['No action plan', '', '', '']]);
  }

  function resolveLead_(leadOrId) {
    const lead = typeof leadOrId === 'string' ? REOS.Acquisitions.getLead(leadOrId) : leadOrId;
    if (!lead) throw new Error('Lead not found for AI report.');
    return lead;
  }

  function sanitizeTitle_(value) { return String(value || '').replace(/[\\/:*?"<>|#%{}~&]/g, '-').slice(0, 120); }
  function number_(value) { const n = Number(value || 0); return isNaN(n) ? 0 : n; }

  return {
    generateLeadReport: generateLeadReport,
    generateSellerSummary: generateSellerSummary,
    generateNegotiationGuide: generateNegotiationGuide,
    generateInvestmentSnapshot: generateInvestmentSnapshot,
    getReportsFolder: getReportsFolder,
    setReportsFolder: setReportsFolder
  };
})();

function reosAIGenerateLeadReport(leadOrId, options) { return REOS.AIReports.generateLeadReport(leadOrId, options || {}); }
function reosAIGenerateSellerSummary(leadOrId, options) { return REOS.AIReports.generateSellerSummary(leadOrId, options || {}); }
function reosAIGenerateNegotiationGuide(leadOrId, options) { return REOS.AIReports.generateNegotiationGuide(leadOrId, options || {}); }
function reosAIGenerateInvestmentSnapshot(leadOrId, options) { return REOS.AIReports.generateInvestmentSnapshot(leadOrId, options || {}); }
function reosAIGetReportsFolder() { const folder = REOS.AIReports.getReportsFolder(); return { folderId: folder.getId(), folderName: folder.getName(), url: folder.getUrl() }; }
function reosAISetReportsFolder(folderId) { return REOS.AIReports.setReportsFolder(folderId); }
