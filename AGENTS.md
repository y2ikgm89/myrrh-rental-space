# AGENTS.md

> This document follows the [AGENTS.md format](https://agents.md/) and is optimized for GPT-5.3 Codex.
>
> **Communication Language**: ユーザー向けの応答は必ず日本語で行うこと。

## Project overview

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の Multiple Root Layouts で分離した構成。

- 公開系: `src/app/(public)/...`（デザイン重視、スクロール演出あり）
- 管理系: `src/app/(admin)/admin/(dashboard)/...`（実務向け UI、Lexical エディタ）
- 共通: `src/shared/...`（CSS 依存を持たない共通ロジック）

### Tech stack

下記バージョンは `package.json` / `bun.lock` で現在解決されている実ランタイムに合わせる。

| 技術         | バージョン | 備考                                   |
| ------------ | ---------- | -------------------------------------- |
| Next.js      | 16.2.3     | `'use cache'`, `updateTag`, PPR 対応   |
| React        | 19.2.5     | React Compiler 1.0, `useEffectEvent`   |
| TypeScript   | 6.0.2      | `target: es2025`, `erasableSyntaxOnly` |
| Bun          | 1.3.11     | `bun:test`, `packageManager` と一致    |
| Prisma       | 7.7.0      | WASM, mapped enums                     |
| Better Auth  | 1.6.1      | RBAC, Google/LINE OAuth                |
| Tailwind CSS | 4.2.2      | CSS-first, @theme                      |
| Zod          | 4.3.6      | `{ error: }` パラメータ                |

### Project structure

```
src/
├── app/
│   ├── (admin)/                          # 管理画面ルートグループ
│   │   ├── layout.tsx                    # Admin Root Layout (html/body)
│   │   └── admin/(dashboard)/_shared/    # 管理画面共有コンポーネント
│   └── (public)/                         # 公開ページルートグループ
│       ├── layout.tsx                    # Public Root Layout
│       └── _shared/                      # 公開ページ共有コンポーネント
└── shared/                               # 両方で共有（CSS変数非依存）
```

Path aliases: `@/*` → `src/*`, `@generated/*` → `generated/*`, `@/admin/*`, `@/public/*`, `@/shared/*`

## Setup commands

```bash
bun install
bunx --bun prisma migrate dev
bun run db:generate
bun prisma/seed.ts
bun run dev
```

## Testing instructions

```bash
bun run test                    # 全テスト
bun run test:unit               # 単体のみ
bun run test:integration        # 統合のみ
bun run validate                # type-check → lint
bun run validate && bun run build  # 完全検証
bun run e2e                     # Playwright E2E
```

- 作業完了前の最低ライン: `bun run validate`
- PR 作成前: `bun run validate && bun run build`

## Required coding rules

- Server Components をデフォルトとし、必要時のみ `'use client'`
- 入出力は Zod で検証する。エラーメッセージは `{ error: 'msg' }` 形式（Zod 4）
- 型アサーション (`as`) 禁止。型ガード・`satisfies`・Zod `safeParse` を使う
- React Compiler 前提: 手動 `useMemo`/`useCallback` は原則禁止
- `forwardRef` 禁止（React 19 では ref は通常の prop）
- React Hook Form は `watch()` ではなく `useWatch()`
- Tailwind CSS 4: `@theme` とセマンティックトークン使用、ハードコード色禁止
- Bun Test を使用（`bun:test` から import）
- 命名: コンポーネント `PascalCase.tsx`、ユーティリティ `kebab-case.ts`

## Architecture boundaries

- ルートレイアウト間（Public ↔ Admin）遷移はフルリロード前提
- 管理画面専用は `@/admin/*`、公開画面専用は `@/public/*` に閉じる
- 業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*`
- 管理 write 系 Server Action は `executeAdminMutationResult` 必須（認証・権限・監査ログ一括処理）
- API Route のみ `checkPermission()` 直接使用
- `src/app/` から `@/shared/db/prisma` を直接 import しない（例外: `calendar-sync` の `$queryRaw`）

## Data, auth, and security constraints

- Prisma `$extends` の正本は `src/shared/db/create-app-prisma-client.ts`
- Better Auth: `prismaAdapter(basePrisma)` + `generateId: "uuid"` + `baseURL` 明示
- `@/shared/lib/errors/logger` は `server-only`。seed/CLI では `logger-core` を使う
- キャッシュ: `'use cache'` + `cacheTag()` 基本、`updateTag()` で read-your-own-writes
- 監査対象操作は `logAction()` 必須

## Delivery checklist

1. 不要な後方互換コード・デッドコードを残していない
2. 追加/変更した入出力が Zod で検証されている
3. 最低 `bun run validate` を通している
4. アーキテクチャ変更時は `docs/architecture/` を更新

## Rule files reference

詳細ルールは `.claude/rules/`（正本）に配置。`paths:` フロントマターで条件付き自動ロード。主要ファイル:

| ルール                            | 内容                       |
| --------------------------------- | -------------------------- |
| `gotchas.md`                      | プロジェクト固有の落とし穴 |
| `react-patterns.md`               | React 19.2 / Compiler      |
| `server-actions.md`               | 'use cache' / updateTag    |
| `type-safety.md`                  | TS 6.0 / noUncheckedIndex  |
| `auth-patterns.md`                | Better Auth / RBAC         |
| `lexical-patterns.md`             | Lexical エディタ           |
| `admin-inline-editor-patterns.md` | Post/News メタデータパネル |
| `admin-ui-patterns.md`            | 管理画面 UI パターン       |

## Codex skill operation

- Codex 用スキルは `.claude/skills/<name>/SKILL.md` に配置
- `SKILL.md` の frontmatter は `name` と `description` のみ使用
- 1 skill = 1 workflow、複数 unrelated task をまとめない
- `description` には「いつ使うか」「何をしないか」の境界を書く
- 詳細は `.claude/skills/README.md` 参照

## Additional documentation

- `docs/architecture/agent-instructions.md`: AI 向け指示の配置
- `docs/architecture/`: アーキテクチャ、DB 設計、キャッシュ戦略
- `docs/reference/codex-rules/`: 詳細ルール
- `.claude/skills/README.md`: Codex スキルの索引と作成基準
