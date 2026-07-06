# REOS Enterprise v3.2.1 — Portal Authentication & Web App Shell

v3.2.1 adds the authentication and web app shell foundation for REOS portals.

## Added Files

| File | Purpose |
| --- | --- |
| `src/PortalAuth.gs` | Portal login/session validation, route registry, web app routing, shell data service, and logout workflow. |
| `src/PortalAuth.html` | Admin UI for portal authentication workflows and route setup. |
| `src/PortalWebApp.html` | Mobile-responsive portal web app shell. |
| `docs/V3_2_1_PORTAL_AUTH_WEB_APP.md` | Portal auth and web app documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `PORTAL_LOGIN_EVENTS` | Tracks login requests, logout events, success, and failures. |
| `PORTAL_ROUTES` | Stores portal routes by role. |

## Included

- Login session request by portal account email.
- Session token validation.
- Session expiration handling.
- Logout workflow.
- Route registry for role-based navigation.
- Web app `doGet(e)` entrypoint.
- Mobile-responsive portal shell.
- Admin auth dashboard.

## Menu Access

`REOS → Open Portal Auth`

Admin access is required.

## Web App Flow

1. Create a portal account using Portal Foundation.
2. Open Portal Auth.
3. Seed default routes.
4. Request login for an active portal account email.
5. Copy generated session token.
6. Deploy Apps Script as a web app.
7. Open web app with `?token=<SESSION_TOKEN>&route=home`.

## Security Notes

- This increment uses token-based session validation.
- Session tokens expire after 12 hours.
- Login events are logged.
- Public password authentication is not included yet.
- MFA is not included yet.

## Next Roadmap

Proceed to **v3.2.2 Investor Portal UI**.
