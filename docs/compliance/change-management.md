# Change Management

**Owner:** CTO · **Reviewed:** annually

## Scope

All production code, database migrations, infrastructure config, and third-party integrations.

## Required for every change

1. Tracked work item (ticket / PR / Lovable session).
2. Code review by ≥ 1 engineer who is **not** the author.
3. Automated checks: typecheck, lint, dependency scan.
4. Database migrations applied via the migration tool only (never ad-hoc SQL).
5. Deploy to preview, smoke-test, then promote to production.
6. Rollback plan documented before deploy.

## Emergency changes

Allowed for SEV-1 incidents. Must be retroactively reviewed within 1 business day.

## Audit trail

- Source-control history (immutable).
- `audit_log` for DB schema/data changes.
- Lovable session history.
