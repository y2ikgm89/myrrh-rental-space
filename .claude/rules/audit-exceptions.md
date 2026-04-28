---
description: 監査・レビュー agent が誤検出しないための「ルール違反に見えるが正当な例外」 SSoT
paths:
  - ".claude/agents/**"
  - ".claude/skills/audit-*/**"
---

# 監査例外 SSoT

レビュー / 監査 agent が誤検出しないための「ルール違反に見えるが正当な例外」リスト。

## 例外項目

- `LayoutFields.tsx` の `any` — `frontend/admin-inline-editor-patterns.md` で RHF generic invariance 対応として明示許可
- `global-error.tsx` のハードコードカラー — `tailwind-patterns/theme-tokens.md` で client-side fallback として除外
- `select.tsx` の `required` — `gotchas/ui.md` で Radix 制約として除外
- `revalidateTag` の第 2 引数 — `server-actions/use-cache.md` で Next.js 16 API として記載

## 使い方

該当パターンが上記に記載されていれば **Critical / High 扱いで報告しない**。

疑わしい場合は現物を `Read` で確認し、必要なら個別 rule docs を Grep で確認:

```bash
Grep -n "例外\|EXCEPTION\|sanctioned\|許可\|除外" <rule-file>
```

新しい例外を追加する場合は、本ファイルに追記（agent 内の重複定義禁止）。
