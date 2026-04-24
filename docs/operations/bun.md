# Bunランタイム完全対応ガイド

> **Note**: このドキュメントには、プロジェクトがフル Bun で実行可能であることと、その実装詳細が記載されています。Codex 作業では [`AGENTS.md`](../../AGENTS.md) を入口にしてください。

---

## 概要

このプロジェクトは**フルBunで実行可能**です。開発環境から本番環境まで、すべての処理をBun 1.3.9で実行します。

### フルBunとは

- **パッケージマネージャー**: Bun（`bun install`）
- **ランタイム**: Bun（`bun run dev`、`bun run start`）
- **ビルドツール**: Bun（`bun run build`）
- **テストランナー**: Bun（`bun test`）
- **スクリプト実行**: Bun（`bunx`）

---

## 対応状況

### ✅ 完全対応

| 機能                   | 状態 | 備考                                             |
| ---------------------- | ---- | ------------------------------------------------ |
| パッケージ管理         | ✅   | `bun install`で依存関係を管理                    |
| 開発サーバー           | ✅   | `bun run dev`でNext.js開発サーバー起動           |
| 本番ビルド             | ✅   | `bun run build`でNext.jsアプリケーションをビルド |
| 本番サーバー           | ✅   | `bun run start`でNext.jsアプリケーションを起動   |
| Prisma                 | ✅   | BunのNode.js互換性により完全動作                 |
| Prismaマイグレーション | ✅   | `bunx --bun prisma migrate`で実行可能            |
| Prisma Studio          | ✅   | `bunx --bun prisma studio`で実行可能             |
| Next.js                | ✅   | Next.js 16.1.1がBunで完全動作                    |
| Better Auth            | ✅   | Bunで完全動作                                    |
| Turbopack              | ✅   | Next.js 16のデフォルトバンドラー（Bunと統合）    |

---

## 開発環境

### セットアップ

```bash
# 依存関係のインストール
bun install

# 環境変数の設定
cp .env.example .env.local

# データベースマイグレーション
bunx --bun prisma migrate dev

# 開発サーバー起動
bun run dev
```

### 使用コマンド

すべてのコマンドはBunで実行されます：

```bash
# 開発
bun run dev          # 開発サーバー起動（Turbopack使用）

# ビルド
bun run build        # 本番ビルド（Turbopack使用）

# 本番サーバー
bun run start        # 本番サーバー起動

# テスト（ADR 0014）
bun test <path>                        # 単一ファイル（日常開発の主入口）
bun test --watch <path>                # ウォッチモード（単一ファイル指定必須）
bun test --coverage <path>             # カバレッジ参考値（単発、CI ゲートなし）
bun run test:unit                      # 全単体テスト（per-directory batch、ADR 0010）
bun run test:integration               # 全統合テスト
bun run test:all                       # 単体 + 統合

# 詳細なテスト要件については、[`testing.md`](./testing.md)を参照

# リント・型チェック
bun run lint         # ESLint実行
bun run type-check   # TypeScript型チェック

# Prisma（bunx --bun推奨）
bunx --bun prisma migrate dev    # マイグレーション作成・適用
bunx --bun prisma migrate deploy # 本番環境マイグレーション
bunx --bun prisma studio         # Prisma Studio起動
bunx --bun prisma generate       # Prismaクライアント生成
```

---

## 本番環境（Docker）

### Dockerfile構成

このプロジェクトのDockerfileは、すべてのステージでBunを使用します：

```dockerfile
# ステージ1: 依存関係インストール
FROM oven/bun:1.3.9 AS deps
RUN bun install --frozen-lockfile

# ステージ2: ビルド
FROM oven/bun:1.3.9 AS builder
RUN bunx --bun prisma generate
RUN bun run build

# ステージ3: 本番実行
FROM oven/bun:1.3.9 AS runner
CMD ["bun", "run", "start"]
```

### Cloud Runデプロイ

Cloud RunはDockerコンテナを実行できるため、Bunイメージを使用可能です：

1. **Dockerイメージのビルド**: `oven/bun:1.3.9`ベースイメージを使用
2. **Cloud Runへのデプロイ**: Dockerコンテナとしてデプロイ
3. **実行**: BunランタイムでNext.jsアプリケーションを実行

**注意**: Cloud RunはBunランタイムをネイティブサポートしていませんが、Dockerコンテナ内でBunを使用することは完全に可能です。

---

## 技術的詳細

### BunのNode.js互換性

BunはNode.js互換性があるため、以下のライブラリが動作します：

- **Prisma**: Node.js互換性により完全動作
- **Next.js**: Bunで完全動作（Next.js 16.1.1対応）
- **Better Auth**: Bunで完全動作
- **その他のNode.jsパッケージ**: ほとんどのパッケージが動作

### PrismaとBun

PrismaはBunで完全に動作します。Prisma 7では、ドライバーアダプターが必要です：

```typescript
// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**注意**: Prisma 7では、データベース接続にドライバーアダプターが必要です。Bunランタイムでも、Node.js互換性により`pg`パッケージと`@prisma/adapter-pg`が動作します。詳細は[`type-safety.md`](./type-safety.md)を参照してください。

**マイグレーション**:

```bash
# 開発環境
bunx --bun prisma migrate dev

