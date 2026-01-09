# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

## ワークフロー

**IMPORTANT**:
- 全ステップを順守（飛ばさない）
- 各ステップで「タスク委託」を検討
- セッション継続時も必ずこのファイルを再確認
- 初期設定時: `docs/{requirements,architecture,plans}/`作成

0. **Triage**: 複数ファイル・設計判断を伴う → `/feature-dev` を使用（以下スキップ）
1. **Explore**: コードベースを読む（コードは書かない）
2. **Design**: 新規作成・アーキテクチャ影響がある → `code-architect`（設計変更時: `docs/architecture/`更新）
3. **Plan**: `TodoWrite`でタスク化（機能追加・変更時: `docs/requirements/`更新）→ `docs/plans/NNN-title.md`作成
4. **Code**: 実装 → `code-simplifier`
5. **Verify**: type-check/lint/build
6. **Review**: `code-reviewer`
7. **Commit**: git commit → PR作成 → `docs/plans/README.md`に完了記録

**YOU MUST**: 新規ロジック・複数ファイル変更時、TodoWriteに「Code: code-simplifier」「Verify」「Review: code-reviewer」「Commit: docs/plans/README.md更新」を含める

**SKIP code-simplifier**: 設定ファイル変更、コメント修正、定数変更のみの場合

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
