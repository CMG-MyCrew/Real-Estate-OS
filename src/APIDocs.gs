/**
 * REOS Enterprise v3.0 - API Documentation Framework
 *
 * Generates lightweight OpenAPI documentation from API endpoint registry.
 */

var REOS = REOS || {};

REOS.APIDocs = (function () {
  function openApiSpec() {
    REOS.APIPlatform.seedEndpoints();
    const endpoints = REOS.Database.getAll('API_ENDPOINTS');
    const paths = {};

    endpoints.forEach(function (ep) {
      const path = ep.Path;
      const method = String(ep.Method || 'GET').toLowerCase();
      paths[path] = paths[path] || {};
      paths[path][method] = {
        summary: ep.Description || ep.Resource,
        operationId: method + ep.Resource,
        security: [{ ApiKeyAuth: [] }],
        parameters: method === 'get' ? [{ name: 'apiKey', in: 'query', required: true, schema: { type: 'string' } }] : [],
        requestBody: method === 'post' ? {
          required: false,
          content: { 'application/json': { schema: { type: 'object' } } }
        } : undefined,
        responses: {
          '200': { description: 'Successful response' },
          '401': { description: 'Unauthorized' },
          '429': { description: 'Rate limited' },
          '500': { description: 'Server error' }
        }
      };
    });

    return {
      openapi: '3.0.3',
      info: {
        title: 'REOS Enterprise API',
        version: 'v1',
        description: 'Real Estate Operating System API Platform'
      },
      servers: [{ url: 'https://script.google.com/macros/s/{deploymentId}/exec' }],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: 'apiKey', in: 'query', name: 'apiKey' }
        }
      },
      paths: paths
    };
  }

  function markdownDocs() {
    REOS.APIPlatform.seedEndpoints();
    const endpoints = REOS.Database.getAll('API_ENDPOINTS');
    const lines = ['# REOS Enterprise API', '', '## Authentication', '', 'Pass `apiKey` with each request.', '', '## Endpoints', ''];
    endpoints.forEach(function (ep) {
      lines.push('### ' + ep.Method + ' ' + ep.Path);
      lines.push('');
      lines.push('- Version: `' + ep.Version + '`');
      lines.push('- Scope: `' + ep['Required Scope'] + '`');
      lines.push('- Resource: `' + ep.Resource + '`');
      lines.push('- Description: ' + ep.Description);
      lines.push('');
    });
    return lines.join('\n');
  }

  return { openApiSpec: openApiSpec, markdownDocs: markdownDocs };
})();

function apiDocsOpenApiSpec() { return REOS.APIDocs.openApiSpec(); }
function apiDocsMarkdown() { return REOS.APIDocs.markdownDocs(); }
