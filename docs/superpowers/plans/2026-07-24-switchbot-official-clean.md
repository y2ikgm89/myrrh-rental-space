# SwitchBot Official Clean Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align SwitchBot smart-lock with official v1.1 contracts (Device List keyList, webhook-primary command results, async deleteKey) and add Lock/Lock Lite/Lock Pro door-state in admin — clean break, no backward compat.

**Architecture:** Keypad-family devices issue/revoke passcodes; lock-family devices only store lockState/doorState/battery from webhooks (+ status refresh for doorState). `getDeviceStatus` removed for keyList; Status used only for lock doorState refresh.

**Tech Stack:** Next.js 16, Prisma 7 / PostgreSQL, Bun test via `scripts/run-tests.ts`

**Worktree:** `.worktrees/feat-switchbot-official-clean` on `feat/switchbot-official-clean`

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-switchbot-official-clean-redesign.md`
- No env fallback for SwitchBot; no v1.0 API
- Breaking enum migration requires downtime mode (approved)
- Tests via `bun scripts/run-tests.ts <path>` only
- `bun run validate` before done

---

## Task 1: Schema + migrations

- [ ] Update `prisma/schema.prisma`: passcode status `REVOKE_PENDING`, columns `switchbotDeleteCommandId`/`revokeRequestedAt`, device state columns + `pairedLockDeviceId`, enum replace LOCK_VISION_PRO → LOCK/LOCK_LITE/LOCK_PRO
- [ ] Migration A (additive): REVOKE_PENDING + columns
- [ ] Migration B (breaking): device type enum recreate + DELETE LOCK_VISION_PRO rows first
- [ ] Labels/helpers/UI type lists
- [ ] `bun run db:generate`

## Task 2: switchbot-client

- [ ] Extend DeviceListItem with keyList; add findKeyInDeviceList / findKeyByIdInDeviceList / getDeviceListCached
- [ ] deletePasscode returns optional commandId
- [ ] Add getLockDeviceStatus (status for lockState/doorState only) OR keep thin status helper named for locks
- [ ] Remove getDeviceStatus keyList usage
- [ ] Update unit tests

## Task 3: Issue + create webhook

- [ ] issue-passcode uses Device List poll (sparse) + resolveSwitchbotKeyId
- [ ] Comments: webhook primary
- [ ] webhook-commands createKey path uses Device List
- [ ] Route: changeReport + command vs lockState branching; eventName trim
- [ ] Update tests

## Task 4: Async revoke

- [ ] revokeOne → REVOKE_PENDING
- [ ] deleteKey webhook handler
- [ ] expireStaleRevokePending + cron
- [ ] Device delete guards include REVOKE_PENDING
- [ ] Update tests

## Task 5: Lock state admin

- [ ] Webhook lockState updates
- [ ] Pad-only assignment validation
- [ ] Registry UI: lock types, state badges, pair link, refresh
- [ ] Tests

## Task 6: Verify + ship

- [ ] `bun scripts/run-tests.ts` smart-lock + webhook + cron
- [ ] `bun run validate && bun run build`
- [ ] commit / push / PR / auto-merge
