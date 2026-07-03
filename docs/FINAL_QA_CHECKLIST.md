# REOS Enterprise Final QA Checklist

## Purpose

Use this checklist before launch, after major framework additions, and before each production release.

## Repository Review

- [ ] All expected source files exist.
- [ ] All expected HTML files exist.
- [ ] All expected documentation files exist.
- [ ] No duplicate framework files conflict with each other.
- [ ] No temporary scratch files remain.
- [ ] No placeholder blocker strings remain.
- [ ] GitHub Actions passes.

## Apps Script Syntax

- [ ] Project saves without syntax errors.
- [ ] V8 runtime is enabled.
- [ ] Manifest has required OAuth scopes.
- [ ] No duplicate global function names create conflicts.
- [ ] All HtmlService includes resolve.
- [ ] All menu functions exist.

## Installation

- [ ] Install or repair function runs successfully.
- [ ] All required sheets are created.
- [ ] Header rows are correct.
- [ ] Frozen header rows are applied.
- [ ] Default data seeds correctly.
- [ ] User authorization completes successfully.

## Core Modules

- [ ] CRM loads.
- [ ] Tasks loads.
- [ ] Transactions loads.
- [ ] Investments loads.
- [ ] Rentals loads.
- [ ] Finance loads.
- [ ] Reporting and Dashboard loads.
- [ ] Workflow Automation loads.
- [ ] Documents and eSignature loads.

## Portals

- [ ] Agent Portal loads.
- [ ] Client Portal loads.
- [ ] Vendor Portal loads.
- [ ] Mobile App Preview loads.
- [ ] Portal authentication and lookup flows work.

## Enterprise Modules

- [ ] Integration Hub loads.
- [ ] API Platform loads.
- [ ] Enterprise Admin loads.
- [ ] Enterprise Security loads.
- [ ] Production Console loads.
- [ ] Performance Console loads.
- [ ] SaaS Admin loads.
- [ ] Brokerage Management loads.
- [ ] Business Intelligence loads.
- [ ] Help Center loads.

## Security

- [ ] Security policies are seeded.
- [ ] API keys can be created and revoked.
- [ ] Secret registry masks keys.
- [ ] Tenant access checks work.
- [ ] Security events are logged.
- [ ] Critical security events create incidents.

## API Platform

- [ ] API endpoints are seeded.
- [ ] OpenAPI docs generate.
- [ ] Dashboard read endpoint works with API key.
- [ ] Task create endpoint works with write scope.
- [ ] Invalid API key fails.
- [ ] Rate limit records are written.
- [ ] Request logs redact sensitive values.

## Production Hardening

- [ ] Health suite passes.
- [ ] Smoke tests pass.
- [ ] Backup is created.
- [ ] Restore test is documented.
- [ ] Release gate passes.
- [ ] Incident workflow works.
- [ ] Release record is created.

## Performance

- [ ] Cache get and put works.
- [ ] Query optimizer returns paginated results.
- [ ] Batch database read works.
- [ ] Job queue enqueues and processes jobs.
- [ ] Worker trigger is installed.
- [ ] Quota snapshot captures successfully.
- [ ] Slow operations report loads.

## Documentation

- [ ] Admin Guide reviewed.
- [ ] User Guide reviewed.
- [ ] API Guide reviewed.
- [ ] Architecture Guide reviewed.
- [ ] Data Dictionary reviewed.
- [ ] Deployment Guide reviewed.
- [ ] Help Center opens from menu and sidebar.

## Launch Approval

- [ ] Product owner approval.
- [ ] Admin approval.
- [ ] Security approval.
- [ ] Data backup confirmed.
- [ ] Rollback plan confirmed.
- [ ] Launch date confirmed.
