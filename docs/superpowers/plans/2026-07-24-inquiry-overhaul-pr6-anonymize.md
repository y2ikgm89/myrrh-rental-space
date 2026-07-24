# Inquiry Overhaul PR6 — Anonymize Inquiry

> **For agentic workers:** Use subagent-driven-development.

**Goal:** `anonymizeInquiryCommand` + admin UI, mirror `anonymizeCustomerCommand`.

**Depends on:** PR5 preferred (attachments R2 delete on anonymize); can ship without if no attachments yet — still redacts reply bodies.

**Spec:** §6.5

## Scope

1. `anonymizeInquiryCommand({ inquiryId, reason })` in domain
   - Placeholder PII: name, email, phoneNumber, companyName, message, replies.body
   - Set anonymizedAt / anonymizedReason
   - Delete attachments (R2 + rows) if PR5 present
   - Idempotent CONFLICT if already anonymized
   - Allowed on soft-deleted
2. Admin action + AnonymizeInquiryButton / ConfirmDialog (pattern from customer)
3. Unit tests: success, already anonymized, not found
4. Detail UI: show anonymized badge when anonymizedAt set; hide reply form for staff optional

## Out of scope

Auto-anonymize inquiries when customer anonymized (explicit non-goal in spec).
