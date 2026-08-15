# Hole A Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** event-registration checkout の金額・状態書込を実 DB で固定し、配線 unit の mock 引数 assert を外す。

## Global Constraints

- Verify with `bun run test -- <file>`, not `test:unit --`.
- Do not mock `claimEventRegistrationAsPaid` / `claimEventRegistrationAsFailed` / `saveEventRegistrationPaymentIntentId` in new tests.
- Waitlist confirm / orphan refund / 他 webhook は後続波。本番実装は動かさない。

## Task 1: Real-DB settlement

- [x] Add `__tests__/integration/domain/payment/event-checkout-session-settlement.test.ts`.
- [x] Cover: UNPAID CONFIRMED → PAID + PI; already PAID no-op; PENDING save PI; PAID save no-op; failed match; failed mismatch; failed already PAID.
- [x] Run `bun run test -- __tests__/integration/domain/payment/event-checkout-session-settlement.test.ts`.

## Task 2: Thin wiring unit

- [x] Remove `toHaveBeenCalledWith` on event claim/save. Keep 200, call order, confirm skip, cache, emails.
- [x] Run `bun run test -- __tests__/unit/api/stripe-webhook-event-registration-routing.test.ts`.

## Task 3: Ledger

- [x] Update Hole A sentence: wave 3 event checkout writes done; other webhooks / remaining payment unit remain.
