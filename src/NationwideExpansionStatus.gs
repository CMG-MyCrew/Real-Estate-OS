/**
 * REOS Nationwide Expansion Status
 */
var REOS = REOS || {};

function REOS_NATIONWIDE_SET_STATUS(status) {
  status = status || {};
  status.updatedAt =
    new Date().toISOString();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      'REOS_NATIONWIDE_EXPANSION_STATUS',
      JSON.stringify(status)
    );

  return {
    ok: true,
    status: status.status || '',
    updatedAt: status.updatedAt
  };
}

function REOS_NATIONWIDE_GET_STATUS() {
  var raw = PropertiesService
    .getScriptProperties()
    .getProperty(
      'REOS_NATIONWIDE_EXPANSION_STATUS'
    );

  return raw
    ? JSON.parse(raw)
    : {
        ok: false,
        status: 'NOT_RUN',
        updatedAt: '',
        message:
          'No nationwide expansion status is stored.'
      };
}

function REOS_NATIONWIDE_CLEAR_STATUS() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      'REOS_NATIONWIDE_EXPANSION_STATUS'
    );

  return {
    ok: true,
    action:
      'nationwide-clear-status'
  };
}
