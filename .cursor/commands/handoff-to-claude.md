# /handoff-to-claude - Claude Code にタスク依頼

Plans.md の `pm:依頼中` タスクを Claude Code に引き継ぎます。

## 実行内容

1. **Plans.md を確認** - `pm:依頼中` タスクを抽出
2. **コンテキスト準備** - 関連ファイル、要件をまとめ
3. **Claude Code に引き継ぎ** - 実装開始を依頼

## 使い方

```
/handoff-to-claude
```

または

「Claude に実装を依頼」「実装をお願い」

## 出力例

```
🤝 ハンドオフ準備完了
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 依頼タスク:
1. ユーザー登録フォームコンポーネント作成
2. Server Action で登録処理実装

📁 関連ファイル:
- src/app/auth/register/page.tsx（新規）
- src/actions/auth.ts（新規）
- prisma/schema.prisma（User モデル参照）

💡 Claude Code で以下を実行:
「/work」または「Plans.md のタスクを実行して」
```

## Claude Code 側での受け取り

Claude Code で `/work` を実行すると、`pm:依頼中` タスクを
`cc:WIP` に変更して実装を開始します。
