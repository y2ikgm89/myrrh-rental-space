# 001: アーキテクチャ改善計画

## 概要

プロジェクト全体を公式ベストプラクティスに準拠させるための改善計画。

## 精査結果サマリー

### 総合スコア: 4.2/5 ⭐⭐⭐⭐

| カテゴリー        | スコア | 状態              |
| ----------------- | ------ | ----------------- |
| App Router構成    | 5/5    | ✅ 最適           |
| Server/Client分離 | 4/5    | ✅ 良好           |
| Server Actions    | 5/5    | ✅ 最適           |
| 認証/認可         | 5/5    | ✅ 最適           |
| バリデーション    | 5/5    | ✅ 最適           |
| Prisma 7          | 4/5    | ⚠️ 軽微な改善必要 |
| TypeScript設定    | 3/5    | ⚠️ 改善必要       |
| Tailwind CSS 4    | 4/5    | ⚠️ 軽微な修正必要 |

## 改善項目

### 高優先度

#### 1. tsconfig.json の target 更新

- **現状**: `"target": "ES2017"`
- **問題**: Node.js 18+では ES2022 が推奨。最新のECMAScript機能が使えない
- **修正**: `"target": "ES2022"` に更新

#### 2. globals.css のフォント変数修正

- **現状**: `--font-sans: var(--font-geist-sans)` が未定義の変数を参照
- **問題**: layout.tsx では `--font-noto-sans-jp` を使用しているが不一致
- **修正**: `--font-sans: var(--font-noto-sans-jp)` に修正

#### 3. Prisma Pool 接続設定の強化

- **現状**: 接続タイムアウトが未設定（pg デフォルト: 0=無限）
- **問題**: 本番環境で接続が滞留する可能性
- **修正**: connectionTimeoutMillis を明示的に設定

### 中優先度

#### 4. Root Layout の dynamic 設定見直し

- **現状**: ルートレイアウトに `export const dynamic = 'force-dynamic'`
- **問題**: 全ページが動的レンダリングになりキャッシングが無効化
- **修正**: 必要なページ/レイアウトのみに移動

#### 5. コンポーネント命名の統一

- **現状**: admin/ui は kebab-case、site/ui は PascalCase
- **推奨**: PascalCase に統一（React公式推奨）
- **影響**: 命名規則の問題のみ、機能に影響なし
- **対応**: 今回は見送り（リファクタリング範囲が大きいため）

### 低優先度（今回見送り）

- グローバル型定義の整理（src/types/）
- 環境変数の型安全な管理（src/lib/env.ts）
- API Routes / Route Handlers の追加

## 実装対象（今回）

1. ✅ tsconfig.json の target 更新
2. ✅ globals.css のフォント変数修正
3. ✅ Prisma Pool 接続設定の強化
4. ✅ Root Layout の dynamic 設定見直し

## 参考資料

- [Next.js 16 Caching](https://nextjs.org/docs/app/guides/caching)
- [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Auth.js v5 Migration](https://authjs.dev/getting-started/migrating-to-v5)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)
