/**
 * REOS Enterprise v3.0 - Client Portal Framework
 *
 * Client-facing portal data aggregation for transaction, rental, investor,
 * and general client access.
 */

var REOS = REOS || {};

REOS.ClientPortal = (function () {
  function getPortalData(token, email) {
    const access = REOS.Portal.authenticate(token, email);
    const recordType = String(access['Record Type'] || '');
    const recordId = String(access['Record ID'] || '');

    return {
      access: sanitizeAccess_(access),
      summary: getSummary_(recordType, recordId, access),
      tasks: getTasks_(access),
      documents: getDocuments_(recordId),
      signatures: getSignatureRequests_(recordId),
      timeline: getTimeline_(access),
      generatedAt: new Date()
    };
  }

  function createClientAccess(clientId, email, recordType, recordId, notes) {
    REOS.Security.requirePermission('documents:write');
    return REOS.Portal.createAccess({
      'Client ID': clientId || '',
      'Client Email': email,
      'Record Type': recordType || 'Client',
      'Record ID': recordId || clientId,
      'Portal Role': 'Client',
      Notes: notes || ''
    });
  }

  function getSummary_(recordType, recordId, access) {
    if (recordType === 'Transaction') return transactionSummary_(recordId);
    if (recordType === 'Rental') return rentalSummary_(recordId);
    if (recordType === 'Investment') return investmentSummary_(recordId);
    return clientSummary_(access['Client ID'] || recordId);
  }

  function transactionSummary_(transactionId) {
    const tx = REOS.Transactions.get(transactionId);
    if (!tx) return { type: 'Transaction', status: 'Not Found' };
    return {
      type: 'Transaction',
      title: tx.Address || tx['Transaction ID'],
      status: tx.Status,
      closingDate: tx['Closing Date'],
      daysRemaining: tx['Days Remaining'],
      transactionType: tx['Transaction Type'],
      salePrice: tx['Sale Price']
    };
  }

  function rentalSummary_(rentalId) {
    const rental = REOS.Rentals.get(rentalId);
    if (!rental) return { type: 'Rental', status: 'Not Found' };
    return {
      type: 'Rental',
      title: rental.Address || rental['Rental ID'],
      status: rental.Status,
      occupancyStatus: rental['Occupancy Status'],
      monthlyRent: rental['Monthly Rent'],
      leaseId: rental['Lease ID']
    };
  }

  function investmentSummary_(investmentId) {
    const investment = REOS.Investments.get(investmentId);
    if (!investment) return { type: 'Investment', status: 'Not Found' };
    return {
      type: 'Investment',
      title: investment['Property ID'] || investment['Investment ID'],
      status: investment.Status,
      strategy: investment.Strategy,
      estimatedProfit: investment['Estimated Profit'],
      roi: investment.ROI,
      monthlyCashFlow: investment['Monthly Cash Flow']
    };
  }

  function clientSummary_(clientId) {
    let contact = null;
    try { contact = REOS.CRM.getContact(clientId); } catch (ignore) {}
    return {
      type: 'Client',
      title: contact ? contact['Full Name'] : clientId,
      status: contact ? contact.Status : 'Active',
      clientType: contact ? contact['Client Type'] : '',
      nextFollowUp: contact ? contact['Next Follow-up'] : ''
    };
  }

  function getTasks_(access) {
    const clientId = access['Client ID'];
    const recordId = access['Record ID'];
    return REOS.Tasks.listActive().filter(function (task) {
      return String(task['Client ID'] || '') === String(clientId || '') ||
        String(task.Notes || '').indexOf(recordId) !== -1;
    }).slice(0, 20);
  }

  function getDocuments_(recordId) {
    try {
      return REOS.Documents.listForRecord(recordId).map(function (doc) {
        return {
          'Document ID': doc['Document ID'],
          'Document Name': doc['Document Name'],
          'Document Type': doc['Document Type'],
          Status: doc.Status,
          'Signature Status': doc['Signature Status'],
          'Drive URL': doc['Drive URL'],
          Version: doc.Version,
          Verified: doc.Verified
        };
      });
    } catch (error) {
      return [];
    }
  }

  function getSignatureRequests_(recordId) {
    try {
      const docs = REOS.Documents.listForRecord(recordId);
      const docIds = docs.map(function (doc) { return String(doc['Document ID'] || ''); });
      return REOS.Esign.listOpen().filter(function (request) {
        return docIds.indexOf(String(request['Document ID'] || '')) !== -1;
      }).slice(0, 20);
    } catch (error) {
      return [];
    }
  }

  function getTimeline_(access) {
    const clientId = access['Client ID'];
    if (!clientId) return [];
    try {
      return REOS.Activities.listForClient(clientId).slice(-20).reverse();
    } catch (error) {
      return [];
    }
  }

  function sanitizeAccess_(access) {
    return {
      recordId: access['Record ID'],
      recordType: access['Record Type'],
      clientId: access['Client ID'],
      clientEmail: access['Client Email'],
      portalRole: access['Portal Role'],
      status: access.Status
    };
  }

  return {
    getPortalData: getPortalData,
    createClientAccess: createClientAccess
  };
})();

function clientPortalGetData(token, email) { return REOS.ClientPortal.getPortalData(token, email); }
function clientPortalCreateAccess(clientId, email, recordType, recordId, notes) {
  return REOS.ClientPortal.createClientAccess(clientId, email, recordType, recordId, notes);
}
