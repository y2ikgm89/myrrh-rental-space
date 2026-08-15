# 管理ページの権限リテラル撤去 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理ページから `Resource` / `Action` のリテラルを消し、「どのページがどの権限を要求するか」の記述を `page-auth.ts` 1 箇所に集約したうえで、その記述を**実行するテスト**で固定する。

**Architecture:** ページが権限を文字列引数で渡す形（`requireAdminListPage("auditLog")` / `requireAdminSettingsPage("manage")`）をやめ、権限を関数名に埋めた guard（`requireAuditLogListPage()` / `requireSettingsManagePage()`）へ置き換える。権限の実体は `page-auth.ts` の実装 1 箇所だけが持ち、その実装を実 `hasPermission` で実行する behavioral test が resource:action を固定する。gate の guard 名ハードコードは `page-auth.ts` の export からの導出に置き換える。新しい gate は追加しない。

**Tech Stack:** Next.js 16.3.1 (App Router, `APP_SURFACE` で public / admin の 2 サービス) / React 19 / TypeScript / Prisma 7 / Bun / bun:test / TypeScript Compiler API（gate の AST 判定）

## Global Constraints

これは全タスクに暗黙で適用される。タスクごとに再掲しない。

- **1 PR = 1 論理変更。** 各 Task が 1 PR。目安 300 行 / 10 ファイル。
- **1 つの振る舞いにつきテストは 1 本。** 網羅は既存 gate と CI の仕事。テストを盛らない。
- **新しい gate を足さない。** 既存 gate の判定強化と behavioral test のみ。
- **型のエスケープハッチ（`as any` / `@ts-ignore`）を足さない。**
- **緑を偽装しない。** `skip` / assertion の弱め / allowlist 追記 / `--no-verify` / `LEFTHOOK=0` / 素の `bun test` はいずれも禁止（hook が deny する）。
- **成功を主張せず、証拠を出す。** 走らせたコマンドとその出力を示す。見ていないなら「未検証」と書く。
- 単一ファイルのテストは `bun run test -- <path>`。`bun run test:unit -- <file>` では**絞れない**（引数は追記されるだけ）。
- `git push` は lefthook pre-push（type-check + architecture gate 全件）で 80〜110 秒。**tool timeout は 300 秒以上。**
- `bun run format` は引数なしだとリポジトリ全体を書き換える。**触ったファイルだけ渡す。**
- commit message は conventional commits + 末尾 `[ai-gen]`。PowerShell では `git commit -m @"..."@`（HEREDOC は使わない）。
- 変異の投入・復元は PowerShell `Copy-Item` で行い、復元後に `git status --porcelain -- <file>` が空であることを確認する。
- dev サーバーは人間が所有する。頼まれない限り起動も停止もしない。

---

## 着手前の前提条件（**必ず先に解消する**）

1. **main checkout の作業ツリーが dirty。** `__tests__/unit/queries/admin-query-helpers.test.ts` /
   `__tests__/unit/admin/lib/action-auth.test.ts` /
   `__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts` に
   `docs/superpowers/plans/2026-08-16-admin-resource-access-ssot.md` の**未 commit の実装途中**がある
   （`git diff --stat -- __tests__` で 3 ファイル +142 / -27）。
   本プランは同じ領域を触るので、**先にその作業を commit / PR まで確定させる**。
2. **resource-access SSoT の PR を先に merge する。** それが `_shared/queries/_helpers.ts` /
   `_shared/lib/action-auth.ts` / `_shared/lib/admin-action.ts` を触る。本プランの Task 4 は
   同じ 3 ファイルを触るため、順序を逆にすると衝突する。Task 1〜3 は別ファイルなので順序自由。
3. `.claude/settings.json` ほか `.claude/**` の未 commit 変更は本プランと無関係。混ぜない。

---

## 調査で確定した事実（2026-08-16 に現物で確認）

計画の全判断がこの表に依存する。着手時にずれていたら訂正して進める。

### F1. DAL は既に存在し、権限強制の本体である

`requireAdminPermission` / `requireAdminResourcePermission` / `requireAdminDashboardAccess` の
呼出は **src 内 118 箇所**（`_helpers.ts` と `page-auth.ts` を除く）。ほぼ全てが
`_shared/queries/*.ts` の data loader 冒頭にある。例:
`queries/audit-log.ts:41`（`getAuditLogs`）、`queries/user.ts:22`（`getUsers`）、
`queries/settings.ts:40`（`getSettings`）。

Next.js 16.3.1 同梱 docs `node_modules/next/dist/docs/01-app/02-guides/authentication.md` の
Authorization 節（:1018-1022, :1119, :1354-1358）が推奨するのはこの形
（Data Access Layer に認可を集約し、データ源のできるだけ近くで確認する）。**この repo は既に公式推奨の構成にある。**

### F2. ページが権限リテラルを書いているのは 16 箇所

page guard の呼出は全 27 箇所。内訳:

| helper                                 | 箇所 | ページがリテラルを書くか               |
| -------------------------------------- | ---- | -------------------------------------- |
| `requireAdminDashboardPage()`          | 11   | 書かない（引数なし）                   |
| `requireAdminListPage(resource)`       | 3    | **`Resource` を書く**                  |
| `requireAdminDetailPage(resource, id)` | 1    | **`Resource` を書く**                  |
| `requireAdminSettingsPage(action?)`    | 12   | **`Action` を書く**（明示 5 / 既定 7） |

`Resource` を書く 4 箇所:
`audit-logs/page.tsx:70`（`"auditLog"`）/ `coupons/new/page.tsx:12`（`"coupon"`）/
`staff/page.tsx:84`（`"user"`）/ `staff/[id]/page.tsx:48`（`"user"`, `id`）。

### F3. うち 3 ページは DAL が同じ権限を二重に要求している

| ページ                   | ページ側                   | DAL 側                                                                                                             | 降格変異の実害                                                          |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `audit-logs/page.tsx:70` | `auditLog:read`            | `getAuditLogs` / `getAuditLogStats` / `getAuditLogResources` が `auditLog:read`（`queries/audit-log.ts:41,52,57`） | **なし。** DAL が再度拒否する。変わるのは拒否位置（Suspense 前→後）だけ |
| `staff/page.tsx:84`      | `user:read`                | `getUsers` が `user:read`（`queries/user.ts:22`）                                                                  | **なし**                                                                |
| `staff/[id]/page.tsx:48` | `user:read` + editor scope | `getUser` が `user:read`（`queries/user.ts:27`）                                                                   | **なし**                                                                |

`staff/[id]` の editor scope（第 2 引数 `id`）は**到達不能**。`userHasResourceAccess` は EDITOR に
しか効かないが、EDITOR の権限は `page:read` / `page:update` / `media:*` / `blockTemplate:read` のみで
`user:read` を持たない（`admin-permissions.ts:250-257`）ため、`requireAdminPermission("user","read")` の
時点で拒否される。**本プランでは振る舞いを変えないため呼び先はそのまま維持する。**

### F4. `coupons/new` はデータ取得ゼロ、かつ要求 action が誤っている

