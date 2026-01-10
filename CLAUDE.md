# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

## ワークフロー

**IMPORTANT**:
- 全ステップを順守（飛ばさない）
- 各ステップで「タスク委託」を検討
- セッション継続時も必ずこのファイルを再確認
- 初期設定時: `docs/{requirements,architecture,plans}/`作成

0. **Triage**: タスク受領時に判断
   - 複数ファイル＋設計判断＋自律実行OK → `/feature-dev`（以下スキップ）
   - 複数ファイル＋ユーザー承認必要 → `EnterPlanMode`（手動ワークフロー）
   - 軽微な修正 → 直接実行
1. **Explore**: コードベースを読む（コードは書かない）
2. **Design**: 新規作成・アーキテクチャ影響がある → `code-architect`（設計変更時: `docs/architecture/`更新）
3. **Plan**: `TodoWrite`でタスク化（機能追加・変更時: `docs/requirements/`更新）→ `docs/plans/NNN-title.md`作成
4. **Code**: 実装 → `code-simplifier`
5. **Verify**: type-check/lint/build
6. **Review**: `code-reviewer`
7. **Commit**: git commit → PR作成 → `docs/plans/README.md`に完了記録

**YOU MUST**: 新規ロジック・複数ファイル変更時、TodoWriteに以下を**必ず**含める:
```
- Code: code-simplifier
- Verify: type-check/lint
- Review: code-reviewer
- Docs: docs/plans/NNN-title.md作成
- Docs: docs/requirements/更新（該当時）
- Docs: docs/architecture/更新（該当時）
- Commit: git commit
- Docs: docs/plans/README.md更新
```

**SKIP code-simplifier**: 設定ファイル変更、コメント修正、定数変更のみの場合

## ベストプラクティス

### セッション継続時の必須チェック

セッション継続（context compaction後）時は、**実装開始前**に以下を確認:

1. **このファイル（CLAUDE.md）を再読**
2. **現在のワークフロー位置を特定** - どのステップまで完了しているか
3. **docs/plans/README.md を確認** - 進行中・未着手の計画を把握
4. **TodoWriteを再初期化** - 残タスクを明示的にリスト化

### ドキュメント構造の区別

| パス | 用途 | コミット |
|------|------|---------|
| `.claude/plans/` | Claude Code内部の一時計画 | ❌ .gitignore |
| `docs/plans/` | プロジェクト永続化用 | ✅ 必須 |

**重要**: `.claude/plans/`の計画は**必ず**`docs/plans/NNN-title.md`にコピー・整理してコミット

### 実装完了チェックリスト

実装完了時、以下を**順番に**実行:

```
□ type-check/lint 通過
□ code-simplifier 実行済み
□ code-reviewer 実行済み
□ docs/plans/NNN-title.md 作成・更新
□ docs/requirements/ 更新（新機能時）
□ docs/architecture/ 更新（設計変更時）
□ git add && git commit
□ docs/plans/README.md に完了記録
□ git add && git commit --amend（README更新を含める）
```

### TodoWrite初期化テンプレート

複数ファイル変更タスク開始時の標準テンプレート:

```
1. Explore: 関連コード調査
2. Design: 設計検討（必要時）
3. Plan: docs/plans/NNN-title.md作成
4. Code: [具体的な実装タスク...]
5. Code: code-simplifier
6. Verify: type-check/lint
7. Review: code-reviewer
8. Docs: requirements/architecture更新
9. Commit: git commit + docs/plans/README.md更新
```

## タスク委託

- **Triage**: `/feature-dev`（複数ファイル・設計判断を伴う場合）
- **Explore**: `Explore`エージェント、`code-explorer`（深い分析時）
- **Design**: `code-architect`
- **Code**: `general-purpose`並列
- **Review**: `code-reviewer`

軽微な修正（設定変更、コメント、定数）は直接実行

## 対話ルール

作業開始前に確認が必要な場合:
- 要件が曖昧 / 設計判断が必要 / 破壊的変更 / ライブラリ選択

**曖昧な要件を推測で実装しない**

## 規約

- Server Components優先、Server Actions（mutations）
- Zodバリデーション必須
- 命名: コンポーネント`PascalCase.tsx`、その他`kebab-case.ts`
- コミット: `<type>(<scope>): <subject>`（Conventional Commits）

---

## プロジェクト固有（初期設定時に更新）

### コマンド

```bash
bun dev                    # 開発サーバー
bun run test               # テスト実行
bun run type-check && bun run lint && bun run build  # 検証（実装後に実行）
bunx prisma migrate dev --name <name>  # DBマイグレーション
```

### 技術スタック

Next.js 16 / React 19 / TypeScript 5.9 / Bun 1.3 / Prisma 7 / PostgreSQL (Supabase) / Auth.js 5 / Tailwind CSS 4 / Zod 4

### 構造

- `src/app/(public)/` - 公開ページ
- `src/app/admin/` - 管理画面
- `src/app/api/` - API Routes
- `src/components/` - UI
- `src/actions/` - Server Actions
- `src/lib/` - Prisma, Auth, utils
- `src/types/` - 型定義
- `docs/requirements/` - 機能要件（機能単位）
- `docs/architecture/` - アーキテクチャ（設計判断・構成図）
- `docs/plans/` - 実装計画（README.md=履歴、NNN-title.md=詳細）
