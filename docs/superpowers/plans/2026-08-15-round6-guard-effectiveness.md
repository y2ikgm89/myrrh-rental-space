# 第6次監査 是正計画 B — 関門の実効性

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 変異検査で「壊しても緑のまま」と実証された関門のうち、gate を増やさずに直せる 4 件を効かせる。

**Architecture:** 既存 gate の判定を強めるか、実装を一度も実行していないテストに実行経路を作る。新しい gate は追加しない。regex を広げる代わりに AST へ移す（同じ回避が 3 通り目のため）。各 Task の受入条件は「元の変異を入れ直すと赤くなる」こと。

**Tech Stack:** Next.js 16 (App Router, `APP_SURFACE` で public / admin の 2 サービス) / React 19 / TypeScript / Prisma 7 / PostgreSQL 18 (Neon) / Bun / conform + zod4 / Tailwind / bun:test / Playwright

## Global Constraints

これは全タスクに暗黙で適用される。タスクごとに再掲しない。

- **1 PR = 1 論理変更。** 目安 300 行 / 10 ファイル。超えるなら分割する。
- **1 つの振る舞いにつきテストは 1 本。** 網羅は既存 gate と CI の仕事。テストを盛らない。
- **抽象化は 3 回目の重複から。** 2 回目まではコピーのままでよい。
- **型のエスケープハッチ（`as any` / `@ts-ignore`）を足さない。** この repo では実質使われていない。
- **緑を偽装しない。** 落ちている gate を通すために gate 側を触らない。`skip` / assertion の弱め /
  allowlist 追記 / `--no-verify` / `LEFTHOOK=0` / 素の `bun test` はいずれも禁止（hook が deny する）。
- **成功を主張せず、証拠を出す。** 走らせたコマンドとその出力を示す。見ていないなら「未検証」と書く。
- 単一ファイルのテストは `bun run test -- <path>`。`bun run test:unit -- <file>` では**絞れない**（引数は追記されるだけ）。
- `bun run test -- <file>` は Prisma client を作り直さない。`schema.prisma` を触ったら先に `bun run db:generate`。
- `git push` は lefthook pre-push（type-check + architecture gate 全件）で 80〜110 秒かかる。**tool timeout は 300 秒以上。**
- `bun run format` は引数なしだとリポジトリ全体を書き換える。**触ったファイルだけ渡す。**
- commit message は conventional commits + 末尾 `[ai-gen]`。
- dev サーバーは人間が所有する。頼まれない限り起動も停止もしない。

## 出典

第 6 次コードベース監査（2026-08-15、変異検査ラウンド）。137 変異中 61 件が素通り、静的補完 12 件確定。
報告書: https://claude.ai/code/artifact/c6617756-f615-4eb2-a3f6-afae55611f56

**各タスクの記述は起案エージェントが現物で検証し、別の検証官が file:line・識別子・型・シグネチャを
再照合したうえで訂正したもの。**それでも行番号は書かれた時点のものなので、着手時にずれていたら訂正して進める。

---

## このプランの範囲

第 6 次監査は**変異検査**（実装に欠陥を注入し、守っているはずの関門が赤くなるかを実測する）で、
137 変異中 61 件が素通りした。このプランはそのうち**4 件だけ**を直す。

選定基準は 2 つ。

1. **新しい gate を足さない。** 既存 gate の判定を強めるか、テスト戦略を直すだけ。
   CLAUDE.md「新しい gate を足すのは、実際に起きた欠陥に対してだけ」に抵触しないもの。
2. **素通りしたことが実測されている。** 「将来こう間違えるかも」ではなく、
   実際に欠陥を注入して緑のままだったことをコマンド出力で確認済み。

| Task | 内容                                                                   | 種別                            |
| ---- | ---------------------------------------------------------------------- | ------------------------------- |
| 9    | `checkPermission` / `hasPermission` の実装が unit で一度も実行されない | テスト戦略（gate を増やさない） |
| 10   | surface 越境・Prisma import gate が相対パス表記を素通り                | 既存 gate の判定強化            |
| 11   | RBAC gate が総数照合で guard の所属関数を見ない                        | 既存 gate の判定強化            |
| 12   | 認可 gate が文字列一致で `await`→`void` を素通り                       | 既存 gate の判定強化            |

Task 番号は**プラン A から連番**（A が 1〜8）。A とは独立に着手できる。

## 受入条件は「変異させると赤くなる」こと

このプランの目的は機能追加ではなく**関門を効かせる**ことなので、
各 Task の受入条件に「元の変異を入れ直すと赤くなり、正しい形では赤くならない」を必ず含む。
テストが通ることだけでは完了にしない。

`.claude/rules/architecture-gates.md` が要求する「落ちるべき形」「落ちてはいけない形」の
2 本の見本を、gate を触る Task（10 / 11 / 12）では必ず用意する。

## このプランで**やらないこと**

| 除外したもの                                                                       | 理由                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 守り手が不在の GCP 系（M-24 PAUSED / M-25 maxScale / M-26 traffic）                | 実際に起きた欠陥ではない。gate を足す条件を満たさない                                                |
| integration に guard がある 7 件（M-05 / M-07 / M-10 / M-32 / M-33 / M-34 / M-37） | pre-push の範囲外というだけ。まず CI の integration job が実際に走っているかを確認するほうが安い     |
| `branch-protection.json` の contexts 検査（M-27 / M-28）                           | このファイルを GitHub に適用する自動化が存在しないので、live の branch protection は直接は弱まらない |
| 残り約 45 件                                                                       | 監査記録として報告書に残す。実害が出た時点で個別に拾う                                               |

### 先にやるべき確認（このプランの前提、コード変更なし）

Task に入る前に 1 度だけ確認する。結果によっては上の除外判断が変わる。

- [ ] CI の `test:all` job（`.github/workflows/ci.yml:352`）が、実際に integration テストを実行した
      **所要時間**を check-runs API で確認する。`needs.changes.outputs.code == 'true'` のガードが
      付いているので、「コード変更なし」と判定された PR では丸ごと skip される。
      `gh pr checks` の緑は skip と区別できない。

```bash
gh api repos/{owner}/{repo}/commits/{sha}/check-runs --jq '.check_runs[] | {name, conclusion, started_at, completed_at}'
```

---

### Task 9: checkPermission / hasPermission を unit tree で実際に実行させる

**深刻度:** high / **見積り:** +74 / -11 行・2 ファイル（src の変更は 0）

**なぜ:** `checkPermission`（RBAC 判定 29 箇所の唯一の入口。`customer:manage` /
`event:manage` / `auditLog:manage` / `reservation:manage` の PII CSV export と
Instagram / GBP OAuth を守る）の権限判定ブロックを丸ごと削除しても、
テストが 1 本も落ちない。consumer は例外なく `mock.module("@/admin/lib/action-auth")`
で差し替えており、実装を実行するテストが 1 本も存在しない。同様に
`requireAdminPermission` も `hasPermission` が mock されているため、`action` 引数を
`"read"` 固定に変えても緑のまま（`requireAdminSettingsPage("manage")` が
`settings:read` に降格し、VIEWER が設定管理ページを開けるようになる）。

**Files:**

- Modify: `__tests__/unit/admin/lib/action-auth.test.ts`（現在 42 行。全面差し替え）
- Modify: `__tests__/unit/queries/admin-query-helpers.test.ts:8`, `:56-59`, `:74`, `:81`, `:96`, `:112`（mock 撤去）＋ test 1 本追加
- 変更対象の実装（**触らない**。変異検査でのみ一時的に壊す）:
  - `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts:95-101`
  - `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:67`

**Interfaces:**

- Consumes:
  - `checkPermission(resource: Resource, action: Action, requestHeaders?: Headers): Promise<PermissionResult>` — `@/admin/lib/action-auth`
  - `requireAdminPermission(resource: Resource, action: Action): Promise<AdminAuthUser>` — `@/admin/queries/_helpers`
  - `type AdminSession = { user: AdminAuthUser }` — `@/shared/domain/admin-auth/session`（runtime export は `getAdminSession` / `getAdminSessionUser` / `getCurrentAdminUser` / `verifyAdminSession` / `isAdmin`）
  - `ADMIN_USER` / `VIEWER_USER` / `EDITOR_USER` — `__tests__/fixtures/users.ts`
  - `hasPermission(role, resource, action): boolean` / `ROLE_PERMISSIONS` — `@/shared/lib/admin-permissions`（runtime import 0 本の純粋モジュール）
- Produces: なし（テストのみ。後続タスクが依存する新しい名前は無い）

---

- [ ] **Step 1: 実装を実行するテストを書く**

`__tests__/unit/admin/lib/action-auth.test.ts` を**この内容で全面差し替え**する
（既存の `logAction` の 6 ケースはそのまま温存し、mock 定義と
`describe("checkPermission")` を足す）。

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import type { Action } from "@/shared/lib/admin-resources";
import type { AdminSession } from "@/shared/domain/admin-auth/session";
import { ADMIN_USER, VIEWER_USER } from "../../../fixtures/users";

const mockLogUserAction = mock();
const mockRecordPermissionDenied = mock();

mock.module("@/admin/lib/audit", () => ({
  logUserAction: (...args: Parameters<typeof mockLogUserAction>) =>
    mockLogUserAction(...args),
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

// `mock.module` は完全置換。session module は `getAdminSessionUser` 等も
// graph 内で使われるため実モジュールを spread し、認証境界の `getAdminSession`
// だけ差し替える (.claude/rules/testing.md)。
// `getAdminSessionUser` / `canAccessAdmin` / `hasPermission` は実物を通す —
// checkPermission が ROLE_PERMISSIONS を実際に評価することを固定するため。
const actualSession = await import("@/shared/domain/admin-auth/session");

const mockGetAdminSession = mock(
  async (): Promise<AdminSession | null> => null,
);

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  getAdminSession: (...args: Parameters<typeof mockGetAdminSession>) =>
    mockGetAdminSession(...args),
}));

const { checkPermission, logAction } = await import("@/admin/lib/action-auth");

describe("logAction", () => {
  beforeEach(() => {
    mockLogUserAction.mockReset();
    mockLogUserAction.mockResolvedValue(undefined);
  });

  test.each<[Action, AuditAction]>([
    ["create", AuditAction.CREATE],
    ["read", AuditAction.READ],
    ["update", AuditAction.UPDATE],
    ["delete", AuditAction.DELETE],
    ["publish", AuditAction.PUBLISH],
    ["manage", AuditAction.MANAGE],
  ])(
    "maps %s permission action to AuditAction.%s",
    async (action, auditAction) => {
      await logAction("user-1", action, "auditLog", "resource-1");

      expect(mockLogUserAction).toHaveBeenCalledWith(
        { id: "user-1" },
        auditAction,
        "auditLog",
        "resource-1",
      );
    },
  );
});

