# AGENTS.md

The SSoT for agent behavior in this repo is [CLAUDE.md](CLAUDE.md). Every
Claude Code, Codex, or SDK-driven agent should read that file first — it
covers stack, structure, testing conventions, absolute rules, and the
self-completion policy that governs commit → push → PR → auto-merge.

Topic-specific rules live in [`.claude/rules/`](.claude/rules/) and get
auto-loaded when the relevant files are touched. Parallel PRs that edit
`LIB_TO_DOMAIN` (and similar ratchet allowlists) must stay serial — see
[`.claude/rules/architecture-allowlist.md`](.claude/rules/architecture-allowlist.md).

Multi-step workflows (adding a Prisma migration, adding a section type,
debugging a failed deploy, …) live in [`.claude/skills/`](.claude/skills/) and
are invoked as slash commands.

For human onboarding — setup, common commands, repo layout — see
[README.md](README.md).

## Assistant tool preference

- Use targeted file reads and `Grep` / `Glob` before broad searches.
- Use Context7 before answering or coding against libraries, frameworks, SDKs,
  CLI tools, or cloud services. `resolve-library-id` then `query-docs`.
- Never print, copy, or commit secret values. Treat non-example `.env*` files
  as protected.

## Learned User Preferences

- Prefer official-docs-aligned, clean-break implementations without backward-compat
  shims when redesigning integrations.
- When parallelizing work with subagents, use Composer or Grok as appropriate.
- Prefer concurrent work that does not disturb other in-flight sessions or branches;
  stay inside the assigned/existing `.worktrees/*` worktree (or a separate branch)
  and do not create temp worktrees or touch unrelated worktrees.
- Do not leave ambiguous or unverified points; investigate and validate against
  official docs before implementing.
- Prefer free / no-cost fixes first; defer paid infrastructure work and durable
  Stripe outbox designs unless clearly needed.
- For SwitchBot, keep admin notifications and remote lock/unlock out of scope
  (handled by the SwitchBot app); admin lock-state visibility is welcome.
- Prefer new focused architecture gates under `__tests__/unit/architecture/` over
  further growth of the large `architecture-boundaries.test.ts`.
- When a shared fix lands on `main`, prefer merging `origin/main` into open PR
  branches over cherry-picking the same commit into each branch.
- Split oversized modules only on clear ownership seams (tabs, payment kernels,
  series boundaries); do not split by line count alone. Leave data-dump modules
  such as `terms-templates` and enum helpers large.
- When clearing architecture allowlist entries (`LIB_TO_DOMAIN` and similar), keep
  allowlist-editing PRs serial (one OPEN at a time); resolve conflicts as the
  union of deletions and never resurrect cleared entries. Rematch `origin/main`
  promptly after each related merge. `customer-auth.ts` is an intentional permanent
  Better Auth `beforeDelete` adapter — do not force the allowlist to zero or add DI
  shims to clear it. Detail: `.claude/rules/architecture-allowlist.md`.
- Do not commit, push, or open PRs unless the user explicitly asks (overrides
  CLAUDE.md auto-ship policy). Phrases like 「推奨の作業を」 or 「公式推奨の作業を」
  count as explicit ship authorization for that session.
- Integration tests asserting rejected `DomainError`s: prefer try/catch +
  `expect(thrown).toMatchObject` over `await expect(...).rejects.toMatchObject`
  (Bun 1.3.14 can hang on the latter).

## Learned Workspace Facts

- Production smart-lock hardware is a SwitchBot fingerprint Keypad (Keypad Touch /
  Vision family) for passcodes, paired with Lock Pro / Lock Lite for lock/door
  state — not Lock Vision Pro. Passcode automation is Settings-gated
  (`switchbotEnabled`), not a Feature Module; `keyId` comes from Device List
  `keyList` (not Device Status); createKey/deleteKey are webhook-primary and
  asynchronous. `timeLimit` passcodes bake `startTime`/`endTime` at create, so
  datetime changes need deleteKey → createKey; reissue must wait for revoke
  confirmation before createKey to avoid a dual-valid keypad window. Admin UI
  shows lock/door/battery only (no remote lock/unlock or admin push).
- Stripe payments are optional; ON/OFF is Feature Module `payment` (credentials live
  in Settings billing). Public and admin must work fully when payment is OFF
  (manual payment remains available). Offline bank transfer uses `TransferAccount`
  master + `SettingsOrganization.transferGuidance`; when payment is OFF and status
  is UNPAID/FAILED, customer hubs/emails show accounts via `shouldShowTransferAccounts`
  in `src/shared/lib/settings/` (lib gate, not domain — LIB_TO_DOMAIN compliance).
  Payment refunds use a 3-phase flow: advisory-lock prepare/persist in `$transaction`,
  Stripe API outside tx (webhook + receipt-backfill cron recover Phase C failures).
- Receipts: email on payment success (manual admin record or Stripe); download from
  booking detail hub (guest token status / member mypage). Hub is also the SSoT for
  SwitchBot passcode reveal and email CTAs (plaintext passcodes are not emailed).
