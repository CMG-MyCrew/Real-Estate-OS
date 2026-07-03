/**
 * REOS Enterprise v3.0 - API Web App Handlers
 *
 * Helpers for routing Apps Script web app requests into the API Platform.
 * Use with doGet/doPost dispatch in WebApp.gs or standalone deployment.
 */

var REOS = REOS || {};

REOS.APIWebApp = (function () {
  function handleGet(e) {
    e = e || { parameter: {} };
    const p = e.parameter || {};
    if (String(p.page || '').toLowerCase() === 'openapi') return json_(REOS.APIDocs.openApiSpec());
    if (String(p.page || '').toLowerCase() === 'apidocs') return text_(REOS.APIDocs.markdownDocs());

    return json_(REOS.APIPlatform.handleRequest({
      method: 'GET',
      version: p.version || 'v1',
      path: p.path || p.resource || '/',
      apiKey: p.apiKey || '',
      query: p
    }));
  }

  function handlePost(e) {
    e = e || { postData: { contents: '{}' }, parameter: {} };
    const p = e.parameter || {};
    let body = {};
    try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (error) { body = {}; }
    return json_(REOS.APIPlatform.handleRequest({
      method: 'POST',
      version: p.version || body.version || 'v1',
      path: p.path || body.path || body.resource || '/',
      apiKey: p.apiKey || body.apiKey || '',
      payload: body.payload || body,
      query: p
    }));
  }

  function json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj || {}, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }

  function text_(value) {
    return ContentService.createTextOutput(String(value || '')).setMimeType(ContentService.MimeType.TEXT);
  }

  return { handleGet: handleGet, handlePost: handlePost };
})();

function apiWebAppHandleGet(e) { return REOS.APIWebApp.handleGet(e); }
function apiWebAppHandlePost(e) { return REOS.APIWebApp.handlePost(e); }
