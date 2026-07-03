# REOS Enterprise API Guide

## Overview

The REOS API Platform provides versioned REST-style access to selected REOS resources through Apps Script web app handlers and internal API dispatch functions.

## Core Files

- `src/APIPlatform.gs` — request routing, authentication, rate limiting, endpoint registry, request logs
- `src/APIKeys.gs` — API key generation, hashing, validation, usage, revocation
- `src/APIDocs.gs` — OpenAPI and markdown documentation generation
- `src/APIWebApp.gs` — Apps Script web app request helpers
- `src/Webhooks.gs` — inbound and outbound webhook framework

## Authentication

API requests require an API key generated from the Enterprise Security console.

API keys are stored as hashes in `API_KEYS`. Raw keys are shown only once when created.

## Scopes

Common scopes:

- `read`
- `write`
- `*`

Endpoints define a required scope in `API_ENDPOINTS`.

## Rate Limits

Rate limits are enforced per API key using `API_USAGE` records.

Default rate limit: 1000 requests per hour.

## Seed Endpoints

Open **REOS > Open API Platform** and click **Seed Endpoints**.

Default endpoints:

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| GET | `/clients` | read | List CRM contacts |
| GET | `/leads` | read | List CRM leads |
| POST | `/leads` | write | Create CRM lead |
| GET | `/transactions` | read | List active transactions |
| GET | `/rentals` | read | List active rentals |
| GET | `/tasks` | read | List active tasks |
| POST | `/tasks` | write | Create task |
| GET | `/documents` | read | Search documents |
| GET | `/dashboard` | read | Executive dashboard |
| POST | `/webhooks` | write | Receive webhook |
| POST | `/automation` | write | Dispatch automation event |

## Internal Request Example

```javascript
const response = REOS.APIPlatform.handleRequest({
  method: 'GET',
  version: 'v1',
  path: '/dashboard',
  apiKey: 'YOUR_API_KEY',
  query: {}
});
```

## POST Example

```javascript
const response = REOS.APIPlatform.handleRequest({
  method: 'POST',
  version: 'v1',
  path: '/tasks',
  apiKey: 'YOUR_API_KEY',
  payload: {
    record: {
      Task: 'Call client',
      Priority: 'High',
      Status: 'Open'
    }
  }
});
```

## Response Envelope

```json
{
  "ok": true,
  "statusCode": 200,
  "message": "OK",
  "data": {},
  "meta": {
    "timestamp": "2026-01-01T00:00:00.000Z",
    "version": "v1",
    "path": "/dashboard"
  }
}
```

## Request Logs

All API Platform requests are logged in `API_REQUESTS` with API key ID, tenant ID, version, method, path, status code, latency, request JSON, and response JSON.

Sensitive keys are redacted before logging.

## OpenAPI Docs

Generate docs from **API Platform** or call:

```javascript
REOS.APIDocs.openApiSpec();
REOS.APIDocs.markdownDocs();
```

## Web App Routing

`APIWebApp.gs` provides `apiWebAppHandleGet(e)` and `apiWebAppHandlePost(e)`.

These can be wired into `doGet(e)` and `doPost(e)` dispatch as needed.

## Security Notes

- Use HTTPS Apps Script web app URLs only.
- Revoke compromised API keys immediately.
- Prefer tenant-scoped keys.
- Use separate keys for integrations.
- Review API logs regularly.
- Do not place API keys in public files.
