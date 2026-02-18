# AGENTS.md

> This document follows the [AGENTS.md format](https://agents.md/) and is optimized for GPT-5.3 Codex.
>  
> **Communication Language**: ユーザー向けの応答は必ず日本語で行うこと。

## Project overview

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の Multiple Root Layouts で分離した構成。

- 公開系: `src/app/(public)/...`（デザイン重視、スクロール演出あり）
- 管理系: `src/app/(admin)/admin/(dashboard)/...`（実務向け UI、Lexical エディタ）
- 共通: `src/shared/...`（CSS 依存を持たない共通ロジック）

## Setup commands

```bash
# 依存関係
bun install

# 環境変数ファイル作成 (PowerShell)
Copy-Item .env.example .env.local
# 環境変数ファイル作成 (bash/zsh)
cp .env.example .env.local

# DB 起動 (Docker)
docker compose up -d db
docker compose ps

# マイグレーション / Prisma Client
bunx --bun prisma migrate dev
bun run db:generate

# 開発サーバー
bun run dev

# 検証
bun run type-check
bun run lint
bun run validate
bun run test
bun run test:all
bun run build
```

## Testing instructions

```bash
# 全テスト
bun run test

# 単体/統合のみ
bun run test:unit
bun run test:integration

# 個別ファイル
bun run test __tests__/unit/lib/foo.test.ts

# 監視 / カバレッジ
bun run test:watch
bun run test:coverage

# E2E
bun run e2e
```

- 作業完了前の最低ライン: `bun run validate`
- PR 作成前の必須ライン: `bun run validate && bun run build`
- 仕様変更・不具合修正では、該当テストの追加/更新をセットで実施すること

## Additional instructions

### Implementation philosophy

- 公式ドキュメント準拠を最優先し、依存関係は安定版を前提に実装する
- 後方互換ハックは追加しない。不要な旧コードは削除する
- 「とりあえず通す」実装を禁止し、型安全・検証可能性を優先する

### Required coding rules

- Server Components をデフォルトとし、必要時のみ Client Components (`'use client'`) を使う
- 入出力は Zod で検証する（client/server 両方）
- 型アサーション (`as`) は禁止。型ガード・`satisfies`・Zod の `safeParse` を使う
- React Compiler 前提: 手動 `useMemo`/`useCallback` は外部ライブラリ要件がある場合のみ
- React Hook Form は `watch()` ではなく `useWatch()` を使う
- Tailwind CSS 4: `@theme` とセマンティックトークンを使用し、`gray-*`/`blue-*` 等のハードコード色を避ける
- 命名規則: コンポーネントは `PascalCase.tsx`、ユーティリティ/バリデーションは `kebab-case.ts`
- インポートはエイリアス優先: `@/admin/*`, `@/public/*`, `@/shared/*`

### Architecture boundaries

- ルートレイアウト間（Public ↔ Admin）遷移はフルリロード前提
- UI/CSS の責務を跨いだ共通化はしない（共通化は `src/shared` のみ）
- 管理画面専用実装は `@/admin/*` に閉じる
- 公開画面専用実装は `@/public/*` に閉じる

### Data, auth, and security constraints

- Prisma は Edge Runtime 非対応。API Routes / Server Actions は Node.js/Bun ランタイムで実装
- Better Auth は `better-auth/adapters/prisma` を使用
- 権限制御が必要な管理系 Server Action では `checkPermission()` / `checkAdminAuth()` を必須化
- 監査対象操作は `logAction()` を必ず残す
- 秘密情報は `.env.local`（開発）と Secret Manager（本番）で管理し、ハードコードしない
- JSON/JSON-LD は必ずサニタイズ・バリデーションする

### Caching rules

- データ取得は `'use cache'` + `cacheTag()` を基本とする
- 更新直後の整合性が必要な操作は `updateTag()` を使う
- 遅延再検証でよい場合は `revalidateTag()` を使う
- キャッシュタグ文字列は直書きせず、`@/shared/lib/constants/cache.ts` の `CACHE_TAGS` を使用

### Animation and visual effects

- Reduced Motion 対応は `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` を使う
- 視覚効果は段階的フォールバックを維持する: L1 CSS → L2 GSAP → L3 Three.js → L4 PixiJS
- GPU 性能差を考慮し、常に下位レベルへの退避経路を用意する

### Delivery checklist for agents

変更を返す前に以下を確認すること。

1. 要件に対して不要な後方互換コード・デッドコードを残していない
2. 追加/変更した入出力が Zod で検証されている
3. 影響範囲に応じてテストを更新し、最低 `bun run validate` を通している
4. アーキテクチャ変更を伴う場合は `docs/architecture/` と `docs/requirements/` を更新している

### Instruction file operation

- サブディレクトリ固有ルールが必要な場合は、対象ディレクトリ直下に `AGENTS.override.md` を置く
- `AGENTS.override.md` があるディレクトリでは、同階層の `AGENTS.md` より override を優先する前提で運用する
- 指示が競合する場合は、ユーザーの直接指示を最優先とする

### Codex skill operation

- Codex 用スキルはリポジトリ直下の `.agents/skills/<skill-name>/SKILL.md` に配置する
- `SKILL.md` の frontmatter は `name` と `description` のみを使用する
- ルールの一次情報は `AGENTS.md` / `AGENTS.override.md` とし、詳細資料は `docs/reference/` に置く
- `.claude/rules` と `.claude/skills` は Codex の参照対象にしない（後方互換レイヤーは作らない）

## Additional documentation

- `docs/architecture/` : アーキテクチャ、DB 設計、キャッシュ戦略
- `docs/requirements/` : 機能要件
- `docs/plans/` : 実装計画
- `docs/reference/` : 詳細ルール
