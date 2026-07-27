/**
 * Non-destructive deployment checks for Zillow lead automation.
 */
function reosTestZillowLeadAutomation() {
  if (!REOS.ZillowLeadAutomation) throw new Error('ZillowLeadAutomation.gs is not loaded.');

  var sample = {
    'Gmail Message ID': 'SMOKE-TEST-NOT-IMPORTED',
    'Source Label': 'Zillow/Buyer Leads',
    'Subject': 'New Zillow buyer inquiry - tour request',
    'Buyer Name': 'Test Buyer',
    'Buyer Email': 'test@example.com',
    'Buyer Phone': '(215) 555-0100',
    'Property Address': '123 Test Street, Philadelphia, PA',
    'Listing URL': 'https://www.zillow.com/example',
    'Message': 'I am pre-approved and ready to schedule a showing today.'
  };

  var classification = REOS.ZillowLeadAutomation.classify(sample);
  var score = REOS.ZillowLeadAutomation.score(sample, classification);
  var dashboard = REOS.ZillowLeadAutomation.dashboard();
  var result = {
    ok: classification === 'Buyer' && score >= 75 && Boolean(dashboard),
    classification: classification,
    score: score,
    dashboardAvailable: Boolean(dashboard)
  };

  console.log(JSON.stringify(result));
  return result;
}

function reosTestZillowAutomationDashboard() {
  var result = REOS.ZillowLeadAutomation.dashboard();
  console.log(JSON.stringify(result));
  return result;
}
