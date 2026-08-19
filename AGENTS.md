## Learned User Preferences

- When breaking changes are allowed, prefer official-recommended clean-break designs over compatibility shims or per-model adapters.
- After a planned program wave finishes, continue recommended follow-up work without waiting to be asked.
- When fixing a class of issue, find similar occurrences and design to prevent recurrence. Do not leave ambiguities; investigate and verify thoroughly before proceeding.

## Learned Workspace Facts

- Integration connection health is stored in the `IntegrationHealth` table and read/written only through `src/shared/domain/settings/connection-health.ts`. Auth failures go to ERROR immediately; transient failures need 3 consecutive failures; success auto-recovers to CONNECTED.
- Production deploys are manual: `.github/workflows/deploy-production.yml` is `workflow_dispatch` only (cost/wake control), so merging to main does not deploy code or run `terraform apply`. Dispatch it via Actions or `gh workflow run deploy-production.yml --ref main`.
- Cloud Monitoring log metrics, email notification channel, and alert policies live in `terraform/monitoring.tf` (`infra/monitoring/` YAML is gone). Apply happens via the manual Deploy Production workflow; email alerts need GitHub secret `MONITORING_ALERT_EMAIL_TF` and a one-time GCP channel confirmation.
- Google API retry classification lives in `src/shared/lib/google-api/retry.ts` (retryable: 408/429/500/502/503/504). Calendar `events.insert` uses client-specified deterministic event IDs so POST retry is idempotent (409 treated as success).
- The Google Calendar webhook intentionally returns 200 even on processing failure (retry-storm prevention); failures are surfaced via `IntegrationHealth` records, the admin Calendar StatusBanner error message, and the `google_calendar_sync_failure` log metric + alert instead.
- CSP in `src/proxy.ts` deliberately relaxes `style-src` with `'unsafe-inline'` in development only (per the official Next.js CSP guide): Next.js 16 devtools injects nonce-less `<style>` tags and has no nonce API, so strict style-src in dev only produces console noise. Production keeps nonce + hashes.
- A migration edited after being applied locally leaves the DB silently diverged — `prisma migrate status` still reports "up to date" while the actual table is missing or different. If the app errors on a table that migrations claim to have, rebuild the local DB with `bun run db:reset`.
- This repo enables Next.js 16 `cacheComponents: true` (next.config.ts), under which `Date.now()` and other unstable values read during prerender fail with a Blocking Route (`blocking-prerender-current-time`) error. The official fix is `await connection()` before the read; a layout `connection()` does not protect page segments (separate prerender entries), and `instant = false` does not clear sync IO errors. Admin dashboard guards in `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts` call `connection()` first because `verifyAdminSession` → `recordAdminLoginSuccess` reads `Date.now()`; order is enforced by `__tests__/unit/architecture/admin-guard-connection-order.test.ts`.
- SwitchBot Open Token / Secret Key are stored AES-256-GCM encrypted in the `settings_switchbot` singleton (not env). Saving requires a 64-hex `ENCRYPTION_KEY` (local `.env.local`, filled by `bun run setup` when empty; production GCP Secret Manager injected into both Cloud Run services). Local and production keys are independent. Restart the human-owned dev server after changing the key. An empty key surfaces as 「Open Tokenの暗号化に失敗しました」.
- SwitchBot has no sandbox: CONFIRMED reservations issue a real keypad passcode for `Space.smartLockDeviceId` only (location default is new-space init, not an issue-time fallback; no auto-pick among multiple pads; no cross-location assign). Official Device List `keyList.id` is Integer; Prisma `switchbotKeyId` is Text — absorb at the API boundary. Webhook is canonical (Keypad Touch `createKey` omits `commandId`; correlate commandId → keyName → single PENDING); localhost webhook URLs cannot receive SwitchBot cloud events; Device List `keyList` can lag 120s+.
- SwitchBot passcodes are omitted from confirmation email (link to reservation detail instead). Member: `/mypage/reservations/{id}`; guest: `/reservation/status?token=`. Revealed only during reservation ± buffer (admin SwitchBot setting, default 15 min, 0–180, same minutes before and after).
- Conform custom controls go through `src/shared/lib/conform/control.tsx` (`useFieldControl` / `useTypedControl` + `HiddenControlInput`). Do not import `useInputControl` / `useControl` / `unstable_useControl` from `@conform-to/react` in `src/**` — `useInputControl` looks up `document.forms` and warns when a Radix Portal delays the form by 1 render. Subscribe to values with `fields.X.value`. The import ban is `__tests__/unit/architecture/conform-use-control-wrapper.test.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
