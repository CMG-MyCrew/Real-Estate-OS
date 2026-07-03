# REOS Enterprise Data Dictionary

## Overview

REOS uses Google Sheets as its primary data store. Each module owns one or more sheets. The first row is the schema header. Most records include timestamps and an ID field.

## Common Fields

| Field | Description |
| --- | --- |
| Created At | Record creation timestamp |
| Updated At | Last update timestamp |
| Active | Soft-delete or active flag |
| Status | Workflow status |
| Tenant ID | Tenant scope for SaaS deployments |
| Notes | Freeform notes |

## Core System Sheets

### USERS

Stores system users, roles, permissions, and status.

### SETTINGS

System settings and defaults.

### AUDIT_LOG

Operational audit events.

### SYSTEM_CONFIGURATION

| Field | Description |
| --- | --- |
| Config ID | Unique config ID |
| Category | Configuration category |
| Key | Config key |
| Value | Config value or masked reference |
| Environment | Development, Testing, Staging, Production |
| Encrypted | Whether value is stored as a secret |
| Description | Human-readable description |
| Modified By | User who changed the value |
| Modified Date | Last modified timestamp |

## CRM Sheets

### CONTACTS / CRM

Stores client and contact profiles.

Typical fields:

- Client ID
- Full Name
- Email
- Mobile
- Lead Source
- Status
- Notes

### LEADS

Stores sales pipeline records.

Typical fields:

- Lead ID
- Client ID
- Lead Type
- Lead Source
- Status
- Priority
- Lead Score
- Expected Commission

### ACTIVITIES

Stores calls, emails, meetings, notes, and follow-up history.

## Task Sheets

### TASKS

Stores tasks, due dates, priorities, assignments, and related records.

Typical fields:

- Task ID
- Task
- Priority
- Status
- Due Date
- Assigned To
- Related Record ID

## Transaction Sheets

### TRANSACTIONS

Stores transaction and deal records.

Typical fields:

- Transaction ID
- Address
- Client ID
- Status
- Closing Date
- Gross Commission
- Net Commission
- Days Remaining

### COMMISSIONS

Stores commission calculations and payment status.

## Investment Sheets

### PROPERTIES

Stores investment properties and acquisition opportunities.

Typical fields:

- Property ID
- Address
- MLS Number
- Property Type
- Strategy
- Current Value
- Acquisition Status

### INVESTMENTS

Stores investment analysis records and deal reviews.

## Rental Sheets

### RENTALS

Stores rental properties.

Typical fields:

- Rental ID
- Address
- Occupancy Status
- Monthly Rent
- Net Monthly Cash Flow

### LEASES

Stores lease data, tenant info, start/end dates, and renewal status.

### MAINTENANCE

Stores maintenance requests and work orders.

## Finance Sheets

### FINANCE

Stores income, expenses, tax reserve, payments, and financial entries.

Typical fields:

- Finance ID
- Date
- Type
- Category
- Amount
- Payment Method
- Record ID
- Record Type

## Document Sheets

### DOCUMENTS

Stores document metadata.

Typical fields:

- Document ID
- Record ID
- Record Type
- Document Name
- Drive URL
- Status
- Signature Status
- Verification Status

### SIGNATURE_REQUESTS

Tracks eSignature workflow state.

## Portal Sheets

### CLIENT_PORTAL_ACCESS

Stores client portal access tokens and permissions.

### VENDORS

Stores vendor profiles.

### VENDOR_ASSIGNMENTS

Stores vendor work assignments, invoices, and completion notes.

## Integration Sheets

### INTEGRATIONS

Stores integration registry records.

### INTEGRATION_LOG

Stores integration request and response logs.

### WEBHOOK_EVENTS

Stores inbound webhook events and processing results.

## API Sheets

### API_KEYS

Stores hashed API keys, scopes, status, rate limits, and expiration.

### API_USAGE

Stores API key usage records.

### API_ENDPOINTS

Stores versioned endpoint registry.

### API_REQUESTS

Stores API request logs.

## SaaS Sheets

### TENANTS

Stores tenant records.

### TENANT_BRANDING

Stores tenant branding and white-label settings.

### TENANT_ACCESS

Stores user-to-tenant access mappings.

### TENANT_AUDIT

Stores tenant audit records.

### TENANT_BILLING

Stores subscription and billing records.

### TENANT_PROVISIONING

Stores provisioning checklist records.

## Administration Sheets

### FEATURE_FLAGS

Stores feature flags, rollout percentages, environment, and tenant scope.

### LICENSES

Stores customer licenses, edition, seats, storage, and expiration.

### USAGE_ANALYTICS

Stores usage snapshots and module metrics.

### SYSTEM_DIAGNOSTICS

Stores diagnostic check results.

### ENVIRONMENTS

Stores environment definitions.

### ENVIRONMENT_SNAPSHOTS

Stores environment configuration snapshots.

### TENANT_PROVISIONING_RUNS

Stores full provisioning run results.

## Production Sheets

### SYSTEM_HEALTH

Stores health check results.

### INCIDENTS

Stores production incident records.

### BACKUPS

Stores backup records and restore test status.

### RELEASES

Stores release records.

### MIGRATIONS

Stores migration runs.

### QA_TEST_RESULTS

Stores smoke test and release gate results.

## Performance Sheets

### CACHE_METRICS

Stores cache get, put, remove, and hit/miss metrics.

### PERFORMANCE_LOG

Stores operation timing and slow operation data.

### QUOTA_MONITOR

Stores quota snapshots.

### JOB_QUEUE

Stores background jobs.

### JOB_LOG

Stores job processing logs.

## Security Sheets

### SECURITY_POLICIES

Stores security policy definitions.

### SECURITY_EVENTS

Stores security events and denials.

### SECRET_REGISTRY

Stores masked secret metadata only. Secret values are stored in Script Properties.
