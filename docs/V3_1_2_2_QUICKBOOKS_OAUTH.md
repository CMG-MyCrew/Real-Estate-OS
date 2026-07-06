# REOS Enterprise v3.1.2.2 — QuickBooks OAuth / Token Foundation

This increment adds the OAuth and token foundation for the QuickBooks connector.

## Added Files

| File | Purpose |
| --- | --- |
| `src/QuickBooksOAuth.gs` | OAuth URL generation, callback recording, token exchange foundation, refresh-token foundation, sandbox test foundation. |
| `src/QuickBooksOAuth.html` | Admin UI for OAuth/token workflows. |
| `docs/V3_1_2_2_QUICKBOOKS_OAUTH.md` | OAuth/token documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `QB_OAUTH_STATES` | Tracks generated OAuth state values and authorization URLs. |
| `QB_TOKEN_EVENTS` | Tracks token exchange, refresh, and callback events. |
| `QB_CONNECTION_TESTS` | Tracks dry-run and live sandbox connection tests. |

## Script Properties

Recommended Script Properties:

- `QB_CLIENT_ID`
- `QB_CLIENT_SECRET`
- `QB_REDIRECT_URI`
- `QB_ACCESS_TOKEN`
- `QB_REFRESH_TOKEN`

Connection records can override the property names used for client ID, secret, access token, and refresh token.

## Safety Defaults

- Token exchange runs in dry-run mode unless `liveMode=true` is explicitly passed.
- Refresh-token flow runs in dry-run mode unless `liveMode=true` is explicitly passed.
- Sandbox connection test runs in dry-run mode unless `liveMode=true` is explicitly passed.
- No financial records are sent to QuickBooks in this increment.

## Menu Access

`REOS → Open QuickBooks OAuth`

Admin access is required.

## Workflow

1. Open QuickBooks Connector.
2. Create a QuickBooks connection record.
3. Open QuickBooks OAuth.
4. Build Authorization URL.
5. Complete authorization externally.
6. Record callback state/code/realm ID.
7. Dry-run token exchange.
8. Configure Script Properties.
9. Run live sandbox token exchange only after credentials are confirmed.
10. Run sandbox connection test.

## Next Increment

v3.1.2.3:

- QuickBooks API request wrapper
- Sandbox read methods
- Chart of Accounts pull
- Customer/vendor lookup
- Invoice export dry-run payload validation
