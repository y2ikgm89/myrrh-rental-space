# Audit Findings Remediation Implementation Plan

> **For agentic workers:** Implement task-by-task. Soft limit: prefer focused PRs under ~300 lines / 10 files when splitting.

**Goal:** Close CRITICAL/HIGH findings from the 2026-07-23 codebase audit with clean, non-shimming fixes aligned to existing domain patterns.

**Architecture:** Mirror reservation payment-guard patterns onto event registrations; fix StripeEvent dedup to re-enter unprocessed retries; charge/receipt money paths must share one SSoT; CDN private paths must be listed in `next.config.ts` (SSoT for Cache-Control).

**Tech Stack:** Next.js 16 App Router, Prisma 7, Stripe Checkout webhooks, Bun tests via `scripts/run-tests.ts`

## Global Constraints

- No backward-compat dual paths; replace broken contracts outright
- Prisma only via `@/shared/db/prisma` + `server-only`
- Cache-Control private overrides only in `next.config.ts`
- Tests via `bun scripts/run-tests.ts <path>`
- Branch from `origin/main`; do not mix agent-tooling WIP

---

## Task A — Stripe dedup crash-recovery (C1)

- [ ] Change `claimStripeEventForProcessing` to distinguish `already_processed` vs `retry_unprocessed`
- [ ] Route: only short-circuit 200 on `already_processed`; re-run handler on `retry_unprocessed`
- [ ] Update `__tests__/unit/api/stripe-webhook-event-dedup.test.ts` + add unit for dedup module

## Task B — Event cancel PENDING guard (C2) + bulk reservation (H7)

- [ ] Mirror reservation `applyCancellation` PENDING reject into `registration-cancel-core.ts`
- [ ] Callers must select `paymentStatus`
- [ ] `applyBulkCancellation` WHERE `paymentStatus: { not: PENDING }`
- [ ] UI already guards waitlist; extend CONFIRMED+PENDING messaging if needed
- [ ] Tests

## Task C — Waitlist capacity-race auto-refund (C3) + 30m floor (M5)

- [ ] On EXPIRED after successful Stripe payment, idempotent Stripe refund + DB/Refund/Audit
- [ ] Reject waitlist checkout when offer remaining &lt; 30 minutes
- [ ] Tests

## Task D — FAILED retry + CDN (H1/H2/M1)

- [ ] `createEventCheckoutSessionCommand` accept FAILED like waitlist path
- [ ] `next.config.ts` add `/events/registrations/:path*` private no-store
- [ ] Keep payment banner private (no-store on query URLs or client fetch) — prefer route header override if possible; else static message without DB PII on cached page

## Task E — Receipt + pending-expire + Instagram (H3/H5/H6)

- [ ] Webhook: issue receipt for CONFIRMED; skip duplicate confirmation email only
- [ ] pending-expire: run side effects after claim
- [ ] Instagram OAuth → `settings:manage`

## Task F — Tax SSoT (H4) + remaining MEDIUM/LOW

- [ ] Align Stripe charge with receipt amount (prefer tax-inclusive charge = `totalPriceWithTax`)
- [ ] Capacity floor, CSV export permission, FAQ trash copy, specs status (docs-only if time)

## Verification

- [ ] `bun run validate`
- [ ] Targeted unit tests for each touched area
- [ ] `bun run build:skip-env` before push
