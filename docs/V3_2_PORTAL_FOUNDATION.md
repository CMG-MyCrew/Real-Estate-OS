# REOS Enterprise v3.2 — Portal Foundation

v3.2 introduces the foundation for secure investor, lender, client, and vendor portals.

## Added Files

| File | Purpose |
| --- | --- |
| `src/PortalFoundation.gs` | Server-side portal account, invitation, session, document share, message, task, activity, and role-dashboard service. |
| `src/PortalFoundation.html` | Admin UI for portal setup and portal workflow management. |
| `docs/V3_2_PORTAL_FOUNDATION.md` | Portal foundation documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `PORTAL_ACCOUNTS` | Stores portal users and linked entities. |
| `PORTAL_SESSIONS` | Stores portal session tokens and expiration records. |
| `PORTAL_INVITATIONS` | Stores portal invite tokens and acceptance status. |
| `PORTAL_DOCUMENT_SHARES` | Stores document access grants by portal account. |
| `PORTAL_MESSAGES` | Stores portal messages. |
| `PORTAL_TASKS` | Stores portal-visible tasks. |
| `PORTAL_ACTIVITY_LOG` | Stores portal audit/activity events. |

## Portal Roles

- Investor
- Lender
- Client
- Vendor

## Included in This Increment

- Portal account model
- Invitation workflow
- Session/token foundation
- Secure document share registry
- Portal message registry
- Portal task registry
- Portal activity logging
- Role-specific dashboard data
- Admin Portal Foundation UI

## Menu Access

`REOS → Open Portal Foundation`

Admin access is required.

## Workflow

1. Create a portal invitation.
2. Accept the invitation to create a portal account.
3. Share documents with the portal account.
4. Create portal tasks and messages.
5. Preview role-specific portal dashboard data.
6. Review portal activity logs.

## Acceptance Criteria

- Portal sheets are created automatically.
- Admin can create invitations for investor, lender, client, and vendor roles.
- Invitations can be accepted into active accounts.
- Sessions can be created for active portal accounts.
- Documents can be shared to portal accounts.
- Messages and tasks can be created for portal accounts.
- Portal dashboard data can be loaded by account.

## Next Roadmap

Proceed to **v3.2.1 Portal Authentication & Web App Shell**.
