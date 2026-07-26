# Guest Reservation Edit Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Guests edit reservations via status-token auth with the same gates as mypage members (clean-break).

**Architecture:** Reuse domain edit gates; authorize guests with existing `reservation-status` token + cookie; share edit form UI; align mypage `canEdit` with UNPAID.

**Tech Stack:** Next.js App Router, Bun test, Conform + Zod, existing Turnstile / rate-limit helpers.

**Spec:** `docs/superpowers/specs/2026-07-26-guest-reservation-edit-parity-design.md`

---

## File map

| File                                                                         | Role                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/shared/domain/reservations/edit-eligibility.ts` (new)                   | Shared canEdit predicates (status/payment/discount/deadline) |
| `src/shared/domain/reservations/customer-commands.ts`                        | Guest update command + use shared eligibility                |
| `src/shared/domain/reservations/guest-status-view.ts`                        | `buildGuestEditHref` / show edit CTA                         |
| `src/app/(public)/reservation/status/edit/page.tsx` (new)                    | Guest edit page                                              |
| `src/app/(public)/reservation/status/edit/_actions/update.ts` (new)          | Guest update action                                          |
| `src/app/(public)/_shared/components/edit-reservation-form.tsx` (move/share) | Shared form                                                  |
| mypage edit page + status page                                               | Wire shared form / CTA                                       |
| mypage detail `canEdit`                                                      | Add UNPAID                                                   |
| `AGENTS.md`                                                                  | Update guest edit fact                                       |
| Tests                                                                        | unit + integration                                           |

---

### Task 1: Shared eligibility + domain guest update

- [ ] Add `edit-eligibility.ts` with predicates used by page CTA and domain
- [ ] Add `updateGuestReservationByStatusToken` (or generalize ownership) reusing gate body
- [ ] Unit tests for gates (UNPAID, discount, deadline, status)

### Task 2: Guest action + page

- [ ] `updateGuestReservationAction` mirroring cancel guest action hierarchy
- [ ] `/reservation/status/edit` page with status-token access + same redirects as mypage
- [ ] Side effects + updated email after success

### Task 3: Shared form + CTAs

- [ ] Extract/share `EditReservationForm` (action injectable)
- [ ] Status hub CTA when editable
- [ ] Mypage `canEdit` includes UNPAID

### Task 4: AGENTS + validate + PR

- [ ] Update AGENTS.md guest-edit wording
- [ ] `bun run validate` + targeted tests
- [ ] Commit, push, PR, auto-merge
