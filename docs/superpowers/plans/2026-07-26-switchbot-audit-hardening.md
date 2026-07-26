# SwitchBot Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close SwitchBot/smart-lock audit holes with official async createKey/deleteKey semantics and clean-break behavior (no compat shims).

**Architecture:** Webhook + Device List keyList remain SSoT. Never drop tracking (device row / credentials / passcode row) while a physical key may still exist. Issue/revoke are decoupled from email sends. Reissue waits for deleteKey confirmation before createKey.

**Tech Stack:** Bun, Next.js App Router, Prisma, SwitchBot Open API, bun test via `scripts/run-tests.ts`

## Global Constraints

- Clean break: no backward-compat shims or dual paths
- Official contract: createKey/deleteKey async; keyId from Device List `keyList`; timeLimit keys need delete→create for window changes
- Do not email plaintext passcodes
- Prisma only via `@/shared/db/prisma` + `import "server-only"`
- Tests via `bun scripts/run-tests.ts` only
- Work only in `.worktrees/fix-switchbot-audit-hardening` on branch `fix/switchbot-audit-hardening`
- Do not commit secrets; Conventional Commits + `[ai-gen]` when AI-authored

---

## File Map

| Area                     | Files                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle wiring         | `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts`, `src/shared/lib/calendar-sync/inbound.ts`           |
| Credentials / clear      | `src/shared/domain/settings/api-key-queries.ts`, `src/shared/domain/settings/api-key-commands.ts`                             |
| Device delete / bind     | `src/shared/domain/smart-lock/commands.ts`, `src/shared/domain/spaces/commands.ts`                                            |
| Issue / revoke / reissue | `src/shared/domain/smart-lock/issue-passcode.ts`, `revoke-passcode.ts`, `src/shared/domain/reservations/edit-side-effects.ts` |
| Webhook                  | `src/app/api/webhooks/switchbot/[token]/route.ts`, `src/shared/domain/smart-lock/webhook-commands.ts`                         |
| Reveal                   | `src/shared/domain/smart-lock/customer-passcode-queries.ts`                                                                   |
| Admin UX                 | `SmartLockDeviceRegistry.tsx`, smart-lock validations / create command                                                        |
| Tests                    | `__tests__/unit/domain/smart-lock/*`, calendar/webhook tests as needed                                                        |

---

### Task A — Lifecycle wiring (Composer)

**Files:** `admin.ts`, `inbound.ts` (+ tests)

- [ ] Admin CONFIRMED create always calls `issueSmartLockPasscodes` (or shared helper) even when `sendEmail === false`; email remains gated by `sendEmail`
- [ ] After successful `applyCalendarTimeChange`, fire `applyReservationEditSideEffects` with old/new times (same space)
- [ ] Unit/integration coverage for both paths
- [ ] Commit: `fix(smart-lock): issue passcodes independent of email and gcal reissue [ai-gen]`

### Task B — State machine / orphan prevention (Grok)

**Files:** credentials queries/commands, smart-lock commands, issue/revoke, edit-side-effects, cron helpers

- [ ] Add decrypt-for-revocation path that works when `switchbotEnabled=false` but ciphertext still present (clear/revoke/cleanup only). Issue path still requires enabled
- [ ] `clearSwitchBotSettings`: revoke CONFIRMED (+ recover PENDING via Device List delete when keyId/name known) before wiping credentials; block clear while REVOKE_PENDING/PENDING unresolved
- [ ] `deleteSmartLockDeviceCommand`: after `revokeOne`, do **not** delete device until no CONFIRMED/PENDING/REVOKE_PENDING remain (await key-absence poll or require retry). Never cascade-away tracking of live keys
- [ ] `applyReservationEditSideEffects`: await revoke confirmation (key absence) before deleting terminal rows and createKey; if revoke not confirmed, return `issuanceFailed: true` and keep tracking
- [ ] `revokeSmartLockPasscodesForReservation`: also handle PENDING with known command/key via Device List name lookup + deleteKey when safe; webhook create success must revoke immediately if reservation already CANCELLED
- [ ] `expireStalePendingSmartLockPasscodes`: before FAILED, Device List lookup by `buildPasscodeName`; if key exists, deleteKey → track REVOKE_PENDING/REVOKED; only FAILED when absent or delete accepted+confirmed path chosen
- [ ] FAILED rows: allow clean-break retry by deleting FAILED then re-issuing from explicit reissue/admin paths (edit-side-effects already deletes FAILED when deviceSame) — ensure public confirm retry / admin restore can recover
- [ ] Tests for clear-when-disabled, device delete gating, reissue waits, stale orphan recovery
- [ ] Commit: `fix(smart-lock): await revoke confirmation before drop tracking [ai-gen]`

### Task C — Webhook / reveal / registry (Composer)

**Files:** webhook route, webhook-commands, customer-passcode-queries, device registry/validation

- [ ] Parse optional `keyName` in webhook schema; pass to `processSwitchBotChangeReport`
- [ ] Reveal window: use stored `SmartLockPasscode.startTime/endTime` (not live buffer recompute)
- [ ] Lock-state updates: ignore older `timeOfSample` than stored `lastStateAt`
- [ ] Device create/update: optional/required Device List verification of `deviceId` + type family (pad vs lock) — clean break prefer verify-on-save when credentials enabled
- [ ] Admin device delete UI: confirm dialog before calling delete
- [ ] `toggleSmartLockDeviceActiveCommand` / `setSpaceSmartLockDeviceCommand`: when deactivating or unbinding pad that has future CONFIRMED passcodes, revoke those passcodes; when binding a new pad to a space with future CONFIRMED reservations lacking passcodes, issue for those reservations (best-effort fire-and-forget with admin notification on failure)
- [ ] Tests + commit: `fix(smart-lock): harden webhook reveal and device registry [ai-gen]`

### Task D — Verify & ship (parent)

- [ ] `bun scripts/run-tests.ts` on touched smart-lock / calendar / webhook tests
- [ ] `bun run validate && bun run build:skip-env` (or `build` if env available)
- [ ] Push + PR + auto-merge per CLAUDE.md
