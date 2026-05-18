---
paths:
  - __tests__/**
  - e2e/**
---

# テスト品質ルール

> Bun Test / Playwright E2E 対応

## テスト分類

| 種類          | フレームワーク | 場所                               | CI trigger                              | 用途                                             |
| ------------- | -------------- | ---------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Unit          | Bun Test       | `__tests__/unit/`                  | 毎 push（required）                     | 関数・ユーティリティ                             |
| Integration   | Bun Test       | `__tests__/integration/`           | 毎 push（required）                     | Server Actions・API                              |
| **Smoke E2E** | Playwright     | `e2e/smoke/*.smoke.spec.ts`        | **毎 push（required）**                 | **critical path ゲート（< 3 分、10 test 以内）** |
| 広域 E2E      | Playwright     | `e2e/{public,authenticated,a11y}/` | PR `e2e` ラベル opt-in                  | 機能カバレッジ・回帰検出                         |
| Visual        | Playwright     | `e2e/visual/`                      | PR `visual-regression` label / dispatch | screenshot baseline 比較                         |

### Smoke vs 広域 E2E の責務分離（業界標準）

Stripe / Vercel / Linear / Shopify は **"fast PR feedback smoke + heavy jobs on demand"** pattern を採用:

- **Smoke**: 毎 push で 5xx / 404 / redirect loop / WCAG critical 違反のみ検出。実行時間 < 3 分、test 数 ≤ 10、failure rate ~0% 目標。**seed 依存禁止**（defensive skip 不要、空 DB でも fallback 描画される URL のみ対象）
- **広域 E2E**: 機能カバレッジ。PR ラベル opt-in で実行コスト最適化。seed 依存可、ただし下記「defensive skip 禁止」規律に従う

## 禁止事項

1. **テストの削除・無効化禁止**
   - 既存テストを削除しない
   - `skip()` や `only()` をコミットしない
   - エラーを握りつぶすテストを書かない

2. **形骸化テスト禁止**
   - 常に成功するテストを書かない
   - 実際の動作を検証しないテストを書かない

3. **ハードコード禁止**
   - URL は `fixtures` から取得
   - テストデータは `testUsers` 等から取得

4. **待機なしのアサーション禁止**
   - `await expect(...).toBeVisible()` を使用
   - `networkidle` を適切に待機

5. **Vitest API の使用禁止**（`bun:test` と混同しない）
   - `vi.restoreAllMocks()` → `mockFn.mockReset()`
   - `vi.mock()` → `mock.module()`
   - `vi.fn()` → `mock()`

6. **E2E spec の defensive skip 禁止**
   - `test.skip(true, "データがありません")` / `test.skip(true, "ボタンが見つからない")` のような **seed 状態依存の runtime skip は禁止**
   - 必要 seed が無いなら **seed 拡充で解消**（`prisma/seed.ts` に意図的な fixture を追加）、または **spec を unit/integration に降格**（form validation の Zod schema test 等）
   - skip 数が test 数の 30% を超える spec ファイルは「実テストとして機能していない」signal、削除候補
   - 例外: viewport 依存（mobile only / desktop only）の意図的 skip は `test.describe.configure({ mode: "serial" })` + `test.skip(({ viewport }) => ...)` 等の **構造的 skip** で表現する
   - 監査 grep: `grep -rcE 'test\.skip\(true' e2e/ | awk -F: '{ if ($2 > 5) print }'`（1 ファイル 5 件超は要 review）

7. **Smoke spec の seed 依存禁止**
   - `e2e/smoke/*.smoke.spec.ts` は **空 DB でも 200 OK で fallback 描画される URL のみ対象**
   - 認証必須 page / seed データ必須 page（顧客予約履歴 / 決済済み reservation 等）は smoke では検証しない（広域 E2E 側で seed 前提でカバー）
   - smoke の失敗は本質的な regression のみ表す契約 — flake / seed drift 起因の偽陽性禁止

## Section schema test contract（`safeParse({})` 成立 + default assert）

`field.text()` 等のヘルパーが `.default("")` を必ず適用するため、section schema は architectural contract として `safeParse({})` 常に success。**test で required-field validation を期待しない** (schema 層は permissive、UI 層 = admin form の **conform `useForm` + `parseWithZod` + `getZodConstraint`** が必須バリデーション責務、React Hook Form は `package.json` から完全削除済)。

```typescript
// OK: 空 config で default 適用を assert
test("空 config でも default 値で safeParse 成功する", () => {
  const result = ctaConfigSchema.safeParse({});
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.title).toBe(""); // .default("") 適用
    expect(result.data.variant).toBe("default"); // field.select の default
  }
});

// OK: 型違反のみ reject（値違反ではない）
test("title が string 以外（型違反）はバリデーション失敗", () => {
  expect(ctaConfigSchema.safeParse({ title: 123 }).success).toBe(false);
});

// NG: schema 層に required 期待（commit 94e19608 で修正）
test("タイトル必須バリデーション", () => {
  expect(ctaConfigSchema.safeParse({}).success).toBe(false); // ← 失敗する
});
```

`isXxxConfig` 型ガード test も同方針: 空 config / `title: ""` は valid（default 適用）、type 違反のみ false を返す。`createTypedConfigGetterFromSchema` の fallback chain (`safeParse({})` 成立必須）に寄り添う設計（→ `ssot-singletons.md` §Section schema 重複）。

## 必須事項

1. **新機能にはテストを追加**
   - Server Actions のテスト
   - ドメインコマンドのテスト
   - バリデーションのテスト
   - エッジケースのテスト

2. **テスト失敗時の対応**
   - 原因を調査して修正
   - テストを削除して逃げない

3. **E2E テストの構造**
   - セクションごとに `test.describe` で分割
   - JSDoc でテストシナリオを文書化

## コマンド

```bash
# 単一ファイル実行（日常の開発はこれで十分）
bun test __tests__/unit/lib/crypto.test.ts
bun test --watch __tests__/unit/lib/crypto.test.ts    # TDD watch（単一ファイルのみ）
bun test --bail=1 __tests__/unit/lib/crypto.test.ts   # fail fast
bun test --test-name-pattern "encryption"             # 名前フィルター

# per-file isolation runner（フル実行時 / CI 必須）
bun run test:unit          # scripts/run-tests.ts 経由で全 *.test.ts を独立 process 実行
bun run test:integration   # 同上（integration）
bun run test:all           # unit + integration

# E2E
bun run e2e                # Playwright（全件）
bun run e2e:ui             # UI モード
bunx playwright test e2e/<file>                    # 単一ファイル
bunx playwright test --grep "<test title>"         # 名前フィルター
```

- **`bun test __tests__/unit`（親ディレクトリ指定）は `mock.module` 干渉のため禁止** — 必ず単一ファイル指定 or `test:unit` / `test:integration` script を使う
- **`bun run test` / `bun run test:watch` / `bun run test:coverage` は廃止** — 冗長・coverage は per-file isolation runner と非互換（各 file が独立 process のため lcov 統合不能）
- **`createImageGroupSchema()` / `sectionLayoutSchema` 等 `z.object(...).prefault({}).register(...)` パターンは省略時に inner default を生成する** — `expect(result.success).toBe(false)` の「image / layout 省略時 fail」期待は新仕様で必ず pass になり silent break。section schema を使う test は `prefault` で展開された default を `toMatchObject({ url: "", alt: "" })` 等で部分一致させる（field によって caption の default 有無が異なるため `toEqual` では flake する）
- **`prisma/migrations/<timestamp>_<name>/` の存在確認は Glob ではなく `ls prisma/migrations/`** — Glob `prisma/migrations/2026*` はディレクトリにマッチしない（Glob ツールはファイルのみ）ため「migration 不在」と誤判定する silent bug。`prisma/migrations/2026*/migration.sql` のような末尾ファイル指定なら Glob 可
- **失敗 test が現在の変更由来か pre-existing かは `git stash && bun test <file> && git stash pop` で切り分け** — stashed 状態で再実行し fail が再現するなら pre-existing（test fixture が前 commit の schema 変更に追従していないケース等）。pre-existing と確定したら自分の変更で深追いしない。実例: 2026-05-08 spaceFormSchema 13 件 fail を `git stash` で `40ca005e feat(spaces): structured facilities` の test fixture 未追従と切り分け（facilities が `string[]` → `{ name, iconName }[]` 化されたが VALID_SPACE_INPUT 未更新）

## ファイル配置

| パス                     | 内容                                             |
| ------------------------ | ------------------------------------------------ |
| `__tests__/unit/`        | 単体テスト                                       |
| `__tests__/integration/` | 統合テスト                                       |
| `__tests__/mocks/`       | モック関数（auth, prisma, next, resend, stripe） |
| `__tests__/fixtures/`    | テストデータ（users, reservations）              |
| `__tests__/helpers/`     | テストヘルパー（session-mock, assertions）       |
| `__tests__/setup.ts`     | グローバルセットアップ（env 設定）               |
| `e2e/`                   | E2E テスト                                       |
| `playwright.config.ts`   | Playwright 設定（workers: 1, chromium のみ）     |