`coupons/new/page.tsx` は `CouponForm` を描画するだけで DAL を 1 つも呼ばない（全文確認済み）。
よってページ側が唯一の防御。しかも**新規作成ページなのに `coupon:read` を要求している**。

ただし `coupon:*` を持つのは SUPER_ADMIN（`admin-permissions.ts:118-122`）と
ADMIN（`:225-229`）だけで、両者とも `create` と `read` を両方持つ。よって
**`read` → `create` への是正で実効的な権限変化は起きない**（現在到達できる役割の集合が変わらない）。

### F5. settings の `"manage"` 4 ページはページ側が唯一の防御

`settings/billing/page.tsx:180` / `features/page.tsx:36` / `integrations/page.tsx:183` /
`system/page.tsx:81` が `requireAdminSettingsPage("manage")`。
一方これらが読むデータは**全て `settings:read`**:

| ページ       | 読むもの                                                                                                                                                                                       | DAL の要求                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| billing      | `getSettings` / `getDiscountSettings` / `getTaxSettings` / `getRefundPolicySettings` / `getStripeEnvSecretOverrideActive`                                                                      | 全て `settings:read`（`queries/settings.ts:40,53,58,63,68`） |
| features     | `getSettings` / `getDataRetentionSettings`                                                                                                                                                     | `settings:read`（`:40,83`）                                  |
| integrations | `getResendConfig` / `getTurnstileConfig` / `getSwitchBotConfig` / `getGoogleMapsConfig`（`queries/api-keys.ts:25,30,35,40`）/ `getInstagramConfig`（`queries/instagram.ts:17`）/ `getSettings` | 全て `settings:read`                                         |
| system       | `getSettings` **のみ**                                                                                                                                                                         | `settings:read`                                              |

VIEWER は `settings:read` を持つ（`admin-permissions.ts:271`）。したがって
`("manage")` を落とすと VIEWER がこれらのページを開けるようになる。**ここだけが本物の実害。**

**DAL へ manage を寄せられるか**: 部分的にしか寄せられない。
`getSettings` は read レベルの他ページ（appearance / business / notifications / site など）と共有、
`getTaxSettings` は `spaces/new/page.tsx:29` と `spaces/[id]/edit/page.tsx:53` と共有。
とくに **system ページが読むのは `getSettings` だけ**なので、DAL 側の権限では manage 要求を表現できない。
→ **「このページは管理コンソールなので manage が要る」は、いかなる DAL にも表現できないページ固有の方針。**
この 1 点により「ページ→権限」の第二の記述は原理的に消せない。消せるのは**その記述の形**だけ。

### F6. その表は既に存在する（M-18 却下理由との不整合）

`__tests__/unit/architecture/admin-settings-permissions.test.ts:25-38` が、まさに
「ページ → 要求権限」の手書き表を持っている:

```ts
const manageOnlyPages = [
  ["settings", "features", "page.tsx"],
  ["settings", "billing", "page.tsx"],
  ["settings", "integrations", "page.tsx"],
  ["settings", "system", "page.tsx"],
];
for (const pagePath of manageOnlyPages) {
  const source = readAdminFile(...pagePath);
  expect(source).toContain('requireAdminSettingsPage("manage")');
  expect(source).toContain("@/admin/helpers/page-auth");
}
```

M-18 を「対応表の二重管理が必要で gate の原則に反する」として却下した判断は、**同じ表が既に
settings 側に存在することを見落としている**。現状は「表を作らない」方針ではなく「表が settings に
だけある」状態。

### F7. gate 3 本が helper 名に依存している

| gate                                            | 依存の形                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin-page-auth-before-suspense.test.ts:88-95` | `PAGE_GUARD_NAMES` に 6 名をハードコード（うち `requireAdminPermission` / `requireAdminResourcePermission` は `page-auth.ts` の export ではない）            |
| `admin-settings-permissions.test.ts:35,43-46`   | `'requireAdminSettingsPage("manage")'` / `'const currentUser = await requireAdminSettingsPage("read");'` の文字列一致                                        |
| `auth-gate-ssot.test.ts:31-32,110-125`          | **`@/admin/queries/_helpers` からの** 直 import を page / layout / `_components` に禁止（allowlist は空、現状違反 0）。`page-auth.ts` の実在も要求（:84-92） |

`auth-gate-ssot.test.ts` の regex は import 元が `@/admin/queries/_helpers` のときだけ発火するので、
**新しい guard を `page-auth.ts` に置く限りこの gate は変更不要**。

### F8. page / layout / `_components` から `_helpers` を直に呼んでいるファイルは 0

`grep -rn "requireAdminPermission\|requireAdminResourcePermission\|requireAdminDashboardAccess"`
を `(dashboard)` 配下の `*.tsx` に対して実行して 0 件。
→ `PAGE_GUARD_NAMES` からこの 2 名を落としても新規違反は生じない（Task 1 で実測して確認する）。

### F9. RBAC 判定は 3 箇所に重複している

`hasPermission` + `recordPermissionDenied` の対が 3 箇所:
`_shared/lib/action-auth.ts:95-101`（result union を返す）/
`_shared/queries/_helpers.ts:67-70`（`denyAdminAccess()` = `notFound()`）/
`_shared/lib/admin-action.ts:95-105`（`MutationResult` を返す）。
CLAUDE.md「抽象化は 3 回目の重複から」の条件を満たす（3 回目）。

`recordPermissionDenied(userId, resource, action, resourceId?)`（`_shared/lib/audit.ts:166-174`）は
`resourceId` 省略可。明示的に `undefined` を渡しても `createAuditLog` に渡る値は同じなので、
統合しても監査ログの内容は変わらない。

### F10. `forbidden()` は 16.3.1 でも採らない

`experimental.authInterrupts` は 16.3.1 でも experimental で既定 false
（`node_modules/next/dist/server/config-shared.d.ts:1781` の `authInterrupts: false`、
`config-schema.js:456` の `z.boolean().optional()`）。
`_helpers.ts:40-42` と `admin-permission-denial-mechanism.test.ts:26-27` の既存判断は版が上がっても
そのまま維持する。**この計画で deny の表現（`notFound()` / result union / `MutationResult`）は一切変えない。**

---

## 設計判断

### なぜ「名前付き guard」か

権限をページの引数にしている限り、`("auditLog")` → `("page")` の降格は**どちらも正当な `Resource` 値**
なので型検査を通り、gate で検出するには「そのページが本来要求すべき権限」を書いた表が要る（M-18）。

権限を関数名に埋めると、ページ側にはリテラルが 1 つも残らない。降格変異は
「`page-auth.ts` の実装を書き換える」か「ページが別の guard を呼ぶ」かのどちらかになる:

- **前者**は `page-auth.ts` の behavioral test（Task 2 / 3 で新設）が実 `hasPermission` を通して赤くする。
- **後者**は import 文ごと変わるので diff で自明。かつ F3 の 3 ページでは DAL が二重に守るため実害なし。
  実害があるのは F5 の settings manage 4 ページと F4 の `coupons/new` だけで、
  前者は既存の表（F6）が引き続き守り、後者の実害は「空のフォームが描画される」に留まる
  （送信は `executeAdminMutationResult` が `coupon:create` を要求する）。

### なぜ新しい gate を足さないか

M-18 に必要なのは「resource:action の対応が正しい」ことの機械検査であって、
それは**表を書いた gate**でなくても、**実装を実行するテスト**で表現できる。後者を採る:

- gate（静的走査）は「ページのソースに何が書かれているか」しか見られない。
- behavioral test は `hasPermission` の実データ（`ROLE_PERMISSIONS`）を通るので、
  権限表を将来変えたときも一緒に落ちる（＝ SSoT が 1 つ増えない）。

これは repo の既存判断と一致する — PR #2344（Task 9）が `checkPermission` を同じ理由で
実 predicate テスト化している。

### やらないこと

| 除外                                                                | 理由                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin-settings-permissions.test.ts` の manage 4 ページ表の**削除** | F5 により irreducible。system ページの manage 要求はどの DAL にも表現できない。表の**形**だけ Task 3 で直す                                                                                                                          |
| DAL 側の権限引き上げ（`getResendConfig` 等を `settings:manage` へ） | API キー設定は masked で返る（`api-key-queries.ts:29-58` の `apiKeyMasked` / `webhookSecretMasked`）ため `settings:read` 露出の実害が小さく、`getSettings` / `getTaxSettings` は共有されていて引き上げ不能。**別途起票して判断する** |
| L-a（営業時間一括適用の再検証）/ L-c（料金プレビューの定額割引）    | 実害が管理者の表示のみ。本プランと無関係の製品欠陥                                                                                                                                                                                   |
| L-b（`updateContactInfo` の楽観ロック欠落）                         | 実害はあるが本プランと別サブシステム。**別プランとして起票する**（PR #1509 の CAS に揃えるだけ）                                                                                                                                     |
| 残り約 45 変異                                                      | Task 4 で判定サイトが 3→1 になると母数が変わる。**Task 4 の後に数え直す**                                                                                                                                                            |
| `forbidden()` / `unauthorized()` の採用                             | F10                                                                                                                                                                                                                                  |
| deny の表現の統合                                                   | 層の違いに由来する意図的な差（`2026-08-16-...-decision-ssot-design.md:32-34`）。統合するのは decision（Task 4）                                                                                                                      |

