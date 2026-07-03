/**
 * REOS Enterprise v3.0 - Follow-Up Automation Framework
 *
 * Creates lead/client follow-up sequences and nurture task plans.
 */

var REOS = REOS || {};

REOS.FollowUp = (function () {
  const SEQUENCES_SHEET = 'FOLLOWUP_SEQUENCES';
  const ID_FIELD = 'Sequence ID';

  const HEADERS = [
    'Sequence ID', 'Client ID', 'Lead ID', 'Sequence Type', 'Start Date',
    'Status', 'Step Count', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const SEQUENCES = {
    'New Lead': [
      { days: 0, task: 'Call new lead', priority: 'High' },
      { days: 1, task: 'Send follow-up email', priority: 'High' },
      { days: 3, task: 'Second call attempt', priority: 'Medium' },
      { days: 7, task: 'Send value-add market update', priority: 'Medium' },
      { days: 14, task: 'Long-term nurture check-in', priority: 'Low' }
    ],
    'Past Client': [
      { days: 30, task: 'Post-closing check-in', priority: 'Medium' },
      { days: 180, task: 'Home anniversary touchpoint', priority: 'Medium' },
      { days: 365, task: 'Annual real estate review', priority: 'High' }
    ],
    'Investor': [
      { days: 1, task: 'Send deal criteria form', priority: 'High' },
      { days: 7, task: 'Investor deal criteria review', priority: 'Medium' },
      { days: 30, task: 'Send investor opportunity update', priority: 'Medium' }
    ]
  };

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SEQUENCES_SHEET);
    if (!sheet) sheet = ss.insertSheet(SEQUENCES_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function startSequence(clientId, leadId, sequenceType, notes) {
    REOS.Security.requirePermission('tasks:write');
    ensureSheet();

    sequenceType = sequenceType || 'New Lead';
    const steps = SEQUENCES[sequenceType] || SEQUENCES['New Lead'];
    const startDate = new Date();

    const sequence = REOS.Database.insert(SEQUENCES_SHEET, {
      'Client ID': clientId || '',
      'Lead ID': leadId || '',
      'Sequence Type': sequenceType,
      'Start Date': startDate,
      Status: 'Active',
      'Step Count': steps.length,
      Notes: notes || '',
      Active: true
    }, {
      idField: ID_FIELD,
      idPrefix: 'FU'
    });

    steps.forEach(function (step) {
      const due = new Date(startDate);
      due.setDate(due.getDate() + step.days);
      REOS.Tasks.create({
        'Client ID': clientId || '',
        'Lead ID': leadId || '',
        Task: step.task,
        Category: 'Follow-up',
        Priority: step.priority,
        'Due Date': due,
        Notes: 'Follow-up sequence: ' + sequence[ID_FIELD] + ' | ' + sequenceType
      });
    });

    REOS.Logger.audit('Follow-up sequence started', { sequenceId: sequence[ID_FIELD], type: sequenceType, steps: steps.length });
    return sequence;
  }

  function startNewLeadSequence(lead) {
    lead = lead || {};
    return startSequence(lead['Client ID'] || lead.clientId || '', lead['Lead ID'] || lead.leadId || '', 'New Lead', 'Started from new lead automation.');
  }

  function listActive() {
    REOS.Security.requirePermission('tasks:read');
    ensureSheet();
    return REOS.Database.query(SEQUENCES_SHEET, function (sequence) {
      return sequence.Active !== false && String(sequence.Status || '').toLowerCase() === 'active';
    });
  }

  return {
    ensureSheet: ensureSheet,
    startSequence: startSequence,
    startNewLeadSequence: startNewLeadSequence,
    listActive: listActive
  };
})();

function followUpStartSequence(clientId, leadId, sequenceType, notes) {
  return REOS.FollowUp.startSequence(clientId, leadId, sequenceType, notes);
}
