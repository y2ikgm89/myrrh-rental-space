# 0004. `@next/bundle-analyzer` から Turbopack-native `experimental-analyze` に移行

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: performance, build, tooling

## Context and Problem Statement

プロジェクトは Next.js 16 の Turbopack を使用している（`dev --turbopack`、`next build` は Turbopack default）。しかし bundle size 解析に `@next/bundle-analyzer`（webpack 専用 plugin）を使用していた:

```ts
// next.config.ts
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});
export default withBundleAnalyzer(nextConfig);
```

`@next/bundle-analyzer` は webpack の plugin API に依存しているため、Turbopack builds では実態のあるレポートを生成できず、実質的に no-op になっていた。

Next.js 16 は `next experimental-analyze` という Turbopack-native な analyzer を公式提供している（公式 CLI ドキュメント参照）。

## Decision Drivers

- Turbopack でも動作する bundle analysis
- Next.js 16 公式 CLI に揃える
- 既存の no-op 設定を削除してクリーンな状態に
- CI に統合可能な artifact 出力

## Considered Options

1. **Option A: `@next/bundle-analyzer` を維持（Turbopack 非対応のまま）**
2. **Option B: webpack build に一時的に切り替えて analyze**
3. **Option C: `next experimental-analyze --output` に移行**

## Decision Outcome

**Chosen option**: "Option C — `next experimental-analyze --output`"

### 実装

1. **`next.config.ts`**: `@next/bundle-analyzer` の import と `withBundleAnalyzer()` wrap を削除

   ```diff
   - import bundleAnalyzer from "@next/bundle-analyzer";
     import type { NextConfig } from "next";

     const nextConfig: NextConfig = { ... };

   - const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
   - export default withBundleAnalyzer(nextConfig);
   + export default nextConfig;
   ```

2. **`package.json`**: `analyze` script 追加、`@next/bundle-analyzer` dep 削除

   ```json
   {
     "scripts": {
       "analyze": "bun run db:generate && next experimental-analyze --output"
     }
   }
   ```

3. **`.github/workflows/ci.yml`**: 新規 `bundle-analysis` job 追加
   - PR + main/develop push で実行
   - `bun run analyze` → `.next/diagnostics/analyze/` 生成
   - artifact `bundle-analysis-{PR番号 or SHA}` に 30 日保存

### Consequences

**良い点**:

- Turbopack ビルドで実態のある bundle 解析が可能
- Next.js 16 公式 CLI に完全準拠
- `.next/diagnostics/analyze/` に静的 HTML レポート出力（browser で閲覧可能）
- CI artifact として保存、PR 毎に差分確認可能
- 依存から webpack-only package を削除、クリーンな状態

**悪い点 / トレードオフ**:

- `experimental-analyze` は experimental CLI（将来の仕様変更リスク）
- `@next/bundle-analyzer` に慣れた開発者は新 CLI の使い方を学ぶ必要

### Compliance / Validation

- `CLAUDE.md` のコマンド表に `bun run analyze` 追加
- `CONTRIBUTING.md` に使用手順記載
- CI の `bundle-analysis` job で毎 PR に artifact 自動生成
- PR には別途 `bundle-size-diff` job で PR コメントに差分投稿

## Pros and Cons of the Options

### Option A: `@next/bundle-analyzer` 維持

- ✅ 既存設定そのまま
- ❌ Turbopack では no-op、実態のある解析不可
- ❌ 不要な依存を残す

### Option B: webpack build に一時切替

- ✅ `@next/bundle-analyzer` が動く
- ❌ プロジェクトの dev / prod ビルドが Turbopack なので結果が乖離
- ❌ 運用が複雑化

### Option C: `next experimental-analyze --output` ✅ 採用

- ✅ Turbopack-native、公式推奨
- ✅ CI 統合が簡単
- ⚠️ experimental CLI だが stable 化が計画されている

## Links / References

- [Next.js 16 CLI `experimental-analyze` 公式ドキュメント](https://nextjs.org/docs/app/api-reference/cli/next#next-experimental-analyze)
- `next.config.ts`, `package.json`, `.github/workflows/ci.yml`
- 関連 ADR: [0002 Prisma type-only gateway](./0002-prisma-type-only-gateway.md)（同じセッションでの破壊的変更）
