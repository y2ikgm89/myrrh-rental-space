# CLAUDE.md - Claude Code 設定

> このファイルは Claude Code がプロジェクトを理解するためのコンテキストを提供します。

## プロジェクト概要

**Myrrh Rental Space** - レンタルスペース予約管理システム

レンタルスペースの予約、管理、公開ページを提供するフルスタック Web アプリケーションです。

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.1.1 |
| UI ライブラリ | React | 19.2.3 |
| 言語 | TypeScript | 5.9.3 |
| ランタイム | Bun | 1.3.5 |
| ORM | Prisma | 7.2.0 |
| データベース | PostgreSQL (Supabase) | 16 |
| 認証 | Auth.js (NextAuth v5) | 5.0.0-beta.30 |
| スタイリング | Tailwind CSS | 4.x |
| バリデーション | Zod | 4.3.5 |
| アニメーション | Motion, GSAP | 12.x, 3.x |
| 3D/2D | Three.js, Pixi.js | 0.182.0, 8.x |

## コマンド

```bash
# 開発サーバー起動
bun dev

# ビルド
bun run build

# 本番サーバー起動
bun start

# 型チェック
bun run type-check

# Lint
bun run lint

# Prisma マイグレーション（Prisma 7）
bunx prisma migrate dev --name <migration-name> --config prisma/prisma.config.ts

# Prisma Client 生成
bunx prisma generate

# Prisma Studio（DB GUI）
bunx prisma studio
```

## ディレクトリ構造

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/          # 公開ページ
│   │   ├── page.tsx       # ホームページ
│   │   ├── reservation/   # 予約ページ
│   │   ├── spaces/        # スペース詳細
│   │   ├── contact/       # お問い合わせ
│   │   ├── blog/          # ブログ
│   │   └── news/          # お知らせ
│   ├── admin/             # 管理画面
│   │   ├── dashboard/     # ダッシュボード
│   │   ├── reservations/  # 予約管理
│   │   ├── spaces/        # スペース管理
│   │   ├── blog/          # ブログ管理
│   │   └── settings/      # 設定
│   └── api/               # API Routes
├── components/            # React コンポーネント
│   ├── ui/               # 汎用 UI コンポーネント
│   ├── forms/            # フォームコンポーネント
│   └── layouts/          # レイアウトコンポーネント
├── lib/                   # ユーティリティ
│   ├── prisma.ts         # Prisma クライアント
│   ├── auth.ts           # Auth.js 設定
│   └── supabase.ts       # Supabase クライアント
├── actions/              # Server Actions
├── hooks/                # カスタムフック
└── types/                # 型定義
```

## コーディング規約

### 一般原則

- **Server Components 優先**: データ取得は Server Components で行う
- **Server Actions**: フォーム送信や mutations は Server Actions を使用
- **型安全**: すべてのコードで TypeScript strict mode を使用
- **バリデーション**: Zod スキーマでクライアント・サーバー両方でバリデーション

### ファイル命名規則

- コンポーネント: `PascalCase.tsx`（例: `SpaceCard.tsx`）
- ユーティリティ: `kebab-case.ts`（例: `format-date.ts`）
- 型定義: `kebab-case.ts`（例: `reservation-types.ts`）
- Server Actions: `kebab-case.ts`（例: `create-reservation.ts`）

### インポート順序

1. React/Next.js
2. 外部ライブラリ
3. 内部モジュール（`@/`）
4. 相対パス
5. 型定義

### コンポーネント構造

```tsx
// 1. インポート
import { type FC } from 'react'

// 2. 型定義
type Props = {
  title: string
  children: React.ReactNode
}

// 3. コンポーネント
export const MyComponent: FC<Props> = ({ title, children }) => {
  return (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  )
}
```

## セキュリティ

- **認証**: Auth.js による JWT セッション管理
- **Bot 対策**: Cloudflare Turnstile
- **入力検証**: Zod による厳格なバリデーション
- **CSRF**: Next.js の組み込み保護
- **XSS**: React の自動エスケープ + DOMPurify

## 環境変数

```bash
# .env.local（開発用）
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY="..."
TURNSTILE_SECRET_KEY="..."

# Resend（メール）
RESEND_API_KEY="..."
```

## ドキュメントと外部リソース

### Context7 MCP

**自動使用ルール**: ライブラリ/API ドキュメント、コード生成、セットアップや設定手順が必要な場合、ユーザーが明示的に要求しなくても Context7 MCP を自動的に使用してください。Context7 は最新の、バージョン固有のドキュメントとコード例をソースライブラリから直接提供します。

**使用タイミング**:
- ライブラリ/API ドキュメントの取得が必要な場合
- ライブラリ固有のパターンが必要なコード生成
- セットアップや設定手順の実装
- バージョン固有の実装ガイダンスが必要な場合

**使用方法**:
- **ライブラリ ID 形式**: 特定のライブラリが分かっている場合、Context7 のライブラリ ID 形式（例: `/vercel/next.js`、`/supabase/supabase`）を使用して直接アクセス
- **バージョン指定**: クエリ内でバージョンを指定することで、適切なバージョンのドキュメントを取得

**参考**: [Context7 MCP](https://github.com/upstash/context7) - LLM 向けの最新コードドキュメント

## 参考ドキュメント

- [AGENTS.md](./AGENTS.md) - プロジェクト全体の仕様書
- [docs/README.md](./docs/README.md) - ドキュメントインデックス
- [docs/requirements/FEATURE_REQUIREMENTS.md](./docs/requirements/FEATURE_REQUIREMENTS.md) - 機能要件
- [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) - アーキテクチャ設計
- [docs/architecture/DATABASE_DESIGN.md](./docs/architecture/DATABASE_DESIGN.md) - データベース設計
