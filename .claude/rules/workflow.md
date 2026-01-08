# workflow.md - 2-Agent ワークフロールール

> Cursor (PM) と Claude Code (Impl) の役割分担と連携ルール

## 役割定義

### Cursor (PM: Project Manager)

- **責務**: 要件定義、計画策定、レビュー、承認
- **操作**: Plans.md への依頼追加、完了確認
- **マーカー**: `pm:依頼中`, `pm:確認済`

### Claude Code (Impl: Implementer)

- **責務**: 実装、テスト、ビルド検証
- **操作**: Plans.md のタスク実行、完了報告
- **マーカー**: `cc:TODO`, `cc:WIP`, `cc:完了`

## ワークフロー

### 1. タスク依頼（PM → Impl）

```markdown
## Plans.md

- [ ] `pm:依頼中` ユーザー登録機能を実装
  - 要件: メール + パスワード認証
  - 優先度: 高
```

### 2. タスク着手（Impl）

```markdown
- [ ] `cc:WIP` ユーザー登録機能を実装
  - 着手: 2026-01-08
```

### 3. タスク完了報告（Impl → PM）

```markdown
- [x] `cc:完了` ユーザー登録機能を実装
  - 完了: 2026-01-08
  - 変更: src/app/auth/register/, src/actions/auth.ts
```

### 4. レビュー・承認（PM）

```markdown
- [x] `pm:確認済` ユーザー登録機能を実装
  - 確認: 2026-01-08
```

## ハンドオフルール

### PM → Impl ハンドオフ時

1. Plans.md に `pm:依頼中` マーカーでタスク追加
2. 要件・優先度・期待する成果を明記
3. `/handoff-to-claude` コマンドで引き継ぎ

### Impl → PM ハンドオフ時

1. Plans.md のマーカーを `cc:完了` に更新
2. 変更内容・影響範囲を記載
3. `/handoff-to-cursor` コマンドで報告

## 禁止事項

- PM の承認なしに要件変更
- 完了報告なしのタスク放置
- マーカーの不整合（WIP のまま別タスク着手）

## 品質ゲート

タスク完了前に必ず:

1. `bun run lint` パス
2. `bun run type-check` パス
3. `bun run test` パス（関連テスト）
4. 変更内容のセルフレビュー
