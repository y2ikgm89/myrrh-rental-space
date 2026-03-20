---
name: audit-settings-sections
description: 管理画面の設定セクション（settings/_components/sections/）の品質を監査する。ヒント折りたたみ・導線リンク・フォームパターン・SubmitButton 配置を一括チェック。新しい設定セクション追加後や定期メンテ時に使用。
---

# 設定セクション監査

管理画面の設定セクション（`settings/_components/sections/`）を `admin-ui-patterns.md` に照らして監査する。

## チェック項目

以下を各セクションファイルに対して確認し、違反をリスト出力する。

### 1. ヒント折りたたみ

- 3行以上のヒント・補足リストが Accordion **ではなく** Card やインライン表示になっていないか
- Collapsible でヒントを折りたたんでいないか（Accordion を使うべき）
- AccordionItem に `rounded-lg border bg-muted/50 px-4 border-b last:border-b` の枠スタイルがあるか

```bash
# Accordion 未使用のヒントブロックを検出
grep -rn "ヒント\|補足\|Tips" src/app/\(admin\)/admin/\(dashboard\)/settings/_components/sections/ --include="*.tsx" | grep -v "Accordion\|AccordionTrigger"
```

### 2. 導線リンク

- HeaderSection / FooterSection の CardDescription に `/admin/settings/navigation` へのリンクがあるか
- ナビゲーション管理ページの description に `/admin/settings/site?tab=layout` へのリンクがあるか
- 関連する設定ページ間の相互導線が漏れていないか

```bash
# 導線リンクの存在確認
grep -rn "settings/navigation\|settings/site" src/app/\(admin\)/admin/\(dashboard\)/settings/ --include="*.tsx" | grep -i "link\|href"
```

### 3. フォームパターン

- `useFormAction` を使用しているか（useState + 手動 onChange は禁止）
- `SubmitButton` を使用しているか（インライン isPending パターン禁止）
- SubmitButton が `<div className="flex justify-end ...">` でラップされているか
- `disabled={!form.formState.isDirty}` があるか

```bash
# useFormAction 未使用のセクションを検出
for f in src/app/\(admin\)/admin/\(dashboard\)/settings/_components/sections/*Section.tsx; do
  if ! grep -q "useFormAction" "$f" 2>/dev/null; then
    echo "⚠️  useFormAction 未使用: $(basename "$f")"
  fi
done
```

### 4. import パターン

- `@/shared/types/server-actions` を直接 import していないか（`@/admin/types/server-actions` 経由）
- Accordion は `@/admin/components/ui/accordion` から import しているか

## 実行手順

1. 上記の bash コマンドを実行して違反を検出
2. 各違反について修正案を提示
3. ユーザー承認後に修正を適用

## 例外（チェック対象外）

- `CustomApiKeysSection` / `ICalFeedSection` — CRUD テーブル型（useFormAction 非適用）
- `PermissionsSection` — 読み取り専用 UI
- `RobotsTxtSection` — Lexical エディタ型