describe("checkPermission", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
  });

  test("dashboard role を持っていても ROLE_PERMISSIONS に無い権限は拒否する", async () => {
    mockGetAdminSession.mockResolvedValue({ user: VIEWER_USER });

    const denied = await checkPermission("customer", "manage");

    expect(denied).toEqual({
      success: false,
      error: { error: "customerのmanage権限がありません" },
    });
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "customer",
      "manage",
    );

    mockGetAdminSession.mockResolvedValue({ user: ADMIN_USER });

    const allowed = await checkPermission("customer", "manage");

    expect(allowed.success).toBe(true);
    if (allowed.success) {
      expect(allowed.user.id).toBe(ADMIN_USER.id);
    }
  });
});
```

次に `__tests__/unit/queries/admin-query-helpers.test.ts` を編集する。

1. 8 行目 `const mockHasPermission = mock(() => true);` を**削除**。
2. 56-59 行目の mock ブロックを**削除**し、代わりに理由コメントを置く:

```ts
// `@/shared/lib/admin-permissions` は mock しない。`hasPermission` は
// ROLE_PERMISSIONS だけを見る純粋関数で、mock すると
// `requireAdminPermission` が `action` をどう使うかが観測できなくなる。
```

3. `beforeEach` 内の `mockHasPermission.mockReset();`（74 行目）と
   `mockHasPermission.mockReturnValue(true);`（81 行目）を**削除**。
4. 96 行目 `mockHasPermission.mockReturnValue(false);` と
   112 行目 `mockHasPermission.mockReturnValue(true);` を**削除**
   （実 `hasPermission` が VIEWER に `auditLog:read` 無し / EDITOR に `page:read` 有りを
   返すため、既存 3 本はそのまま緑）。
5. `test("権限がある場合は user を返す", ...)` の直後に次の 1 本を追加:

```ts
test("action 引数が判定に効く — VIEWER は settings:read を通り settings:manage で拒否される", async () => {
  mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);

  const user = await requireAdminPermission("settings", "read");
  expect(user.id).toBe(VIEWER_USER.id);
  expect(notFoundCalls).toBe(0);

  await expect(requireAdminPermission("settings", "manage")).rejects.toThrow(
    "NOT_FOUND",
  );

  expect(notFoundCalls).toBe(1);
  expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
    VIEWER_USER.id,
    "settings",
    "manage",
  );
});
```

`await import("@/admin/queries/_helpers")` の行を含め、上記 5 点以外は**触らない**
（整形し直すと prettier の安定形から外れて無関係な差分が出る）。

- [ ] **Step 2: 変異を入れて赤くなることを確認する（このタスクの受入条件）**

このテストは既存の**正しい**振る舞いを固定するものなので、そのままでは即 PASS する。
「壊したら赤くなる」の証明は**変異検査**で行う。実装を一時的に壊し、赤を見てから戻す。

まず退避する（`git checkout` は使わない）。Bash tool（Git Bash）なら:

```bash
cp "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" /tmp/action-auth.bak
cp "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts" /tmp/_helpers.bak
```

PowerShell なら（`/tmp` も `cp` も無い）:

```powershell
Copy-Item "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" "$env:TEMP/action-auth.bak"
Copy-Item "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts" "$env:TEMP/_helpers.bak"
```

**変異 M-11** — `action-auth.ts:95-101` の判定ブロック（`if (!hasPermission(...)) { … }`
の 7 行）**だけ**を、次の 2 行で置き換える:

```ts
void hasPermission;
void recordPermissionDenied;
```

**93 行目の `const { user } = auth;` と 103 行目の `return { success: true, user };` は
残すこと。** これらまで書き直すと `const user` の二重宣言になり、テストは assertion
ではなく `error: "user" has already been declared` という parse error で落ちて、
変異検査として成立しない（実測）。置換後の関数末尾はこうなる:

```ts
  const { user } = auth;

  void hasPermission;
  void recordPermissionDenied;

  return { success: true, user };
}
```

実行: `bun run test -- __tests__/unit/admin/lib/action-auth.test.ts`
期待: **FAIL（6 pass / 1 fail）**。
`(fail) checkPermission > dashboard role を持っていても ROLE_PERMISSIONS に無い権限は拒否する`。
差分に `- "success": false` / `+ "success": true` と `+ "id": "viewer-id"` が出る
（`Expected - 3 / Received + 8`）。

戻す（Git Bash: `cp /tmp/action-auth.bak "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts"` /
PowerShell: `Copy-Item "$env:TEMP/action-auth.bak" "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts"`）。

**変異 M-12** — `_helpers.ts:67` の 3 番目の引数を `"read"` 固定にする:

```ts
  if (!hasPermission(user.role, resource, "read")) {
```

実行: `bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts`
期待: **FAIL（3 pass / 1 fail）**。
`error: Expected promise that rejects / Received promise that resolved: Promise { <resolved> }`
が `requireAdminPermission("settings", "manage")` の行で出る。
落ちるのが新規 1 本だけで、既存 3 本が緑のままであることも確認する
（＝この変異は新規テストだけが検出している）。

戻す（Git Bash: `cp /tmp/_helpers.bak "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts"` /
PowerShell: `Copy-Item "$env:TEMP/_helpers.bak" "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts"`）。

戻し漏れを潰す:

```bash
git diff -- "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts"
```

期待: 出力なし。（`git diff --stat -- src` だと同じ worktree の無関係な作業まで拾って
偽赤になるので、変異させた 2 ファイルだけを指す。）

- [ ] **Step 3: 実装を直す**

**実装の変更は無い。** M-11 / M-12 はどちらも実装の欠陥ではなく、
実装を 1 度も実行しないテスト構成の欠陥。`action-auth.ts:95-101` と
`_helpers.ts:67` は現状で正しく、Step 2 の変異は必ず元に戻すこと。

参考（正しい現状のコード。これを変えない）:

```ts
// src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts:93-103
const { user } = auth;

if (!hasPermission(user.role, resource, action)) {
  recordPermissionDenied(user.id, resource, action);
  return {
    success: false,
    error: { error: `${resource}の${action}権限がありません` },
  };
}

return { success: true, user };
```

```ts
// src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:64-72
await headers();
const user = await verifyAdminSession();

if (!hasPermission(user.role, resource, action)) {
  recordPermissionDenied(user.id, resource, action);
  denyAdminAccess();
}

return user;
```

- [ ] **Step 4: 通ることを確認する**

実行:

```bash
bun run test -- __tests__/unit/admin/lib/action-auth.test.ts
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: PASS。`action-auth.test.ts` は **7 pass / 10 expect**、
`admin-query-helpers.test.ts` は **4 pass / 13 expect**。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

```bash
bun run type-check
bun run test:unit
```

期待: 全て PASS。

- `action-auth.test.ts` は session module を**実物で** import するようになるため
  module graph が伸び、**このファイル自身**の部分 mock（`@/admin/lib/audit` を
  2 export だけで置換）が `Export named 'X' not found` で壊れうる。壊れるなら
  Step 4 の実行がそのまま検査になっている（実測では緑）。
- **他ファイルへの波及は無い。** runner はファイル単位で bun サブプロセスに隔離する
  （起動時に `isolation: per-file bun subprocess` と表示する）ので、`mock.module` の
  撤去が別ファイルに漏れる経路が存在しない。`@/shared/lib/admin-permissions` を
  mock している他の 2 ファイル（`__tests__/unit/actions/customer-recompute-stats.test.ts` /
  `__tests__/unit/domain/audit/recents-queries.test.ts`）は自前の mock を持つため
  無関係で、いずれも `bun run test:unit` にまとめて含まれる。
- `type-check` は `tsconfig.test.json`（`scripts/type-check.ts` が
  `tsc -p tsconfig.test.json` を走らせる）経由で `__tests__/**` も見るので、
  テストコードの型エラーはここで出る（実測 98〜125 秒）。

- [ ] **Step 6: commit**

```bash
git add __tests__/unit/admin/lib/action-auth.test.ts __tests__/unit/queries/admin-query-helpers.test.ts
git commit -m "test(admin): execute checkPermission and hasPermission for real [ai-gen]"
```

## 起案者が確認したと主張している事実

すべて現物を開き、変異を実際に入れて実測した（変更は全て復元済み。`git status --porcelain -- src __tests__` は空）。

**M-11（成立）**

- `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts:95-101` — 監査の行番号どおり。`hasPermission(user.role, resource, action)` → `recordPermissionDenied(user.id, resource, action)` → `{ success:false, error:{ error: \`${resource}の${action}権限がありません\` } }`。
- `__tests__/unit/admin/lib/action-auth.test.ts`（現在 42 行）は `logAction` の AuditAction マッピングしか実行していない。`checkPermission` を import すらしていない（13 行目 `const { logAction } = await import("@/admin/lib/action-auth")`）。
- **実測**: `grep -rln 'mock.module("@/admin/lib/action-auth"' __tests__` と `grep -rln 'admin/lib/action-auth' __tests__` の差集合は `__tests__/unit/admin/lib/action-auth.test.ts` **1 ファイルのみ**。つまり実 module を読む唯一のテストがこれで、そこに `checkPermission` のケースが無い。
- **変異実測**: 95-101 の判定ブロックを潰す（`void hasPermission; void recordPermissionDenied;`）と `bun run test -- __tests__/unit/admin/lib/action-auth.test.ts` は **6 pass / 0 fail（緑のまま）**。監査の主張どおり。
- 権限データ (`src/shared/lib/admin-permissions.ts:258-277`) で VIEWER は `customer:read` / `event:read` / `reservation:read` / `terms:read` のみを持ち、`auditLog:*` は 1 つも持たない。よって export route が要求する `customer:manage`(`src/app/api/admin/export/customers/route.ts:31`)、`event:manage`(`event-registrations/route.ts:111`)、`auditLog:manage`(`audit-logs/route.ts:92`)、`reservation:manage`(`reservations/route.ts:36`)、`terms:update`(`terms-agreements/route.ts:46`) は全て VIEWER には無く、監査の「無効化されると VIEWER が全 PII CSV を落とせる」は正しい。

**M-12（成立）**

- `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:67` — `if (!hasPermission(user.role, resource, action))`。監査の行番号どおり。
- `__tests__/unit/queries/admin-query-helpers.test.ts:56-59` が `mock.module("@/shared/lib/admin-permissions", ...)` で `hasPermission` を差し替えている。監査の行番号どおり。
- **変異実測**: `_helpers.ts:67` の第 3 引数を `"read"` 固定に変更 → 現行テストは **3 pass / 0 fail（緑のまま）**。
- **修正案の実測**: 56-59 の mock を撤去し（＋ `mockHasPermission` の宣言・reset・各 test の `mockReturnValue` を削除）新規 1 本を追加した状態で、変異ありは **3 pass / 1 fail**（`Expected promise that rejects / Received promise that resolved`）、変異なしは **4 pass / 13 expect calls** で緑。既存 3 本は実 `hasPermission` でもそのまま通る（ADMIN は `page:read` 保持、VIEWER は `auditLog:read` 非保持、EDITOR は `page:read` 保持）。
- `requireAdminSettingsPage` は `src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts:52-56` に実在し、55 行目が `return requireAdminPermission("settings", action);`。`settings/billing/page.tsx:180`、`settings/integrations/page.tsx:183`、`settings/features/page.tsx:36`、`settings/system/page.tsx:81` が `"manage"` で呼んでいる。VIEWER は `settings:read` を持つ（admin-permissions.ts:271）ので、降格すると実際に開けるようになる。

**修正案の実行可能性（実測で確認）**

- `mock.module("@/shared/domain/admin-auth/session", () => ({ ...actualSession, getAdminSession: ... }))` の spread パターンは本 repo の既存イディオム（`__tests__/integration/domain/reservations/cancellation-with-refund-policy.test.ts:88-92` ほか 20 箇所）。unit tree でも動くことを probe ファイルで実測（1 pass / 4 expect, 1.5 秒）。
- probe に M-11 変異を当てると FAIL することを実測（`- "success": false` / `+ "success": true`）。
- fixture の型: `__tests__/fixtures/users.ts` の `VIEWER_USER` / `ADMIN_USER` は `AdminAuthUser & { createdAt; updatedAt }`。`getAdminSessionUser` の実装（`session.ts:103-127` の `coerceAdminUser`）が `{id,email,name,image,role,emailVerified}` の**新しいオブジェクト**を返すため、`toEqual(ADMIN_USER)` は使えない（`createdAt`/`updatedAt` が落ちる）。計画では `allowed.user.id` を見る形にしてある。
- `isDashboardRole(Role.VIEWER)` は true（`src/shared/lib/admin-roles.ts:24-28` の `DASHBOARD_ROLES` に VIEWER が含まれる）。よって VIEWER は `canAccessAdmin` を通過し、`checkPermission` の権限判定まで到達する。
- `recordPermissionDenied(userId, resource, action, resourceId?)` は void 関数（`_shared/lib/audit.ts:166-174`）。`checkPermission` は 3 引数で呼ぶので `toHaveBeenCalledWith(id, resource, action)` で一致する。
- `bun run type-check` は `tsconfig.test.json`（`scripts/type-check.ts`）経由で `__tests__/**` を検査する。両ファイルを最終形にした状態で **type-check 完走（エラー 0、実測 98〜125 秒）** を確認済み。
- 両ファイル最終形での実測: `action-auth.test.ts` 7 pass / 10 expect、`admin-query-helpers.test.ts` 4 pass / 13 expect。差分実測は `+51/-2` と `+23/-9`。

## 起案者が報告した訂正

監査の主張の**機序と行番号は M-11 / M-12 とも正しい**（棄却しない）。ただし 3 点ずれがある。

1. **`checkPermission` の呼出元は 24 箇所ではなく 29 箇所。** `grep -rn "await checkPermission(" src` = **29**。加えて `checkResourceAccess` 経由が 3 箇所（`src/app/(admin)/admin/api/page-sections/route.ts:21`、`_shared/lib/editor-comment-auth.ts:44` と `:100`）あり、これらも内部で `checkPermission` を呼ぶ（`action-auth.ts:115`）ので実質 32 経路。監査は過小申告。

2. **`page-auth.ts` の置き場が違う。** 監査は文脈上 `action-auth.ts` と同じ `_shared/lib/` を示唆していたが、実際は `src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts`（alias は `@/admin/helpers/page-auth`）。**行番号 55 は正しい**（`return requireAdminPermission("settings", action);`）。

3. **「unit tree で 1 度も実行されない」は控えめで、integration tree でも実行されていない。** `__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts:52-55` が `mock.module("@/admin/lib/action-auth", () => ({ checkAdminAuth, logAction }))` で module ごと差し替えており、`checkPermission` は供給すらされていない。この integration テストが実物で通しているのは `executeAdminMutationResult` 側の RBAC、すなわち `_shared/lib/admin-action.ts:95` の `hasPermission` 直呼びであって、`checkPermission` とは**別の判定サイト**。したがって M-11 の変異はリポジトリ全体のどのテストでも検出されない。

（付随して気づいた点。今回の修正範囲外なので直さない）
`__tests__/unit/queries/admin-query-helpers.test.ts:25-34` の session mock は、実際には存在しない export（`isValidRole` / `adminAuth` / `DASHBOARD_ROLES`）を並べている。`src/shared/domain/admin-auth/session.ts` の runtime export は `getAdminSessionUser` / `getCurrentAdminUser` / `verifyAdminSession` / `isAdmin` / `getAdminSession` の 5 本のみ。余分な key は無害だが、実物と乖離した手書き列挙が残っている。

## 検証官が入れた訂正

1. **[致命] Step 2 の M-11 変異コードが構文エラーになる。** 「95-101 を置換」と言いつつ置換ブロックに `const { user } = auth;`（93 行目）と `return { success: true, user };`（103 行目）を含めていたため、字句どおり適用すると `const user` の二重宣言になる。bun v1.3.14 で実測: `error: "user" has already been declared`。テストは parse error で落ち、計画が期待する差分は出ない。→ 置換内容を `void hasPermission; void recordPermissionDenied;` の 2 行だけにし、93 / 103 行を残す旨と置換後の全文を明記した。
2. **[中] Step 5 の機序の誤りとコマンドの冗長。** runner はファイル単位でサブプロセス隔離するため `mock.module` 撤去が他ファイルへ波及する経路は無い（`bun scripts/run-tests.ts` の起動バナー `isolation: per-file bun subprocess` が根拠）。「他 2 ファイルで影響を確認」は成立しない理由づけで、しかも `bun run test:unit` に含まれる。ディレクトリ指定の run も同様に冗長（複数ディレクトリ指定自体は動作する。実測 18 files PASS）。→ `type-check` と `test:unit` に整理し、実際に壊れうるのは編集した当該ファイル自身の部分 mock だけであると書き直した。
3. **[中] Step 2 の退避が `/tmp` + `cp` で Bash 専用。** この環境の primary shell は PowerShell。→ 両シェルのコマンドを併記。
4. **[小] `git diff --stat -- src` が広すぎる。** 同一 worktree の並行作業を拾って偽赤になる（検証中に実際に無関係な `src` 変更が 1 件出た）。→ 変異させた 2 ファイルに限定。
5. **[小] 見積りとアンカー。** 実測差分は +74 / -11（+67 / -8 ではない）。Files 行のアンカーに `:96` を追加。type-check 実測時間を 98〜125 秒に修正。

上記以外は、file path・行番号・識別子・シグネチャ・型・権限データ・期待出力すべて現物と一致することを実測で確認した（提案テストは一時ファイルとして実行し、実行後に削除。`git status` に残骸なし。src は一切変更していない）。

---

### Task 10: 越境判定を「綴り」から「解決後パス」へ移す（相対 import の素通りを塞ぐ）

**深刻度:** high / **見積り:** 約 230 行・2 ファイル

**なぜ:** `cross-surface-import-gate.test.ts` は禁止 surface を **specifier の文字列 prefix**（`@/admin` / `@/app/(admin)`）で、`prisma-import-boundary.test.ts` は **`@/shared/db/prisma` という文字列リテラル**で判定している。どちらも相対パス綴り（`../../../(admin)/…` / `./prisma`）に一致しないので、同じ越境が 3 通り目の書き方で素通りする。特に prisma 側は server-only 強制テストの**母集合生成**が同じ regex なので、「server-only 無しで prisma を相対 import するファイル」は検査対象にすら入らない。

**Files:**

- Modify: `__tests__/unit/architecture/cross-surface-import-gate.test.ts:1-3`（import 追加）, `:25-84`（JSDoc + 判定 + collector を置換）, `:87-141`（fixture test を置換）
  - `:148-162` の呼び出し 2 箇所は**書き換え不要**（`collectCrossSurfaceImports` の引数構成が変わらないため）。
- Modify: `__tests__/unit/architecture/prisma-import-boundary.test.ts:12`（helper import を差し替え）, `:49-61`（母集合生成を置換）, `:177-190`, `:208-221`, `:244-266`（判定 3 箇所を置換）, `:63` 直後に fixture test を 1 本追加
- Test: 同じ 2 ファイル（gate 自身が test ファイル。新規テストファイルは作らない）

**Interfaces:**

- Consumes:
  - `resolveModuleSpecifier(fromRelPath: string, specifier: string): ResolveResult` — `__tests__/helpers/architecture-fs.ts:126`
  - `type ResolveResult = { kind: "internal"; relPath: string } | { kind: "external" }` — 同 `:116-118`
  - `collectSourceFiles(dir: string): string[]` — 同 `:13`（prisma 側は既に `:12` で import 済み）
- Produces: なし（`importsForbiddenSurface` は gate ファイル内でのみ使う。`importsResolvedModule` / `fileImportsResolvedModule` は module-local）

**前提となる実測（このタスクの著者がリポジトリルートで確認済み）:**

`resolveModuleSpecifier` は **fs を一切見ない純粋なパス演算**。相対 specifier は `..` を巻き戻して解決し（`architecture-fs.ts:132-141`）、alias は tsconfig の paths と同じ longest-prefix 表で解決する（`:106-114`）。`@generated/` と bare specifier は `{ kind: "external" }`（`:130` / `:152`）。

---

- [ ] **Step 1: 失敗するテストを書く**

**(1-a) `__tests__/unit/architecture/prisma-import-boundary.test.ts`**

まず現状の逃げ道（seed による手当て）を外す。`collectPrismaImportingFiles` の `seed` 配列（`:55-58`）を丸ごと削り、`prisma.ts` だけを固定で足す形にする。この時点で `importRe` は**旧 regex のまま**にしておくこと。

```ts
// 変更前（:55-59）
const seed = [
  join(SRC_ROOT, "shared", "db", "prisma.ts"),
  join(SRC_ROOT, "shared", "db", "better-auth-adapter.ts"),
];
const set = new Set<string>([...seed, ...hits]);

// 変更後
// prisma.ts 自身は import 側に現れないが、singleton 定義そのものが
// server-only を要求されるので母集合に固定で加える。
const set = new Set<string>([join(SHARED_DB_ROOT, "prisma.ts"), ...hits]);
```

次に `describe("prisma import boundary", () => {`（`:63`）の直後へ、**このタスクで書く唯一の新規テスト**を入れる。

```ts
test("fixture: prisma facade を相対パスで import するファイルも母集合に入る", () => {
  const files = collectPrismaImportingFiles().map((file) =>
    relative(ROOT, file).replaceAll("\\", "/"),
  );

  // 落ちるべき形（第6次監査 M-16 の実物）:
  // src/shared/db/better-auth-adapter.ts:12 は `import { prisma } from "./prisma";`。
  // 綴り一致の判定では母集合から漏れ、server-only 強制が効かない。
  expect(files).toContain("src/shared/db/better-auth-adapter.ts");

  // 落ちてはいけない形: 同じディレクトリの別モジュール。
  // src/shared/db/prisma-input-json.ts は prisma facade を import しない
  // （`@generated/prisma/client` の型と DomainError だけ）。
  // 解決後パスの前方一致で書くとここが誤検知になる。
  expect(files).not.toContain("src/shared/db/prisma-input-json.ts");
});
```

**(1-b) `__tests__/unit/architecture/cross-surface-import-gate.test.ts`**

既存の fixture test `"検出できる形・できない形（fixture）"`（`:87`）の末尾（`:140` の `).toBe(false);` の直後、`:141` の `});` の直前）へ 2 本の expect を足す。**この段階では旧シグネチャ（2 引数）のまま**書き、素通りを実測する。

```ts
// --- 第6次監査 M-15: 3 通り目（相対パス綴り）---
// src/app/(public)/_shared/lib/format-event-date.ts から見た (admin) 越境。
// 解決すると src/app/(admin)/admin/(dashboard)/_shared/lib/permissions。
expect(
  importsForbiddenAlias(
    'import { ROLE_PERMISSIONS } from "../../../(admin)/admin/(dashboard)/_shared/lib/permissions";',
    "@/admin",
  ),
).toBe(true);
// 同じ相対記法でも surface 内に留まるものは違反にしない。
// `../../` で src/app/(public)/reservation/_components/guest-stepper に着く
// （実在: src/app/(public)/reservation/_components/guest-stepper.tsx）。
expect(
  importsForbiddenAlias(
    'import { GuestStepper } from "../../reservation/_components/guest-stepper";',
    "@/admin",
  ),
).toBe(false);
```

> `..` の段数を間違えないこと。`../../../reservation/…` は `src/app/reservation/…` に着き、`(public)` の外へ出てしまう。それでは「surface 内に留まる相対 import を誤検知しない」ことの見本にならない（`SURFACE_ROOTS` の prefix を `src/app/` に緩める変異でも落ちなくなる）。

- [ ] **Step 2: 落ちることを確認する**

実行:

```bash
bun run test -- __tests__/unit/architecture/prisma-import-boundary.test.ts
bun run test -- __tests__/unit/architecture/cross-surface-import-gate.test.ts
```

期待: 両方 FAIL。

- prisma 側: 14 tests のうち **13 pass / 1 fail**。`fixture: prisma facade を相対パスで import するファイルも母集合に入る` が `expect(received).toContain(expected)` で落ちる（received に `src/shared/db/better-auth-adapter.ts` が無い。母集合は 217 件 = 旧 regex ヒット 216 + `prisma.ts`）。既存の server-only 強制テストは 217 件すべてが `import "server-only"` を持つのでこの時点でも緑のまま。
- cross-surface 側: 4 tests のうち **3 pass / 1 fail**。`検出できる形・できない形（fixture）` が `expect(received).toBe(expected) / Expected: true / Received: false`（相対パスの越境が検出されない）。

- [ ] **Step 3: 実装を直す**

**(3-a) `__tests__/unit/architecture/cross-surface-import-gate.test.ts`**

`:1-3` の import ブロックへ 1 行足す（`:4` は空行なのでそのまま）。

```ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resolveModuleSpecifier } from "../../helpers/architecture-fs";
```

`:9-23` のローカル `collectSourceFiles` は**残す**（`local/gate-scan-must-not-be-silently-empty` が認識する `readdirSync` 走査がこれ）。

`:25-84`（`forbiddenSpecifierPrefixes` の JSDoc から `collectCrossSurfaceImports` まで）を丸ごと次で置き換える。

```ts
/**
 * 禁止 surface のルート（repo ルート相対・POSIX 区切り）。
 *
 * 判定は**綴りではなく解決後のパス**で行う。綴りを列挙する旧実装は、同じ越境を
 * 3 通りの書き方で素通りさせていた:
 *
 * - `await import("@/admin/lib/permissions")` — `from` を含まない（監査 F-12）
 * - `import ... from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions"` —
 *   `@/` alias 経由なので `@/admin` に前方一致しない（監査 F-12）
 * - `import ... from "../../../(admin)/admin/(dashboard)/_shared/lib/permissions"` —
 *   相対パスなのでどの alias 綴りにも一致しない（第6次監査 M-15）
 *
 * 綴りを 1 本ずつ足す方式では 4 通り目が必ず残る。`resolveModuleSpecifier` で
 * specifier を repo ルート相対パスへ解決し、この prefix と突き合わせる
 * （alias 表は tsconfig.json の paths と同じ longest-prefix 順で helper 側が持つ）。
 *
 * 直し方: 越境した import を消し、共有したい実装を `src/shared/` へ出す。
 * 背景は `.claude/rules/src-boundaries.md`。
 */
const SURFACE_ROOTS = {
  "@/admin": "src/app/(admin)/",
  "@/public": "src/app/(public)/",
} as const;

type ForbiddenSurface = keyof typeof SURFACE_ROOTS;

/** import / export / 動的 import / require の**どれでも**モジュール指定子を拾う。 */
const MODULE_SPECIFIER =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/gu;

/**
 * そのソースが禁止 surface のモジュールを import しているか。
 * `fromRelPath` は相対 specifier を解決する基点（repo ルート相対・POSIX 区切り）。
 * コメント行は数えない。
 */
export function importsForbiddenSurface(
  fromRelPath: string,
  source: string,
  forbiddenSurface: ForbiddenSurface,
): boolean {
  const forbiddenRoot = SURFACE_ROOTS[forbiddenSurface];
  return source.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
    for (const match of line.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveModuleSpecifier(fromRelPath, specifier);
      if (
        resolved.kind === "internal" &&
        resolved.relPath.startsWith(forbiddenRoot)
      ) {
        return true;
      }
    }
    return false;
  });
}

