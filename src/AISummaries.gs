/**
 * REOS Enterprise v3.0 - AI Summary Generator
 *
 * Sprint 4 foundation for executive lead summaries, seller profiles,
 * motivation summaries, risk summaries, acquisition recommendations,
 * offer-range guidance, and follow-up strategies.
 */

var REOS = REOS || {};

REOS.AISummaries = (function () {
  const SUMMARY_VERSION = '1.0.0';

  function generateLeadSummary(leadOrId, options) {
    REOS.Security.requirePermission('ai:use');
    REOS.Security.requirePermission('leads:read');
    options = options || {};

    const lead = resolveLead_(leadOrId);
    const qualification = getQualification_(lead);
    const action = getAction_(lead);
    const offer = buildOfferGuidance_(lead, qualification);
    const summary = buildSummary_(lead, qualification, action, offer);

    logSummary_(lead, summary, options);
    return {
      ok: true,
      version: SUMMARY_VERSION,
      leadId: lead['Lead ID'] || '',
      generatedAt: REOS.nowIso_(),
      summary: summary,
      qualification: qualification,
      action: action,
      offerGuidance: offer
    };
  }

  function generateLeadSummaryText(leadOrId, options) {
    const result = generateLeadSummary(leadOrId, options || {});
    return renderExecutiveSummary_(result.summary, result.qualification, result.action, result.offerGuidance);
  }

  function generateBatchSummaries(options) {
    REOS.Security.requirePermission('ai:use');
    REOS.Security.requirePermission('leads:read');
    options = options || {};
    const limit = Number(options.limit || 25);
    const leads = REOS.Acquisitions.listLeads({ limit: limit });

    return leads.map(function (lead) {
      const result = generateLeadSummary(lead, { skipLog: true });
      return {
        'Lead ID': lead['Lead ID'],
        'Property Address': lead['Property Address'],
        'Owner Name': lead['Owner Name'],
        Score: result.qualification.score,
        Grade: result.qualification.grade,
        Confidence: result.qualification.confidence,
        'Primary Action': result.action.primaryAction,
        Priority: result.action.priority,
        'Offer Range': result.offerGuidance.offerRangeLabel,
        Summary: result.summary.executiveSummary
      };
    });
  }

  function buildSummary_(lead, qualification, action, offer) {
    return {
      executiveSummary: buildExecutiveSummary_(lead, qualification, action, offer),
      propertyOverview: buildPropertyOverview_(lead),
      sellerProfile: buildSellerProfile_(lead, qualification),
      motivationSummary: buildMotivationSummary_(qualification),
      risks: buildRiskSummary_(qualification),
      estimatedEquity: buildEquitySummary_(lead),
      acquisitionRecommendation: buildAcquisitionRecommendation_(qualification, action),
      suggestedOfferRange: offer,
      followUpStrategy: buildFollowUpStrategy_(action, qualification),
      dataGaps: qualification.missingData || []
    };
  }

  function buildExecutiveSummary_(lead, qualification, action, offer) {
    const address = lead['Property Address'] || 'Unknown property';
    const owner = lead['Owner Name'] || 'Unknown owner';
    return address + ' is a grade ' + qualification.grade + ' lead with a score of ' + qualification.score +
      ' and ' + qualification.confidence + '% confidence. Owner: ' + owner + '. Primary recommendation: ' +
      action.primaryAction + ' (' + action.priority + '). Suggested offer guidance: ' + offer.offerRangeLabel + '.';
  }

  function buildPropertyOverview_(lead) {
    return {
      address: lead['Property Address'] || '',
      city: lead.City || '',
      state: lead.State || '',
      zip: lead.Zip || '',
      propertyType: lead['Property Type'] || '',
      bedrooms: lead.Bedrooms || '',
      bathrooms: lead.Bathrooms || '',
      estimatedValue: number_(lead['Estimated Value']),
      askingPrice: number_(lead['Asking Price']),
      distressIndicator: lead['Distress Indicator'] || ''
    };
  }

  function buildSellerProfile_(lead, qualification) {
    return {
      ownerName: lead['Owner Name'] || '',
      ownerPhone: lead['Owner Phone'] || '',
      ownerEmail: lead['Owner Email'] || '',
      contactCompleteness: getContactCompleteness_(lead),
      motivationTags: qualification.motivationTags || [],
      urgency: qualification.urgency || 'Unknown'
    };
  }

  function buildMotivationSummary_(qualification) {
    const tags = qualification.motivationTags || [];
    const signals = qualification.distressSignals || [];
    if (!tags.length && !signals.length) {
      return 'No strong seller motivation signal is confirmed yet. More research or direct seller discovery is needed.';
    }
    return 'Likely motivation drivers: ' + tags.concat(signals).filter(Boolean).join(', ') + '.';
  }

  function buildRiskSummary_(qualification) {
    const risks = qualification.riskFlags || [];
    const missing = qualification.missingData || [];
    return {
      riskFlags: risks,
      missingData: missing,
      summary: risks.length ? 'Review these risks before making a firm offer: ' + risks.join(', ') + '.' : 'No major risk flags detected from current data.'
    };
  }

  function buildEquitySummary_(lead) {
    const estimatedValue = number_(lead['Estimated Value']);
    const askingPrice = number_(lead['Asking Price']);
    const mortgageBalance = number_(lead['Mortgage Balance']);
    const estimatedSpread = estimatedValue && askingPrice ? estimatedValue - askingPrice : 0;
    const estimatedEquity = estimatedValue && mortgageBalance ? estimatedValue - mortgageBalance : 0;
    return {
      estimatedValue: estimatedValue,
      askingPrice: askingPrice,
      mortgageBalance: mortgageBalance,
      estimatedSpread: estimatedSpread,
      estimatedEquity: estimatedEquity,
      summary: estimatedValue ? 'Estimated value is $' + estimatedValue + '. Spread/equity should be verified before offer.' : 'Estimated value is missing.'
    };
  }

  function buildAcquisitionRecommendation_(qualification, action) {
    if (qualification.score >= 80) return 'Pursue aggressively. Validate condition, confirm motivation, and prepare offer range.';
    if (qualification.score >= 65) return 'Pursue with high-touch follow-up and valuation verification.';
    if (qualification.score >= 50) return 'Nurture lead while verifying distress, equity, and seller timeline.';
    return 'Research-first. Do not prioritize until more motivation or pricing data is confirmed.';
  }

  function buildOfferGuidance_(lead, qualification) {
    const estimatedValue = number_(lead['Estimated Value']);
    const askingPrice = number_(lead['Asking Price']);
    let low = 0;
    let high = 0;
    let method = 'insufficient-data';

    if (estimatedValue) {
      if (qualification.score >= 80) {
        low = Math.round(estimatedValue * 0.55);
        high = Math.round(estimatedValue * 0.68);
      } else if (qualification.score >= 65) {
        low = Math.round(estimatedValue * 0.58);
        high = Math.round(estimatedValue * 0.72);
      } else {
        low = Math.round(estimatedValue * 0.50);
        high = Math.round(estimatedValue * 0.65);
      }
      method = 'estimated-value-discount';
    }

    if (askingPrice && high && askingPrice < high) high = askingPrice;
    if (high && low > high) low = Math.max(0, Math.round(high * 0.9));

    return {
      low: low,
      high: high,
      method: method,
      offerRangeLabel: low && high ? '$' + low + ' - $' + high : 'Needs valuation data',
      disclaimer: 'Preliminary guidance only. Confirm ARV, repairs, liens, taxes, title, and local market conditions before making an offer.'
    };
  }

  function buildFollowUpStrategy_(action, qualification) {
    return {
      primaryAction: action.primaryAction,
      priority: action.priority,
      dueDate: action.dueDate,
      dueInDays: action.dueInDays,
      recommendedChannel: action.recommendedChannel,
      notes: action.reasoning,
      suggestedFollowUpDays: qualification.suggestedFollowUpDays
    };
  }

  function renderExecutiveSummary_(summary, qualification, action, offer) {
    return [
      'AI Lead Summary',
      '',
      summary.executiveSummary,
      '',
      'Property Overview:',
      '- Address: ' + summary.propertyOverview.address,
      '- Type: ' + summary.propertyOverview.propertyType,
      '- Estimated Value: $' + summary.propertyOverview.estimatedValue,
      '- Asking Price: $' + summary.propertyOverview.askingPrice,
      '',
      'Seller / Motivation:',
      '- Owner: ' + summary.sellerProfile.ownerName,
      '- Motivation: ' + summary.motivationSummary,
      '',
      'Recommendation:',
      '- Score: ' + qualification.score + ' / Grade: ' + qualification.grade + ' / Confidence: ' + qualification.confidence + '%',
      '- Next Action: ' + action.primaryAction + ' (' + action.priority + ')',
      '- Offer Guidance: ' + offer.offerRangeLabel,
      '',
      'Risks:',
      '- ' + summary.risks.summary,
      '',
      'Follow-up:',
      '- Due Date: ' + action.dueDate,
      '- Channel: ' + action.recommendedChannel
    ].join('\n');
  }

  function getQualification_(lead) {
    if (REOS.AI && typeof REOS.AI.qualifyLeadRulesOnly === 'function') {
      return REOS.AI.qualifyLeadRulesOnly(lead).parsed;
    }
    throw new Error('AI qualification engine unavailable.');
  }

  function getAction_(lead) {
    if (REOS.AI && typeof REOS.AI.recommendNextBestAction === 'function') {
      return REOS.AI.recommendNextBestAction(lead, {}).action;
    }
    throw new Error('AI next-best-action engine unavailable.');
  }

  function resolveLead_(leadOrId) {
    const lead = typeof leadOrId === 'string' ? REOS.Acquisitions.getLead(leadOrId) : leadOrId;
    if (!lead) throw new Error('Lead not found for AI summary.');
    return lead;
  }

  function getContactCompleteness_(lead) {
    let count = 0;
    if (lead['Owner Phone']) count++;
    if (lead['Owner Email']) count++;
    if (lead['Owner Name']) count++;
    return count === 3 ? 'Complete' : count === 2 ? 'Partial' : count === 1 ? 'Limited' : 'Missing';
  }

  function logSummary_(lead, summary, options) {
    if (options && options.skipLog) return null;
    REOS.Logger.info('AI lead summary generated', {
      leadId: lead['Lead ID'] || '',
      address: lead['Property Address'] || '',
      recommendation: summary.acquisitionRecommendation
    });
    return true;
  }

  function number_(value) {
    const n = Number(value || 0);
    return isNaN(n) ? 0 : n;
  }

  return {
    generateLeadSummary: generateLeadSummary,
    generateLeadSummaryText: generateLeadSummaryText,
    generateBatchSummaries: generateBatchSummaries
  };
})();

function reosAISummarizeLead(leadOrId, options) { return REOS.AISummaries.generateLeadSummary(leadOrId, options || {}); }
function reosAISummarizeLeadText(leadOrId, options) { return REOS.AISummaries.generateLeadSummaryText(leadOrId, options || {}); }
function reosAIGenerateBatchSummaries(options) { return REOS.AISummaries.generateBatchSummaries(options || {}); }
