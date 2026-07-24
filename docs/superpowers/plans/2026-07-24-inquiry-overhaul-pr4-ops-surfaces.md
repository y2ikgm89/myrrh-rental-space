# Inquiry Overhaul PR4 — Ops Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Wire schema-ready inquiry ops: assignee, SLA, internal notes, tags, list filters, status history sidebar — clean-break, no dual-read.

**Depends on:** #1475 merged (customer reply).

**Spec:** `docs/superpowers/specs/2026-07-24-inquiry-overhaul-completion-design.md` §6.3 §7

## Global Constraints

- Soft limit ~300 lines / 10 files — split commits; if exceeding, ship PR4a (domain) then PR4b (UI)
- Tests via `bun scripts/run-tests.ts`
- Admin mutations via `executeAdminMutationResult`
- Conventional Commits + `[ai-gen]`
- No attachment / anonymize (PR5/PR6)

---

### Task 1: Domain commands + query extensions

**Concrete paths (explore 2026-07-24):**

- Domain: `src/shared/domain/inquiries/{types,queries}.ts` + **new** `ops-commands.ts`
- Staff: reuse `getNotificationStaffCandidates()` (`domain/users/queries.ts`)
- Actions: `_shared/actions/inquiry.ts` or **new** `inquiry/ops.ts` (`executeAdminMutationResult`)
- nuqs: `src/shared/lib/nuqs/parsers.ts` (`adminInquirySearchParamsParsers`)
- List UI: `inquiries/{page.tsx,_components/InquiryFilters.tsx,InquiryTable.tsx}`
- Detail: `inquiries/[id]/{page.tsx,_components/InquiryDetail.tsx}` + sidebar components
- Tag master: **new** `inquiries/tags/` (mirror post `TagManager` / `tag-commands.ts`)
- Gap: schema+partial assignee query only; commands/UI/notes/tags/history all new

**Files:**

- Modify/Create under `src/shared/domain/inquiries/`:
  - `commands.ts` or `ops-commands.ts` (prefer new file if commands.ts large)
  - `queries.ts` — load statusHistory, internalNotes, tags, assignee for detail; filter list
  - `types.ts` — extend InquiryData / InquiryFilters / InquiryListItem

**Commands:**

- `assignInquiryCommand(inquiryId, assigneeId: string | null, actorUserId)`
- `updateInquirySlaCommand(inquiryId, slaExpiresAt: Date | null)`
- `createInquiryInternalNoteCommand(inquiryId, authorId, body)` / `deleteInquiryInternalNoteCommand(noteId, actorUserId)` (author or admin)
- `setInquiryTagsCommand(inquiryId, tagIds: string[])` — full replace
- `createInquiryTagCommand` / `updateInquiryTagCommand` / `deleteInquiryTagCommand`

**Filters on getInquiries:** existing `assigneeId` + add `tagId`, `customerType`, `slaExpired: boolean`, `createdFrom`/`createdTo` (or from/to Date)

**getInquiryById:** select statusHistory (asc), internalNotes (asc + author name), tags, assignee already partial

**Unit tests:** ops-commands.test.ts

---

### Task 2: Admin actions

**Files:**

- `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts` or `inquiry/ops.ts`
- Zod validate; executeAdminMutationResult; updateTag INQUIRIES + detail

---

### Task 3: Admin UI

**Detail sidebar (`InquiryDetail.tsx` or extracted components):**

- Assignee select (staff users list — reuse existing admin user query if any)
- SLA datetime clear/set
- Tags multi-select + link to tag master if exists
- Internal notes list + add/delete
- Status history read-only timeline

**List:**

- `InquiryFilters.tsx` — assignee, tag, customerType, SLA expired, date range
- `InquiryTable.tsx` — assignee name column, tags compact

**Tag master (minimal):** if no route, add `/admin/inquiries/tags` simple CRUD page OR embed tag create in detail. Prefer minimal page under inquiries.

---

### Task 4: validate + ship

`bun run type-check`, lint:files, unit tests, push PR to main, auto-merge.