function toRelPosix(absPath: string): string {
  return path.relative(workspaceRoot, absPath).replaceAll("\\", "/");
}

function collectCrossSurfaceImports(
  files: readonly string[],
  forbiddenSurface: ForbiddenSurface,
): string[] {
  return files.filter((file) =>
    importsForbiddenSurface(
      toRelPosix(file),
      readFileSync(file, "utf8"),
      forbiddenSurface,
    ),
  );
}
```

fixture test（`:87-141`、Step 1 の追記込み）を丸ごと次で置き換える。呼び出しが 3 引数になるので既存の expect も全部書き換わる。

```ts
test("検出できる形・できない形（fixture）", () => {
  const PUBLIC_FILE = "src/app/(public)/_shared/lib/format-event-date.ts";
  const ADMIN_FILE =
    "src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts";

  expect(
    importsForbiddenSurface(
      ADMIN_FILE,
      'import { X } from "@/public/lib/x";',
      "@/public",
    ),
  ).toBe(true);
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      'export { Y } from "@/admin/lib/y";',
      "@/admin",
    ),
  ).toBe(true);
  // コメント内の言及は違反にしない。
  expect(
    importsForbiddenSurface(
      ADMIN_FILE,
      '// from "@/public/lib/x" は禁止',
      "@/public",
    ),
  ).toBe(false);
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      ' * from "@/admin/lib/y" を参照',
      "@/admin",
    ),
  ).toBe(false);
  // 前方一致するだけの別 alias は拾わない（`@/publicity/z` → `src/publicity/z`）。
  expect(
    importsForbiddenSurface(
      ADMIN_FILE,
      'import { Z } from "@/publicity/z";',
      "@/public",
    ),
  ).toBe(false);
  // 相手側の alias は各テストの対象外。
  expect(
    importsForbiddenSurface(
      ADMIN_FILE,
      'import { W } from "@/shared/lib/w";',
      "@/public",
    ),
  ).toBe(false);

  // --- 監査 F-12 で素通りしていた 2 形 ---
  // 動的 import（`from` を含まない）。
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      'const { hasPermission } = await import("@/admin/lib/permissions");',
      "@/admin",
    ),
  ).toBe(true);
  expect(
    importsForbiddenSurface(
      ADMIN_FILE,
      'require("@/public/lib/x")',
      "@/public",
    ),
  ).toBe(true);
  // `@/` alias 経由の直書き。
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      'import { ROLE_PERMISSIONS } from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions";',
      "@/admin",
    ),
  ).toBe(true);
  expect(
    importsForbiddenSurface(
      ADMIN_FILE,
      'const m = await import("@/app/(public)/_shared/lib/y");',
      "@/public",
    ),
  ).toBe(true);
  // 広げても、無関係な surface は拾わない。
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      'import { Z } from "@/app/(public)/_shared/lib/z";',
      "@/admin",
    ),
  ).toBe(false);

  // --- 第6次監査 M-15: 3 通り目（相対パス綴り）---
  // 落ちるべき形: (public) から (admin) へ相対で抜ける。
  // → src/app/(admin)/admin/(dashboard)/_shared/lib/permissions
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      'import { ROLE_PERMISSIONS } from "../../../(admin)/admin/(dashboard)/_shared/lib/permissions";',
      "@/admin",
    ),
  ).toBe(true);
  // 落ちてはいけない形: 同じ `..` 記法でも surface 内に留まる。
  // → src/app/(public)/reservation/_components/guest-stepper
  expect(
    importsForbiddenSurface(
      PUBLIC_FILE,
      'import { GuestStepper } from "../../reservation/_components/guest-stepper";',
      "@/admin",
    ),
  ).toBe(false);
});
```

`:143-162` の残り 3 テスト（走査規模の下限 + 越境 2 本）は**そのまま**。`collectCrossSurfaceImports(collectSourceFiles(adminRoot), "@/public")` と `collectCrossSurfaceImports(collectSourceFiles(publicRoot), "@/admin")` は引数構成が変わらないので通る（第 2 引数の型名が `ForbiddenSurface` に変わるだけ）。`expect(...).toBeGreaterThan(50)` の数値リテラルも消さないこと。

**(3-b) `__tests__/unit/architecture/prisma-import-boundary.test.ts`**

`:12` の helper import を差し替える。

```ts
import {
  collectSourceFiles,
  resolveModuleSpecifier,
} from "../../helpers/architecture-fs";
```

`:49-61`（`collectPrismaImportingFiles`、Step 1 で seed を削った状態）を丸ごと次で置き換える。

```ts
/** prisma facade の repo ルート相対パス（拡張子なし）。 */
const PRISMA_FACADE = "src/shared/db/prisma";
/** 削除済み legacy shim。同じ経路で「復活していない」ことを見る。 */
const LEGACY_PRISMA_SHIM = "src/shared/lib/prisma";

/** import / export / 動的 import / require のどれでもモジュール指定子を拾う。 */
const MODULE_SPECIFIER =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/gu;

function toRelPosix(absPath: string): string {
  return relative(ROOT, absPath).replaceAll("\\", "/");
}

/**
 * そのソースが `targets`（repo ルート相対・拡張子なし）のどれかを import して
 * いるか。**綴りではなく解決後のパスで判定する** — `@/shared/db/prisma` と
 * `./prisma` は同じモジュールなので、文字列一致では後者が素通りする
 * （第6次監査 M-16。実物は src/shared/db/better-auth-adapter.ts:12）。
 * コメント行は数えない。
 *
 * 限界: `@generated/` 配下は `resolveModuleSpecifier` が external として
 * 捨てるため、この経路では判定できない。generated 系の判定は文字列一致のまま。
 */
function importsResolvedModule(
  fromRelPath: string,
  source: string,
  targets: readonly string[],
): boolean {
  return source.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      return false;
    }
    for (const match of line.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveModuleSpecifier(fromRelPath, specifier);
      if (resolved.kind === "internal" && targets.includes(resolved.relPath)) {
        return true;
      }
    }
    return false;
  });
}

