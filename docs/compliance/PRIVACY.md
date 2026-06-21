# Privacy Policy (internal record)

**Owner:** Privacy Officer · **Reviewed:** annually · **Last update:** 2026-05-14

## Data we collect

| Category              | Examples                                | Lawful basis                | Retention              |
| --------------------- | --------------------------------------- | --------------------------- | ---------------------- |
| Account data          | name, email, role                       | Contract                    | Life of account + 7 yr |
| Firm/client records   | firm name, contacts, projects, invoices | Contract                    | 7 yr (tax)             |
| Operational data      | tasks, time logs, notes, attachments    | Contract                    | 7 yr                   |
| Audit & security logs | `audit_log`, `auth_rate_limits`         | Legitimate interest / SOC 2 | 7 yr                   |
| Technical logs        | request id, IP, user-agent              | Legitimate interest         | 90 days                |

We do **not** intentionally collect PHI today. If a client onboards healthcare data, a BAA must be signed first and the data classified accordingly.

## Data subject rights (GDPR / CCPA aligned)

- **Access**: export within 30 days via `/admin/compliance` → "Export user data".
- **Erasure**: requires admin approval; non-financial PII is anonymized, financial records are retained per tax law.
- **Rectification**: self-service via profile page.
- **Portability**: JSON export.

## Subprocessors

- Lovable Cloud / Supabase (managed Postgres, Storage, Auth) — DPA on file.
- Cloudflare (edge / CDN) — DPA on file.
  See `vendor-management.md` for the full register.

## Contact

**privacy@busacta.com**