---

### Task 1: gate の guard 名を `page-auth.ts` から導出する

**深刻度:** medium / **見積り:** +45 / -10 行・1 ファイル

**なぜ:** `PAGE_GUARD_NAMES`（`admin-page-auth-before-suspense.test.ts:88-95`）が 6 名をハードコードして
いる。Task 2 / 3 で guard の名前が変わるので、このままだと gate を 2 回触ることになり、
「片方だけ直した状態が緑で通る」二重管理そのものになる。先に導出へ変えておく。

副次効果として、`page-auth.ts` の export ではない `requireAdminPermission` /
`requireAdminResourcePermission` が集合から落ちる。これは `auth-gate-ssot.test.ts:110-125`
（ページからの `_helpers` 直 import 禁止・allowlist 空）と同じ方針で、F8 により現状違反は増えない。

**Files:**

- Modify: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts:85-95`（定数を関数へ）、`:333-390`（fixture 1 本追加）
- Test: 同ファイル（gate 自身が test ファイル。新規ファイルは作らない）

**Interfaces:**

- Consumes: `createSourceFile` / `forEachChild` / `isFunctionDeclaration` / `canHaveModifiers` / `getModifiers` / `ScriptKind` / `ScriptTarget` / `SyntaxKind` — `typescript`（同ファイルで既に import 済み。`ScriptKind.TS` の追加 import は不要、`ScriptKind` は既に import されている）
- Produces: `collectPageGuardNames(): Set<string>`（module-local。他 Task から参照しない）

---

- [ ] **Step 1: 失敗する fixture を先に足す**

`:390` の `});`（fixture test の閉じ）の直前、`:389` の `).toBe(false);` の後ろへ次を追加する。
この時点では `PAGE_GUARD_NAMES` が旧ハードコードのままなので **`true` になって落ちる**。

```ts
// 落ちるべき形 4: page-auth.ts の export ではない helper を直に呼ぶ形。
// `auth-gate-ssot.test.ts` がページからの `_helpers` 直 import を禁止しているので、
// この形は compliant と数えてはいけない。旧実装は `PAGE_GUARD_NAMES` に
// `requireAdminPermission` を写していたため true を返していた。
expect(
  analyzeSnippet(
    `export default async function P() {
           await requireAdminPermission("auditLog", "read");
           return <div />;
         }`,
  ),
).toBe(false);
```

- [ ] **Step 2: 落ちることを確認する**

```bash
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
```

期待: **FAIL**。`guard 呼出が await されている形だけを compliant と判定する（見本）` が
`expect(received).toBe(expected) / Expected: false / Received: true` で落ちる。
他の 3 テストは緑のまま。

- [ ] **Step 3: 導出へ置き換える**

`:87-95` の

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
```

を次で置き換える。

```ts
/**
 * ページ本体（default export）で認可を解決する helper 群。
 *
 * **名前をここに写さない。** `page-auth.ts`（`auth-gate-ssot.test.ts` が管理ページ用
 * gate の facade SSoT として実在まで要求しているファイル）の export を AST で読んで
 * 導出する。写すと guard を 1 つ足すたびに 2 箇所を直すことになり、片方だけ直した
 * 状態が緑で通る。
 *
 * facade の export でないもの（`requireAdminPermission` 等の `_helpers` 直呼び）は
 * ここに入らない。ページからの `_helpers` 直 import は `auth-gate-ssot.test.ts` が
 * 別途禁止しているので、compliant と数えないほうが 2 つの gate の方針が揃う。
 */
const PAGE_AUTH_FACADE =
  "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts";

function collectPageGuardNames(): Set<string> {
  const text = readFileSync(join(root, ...PAGE_AUTH_FACADE.split("/")), "utf8");
  const source = createSourceFile(
    "page-auth.ts",
    text,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );

  const names = new Set<string>();
  forEachChild(source, (node) => {
    if (!isFunctionDeclaration(node) || node.name === undefined) return;
    if (!canHaveModifiers(node)) return;
    const modifiers = getModifiers(node) ?? [];
    if (
      !modifiers.some((modifier) => modifier.kind === SyntaxKind.ExportKeyword)
    ) {
      return;
    }
    names.add(node.name.text);
  });

  return names;
}

const PAGE_GUARD_NAMES = collectPageGuardNames();
```

`const root = process.cwd();`（`:85`）はこのブロックより前にあるので順序はそのままでよい。

- [ ] **Step 4: 走査規模の下限を足す**

`:304` の `describe(...)` の直後、`:305` の `test("allowlist 外の新規違反が無い", ...)` の**前**へ
次の 1 本を追加する（`.claude/rules/architecture-gates.md`「空振りする gate を書かない」）。
しきい値は数値リテラルで書くこと。

