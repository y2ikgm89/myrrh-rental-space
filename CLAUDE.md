# CLAUDE.md

> Myrrh Rental Space - レンタルスペース予約管理システム

## ワークフロー

**IMPORTANT**: 全ステップを順守。セッション継続時も必ずこのファイルを再確認。

1. **Explore**: コードベースを読む（コードは書かない）
2. **Plan**: `TodoWrite`で全ステップをタスク化
3. **Code**: 実装 → 検証
4. **Review**: `code-simplifier` → `code-reviewer`
5. **Commit**: PRとドキュメント更新

**YOU MUST**: TodoWriteに必ず「Review: code-simplifier → code-reviewer」を含める（新規機能・複数ファイル変更時は必須）

## コマンド

```bash
bun dev                    # 開発サーバー
bun run type-check && bun run lint && bun run build  # 検証（実装後に実行）
bunx prisma migrate dev --name <name>  # DBマイグレーション
```

## 技術スタック

Next.js 16 / React 19 / TypeScript 5.9 / Bun 1.3 / Prisma 7 / PostgreSQL (Supabase) / Auth.js 5 / Tailwind CSS 4 / Zod 4

## 規約

- Server Components優先、Server Actions（mutations）
- Zodバリデーション必須
- 命名: コンポーネント`PascalCase.tsx`、その他`kebab-case.ts`

## タスク委託

- **大規模調査**: `Explore`エージェント
- **設計**: `feature-dev:code-architect`
- **レビュー**: `feature-dev:code-reviewer`
- **新機能開発**: `/feature-dev`

軽微な修正は直接実行

## 対話ルール

作業開始前に確認が必要な場合:
- 要件が曖昧 / 設計判断が必要 / 破壊的変更 / ライブラリ選択

**曖昧な要件を推測で実装しない**

## 参照

- @AGENTS.md - プロジェクト仕様
- @docs/requirements/ - 機能要件
- @docs/architecture/ - アーキテクチャ
