# Plans.md - Myrrh Rental Space

> タスク管理と進捗追跡のためのファイル

## 現在のタスク

<!--
フォーマット:
- [ ] `cc:TODO` タスク説明
- [x] `cc:DONE` 完了したタスク
- [ ] `cc:WIP` 作業中のタスク
- [ ] `cc:blocked` ブロック中のタスク
-->

### 035: パフォーマンス最適化 - Priority 1 ✅

- [x] `cc:DONE` 1.1 DBインデックス追加（prisma/schema.prisma）→ 既存（変更不要）
- [x] `cc:DONE` 1.2 コネクションプール調整（src/lib/prisma.ts）
- [x] `cc:DONE` 1.3 ダッシュボード集計最適化（src/actions/admin/dashboard.ts）
- [x] `cc:DONE` 1.4 画像priority属性追加（blog/page.tsx, spaces/page.tsx）

### 035: パフォーマンス最適化 - Priority 2 ✅

- [x] `cc:DONE` 2.1 統一エラーバウンダリ戦略（管理画面の各ページに error.tsx 追加）
- [x] `cc:DONE` 2.2 Lexicalエディタ動的インポート（500KB削減）
- [x] `cc:DONE` 2.3 粒度の細かいrevalidation（revalidatePath → revalidateTag）
- [x] `cc:DONE` 2.4 Prisma型変換ミドルウェア（Decimal→number自動変換）

## 次に予定しているタスク

（なし）

## 完了したタスク

詳細は `docs/plans/README.md` を参照してください。

---

## クイックリンク

- [実装計画一覧](docs/plans/README.md)
- [アーキテクチャ](docs/architecture/)
- [要件定義](docs/requirements/)
