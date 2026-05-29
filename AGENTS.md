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
- `.claude/*` は Claude Code 用資産として扱う（Codex 作業では参照・同期・正本扱いしない）。
- ドキュメント探索中に `CLAUDE.md` や `.claude/*` へのリンクを見つけても、Codex では追跡しない。必要な情報は `AGENTS.md`、`.agents/skills/*`、`docs/explanation/*`、`docs/how-to/*` の Codex 向け導線から読む。ライブラリ API リファレンスは公式 docs を直接参照する。
- Codex 資産（`AGENTS.md` / `.agents/skills` / `.codex/agents` / `.codex/rules` / `.codex/hooks.json`）を変更する場合は `codex-instruction-maintenance` と `project-validation` の手順を使い、AGENTS.md には恒久的な全体制約だけを置く。

## Project Overview

レンタルスペースの予約・運営管理システム。公開サイトと管理画面を Next.js 16 の Multiple Root Layouts で分離する。

- 公開系: `src/app/(public)/...`（デザイン重視、スクロール演出あり）
- 管理系: `src/app/(admin)/admin/(dashboard)/...`（実務向け UI、Lexical / 型付きコンテンツフォーム）
- 共通: `src/shared/...`（CSS 依存を持たない共通ロジック）

### Tech Stack

**確定バージョンの SSoT は [`package.json`](./package.json) + [`bun.lock`](./bun.lock)**（バージョン値をここに複製しない — drift の温床）。主要技術と採用機能:

| 技術           | 採用機能                                                          |
| -------------- | ----------------------------------------------------------------- |
| Next.js        | `'use cache'`, `updateTag`, PPR (cacheComponents)                 |
| React 19       | React Compiler 1.0, `useEffectEvent`, `use(Context)`              |
| TypeScript 6   | `target: es2025`, `erasableSyntaxOnly`, `verbatimModuleSyntax`    |
| Bun            | `bun:test`, `packageManager` 経由でバージョン固定                 |
| Prisma 7       | WASM client engine, mapped enums                                  |
| Better Auth    | dual instance (adminAuth / customerAuth), RBAC, Google/LINE OAuth |
| Tailwind CSS 4 | CSS-first, `@theme`, container queries                            |
| Zod 4          | `{ error: }` パラメータ, `z.registry<FieldMeta>()`                |

