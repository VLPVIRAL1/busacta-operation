# Security Policy

**Owner:** CTO · **Reviewed:** quarterly · **Last update:** 2026-05-14

## Scope

Applies to all production systems, source code, infrastructure, and third-party services that store or process customer data.

## Principles

- **Least privilege** for both human and machine access.
- **Defense in depth**: edge headers (CSP/HSTS), authn middleware, RLS, append-only audit log.
- **Auditability**: every privileged action lands in `audit_log` (7-year retention).
- **No PHI today** — controls are HIPAA-defensive in case healthcare clients are added.

## Controls

| Control               | Implementation                                                                       |
| --------------------- | ------------------------------------------------------------------------------------ |
| Encryption in transit | TLS 1.2+ enforced via HSTS preload                                                   |
| Encryption at rest    | Managed Postgres + Storage (AES-256)                                                 |
| Authentication        | Email+TOTP MFA mandatory for `super_admin`, `admin`, `finance_manager`, `hr_manager` |
| Password strength     | HIBP leaked-password check enabled                                                   |
| Rate limiting         | `auth_rate_limits` table — 5 failures / 15 min triggers lockout                      |
| Session revocation    | `revoke_user_sessions(uuid)` — super_admin only                                      |
| Authorization         | Postgres RLS on every user-data table; capability checks via `has_role()`            |
| Audit logging         | `audit_log` (append-only) + `sensitive_action_log`                                   |
| Vulnerability mgmt    | `bun audit` weekly; HIGH/CRITICAL fixed within 7 days                                |
| Backups               | Automated daily snapshots; PITR ≥ 7 days                                             |
| Incident response     | See `incident-response.md`                                                           |

## Reporting vulnerabilities

Email **security@busacta.com** (PGP available on request). We acknowledge within 1 business day and aim to remediate HIGH/CRITICAL within 7 days.

## Exceptions

Any deviation requires written CTO approval and is logged in the change-management register.
