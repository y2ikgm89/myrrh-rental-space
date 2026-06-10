---
description: 認証・RBAC・レート制限・SSRF・暗号化・監査ログの SSoT シングルトン一覧
paths:
  - src/shared/lib/admin-auth*
  - src/shared/lib/admin-roles*
  - src/shared/lib/admin-permissions*
  - src/shared/lib/admin-resources*
  - src/shared/lib/customer-auth*
  - src/shared/lib/rate-limit*
  - src/shared/lib/ssrf-guard*
  - src/shared/lib/crypto*
  - src/shared/lib/async-utils*
  - src/shared/lib/turnstile*
  - src/shared/lib/validations/enums/guards*
  - src/app/(admin)/**/_shared/lib/**
  - src/app/(admin)/**/_shared/actions/**
---

# SSOT 定数・シングルトン（認証・RBAC）

プロジェクト全体で単一定義を厳守する定数・シングルトン一覧。ローカル再定義・重複定義は禁止。

## 認証・権限

| 定数/変数                                                                                                      | 場所                                                              | メモ                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ROLES` / `ROLE_LABELS` / `ROLE_DESCRIPTIONS` / `isDashboardRole()` / `DashboardRole`                | `@/shared/lib/admin-roles`                                        | client-safe Role SSoT。tuple のため `isDashboardRole()` 型ガード必須。`admin-auth.ts`（server-only）が再 export                                                                                                                                                              |
| `INVITABLE_BY` / `getInvitableRoles()` / `canInviteRole()` / `canModifyUser()`                                 | `@/shared/lib/admin-roles`                                        | client-safe RBAC 階層制御。SUPER_ADMIN→ADMIN/EDITOR/VIEWER、ADMIN→EDITOR/VIEWER のみ（特権昇格防止）                                                                                                                                                                         |
| `adminAuth` / `customerAuth`                                                                                   | `@/shared/lib/{admin,customer}-auth`                              | cookie prefix 分離。顧客は Google/LINE、`basePath: /api/customer-auth`                                                                                                                                                                                                       |
| `Resource` / `Action` / `RESOURCE_LABELS`                                                                      | `@/shared/lib/admin-resources`                                    | client-safe Resource SSoT。`admin/_shared/lib/permissions.ts` が type 再 export                                                                                                                                                                                              |
| `ROLE_PERMISSIONS` / `hasPermission` / `PermissionKey` / `RolePermissions`                                     | `@/shared/lib/admin-permissions`                                  | client-safe 純粋 RBAC SSoT。`hasPermission(role, resource, action)` は同期純粋関数。server-only 系（`userHasPermission` 等）は `@/admin/_shared/lib/permissions.ts` に残置                                                                                                   |
| `NavItem` / `QuickAction` / `RecentItem` / `SearchResultItem` / `SearchResultGroup`                            | `@/shared/lib/command-palette-types`                              | Command Palette 共有型 SSoT。admin UI と `shared/domain/{admin-search,audit/recents-queries}` の両方から参照                                                                                                                                                                 |
| `TURNSTILE_ACTIONS` / `TurnstileAction` / `DEFAULT_TURNSTILE_APPEARANCE`                                       | `@/shared/lib/turnstile-actions`                                  | client-safe Turnstile action SSoT（英数/`_`/`-`、最大32文字）。server 側 `expectedAction` 検証で同一値参照                                                                                                                                                                   |
| `isUrlSafe(url): Promise<boolean>` / `isUrlSafeSync(url)` / `isPrivateOrReservedHost(host)`                    | `@/shared/lib/ssrf-guard`                                         | **外部 URL fetch 前 SSRF ガード SSoT**。OGP / webhook 等 user 入力 URL fetch では `await isUrlSafe(url)` 必須（DNS rebinding 攻撃遮断）。`isUrlSafeSync` 単独は不十分                                                                                                        |
| `RateLimitStore` / `InMemoryRateLimitStore` / `createRateLimiter(options, store?)`                             | `@/shared/lib/rate-limit`                                         | レート制限 adapter pattern SSoT。`check(token): Promise<RateLimitResult>` で distributed backend に切替可能。Cloud Run multi-instance では per-instance のみのため完全分散制限は `RedisRateLimitStore` 実装が必要                                                            |
| `LogoutButton` / `HeaderAuthSlot`                                                                              | `@/public/components/{ui,layouts}/*`                              | 公開顧客ログアウト SSoT。`HeaderAuthSlot` は `"authenticated" \| "guest"` discriminated union。**マイページ等にローカル配置禁止**（→ `auth-patterns.md`）                                                                                                                    |
| `executeAdminMutationResult`                                                                                   | `@/admin/lib/admin-action`                                        | 管理画面書き込み系 Server Action SSoT。実行順序 `auth → resolveResourceId → hasPermission → resourceAccess → execute → await afterSuccess → fireAndForget(logAction)` で不変。`await logAction` 化は silent regression（→ `server-actions/implementation/admin-actions.md`） |
| `getSectionPageIdQuery` / `getPageIdBySlugQuery`                                                               | `@/shared/domain/{sections,pages}/admin-queries`                  | 子→親の認可キー解決 SSoT helper（`resolveResourceId` callback から認証後に呼ぶ）。→ `auth-patterns.md §EDITOR ロール契約`                                                                                                                                                    |
| `fireAndForget` / `settleAllWithLogging`                                                                       | `@/shared/lib/async-utils`                                        | 非クリティカル Promise の unhandled rejection 防止 SSoT。監査ログ / 通知 / メール送信の非ブロッキング実行で必須                                                                                                                                                              |
| `encryptOAuthToken` / `getGoogleOAuthAccount` / `updateGoogleOAuthAccountTokens` / `reEncryptLegacyOAuthToken` | `@/shared/lib/crypto` + `@/shared/domain/auth/{queries,commands}` | OAuth token at-rest encryption SSoT（AES-256-GCM + HKDF、purpose=`"oauth-google"`）。新規 OAuth provider 追加時はこのパターンを踏襲（→ `auth-patterns.md §OAuth token の at-rest encryption`）                                                                               |