- Guest flows: checkout/status/cancel/claim tokens use HttpOnly cookie transfer
  via `proxy.ts` (not URL path segments). Intentional URL/form token exceptions:
  receipt download confirm and waitlist free confirm. Guest reservation online
  payment has no dedicated guest Checkout route — pay via admin manual payment or
  claim into mypage (`success_url` → `/mypage/reservations/:id`); payment feature
  OFF still allows create + manual pay. Guests edit on the status hub via the
  status token with the same gates as mypage (`UNPAID`, no discounts, modification
  deadline, availability); claim into mypage remains optional. Event registration
  self-serve edit: guest status token `/events/registrations/status/edit`, member
  `/mypage/events/[id]/edit`; gates in `edit-eligibility.ts` (reservation-edit
  aligned); updates emit `event-registration-updated` email and
  `NOTIFICATION_TYPE.EVENT_REGISTRATION_UPDATE`. Customer-initiated cancellation
  is blocked while `paymentStatus === PENDING` (Stripe Checkout in flight); UI
  gates via `canCustomerInitiateCancellation` / `buildGuestCancelHref`. Status
  hub VIEW, passcode reveal, and guest edit/cancel enforce member-ownership when
  a logged-in customer session coexists with a status-token cookie.
- Event `meetingUrl` must not be selected into public `'use cache'` payloads;
  keep it on authenticated/token/mypage/status query paths only.
- Advisory lock coordination: event capacity writes serialize on namespace 728350
  (`lockEventRegistrationForTransaction`) — registration/cancel/waitlist/onsite and
  admin capacity/slot/ticket sync must all take 728350 before capacity-changing work.
  Space writes (reservation create/cancel/lifecycle/pending-expiry/series, plus
  BlockedDate via `acquireBlockedDateWriteLocks`) take 728351
  (`lockSpaceForTransaction`) before overlap/capacity-changing work; GLOBAL/LOCATION
  BlockedDate scopes lock affected spaces in id ascending order.
- Seed-imported domain helpers must stay seed-safe (no `import "server-only"`);
  Next-only wrappers belong in thin `*-server.ts` modules. `src/shared/lib` must
  not import Prisma (domain/db only); domain enums go through
  `@/shared/lib/validations/enums/prisma-types`.
- Customer anonymize (`anonymizeCustomerCommand` SSoT) redacts Customer PII in place;
  linked Inquiry PII is **not** auto-anonymized (design §6.5 — Inquiry は独立した匿名化
  対象。`anonymizeInquiryCommand` を個別に呼ぶ). Self-serve guest→member merge is
  Google trusted-provider only (`CUSTOMER_TRUSTED_PROVIDERS`); uses
  `PendingCustomerMerge` + email verification at `/mypage/merge/*` and reuses
  `mergeCustomerCommand` (transfer InquiryReply/InquiryAttachment Restrict FKs first).
- `(admin)` must not import `@/public` and `(public)` must not import `@/admin`
  (enforced by `cross-surface-import-gate.test.ts`).
- Unit tests that pull reservation/email side effects must use the shared domain
  email mock helpers (`installEmailLibDispatchMock` /
  `installEmailRenderContextMock`); do not partially mock `@/shared/lib/email/*`
  (missing named exports and `cacheLife()` leaks outside Next). Resend
  `idempotencyKey` must be deterministic per send intent (e.g. `reminderWindowDate`
  JST YYYY-MM-DD); exception: `receipt-resend` appends a per-request suffix
  (`Date.now()`/nonce) because each resend mints a new download token payload.
- CSP (`src/proxy.ts`): split `style-src` (nonce-only for `<style>`) from
  `style-src-attr 'unsafe-inline'` (CSP3 cannot nonce HTML `style=` attributes).
  Removing `'unsafe-inline'` from `style-src` alone also blocks CSS-var `style=`.
  Dynamic UI styling uses `src/shared/lib/csp/css-vars.ts` (`cssVarStyle` /
  `ImperativeCssScope` + Tailwind `var(--*)` classes) or `use-imperative-style.ts`
  for client transforms; direct `backgroundColor`/`color`/etc. in React `style=`
  are forbidden.
- Schema/Prisma/migration conventions: no `@db.Decimal` — tax rates are whole-% Int
  (`10 = 10%`); `Space.area` is ㎡×100 Int (`2550 = 25.5㎡`) with ×100/÷100 at
  domain boundary only (UI/forms stay ㎡ and % numbers). Prisma is a single
  `@/shared/db/prisma` singleton — no `basePrisma`, `createAppPrismaClient`, or
  Decimal `$extends`. `rateBreakdownJson` is a future-breakdown snapshot (no `legacy`
  flag); receipt amounts use `totalPriceWithTax`. Multi-column `ALTER COLUMN ... TYPE`
  that triggers squawk `changing-column-type` needs an entry in
  `scripts/lint-migrations.ts` intentional-breaking allowlist (inline
  `-- squawk-ignore` alone is insufficient). Planned-downtime deploy mode is triggered
  by the DDL listed below — note `ALTER COLUMN ... TYPE` **does** trigger it. The
  authoritative source is the grep pattern in
  `.github/workflows/deploy-production.yml`; this list is pinned to it by
  `__tests__/unit/architecture/breaking-migration-detection.test.ts`.

<!-- breaking-triggers:start -->

ALTER TABLE ... DROP COLUMN / ALTER TABLE ... DROP CONSTRAINT / ALTER TABLE ... RENAME COLUMN / ALTER TABLE ... RENAME TO / ALTER TABLE ... ALTER COLUMN ... SET NOT NULL / ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT / ALTER TABLE ... ALTER COLUMN ... TYPE / ALTER TYPE ... RENAME VALUE / ALTER TYPE ... RENAME TO / DROP TABLE / DROP TYPE

<!-- breaking-triggers:end -->

Domain code must not contain
literal `"eventRegistration"` (AuditLog resource grep false positive); for Prisma
tx delegate typing use template literal types (e.g. `` `event${"Registration"}` ``).