```ts
test("guard 名を facade から導出できている（空振り防止）", () => {
  expect(PAGE_GUARD_NAMES.size).toBeGreaterThan(2);
  expect([...PAGE_GUARD_NAMES]).toContain("requireAdminDashboardPage");
});
```

- [ ] **Step 5: 通ることを確認する**

```bash
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
```

期待: **PASS（5 tests）**。

続けて、**違反集合が変わっていないこと**を確認する（F8 の実測）。

```bash
bun scripts/run-tests.ts __tests__/unit/architecture
```

期待: 全件 PASS。`allowlist に解消済み entry が残っていない（ratchet）` が緑であることが
「違反集合が 1 件も増減していない」ことの証明になる（増えれば別テストが、減れば ratchet が落ちる）。

- [ ] **Step 6: 変異で赤くなることを確認する（受入条件）**

**Step 3-5 まで終えた状態**を退避する（この backup が「正しい最終形」になる）。

```powershell
Copy-Item "__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts" "$env:TEMP/page-auth-gate.bak"
```

変異: `collectPageGuardNames()` の `return names;` を
`return new Set([...names, "requireAdminPermission"]);` に変える（＝旧実装への逆戻り）。

```bash
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
```

期待: **FAIL**。Step 1 の fixture が `Expected: false / Received: true` で落ちる。
他の 4 テストは緑のまま（＝この変異を検出しているのは Step 1 の fixture だけ）。

復元:

```powershell
Copy-Item "$env:TEMP/page-auth-gate.bak" "__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts"
```

```bash
bun run test -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
git diff --stat -- __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
```

期待: PASS に戻り、diff は Step 1/3/4 のぶんだけ（変異の残骸が無いこと）。

- [ ] **Step 7: commit**

```bash
bunx prettier --write __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
bun run validate
git switch -c test/page-auth-gate-derive-names
git add __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
git commit -m "test(architecture): derive page guard names from the page-auth facade [ai-gen]"
```

---

### Task 2: ページから `Resource` リテラルを消す

**深刻度:** high / **見積り:** +110 / -20 行・6 ファイル

**なぜ:** M-18。`requireAdminListPage("auditLog")` を `("page")` に降格しても、`"page"` は正当な
`Resource` 値なので型検査を通り、どの gate も落ちない。ページから `Resource` を消せば、この変異は
ページ内では**表現不能**になる。同時に `coupons/new` の要求 action の誤り（作成ページが `read` を要求。F4）を是正する。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts:36-49`（2 helper を 4 helper へ）
- Modify: `src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx:4`, `:70`
- Modify: `src/app/(admin)/admin/(dashboard)/coupons/new/page.tsx:4`, `:12`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/page.tsx:3`, `:84`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx:4`, `:48`
- Modify: `__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts:334-390`（fixture 内の helper 名）
- Create: `__tests__/unit/admin/helpers/page-auth.test.ts`

**Interfaces:**

- Consumes:
  - `requireAdminPermission(resource: Resource, action: Action): Promise<AdminAuthUser>` / `requireAdminResourcePermission(resource: Resource, action: Action, resourceId?: string): Promise<AdminAuthUser>` — `@/admin/queries/_helpers`
  - `ADMIN_USER` / `VIEWER_USER` — `__tests__/fixtures/users.ts`
  - `getAssignedPageIdsForUser(userId: string): Promise<string[]>` — `@/shared/domain/user-page-assignments/queries`（DB 境界。mock 対象）
- Produces（Task 3 と gate が参照する）:
  - `requireAuditLogListPage(): Promise<AdminAuthUser>`
  - `requireStaffListPage(): Promise<AdminAuthUser>`
  - `requireStaffDetailPage(userId: string): Promise<AdminAuthUser>`
  - `requireCouponCreatePage(): Promise<AdminAuthUser>`
    — いずれも `@/admin/helpers/page-auth`

---

- [ ] **Step 1: 失敗する behavioral test を書く**

`__tests__/unit/admin/helpers/page-auth.test.ts` を**新規作成**する。
mock 構成は `__tests__/unit/queries/admin-query-helpers.test.ts` の現行イディオムに合わせる
（`next/navigation` の `notFound` を投げる形に差し替え、session の `verifyAdminSession` だけを差し替え、
DB 境界の `user-page-assignments/queries` を差し替える）。

> **この mock 集合で足りる根拠:** `page-auth.ts` は `@/admin/queries/_helpers` と型しか import
> しない（`:21-29` で全 import を確認済み）。つまり module graph は `_helpers.ts` のそれと同一で、
> `admin-query-helpers.test.ts` が同じ 5 つの mock で今日通っている。`mock.module` は完全置換なので
> mock 集合が不足すると `Export named 'X' not found` で module load ごと落ちる — Step 2 の実行が
> そのまま検査になっている。

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER, VIEWER_USER } from "../../../fixtures/users";

/**
 * `page-auth.ts` の各 guard が要求する resource:action を、実 `hasPermission`
 * （`ROLE_PERMISSIONS` の実データ）を通して固定する。
 *
 * ページ側には権限リテラルが無いので、降格変異は必ずこのファイルの実装に現れる。
 * ここが唯一の記述であり、この test が唯一の照合先。
 */
let notFoundCalls = 0;
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
const mockRecordPermissionDenied = mock(() => {});
const mockHeaders = mock(async () => new Headers());
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

mock.module("next/navigation", () => ({
  notFound: () => {
    notFoundCalls += 1;
    throw new Error("NOT_FOUND");
  },
}));

mock.module("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// `mock.module` は完全置換。session module は実モジュールを spread し、認証境界の
// `verifyAdminSession` だけ差し替える (.claude/rules/testing.md)。
const actualSession = await import("@/shared/domain/admin-auth/session");

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  verifyAdminSession: () => mockVerifyAdminSession(),
}));

// `@/shared/lib/admin-permissions` は mock しない。mock すると各 guard が
// どの resource:action を渡しているかが観測できなくなり、このファイルの目的が消える。
mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));

mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

const {
  requireAuditLogListPage,
  requireCouponCreatePage,
  requireStaffDetailPage,
  requireStaffListPage,
} = await import("@/admin/helpers/page-auth");

describe("page-auth の guard が要求する権限", () => {
  beforeEach(() => {
    notFoundCalls = 0;
    mockRecordPermissionDenied.mockReset();
    mockGetAssignedPageIdsForUser.mockReset();
    mockGetAssignedPageIdsForUser.mockResolvedValue([]);
  });

  // VIEWER は auditLog を 1 つも持たない（admin-permissions.ts:258-277）。
  // `"page"` へ降格すると VIEWER は `page:read` を持つので通ってしまう。
  test("requireAuditLogListPage は auditLog:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireAuditLogListPage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "auditLog",
      "read",
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireAuditLogListPage()).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });

  // VIEWER は user 系を持たない。
  test("requireStaffListPage は user:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireStaffListPage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "user",
      "read",
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireStaffListPage()).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });

  test("requireStaffDetailPage は user:read を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireStaffDetailPage("staff-1")).rejects.toThrow(
      "NOT_FOUND",
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireStaffDetailPage("staff-1")).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });

  // 作成フォームなので read ではなく create。VIEWER は coupon を 1 つも持たない
  // ため、read / create のどちらでも拒否される。ADMIN は両方を持つ。
  // よってこの test は「coupon を要求している」ことまでを固定し、
  // create か read かは Step 4 の変異検査で確かめる。
  test("requireCouponCreatePage は coupon 権限を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(requireCouponCreatePage()).rejects.toThrow("NOT_FOUND");
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "coupon",
      "create",
    );

    mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
    await expect(requireCouponCreatePage()).resolves.toMatchObject({
      id: ADMIN_USER.id,
    });
  });
});
```

