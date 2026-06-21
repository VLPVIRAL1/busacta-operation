# BYOD / Endpoint Policy

**Owner:** CTO

Personal devices accessing production data must:

- Run a supported OS receiving security updates.
- Have full-disk encryption enabled (FileVault / BitLocker / equivalent).
- Have a screen-lock timeout ≤ 5 minutes.
- Run a reputable, up-to-date anti-malware solution (macOS XProtect counts).
- Never store customer database exports on the local filesystem outside `/tmp`.
- Be reported and wiped (where possible) within 4 hours of loss/theft.

Browsers must be kept current and run no untrusted extensions when accessing the platform.