/** 絶対パスのファイルが `targets` のどれかを import しているか。 */
function fileImportsResolvedModule(
  absFile: string,
  targets: readonly string[],
): boolean {
  return importsResolvedModule(
    toRelPosix(absFile),
    readFileSync(absFile, "utf8"),
    targets,
  );
}

function collectPrismaImportingFiles(): string[] {
  const hits = collectSourceFiles(SRC_ROOT).filter((file) =>
    fileImportsResolvedModule(file, [PRISMA_FACADE]),
  );
  // prisma.ts 自身は import 側に現れないが、singleton 定義そのものが
  // server-only を要求されるので母集合に固定で加える。
  const set = new Set<string>([join(SHARED_DB_ROOT, "prisma.ts"), ...hits]);
  return [...set].sort();
}
```

同じ specifier を見ている残り 3 箇所も解決ベースへ寄せる。

`:177-190`:

```ts
test("public app layer は prisma facade を直接 import しない", () => {
  const sourceFiles = collectSourceFiles(PUBLIC_APP_ROOT);
  const offenders = sourceFiles
    .filter((file) =>
      fileImportsResolvedModule(file, [PRISMA_FACADE, LEGACY_PRISMA_SHIM]),
    )
    .map((file) => relative(ROOT, file));

  expect(offenders).toEqual([]);
});
```

`:208-221`:

```ts
test("shared/ の外に Prisma 直 import を残さない", () => {
  const SHARED_ROOT = join(SRC_ROOT, "shared");
  const sourceFiles = collectSourceFiles(SRC_ROOT);
  // `from "…"` の文字列一致だと動的 import も相対 import も素通りする。
  // どれも「app 層が Prisma を直に握る」形なので解決後パスで同じ扱いにする。
  const offenders = sourceFiles
    .filter((file) => !file.startsWith(SHARED_ROOT))
    .filter((file) => fileImportsResolvedModule(file, [PRISMA_FACADE]))
    .map((file) => relative(ROOT, file));

  expect(offenders).toEqual([]);
});
```

`:244-266`（placement gate）— ローカルの `importsPrisma` を削り、`containsPrismaModelCall` は残す:

```ts
test("shared/ 内の Prisma 直 import / model 呼出は domain・db 配下に限定する（placement gate）", () => {
  const SHARED_ROOT = join(SRC_ROOT, "shared");
  const ALLOWLIST = new Set<string>();
  const containsPrismaModelCall = (source: string) =>
    /\bprisma\.\w+\.\w+/u.test(source);

  const offenders = collectSourceFiles(SHARED_ROOT)
    .filter(
      (file) =>
        !file.startsWith(SHARED_DOMAIN_ROOT) &&
        !file.startsWith(SHARED_DB_ROOT),
    )
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        importsResolvedModule(toRelPosix(file), source, [PRISMA_FACADE]) &&
        containsPrismaModelCall(source)
      );
    })
    .map((file) => relative(ROOT, file))
    .filter((rel) => !ALLOWLIST.has(rel));

  expect(offenders).toEqual([]);
});
```

**このタスクで触らない判定**（理由付きで残す）:

- `@generated/prisma` 系 3 本（`:64` / `:82` / `:100`）— `resolveModuleSpecifier` が `@generated/` 始まりを external として捨てる設計（`architecture-fs.ts:130`）なので同じ経路に載らない。helper 側を変えると `module-reachability.test.ts` のグラフが変わるため別タスク。
- `legacy prisma shim import は残さない`（`:165`）と `shared/db barrel`（`:223`）— どちらも**実在しないモジュール**（`src/shared/lib/prisma` / `src/shared/db/index.ts`。不在は `:236-242` が強制）を指す検査。実在しないモジュールは相対綴りで書いても tsc が解決できず type-check が落ちるので、**そもそも「相対綴りで書かれる」経路が存在しない**。綴り一致のままで穴は開かない。
  （`resolveModuleSpecifier` は fs を見ない純粋なパス演算なので、実在しないモジュールでも解決自体はできる。上の `public app layer` 判定が `LEGACY_PRISMA_SHIM` を解決ベースで見ているのはそのため。ここで据え置くのは技術的制約ではなく、直しても増える保護が無いから。）

- [ ] **Step 4: 通ることを確認する**

実行:

```bash
bun run test -- __tests__/unit/architecture/prisma-import-boundary.test.ts
bun run test -- __tests__/unit/architecture/cross-surface-import-gate.test.ts
```

期待: 両方 PASS（prisma 側 14 tests / cross-surface 側 4 tests）。母集合は 218 件（実測: 解決ベースの importer 217 件 + `prisma.ts`）で、`expect(files.length).toBeGreaterThan(10)` を満たす。

所要時間の目安: 解決ベースの `src` 全走査（2304 ファイル）は 1 回あたり実測 0.5 秒前後。`collectPrismaImportingFiles()` は fixture test と server-only test の 2 回呼ばれるので、prisma 側のファイル合計はベースライン約 1.5 秒から 2.5〜3 秒になる。runner の 30 秒 timeout に対して余裕がある。**これを超えて遅いなら判定が壊れている**（例: comment skip が効かず全行を解決している）ので、キャッシュを足す前に原因を見ること。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

実行:

```bash
bun scripts/run-tests.ts __tests__/unit/architecture
bun run lint:files -- __tests__/unit/architecture/cross-surface-import-gate.test.ts __tests__/unit/architecture/prisma-import-boundary.test.ts
bun run validate
```

期待: すべて PASS。

- `__tests__/unit/architecture` 全件は pre-push と同じ入口。`module-reachability.test.ts` が同じ helper を使うので、helper を変えていないことをここで確かめる。
- `lint:files` は `local/gate-scan-must-not-be-silently-empty`（`eslint.config.mjs:592-599` が `__tests__/unit/architecture/**` に適用）を踏む。この rule は**同一ファイル内の** `readdirSync` / `globSync` / `scanSync` / `git ls-files` しか走査とみなさない（`eslint-rules/gate-scan-must-not-be-silently-empty.mjs:66,141`）ので、cross-surface 側の `readdirSync` 走査と `expect(...).toBeGreaterThan(50)` の数値リテラルは残すこと。prisma 側はファイル内に走査 callee を持たないので rule は発火しない。
- `bun run validate` は `eslint .`（`__tests__` は globalIgnores に入っていない）と type-check を走らせる。type-check は `tsconfig.test.json` 経由で `__tests__/**` も見る（`scripts/type-check.ts:45-56` の `tsc:test`）。`importsForbiddenAlias` → `importsForbiddenSurface` の改名漏れはここで落ちる。`lint:files` は `validate` の lint の部分集合だが、2 ファイルだけなので数秒で返る先行チェックとして使う。

- [ ] **Step 6: commit**

```bash
git add __tests__/unit/architecture/cross-surface-import-gate.test.ts __tests__/unit/architecture/prisma-import-boundary.test.ts
git commit -m "test(architecture): judge surface and prisma boundaries by resolved path [ai-gen]"
```

## 起案者が確認したと主張している事実（検証官が全件再確認済み）

**監査の指摘は 2 件とも成立する（棄却なし）。**

1. `__tests__/unit/architecture/cross-surface-import-gate.test.ts:39-45` `forbiddenSpecifierPrefixes` は `["@/admin", "@/app/(admin)"]` / `["@/public", "@/app/(public)"]` の 2 綴りだけを返す。判定は `:64-69` の `specifier === prefix || specifier.startsWith(prefix + "/")` のみなので、`../` で始まる specifier は構造上一致しない。相対パス綴りは素通りする。
2. `__tests__/unit/architecture/prisma-import-boundary.test.ts:50` `const importRe = /from\s+["']@\/shared\/db\/prisma["']/u` が server-only 強制テスト（`:268-280`）の母集合生成。相対 import は母集合に入らない。

**実測（read-only probe を repo ルートで実行、`__tests__/helpers/architecture-fs.ts` の実 helper を使用。検証官が再実行して同一結果を確認）:**

- `src/app/(public)` 422 ファイル / `src/app/(admin)` 1038 ファイル / `src` 2304 ファイル。
- 解決ベースで判定した cross-surface 越境は **両方向とも 0 件**。→ gate を強化しても現行コードは緑のまま。
- 解決ベースの prisma facade importer = **217 件**。旧 regex のヒット = **216 件**。差分は `["src/shared/db/better-auth-adapter.ts"]` の 1 件だけ（逆方向の差分＝旧 regex だけが拾うファイルは 0 件）。
- `src/shared/db/better-auth-adapter.ts:12` = `import { prisma } from "./prisma";`（相対）。同 `:9` に `import "server-only";` あり。
- **決定的な裏付け:** `prisma-import-boundary.test.ts:55-58` の seed 配列に `better-auth-adapter.ts` がハードコードされている。旧 regex が唯一取りこぼすファイルと完全一致する。seed は相対 import の盲点を手で埋めた回避策であって、盲点が塞がった証拠ではない。
- 最終母集合 218 件すべてに `import "server-only"` があり、すべて `src/shared/` 配下（`[NO server-only]` / `[OUTSIDE shared/]` の検出ゼロ）。`src/shared/db/prisma.ts:13` にも `import "server-only";` あり。
- 差分の 1 件は `src/shared/db` 配下なので、`shared/ の外に Prisma 直 import を残さない` にも placement gate にも新たに引っかからない。→ 変換した 4 箇所すべて結果不変。
- `src/shared/db` の他 3 ファイル（`json.ts` / `prisma-input-json.ts` / `transaction-options.ts`）は prisma を import しない。`prisma-input-json.ts:6-7` は `@generated/prisma/client` の型と `@/shared/domain/domain-error` のみ。→ negative fixture として使える（`targets.includes()` を `startsWith` に変異させると誤検知する）。
- `src` 全体で `require(` の実使用は `src/shared/lib/lexical-headless-dom-environment.ts:38` の 1 件のみ（`require("jsdom")`、bare specifier）。`extractImportSpecifiers`（`architecture-fs.ts:96`）は `require(` を拾わないので、cross-surface gate 既存 fixture（`require("@/public/lib/x")` → true）を守るため抽出用 regex `MODULE_SPECIFIER` は残す必要がある。

**再利用できる既存 helper（すべて実在を確認）:**

- `__tests__/helpers/architecture-fs.ts:126` `resolveModuleSpecifier(fromRelPath, specifier): ResolveResult` — 相対パスを `..` 巻き戻しで解決（`:132-141`）、alias は tsconfig の longest-prefix 表（`:106-114`）。`@generated/` と bare は `{kind:"external"}`（`:130` / `:152`）。**fs を一切見ない純粋なパス演算。**
- 同 `:116-118` `type ResolveResult = { kind: "internal"; relPath: string } | { kind: "external" }`。
- 同 `:13` `collectSourceFiles`（prisma gate が既に `:12` で import 済み）。
- alias 解決の実測確認: `@/admin/lib/y` → `src/app/(admin)/admin/(dashboard)/_shared/lib/y`、`@/publicity/z` → `src/publicity/z`（`src/app/(public)/` に前方一致しない）、`src/app/(public)/_shared/lib/format-event-date.ts` + `../../../(admin)/admin/(dashboard)/_shared/lib/permissions` → `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions`、同ファイル + `../../reservation/_components/guest-stepper` → `src/app/(public)/reservation/_components/guest-stepper`。

**ベースライン（実行済み・検証官が再実行して一致）:**

- `bun run test -- __tests__/unit/architecture/cross-surface-import-gate.test.ts` → 4 pass / 0 fail / 15 expect calls / 453ms。
- `bun run test -- __tests__/unit/architecture/prisma-import-boundary.test.ts` → 13 pass / 0 fail / 32 expect calls / 1493ms。

**環境事実:**

- `tsconfig.json` の `exclude` に `__tests__` があるが、`scripts/type-check.ts:45-56` が `tsc -p tsconfig.test.json` を別ジョブで走らせるので `__tests__/**` も型検査される。
- `tsconfig.test.json` は `noUncheckedIndexedAccess: false`。それでも `const specifier = match[1]; if (specifier === undefined) continue;` は TS2367 にならない（同オプションで tsc 単体実行して exit 0 を確認済み）。既存 `cross-surface-import-gate.test.ts:61-62` と同じ形。
- `eslint.config.mjs:592-599` が `__tests__/unit/architecture/**` に `local/gate-scan-must-not-be-silently-empty` を適用（型付き lint は `:164` / `:180` で `__tests__/**` 除外）。`__tests__` は `globalIgnores`（`:658-675`）に入っていないので `bun run lint`（= `eslint .`）の対象。
- `importsForbiddenAlias` の参照は当該ファイル内のみ（`:52` 定義 / `:82` 使用 / fixture 内）。他の main 上の参照はゼロ（`docs/audits/2026-08-12-codebase-audit-findings.md:638` の記述のみ）。`.worktrees/fix-audit-leftovers/` に旧版のコピーがあるが別 checkout で `globalIgnores` 対象。

## 検証官が入れた訂正

1. **cross-surface の negative fixture が 1 段多く `..` を戻していた（実害あり）。** 元案は `"../../../reservation/_components/guest-stepper"` で「surface 内に留まる」とコメントしていたが、実測ではこれは `src/app/reservation/_components/guest-stepper` に解決し、`(public)` の外へ出る（そのファイルも実在しない）。assertion 結果は偶然 `false` なのでテストは緑になるが、「surface 内の相対 import を誤検知しない」ことを証明していない。`../../` に修正し、実在する `src/app/(public)/reservation/_components/guest-stepper.tsx` を指すようにした。Step 1-b と Step 3-a の 2 箇所。
2. **Files セクションの `:148-162（呼び出し 2 箇所）` を削除。** Step 3-a が「書き換え不要」と言っている箇所を Modify に挙げていた。実際 `collectCrossSurfaceImports` の引数構成は変わらないので不要。
3. **行番号の訂正:** cross-surface の import ブロックは `:1-4` ではなく `:1-3`（`:4` は空行）。prisma の helper import は「`:9-12` に追加」ではなく「`:12` を差し替え」。`scripts/type-check.ts` の `tsc:test` は `:44-55` ではなく `:45-56`。
4. **「触らない判定」の理由を書き直した。** 元案は「実在しないモジュールは相対綴りにすると型解決自体が落ちる」を `resolveModuleSpecifier` 側の制約のように読ませていたが、同じ Step 3-b が `LEGACY_PRISMA_SHIM`（実在しない `src/shared/lib/prisma`）を解決ベースで見ており自己矛盾する。`resolveModuleSpecifier` は fs を見ない純粋なパス演算なので実在しないモジュールでも解決できる。据え置く本当の理由は「実在しないモジュールは相対綴りで書いても tsc が通らないので、そもそも綴りの穴が無い＝直しても保護が増えない」。
5. **Step 2 / Step 4 に具体的な pass/fail 内訳と所要時間の実測を追記。** RED は prisma 13 pass / 1 fail・cross-surface 3 pass / 1 fail。解決ベースの `src` 全走査は 1 回 0.5 秒前後で、prisma 側ファイル合計は 2.5〜3 秒になる。
6. **Step 5 の lint 説明を補強。** rule が同一ファイル内の走査 callee しか見ないこと（`eslint-rules/gate-scan-must-not-be-silently-empty.mjs:66,141`）と、prisma 側では発火しないことを明記。

## 監査記述に対する訂正（元案から引き継ぎ・検証済み）

1. **行番号のずれ（軽微）:** 監査は `src/app/(public)/_shared/lib/format-event-date.ts:11` に相対越境を仕込んだと書いているが、現行ファイルの `:11-18` は `@/shared/lib/date-format` からの複数行 import 文で、`:11` はその開始行。変異の投入位置としては妥当だが、「`:11` に問題がある」と読める書き方は誤り。**このファイル自体に欠陥は無い**（`:11` と `:19` の import はどちらも `@/shared/*` で、越境していない）。実測でも `src/app/(public)` 422 ファイルに cross-surface 越境は 0 件。
2. **「6 つの判定」は数え方が不正確:** `prisma-import-boundary.test.ts` で specifier 文字列に依存している判定は 6 つではなく 10 箇所（`:50` 母集合 / `:72-75` generated / `:94` domain enums / `:120-130` gateway / `:170` legacy shim / `:183-184` public app / `:199-200` app models・client / `:213-214` 外部直 import / `:229` barrel / `:248` placement）。うち相対綴りで実際に穴が開くのは `@/shared/db/prisma` を見る 4 箇所（`:50` / `:183` / `:213` / `:248`）で、Task 10 はそこを直す。残り 6 箇所を直さない理由は Step 3 に明記した。
3. **監査が拾えていなかった補強材料:** `:55-58` の seed 配列に `better-auth-adapter.ts` がハードコードされているのは、まさにこの相対 import の盲点を手で埋めた跡。実測で「旧 regex が取りこぼす唯一のファイル」と一致した。この行を消すことが、Task 10 の RED を実物の欠陥形で作れる根拠になる。
4. **「gate の JSDoc が旧欠陥の経緯を書いている」は正しい:** `cross-surface-import-gate.test.ts:25-38` の JSDoc が監査 F-12 の 2 形を明記している。3 通り目が残っていたという指摘どおり。
5. **`第6次監査 M-15 / M-16` の ID は tracked doc に無い（注記）。** `docs/` と `.claude/` を grep して 0 件（`F-12` は `docs/audits/2026-08-12-codebase-audit-findings.md:610`、`F-13` は `:650` に実在）。コード内コメントの ID は grep 不能になるが、どちらも具体的な欠陥形（`src/shared/db/better-auth-adapter.ts:12` / 相対越境の綴り）を併記しているので、落ちた人が読んで判断できる状態は保たれている。

---

### Task 11: admin terms/event RBAC gate を総数照合から AST 関数単位へ移す

**深刻度:** high / **見積り:** 約 +225 / -25 行・1 ファイル

**なぜ:** `__tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts:65-89` は「ファイル全体での `requireAdminPermission(...)` 出現回数 == `^export async function` の個数」という総数照合で、guard がどの関数に付いているかを見ない。実測で確認済み — `terms.ts` の `getAdminAgreements` から guard を消し `getAdminTermsList` に重複追加すると、旧判定は `exports=6 guards=6 => GREEN` のまま素通りする（AST 判定なら `offenders=[getAdminAgreements] => RED`）。コピペ・関数の統廃合で guard が隣の関数へ移動すると、無防備な admin 読取 query が生まれても gate は緑のままになる。

同じ根から出る 2 つ目の穴も同時に塞ぐ: 旧判定の export 側は `/^export async function (\w+)/gmu` でしか数えないため、`export const foo = async () => {...}` 形は分母にも分子にも数えられず、この形で guard 無しの export を足すと総数照合は緑のまま通る。

**Files:**

- Modify: `__tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts`（この 1 ファイルのみ）
- Test: 同ファイル（gate 自身がテスト。新規ファイルは作らない）
- 読むだけ（変更しない）: `src/app/(admin)/admin/(dashboard)/_shared/queries/terms.ts` / `.../event.ts`

以下の Step 3 の編集はすべて **現行ファイルの正確な文字列アンカー** で指定する。行番号は「編集前」のものなので、上から順に適用すると後ろの行番号はずれる。**行番号ではなく引用したテキストで一致を取ること。**

**Interfaces:**

- Consumes（既存・実在確認済み）:
  - `typescript@6.0.3` の named export: `ScriptTarget` / `SyntaxKind` / `canHaveModifiers` / `createSourceFile` / `forEachChild` / `getModifiers` / `isArrowFunction` / `isCallExpression` / `isFunctionDeclaration` / `isFunctionExpression` / `isIdentifier` / `isStringLiteral` / `isVariableStatement` / 型 `FunctionDeclaration` / `Node` / `SourceFile`（全て 6.0.3 に実在。実測でロード確認済み）
  - 同ファイル既存の `ROOT`（`:5` `process.cwd()`）/ `ADMIN_DASHBOARD_ROOT`（`:6-13`）/ `readAdminFile`（`:15-17`）
  - 見本にする実装: `__tests__/unit/architecture/assert-customer-active-server-actions.test.ts:83-191`（`containsCallTo` / `hasModifier` / `isExportedAsyncFunctionDeclaration` / `exportedAsyncArrowDeclarations` / `collect` / `analyzeSnippet`）。**これらは file-local で export されていないため import できない。** 共有ヘルパー化はしない — CLAUDE.md「抽象化は 3 回目の重複から」で、この形は今回が 2 回目。`__tests__/helpers/architecture-fs.ts` にも AST ヘルパーは無い（`collectSourceFiles` / import グラフのみ）。
- Produces: なし（gate ファイル内で閉じる。export を増やさない）
- 検証環境の前提（実測済み）:
  - `__tests__/**` は **ESLint の対象に入っている**（`eslint.config.mjs` の `globalIgnores` に `__tests__` は無い）。対象外なのは **型情報を使う lint だけ**（`ignores: ["__tests__/**"]` は typed-lint ブロック限定）。加えて `eslint.config.mjs:592-599` が `__tests__/unit/architecture/**` に `local/gate-scan-must-not-be-silently-empty` を適用する。このルールが見るのは `readdirSync` / `globSync` / `scanSync` / `git ls-files` だけなので、この gate（`readFileSync` のみ）は対象外。
  - `tsconfig.test.json` が `__tests__/**/*.ts` を拾い、`scripts/type-check.ts` が `tsc -p tsconfig.test.json` を必ず走らせる。`noUncheckedIndexedAccess: false` なので `current.arguments[0]` に非 null assertion は不要（`@typescript-eslint/no-non-null-assertion` が error なので付けてはいけない）。
  - prettier は `bun run validate` に**含まれない**が、lefthook pre-commit の `prettier-fix` が staged file を `--write` + `stage_fixed: true` で自動整形するため、Step 6 の commit で吸収される。

---

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts` の `describe` ブロック末尾（現 89 行の `  });` の直後、90 行の `});` の直前）に、次の **1 本**を追加する。この時点で `analyzeSnippet` は未定義なので落ちる。

