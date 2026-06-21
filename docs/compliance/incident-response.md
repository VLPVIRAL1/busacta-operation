# Incident Response Runbook

**Owner:** CTO · **Drilled:** semi-annually

## Severity levels

- **SEV-1** Confirmed breach of confidentiality/integrity, or full outage > 1 h.
- **SEV-2** Suspected breach, partial outage, or data integrity bug affecting > 1 firm.
- **SEV-3** Single-tenant impact, no data exposure.

## Phases

1. **Detect** — alert source: customer report, Sentry, Cloudflare WAF, audit-log anomaly.
2. **Triage (≤ 30 min)** — assign Incident Commander, open `#inc-YYYYMMDD` channel, declare severity.
3. **Contain** — revoke sessions (`revoke_user_sessions`), rotate keys, disable affected feature flag.
4. **Eradicate** — patch root cause, deploy fix, verify in staging.
5. **Recover** — restore service, monitor for 24 h.
6. **Notify** — for SEV-1 with confirmed personal-data breach: notify affected users within **72 h**, plus regulators where required.
7. **Post-mortem (≤ 5 business days)** — blameless write-up, action items tracked to closure.

## Evidence preservation

Snapshot relevant `audit_log` and `sensitive_action_log` rows. Do **not** delete.

## Contacts

- Incident Commander rota: see internal wiki.
- Legal: legal@busacta.com
- Lovable Cloud support: via in-product ticket.
