# AGENTS.md

> Codex project instructions for this repository.
>
> **Communication Language**: ユーザー向けの応答は必ず日本語で行う。

## Codex Operating Model

- ルート `AGENTS.md` を Codex 向けプロジェクト指示の正本にする。長い反復手順はここへ増やさず `.agents/skills/<name>/SKILL.md` に分離する。
- `.agents/skills/<name>/SKILL.md` は Codex の progressive disclosure 用に保つ。frontmatter は `name` と、適用範囲 / 非適用範囲が明確な `description` のみにする。
- 明示的に subagent / 並列調査を依頼されたときだけ `.codex/agents/*.toml` の専門エージェントを使う。各 agent は `name` / `description` / `developer_instructions` を必須とし、狭い read-only / verifier 職能を基本にする。
- `.codex/rules/*.rules` はサンドボックス外コマンドの承認ルール専用。公式上 experimental なので、`prefix_rule` の `pattern` / `decision` / `justification` / `match` / `not_match` だけでコマンド方針を表し、コーディング規約は置かない。
- `.codex/hooks.json` は空設定にする。hooks は公式上 experimental かつ Windows support が一時無効なので、検証強制は `lefthook` / CI / このファイルの delivery checklist で担保する。
- `.claude/*` は残置された Claude Code 用資産として扱う。Codex 作業では参照・同期・正本扱いしない。
- ドキュメント探索中に `CLAUDE.md` や `.claude/*` へのリンクを見つけても、Codex では追跡しない。必要な情報は `AGENTS.md`、`.agents/skills/*`、`docs/architecture/*`、`docs/guides/*` の Codex 向け導線から読む。

## Project Overview

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の Multiple Root Layouts で分離する。

- 公開系: `src/app/(public)/...`（デザイン重視、スクロール演出あり）
- 管理系: `src/app/(admin)/admin/(dashboard)/...`（実務向け UI、Lexical / freeform page builder）
- 共通: `src/shared/...`（CSS 依存を持たない共通ロジック）

### Tech Stack

下記バージョンは `package.json` / `bun.lock` で現在解決されている実ランタイムに合わせる。

| 技術         | バージョン | 備考                                         |
| ------------ | ---------- | -------------------------------------------- |
| Next.js      | 16.2.4     | `'use cache'`, `updateTag`, PPR 対応         |
| React        | 19.2.5     | React Compiler 1.0, `useEffectEvent`         |
| TypeScript   | 6.0.3      | `target: es2025`, `erasableSyntaxOnly`       |
| Bun          | 1.3.13     | `bun:test`, `packageManager` と一致          |
| Prisma       | 7.8.0      | WASM, mapped enums                           |
| Better Auth  | 1.6.9      | RBAC, Google/LINE OAuth（`bun.lock` 解決版） |
| Tailwind CSS | 4.2.4      | CSS-first, `@theme`                          |
| Zod          | 4.3.6      | `{ error: }` パラメータ                      |

### Project Structure