採用理由・トレードオフは [`docs/explanation/tech-stack.md`](./docs/explanation/tech-stack.md)。

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
bun install                          # postinstall で bun run db:generate を自動実行
bunx --bun prisma migrate dev
bun run db:seed
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
bunx playwright test --project=chromium-smoke   # smoke E2E (毎 push CI required)
bun run e2e                                       # 広域 E2E（label opt-in CI、ローカル全走）
```

- 作業完了前の最低ライン: `bun run validate`
- PR / release / commit 前: `bun run validate && bun run build`
- 変更範囲が明確な場合は、先に `bun test <path>` や対象 E2E を実行する。
- テスト全走は CI と `lefthook` pre-push に委ねる。毎回の手動全走は不要。

### Test strategy（業界標準 4 層）

| 層            | 場所                               | CI trigger                               | 用途                                      |
| ------------- | ---------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Unit          | `__tests__/unit/`                  | 毎 push（required）                      | 関数・ユーティリティ・型ガード            |
| Integration   | `__tests__/integration/`           | 毎 push（required）                      | Server Actions・API・domain command       |
| **Smoke E2E** | `e2e/smoke/*.smoke.spec.ts`        | **毎 push（required、`smoke-e2e` job）** | critical path ゲート（< 3 分、≤ 10 test） |
| 広域 E2E      | `e2e/{public,authenticated,a11y}/` | PR `e2e` label opt-in                    | 機能カバレッジ・回帰検出                  |

**Smoke の規律**: 空 DB でも 200 OK で fallback 描画される URL のみ対象。`test.skip(true, ...)` 全面禁止。詳細は `.claude/rules/test-quality/e2e.md` §Smoke vs 広域 E2E の責務分離 を参照。

**広域 E2E の規律**: defensive skip (`test.skip(true, "データがありません")`) 禁止。seed 拡充で解消するか unit/integration に降格。

## Required Coding Rules

- Server Components をデフォルトとし、必要時のみ `'use client'` を使う。
- 入出力は Zod で検証する。エラーメッセージは `{ error: "msg" }` 形式（Zod 4）。
- 型アサーション (`as`) を避け、型ガード・`satisfies`・Zod `safeParse` を使う。
- React Compiler 前提。手動 `useMemo` / `useCallback` / `memo` は原則禁止。実測上必要な escape hatch のみ例外とする。
- `forwardRef` は使わない。React 19 では ref を通常の prop として扱う。
- 管理画面 form は conform（`useForm` + `getInputProps` + `useActionState`）を使う。React Hook Form は `package.json` から削除済で新規利用不可。
- Tailwind CSS 4 は `@theme` とセマンティックトークンを使う。ハードコード色を増やさない。
- Bun Test を使う。テストは `bun:test` から import する。
- 命名: コンポーネント `PascalCase.tsx`、ユーティリティ `kebab-case.ts`。

## Content Managed Page Rules

- custom page は自由配置 editor ではなく、固定テンプレート `Section` + 型付き content form を正本にする。
- 公開デザイン、余白、レスポンシブ挙動、Section 構成の基本形はコードで固定し、管理画面では content group の文言・画像・リンク・長文だけを編集対象にする。
- custom page 作成時は hero / body / CTA の固定 Section を自動作成する。
- preview / public は同じ `ManagedPageSections` renderer を使う。
- freeform document、builder canvas、drag / resize / layer tree、breakpoint override、runtime 互換分岐を追加しない。
- 任意 HTML / 任意 script / custom CSS textarea を追加しない。
- ページ編集方針を変える場合は `docs/explanation/content-managed-pages.md` と矛盾しないか確認する。

## Architecture Boundaries

- Public <-> Admin の root layout 間遷移はフルリロード前提。
- 管理画面専用は `@/admin/*`、公開画面専用は `@/public/*` に閉じる。
- 業務ロジックは `src/shared/domain/*`、Prisma 境界は `src/shared/db/*`。
- 管理 write 系 Server Action は `executeAdminMutationResult` を使う。
- API Route のみ `checkPermission()` を直接使う。
- `src/app/` から `@/shared/db/prisma` を直接 import しない（例外なし — `calendar-sync` の `pg_try_advisory_lock` は `@/shared/domain/calendar-sync/locks` helper に集約済）。

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
| `lexical-editor`                | 管理画面 Lexical editor                     |
| `media-storage-change`          | media domain、R2/S3、media picker           |
| `prisma-data-change`            | Prisma schema、migration、seed、DB 境界     |
| `public-site-change`            | 公開 route、公開 UI、SEO、公開 form         |
| `project-validation`            | 完了前、PR 前、release 前の検証             |
| `codex-instruction-maintenance` | Codex ネイティブ資産の保守                  |

### Custom Agents

| Agent               | 用途                                   |
| ------------------- | -------------------------------------- |
| `codebase_explorer` | read-only コードパス調査               |
| `admin_ui_reviewer` | 管理画面 UI / レイヤー / 導線レビュー  |
| `docs_researcher`   | OpenAI / framework 一次情報確認        |
| `test_verifier`     | 対象テスト / validate の実行と結果要約 |

## Markdown Documentation Discipline

`AGENTS.md` / `.agents/skills/**` / `docs/**` / その他 `*.md` 編集時は以下に従う。Codex 側に path-scoped auto-load 機構はないため、md 編集時は手動でこのセクションを参照する。

### Style (CommonMark 0.31.2 + GFM + markdownlint)

- 公式仕様 [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) + [GitHub Flavored Markdown](https://github.github.com/gfm/) に準拠する
- 主要 [markdownlint](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md) ルール:
  - h1 (`#`) は 1 ファイル 1 個のみ (`MD025`)、レベルスキップ禁止 (`MD001`)、開始は h1 (`MD041`)
  - コードフェンスに言語タグ必須 (`MD040`、例: \`\`\`bash / \`\`\`typescript / \`\`\`text)
  - bare URL は `<>` で囲むか `[label](url)` 形式 (`MD034`)
  - 行末空白禁止 (`MD009`)、複数連続空行禁止 (`MD012`)
  - bullet list は `-` 固定 (`MD004`)、ordered list は `1.` 連続 (`MD029`)
  - GFM テーブル構文 (column 数一致 / align 記号統一)
  - LF 改行統一 (`.gitattributes` で強制)
  - 装飾目的の絵文字禁止 (state 表現の `✅` / `❌` 等は許容)

### Drift 防止 (プロジェクト固有)

- バージョン値の md 内ハードコード禁止 (SSoT は `package.json` + `bun.lock`)
- 「最終更新: YYYY-MM-DD」マーカー禁止 (履歴は `git log` SSoT)
- `.archive/` ディレクトリ再導入禁止 (削除して `git log --diff-filter=D` で辿る)
- `docs/reference/` 再導入禁止 (library API は公式 docs を直接参照、project pattern は `.agents/skills/**` SSoT)
- `docs/how-to/` はインフラ・デプロイ手順のみ

### Frontmatter スキーマ

- `.agents/skills/<name>/SKILL.md` — `name` / `description` のみ
- `.codex/agents/*.toml` — `name` / `description` / `developer_instructions` 必須
- `AGENTS.md` 本体 — frontmatter なし (plain markdown)

## Delivery Checklist

1. 不要な後方互換コード・デッドコードを残していない。
2. 追加 / 変更した入出力が Zod で検証されている。
3. 変更範囲に対応する unit / integration / E2E を必要に応じて実行している。
4. 最低 `bun run validate` を通している。
5. PR / release / commit 前は `bun run validate && bun run build` を通している。
6. アーキテクチャ変更時は `docs/explanation/` を更新している。

## Additional Documentation

- `docs/explanation/ai-instructions.md`: Codex / Claude Code の正本配置
- `docs/explanation/content-managed-pages.md`: 固定デザイン + 型付きコンテンツ編集の方針
- `docs/README.md`: ドキュメント全体構造（Diátaxis 採用 2 軸: explanation / how-to）。reference / tutorials 軸は意図的に未配置（公式 docs / project rules / AGENTS.md+CLAUDE.md 導線で代替）