# 本番環境
bunx --bun prisma migrate deploy
```

### Next.jsとBun

Next.js 16.1.1はBunで完全に動作します：

- **開発サーバー**: `bun run dev`でTurbopackを使用
- **本番ビルド**: `bun run build`でTurbopackを使用
- **本番サーバー**: `bun run start`でNext.jsサーバー起動

### TurbopackとBun

Next.js 16では、Turbopackがデフォルトのバンドラーとして使用されます：

- **開発環境**: Turbopackが自動的に使用される（`bun run dev`）
- **本番ビルド**: Turbopackが自動的に使用される（`bun run build`）
- **Bunとの統合**: TurbopackはBunと完全に統合されて動作

---

## パフォーマンス

### Bunの利点

1. **高速なパッケージインストール**: npm/yarnより大幅に高速
2. **高速なスクリプト実行**: Node.jsより高速
3. **統合ツール**: パッケージマネージャー、ランタイム、ビルドツールが統合

### 開発環境

- **開発サーバー起動**: 高速
- **Fast Refresh**: Turbopackにより最大10倍高速化
- **ホットリロード**: 高速な応答性

### 本番環境

- **ビルド時間**: Turbopackにより2-5倍高速化
- **起動時間**: Bunの高速起動
- **実行パフォーマンス**: Node.js互換性を保ちながら高速実行

---

## トラブルシューティング

### Prisma関連

**問題**: Prismaクライアントが見つからない

**解決策**:

```bash
bunx --bun prisma generate
```

### Next.js関連

**問題**: ビルドエラー

**解決策**:

```bash
# キャッシュをクリア
rm -rf .next
bun run build
```

### 依存関係関連

**問題**: パッケージのインストールエラー

**解決策**:

```bash
# ロックファイルを再生成
rm bun.lock
bun install
```

---

## 依存関係管理

Bunには、npm/pnpmに相当する情報取得系コマンドが一通り揃っており、技術スタックの最新バージョンを調べる用途に最適です。

### 方法①：bun outdated（最重要）

全体の依存関係を一覧表示します：

```bash
bun outdated
```

**出力例**:

```
Package            Current   Wanted   Latest
react              19.2.1    19.2.1    19.2.3
next               16.0.7    16.0.7    16.1.1
prisma              7.1.0     7.1.0     7.2.0
```

- **Current**: 現在のlockfileに入っている実体
- **Wanted**: package.jsonのsemver範囲内での最新
- **Latest**: 完全な最新バージョン

**評価**: npm/pnpmと比べても最速で全体把握できる。技術スタック棚卸しの第一歩として最適。

### 方法②：個別パッケージの最新情報を調べる

```bash
# パッケージ情報を取得
bun info next

# 特定フィールドだけ見る
bun info next version
bun info prisma version
```

**評価**: 技術選定・互換性確認向き。release dateや依存関係も確認可能。

### 方法③：最新版を入れた場合の影響を確認（安全）

```bash
# dry-runで最新版確認
bun add next@latest --dry-run

# 複数まとめて
bun add react@latest react-dom@latest --dry-run
```

**評価**: lockfileを汚さずに確認可能。破壊的変更の有無を読む前の事前チェック。

### 方法④：npm-check-updatesをbunで使う（最強）

Bunは`npx`相当の`bunx`を提供しています：

```bash
# 実行
bunx npm-check-updates

# メジャーアップ含めて確認
bunx npm-check-updates -u "/.*/"
```

**出力例**:

```
next       ^16.0.7  → ^16.1.1
react      ^19.2.1  → ^19.2.3
prisma      ^7.1.0  → ^7.2.0
```

**評価**: 技術スタックの世代更新チェックでは最強。AIと一緒に「上げる／据え置く」の判断をする時に最適。

### 方法⑤：ロックファイル基準で実体確認

```bash
# すべてのパッケージ
bun pm ls

# 特定パッケージ
bun pm ls react
```

**評価**: Cloud Run/CI/本番で実際に使われる実体確認用。package.jsonではなくlockfile基準。

### 実務での推奨フロー

Next.js/Prisma/Bun/Cloud Run環境前提での黄金ルート：

```bash
# ① 全体把握
bun outdated

# ② 重要ライブラリの詳細確認
bun info next version
bun info prisma version

# ③ 影響範囲チェック
bun add next@latest --dry-run

# ④ 世代更新判断
bunx npm-check-updates
```

### 注意点（重要）

- **Bunはlockfile（bun.lock）を最優先**: CI/Cloud Runでは`bun install --frozen-lockfile`推奨
- **Bun 1.2以降**: `bun.lock`（テキスト形式、JSONC）がデフォルト。`bun.lockb`（バイナリ形式）は非推奨
- **latestが必ずしも入れるべきとは限らない**: Next.js/Prisma/Reactは破壊的変更が多い
- **セキュリティ更新**: セキュリティパッチは優先的に適用（例：CVE-2025-55182対応）

### コマンド一覧

| 目的               | コマンド                             |
| ------------------ | ------------------------------------ |
| 全体の最新版確認   | `bun outdated`                       |
| 個別パッケージ詳細 | `bun info <package>`                 |
| 影響確認           | `bun add <package>@latest --dry-run` |
| 世代更新判断       | `bunx npm-check-updates`             |
| 実体確認           | `bun pm ls`                          |

---

## 参考資料

### プロジェクトドキュメント

- [`testing.md`](./testing.md) - テスト要件定義（Bun test、Playwright、テスト環境設定）

### 外部リソース

- [Bun Documentation](https://bun.sh/docs)
- [Bun + Next.js Guide](https://bun.com/guides/ecosystem/nextjs)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma + Bun](https://www.prisma.io/docs/guides/deployment)

---

## 更新履歴

- **2026-01-05**: ドキュメント整理・統合
  - 旧 `CLAUDE.md` 参照を Codex 向け導線へ更新
  - 重複情報を削除