assertion が 4 本あるのは、4 本とも**別々の変異を検出するため**（1 本でも消すと、対応する実装の壊し方が緑で通る）。

```ts
test("guard が隣の関数へ移動した形が落ちる（fixture）", () => {
  // (1) 第6次監査 M-17 の変異そのもの。guard が隣の関数へ移動しても
  //     ファイル全体での出現回数は 2 のまま変わらない（旧・総数照合はここを通した）。
  expect(
    analyzeSnippet(
      `export async function getAdminTermsList() {
          await requireAdminPermission("terms", "read");
          await requireAdminPermission("terms", "read");
          return [];
        }
        export async function getAdminAgreements() {
          return { items: [], total: 0 };
        }`,
      "terms",
      "read",
    ),
  ).toEqual(["getAdminAgreements"]);

  // (2) 関数単位で 1 本ずつ揃っていれば落ちない（arrow 形も対象に入る）。
  //     偽陽性が出ないことの見本。
  expect(
    analyzeSnippet(
      `export async function getAdminTermsList() {
          await requireAdminPermission("terms", "read");
          return [];
        }
        export const getAdminAgreements = async () => {
          await requireAdminPermission("terms", "read");
          return { items: [], total: 0 };
        };`,
      "terms",
      "read",
    ),
  ).toEqual(["getAdminAgreements"].slice(0, 0));

  // (3) arrow 形の無防備な export も落ちる。
  //     これが無いと `exportedAsyncArrowDeclarations` の呼出を削除しても
  //     (2) は `[]` のまま緑になり（拾われないだけなので違反も出ない）、
  //     実 2 ファイルは全て declaration 形なので実ファイル側でも検出できない。
  expect(
    analyzeSnippet(
      `export async function getAdminTermsList() {
          await requireAdminPermission("terms", "read");
          return [];
        }
        export const getAdminAgreements = async () => {
          return { items: [], total: 0 };
        };`,
      "terms",
      "read",
    ),
  ).toEqual(["getAdminAgreements"]);

  // (4) resource / action が違う guard は代用にならない。
  //     これが無いと `literalArgText(...) === resource` の照合を消しても
  //     他の fixture・実ファイルが全て緑のままになる。
  expect(
    analyzeSnippet(
      `export async function getAdminTermsList() {
          await requireAdminPermission("event", "read");
          return [];
        }`,
      "terms",
      "read",
    ),
  ).toEqual(["getAdminTermsList"]);
});
```

（(2) の `["getAdminAgreements"].slice(0, 0)` は空配列を書くための遠回しな書き方に見えるので、素直に `.toEqual([])` と書いてよい。上の形にする必要は無い。**`.toEqual([])` を使うこと。**）

上の注記のとおり、(2) は次の形で書く:

```ts
    ).toEqual([]);
```

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts`

期待: FAIL（`ReferenceError: analyzeSnippet is not defined`。既存 4 本は pass、新規 1 本のみ fail）

- [ ] **Step 3: 実装を直す**

**3-1. import を足す。** 現 1-3 行:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

を、次に置き換える:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ScriptTarget,
  SyntaxKind,
  canHaveModifiers,
  createSourceFile,
  forEachChild,
  getModifiers,
  isArrowFunction,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isStringLiteral,
  isVariableStatement,
  type FunctionDeclaration,
  type Node,
  type SourceFile,
} from "typescript";
```

**3-2. パスを返すヘルパーと AST 解析器を足す。** 現 15-17 行:

```ts
function readAdminFile(...segments: string[]): string {
  return readFileSync(join(ADMIN_DASHBOARD_ROOT, ...segments), "utf8");
}
```

を、次に置き換える（解析器は `describe` の JSDoc **より前**に置く。JSDoc と `describe` の間に挟むと、`describe` の説明である JSDoc が `const FIXTURE` の docstring になってしまう）:

```ts
function adminFilePath(...segments: string[]): string {
  return join(ADMIN_DASHBOARD_ROOT, ...segments);
}

function readAdminFile(...segments: string[]): string {
  return readFileSync(adminFilePath(...segments), "utf8");
}

// ---------------------------------------------------------------------------
// AST 解析: exported async function 単位で requireAdminPermission を見る
// ---------------------------------------------------------------------------

/** fixture 用の疑似ファイル内容（`analyzeSnippet` だけが書き込む）。 */
const FIXTURE = new Map<string, string>();

/** node が与えた修飾を持つか（cast なしで modifiers を読む）。 */
function hasModifier(node: Node, kind: SyntaxKind): boolean {
  if (!canHaveModifiers(node)) return false;
  return (getModifiers(node) ?? []).some((m) => m.kind === kind);
}

/** function declaration が `export` + `async` 修飾を両方持つか。 */
function isExportedAsyncFunctionDeclaration(
  node: Node,
): node is FunctionDeclaration {
  return (
    isFunctionDeclaration(node) &&
    node.body !== undefined &&
    hasModifier(node, SyntaxKind.ExportKeyword) &&
    hasModifier(node, SyntaxKind.AsyncKeyword)
  );
}

/**
 * `export const foo = async (...) => {...}` 形も対象に含める。
 * 現状この 2 ファイルは全て function declaration 形だが、旧・総数照合は
 * `^export async function` でしか export を数えなかったため、この形で
 * guard 無しの export を足すと分母も分子も増えず素通りしていた。
 */
function exportedAsyncArrowDeclarations(
  source: SourceFile,
): { name: string; body: Node }[] {
  const out: { name: string; body: Node }[] = [];
  forEachChild(source, (node) => {
    if (!isVariableStatement(node)) return;
    if (!hasModifier(node, SyntaxKind.ExportKeyword)) return;
    for (const decl of node.declarationList.declarations) {
      if (!isIdentifier(decl.name) || !decl.initializer) continue;
      const init = decl.initializer;
      if (!isArrowFunction(init) && !isFunctionExpression(init)) continue;
      if (!hasModifier(init, SyntaxKind.AsyncKeyword)) continue;
      out.push({ name: decl.name.text, body: init.body });
    }
  });
  return out;
}

/** 引数が文字列リテラルならその値、そうでなければ null。 */
function literalArgText(node: Node | undefined): string | null {
  if (node === undefined || !isStringLiteral(node)) return null;
  return node.text;
}

/**
 * node の部分木に `requireAdminPermission("<resource>", "<action>")` の呼出が
 * あるか。識別子の CallExpression しか見ないため、コメント中や文字列中に
 * 同じ語が出るだけでは true にならない。
 */
function containsPermissionGuard(
  node: Node,
  resource: string,
  action: string,
): boolean {
  let found = false;
  const walk = (current: Node): void => {
    if (found) return;
    if (
      isCallExpression(current) &&
      isIdentifier(current.expression) &&
      current.expression.text === "requireAdminPermission" &&
      literalArgText(current.arguments[0]) === resource &&
      literalArgText(current.arguments[1]) === action
    ) {
      found = true;
      return;
    }
    forEachChild(current, walk);
  };
  walk(node);
  return found;
}

/** ファイル内の exported async function（declaration 形 / arrow 形の両方）。 */
function exportedAsyncFunctions(file: string): { name: string; body: Node }[] {
  const text = FIXTURE.get(file) ?? readFileSync(file, "utf8");
  const source = createSourceFile(file, text, ScriptTarget.Latest, true);

  const targets: { name: string; body: Node }[] = [];
  forEachChild(source, (node) => {
    if (!isExportedAsyncFunctionDeclaration(node) || !node.body) return;
    targets.push({ name: node.name?.text ?? "<anonymous>", body: node.body });
  });
  targets.push(...exportedAsyncArrowDeclarations(source));
  return targets;
}

/** 自分の関数本体に guard を持たない exported async function の名前一覧。 */
function unguardedExportNames(
  file: string,
  resource: string,
  action: string,
): string[] {
  return exportedAsyncFunctions(file)
    .filter(({ body }) => !containsPermissionGuard(body, resource, action))
    .map(({ name }) => name);
}

/**
 * fixture を **本番と同じ解析器**へ通す。別実装で確かめると、解析器が壊れても
 * fixture だけ緑になる。
 */
function analyzeSnippet(
  code: string,
  resource: string,
  action: string,
): string[] {
  const path = join(ROOT, "__gate_fixture__.ts");
  FIXTURE.set(path, code);
  try {
    return unguardedExportNames(path, resource, action);
  } finally {
    FIXTURE.delete(path);
  }
}
```

