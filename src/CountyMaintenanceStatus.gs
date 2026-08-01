/**
 * REOS Autonomous County Maintenance Status
 */
var REOS = REOS || {};

function REOS_COUNTY_SET_MAINTENANCE_STATUS(status) {
  status = status || {};

  status.updatedAt =
    new Date().toISOString();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'REOS_COUNTY_MAINTENANCE_STATUS',
      JSON.stringify(status)
    );

  return {
    ok: true,
    updatedAt: status.updatedAt,
    status: status.status || ''
  };
}

function REOS_COUNTY_GET_MAINTENANCE_STATUS() {
  var raw = PropertiesService
    .getScriptProperties()
    .getProperty(
      'REOS_COUNTY_MAINTENANCE_STATUS'
    );

  return raw
    ? JSON.parse(raw)
    : {
        updatedAt: '',
        status: 'NOT_RUN',
        ok: false,
        message:
          'No autonomous maintenance status is stored.'
      };
}

function REOS_COUNTY_CLEAR_MAINTENANCE_STATUS() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      'REOS_COUNTY_MAINTENANCE_STATUS'
    );

  return {
    ok: true,
    action:
      'clear-maintenance-status'
  };
}