> `coupon` の test だけ「拒否/許可」で resource:action を割れない（F4 のとおり VIEWER は
> `coupon:read` も `coupon:create` も持たず、ADMIN は両方持つため、`create` → `read` の変異では
> 拒否/許可の答えが変わらない）。そこで `recordPermissionDenied` の**第 3 引数**で `"create"` を
> 直接固定している。これが無いと、この test は `create` / `read` を区別できず変異を素通りさせる。

- [ ] **Step 2: 落ちることを確認する**

```bash
bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts
```

期待: **FAIL**。`SyntaxError: Export named 'requireAuditLogListPage' not found in module '...page-auth.ts'`
で module load ごと落ちる（4 helper がまだ存在しないため）。

- [ ] **Step 3: `page-auth.ts` を名前付き guard に置き換える**

`:36-49` の

```ts
/** List/index pages that enforce read access at the page boundary. */
export async function requireAdminListPage(
  resource: Resource,
): Promise<AdminAuthUser> {
  return requireAdminPermission(resource, "read");
}

/** Detail pages; optional `resourceId` applies editor assignment scope. */
export async function requireAdminDetailPage(
  resource: Resource,
  resourceId?: string,
): Promise<AdminAuthUser> {
  return requireAdminResourcePermission(resource, "read", resourceId);
}
```

を次で置き換える。

```ts
/**
 * 監査ログ一覧（`auditLog:read`）。
 *
 * resource を引数で受けない。ページ側にリテラルが残ると `("auditLog")` を
 * `("page")` に降格しても型検査を通り、検出には「ページ→権限」の対応表が要る
 * （第6次監査 M-18）。要求権限の記述はこのファイル 1 箇所だけが持ち、
 * `__tests__/unit/admin/helpers/page-auth.test.ts` が実 hasPermission で固定する。
 */
export async function requireAuditLogListPage(): Promise<AdminAuthUser> {
  return requireAdminPermission("auditLog", "read");
}

/** スタッフ一覧（`user:read`）。 */
export async function requireStaffListPage(): Promise<AdminAuthUser> {
  return requireAdminPermission("user", "read");
}

/**
 * スタッフ詳細（`user:read` + editor assignment scope）。
 *
 * scope 判定は EDITOR にしか効かず、EDITOR は `user:read` を持たないため現状は
 * 到達しない。`requireAdminPermission` に落とすと振る舞いは同じだが、
 * 権限表を変えたときの挙動が変わるのでそのまま resource 版を呼ぶ。
 */
export async function requireStaffDetailPage(
  userId: string,
): Promise<AdminAuthUser> {
  return requireAdminResourcePermission("user", "read", userId);
}

/** クーポン新規作成フォーム（`coupon:create`）。 */
export async function requireCouponCreatePage(): Promise<AdminAuthUser> {
  return requireAdminPermission("coupon", "create");
}
```

`:29` の `import type { Action, Resource } from "@/shared/lib/admin-resources";` は
`requireAdminSettingsPage` がまだ `Action` を使うので**この Task では残す**（`Resource` は未使用に
なるので `import type { Action } from ...` に縮める）。

`:7-18` の Archetypes 表も現物に合わせて書き換える:

```ts
 * ## Archetypes
 *
 * | Helper | Permission | Use when |
 * | --- | --- | --- |
 * | `requireAdminDashboardPage()` | session only | Layout chrome, list/detail headers needing role-based UI |
 * | `requireAuditLogListPage()` | `auditLog:read` | 監査ログ一覧 |
 * | `requireStaffListPage()` | `user:read` | スタッフ一覧 |
 * | `requireStaffDetailPage(userId)` | `user:read` + editor scope | スタッフ詳細 |
 * | `requireCouponCreatePage()` | `coupon:create` | クーポン新規作成フォーム |
 * | `requireAdminSettingsPage(action?)` | `settings:read` or `settings:manage` | Settings hub and subpages |
```

- [ ] **Step 4: 通ることを確認し、変異で赤くなることを確認する（受入条件）**

```bash
bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts
```

期待: **PASS（4 tests）**。

退避してから 3 つの変異を順に入れる。

```powershell
Copy-Item "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts" "$env:TEMP/page-auth.bak"
```

| 変異                                 | 変える場所                | 期待                                                                                                                                 |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| M-18 の実物: `"auditLog"` → `"page"` | `requireAuditLogListPage` | `requireAuditLogListPage は auditLog:read を要求する` が FAIL（VIEWER が `page:read` を持つので reject しない）                      |
| `"user"` → `"page"`                  | `requireStaffListPage`    | `requireStaffListPage は user:read を要求する` が FAIL                                                                               |
| `"create"` → `"read"`                | `requireCouponCreatePage` | `requireCouponCreatePage は coupon 権限を要求する` が FAIL（`toHaveBeenCalledWith(..., "coupon", "create")` が `"read"` を受け取る） |

各変異ごとに `bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts` を実行し、
**赤を目で見てから**復元する。

```powershell
Copy-Item "$env:TEMP/page-auth.bak" "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts"
```

```bash
git diff --stat -- "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts"
```

期待: Step 3 の変更ぶんだけが出ること（変異の残骸が無いこと）。

- [ ] **Step 5: 4 ページを差し替える**

`audit-logs/page.tsx`:

```ts
// :4
import { requireAuditLogListPage } from "@/admin/helpers/page-auth";
// :70
await requireAuditLogListPage();
```

`coupons/new/page.tsx`:

```ts
// :4
import { requireCouponCreatePage } from "@/admin/helpers/page-auth";
// :12
await requireCouponCreatePage();
```

`staff/page.tsx`:

```ts
// :3
import { requireStaffListPage } from "@/admin/helpers/page-auth";
// :84
await requireStaffListPage();
```

`staff/[id]/page.tsx`（`:47-50` の `Promise.all` の形は**崩さない**。崩すと
`admin-page-auth-before-suspense.test.ts` の「`await Promise.all` の要素」判定に掛からなくなる）:

```ts
// :4
import { requireStaffDetailPage } from "@/admin/helpers/page-auth";
// :47-50
const [currentUser, user] = await Promise.all([
  requireStaffDetailPage(id),
  getUser(id),
]);
```

- [ ] **Step 6: gate の fixture 内の helper 名を更新する**