**3-3. docstring に手法と限界を追記する。** これは「挿入」ではなく**置換**。現 27-28 行:

```
 * ことを回帰防止として固定する。
 */
```

を、次に置き換える（末尾の `*/` は 1 つだけになる）:

```
 * ことを回帰防止として固定する。
 *
 * ## 判定は関数単位（第6次監査 M-17 の修正）
 *
 * 旧版は `_shared/queries/{terms,event}.ts` について
 * 「ファイル全体での `requireAdminPermission(...)` 出現回数 == `export async
 * function` の個数」という**総数照合**だった。実測: `terms.ts` の
 * `getAdminAgreements` から guard を消し `getAdminTermsList` に重複追加すると
 * 6 == 6 のまま **緑**になり、無防備な export を通していた。さらに export 側を
 * `^export async function` の正規表現で数えていたため、
 * `export const foo = async () => {...}` 形は分母にも分子にも数えられず、
 * この形の無防備な export も素通りしていた。
 * 現版は TypeScript AST で **exported async function 単位**に、その関数本体の
 * 部分木へ `requireAdminPermission("<resource>", "read")` の CallExpression が
 * あるかを見る。所属判定は関数ノードの body（`FunctionDeclaration.body` /
 * arrow の `initializer.body`）の部分木で、行番号や順序は使わない。
 *
 * **証明しない**: guard が関数の**先頭**にあること（順序は見ない）。
 * `requireAdminPermission` を別名 import した場合（識別子名でしか照合しない）。
 * guard 呼出が実行されない closure の中にあるケース。
 */
```

**コメント内に `*/` を含む glob を書かないこと**（`**\/` のようにエスケープする — 既存 22 行が同じ理由でエスケープしている）。上の文面には `*/` を作る並びは含まれていない。

**3-4. 総数照合の 2 本を置き換える。** 現 65-89 行:

```ts
test("_shared/queries/terms.ts は全 export を terms:read で gate する", () => {
  const source = readAdminFile("_shared", "queries", "terms.ts");
  const exportedFunctions = [
    ...source.matchAll(/^export async function (\w+)/gmu),
  ];

  expect(exportedFunctions.length).toBeGreaterThan(0);
  expect(
    (source.match(/requireAdminPermission\("terms", "read"\)/gu) ?? []).length,
  ).toBe(exportedFunctions.length);
});

test("_shared/queries/event.ts は全 export を event:read で gate する", () => {
  const source = readAdminFile("_shared", "queries", "event.ts");
  const exportedFunctions = [
    ...source.matchAll(/^export async function (\w+)/gmu),
  ];

  expect(exportedFunctions.length).toBeGreaterThan(0);
  expect(
    (source.match(/requireAdminPermission\("event", "read"\)/gu) ?? []).length,
  ).toBe(exportedFunctions.length);
});
```

を、次に置き換える（現在 terms は export 6 件・event は export 10 件。下限は数値リテラルで書く — `.claude/rules/architecture-gates.md`）:

