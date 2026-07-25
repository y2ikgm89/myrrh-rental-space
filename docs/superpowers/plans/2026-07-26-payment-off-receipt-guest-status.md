# Payment-off / Receipt notify / Guest status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `payment` OFF でも公開・管理が自然に動き、入金確定（手動/Stripe）で領収書即時発行＋双方通知メール、ゲストはトークン付き薄い予約詳細から DL できる clean-break 実装。

**Architecture:** Feature Module `payment` と Stripe credentials の二層ゲートは維持。領収書通知は `notifyReceiptIssuedForReservation`（event 対称）に集約し、手動入金・webhook から同一呼出。ゲスト入口は新 `reservation-status-token` + `/reservation/status`。確認メールへの `receiptDownloadUrl` 埋め込みは削除。

**Tech Stack:** Next.js 16 App Router, Prisma 7, Bun test via `scripts/run-tests.ts`, existing token/cookie proxy patterns, react-email.

**Spec:** `docs/superpowers/specs/2026-07-26-payment-off-receipt-guest-status-design.md`

## Global Constraints

- Clean-break: 後方互換 shim / dual-path / deprecated フラグなし
- Prisma は `@/shared/db/prisma` + `import "server-only"` のみ
- 秘密値を出力・コミットしない
- テストは `bun scripts/run-tests.ts` 経由のみ
- 日付表示は JST formatter
- Co-Authored / Conventional Commits はリポジトリ方針に従う
- 予約詳細ハブの暗証番号 Web 表示は触らない

## File map (expected)

| Area                           | Files                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Status token                   | `src/shared/lib/reservation-status-token.ts` (new), crypto purpose registry, `src/proxy.ts`                |
| Guest page                     | `src/app/(public)/reservation/status/page.tsx` (new) + queries                                             |
| Notify SSoT                    | `src/shared/domain/receipts/notify-issued.ts` (new), `src/shared/lib/email/receipt-emails.ts` (+ template) |
| Manual pay                     | `src/shared/domain/reservations/payment-commands.ts`, events 対称, admin actions                           |
| Stripe webhook                 | `src/app/api/webhooks/stripe/route.ts`                                                                     |
| Confirmation email clean-break | `src/shared/lib/email/reservation-emails.ts`, `event-emails.ts`, types                                     |
| Admin UI                       | `ReservationDetail.tsx`, event registration table as needed                                                |
| Tests                          | unit/integration under `__tests__/` matching above                                                         |

---

### Task 1: reservation-status-token + proxy cookie transfer

**Files:**

- Create: `src/shared/lib/reservation-status-token.ts`
- Modify: crypto purpose registry / constants for cookie name
- Modify: `src/proxy.ts`（`/reservation/status` を token→cookie 転写リストへ）
- Test: `__tests__/unit/shared/lib/reservation-status-token.test.ts`

- [x] Write failing token create/verify/TTL/purpose-isolation tests（cancel/complete トークンと混同しないこと）
- [x] Implement token helper（既存 `reservation-complete-token` をテンプレに、purpose を分離）
- [x] Register cookie name + proxy transfer
- [x] Run `bun scripts/run-tests.ts __tests__/unit/shared/lib/reservation-status-token.test.ts`
- [x] Commit: `feat(reservations): add reservation-status token [ai-gen]`

### Task 2: Guest thin status page + receipt CTA

**Files:**

- Create: `src/app/(public)/reservation/status/page.tsx`（+ loading/error if repo pattern requires）
- Modify: `src/shared/domain/reservations/customer-queries.ts`（status 用最小 select）
- Test: page gate / invalid token / receipt CTA 条件の unit または integration

- [ ] Write failing tests for invalid token → 汎用エラー、valid → サマリ表示、receipt あり → DL CTA
- [ ] Implement page（feature `reservation` gate、rate limit、cookie のみ読取）
- [ ] DL CTA は既存安全フローへ（専用 confirm page 経由可）。PDF API 直リンクをメール用に新設しない
- [ ] Run targeted tests + `bun run lint:files -- <touched>`
- [ ] Commit: `feat(public): add thin guest reservation status page [ai-gen]`

### Task 3: notifyReceiptIssued SSoT + email template

**Files:**

- Create: `src/shared/domain/receipts/notify-issued.ts`
- Modify: `src/shared/lib/email/receipt-emails.ts` + react-email template/fixture
- Test: guest CTA = status URL、member CTA = mypage URL、idempotency key

