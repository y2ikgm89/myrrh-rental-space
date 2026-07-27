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
- Prefer concurrent work that does not disturb other in-flight sessions or branches
  (isolate via worktrees or separate branches).
- Do not leave ambiguous or unverified points; investigate and validate against
  official docs before implementing.
- Prefer free / no-cost fixes first; defer paid infrastructure work unless clearly
  needed.
- For SwitchBot, keep admin notifications and remote lock/unlock out of scope
  (handled by the SwitchBot app); admin lock-state visibility is welcome.

## Learned Workspace Facts

- Production smart-lock hardware is a SwitchBot fingerprint Keypad (Keypad Touch /
  Vision family) for passcodes, paired with Lock Pro / Lock Lite for lock/door
  state — not Lock Vision Pro.
- SwitchBot passcode automation is Settings-gated (`switchbotEnabled`), not a
  Feature Module; `keyId` comes from Device List `keyList` (not Device Status);
  createKey/deleteKey are webhook-primary and asynchronous.
- SwitchBot `timeLimit` passcodes bake `startTime`/`endTime` at create (no
  updateKey for the validity window), so same-space reservation datetime changes
  still require deleteKey → createKey reissue for guests and members alike.
- Admin smart-lock UI shows lock/door/battery state; remote lock/unlock and admin
  push notifications are intentionally out of scope.
- Stripe payments are optional; ON/OFF is Feature Module `payment` (credentials live
  in Settings billing). Public and admin must work fully when payment is OFF
  (manual payment remains available).
- Receipts: email on payment success (manual admin record or Stripe); download from
  booking detail hub (guest token status / member mypage). Hub is also the SSoT for
  SwitchBot passcode reveal and email CTAs (plaintext passcodes are not emailed).
- Guests edit on the status hub via the existing status token with the same gates
  as mypage (`UNPAID`, no discounts, modification deadline, availability). Claim
  into mypage remains optional for list management.
- Passcode reveal on the status hub enforces member-ownership when a logged-in
  customer session coexists with a status-token cookie (mirrors guest edit/cancel).
- Rate-limit uses Cloud Run single-instance + in-memory only; Redis / paid
  distributed rate-limit backends are intentionally out of scope.
- Site Settings are split into domain singleton tables (`SettingsNotification`,
  `SettingsStripe`, `SettingsCommerce`, `SettingsFeatures`, …), not one monolith.
- `InquiryReply` authorship is dual-sided: STAFF → `authorId` (User), CUSTOMER →
  `authorCustomerId` (Customer); DB CHECK forbids cross-side FK pollution.
- Customer inquiry replies are members-only; allowed on NEW/IN_PROGRESS/RESOLVED/
  FLAGGED (RESOLVED/FLAGGED reopen to IN_PROGRESS); blocked on CLOSED/SPAM.
- Inquiry attachments must use private R2 + authenticated streaming; the public
  Media CDN must not be reused for inquiry PII.
- CI service Postgres uses `public.ecr.aws/docker/library/postgres:16` (not Docker
  Hub `postgres:16`) to avoid hosted-runner Hub timeouts; do not revert the image
  reference to match GitHub tutorial examples.
