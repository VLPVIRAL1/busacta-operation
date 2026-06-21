# Business Continuity & Disaster Recovery

**Owner:** CTO · **Tested:** annually

## Objectives

- **RPO** (max data loss): 24 hours
- **RTO** (max downtime): 8 hours

## Backups

- Daily automated Postgres snapshots, retained 30 days.
- Point-in-time recovery (PITR) ≥ 7 days.
- Storage bucket versioning enabled.

## Restore drill

Annual: restore latest snapshot to a staging project, run smoke tests, document time taken.

## Failure modes & response

| Scenario           | Response                                                       |
| ------------------ | -------------------------------------------------------------- |
| Region outage      | Wait for provider recovery; status page updated within 30 min. |
| Data corruption    | PITR to last known good timestamp; restore to staging first.   |
| Account compromise | `revoke_user_sessions`, rotate all secrets via Lovable Cloud.  |
| Source loss        | Code is mirrored to GitHub; restore + redeploy.                |
