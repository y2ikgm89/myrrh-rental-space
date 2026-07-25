# Booking Detail Hub / Passcode Web / Event Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約詳細ハブをゲスト/会員で揃えて SwitchBot 暗証番号を Web 開示し、イベントに対称の薄い詳細を足す clean-break 実装。

**Architecture:** Passcode 平文は Server Action 開示時のみ decrypt。メールから平文パスコードを削除しハブ CTA に置換。イベントは `event-registration-status` token + `/events/registrations/status` と `/mypage/events/[id]`。

**Tech Stack:** Next.js App Router, existing token/cookie proxy, SwitchBot ciphertext purpose, Bun tests via `scripts/run-tests.ts`.

**Spec:** `docs/superpowers/specs/2026-07-26-booking-detail-hub-design.md`

## Global Constraints

- Clean-break: メール平文パスコード残置なし、イベント receipt 直リンク表導線なし
- Passcode を初期 RSC props に載せない
- Prisma は `@/shared/db/prisma` + `server-only`
- Tests via `bun scripts/run-tests.ts` only
- SwitchBot admin remote lock/unlock は触らない
- Commit Conventional + `[ai-gen]`；同一 OPEN PR へ追加 push 可

---

### Task 0: Fix PR #1523 Unit Tests CI failure

- [ ] Identify failing tests from Actions log
- [ ] Fix and push to `feat/payment-off-receipt-guest-status`

### Task 1: Customer-visible passcode domain + reveal action

**Files:** `src/shared/domain/smart-lock/customer-passcode-queries.ts` (new), public Server Action, rate-limit, unit tests

- [ ] Visibility rules (CONFIRMED reservation + CONFIRMED passcode + time window)
- [ ] Auth: session ownership OR status token rid match
- [ ] `revealReservationPasscodesAction` returns plaintext only on demand
- [ ] Tests for deny/pending/outside-window/success
- [ ] Commit

### Task 2: PasscodeReveal UI on guest status + member detail

- [ ] Shared `PasscodeReveal` client component
- [ ] Wire `/reservation/status` and `/mypage/reservations/[id]`
- [ ] Guest calendar + cancel token CTA on status page
- [ ] Commit

### Task 3: Email clean-break — strip plaintext passcodes

- [ ] Remove passcode lists from confirmation / updated / status-changed templates
- [ ] Add hub CTA URLs instead
- [ ] Grep gate: templates must not render passcode digits blocks
- [ ] Commit

### Task 4: Event status token + guest page

- [ ] `event-registration-status-token.ts`, cookie, proxy, purpose registry
- [ ] `/events/registrations/status` page
- [ ] public-route-gates + SERIAL_DB_TESTS if integration
- [ ] Commit

### Task 5: Member `/mypage/events/[id]` + list links

- [ ] Detail page with receipt/cancel/checkout/meeting URL
- [ ] List navigates to detail
- [ ] Commit

### Task 6: Wire event receipt detailUrl + booking hub polish

- [ ] Guest status URL / member detail URL in notify + manual/webhook paths
- [ ] Remove event guest receipt download as primary detailUrl
- [ ] Commit

### Task 7: Validate + push

- [ ] `bun run validate` + targeted tests + `bun run build`
- [ ] Push to open PR / auto-merge

## Parallelization

| Wave | Tasks           | Model hint                                         |
| ---- | --------------- | -------------------------------------------------- |
| 0    | Task 0 CI fix   | Grok                                               |
| 1    | Task 1 ∥ Task 4 | Grok=domain/token；Composer=event page after token |
| 2    | Task 2 ∥ Task 5 | Composer                                           |
| 3    | Task 3 ∥ Task 6 | Grok                                               |
| 4    | Task 7          | parent                                             |
