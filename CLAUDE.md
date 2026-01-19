# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

## ワークフロー

**IMPORTANT**:
- 全ステップを順守（飛ばさない）
- セッション継続時: このファイル再読 → `docs/plans/README.md`確認 → TodoWrite再初期化
- 初期設定時: `docs/{requirements,architecture,plans}/`作成

| # | ステップ | エージェント | docs更新 |
|---|----------|-------------|----------|
| 0 | **Triage** | `/feature-dev`(複数ファイル+設計) | - |
| 1 | **Explore** | `Explore`, `code-explorer` | - |
| 2 | **Design** | `code-architect` | `architecture/` |
| 3 | **Plan** | TodoWrite | `requirements/`, `plans/NNN-title.md` |
| 4 | **Code** | `general-purpose`並列 → `code-simplifier` | - |
| 5 | **Verify** | - | - |
| 6 | **Review** | `code-reviewer` | - |
| 7 | **Commit** | - | `plans/README.md` |

**Triage判断**:
- 複数ファイル＋設計判断＋自律実行OK → `/feature-dev`（**実装後、必ずドキュメント生成**）
- 軽微な修正（設定変更、コメント、定数のみ）→ 直接実行、code-simplifierスキップ

**Explore**: コードベースを読む（コードは書かない）

**PR作成**: 機能追加 / 複数ファイル変更 / 破壊的変更 / レビュー必要時

## チェックリスト

新規ロジック・複数ファイル変更時、TodoWriteに含める:

```
□ Explore: 関連コード調査
□ Design: 設計検討（必要時）→ docs/architecture/更新
□ Plan: docs/plans/NNN-title.md作成、docs/requirements/更新
□ Code: 実装
□ Code: code-simplifier
□ Verify: type-check/lint/build
□ Review: code-reviewer
□ Commit: git commit + docs/plans/README.md更新
```

## /feature-dev 完了後（必須）

1. `docs/plans/NNN-title.md` 作成（既存ファイルの最大番号+1）
2. `docs/plans/README.md` の「完了した計画」先頭に追記
3. `docs/requirements/` 関連ファイル更新
4. `docs/architecture/` 設計変更時のみ更新

※テンプレート: `docs/templates/`

## 対話ルール

作業開始前に確認が必要な場合:
- 要件が曖昧 / 設計判断が必要 / 破壊的変更 / ライブラリ選択

**曖昧な要件を推測で実装しない**

## 規約

- Server Components優先、Server Actions（mutations）
- Zodバリデーション必須
- 命名: コンポーネント`PascalCase.tsx`、その他`kebab-case.ts`
- コミット: `<type>(<scope>): <subject>`（Conventional Commits）
- **後方互換性なし**: クリーン実装を優先
  - 不要なコードは完全削除（`// removed`コメント不要）
  - 未使用の`_vars`リネームや型のre-export禁止
  - 古いAPIのラッパー/シム作成禁止
  - **破壊的変更時**: 現在の実装と必ず比較し、メリット・デメリットを精査・検証
  - **移行時**: 既存機能は完全にクリーンアップ（残骸を残さない）

---

## プロジェクト固有

### コマンド

```bash
bun dev                    # 開発サーバー
bun run test               # テスト実行
bun run type-check && bun run lint && bun run build  # 検証
bunx --bun prisma migrate dev --name <name>  # DBマイグレーション
```

### 技術スタック

Next.js 16 / React 19 / TypeScript 5.9 / Bun 1.3 / Prisma 7 / PostgreSQL (Supabase) / Better Auth 1.x / Tailwind CSS 4 / Zod 4

### 構造

**Next.js コロケーションパターン** (Plan 050)

| パス | 用途 |
|------|------|
| `src/app/(admin)/admin/(dashboard)/_shared/` | 管理画面専用（components, actions, hooks, contexts, lib, types） |
| `src/app/(public)/_shared/` | 公開ページ専用（components, actions, emails, lib, types） |
| `src/shared/` | 共有（prisma, auth, utils, email, storage など） |
| `src/app/(public)/` | 公開ページルート |
| `src/app/(admin)/admin/` | 管理画面ルート |
| `src/app/api/` | API Routes |
| `docs/requirements/` | 機能要件（機能単位） |
| `docs/architecture/` | アーキテクチャ（設計判断・構成図） |
| `docs/plans/` | 実装計画（README.md=履歴、NNN-title.md=詳細） |
| `.claude/plans/` | Claude Code内部一時計画（.gitignore、必ずdocs/plans/へコピー） |

**パスエイリアス**:
- `@/admin/*` → `src/app/(admin)/admin/(dashboard)/_shared/*`
- `@/public/*` → `src/app/(public)/_shared/*`
- `@/shared/*` → `src/shared/*`
