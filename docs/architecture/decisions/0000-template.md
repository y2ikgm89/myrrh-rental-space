# NNNN. ADR タイトル（kebab-case、英語推奨）

- **Status**: Proposed | Accepted | Deprecated | Superseded by [ADR-XXXX](./XXXX-title.md)
- **Date**: YYYY-MM-DD
- **Deciders**: @y2ikgm89 (+ 他のレビュアー)
- **Tags**: architecture, security, performance, etc.

## Context and Problem Statement

<!-- 2〜4 行で、何を決める必要があったか、どんな問題に直面していたかを記述 -->

例:

> Prisma 7 の `prisma-client` generator は browser-safe な entry を提供しているが、
> プロジェクトの gateway `src/shared/lib/validations/enums/prisma-types.ts` は
> server-only な `@generated/prisma/client` から値を re-export していた。これにより
> Client Component が gateway を経由すると node:module 依存がバンドルに混入し、
> Turbopack のビルドが失敗していた。

## Decision Drivers

- ドライバー 1（例: Client bundle に server-only 依存を混入させない）
- ドライバー 2（例: Prisma 7 公式ベストプラクティスに準拠）
- ドライバー 3（例: 既存の型 import を壊さない段階的移行）

## Considered Options

1. **Option A: `export type` のみに絞る（維持、現状の client entry）**
2. **Option B: gateway を削除して各所で直接 import**
3. **Option C: `@generated/prisma/browser` entry に切替 + type-only re-export**

## Decision Outcome

**Chosen option**: "Option C — browser entry + type-only re-export"、なぜなら:

- Prisma 7 公式の browser entry は PrismaClient class を含まず node:module 依存がない
- 型だけの再エクスポートは `verbatimModuleSyntax: true` で完全に erase される
- gateway 自体を残すことで architecture-boundaries による境界強制が継続できる
- 参照同一性 footgun（`JsonNull` が browser/client で別オブジェクト）を避けるため
  runtime sentinel は `shared/db/` / `shared/domain/` からのみ `client` entry を
  直接 import する規約を維持

### Consequences

**良い点**:

- Client Component ビルド失敗の恒久的な解消
- `architecture-boundaries.test.ts` で gateway 経由の値 re-export を禁止 assertion 化
- Prisma 7 公式ベストプラクティスに完全準拠

**悪い点 / トレードオフ**:

- gateway は型のみを提供するため、runtime 値を使うコードは直接 `@generated/prisma/client`
  から import する必要がある（ただし allowlist で限定）
- browser / client 両 entry の存在を開発者が理解する必要がある

### Compliance / Validation

この決定は以下で強制される:

- `__tests__/unit/architecture-boundaries.test.ts` — gateway ファイルが `@generated/prisma/client` を import しないこと、`Prisma` を値として re-export しないこと
- CI の CodeQL scan + `bun run build` での client bundle 検証
- `CLAUDE.md` SSoT テーブルと `.claude/rules/prisma-patterns.md` の gotcha 節

## Pros and Cons of the Options

### Option A: `export type` のみ（現状維持）

- ✅ 実装変更が最小
- ❌ 再発リスク: 開発者が無意識に `export { Prisma }` に戻す可能性
- ❌ Prisma 7 公式 browser entry を活用していない

### Option B: gateway 削除

- ✅ シンプル
- ❌ architecture-boundaries 境界強制が効かなくなる
- ❌ 型 import が 30+ ファイルに散らばる

### Option C: browser entry + type-only ✅ 採用

- ✅ 恒久的な解消 + 公式準拠
- ✅ 境界強制継続
- ⚠️ browser/client 分離の理解が必要

## Links / References

- [Prisma 7 prisma-client generator docs](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)
- [Prisma browser entry 公式説明](https://github.com/prisma/prisma/blob/main/docs/generators.md)
- 関連 PR: #NNN
- 関連 Issue: #NNN
