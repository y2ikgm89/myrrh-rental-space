---
name: audit-settings-sections
description: 管理画面の設定セクション（settings/_components/sections/）の品質を監査する。ヒント折りたたみ・導線リンク・フォームパターン・SubmitButton 配置を一括チェック。新しい設定セクション追加後や定期メンテ時に使用。
when_to_use: 新しい設定セクション追加後、または月次定期メンテ時。管理画面 settings の UI 品質を横断確認するとき。
paths:
  - src/app/(admin)/admin/(dashboard)/settings/_components/sections/**
---

# 設定セクション監査

管理画面の設定セクション（`settings/_components/sections/`）を `admin-ui-patterns.md` に照らして監査する。

## 設定ページ構成（2026-05-11 再編後）

8 カード構成（ドメイン軸フラット、業界標準準拠）:

1. `/admin/settings/features` — 機能モジュール ON/OFF
2. `/admin/settings/site` — サイト基本（一般 / SEO / 投稿）
3. `/admin/settings/appearance` — サイトの見た目（ヘッダー / フッター / サイドバー / レイアウト / ナビゲーション / お知らせバー）
4. `/admin/settings/business` — 事業者情報 / 営業時間 / 予約
5. `/admin/settings/billing` — Stripe 決済 / 割引 / 消費税
6. `/admin/settings/notifications` — メール送信元 / 通知チャネル
7. `/admin/settings/integrations` — Resend / Turnstile / Cloudflare / Google Maps / カレンダー / Instagram / カスタム
8. `/admin/settings/system` — メンテナンス / Cookie / 権限

`NavigationManager` / `AnnouncementBarManager` は `settings/appearance/_components/{navigation,announcement-bar}/` 配下に同居。

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

- 同一ページ内のタブ間導線は「『X』タブで編集できます」のテキスト案内のみ（`<Link>` 不要）
- 別ページへの導線（例: appearance → features 等）は `<Link href="/admin/settings/X">` で記述
- 旧 URL（`/admin/settings/navigation` / `/announcement-bar` / `/notify` / `/api`）への参照が残っていないか

```bash
# 旧 URL 残存検出（ゼロが正常）
grep -rn "/admin/settings/\(notify\|api\|navigation\|announcement-bar\)" src/ --include="*.tsx" --include="*.ts"
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
    echo "useFormAction 未使用: $(basename "$f")"
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
