# Onboarding & Offboarding

**Owner:** HR + CTO

## Onboarding (≤ 2 business days)

1. Manager files access request specifying role.
2. Admin creates invitation in `/admin/users` (auto-expires in 7 days).
3. New user accepts → account auto-provisioned, profile row created via `handle_new_user()` trigger.
4. If role is in `mfa_required_roles`, user is forced to enrol TOTP at first login.
5. Manager assigns firm scope via `firm_contacts` / `firm_member_capabilities`.
6. Acknowledge `acceptable-use.md` and `byod.md` (logged in `sensitive_action_log`).

## Offboarding (≤ 4 hours from notice)

1. HR notifies CTO.
2. Admin runs `revoke_user_sessions(user_id)` → all refresh tokens deleted.
3. Admin removes rows from `user_roles` (logged in `audit_log` automatically).
4. Disable email at IdP, archive any owned firms / projects (do not delete).
5. Quarterly review confirms zero residual access.