`__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts` の fixture（`:333-390`）で
`requireAdminListPage("auditLog")` を `requireAuditLogListPage()` に、
`requireAdminDetailPage("user", id)` を `requireStaffDetailPage(id)` に置き換える（計 5 箇所）。
コメントの「audit-logs/page.tsx:70 の実際の形」「staff/[id]/page.tsx:47-50 の実際の形」は
そのまま正しいので残す。Step 1 で足した `requireAdminPermission` の fixture は**変えない**
（`page-auth.ts` の export ではない、という主張は変わらない）。

- [ ] **Step 7: 周辺が壊れていないことを確認する**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture
bun run type-check
bun run test:unit
```

期待: 全て PASS。

- `module-reachability.test.ts` — 新しい export は 4 ページから到達するので orphan にならない。
- `admin-settings-permissions.test.ts` — `requireAdminSettingsPage` は触っていないので影響なし。
- `auth-gate-ssot.test.ts` — import 元は `@/admin/helpers/page-auth` のままなので影響なし（F7）。
- `src-doc-pointers-resolve.test.ts` — Step 3 の docstring が
  `__tests__/unit/admin/helpers/page-auth.test.ts` を名指しするので、**そのファイルが実在すること**が
  機械強制される。Step 1 で作成済み。

さらに、ページから `Resource` リテラルが消えたことを実測する:

```bash
grep -rn "requireAdminListPage\|requireAdminDetailPage" src
```

期待: 出力なし。

- [ ] **Step 8: commit**

```bash
bunx prettier --write "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts" "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx" "src/app/(admin)/admin/(dashboard)/coupons/new/page.tsx" "src/app/(admin)/admin/(dashboard)/staff/page.tsx" "src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx" __tests__/unit/admin/helpers/page-auth.test.ts __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
bun run validate
git switch -c refactor/admin-page-resource-literals
git add "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts" "src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx" "src/app/(admin)/admin/(dashboard)/coupons/new/page.tsx" "src/app/(admin)/admin/(dashboard)/staff/page.tsx" "src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx" __tests__/unit/admin/helpers/page-auth.test.ts __tests__/unit/architecture/admin-page-auth-before-suspense.test.ts
git commit -m "refactor(admin): name page guards by resource instead of passing literals [ai-gen]"
```

---

### Task 3: settings の `Action` リテラルを消す

**深刻度:** high / **見積り:** +90 / -30 行・12 ファイル

**なぜ:** `requireAdminSettingsPage("manage")` を `()` に降格すると VIEWER が billing / features /
integrations / system を開ける（F5。DAL は全て `settings:read` しか要求しない）。現状はこれを
`admin-settings-permissions.test.ts:35` の**文字列一致**で守っているが、引数の写しなので
`requireAdminSettingsPage( "manage" )` のような整形差で無言に空振りする。
guard を 2 本に割って引数を消し、gate 側は関数名の照合に変える。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts:51-56`（1 helper を 2 helper へ）
- Modify: 9 ファイル・12 箇所の呼出（下表）
- Modify: `__tests__/unit/architecture/admin-settings-permissions.test.ts:25-38`, `:43-46`
- Modify: `__tests__/unit/admin/helpers/page-auth.test.ts`（test 2 本追加）

差し替え対象（import 行 / 呼出行）:

| ファイル                          | import | 呼出          | 置換後                        |
| --------------------------------- | ------ | ------------- | ----------------------------- |
| `settings/appearance/page.tsx`    | `:18`  | `:33`, `:145` | `requireSettingsPage()`       |
| `settings/billing/page.tsx`       | `:21`  | `:180`        | `requireSettingsManagePage()` |
| `settings/business/page.tsx`      | `:16`  | `:40`, `:114` | `requireSettingsPage()`       |
| `settings/features/page.tsx`      | `:19`  | `:36`         | `requireSettingsManagePage()` |
| `settings/integrations/page.tsx`  | `:17`  | `:183`        | `requireSettingsManagePage()` |
| `settings/notifications/page.tsx` | `:20`  | `:149`        | `requireSettingsPage()`       |
| `settings/page.tsx`               | `:27`  | `:150`        | `requireSettingsPage()`       |
| `settings/site/page.tsx`          | `:16`  | `:31`, `:76`  | `requireSettingsPage()`       |
| `settings/system/page.tsx`        | `:9`   | `:81`         | `requireSettingsManagePage()` |

**Interfaces:**

- Consumes: Task 2 の Produces に加えて `requireAdminPermission(resource, action)` — `@/admin/queries/_helpers`
- Produces:
  - `requireSettingsPage(): Promise<AdminAuthUser>`（`settings:read`）
  - `requireSettingsManagePage(): Promise<AdminAuthUser>`（`settings:manage`）
    — いずれも `@/admin/helpers/page-auth`

---

- [ ] **Step 1: 失敗する behavioral test を書く**

`__tests__/unit/admin/helpers/page-auth.test.ts` の `describe` 末尾へ 2 本追加し、
先頭の import 分割代入にも 2 名を足す。

```ts
// VIEWER は settings:read を持ち settings:manage を持たない
// （admin-permissions.ts:271）。この 2 本が read / manage を割る唯一の観測点。
test("requireSettingsPage は settings:read を要求する", async () => {
  mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
  await expect(requireSettingsPage()).resolves.toMatchObject({
    id: VIEWER_USER.id,
  });
  expect(notFoundCalls).toBe(0);
});

test("requireSettingsManagePage は settings:manage を要求する", async () => {
  mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
  await expect(requireSettingsManagePage()).rejects.toThrow("NOT_FOUND");
  expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
    VIEWER_USER.id,
    "settings",
    "manage",
  );

  mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
  await expect(requireSettingsManagePage()).resolves.toMatchObject({
    id: ADMIN_USER.id,
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts
```

期待: **FAIL**。`SyntaxError: Export named 'requireSettingsPage' not found in module '...page-auth.ts'`。

- [ ] **Step 3: `page-auth.ts` を 2 本に割る**

`:51-56` の `requireAdminSettingsPage` を次で置き換える。

```ts
/** 設定ハブと閲覧系サブページ（`settings:read`）。 */
export async function requireSettingsPage(): Promise<AdminAuthUser> {
  return requireAdminPermission("settings", "read");
}

/**
 * 高リスク設定ページ（`settings:manage`）。
 *
 * これらのページが読むデータは全て `settings:read` で取れるため、`manage` 要求は
 * ページ側にしか存在しない（DAL に寄せられない。とくに system は `getSettings` しか
 * 読まない）。したがって「どのページが manage を要求するか」は
 * `__tests__/unit/architecture/admin-settings-permissions.test.ts` が別途固定する。
 */
export async function requireSettingsManagePage(): Promise<AdminAuthUser> {
  return requireAdminPermission("settings", "manage");
}
```

`:29` の `import type { Action } from "@/shared/lib/admin-resources";` は**未使用になるので削除**する
（`page-auth.ts` から `admin-resources` への import が 1 本も無くなる）。
Archetypes 表の `requireAdminSettingsPage` 行を 2 行に割る。

