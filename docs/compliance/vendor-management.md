# Vendor / Subprocessor Register

**Owner:** Privacy Officer · **Reviewed:** annually

| Vendor                           | Service                         | Data exposed           | DPA | Last review |
| -------------------------------- | ------------------------------- | ---------------------- | --- | ----------- |
| Lovable Cloud (Supabase)         | Managed Postgres, Storage, Auth | All app data           | Yes | 2026-05-14  |
| Cloudflare                       | Edge / CDN / DNS                | Request metadata, IP   | Yes | 2026-05-14  |
| Resend / Postmark _(if enabled)_ | Transactional email             | Email addresses, names | Yes | n/a         |

## Onboarding a new vendor

1. Security questionnaire (SOC 2 report, sub-processors).
2. Signed DPA (and BAA if PHI involved).
3. Data classification of what they will see.
4. Add row to this register.

## Annual review

Confirm DPA is current, SOC 2 report ≤ 12 months old, no material breaches.
