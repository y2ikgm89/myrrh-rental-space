# Hole A Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** reservation checkout の金額・状態書込を実 DB で固定し、配線 unit の mock 引数 assert を外す。

**Architecture:** 正本は新しい settlement integration。`stripe-webhook.test.ts` は 200 / cache / メール / fail-closed の route 契約だけ残す。

## Global Constraints

- Verify with `bun run test -- <file>`, not `test:unit --`.
- Do not mock `claimReservationAsPaid` / `claimReservationAsFailed` / `savePaymentIntentId` in new tests.
- Event checkout と cancelled orphan refund は後続波。本番実装は動かさない。

## Task 1: Real-DB settlement

- [x] Add `__tests__/integration/domain/payment/checkout-session-settlement.test.ts`.
- [x] Cover: UNPAID → PAID + PI; already PAID no-op; save PI leaves PENDING; session mismatch no-write; failed match; failed mismatch; failed already PAID.
- [x] Run `bun run test -- __tests__/integration/domain/payment/checkout-session-settlement.test.ts`.

## Task 2: Thin wiring unit

- [x] Remove `toHaveBeenCalledWith` on claim/save from checkout / async / expired tests. Keep 200 and route side effects.
- [x] Run `bun run test -- __tests__/unit/api/stripe-webhook.test.ts`.

## Task 3: Ledger

- [x] Update Hole A sentence: wave 2 reservation checkout writes done; event checkout / other webhooks remain.