- [ ] **Step 4: 通ることを確認し、変異で赤くなることを確認する（受入条件）**

```bash
bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts
```

期待: **PASS（6 tests）**。

```powershell
Copy-Item "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts" "$env:TEMP/page-auth.bak"
```

変異: `requireSettingsManagePage` の `"manage"` を `"read"` にする。

```bash
bun run test -- __tests__/unit/admin/helpers/page-auth.test.ts
```

期待: **FAIL**。`requireSettingsManagePage は settings:manage を要求する` が
`Expected promise that rejects / Received promise that resolved` で落ちる。
`requireSettingsPage は settings:read を要求する` は緑のまま（＝この変異を検出しているのは新規 1 本だけ）。

復元し、`git diff --stat -- "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts"` で
Step 3 のぶんだけが残っていることを確認する。

- [ ] **Step 5: 9 ファイル・12 箇所を差し替える**

上の表のとおりに import と呼出を置き換える。`settings/page.tsx:150` は
`const currentUser = await requireAdminSettingsPage("read");` →
`const currentUser = await requireSettingsPage();`。
`settings/site/page.tsx:31` は `Promise.all` の要素なので `requireSettingsPage(),` の形を保つ。

`settings/appearance` / `business` / `site` はそれぞれ 2 箇所呼んでいる（別の関数から）。
**両方**置き換えること。置き忘れると型エラーで落ちるので Step 7 で必ず出る。

- [ ] **Step 6: gate を関数名の照合に変える**

`__tests__/unit/architecture/admin-settings-permissions.test.ts:33-37` を次で置き換える。

```ts
for (const pagePath of manageOnlyPages) {
  const source = readAdminFile(...pagePath);
  // 引数ではなく関数名で照合する。要求権限の実体は page-auth.ts の
  // `requireSettingsManagePage` 1 箇所にあり、それが settings:manage を
  // 要求することは __tests__/unit/admin/helpers/page-auth.test.ts が
  // 実 hasPermission で固定している。ここが見るのは「このページがどちらの
  // guard を呼ぶか」だけ（DAL に寄せられない方針なので、この照合は消せない）。
  expect(source).toContain("requireSettingsManagePage()");
  expect(source).not.toContain("requireSettingsPage()");
  expect(source).toContain("@/admin/helpers/page-auth");
}
```

`:43-46` を次で置き換える。

```ts
expect(source).toContain("const currentUser = await requireSettingsPage();");
expect(source).toContain("@/admin/helpers/page-auth");
```

`:47-54`（`requiredPermission` の 4 件照合 / `canManageSettings` / `IntegrationHealthAlert`）は
**触らない**。あれは settings トップの UI 側の絞り込みで、本 Task の対象外。

- [ ] **Step 7: 周辺が壊れていないことを確認する**

```bash
bun scripts/run-tests.ts __tests__/unit/architecture
bun run type-check
bun run test:unit
```

期待: 全て PASS。

```bash
grep -rn "requireAdminSettingsPage" src __tests__
```

期待: 出力なし。

- [ ] **Step 8: commit**

```bash
bunx prettier --write "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts" "src/app/(admin)/admin/(dashboard)/settings" __tests__/unit/admin/helpers/page-auth.test.ts __tests__/unit/architecture/admin-settings-permissions.test.ts
bun run validate
git switch -c refactor/admin-settings-page-guards
git add "src/app/(admin)/admin/(dashboard)/_shared/helpers/page-auth.ts" "src/app/(admin)/admin/(dashboard)/settings" __tests__/unit/admin/helpers/page-auth.test.ts __tests__/unit/architecture/admin-settings-permissions.test.ts
git commit -m "refactor(settings): split the settings page guard by required permission [ai-gen]"
```

---

### Task 4: RBAC decision を 1 本化する

**深刻度:** medium / **見積り:** +45 / -35 行・4 ファイル

**なぜ:** `hasPermission` + `recordPermissionDenied` の対が 3 箇所にある（F9）。CLAUDE.md
「抽象化は 3 回目の重複から」の条件を満たす。deny の**表現**（result union / `notFound()` /
`MutationResult`）は層の違いに由来する意図的な差なので触らず、**decision だけ**を 1 本にする。

**前提:** `docs/superpowers/plans/2026-08-16-admin-resource-access-ssot.md` の PR が
**merge 済みであること**。同じ 3 ファイルを触るため、先行させないと衝突する。

**正直な限界:** 3 site とも既にテストが存在する（`action-auth.ts` と `_helpers.ts` は PR #2344、
`admin-action.ts` は `_executeAdminMutationResult-rbac.test.ts`）。したがって**この Task で
変異の検出力は上がらない**。得られるのは重複の削除と、4 番目の判定サイトが増えるのを防ぐこと。
価値がこれだけであることを踏まえて着手を判断する。

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/authorize.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts:95-101`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:67-70`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts:95-105`

**Interfaces:**

- Consumes:
  - `hasPermission(role: Role, resource: Resource, action: Action): boolean` — `@/shared/lib/admin-permissions`
  - `recordPermissionDenied(userId: string, resource: string, action: Action, resourceId?: string): void` — `@/admin/lib/audit`
  - `type AdminAuthUser` — `@/shared/domain/admin-auth/session`
- Produces:
  - `authorizeAdmin(user: AdminAuthUser, resource: Resource, action: Action, resourceId?: string): boolean` — `@/admin/lib/authorize`

---

- [ ] **Step 1: 新モジュールを書く**

`src/app/(admin)/admin/(dashboard)/_shared/lib/authorize.ts`:

```ts
import "server-only";

import { recordPermissionDenied } from "@/admin/lib/audit";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { AdminAuthUser } from "@/shared/domain/admin-auth/session";
import type { Action, Resource } from "@/shared/lib/admin-resources";

/**
 * RBAC の判定と、拒否時の監査記録。**唯一の判定サイト。**
 *
 * 拒否の表現は層ごとに違う（Server Action は result union、page / query helper は
 * `notFound()`、mutation wrapper は `MutationResult`）。それは層の違いに由来する
 * 意図的な差なので統合しない。統合するのは判定だけ。
 *
 * 呼び出し側はこの関数が false を返したら、自分の層の形で拒否を返すこと。
 * `recordPermissionDenied` を重ねて呼ばない（監査ログが二重になる）。
 */
