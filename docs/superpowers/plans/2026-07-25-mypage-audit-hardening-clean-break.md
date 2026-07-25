# Mypage Audit Hardening (Clean Break)

Worktree: `.worktrees/mypage-audit-hardening`  
Branch: `fix/mypage-audit-hardening-clean-break`  
Policy: official-aligned, no backward-compat shims, destructive OK.

## Packages (1 PR each, soft limit ~300 LOC / 10 files)

### P1 — Auth / terms / feature gates

1. `submitReview`: add `assertLoginSignupReagreed(customer.id)` after `assertCustomerActive`.
2. `reagreeAction`: replace `customer.isActive` check with `assertCustomerActive(customer.id)`.
3. Claim actions (reservation + event): add `assertLoginSignupReagreed` after active guard (claim is ownership write, not read-only history).
4. `cancelEventRegistration`: add `isFeatureEnabled("events")` fail-closed (mirror reservation cancel).
5. `MypageNav`: hide events/contact when feature OFF (layout passes flags or nav queries features).

Tests: unit/integration for each gate; keep messages Japanese DomainError style.

### P2 — Data exposure

1. `getEventRegistrationForCalendar` / ICS route: `meetingUrl` only when `status === CONFIRMED` (null otherwise). CANCELLED ICS may still emit without URL.
2. `getInquiryAttachmentForDownload`: require `inquiry.deletedAt === null` for **customer** mypage route. Prefer a dedicated customer query or param so admin retention download can stay if needed — clean break: customer route must 404 on soft-deleted.

### P3 — Account delete → anonymize

1. On Better Auth `deleteUser` completion path, resolve Customer by `userId` **before** User delete (or in `beforeDelete` if available), then call `anonymizeCustomerCommand({ reason: "customer-requested" })`.
2. Avoid double-delete: anonymize already deletes User when linked — order carefully so Better Auth delete and anonymize do not race. Preferred clean break: `beforeDelete` runs anonymize (which deletes User + sessions); if that conflicts with Better Auth flow, invert: disable BA user physical delete side-effect and let anonymize own User deletion, with BA still sending verification email.
3. Keep cache invalidation; ensure AuditLog for customer-requested anonymize.

### P4 — Admin email ↔ suppression

1. On admin `updateCustomer` email change: preserve old email suppression hash when HARD_BOUNCED/COMPLAINED; reset `emailDeliveryStatus` to OK for new address (or explicit re-verify policy); invalidate `SUPPRESSED_EMAILS` cache tag.
2. No shim for old inconsistent behavior.

### P5 — Guest/admin Customer ↔ member link (larger)

1. Clean-break: admin merge remains; add verified email claim OR force admin merge UX when duplicate emailCanonical exists after OAuth signup.
2. Scope narrowly: post-OAuth detection of unlinked guest with same emailCanonical → admin-only merge stays, but surface a mypage banner "履歴が別レコードにあります。お問い合わせください" OR signed self-serve merge token from admin. Prefer: after `ensureCustomerLinked`, if another active non-anonymized Customer shares emailCanonical with `userId=null`, expose read-only notice + support path (no silent auto-link). Optional follow-up PR for email-verified self merge.

## Non-goals

- SwitchBot / Redis rate-limit changes
- Changing INACTIVE status semantics (CRM taxonomy only)
- Softening IDOR ownership checks
