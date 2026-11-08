/**
 * REOS Enterprise — NJ/DE morning county report appendix (SHADOW).
 *
 * Pure report model/formatter. Does NOT query Google, run a connector,
 * collect case records, create triggers or send messages.
 *
 * Protects the existing Philadelphia/PA report path: the appendix is
 * additive to the existing REOS Daily Digest, after its original content.
 * "Not available" is not misreported as zero new deals.
 */
var REOS = REOS || {};

REOS.NJDEMorningReport = (function () {
  'use strict';

  var SCHEMA = 'REOS_NJ_DE_COUNTY_MORNING_REPORT_SHADOW_V1';
  var SPECS = {
    NJ: { countyCount: 21, slots: 105, inventory: 'property_assessment',
          morningSlot: '06:00', name: 'New Jersey' },
    DE: { countyCount: 3, slots: 15, inventory: 'parcel_inventory',
          morningSlot: '07:00', name: 'Delaware' }
  };
  var TIMES = {
    NJ: ['00:00', '06:00', '12:00', '18:00'],
    DE: ['01:00', '07:00', '13:00', '19:00']
  };

  function check_(condition, code) {
    if (!condition) throw new Error(code);
  }

  function summarize_(state) {
    check_(state === 'NJ' || state === 'DE', 'MORNING_INVALID_STATE');
    check_(REOS.NJDECountyParityScheduler &&
           typeof REOS.NJDECountyParityScheduler.plan === 'function',
           'MORNING_PARITY_SCHEDULE_UNAVAILABLE');
    var p = REOS.NJDECountyParityScheduler.plan(state);
    var c = SPECS[state];
    var trigger = p && p.suggestedTrigger;
    check_(p && p.state === state &&
           p.countyCount === c.countyCount &&
           p.plannedFeedSlots === c.slots &&
           p.tasks && p.tasks.length === c.slots,
           'MORNING_COUNTY_AND_FEED_SCOPE_MISMATCH');
    check_(trigger && trigger.timezone === 'America/New_York' &&
           trigger.cadence === 'FOUR_LOCAL_WINDOWS_PER_DAY' &&
           trigger.cyclesPerDay === 4 &&
           trigger.intervalHoursLocalClock === 6 &&
           JSON.stringify(trigger.proposedLocalTimes) ===
              JSON.stringify(TIMES[state]),
           'MORNING_SIX_HOUR_PLAN_MISMATCH');
    check_(trigger.installed === false &&
           trigger.authorizedToInstall === false &&
           p.status === 'HOLD_NO_TRIGGER_NO_LIVE_INGESTION' &&
           p.acquisitionOfferAuthority === 'BLOCKED' &&
           p.tasks.every(function (task) {
             return task.state === state &&
                    task.sourceCertified === false &&
                    task.ingestionAuthorized === false &&
                    task.status === 'HOLD_NO_CERTIFIED_DISTRESS_SOURCE';
           }), 'MORNING_UNAUTHORIZED_STATUS_OR_ACTIVATION_DRIFT');

    return {
      schemaVersion: SCHEMA,
      state: state,
      label: c.name,
      countyCount: c.countyCount,
      fiveFeedSlots: c.slots,
      sixHourTimesLocal: TIMES[state].slice(),
      morningWindowLocal: c.morningSlot,
      timezone: 'America/New_York',
      certifiedDistressFeeds: 0,
      uncertifiedFeeds: c.slots,
      lastCompletedScheduledCycle: null,
      lastSuccessfulLiveIngestion: null,
      verifiedNewDistressLeads: null,
      verifiedActionableLeads: null,
      inventoryOnlyDataset: c.inventory,
      dataAvailable: false,
      executedSixHourTrigger: false,
      automationAuthorized: false,
      releaseStatus: 'HOLD_NO_CERTIFIED_DISTRESS_SOURCE',
      nextAction: 'Certify approved county feed, status identity, destination and permissions',
      lastSuccessText: 'NOT VERIFIED',
      leadCountText: 'NOT AVAILABLE — no certified live distress feed',
      paSchedulerUnchanged: true,
      maoAndOffersAuthorized: false
    };
  }

  function snapshot() {
    return {
      schemaVersion: SCHEMA,
      deliveryMode: 'APPENDIX_TO_REOS_DAILY_DIGEST_STAGED_ONLY',
      publicationAuthority: 'NOT_AUTHORIZED',
      liveRecordsInspected: 0,
      productionMutations: 0,
      totals: {
        coveredCounties: 24,
        distressFeedSlots: 120,
        certifiedDistressFeeds: 0,
        verifiedNewDistressLeads: null,
        verifiedActionableLeads: null
      },
      NJ: summarize_('NJ'),
      DE: summarize_('DE')
    };
  }

  function stateLines_(v) {
    return [
      v.label + ' (' + v.state + ') — ' + v.countyCount +
        ' counties / ' + v.fiveFeedSlots + ' planned distress-feed slots',
      'Six-hour Eastern plan: ' + v.sixHourTimesLocal.join(', ') +
        ' | morning slot ' + v.morningWindowLocal + ' (NOT INSTALLED)',
      'Certified distress feeds: ' + v.certifiedDistressFeeds +
        ' of ' + v.fiveFeedSlots,
      'New distress leads: ' + v.leadCountText,
      'Latest completed run: ' + v.lastSuccessText,
      'Current source: ' + v.inventoryOnlyDataset +
        ' (inventory, NOT a distress event)',
      'Status: HOLD — no approved ingestion, no live county trigger'
    ];
  }

  function renderText() {
    var s = snapshot();
    return [
      '',
      'REOS COUNTY MORNING REPORT — NJ / DE',
      'Source status: UNCERTIFIED — no live state feeds',
      ''
    ].concat(stateLines_(s.NJ), [''], stateLines_(s.DE), [
      '',
      'PA / Philadelphia: existing daily report content and scheduler unchanged.',
      'NJ/DE source certification: 0 of 120 | State triggers installed: NONE',
      'NJ/DE execution-API protective closure: NOT ATTESTED',
      'MAO and automatic offers: BLOCKED without comp-supported ARV and repair scope',
      'NOTE: NOT AVAILABLE does not mean zero properties or zero opportunities.'
    ]).join('\n');
  }

  return Object.freeze({
    schemaVersion: SCHEMA,
    snapshot: snapshot,
    renderText: renderText
  });
})();
