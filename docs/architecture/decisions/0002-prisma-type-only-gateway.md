# 0002. Prisma re-export gateway を type-only + browser entry に切替

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: architecture, prisma, build-safety, performance

## Context and Problem Statement

Prisma 7 `prisma-client` generator は複数の entry point を提供する:

- `@generated/prisma/client` — PrismaClient class + 全 runtime helpers（**server-only**）
- `@generated/prisma/browser` — client-safe な型 + runtime sentinel（`PrismaClient` なし）
- `@generated/prisma/enums` — enum 値のみ

プロジェクトの gateway `src/shared/lib/validations/enums/prisma-types.ts` は初期版で以下のように実装されていた:

```ts
export { Prisma, PrismaClient } from "@generated/prisma/client";  // ❌ 値 re-export
export { Role, ReservationStatus, ... } from "@generated/prisma/enums";
```

これにより `shared/types/prisma.ts:10` での `export { LayoutWidth }` を経由して Client Component（`ContactInfoSection.tsx` / `FaqItemTable.tsx` 等）が gateway を間接 import すると、Turbopack のモジュールグラフが `@generated/prisma/client` 全体を pull し、`node:module` 解決エラーでビルドが失敗していた。

さらに **参照同一性 footgun** が存在した: `browser` entry と `client` entry は内部で異なる runtime モジュール（`runtime/index-browser` vs `runtime/client`）を使用しており、`Prisma.JsonNull` / `DbNull` / `AnyNull` は Prisma 4+ から unique object として実装されているため、両 entry で **別オブジェクト参照** になる。Prisma client は identity 比較で sentinel を判定するため、gateway 経由（browser 由来）の sentinel を渡すと認識されず silent bug になる。

## Decision Drivers

- Client Component ビルド失敗の恒久的解消
- Prisma 7 公式 browser entry のベストプラクティス準拠
- 参照同一性 footgun の物理的排除（型のみに限定して誤用不可能に）
- 既存の `shared/db/` / `shared/domain/` からの runtime 値アクセスを維持
- architecture-boundaries テストで境界強制継続

## Considered Options

1. **Option A: `export type` で client entry から型のみ re-export**
2. **Option B: gateway を削除して各所で直接 import**
3. **Option C: browser entry に切替 + 値 re-export**
4. **Option D: browser entry に切替 + type-only re-export**

## Decision Outcome

**Chosen option**: "Option D — browser entry + type-only re-export"

```ts
// src/shared/lib/validations/enums/prisma-types.ts
export type { Prisma } from "@generated/prisma/browser";
export { Role, ReservationStatus, ... } from "@generated/prisma/enums";
```

この実装は以下を達成:

- `verbatimModuleSyntax: true` 下で `export type` は完全に erase される
- browser entry からの型取得で `node:module` 依存なし
- runtime 値（`JsonNull` / `DbNull` / `join` / `sql` / `raw`）は `shared/db/` / `shared/domain/` が `@generated/prisma/client` から直接 import（allowlist で許可）
- gateway 経由で `Prisma.JsonNull` を取得することが型レベルで不可能になり、参照同一性 footgun を物理的に排除

### Consequences

**良い点**:

- Turbopack ビルドが恒久的に修正
- Prisma 7 公式 browser entry パターンに完全準拠
- runtime sentinel の誤用が型レベルで不可能
- 186 ファイルの import を壊さない段階的移行（`import type { Prisma }` は両 entry で同じ型を取得）
- `architecture-boundaries.test.ts` に 3 新規 assertion 追加で回帰防止

**悪い点 / トレードオフ**:

- runtime 値が必要なコードは `@generated/prisma/client` から直接 import する必要（ただし allowlist 内の `shared/db/` / `shared/domain/` のみ）
- browser entry / client entry / enums entry の 3 分離を開発者が理解する必要

### Compliance / Validation

以下で強制される:

1. `__tests__/unit/architecture-boundaries.test.ts`:
   - gateway ファイルが `@generated/prisma/client` を import しない（コメント除外）
   - gateway が `Prisma` を値として re-export しない
   - gateway が `PrismaClient` を含まない
   - `new PrismaClient()` 呼び出しは `shared/db/prisma.ts` のみ許可
   - `shared/db/prisma.ts` は `basePrisma` と `prisma` の両方を export

2. ドキュメント:
   - `CLAUDE.md` SSoT テーブルに browser entry の説明を明記
   - `.claude/rules/prisma-patterns.md` の gotchas に参照同一性 footgun を記述
   - `.claude/rules/gotchas.md` に同じ gotcha を重複記載（自動ロードで毎セッション参照）

3. CI:
   - `bun run build` で Turbopack Client bundle が成功することを検証
   - CodeQL security-extended で間接的な脆弱性検出

## Pros and Cons of the Options

### Option A: `export type` で client entry から型のみ re-export

- ✅ 変更最小、型情報は取れる
- ❌ Prisma 7 公式 browser entry を活用していない
- ❌ コメントアウトや書き換えで誤って値 re-export に戻るリスク

### Option B: gateway を削除して各所で直接 import

- ✅ シンプル
- ❌ architecture-boundaries の境界強制が弱まる
- ❌ 186 ファイル分の import 書き換え

### Option C: browser entry + 値 re-export

- ✅ browser entry の公式推奨
- ❌ **参照同一性 footgun が残る** — gateway 経由の `Prisma.JsonNull` が silent bug を引き起こす

### Option D: browser entry + type-only re-export ✅ 採用

- ✅ ビルド失敗の解消 + 公式準拠 + 誤用物理的排除
- ✅ 回帰防止 assertion で恒久対応
- ⚠️ 3 つの entry 理解が必要（ただし少数の server-only code のみ）

## Links / References

- [Prisma 7 prisma-client generator](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)
- [Prisma 4 JsonNull is unique object 公式アナウンス](https://www.prisma.io/docs/orm/reference/prisma-client-reference#jsonnull)
- 実装: `src/shared/lib/validations/enums/prisma-types.ts`
- テスト: `__tests__/unit/architecture-boundaries.test.ts`
- `CLAUDE.md` SSoT テーブル
- `.claude/rules/prisma-patterns.md` / `.claude/rules/gotchas.md`
