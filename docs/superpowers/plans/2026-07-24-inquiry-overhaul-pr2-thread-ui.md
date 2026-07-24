# Inquiry Overhaul PR2 — Thread UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox steps for tracking.

**Goal:** Show the full STAFF+CUSTOMER reply thread on admin inquiry detail and customer mypage detail (read-only; no customer write yet).

**Architecture:** Replace “latest STAFF reply only” admin card and mypage STAFF-only filter with chronological thread rendering of `inquiry.message` + `inquiry.replies` (already loaded ascending). Reuse existing design-system cards/badges. No schema changes.

**Tech Stack:** Next.js App Router, admin shadcn UI, public design-system Heading/Badge

**Depends on:** PR1 merged or same stack (`authorName` works for CUSTOMER when present)

**Spec:** `docs/superpowers/specs/2026-07-24-inquiry-overhaul-completion-design.md` §6.2 / §7

## Global Constraints

- Clean-break: remove STAFF-only filters and “latest only” comments
- Internal notes / tags / assignee not in this PR
- Customer reply form is PR3 (do not add write UI here)
- Soft limit ~300 lines / 10 files
- Tests via `bun scripts/run-tests.ts`
- Conventional Commits + `[ai-gen]`

---

### Task 1: Admin InquiryDetail thread

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`
- Optional extract: `.../inquiries/[id]/_components/InquiryThread.tsx` if Detail exceeds maintainability

**Interfaces:**

- Consumes: `Serialized<InquiryWithCustomer>` with `replies: InquiryReplyItem[]`
- Produces: chronological UI — original message card, then each reply with authorType label + authorName + timestamp

- [ ] **Step 1: Replace latest-staff-only block**

Remove `staffReplies` / `latestStaffReply` logic. Render:

1. Existing “お問い合わせ内容” card for `inquiry.message` (keep)
2. For each `inquiry.replies` in order: card titled `スタッフ` or `お客様` based on `authorType`, body, `authorName ?? fallback`, `formatDate(createdAt, true)`
3. Keep reply form (“回答を送信” / “追加返信”) unchanged

- [ ] **Step 2: Lint + manual sanity**

Run: `bun run lint:files -- src/app/(admin)/admin/(dashboard)/inquiries/[id]/_components/InquiryDetail.tsx`

- [ ] **Step 3: Commit**

`feat(inquiry): show full reply thread on admin detail [ai-gen]`

---

### Task 2: Mypage inquiry detail thread

**Files:**

- Modify: `src/app/(public)/mypage/inquiries/[id]/page.tsx`
- Test: extend `e2e/authenticated/customer/inquiries.spec.ts` if fixtures already cover replies; else unit is optional for presentational page

**Interfaces:**

- Consumes: `CustomerInquiryDetail.replies` (all authorTypes after PR1 select)
- Produces: thread including CUSTOMER replies; remove STAFF-only filter and Phase 5 exclusion comments

- [ ] **Step 1: Render all replies**

Map `inquiry.replies` without filtering. Distinguish STAFF vs CUSTOMER visually (existing staff card style + mirrored customer style). Keep initial customer message as first item.

- [ ] **Step 2: Update file header comments** — remove “CUSTOMER Phase 5 除外”

- [ ] **Step 3: Commit**

`feat(inquiry): show full reply thread on mypage detail [ai-gen]`

---

### Task 3: Validate + PR

```bash
bun run validate
bun scripts/run-tests.ts __tests__/unit/domain/inquiries/
```

Open PR against main (or stack on PR1 if not merged): `feat(inquiry): full inquiry reply thread UI`

---

## Out of scope

Customer reply action/form, attachments, assignee/tags/notes, status history sidebar
