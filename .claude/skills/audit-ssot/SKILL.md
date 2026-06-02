---
name: audit-ssot
description: プロジェクト全体のSSoT違反（ゼロ値型エイリアス、値エイリアス re-export、同一定数の複数定義）を検出する。定期メンテ時に使用。
when_to_use: 大規模リファクタ後、または月次定期メンテ時。SSoT 違反の横断チェックが必要なとき。
context: fork
agent: Explore
disallowed-tools: AskUserQuestion
---

# SSOT 監査

プロジェクト全体を走査し、Single Source of Truth 違反を検出する。

## チェックルール

### 1. ゼロ値型エイリアス

フィールド追加なしの型リネーム。CLAUDE.md §型・コード品質で禁止。

```bash
# 検出コマンド
grep -rnE '^export type [A-Z]\w+ = [A-Z]\w+;$' src/ --include='*.ts' --include='*.tsx'
```

**除外パターン**（違反ではない）:

- `z.infer<...>` — Zod 型推論
- `& { ... }` / `| ...` — Intersection / Union
- `<...>` — ジェネリクス適用
- `Omit<...>` / `Pick<...>` / `Partial<...>` — ユーティリティ型
- `ConvertDecimalFields<...>` — Prisma Decimal 変換型
- `Awaited<ReturnType<...>>` — 戻り値型推論

### 2. 値エイリアス re-export

同一参照に別名をつけた `export const`:

```bash
# 検出コマンド
grep -rnE '^export const [a-zA-Z]+ = [a-zA-Z]+;$' src/ --include='*.ts' --include='*.tsx'
```

**除外パターン**:

- 数値・文字列リテラル（`export const X = 42;`）
- 関数呼び出し結果（`export const X = createFoo();`）

### 3. 型 re-export リネーム

```bash
# 検出コマンド
grep -rnE 'export type \{ .+ as .+ \} from' src/ --include='*.ts' --include='*.tsx'
```

### 4. 同一定数リストの複数定義

ロール一覧・ステータス一覧など、同じ enum 値の配列が複数箇所に定義されていないか:

```bash
# DASHBOARD_ROLES 重複チェック（SSOT: @/shared/lib/admin-auth）
grep -rn 'DASHBOARD_ROLES\|ADMIN_ROLES' src/ --include='*.ts' --include='*.tsx'

# ステータスラベル重複チェック（SSOT: enums/helpers.ts）
grep -rn 'STATUS_LABELS' src/ --include='*.ts' --include='*.tsx' | grep -v 'from.*enums'
```

## 実行手順

1. 上記4種の grep を実行し違反を収集
2. 各違反について消費者数を確認（`grep -rn '<alias名>' src/`）
3. 消費者ゼロ → デッドコード即削除
4. 消費者あり → 元の型/値への直接参照に書き換え
5. `bun run validate` で検証
6. 残存ゼロを grep で確認

## SSOT 定数一覧（参照）

CLAUDE.md §SSOT 定数・シングルトン を参照:

| 定数                         | 場所                      | 用途                             |
| ---------------------------- | ------------------------- | -------------------------------- |
| `DASHBOARD_ROLES`            | `@/shared/lib/admin-auth` | ダッシュボードアクセス可能ロール |
| `prisma` / `basePrisma`      | `@/shared/db/prisma`      | Prisma クライアント              |
| `CACHE_TAGS` / `getCacheTag` | `@/shared/lib/constants`  | キャッシュタグ                   |
| `CACHE_LIFE`                 | `@/shared/lib/constants`  | キャッシュライフ                 |

## 過去の検出事例

- `ADMIN_ROLES` が `auth.ts`・`permissions.ts`・`login/page.tsx` の3箇所に重複 → `DASHBOARD_ROLES` に統一
- `prismaForBetterAuth = basePrisma` — 値エイリアス → `basePrisma` 直接 export に変更
- `TaxSettingsData = TaxSettings` — ゼロ値型エイリアス、4消費者 → 全て `TaxSettings` に統一
- `SidebarSettingsInput = SidebarSettings` — 同上
- `CreateNewsCommandInput = BaseNewsCommandInput` — 同上
- `SystemPagesDbClient = AppPrismaClient` — デッドコード（消費者あったが同ファイル内のみ）
- `PagesListParams = PageListQueryParams` — 同上
- `TaxonomySortField = PostTaxonomySortField` — ゼロ値型エイリアス
- `adminPageParsers = adminPageSearchParamsParsers` — 値エイリアス、消費者ゼロ
