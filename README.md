# Myrrh Rental Space

レンタルスペースの予約・運営管理システムです。公開サイトと管理画面を Next.js 16 の Multiple Root Layouts で分離し、業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*` に閉じ込めています。

## 技術スタック

| カテゴリ       | 技術               | バージョン         |
| -------------- | ------------------ | ------------------ |
| フレームワーク | Next.js App Router | 16.1.6             |
| UI             | React              | 19.2.4             |
| 言語           | TypeScript         | 6.0.0-dev.20260228 |
| ランタイム     | Bun                | 1.3.10             |
| ORM            | Prisma             | 7.4.2              |
| 認証           | Better Auth        | 1.5.3              |
| スタイリング   | Tailwind CSS       | 4.2.1              |
| 検証           | Zod                | 4.3.6              |

## アーキテクチャ概要

```text
src/
├── app/
│   ├── (public)/                       # 公開ページ
│   ├── (admin)/                        # 管理画面
│   └── api/                            # 公開 API / auth / cron / webhooks
├── shared/
│   ├── db/                             # Prisma / Better Auth adapter 境界
│   ├── domain/                         # 業務ロジックと read model
│   └── lib/                            # auth / env / logger / integrations
├── instrumentation.ts
└── proxy.ts                            # coarse gate + 共通セキュリティヘッダー
```

詳細は [docs/architecture/README.md](./docs/architecture/README.md) と [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) を参照してください。

## セットアップ

### 前提条件

- [Bun](https://bun.sh/) 1.3.10 以上
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 初期構築

```bash
bun install
cp .env.example .env.local
docker compose up -d db
bunx --bun prisma migrate dev
bun run db:generate
```

### 開発サーバー

```bash
bun run dev
```

## 主要コマンド

| コマンド                        | 説明                    |
| ------------------------------- | ----------------------- |
| `bun run dev`                   | 開発サーバー起動        |
| `bun run validate`              | `type-check` + `lint`   |
| `bun run test`                  | Bun Test 実行           |
| `bun run test:all`              | unit + integration      |
| `bun run build`                 | 本番ビルド              |
| `bun run db:generate`           | Prisma Client 生成      |
| `bunx --bun prisma migrate dev` | Prisma マイグレーション |
| `docker compose up -d db`       | 開発 DB 起動            |

作業完了前の最低ラインは `bun run validate`、コミット前の必須ラインは `bun run validate && bun run build` です。

## 実装ルール

- Server Components をデフォルトにし、Client Components は必要箇所に限定する
- `src/app/*` から Prisma client や generated Prisma 型を直接 import しない
- 入出力は Zod で検証し、エラー表現は `{ error: string }` 系に揃える
- 管理画面は read を query / route handler、write を action に分離する
- React Compiler 前提で `forwardRef` / `useMemo` / `useCallback` を常用しない

## ドキュメント

- [AGENTS.md](./AGENTS.md): Codex 向けの正本ルール
- [docs/README.md](./docs/README.md): ドキュメント一覧
- [docs/architecture/README.md](./docs/architecture/README.md): アーキテクチャ索引
- [docs/reference/codex-rules/](./docs/reference/codex-rules/): 実装ルール詳細

## ライセンス

Private
