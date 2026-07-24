# Audit Follow-ups Clean-Break Design (2026-07-24)

> Status: approved by user direction（推奨 6 点・破壊的変更可・公式推奨・後方互換なし）  
> Workspace: `.worktrees/audit-followups-2026-07-24`（`feat/settings-split-*` WIP と隔離）

## Goal

監査で意図的に残した項目のうち、**やるべき 6 点**を clean-break で ship する。HMAC・Decimal DB 移行・legacy rate 除去・sidebar full hide は対象外。

## Non-goals

- SwitchBot inbound HMAC（ベンダー契約なし）
- `Reservation.rateBreakdownJson` legacy 除去 / segment backfill
- Prisma `@db.Decimal` → Int の schema clean-break
- Admin sidebar / route の feature OFF 時 404 hide
- `shared/lib → domain` の全面移動（本シリーズは **ratchet + 直接 cycle 1 件**のみ）

## Locked decisions（曖昧点の解消）

| #   | 論点           | 決定                                                                                           |
| --- | -------------- | ---------------------------------------------------------------------------------------------- |
| D1  | lib→domain     | 既存依存を allowlist 凍結。新規禁止。解消済みエントリは allowlist 残留を fail（ratchet-down）  |
| D2  | GCal cycle     | `extractServiceAccountEmail` を validations へ移し旧名を削除（re-export なし）                 |
| D3  | Rotate 序列    | `deleteWebhook`（未登録は best-effort）→ generate → **DB 書込（old 即失効）** → `setupWebhook` |
| D4  | setup 失敗     | DB は新 token のまま。admin「Webhook を登録」が `ensure`+setup で復旧（旧 URL を返さない）     |
| D5  | clear settings | `switchbotWebhookPathToken` を **null 化**（clean-break hygiene）                              |
| D6  | URL 露出       | admin action / UI はフル webhook URL・生 token を一切返さない                                  |
| D7  | Settings split | god-model `Settings` 列のまま実装（別 PR #1467 系列と独立）                                    |
| D8  | AuditLog       | rotate 専用 audit event は既存 api-keys パターンが無ければ **追加しない**（スコープ外）        |
| D9  | Receipt        | `$extends` に `receipt.taxRate` 追加し手動 `Number()` を削除                                   |
| D10 | Sidebar        | hide しない。muted +「非公開」badge + tooltip。Command palette / quick-actions も同様          |

## PR 分割

| PR  | Branch topic                               | 内容                               |
| --- | ------------------------------------------ | ---------------------------------- |
| 1   | `chore/audit-followups-lib-domain-gate`    | architecture ratchet only          |
| 2   | `fix/gcal-service-account-cycle`           | ESM cycle break                    |
| 3   | `feat/switchbot-webhook-token-rotate-mask` | rotate + URL mask（旧 PR3+4 統合） |
| 4   | `fix/receipt-taxrate-extends`              | Receipt.taxRate `$extends`         |
| 5   | `feat/admin-nav-feature-disabled-badge`    | sidebar / palette disabled UX      |

## PR1 — lib→domain import ratchet

- File: `__tests__/unit/architecture-boundaries.test.ts` only
- Scan `src/shared/lib/**` non-comment lines for domain imports
- Allowlist = current offenders（frozen）
- Fail on new offenders; fail on stale allowlist entries

## PR2 — GCal cycle

- Add `extractGoogleServiceAccountEmail` to `src/shared/lib/validations/google-service-account.ts`
- Delete `extractServiceAccountEmail` / `parseServiceAccountCredentials` from `google-calendar/service-account.ts`
- Update admin-queries + settings + barrel + tests

## PR3 — SwitchBot rotate + mask

- Domain: `rotateSwitchBotWebhookPathToken()` with D3–D5
- Action: `rotateSwitchBotWebhookPathTokenAction` — no `url` in result
- `registerSwitchBotWebhookAction` — remove `url` from result; success copy without URL
- UI: rotate button + confirm; static placeholder path only
- Tests: domain unit matrix; grep gate against client URL leak

## PR4 — Receipt.taxRate

- `create-app-prisma-client.ts` + `prisma.ts` `Receipt` alias
- Remove manual conversions in admin-queries / resend / pdf route

## PR5 — Admin nav badge

- `SidebarItem.featureModule?` + `admin-nav.ts` annotate helpers
- layout resolves `getEnabledFeatures()`
- ResponsiveSidebar + CommandPalette + quick-actions
- Update FeatureModulesForm / security-auth / add-feature-module skill copy
- Drift gate: mapped modules ∈ registry

## Verification（各 PR）

- `bun run validate`
- 該当 `bun scripts/run-tests.ts <paths>`
- PR1/2: architecture-boundaries
- PR3: api-key-commands + switchbot webhook integration as needed
- PR4: receipts unit/integration
- PR5: admin-nav + sidebar + nav-items + architecture drift

## Ship policy

CLAUDE.md 自動完遂: commit → push → PR → auto-merge（1 PR = 1 logical change）。settings-split WIP ブランチには触れない。