```text
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

Path aliases: `@/*` -> `src/*`, `@generated/*` -> `generated/*`, `@/admin/*`, `@/public/*`, `@/shared/*`

## Setup Commands

```bash
bun install
bunx --bun prisma migrate dev
bun run db:generate
bun prisma/seed.ts
bun run dev
```

## Local Runtime Notes

- `rg` は `C:\Users\y2ikg\.local\bin\rg.exe` のユーザー領域版（ripgrep 15.1.0）を優先して使う。Codex Desktop 同梱の `C:\Program Files\WindowsApps\OpenAI.Codex_...\app\resources\rg.exe` は外部 PowerShell から `Access denied` になる場合があるため、WindowsApps の所有権 / ACL は変更しない。
- `rg` の確認は `Get-Command rg -All` と `rg --version` で行う。もし使えない場合は `Get-ChildItem -LiteralPath ... | Select-String ...` にフォールバックする。
- Windows PowerShell の Python は Python Install Manager 管理。`python` / `python3` は Python 3.14.4 を指す。
- Bash / WSL の `python3` は Ubuntu 管理の `/usr/bin/python3` 3.12.3 のまま使う。Ubuntu の system Python を置き換えない。
- Bash / WSL で新しい Python が必要な場合は user-level の `python3.14` または `python3-latest`（Python 3.14.2）を使う。
- Windows 側の `C:\Users\y2ikg\.local\bin\python3` は Bash 用ラッパーであり、PowerShell では使わない。

## Testing Instructions

```bash
bun run test:unit
bun run test:integration
bun run test:all
bun test <path>
bun run validate
bun run validate && bun run build
bun run e2e
```

- 作業完了前の最低ライン: `bun run validate`
- PR / release / commit 前: `bun run validate && bun run build`
- 変更範囲が明確な場合は、先に `bun test <path>` や対象 E2E を実行する。
- テスト全走は CI と `lefthook` pre-push に委ねる。毎回の手動全走は不要。

## Required Coding Rules

- Server Components をデフォルトとし、必要時のみ `'use client'` を使う。
- 入出力は Zod で検証する。エラーメッセージは `{ error: "msg" }` 形式（Zod 4）。
- 型アサーション (`as`) を避け、型ガード・`satisfies`・Zod `safeParse` を使う。
- React Compiler 前提。手動 `useMemo` / `useCallback` は、既存パターンか実測上の必要がある場合だけ使う。
- `forwardRef` は使わない。React 19 では ref を通常の prop として扱う。
- React Hook Form は `watch()` ではなく `useWatch()` を使う。
- Tailwind CSS 4 は `@theme` とセマンティックトークンを使う。ハードコード色を増やさない。
- Bun Test を使う。テストは `bun:test` から import する。
- 命名: コンポーネント `PascalCase.tsx`、ユーティリティ `kebab-case.ts`。

## Freeform Page Builder Rules

- custom page は freeform builder 一本にする。旧 Section editor との runtime 互換分岐を追加しない。
- system page は既存専用管理面を維持し、freeform builder の対象外にする。
- freeform document は `schemaVersion: 4` のみを runtime で受け付ける。旧 schema migration は本番 runtime に残さない。
- preview / public / admin canvas は同じ renderer を使う。selection frame、grid、handles、guide は admin overlay に閉じる。
- renderer は不要な wrapper、padding、editor decoration を持たない。見た目の余白は document style か editor shell で表現する。
- image node は fixed wrapper + `next/image fill` の responsive pattern を守る。
- 任意 HTML / 任意 script / custom CSS textarea は v1 で追加しない。embed は許可済み provider のみ。
- builder 変更時は `docs/architecture/freeform-page-builder-design.md` と `docs/plans/2026-04-23-freeform-page-builder-v1.md` の方針と矛盾しないか確認する。

## Architecture Boundaries

- Public <-> Admin の root layout 間遷移はフルリロード前提。
- 管理画面専用は `@/admin/*`、公開画面専用は `@/public/*` に閉じる。
- 業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*`。
- 管理 write 系 Server Action は `executeAdminMutationResult` を使う。
- API Route のみ `checkPermission()` を直接使う。
- `src/app/` から `@/shared/db/prisma` を直接 import しない（例外: `calendar-sync` の `$queryRaw`）。

## Data, Auth, Security

- Prisma `$extends` の正本は `src/shared/db/create-app-prisma-client.ts`。
- Better Auth は `prismaAdapter(basePrisma)` + `generateId: "uuid"` + `baseURL` 明示。
- `@/shared/lib/errors/logger` は `server-only`。seed / CLI では `logger-core` を使う。
- キャッシュは `'use cache'` + `cacheTag()` を基本にし、write 後は `updateTag()` で read-your-own-writes を保証する。
- 監査対象操作は `logAction()` を通す。

## Codex Project Assets

| 用途             | 置き場所                         | 備考                                                |
| ---------------- | -------------------------------- | --------------------------------------------------- |
| プロジェクト指示 | `AGENTS.md`                      | Codex が作業前に読む正本                            |
| 繰り返し手順     | `.agents/skills/<name>/SKILL.md` | frontmatter は `name` と `description` のみ         |
| 専門 subagent    | `.codex/agents/*.toml`           | 明示依頼時だけ使う。狭く、証拠ベースにする          |
| コマンド承認     | `.codex/rules/*.rules`           | `prefix_rule` による承認方針。coding rules ではない |
| hooks            | `.codex/hooks.json`              | 未採用。空設定で維持                                |

### Repository Skills

| Skill                           | 用途                                        |
| ------------------------------- | ------------------------------------------- |
| `admin-clean-break`             | 管理画面、Server Actions、mutation 変更     |
| `admin-ui-review`               | 管理画面 UI、共有 chrome、z-index、導線確認 |
| `auth-rbac-change`              | Better Auth、RBAC、admin gate、監査         |
| `freeform-page-builder`         | custom page freeform builder                |
| `lexical-editor`                | 管理画面 Lexical editor                     |
| `media-storage-change`          | media domain、R2/S3、media picker           |
| `prisma-data-change`            | Prisma schema、migration、seed、DB 境界     |
| `public-site-change`            | 公開 route、公開 UI、SEO、公開 form         |
| `project-validation`            | 完了前、PR 前、release 前の検証             |
| `codex-instruction-maintenance` | Codex ネイティブ資産の保守                  |

### Custom Agents

| Agent                   | 用途                                   |
| ----------------------- | -------------------------------------- |
| `codebase_explorer`     | read-only コードパス調査               |
| `admin_ui_reviewer`     | 管理画面 UI / レイヤー / 導線レビュー  |
| `docs_researcher`       | OpenAI / framework 一次情報確認        |
| `page_builder_reviewer` | freeform builder 専門レビュー          |
| `test_verifier`         | 対象テスト / validate の実行と結果要約 |

## Delivery Checklist

1. 不要な後方互換コード・デッドコードを残していない。
2. 追加 / 変更した入出力が Zod で検証されている。
3. 変更範囲に対応する unit / integration / E2E を必要に応じて実行している。
4. 最低 `bun run validate` を通している。
5. PR / release / commit 前は `bun run validate && bun run build` を通している。
6. アーキテクチャ変更時は `docs/architecture/` を更新している。

## Additional Documentation

- `docs/architecture/codex-instructions.md`: Codex 公式構成への対応方針
- `docs/architecture/agent-instructions.md`: AI エージェント指示の配置
- `docs/architecture/freeform-page-builder-design.md`: freeform page builder 設計
- `docs/plans/2026-04-23-freeform-page-builder-v1.md`: freeform page builder 実装履歴と残タスク