- [ ] Write failing tests for CTA branching + idempotency key shape
- [ ] Implement notify helper（userId 有無で分岐、fire-and-forget は呼出側方針に合わせる）
- [ ] Add email template（領収書発行通知。確認メールと分離）
- [ ] Run targeted tests
- [ ] Commit: `feat(receipts): add receipt-issued notification SSoT [ai-gen]`

### Task 4: Manual payment → issue receipt → notify（reservation + event）

**Files:**

- Modify: `src/shared/domain/reservations/payment-commands.ts`（または admin action afterSuccess）
- Modify: `src/shared/domain/events/payment-commands.ts` / admin event action
- Test: integration or unit with mocks — PAID + receipt + notify called; VALIDATION skip path

- [ ] Write failing tests: manual pay issues receipt and calls notify
- [ ] Implement await `issueReceiptFor*` after successful claim; notify on success
- [ ] Surface partial failure（PAID but receipt failed）to admin mutation result/toast
- [ ] Run targeted tests
- [ ] Commit: `feat(payments): issue receipt on manual payment [ai-gen]`

### Task 5: Stripe webhook clean-break — always notify on new receipt

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts`
- Modify tests under `__tests__/unit/api/stripe-webhook*.ts`

- [ ] Write failing test: CONFIRMED reservation still sends receipt-issued notify（confirmation email skip は維持可）
- [ ] Remove receipt CTA from confirmation-email path dependency; call notify SSoT after issue
- [ ] Run webhook unit tests
- [ ] Commit: `fix(stripe): send receipt-issued mail after webhook issue [ai-gen]`

### Task 6: Confirmation email clean-break — drop receiptDownloadUrl

**Files:**

- Modify: `src/shared/lib/email/reservation-emails.ts`, `event-emails.ts`, `types.ts`, fixtures/tests

- [ ] Write/adjust tests: confirmation email に receiptDownloadUrl を載せない
- [ ] Delete dead props/branches（互換エイリアス残さない）
- [ ] Grep gate or unit assert で埋め込み復活を防止
- [ ] Commit: `refactor(email): remove receipt CTA from confirmation mails [ai-gen]`

### Task 7: Admin UI — payment OFF + Stripe-history refund gate

**Files:**

- Modify: `ReservationDetail.tsx` + page props if needed
- Modify: event registration table refund/manual pay affordances for consistency
- Test: component/unit for visibility rules

- [ ] Write failing tests: payment OFF → hide create-checkout; show refund only if Stripe history; show manual pay when UNPAID && no stripe session
- [ ] Implement UI（disabled+tooltip 残置をやめて非表示/条件表示へ）
- [ ] Run targeted tests
- [ ] Commit: `fix(admin): gate reservation payment actions by feature and Stripe history [ai-gen]`

### Task 8: Wire status token into receipt-issued email + booking mails if needed

**Files:**

- Modify: notify helper to mint status token for guests
- Optionally include status link in reservation confirmation for guests（詳細閲覧用）。領収書 CTA は発行通知のみ

- [ ] Ensure guest receipt email uses `/reservation/status?token=...`
- [ ] Member uses `/mypage/reservations/{id}`
- [ ] Tests for URL shapes
- [ ] Commit: `feat(receipts): point guest receipt mail to status page [ai-gen]`

### Task 9: Validate

- [ ] `bun run validate`
- [ ] Run all newly touched test files via `bun scripts/run-tests.ts`
- [ ] `bun run build` before push per repo policy
- [ ] Open/update PR; auto-merge per CLAUDE.md unless stop exception

## Parallelization guide

| Wave | Tasks                                                   | Agent preference                          |
| ---- | ------------------------------------------------------- | ----------------------------------------- |
| 1    | Task 1 (token) ∥ Task 3 (notify SSoT+template skeleton) | Composer=UI/page later; Grok=token+domain |
| 2    | Task 2 (status page) after Task 1                       | Composer                                  |
| 3    | Task 4 ∥ Task 5 ∥ Task 7 after Task 3                   | Grok=domain/webhook; Composer=admin UI    |
| 4    | Task 6 ∥ Task 8                                         | either                                    |
| 5    | Task 9 sequential                                       | parent                                    |

Do not parallel-edit the same file across agents.
