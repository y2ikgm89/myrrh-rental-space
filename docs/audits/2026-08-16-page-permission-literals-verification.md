# page-permission-literals 計画の受入検証（再実走）

実施日: 2026-08-16。対象: `docs/superpowers/plans/2026-08-16-admin-page-permission-literals.md`。

この計画の全 4 Task は #2368 / #2369 / #2370 / #2371 で main にマージ済み。
本書は、その実装が計画の受入条件を現行 main（`4f45b6534`）で満たすことを、
隔離 worktree（`.worktrees/verify-page-permission-literals`）で再実走して確認した記録。

## 結論

**全項目 PASS。** 緑スイート 9 項目、変異検査 6 件、構造 spot check 2 件、すべて期待どおり。

## 緑スイート

| #   | コマンド                                                                                                                          | 結果                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts`                                                                  | 6 pass / 0 fail                                                     |
| 2   | `bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts`                                             | 5 pass / 0 fail                                                     |
| 3   | `bun run test -- __tests__/unit/architecture/admin-settings-permissions.test.ts`                                                  | 3 pass / 0 fail                                                     |
| 4   | `bun run test -- __tests__/unit/admin/lib/action-auth.test.ts`                                                                    | 8 pass / 0 fail                                                     |
| 5   | `bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts`                                                              | 6 pass / 0 fail                                                     |
| 6   | `bun scripts/migrate-test-db.ts` → `bun run test -- __tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts` | 4 pass / 0 fail（test DB `localhost:5433`、pending migration なし） |
| 7   | `bun scripts/run-tests.ts __tests__/unit/architecture`                                                                            | **190 passed, 0 failed**（ratchet 緑 = 違反集合の増減ゼロ）         |
| 8   | `bun run validate`                                                                                                                | pass（type-check 131.2s + eslint、計 183.1s）                       |
| 9   | `rg "requireAdminListPage\|requireAdminDetailPage" src` / `rg "requireAdminSettingsPage" src __tests__`                           | いずれも**出力なし**（exit 1 = 0 件）                               |

## 変異検査（受入条件の核心）

各変異は退避 → 投入 → 対象 test 実行 → 復元 → `git status --porcelain` 空 → 再実走で緑、の手順で確認。

| #   | 変異                                                                                     | 期待                                                                 | 結果                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | gate の `collectPageGuardNames()` に `requireAdminPermission` を混入（旧実装への逆戻り） | 見本 fixture のみ `Expected: false / Received: true`                 | **RED（4 pass / 1 fail）**。他 4 test は緑                                                                                                                                        |
| M2  | `requireAuditLogListPage` の `"auditLog"` → `"page"`                                     | `requireAuditLogListPage は auditLog:read を要求する` のみ FAIL      | **RED（5 pass / 1 fail）**。`Expected promise that rejects / Received promise that resolved`                                                                                      |
| M3  | `requireStaffListPage` の `"user"` → `"page"`                                            | `requireStaffListPage は user:read を要求する` のみ FAIL             | **RED（5 pass / 1 fail）**。同形                                                                                                                                                  |
| M4  | `requireCouponCreatePage` の `"create"` → `"read"`                                       | `requireCouponCreatePage は coupon 権限を要求する` のみ FAIL         | **RED（5 pass / 1 fail）**。`toHaveBeenCalledWith` が `["viewer-id","coupon","read",undefined]` を受け取り `- "create" / + "read"` で検出                                         |
| M5  | `requireSettingsManagePage` の `"manage"` → `"read"`                                     | `requireSettingsManagePage は settings:manage を要求する` のみ FAIL  | **RED（5 pass / 1 fail）**。`requireSettingsPage` test は緑のまま                                                                                                                 |
| M6  | `authorizeAdmin` の `if (hasPermission(...)) return true;` → `return true;`              | `action-auth.test.ts` と `admin-query-helpers.test.ts` の両方が FAIL | **両方 RED**。action-auth: 7 pass / 1 fail（`checkPermission` が `success: true` を返す）。query-helpers: 4 pass / 2 fail（`settings:manage` 拒否と `auditLog:read` 拒否の 2 本） |

復元後は全ファイルで `git status --porcelain` が空、かつ対象 test が緑に戻ることを確認済み。

## 構造 spot check

- `rg "requireAuditLogListPage|requireStaffListPage|requireStaffDetailPage|requireCouponCreatePage" src` →
  定義（`page-auth.ts`）+ 4 ページ（`audit-logs` / `coupons/new` / `staff` / `staff/[id]`）のみ。
- `rg "requireSettingsManagePage\(\)" src` → 定義 + billing / features / integrations / system の 4 ページのみ。

## 観察（本 PR では直さない）

- `__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts:12` の docstring は
  `3. hasPermission (RBAC)` のまま。実装は `admin-action.ts:60` のとおり `authorizeAdmin()` 経由に
  更新済みで、動作上の不整合はないが、docstring だけが旧名を参照している。別途追随修正するとよい。
