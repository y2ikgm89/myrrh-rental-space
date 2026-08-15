# Hole A Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `charge.refunded` の attribution を実 DB で固定し、配線 unit の mock 引数テストを削除する。

**Architecture:** 書込の正本は既存 settlement integration。unit は route 契約（署名・欠落・200）だけ残す。

**Tech Stack:** Bun test, Prisma test-db, existing settlement fixtures.

## Global Constraints

- Verify with `bun run test -- <file>`, not `test:unit --`.
- Do not mock `applyChargeRefundIdempotent` / `applyEventChargeRefundIdempotent` in new tests.
- Do not weaken remaining assertions.
- Do not edit `.claude/*` or `.env*`.

---

## File map

- `__tests__/integration/domain/payment/charge-refunded-settlement.test.ts` — reservation attribution
- `__tests__/integration/domain/payment/event-charge-refunded-settlement.test.ts` — event attribution
- `__tests__/unit/api/stripe-webhook.test.ts` — delete mock-arg charge.refunded cases
- `docs/audits/2026-08-12-codebase-audit-progress.md` — Hole A 1 文を第 1 波まで進んだと更新

## Task 1: Reservation attribution on real DB

- [x] Add tests that `metadata.initiator: "ADMIN"` writes `refundedByType: ADMIN`, and missing/unknown initiator writes `STRIPE_DASHBOARD`.
- [x] Run `bun run test -- __tests__/integration/domain/payment/charge-refunded-settlement.test.ts`.

## Task 2: Event attribution on real DB

- [x] Same two cases for `applyEventChargeRefundIdempotent`.
- [x] Run `bun run test -- __tests__/integration/domain/payment/event-charge-refunded-settlement.test.ts`.

## Task 3: Delete wiring mock-arg tests

- [x] Remove charge.refunded tests that only assert `mockApplyChargeRefundIdempotent` arguments (full / partial / empty / USD / ADMIN).
- [x] Keep PI-null and reservation-not-found route tests.
- [x] Run `bun run test -- __tests__/unit/api/stripe-webhook.test.ts`.

## Task 4: Ledger sentence

- [x] Update the Hole A sentence in progress.md to say wave 1 (refund attribution + wiring assert removal) is done; later waves remain.
