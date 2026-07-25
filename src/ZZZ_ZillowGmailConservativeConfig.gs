/**
 * REOS Enterprise v4.5.1 - Conservative Zillow Gmail configuration helper.
 */
function reosZillowGmailConfigureConservative() {
  return reosZillowGmailConfigure({
    labels: [
      'Zillow/New Leads',
      'Zillow/Buyer Leads',
      'Zillow/Seller Leads',
      'Zillow/Rental Leads'
    ],
    importedLabel: 'Zillow/Imported',
    errorLabel: 'Zillow/Errors',
    maxThreadsPerLabel: 3,
    lookbackDays: 7,
    markRead: false,
    archiveAfterImport: false,
    runDownstreamIngestion: false,
    scoreLeads: false,
    autoPromote: false,
    defaultCity: 'Philadelphia',
    defaultState: 'PA',
    defaultAssignedTo: ''
  });
}
