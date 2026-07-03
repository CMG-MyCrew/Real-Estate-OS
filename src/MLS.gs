/** REOS Enterprise v3.0 - MLS / RESO Integration Adapter */
var REOS = REOS || {};

REOS.MLS = (function () {
  function execute(action, options) {
    if (action === 'searchListings') return searchListings(options);
    if (action === 'importListing') return importListing(options);
    throw new Error('Unknown MLS action: ' + action);
  }

  function searchListings(options) {
    options = options || {};
    const baseUrl = options.baseUrl || REOS.Integrations.getCredential('MLS_BASE_URL');
    const token = options.token || REOS.Integrations.getCredential('MLS_ACCESS_TOKEN');
    if (!baseUrl || !token) throw new Error('Missing MLS base URL or token.');
    const query = options.query || '$top=10';
    const res = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/Property?' + query, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: JSON.parse(res.getContentText() || '{}') };
  }

  function importListing(options) {
    const listing = options.listing || {};
    return REOS.Properties.create({
      Address: listing.UnparsedAddress || listing.Address || '',
      City: listing.City || '',
      State: listing.StateOrProvince || '',
      ZIP: listing.PostalCode || '',
      'MLS Number': listing.ListingId || '',
      'Property Type': listing.PropertyType || 'Residential',
      Strategy: options.strategy || 'Retail',
      'Acquisition Status': 'MLS Imported',
      'Current Value': listing.ListPrice || 0,
      Bedrooms: listing.BedroomsTotal || '',
      Bathrooms: listing.BathroomsTotalInteger || '',
      'Square Feet': listing.LivingArea || '',
      Notes: JSON.stringify(listing)
    });
  }

  return { execute: execute, searchListings: searchListings, importListing: importListing };
})();