```ts
test("_shared/queries/terms.ts は export ごとに自分の本体で terms:read を gate する", () => {
  const file = adminFilePath("_shared", "queries", "terms.ts");

  expect(exportedAsyncFunctions(file).length).toBeGreaterThan(5);
  expect(
    unguardedExportNames(file, "terms", "read"),
    `_shared/queries/terms.ts の export は、自分の関数本体で requireAdminPermission("terms", "read") を呼ぶこと。隣の関数に 2 本あってもこの関数の代わりにはならない。`,
  ).toEqual([]);
});

test("_shared/queries/event.ts は export ごとに自分の本体で event:read を gate する", () => {
  const file = adminFilePath("_shared", "queries", "event.ts");

  expect(exportedAsyncFunctions(file).length).toBeGreaterThan(9);
  expect(
    unguardedExportNames(file, "event", "read"),
    `_shared/queries/event.ts の export は、自分の関数本体で requireAdminPermission("event", "read") を呼ぶこと。隣の関数に 2 本あってもこの関数の代わりにはならない。`,
  ).toEqual([]);
});
```

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts`

期待: PASS（5 tests。`terms.ts` / `event.ts` は現状 unguarded 0 件なので本体側の変更は不要）

- [ ] **Step 5: 周辺が壊れていないことを確認する**

**5-1. 受入条件（guard を隣の関数へ移動させると赤くなる）を実測する。** 先に `git status --short "src/app/(admin)/admin/(dashboard)/_shared/queries/terms.ts"` が空であることを確認する（空でなければこの手順を飛ばし、実装差分を退避してから行う）。

`src/app/(admin)/admin/(dashboard)/_shared/queries/terms.ts` を手で 2 箇所編集する。**この順序で行う**（先に複製すると以降の行番号が 1 つ下がり、削除対象が 52 行ではなく 53 行になる。53 行は `return getAdminAgreementsQuery(filter);` なので、順序を逆にすると別の行を消してしまう）:

1. **先に削除**: 52 行 `  await requireAdminPermission("terms", "read");`（`export async function getAdminAgreements(` の本体・`return getAdminAgreementsQuery(filter);` の直前の行）を削除する。
2. **次に複製**: 20 行 `  await requireAdminPermission("terms", "read");`（`export async function getAdminTermsList(): Promise<AdminTermsListItem[]> {` の本体 1 行目）の直後に、同じ行をもう 1 行複製する。

実行: `bun run test -- __tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts`

期待: FAIL。`_shared/queries/terms.ts は export ごとに自分の本体で terms:read を gate する` が
`expect(received).toEqual(expected)` / received `[ "getAdminAgreements" ]` / expected `[]` で落ちる。
（旧・総数照合はこの変異で `exports=6 guards=6` のまま緑だった。実測済み。）

戻す: `git restore "src/app/(admin)/admin/(dashboard)/_shared/queries/terms.ts"`
戻ったことの確認: `git status --short "src/app/(admin)/admin/(dashboard)/_shared/queries/terms.ts"` が空。

**5-2. architecture gate 全件が緑のままであること。**

実行: `bun scripts/run-tests.ts __tests__/unit/architecture`

期待: PASS（0 failed）

**5-3. lint / type-check。** `__tests__/**` は ESLint の対象に入っている（対象外なのは型情報を使う lint だけ）。`tsconfig.test.json` の型検査対象でもある。

実行: `bun run validate`

期待: PASS

- [ ] **Step 6: commit**

```bash
git add __tests__/unit/architecture/admin-terms-event-rbac-boundaries.test.ts
git commit -m "test(architecture): judge admin terms/event RBAC guard per function via AST [ai-gen]"
```

（pre-commit の prettier / eslint --fix が staged file を自動整形して stage に戻す。`bun run format` を引数なしで叩かないこと — リポジトリ全体を書き換える。）

---

### Task 12: 管理ページ認可 gate を「await されているか」まで見る AST 判定に置き換える

**深刻度:** high / **見積り:** +246 / −13 行・1 ファイル（実測 `git diff --stat`）

**なぜ:** `admin-page-auth-before-suspense.test.ts` は `require(AdminListPage|…)\s*\(` という**文字列一致**でしか認可呼出を見ていない。`src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx:70` の `await` を `void` に変えても呼出そのものは残るので gate は緑のままで、`@typescript-eslint/no-floating-promises` も `void` を公式のエスケープとして許すため lint も exit 0 になる（実測済み）。結果、`auditLog:read`（SUPER_ADMIN 専用）の Promise が待たれないままページ本体が描画され、認可が事実上無効になる。

**Files:**

- Modify: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts:1-45`（docstring と判定パターン）
- Modify: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts:104-126`（`pageBodyBeforeSuspense` / `findViolations`）
- Modify: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts:128-156`（describe 名 + 見本テスト 1 本追加）
- Test: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts`（gate 自身がテスト。新規ファイルは作らない）

**Interfaces:**

- Consumes: `typescript`（node_modules は 6.0.3。実在確認済み）から `createSourceFile` / `forEachChild` / `canHaveModifiers` / `getModifiers` / `isAwaitExpression` / `isCallExpression` / `isIdentifier` / `isFunctionDeclaration` / `isJsxOpeningElement` / `isJsxSelfClosingElement` / `isParenthesizedExpression` / `isArrayLiteralExpression` / `isPropertyAccessExpression` / `ScriptKind` / `ScriptTarget` / `SyntaxKind` と型 `CallExpression` / `FunctionDeclaration` / `Node`。`Glob` from `"bun"`、`readFileSync` from `"node:fs"`、`join` / `sep` from `"node:path"`。既存の `PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST`（50-102 行）は**中身を 1 行も変えない**。
- Produces: なし（gate ファイルは何も export しない）

---

- [ ] **Step 1: 失敗するテストを書く**

まだ実装は直さない。現在の判定器（`PAGE_GUARD_PATTERN` + `pageBodyBeforeSuspense`）の上に見本の入口だけを足し、見本テストを 1 本追加する。

`findViolations`（現 121-126 行）の直後、`describe(`（現 128 行）の直前に挿入する:

```ts
/**
 * 見本を **本番と同じ判定器**へ通す。別実装で確かめると、判定器が壊れても
 * 見本だけ緑になる。
 */
function analyzeSnippet(code: string): boolean {
  return PAGE_GUARD_PATTERN.test(pageBodyBeforeSuspense(code));
}
```

現 155 行（`  });` = 「監査ログページは解消済み（回帰防止）」テストの閉じ）と現 156 行（`});` = describe の閉じ）の間に、テストを 1 本追加する:

```ts
test("guard 呼出が await されている形だけを compliant と判定する（見本）", () => {
  // 落ちてはいけない形 1: 素の await（audit-logs/page.tsx:70 の実際の形）
  expect(
    analyzeSnippet(
      `export default async function P() {
           await requireAdminListPage("auditLog");
           return <div />;
         }`,
    ),
  ).toBe(true);

  // 落ちてはいけない形 2: await Promise.all の要素
  // （staff/[id]/page.tsx:47-50 の実際の形。ここを落とすと既存ページが壊れる）
  expect(
    analyzeSnippet(
      `export default async function P() {
           const [currentUser, user] = await Promise.all([
             requireAdminDetailPage("user", id),
             getUser(id),
           ]);
           return <div />;
         }`,
    ),
  ).toBe(true);

  // 落ちるべき形 1: void（第6次監査 M-13 の変異。呼出は残るが認可は待たれない）
  expect(
    analyzeSnippet(
      `export default async function P() {
           void requireAdminListPage("auditLog");
           return <div />;
         }`,
    ),
  ).toBe(false);

  // 落ちるべき形 2: 素の呼び捨て
  expect(
    analyzeSnippet(
      `export default async function P() {
           requireAdminListPage("auditLog");
           return <div />;
         }`,
    ),
  ).toBe(false);

  // 落ちるべき形 3: Suspense 境界の内側でしか認可していない
  expect(
    analyzeSnippet(
      `export default async function P() {
           return (
             <Suspense fallback={null}>
               {await requireAdminListPage("auditLog")}
             </Suspense>
           );
         }`,
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: 落ちることを確認する**

実行:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space"
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
```

期待: FAIL。3 pass / 1 fail。`void` の見本のところで

```
error: expect(received).toBe(expected)

Expected: false
Received: true
```

（実測。現行の判定器で赤くなる assertion は **`void` と 呼び捨ての 2 つだけ**で、bun は最初の失敗（`void`）でこのテストを打ち切る。`await` と `Promise.all` の見本は現行の正規表現でも通る。**「Suspense 内側」の見本も現行判定で false になるので通る** — `pageBodyBeforeSuspense` が文字列 `"<Suspense"` で split して guard 呼出を切り落とすため。テスト単位の集計が「3 pass / 1 fail」になる。）

- [ ] **Step 3: 実装を直す**

**hunk 1 — 冒頭の import と docstring。** 現 1-4 行（import 群）を次に置き換える。docstring（現 6-39 行）の末尾、`## ratchet 運用` セクションの直前に「## 何を見るか」を差し込む。

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";
import {
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  canHaveModifiers,
  createSourceFile,
  forEachChild,
  getModifiers,
  isArrayLiteralExpression,
  isAwaitExpression,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  type CallExpression,
  type FunctionDeclaration,
  type Node,
} from "typescript";
```

docstring に足す節（`## ratchet 運用` の直前。**glob を書かない** — JSDoc 内の連続アスタリスク＋スラッシュはコメントを途中で終わらせる）:

```
 * ## 何を見るか（2026-08-15 に判定を AST へ移した）
 *
 * 旧版は `require(AdminListPage|...)\s*\(` の文字列一致だった。呼出が残ってさえ
 * いれば通るため、`await` を `void` に変えるだけで認可の Promise が待たれない
 * ページを緑で通していた（第6次監査 M-13 の変異検査で実証）。`void` は
 * `@typescript-eslint/no-floating-promises` の公式エスケープで、`require-await` は
 * eslint.config.mjs の Next.js 契約 exempt で page.tsx に対して off なので、
 * ESLint 側にも受け皿が無い。
 *
 * いまは TypeScript AST で次を見る:
 *
 * - default export の `export default async function` 本体の中にある
 * - `PAGE_GUARD_NAMES` の識別子呼出で
 * - 最初の `<Suspense>` より前の位置にあり
 * - かつ **await されている**（素の `await` / `await Promise.all([...])` の要素 /
 *   括弧で包んだ形を認める）
 *
 * ものが 1 つ以上あること。`void x()` / 呼び捨て / `.catch()` チェーンは落ちる。
 *
 * **見ないこと**: どの resource を要求しているか（引数は検査しない）。
 * 認可 helper が resource:action を正しく解決すること自体は page-auth.ts の
 * 呼び先 `requireAdminPermission` の担当。
```

**hunk 2 — 判定パターンの置き換え。** 現 43-45 行

```ts
/** ページ本体（default export）で認可を解決する helper 群 */
const PAGE_GUARD_PATTERN =
  /require(AdminDashboardPage|AdminListPage|AdminDetailPage|AdminSettingsPage|AdminPermission|AdminResourcePermission)\s*\(/u;
```

を次に置き換える（`const root = process.cwd();` = 現 41 行はそのまま）:

```ts
/** ページ本体（default export）で認可を解決する helper 群 */
const PAGE_GUARD_NAMES = new Set([
  "requireAdminDashboardPage",
  "requireAdminListPage",
  "requireAdminDetailPage",
  "requireAdminSettingsPage",
  "requireAdminPermission",
  "requireAdminResourcePermission",
]);

/** `await Promise.all([guard(), ...])` を await 済みとして認めるための combinator */
const PROMISE_COMBINATOR_NAMES = new Set(["all", "allSettled"]);
```

**hunk 3 — 判定本体。** 現 104-112 行の `pageBodyBeforeSuspense` を丸ごと削除し、代わりに次を置く（`listDashboardPages` = 現 114-119 行より前）:

```ts
/** `Promise.all(...)` / `Promise.allSettled(...)` の呼出か。 */
function isPromiseCombinatorCall(node: CallExpression): boolean {
  const callee = node.expression;
  return (
    isPropertyAccessExpression(callee) &&
    isIdentifier(callee.expression) &&
    callee.expression.text === "Promise" &&
    PROMISE_COMBINATOR_NAMES.has(callee.name.text)
  );
}

/**
 * その呼出が await されているか。
 *
 * 親を辿って `await` に到達すれば true。途中で通ってよいのは
 * 括弧 / 配列リテラル / `Promise.all` 系の引数だけで、それ以外
 * （`void` / `ExpressionStatement` / `.catch()` チェーン / `return`）は false。
 */
function isAwaited(call: CallExpression): boolean {
  let current: Node = call;
  let parent: Node | undefined = call.parent;

  while (parent !== undefined) {
    if (isAwaitExpression(parent)) return parent.expression === current;

    if (isParenthesizedExpression(parent) || isArrayLiteralExpression(parent)) {
      current = parent;
      parent = parent.parent;
      continue;
    }

    if (
      isCallExpression(parent) &&
      isPromiseCombinatorCall(parent) &&
      parent.arguments.some((arg) => arg === current)
    ) {
      current = parent;
      parent = parent.parent;
      continue;
    }

    return false;
  }

  return false;
}

/** `export default async function ...` の宣言（無ければ undefined）。 */
function defaultExportAsyncFunction(
  source: Node,
): FunctionDeclaration | undefined {
  let found: FunctionDeclaration | undefined;
  forEachChild(source, (node) => {
    if (found !== undefined) return;
    if (!isFunctionDeclaration(node) || node.body === undefined) return;
    if (!canHaveModifiers(node)) return;
    const modifiers = getModifiers(node) ?? [];
    const has = (kind: SyntaxKind): boolean =>
      modifiers.some((modifier) => modifier.kind === kind);
    if (
      has(SyntaxKind.ExportKeyword) &&
      has(SyntaxKind.DefaultKeyword) &&
      has(SyntaxKind.AsyncKeyword)
    ) {
      found = node;
    }
  });
  return found;
}

/** 本体内で最初に現れる `<Suspense>` の開始位置（無ければ +Infinity）。 */
function firstSuspenseStart(fn: FunctionDeclaration): number {
  let earliest = Number.POSITIVE_INFINITY;
  const walk = (node: Node): void => {
    if (
      (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) &&
      isIdentifier(node.tagName) &&
      node.tagName.text === "Suspense"
    ) {
      earliest = Math.min(earliest, node.getStart());
    }
    forEachChild(node, walk);
  };
  walk(fn);
  return earliest;
}

/**
 * default export 本体の、最初の `<Suspense>` より前の位置に
 * **await された** 認可 helper 呼出が 1 つ以上あるか。
 */
function hasAwaitedPageGuard(text: string): boolean {
  const source = createSourceFile(
    "page.tsx",
    text,
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  );

  const fn = defaultExportAsyncFunction(source);
  const body = fn?.body;
  if (fn === undefined || body === undefined) return false;

  const suspenseStart = firstSuspenseStart(fn);
  let guarded = false;
  const walk = (node: Node): void => {
    if (guarded) return;
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      PAGE_GUARD_NAMES.has(node.expression.text) &&
      node.getStart() < suspenseStart &&
      isAwaited(node)
    ) {
      guarded = true;
      return;
    }
    forEachChild(node, walk);
  };
  walk(body);

  return guarded;
}
```

**hunk 4 — 呼び元 2 箇所。** 現 121-126 行の `findViolations` の判定式を差し替える:

```ts
function findViolations(): string[] {
  return listDashboardPages().filter((rel) => {
    const source = readFileSync(join(root, ...rel.split("/")), "utf8");
    return !hasAwaitedPageGuard(source);
  });
}
```

Step 1 で足した `analyzeSnippet` の中身を差し替える:

```ts
function analyzeSnippet(code: string): boolean {
  return hasAwaitedPageGuard(code);
}
```

**hunk 5 — describe 名。** 現 128 行

```ts
describe("admin ページの認可は Suspense 境界より前で解決する", () => {
```

を

```ts
describe("admin ページの認可は Suspense 境界より前で await して解決する", () => {
```

に変える。**`PAGE_AUTH_AFTER_SUSPENSE_ALLOWLIST`（50-102 行）と既存 3 テスト（129-155 行）の中身は触らない。**

- [ ] **Step 4: 通ることを確認する**

実行:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space"
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
```

期待: PASS（4 pass / 0 fail / 10 expect）。実測で約 130ms → 約 500ms になる（AST parse のぶん。環境差あり）。

**受入条件（必ずここで実測する）: `await` を `void` に変えると赤くなる。**

以下は **Git Bash（Bash tool）専用**。PowerShell には `perl` が無いので動かない。`.gitattributes` が `*.tsx text eol=lf` を強制しており、Git Bash の `/usr/bin/perl` は 70 行目だけを書き換えて LF を保つ（実測確認済み）。

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space"
cp "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx" /tmp/audit-logs-page.bak
perl -pi -e 's/await requireAdminListPage\("auditLog"\);/void requireAdminListPage("auditLog");/' "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx"
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
cp /tmp/audit-logs-page.bak "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx"
git status --porcelain "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx"
```

期待: 変異中は 2 pass / 2 fail。落ちるのは「allowlist 外の新規違反が無い」（`unexpected` に `audit-logs/page.tsx` が出る）と「監査ログページは解消済み（回帰防止）」の 2 本。「allowlist に解消済み entry が残っていない（ratchet）」は violations が増える方向なので通ったままになる。最後の `git status --porcelain` は**何も出力しない**（復元済み）こと。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

実行:

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space"
bunx prettier --check __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture
bun run validate
```

期待: 3 つとも PASS。

- architecture ディレクトリは pre-push が渡す入口そのもの（実測 gate 190 本、190 passed / 0 failed）。
- `bun run validate` に含まれる `type-check` は `tsconfig.test.json`（`include: ["__tests__/**/*.ts", ...]`）でテスト木も型検査するので、AST ヘルパーの型崩れはここで出る。実測で候補実装は `tsc --noEmit -p tsconfig.test.json` exit 0。
- **prettier を別に叩く理由**: `bun run validate` は type-check + lint だけ（`scripts/validate.ts:34-35`）で、CI の Lint & Format が走らせる `format:check` を含まない（`scripts/lint-format.ts:26-29` が `format:check` + `lint`）。上のコードは prettier 準拠であることを実測済みだが、編集中に崩すと Step 5 が全緑のまま CI だけ赤くなる。`bun run format` を引数なしで叩かないこと（リポジトリ全体を書き換える）。
- 判定を AST に移しても **compliant と判定されるページは 20 件のまま変わらない**（実測: 走査母数 71 件、旧判定と新判定の集合差は両方向とも 0）。allowlist の増減は起きないので、「allowlist に解消済み entry が残っていない（ratchet）」も緑のまま。

- [ ] **Step 6: commit**

```bash
cd "G:/workspace/work/website/customer/myrrh-rental-space"
git switch -c fix/admin-page-auth-gate-await
git add __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
git commit -m "test(architecture): 管理ページ認可 gate を await 判定の AST へ移す [ai-gen]"
```

---

**PR 分割について:** このタスクが触るのは `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts` **1 ファイルだけ**。第6次監査で「既存 gate の判定強化」に当たる他の項目（M-15 / M-16 は `cross-surface-import-gate.test.ts` と `prisma-import-boundary.test.ts`、M-17 は `admin-terms-event-rbac-boundaries.test.ts`）はいずれもこのファイルを触らない。**Task 11 の diff にこのパスが literally 含まれる場合のみ 1 PR にまとめ、それ以外は別 PR にする。**

**「降格」（M-18）を同時に見ない理由:** compliant な 20 ページのうち `Resource` リテラルを渡しているのは 4 件だけ（`audit-logs`→`"auditLog"`、`coupons/new`→`"coupon"`、`staff`→`"user"`、`staff/[id]`→`"user"`）。残り 16 件は `requireAdminDashboardPage()` 7 件と `requireAdminSettingsPage()` 9 件で、そもそも `Resource` を取らない（全件 grep で確認済み）。resource を検査するには「ページパス → 期待 resource」の対応表を gate 側に手書きするしかなく、それは page.tsx が既に持っている値の写しで、写しが正しいことを誰も証明しない。`.claude/rules/architecture-gates.md` の「免除の入口を増やさない」（入口が 2 つあると必ず見えないほうが使われる）と「手法の限界を認める」に真正面から反する。対して await 不変条件は表を一切必要としない。1 PR = 1 論理変更として、M-18 は別タスクに残す。
---

## 付録: 監査の記述と現物のずれ

起案・検証の過程で見つかった、**監査報告書の記述が現行コードと食い違っていた点**。
第 7 次以降で同じ仮説を再検討するときの材料として残す。

#### Task 9 — checkPermission / hasPermission の実装が unit tree で一度も実行されない

監査の主張の**機序と行番号は M-11 / M-12 とも正しい**（棄却しない）。ただし 3 点ずれがある。

1. **`checkPermission` の呼出元は 24 箇所ではなく 29 箇所。** `grep -rn "await checkPermission(" src` = **29**。加えて `checkResourceAccess` 経由が 3 箇所（`src/app/(admin)/admin/api/page-sections/route.ts:21`、`_shared/lib/editor-comment-auth.ts:44` と `:100`）あり、これらも内部で `checkPermission` を呼ぶ（`action-auth.ts:115`）ので実質 32 経路。監査は過小申告。

2. **`page-auth.ts` の置き場が違う。** 監査は文脈上 `action-auth.ts` と同じ `_shared/lib/` を示唆していたが、実際は `src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts`（alias は `@/admin/helpers/page-auth`）。**行番号 55 は正しい**（`return requireAdminPermission("settings", action);`）。

3. **「unit tree で 1 度も実行されない」は控えめで、integration tree でも実行されていない。** `__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts:52-55` が `mock.module("@/admin/lib/action-auth", () => ({ checkAdminAuth, logAction }))` で module ごと差し替えており、`checkPermission` は供給すらされていない。この integration テストが実物で通しているのは `executeAdminMutationResult` 側の RBAC、すなわち `_shared/lib/admin-action.ts:95` の `hasPermission` 直呼びであって、`checkPermission` とは**別の判定サイト**。したがって M-11 の変異はリポジトリ全体のどのテストでも検出されない。

（付随して気づいた点。今回の修正範囲外なので直さない）
`__tests__/unit/queries/admin-query-helpers.test.ts:25-34` の session mock は、実際には存在しない export（`isValidRole` / `adminAuth` / `DASHBOARD_ROLES`）を並べている。`src/shared/domain/admin-auth/session.ts` の runtime export は `getAdminSessionUser` / `getCurrentAdminUser` / `verifyAdminSession` / `isAdmin` / `getAdminSession` の 5 本のみ。余分な key は無害だが、実物と乖離した手書き列挙が残っている。

#### Task 10 — surface 越境と Prisma import の gate が相対パス表記を素通りさせる

監査の機序は正しい。訂正は行番号と表現の 2 点。

1. **行番号のずれ（軽微）:** 監査は `src/app/(public)/_shared/lib/format-event-date.ts:11` に相対越境を仕込んだと書いているが、現行ファイルの `:11-18` は `@/shared/lib/date-format` からの複数行 import 文で、`:11` はその開始行。変異の投入位置としては妥当だが、「`:11` に問題がある」と読める書き方は誤り。**このファイル自体に欠陥は無い**（`:11` と `:19` の import はどちらも `@/shared/*` で、越境していない）。実測でも `src/app/(public)` 422 ファイルに cross-surface 越境は 0 件。

2. **「6 つの判定」は数え方が不正確:** `prisma-import-boundary.test.ts` で specifier 文字列に依存している判定は 6 つではなく 10 箇所（`:50` 母集合 / `:72-75` generated / `:94` domain enums / `:120-130` gateway / `:170` legacy shim / `:183-184` public app / `:199-200` app models・client / `:213-214` 外部直 import / `:229` barrel / `:248` placement）。うち相対綴りで実際に穴が開くのは `@/shared/db/prisma` を見る 4 箇所（`:50` / `:183` / `:213` / `:248`）で、Task 10 はそこを直す。残り 6 箇所を直さない理由は Step 3 に明記した。

3. **監査が拾えていなかった補強材料:** `:55-58` の seed 配列に `better-auth-adapter.ts` がハードコードされているのは、まさにこの相対 import の盲点を手で埋めた跡。実測で「旧 regex が取りこぼす唯一のファイル」と一致した。この 1 行を消すことが、Task 10 の RED を実物の欠陥形（記憶: gate は元の欠陥の形を含めること）で作れる根拠になる。

4. **「gate の JSDoc が旧欠陥の経緯を書いている」は正しい:** `cross-surface-import-gate.test.ts:25-38` の JSDoc が監査 F-12 の 2 形を明記している。3 通り目が残っていたという指摘どおり。

#### Task 11 — RBAC gate が「ファイル全体の出現回数 == export 数」で判定し、guard がどの関数に付いているかを見ない

**指摘は成立する（棄却しない）。機序は実測で再現できた。** ただし監査の記述に事実誤りが 1 つある。

1. **関数名と行番号が入れ替わっている。** 監査は「`terms.ts:20` の `getAdminAgreements` から guard を削除し、`:53` の `getAdminTermsList` に重複追加」と書いているが、現物は逆:
   - `terms.ts:19` が `export async function getAdminTermsList(...)`、その guard が `:20`。
   - `terms.ts:46` が `export async function getAdminAgreements(...)`、その guard は `:52`（`:53` は `return getAdminAgreementsQuery(filter);` で guard ではない）。
     つまり監査が実際に行った変異は「`:52`（`getAdminAgreements`）の guard を削除し、`:20`（`getAdminTermsList`）に重複追加」である。**変異の向きは結論に影響しない**（どちらの向きでも総数は 6 のまま）。実測で `old: GREEN / new: RED` を確認済み。

2. **gate の行番号は正しい。** `65-76`（terms）と `78-89`（event）は現行ファイルと一致。

3. **監査が触れていない、同じ根から出る 2 つ目の穴（今回の修正で同時に塞がる）。** 旧判定の export 側の数え方は `/^export async function (\w+)/gmu` なので、`export const foo = async () => {...}` 形は **export として数えられない**。この形で guard 無しの export を足すと、分母も分子も増えないため総数照合は緑のまま通る。AST 判定は `exportedAsyncArrowDeclarations` で arrow 形を拾うため塞がる（fixture で実測: `arrow-unguarded` → `[{"functionName":"getA"}]`）。

4. **「同じ helper が再利用できるか」への回答: 再利用できない。** `assert-customer-active-server-actions.test.ts` の AST ヘルパー群は file-local で export されておらず、リポジトリ内に他の定義も無い。共有モジュールへ切り出す案は採らない — CLAUDE.md「抽象化は 3 回目の重複から。2 回目まではコピーのままでよい」に従い、今回は 2 回目なので gate ファイル内に写す。（切り出すと 2 つの gate が 1 つの helper を共有し、片方の都合で他方の判定が変わる経路ができる。）

5. **関数単位の所属判定に使うもの（明示）:** 行番号や正規表現の位置ではなく、**AST の関数ノードの body 部分木**（`FunctionDeclaration.body` / arrow の `initializer.body`）を `forEachChild` で歩き、その中に `requireAdminPermission` の `CallExpression` があるかを見る。順序（guard が先頭にあるか）は見ない — 静的 source gate は順序を見られないという既知の限界で、docstring に「証明しない」として明記する。

#### Task 12 — 管理ページ認可 gate が文字列一致で、await を void に変えると素通りする

**監査の記述に誤りは無い。行番号もそのまま使える。** 補足・精密化が 4 点。

1. 「`__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts` **ほか**が全部緑のまま」の「ほか」を具体化した。実測で緑のままだったのは同 gate（3/3）に加え `auth-gate-ssot.test.ts` と `admin-settings-permissions.test.ts`（合計 2/2）、さらに `bun run lint:files` が exit 0。`auth-gate-ssot.test.ts` は import 元だけを見る gate なので原理的に `await` に無関心（`:31-32` の `ADMIN_LEGACY_PAGE_AUTH_IMPORT`）で、これは「たまたま」ではなく設計上の当然。

2. 監査は書いていないが、**`void` 変異が `require-await` にも捕まらない**理由が別途ある。`AuditLogsPage`（`page.tsx:60-100`）の `await` は 70 行の 1 本だけなので、`void` 化すると本体から `await` が消える。それでも赤くならないのは `eslint.config.mjs:212-227` が `**/page.tsx` に対して `require-again`… 正しくは `@typescript-eslint/require-await` を off にしているため。**この exempt が無ければ `require-await` が変異を捕まえていた**ので、「ESLint に受け皿が無い」の根拠は `no-floating-promises` の `ignoreVoid` だけではなく、この 2 つの合わせ技である。計画の「なぜ」に両方を書いた。

3. **修正方針に対する訂正**（監査の指摘ではなく、素朴な実装への警告）。「await されているか」を「呼出の親が `AwaitExpression`」で判定すると、既存の `src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx:47-50`（`await Promise.all([requireAdminDetailPage("user", id), getUser(id)])`）が偽陽性で落ち、allowlist に 1 件戻すことになる。親を辿って括弧 / 配列リテラル / `Promise.all` 系引数を通過させる実装が必須。実測で確認済み。

4. 監査は M-13 と M-18 を別項目にしているが、**M-18（`("auditLog")` → `("page")` 降格）は本タスクでは直さない。** 理由は taskMarkdown 末尾に書いた（compliant 20 件中 `Resource` を渡すのは 4 件だけで、検査には page.tsx の値を写した対応表が要る = SSoT の二重管理）。M-18 は独立タスクとして残すべきで、「Task 12 で一緒に閉じた」と記録しないこと。

**Task 11 との PR 統合可否について（判断できなかった点を明示する）:** 本セッションからは Task 11 の内容が読めない。リポジトリの `docs/audits/` は `2026-08-15-codebase-audit-closeout.md` までで、第6次監査の計画書は HEAD に存在しない。したがって「同じ gate ファイル群か」を Task 11 側の現物で確認することはできなかった。代わりに**判定基準を機械的に書いた**: 本タスクの diff は `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts` の 1 ファイルのみで、他のどの gate もこのファイルを共有しない（`auth-gate-ssot.test.ts` / `admin-settings-permissions.test.ts` / `admin-terms-event-rbac-boundaries.test.ts` / `cross-surface-import-gate.test.ts` / `prisma-import-boundary.test.ts` を確認）。Task 11 の diff にこのパスが含まれない限り**別 PR**。

## 付録: この修正で壊れうるもの

#### Task 9 — checkPermission / hasPermission の実装が unit tree で一度も実行されない

1. **`admin-query-helpers.test.ts` が `ROLE_PERMISSIONS` の実データに結合する。** mock 撤去後、既存 3 本＋新規 1 本は `src/shared/lib/admin-permissions.ts` の権限表に依存する。将来 VIEWER に `settings:manage` や `auditLog:read` を付けると、このテストが落ちる。これは**望ましい signal**（権限拡大が無言で通らない）だが、権限表を触る人は理由を知らずに驚く。新規テストの題名に `settings:read を通り settings:manage で拒否される` と条件を書いてあるので、落ちたときに何を主張していたかは読める。

2. **`action-auth.test.ts` の module graph が伸びる。** 追加するのは `import type { AdminSession }`（型のみ・消える）と `import { ADMIN_USER, VIEWER_USER } from "../../../fixtures/users"`（`@generated/prisma/enums` を引く）と `await import("@/shared/domain/admin-auth/session")`。後者は**変更前から transitive に読み込まれていた**ので新規ロードは増えないが、記憶にある「import 1 本で部分 mock が壊れる（`Export named 'X' not found`）」の罠に該当しうる。実測では両ファイルとも緑（7 pass / 4 pass）だが、Step 5 の `bun run test:unit` 全件を省略しないこと。

3. **`mock.module` の完全置換。** session module を spread せずに `getAdminSession` だけ返すと、`getAdminSessionUser`（`checkAdminAuth` が同じ module から引く）が消えて `undefined is not a function` になる。計画の `...actualSession` は必須で、簡略化してはいけない。

4. **`mockGetAdminSession.mockReset()` は実装ごと消す。** `beforeEach` の後は resolved value が undefined になるため、各 test が呼ぶ前に `mockResolvedValue` を必ず設定する必要がある。計画のテストはその形になっている。

5. **Step 2 の変異を戻し忘れると本番の認可が丸ごと消える。** M-11 の変異は `checkPermission` を無条件 success にするもので、そのまま merge すると VIEWER が全 PII CSV を取得できる。Step 2 に `git diff --stat -- src` が空であることの確認を入れてある。`git checkout` ではなく `cp` で退避・復元する（記憶: checkout は未コミットの書き換えを消す）。

6. **既存の振る舞いは一切変えない。** src の変更が 0 なので、実行時の挙動へのリグレッションリスクは無い。壊れうるのは他の unit テストの読み込みだけ。

#### Task 10 — surface 越境と Prisma import の gate が相対パス表記を素通りさせる

- **`importsForbiddenAlias` の改名 + シグネチャ変更（2 引数 → 3 引数）。** main 上の参照は当該ファイル内のみ（実測）なので他は壊れない。`.worktrees/fix-audit-leftovers/` に旧版コピーがあるが別 checkout で、そちらの branch を main へマージする際に衝突しうる。`docs/audits/2026-08-12-codebase-audit-findings.md:638` が旧実装の行番号と関数名を引用しているが、これは監査記録なので追随不要。

- **判定強化で現行コードが赤くなる可能性 → 実測でゼロ。** cross-surface 越境 0 件、prisma facade importer 217 件すべてが `src/shared/` 配下かつ `import "server-only"` あり。placement gate の対象（`src/shared/` の domain・db 以外）に prisma importer は 0 件。強化後も全部緑。

- **走査コストの増加。** prisma gate が 2304 ファイルに対し解決ベース判定を 4 パス走らせる（母集合 / public app / 外部 / placement）。現在 1.5 秒、probe の実測ペースからおよそ 3〜4 秒になる見込み。runner の 30 秒 timeout には十分収まるが、明らかに遅くなったら `collectSourceFiles` の結果と読み込み済みソースを describe スコープで一度だけ持つ形に寄せる。

- **`toRelPosix` は Windows の `\` を `/` に正規化する。** これを忘れると `resolveModuleSpecifier` の `split("/")` が壊れて全 specifier が誤解決し、gate が静かに空振りする（＝緑になる）。fixture test はこの失敗を検出できない（fixture は文字列を直接渡すため）。母集合の `expect(files.length).toBeGreaterThan(10)`（`:270`）と、新 fixture の `expect(files).toContain("src/shared/db/better-auth-adapter.ts")` が実ファイル経由なのでここを守る。

- **`resolveModuleSpecifier` は拡張子付き specifier（`"./prisma.ts"`）を別パスとして返す。** 現在そう書いているファイルは無く、旧実装も同じ限界を持っていたので退行ではないが、限界であることは helper の JSDoc に書く。

- **`@generated/prisma` 系の穴は残る。** `resolveModuleSpecifier` が `@generated/` を external として捨てる設計のため、`../../../generated/prisma/client` のような相対綴りは今回も検出できない。helper を変えると `module-reachability.test.ts` のグラフが変わるので別タスクに切る（監査へ残件として報告）。

#### Task 11 — RBAC gate が「ファイル全体の出現回数 == export 数」で判定し、guard がどの関数に付いているかを見ない

- **偽赤のリスクは現時点でゼロ。** `terms.ts` / `event.ts` の全 export（6 件 / 10 件）は AST 判定でも unguarded 0 件（実測済み）。導入直後に緑のままであることを確認済み。
- **今後 `_shared/queries/{terms,event}.ts` に guard 不要の export を足すと赤になる。** 例えば純粋な整形ヘルパーを `export async function` で置くと落ちる。これは意図した ratchet だが、書く人が理由を知らないと gate を消しにかかるため、docstring に「直し方＝その関数本体で `requireAdminPermission` を呼ぶ / そもそもこのファイルに置かない」を残すこと（Step 3-3 に含めた）。
- **下限アサーションが export 数の減少で落ちる。** `toBeGreaterThan(5)` / `toBeGreaterThan(9)` は現状の 6 / 10 に対する下限。query を正当に削除すると赤くなる。空振り防止のため必要（`.claude/rules/architecture-gates.md`）で、落ちたら削除が正当かを判断して数値を下げる。
- **別名 import には効かない。** `import { requireAdminPermission as guard }` と書かれると識別子名が一致せず全 export が unguarded 判定になる（偽赤）。現状 `terms.ts:17` / `event.ts:21` は別名なしの直 import なので今は起きない。docstring に限界として記載する。
- **guard 呼出の位置・到達可能性は見ない。** 関数本体のどこか（実行されない closure の中でも）に呼出があれば緑になる。見本にした `assert-customer-active-server-actions.test.ts:36-37` と同じ限界で、docstring に明記する。
- **既存の 2 本のテスト名を変えるため、名指ししている散文があれば壊れる** — grep 済みで、この gate のテスト名を名指ししている箇所は無い（`referenced-gates-exist.test.ts` が強制するのは**ファイル名**で、ファイル名は変えない）。
- Step 5-1 で一時的に `terms.ts` を編集するため、他の未コミット変更があると `git restore` で巻き添えになる。手順内で `git status --short` による事前確認を必須にした。
- 実行時間: gate 1 本あたり ~90ms（実測）。AST 化で解析対象は 2 ファイルのみなので体感差は出ない。

#### Task 12 — 管理ページ認可 gate が文字列一致で、await を void に変えると素通りする

1. **compliant 判定の変化による allowlist churn — 無い（実測）。** 旧判定と新判定で compliant な 20 件は完全一致（集合差 0 / 0）。したがって「allowlist 外の新規違反が無い」も「allowlist に解消済み entry が残っていない（ratchet）」も緑のまま。allowlist は 1 行も触らない。

2. **意図的な挙動変更が 2 つある。** (a) `return requireAdminListPage(...)`（page 本体から認可 Promise をそのまま返す）は新判定で違反になる。現在そう書いているページは 0 件。(b) `requireAdmin*Page(...).catch(...)` も違反になる。同じく現在 0 件。どちらも「認可が待たれない」形なので落ちるのが正しいが、旧判定は通していたので**挙動変更である**ことを PR 本文に書くこと。

3. **`Promise.all` 以外の待ち方は未対応。** 認めるのは `await` 直下 / 括弧 / 配列リテラル / `Promise.all` / `Promise.allSettled` の引数のみ。将来 `Promise.race` や自作の `settleAll(...)` で包む書き方が出たら偽陽性で落ちる。落ちる側（安全側）に倒れるので握りつぶしにはならないが、その時は `PROMISE_COMBINATOR_NAMES` を広げるのではなく、まずそのページの書き方を直すか判断する。

4. **実行時間が 145ms → 約 560ms（実測、+0.4 秒）。** pre-push は `__tests__/unit/architecture` を 190 本まとめて走らせるので体感差は出ない。`bun scripts/run-tests.ts __tests__/unit/architecture` 全体で確認すること。

5. **JSDoc の早期終了。** docstring に glob（`**` の直後に `/` が来る形）を書くとブロックコメントがそこで終わり、100 行以上先で意味不明な構文エラーになる。計画の docstring はそれを避けて「(dashboard) 配下の page.tsx」と書いてある。書き換えるときも glob を持ち込まないこと。

6. **`__tests__` は ESLint 対象外だが型検査の対象。** `tsconfig.json` は `exclude: ["__tests__"]` だが `tsconfig.test.json` が `include: ["__tests__/**/*.ts", ...]` で拾い、`bun run type-check` が `tsc -p tsconfig.test.json` を並列で回す。`as any` / `@ts-ignore` を使わずに書けることは実測済み（`tsc --noEmit -p tsconfig.test.json` exit 0）。

7. **Step 4 の受入条件は tracked ファイルを一時的に書き換える。** 必ずバックアップからの復元と `git status --porcelain` の空出力までを 1 セットで行うこと。並行セッションがある環境では `git checkout --` ではなくファイルコピーで戻すほうが安全。

8. **本タスクは M-18（resource 降格）を塞がない。** 修正後も `requireAdminListPage("auditLog")` → `("page")` は全 gate を素通りする（`"page"` は `Resource` の正当な値なので型検査も通る）。これは既知の残穴として計画に残すこと。