export function authorizeAdmin(
  user: AdminAuthUser,
  resource: Resource,
  action: Action,
  resourceId?: string,
): boolean {
  if (hasPermission(user.role, resource, action)) return true;

  recordPermissionDenied(user.id, resource, action, resourceId);
  return false;
}
```

- [ ] **Step 2: `action-auth.ts` を差し替える**

`:95-101` を次で置き換える（`:93` の `const { user } = auth;` と `:103` の
`return { success: true, user };` は**残す**）。

```ts
if (!authorizeAdmin(user, resource, action)) {
  return {
    success: false,
    error: { error: `${resource}の${action}権限がありません` },
  };
}
```

import を直す（実測で確定済み）:

- `:21` の `import { hasPermission } from "@/shared/lib/admin-permissions";` を**削除**
  （`hasPermission` の使用箇所は `:95` の 1 つだけ）。
- `:23` の `recordPermissionDenied` は `checkResourceAccess`（`:122`）がまだ使うので**残す**。
- `import { authorizeAdmin } from "@/admin/lib/authorize";` を追加。

- [ ] **Step 3: `_helpers.ts` を差し替える**

`:67-70` を次で置き換える。

```ts
if (!authorizeAdmin(user, resource, action)) {
  denyAdminAccess();
}
```

`denyAdminAccess()` の出現数は「定義 1 + 呼出 2」で **3 のまま**でなければならない
（`admin-permission-denial-mechanism.test.ts:67-68` が `toBeGreaterThanOrEqual(3)` を要求）。
`requireAdminResourcePermission` 側の `denyAdminAccess()` を消さないこと。

import を直す（実測で確定済み）:

- `:8` の `import { hasPermission } from "@/shared/lib/admin-permissions";` を**削除**
  （使用箇所は `:67` の 1 つだけ）。
- `:5` の `recordPermissionDenied` は `:88` がまだ使うので**残す**。
- `import { authorizeAdmin } from "@/admin/lib/authorize";` を追加。

- [ ] **Step 4: `admin-action.ts` を差し替える**

`:95-105` を次で置き換える。

```ts
// 3. RBAC 権限チェック
if (!authorizeAdmin(user, options.resource, options.action, resourceId)) {
  return {
    error: `${options.resource}の${options.action}権限がありません`,
  };
}
```

import を直す（実測で確定済み）:

- `:6` の `import { hasPermission } from "@/shared/lib/admin-permissions";` を**削除**
  （使用箇所は `:95` の 1 つだけ）。
- `:9` の `recordPermissionDenied` は `:116` がまだ使うので**残す**。
- `import { authorizeAdmin } from "@/admin/lib/authorize";` を追加。

実行順序契約の docstring（`:61`）の `3. \`hasPermission()\` — RBAC ロールベース認可`を`3. \`authorizeAdmin()\` — RBAC ロールベース認可（拒否時の監査記録を含む）` に直す。
この docstring は resource-access SSoT の PR が step 4 の表記を直すので、
**merge 後の現物を見てから**編集すること（行番号がずれている可能性がある）。

- [ ] **Step 5: 通ることを確認する**

```bash
bun run test -- __tests__/unit/admin/lib/action-auth.test.ts
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
bun run test -- __tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture
bun run validate
```

期待: 全て PASS。

- [ ] **Step 6: 変異で赤くなることを確認する（受入条件）**

```powershell
Copy-Item "src/app/(admin)/admin/(dashboard)/_shared/lib/authorize.ts" "$env:TEMP/authorize.bak"
```

変異: `if (hasPermission(...)) return true;` を `return true;` に変える（判定を潰す）。

```bash
bun run test -- __tests__/unit/admin/lib/action-auth.test.ts
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: **両方 FAIL**。1 箇所の変異が 3 層すべてを壊すことが、統合できている証拠になる。
復元して `git status --porcelain -- "src/app/(admin)/admin/(dashboard)/_shared/lib/authorize.ts"` が
Step 1 のぶんだけであることを確認する。

- [ ] **Step 7: commit**

```bash
bunx prettier --write "src/app/(admin)/admin/(dashboard)/_shared/lib/authorize.ts" "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts" "src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts"
bun run validate
git switch -c refactor/admin-rbac-decision-ssot
git add "src/app/(admin)/admin/(dashboard)/_shared/lib/authorize.ts" "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts" "src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts"
git commit -m "refactor(admin): route every RBAC decision through authorizeAdmin [ai-gen]"
```

---

## 完了後にやること

- [ ] 第6次監査の残り変異を**数え直す**。Task 4 で判定サイトが 3→1、Task 2/3 でページ側の
      降格変異が表現不能になるため、母数（約 45 件）が変わる。数え直す前に個別対応しない。
- [ ] L-b（`updateContactInfo` の楽観ロック欠落）を別プランとして起票する。
- [ ] DAL の権限引き上げ（`getResendConfig` 等を `settings:manage` へ）を別途起票して判断する。

## 付録: 範囲外で見つけた点（直さない）

1. **`@/admin/queries/instagram` の `getDecryptedInstagramToken`（`:26-29`）に呼出元が無い。**
   `grep -rn "getDecryptedInstagramToken" src` の結果は定義 2 本（admin wrapper と
   `@/shared/domain/instagram/queries:88`）と `api/cron/instagram-sync/route.ts:50`（domain 版を直呼び）
   のみ。admin wrapper は `settings:read` で**復号済みトークン**を返すが、誰も呼んでいない。
   `module-reachability.test.ts` はモジュール単位の判定なので、同じモジュールの
   `getInstagramConfig` が使われている限りこの export は残る。
2. **`staff/[id]/page.tsx` の editor scope が到達不能**（F3）。`requireAdminResourcePermission` に
   渡している `id` は現状の権限表では効かない。権限表を変えるときに意味を持つので削らない。
3. **`admin-page-auth-before-suspense.test.ts:307` の走査規模下限が `toBeGreaterThan(0)`。**
   `.claude/rules/architecture-gates.md` の趣旨（空振り検出）からすると弱い。本プランでは触らない。

## 付録: 実施時の訂正（2026-08-16、実行者が変異検査中に検出）

計画どおりに進めたが、実行中に判明した 3 点のずれを記録する（いずれも実装側の事実誤認で、
方針の変更ではない）。

1. **behavioral test の allow 側 fixture が誤っていた（Task 2 / Task 3）。** 計画は
   `requireAuditLogListPage` と `requireSettingsManagePage` の allow 側を `ADMIN_USER` と
   していたが、`auditLog:*`（`admin-permissions.ts:101-102`）と `settings:manage`（`:96`）は
   **SUPER_ADMIN 専用**で ADMIN は保持しない（ADMIN は `settings:read` / `settings:update`
   まで、`:203-204`）。そのままでは RED のまま進まないため、両テストの allow 側を
   `SUPER_ADMIN_USER` に訂正した。
2. **Task 4 の「既存テストはそのまま PASS」は誤り。** `authorizeAdmin` は
   `recordPermissionDenied` を常に 4 引数（resourceId 無しなら第 4 引数 `undefined`）で呼ぶ。
   監査内容は同一（F9 の検証どおり `createAuditLog` に渡る値は変わらない）だが、
   3 引数を期待する mock 境界の assertion 7 箇所（`action-auth.test.ts` ×1 /
   `admin-query-helpers.test.ts` ×2 / `page-auth.test.ts` ×4）が赤くなった。
   判定サイトを 1 つに正規化した以上、呼出形状は 4 引数に統一するのが正しいので
   assertion 側を合わせ、コメントで理由を明記した。
3. **F2 の `requireAdminDashboardPage()` の箇所数は 11 ではなく 12**（実測）。
   引数なしで変換対象外のため計画への影響は無い。
