# Admin resource-level access — decision SSoT 化と実 predicate テスト

2026-08-16 / ステータス: 承認済み（実装計画へ移行）

## 背景

第 6 次監査（変異検査）の残件として、admin の resource-level access（EDITOR の
`userPageAssignment` スコープ）に 3 つの問題が記録されていた:

1. **`requireAdminResourcePermission` の配線テスト問題。**
   `__tests__/unit/queries/admin-query-helpers.test.ts:44-53` が `isEditorRole` と
   `userHasResourceAccess` を両方 mock しており、deny テスト（同 :124-145）は
   実 predicate を一切通さない。実装側の分岐を壊しても検出できない。
2. **3 つの composition site の重複。** `checkResourceAccess`
   （`_shared/lib/action-auth.ts:109-131`）/ `requireAdminResourcePermission`
   （`_shared/queries/_helpers.ts:75-93`）/ `executeAdminMutationResult` の
   `checkResourceAccess: true`（`_shared/lib/admin-action.ts:108-109`）が、
   それぞれ `isEditorRole` の前段分岐を個別に持つ。
3. **検出不能な残存変異。** 各 site の `isEditorRole(user.role)` → `true` は
   振る舞い中立（実 `userHasResourceAccess` が非 EDITOR を内部で true に畳む）
   のため、どんな黒箱テストでも原理的に検出できない。

調査で判明した追加事実:

- `userHasResourceAccess`（`src/shared/domain/admin-auth/resource-access.ts`）は
  既に**全関数**であり、RBAC 未通過・非 EDITOR・`resourceId` 欠落をすべて内部で
  処理する。3 site の前段分岐は完全な冗長。
- `executeAdminMutationResult` の step 4（`checkResourceAccess: true` 経路）は、
  integration を含め**どのテストでも 1 度も実行されていない**
  （`_executeAdminMutationResult-rbac.test.ts` は flag 未指定。caller 8 箇所は
  action-shape テストが wrapper を全 mock）。M-11 と同クラスの穴。
- deny 機構の差（result union / `notFound()` / MutationResult）は層の違いに由来する
  意図的なもので、`admin-permission-denial-mechanism.test.ts` が notFound 方針を
  gate している。統合すべきは deny ではなく decision。

## 設計

### 方針

decision を `userHasResourceAccess` に一本化する。3 site の冗長な
`isEditorRole` 前段分岐を削除し、テストは真の境界（session / DB query / audit /
next の navigation・headers）だけを mock して実 predicate を通す。

**振る舞い変化はゼロ**（production）。3 site とも事前に RBAC 通過済みで、
`userHasResourceAccess` は非 EDITOR を DB lookup 前に return するため DB コールも
増えない。「後方互換性のないクリーンな実装」が許す範囲は内部構造とテスト構成。

### src 変更（3 ファイル + docstring 1 行）

1. `_shared/queries/_helpers.ts` — `:83-85` の pre-check を削除し、
   `userHasResourceAccess` を直呼び。`isEditorRole` import を削除。
   deny 時の `recordPermissionDenied` + `denyAdminAccess()` は維持する
   （denial-mechanism gate が `denyAdminAccess()` 出現 ≥ 3 を要求）。
2. `_shared/lib/action-auth.ts` — `checkResourceAccess` の `isEditorRole`
   wrapper を削除。import を削除。
3. `_shared/lib/admin-action.ts` — step 4 を
   `if (options.checkResourceAccess && !(await userHasResourceAccess(...)))` に。
   import を削除。実行順序契約コメントの step 4 表記を実態に合わせる。
4. `resource-access.ts` — docstring に「呼び出し側は `isEditorRole` / `resourceId`
   の事前分岐を置かない（この関数が内包する）」を 1 行追加。再導入の防止は
   gate ではなく文書で行う（新しい gate は足さない — 計画の継承条件）。

### テスト変更（3 ファイル）

**`__tests__/unit/queries/admin-query-helpers.test.ts`**:

- mock 削除: `@/shared/lib/admin-role-guards` / `@/shared/domain/admin-auth/resource-access`
- mock 追加: `@/shared/domain/user-page-assignments/queries`
  （`getAssignedPageIdsForUser` 1 export のみの完全置換で安全。prisma が
  module graph から落ちる）
- session mock を spread-actual + `verifyAdminSession` のみ差し替えに変更
  （`action-auth.test.ts` と同じイディオム。実在しない export
  `isValidRole` / `adminAuth` / `DASHBOARD_ROLES` の drift も消える）
- resource 系ケース 4 本（各々が別の変異クラスを殺す）:
  1. EDITOR + 割当済み page → user を返す（`includes` 否定系・常時 deny を殺す）
  2. EDITOR + 割当外 → notFound + `recordPermissionDenied` 4 引数
     （`isEditorRole → false`・`userHasResourceAccess` 呼出削除を殺す）
  3. EDITOR + `resourceId` 無し → user を返す（`!resourceId` 分岐の変異を殺す。
     `requireAdminDetailPage(resource)` は実際にこの形で呼ぶ — `page-auth.ts:44-49`）
  4. ADMIN + `resourceId` 付き → user を返す（`resource-access.ts` 本体の
     `isEditorRole → true` を殺す）
- 既存の RBAC 3 本（Task 9 で実 `hasPermission` 化済み）は触らない

**`__tests__/unit/admin/lib/action-auth.test.ts`**:

- HEAD 版は `checkPermission` のみ実 predicate 検証で、`checkResourceAccess` の
  describe が無い。Task 2 として実 predicate カバレッジを追加する:
  `EDITOR_USER` import、`user-page-assignments/queries` の DB 境界 mock、
  `describe("checkResourceAccess")`（EDITOR 割当外 → deny + 記録 / 割当済み → 許可）

**`__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts`**:

- `executeAdminMutationResult` を直接 import し、`checkResourceAccess: true` +
  EDITOR のケースを 1 本追加: 割当外 → `{ error: "このリソースへのアクセス権が
ありません" }`・execute 非発火・deny 記録、割当済み → execute 発火
- `@/shared/domain/user-page-assignments/queries` を boundary mock として追加
- 既存 3 テストと deleteCoupon 経路は触らない

### 受入条件（変異を入れて赤くなることを実測）

| 変異                                              | 赤くなるテスト                 |
| ------------------------------------------------- | ------------------------------ |
| `resource-access.ts` `isEditorRole` → `true`      | helpers の ADMIN ケース        |
| 同 → `false`                                      | helpers の EDITOR 割当外ケース |
| `_helpers.ts` の `userHasResourceAccess` 呼出削除 | 同上                           |
| `admin-action.ts` step 4 ブロック削除             | integration の新規ケース       |
| `resource-access.ts` の `!resourceId` 分岐変異    | helpers の EDITOR no-id ケース |

変異の投入・復元は PowerShell の `Copy-Item` で行い、復元後に
`git status --porcelain <対象ファイル>` が空であることを確認する。

### やらないこと（round6 計画から継承 + 判断）

- M-18（page → resource 対応表の二重管理が必要で gate の原則に反する）
- L-a / L-b / L-c、新 gate、残り約 45 変異
- deny 機構の統合（層の違いに由来する意図的な差。notFound 方針は gate 済み）
- command palette の EDITOR 絞り込み漏れ（`docs/audits/2026-08-12-codebase-audit-findings.md`
  で tracking 済みの別件）

## 検証

- `bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts`
- `bun run test -- __tests__/unit/admin/lib/action-auth.test.ts`（非対象だが隣接）
- `bun run test -- __tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts`
- `bun scripts/run-tests.ts __tests__/unit/architecture`（denial-mechanism gate 等）
- `bun run validate`（type-check + lint）
- 上記 5 変異の投入 → 赤 → 復元を実測

## PR 構成

1 PR = 1 論理変更「resource-level access の decision を `userHasResourceAccess` に
一本化し、実 predicate テストに置き換える」。5〜6 ファイル、src は −15 行程度。
