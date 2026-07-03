# REOS Enterprise Known Issues

## Purpose

This document tracks known issues, risks, validation gaps, and post-launch follow-up items.

## Current Status

No production-blocking issues have been confirmed in this document yet.

## Issue Categories

### Blocker

Prevents launch or core usage.

### High

Impacts major workflows or security but has a workaround.

### Medium

Impacts usability, reporting, performance, or admin operations.

### Low

Minor polish, documentation, or enhancement item.

## Known Issues Register

| ID | Severity | Area | Issue | Status | Owner | Target |
| --- | --- | --- | --- | --- | --- | --- |
| KI-001 | Medium | QA | Full Apps Script runtime validation must be completed in the deployed Apps Script project. | Open | Admin | Pre-launch |
| KI-002 | Medium | API | External web app routing should be confirmed in the live deployment URL. | Open | Admin | Pre-launch |
| KI-003 | Medium | Portals | Client and vendor test users should complete an end-to-end access test. | Open | Business Owner | Pilot |
| KI-004 | Low | Docs | Help Center contains embedded summaries; full markdown docs live in repository docs folder. | Open | Admin | Post-launch |

## Validation Notes

Use the System Audit console, Production Console, Enterprise Security, API Platform, and Performance Console to validate known issues before launch.

## GitHub Issue Guidance

Create GitHub issues for any blocker or high severity item with:

- Summary
- Steps to reproduce
- Expected result
- Actual result
- Screenshots if available
- Owner
- Severity
- Target release

## Closure Criteria

An issue can be closed when:

- Root cause is understood.
- Fix or workaround is documented.
- Validation has passed.
- Owner approves closure.
