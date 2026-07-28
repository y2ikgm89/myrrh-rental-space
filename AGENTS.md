# AGENTS.md

The SSoT for agent behavior in this repo is [CLAUDE.md](CLAUDE.md). Every
Claude Code, Codex, or SDK-driven agent should read that file first — it
covers stack, structure, testing conventions, absolute rules, and the
self-completion policy that governs commit → push → PR → auto-merge.

Topic-specific rules live in [`.claude/rules/`](.claude/rules/) and get
auto-loaded when the relevant files are touched.

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
  (manual payment remains available). Payment refunds use a 3-phase flow: advisory-lock
  prepare/persist in `$transaction`, Stripe API outside tx (webhook + receipt-backfill
  cron recover Phase C failures).
- Receipts: email on payment success (manual admin record or Stripe); download from
  booking detail hub (guest token status / member mypage). Hub is also the SSoT for
  SwitchBot passcode reveal and email CTAs (plaintext passcodes are not emailed).
- Guests edit on the status hub via the existing status token with the same gates
  as mypage (`UNPAID`, no discounts, modification deadline, availability). Claim
  into mypage remains optional for list management. Status hub VIEW and passcode
  reveal enforce member-ownership when a logged-in customer session coexists with
  a status-token cookie (same policy as guest edit/cancel).
- Guest payment/checkout tokens (event registration and waitlist) transfer via
  HttpOnly cookie through the proxy — not as URL path segments (avoids
  log/Referer/history leaks).
- Event `meetingUrl` must not be selected into public `'use cache'` payloads;
  keep it on authenticated/token/mypage/status query paths only.
- Seed-imported domain helpers must stay seed-safe (no `import "server-only"`);
  Next-only wrappers belong in thin `*-server.ts` modules. `src/shared/lib` must
  not import Prisma (domain/db only); domain enums go through
  `@/shared/lib/validations/enums/prisma-types`.
- Rate-limit uses Cloud Run single-instance + in-memory only; Redis / paid
  distributed rate-limit backends are intentionally out of scope.
- Site Settings are split into domain singleton tables (`SettingsNotification`,
  `SettingsStripe`, `SettingsCommerce`, `SettingsFeatures`, …), not one monolith.
- Inquiries: `InquiryReply` authorship is dual-sided (STAFF → `authorId` / CUSTOMER
  → `authorCustomerId`, DB CHECK forbids cross-side FK pollution); customer replies
  are members-only on NEW/IN_PROGRESS/RESOLVED/FLAGGED (RESOLVED/FLAGGED reopen to
  IN_PROGRESS) and blocked on CLOSED/SPAM; attachments use private R2 +
  authenticated streaming (not the public Media CDN).
- CI service Postgres uses `public.ecr.aws/docker/library/postgres:16` (not Docker
  Hub `postgres:16`) to avoid hosted-runner Hub timeouts; do not revert the image
  reference to match GitHub tutorial examples.
- Guest reservation online payment: no dedicated guest Checkout route. Guests pay via
  admin manual payment, or claim into mypage then use member Checkout (`success_url`
  lands on `/mypage/reservations/:id`). Payment feature OFF still allows reservation
  create + manual admin payment.
- Intentional URL token exceptions (not proxy cookie transfer): receipt download
  confirm (`/receipts/:serial/download?token=`) and waitlist free confirm
  (`/events/waitlist/confirm`) carry tokens in URL/form by design; event registration
  checkout, waitlist paid checkout, reservation status/cancel, and claim routes use
  HttpOnly cookie transfer via `proxy.ts`.
- Unit tests that pull reservation/email side effects must use the shared domain
  email mock helpers (`installEmailLibDispatchMock` /
  `installEmailRenderContextMock`); do not partially mock `@/shared/lib/email/*`
  (missing named exports and `cacheLife()` leaks outside Next).
