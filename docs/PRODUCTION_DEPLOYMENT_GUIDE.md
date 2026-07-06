# REOS Enterprise v3.0 Production Deployment Guide

## Deployment Path

Development → Test → Staging → Production

## Required Steps

1. Pull latest GitHub source.
2. Sync `/src` files to Apps Script.
3. Sync `appsscript.json` if scopes changed.
4. Refresh workbook.
5. Run `REOS → Initialize Workbook`.
6. Run `REOS → Health Check`.
7. Run `REOS → Run Tests`.
8. Run `REOS → Open Production Hardening` and complete readiness audit.
9. Open `REOS → Open Release Center`.
10. Build release candidate.
11. Validate backup/rollback point.
12. Approve release candidate.
13. Record deployment.

## Production Rules

- Never deploy with hardening status `Blocked`.
- Never enable live external providers without endpoint and secret validation.
- Always create a workbook backup before production deployment.
- Keep GitHub as source of truth.
- Record deployment in `DEPLOYMENTS`.
