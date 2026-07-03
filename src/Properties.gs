/**
 * REOS Enterprise v3.0 - Properties Framework
 *
 * Master property database used by transactions, flips, rentals, and investments.
 */

var REOS = REOS || {};

REOS.Properties = (function () {
  const SHEET = 'PROPERTIES';
  const ID_FIELD = 'Property ID';

  const HEADERS = [
    'Property ID', 'Address', 'City', 'State', 'ZIP', 'MLS Number',
    'Property Type', 'Strategy', 'Acquisition Status', 'Owner Client ID',
    'Purchase Date', 'Purchase Price', 'Current Value', 'ARV', 'Bedrooms',
    'Bathrooms', 'Square Feet', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function create(property) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    property = property || {};
    property.Active = property.Active === false ? false : true;
    property['Acquisition Status'] = property['Acquisition Status'] || 'Prospect';

    const validation = REOS.Validation.validateRecord(property, {
      required: ['Address', 'Property Type', 'Strategy'],
      dateFields: ['Purchase Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, property, {
      idField: ID_FIELD,
      idPrefix: REOS.CONFIG.IDS.PROPERTY
    });
    REOS.Logger.audit('Property created', { propertyId: created[ID_FIELD] });
    return created;
  }

  function update(propertyId, changes) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();
    const updated = REOS.Database.update(SHEET, ID_FIELD, propertyId, changes || {});
    REOS.Logger.audit('Property updated', { propertyId: propertyId });
    return updated;
  }

  function get(propertyId) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, propertyId);
  }

  function listActive() {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (property) {
      return property.Active !== false;
    });
  }

  function search(query) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    const q = String(query || '').trim().toLowerCase();
    return REOS.Database.query(SHEET, function (property) {
      if (!q) return property.Active !== false;
      return [property.Address, property.City, property.State, property['MLS Number'], property.Strategy]
        .join(' ')
        .toLowerCase()
        .indexOf(q) !== -1;
    }).slice(0, 50);
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    get: get,
    listActive: listActive,
    search: search
  };
})();

function propertiesCreate(property) {
  return REOS.Properties.create(property);
}

function propertiesSearch(query) {
  return REOS.Properties.search(query);
}
