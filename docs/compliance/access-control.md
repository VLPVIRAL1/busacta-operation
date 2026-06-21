# Access Control Policy

**Owner:** CTO · **Reviewed:** quarterly access review

## Roles (`app_role` enum)

| Role              | Purpose                                               | MFA required |
| ----------------- | ----------------------------------------------------- | ------------ |
| `super_admin`     | Platform owner. Can revoke sessions, prune audit log. | Yes          |
| `admin`           | Org admin. Manages users, firms, settings.            | Yes          |
| `finance_manager` | Invoices, journals, petty cash.                       | Yes          |
| `hr_manager`      | Profiles, timesheets.                                 | Yes          |
| `employee`        | Internal staff working on firm tasks.                 | Recommended  |
| `client`          | External; portal-scoped to own firm.                  | Optional     |

## Provisioning

- New accounts created only via `invitations` table (signed token, 7-day expiry).
- Role assignment requires `super_admin` or `admin`.
- Every grant/revoke logged in `sensitive_action_log` + `audit_log`.

## Reviews

- **Quarterly** access review by CTO: export `user_roles` + `firm_member_capabilities`, attest active members.
- **Immediate** revocation on termination (see `onboarding-offboarding.md`).

## Enforcement

- Postgres RLS on every user-data table.
- `mfa_required_roles` table — login is gated client-side and via `mfa_enforcement_status()`.
- `auth_rate_limits` lockout after 5 failures / 15 min.
