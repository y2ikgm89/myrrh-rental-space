---
name: audit-integration
description: 公開ページ・マイページと管理画面の連携を包括的に監査する。キャッシュ無効化の一貫性、Customer紐づけ漏れ、認証パターン準拠、データフロー断絶を検出。新機能追加後や定期メンテ時に使用。
when_to_use: 新機能（公開フォーム・マイページ・管理 CRUD）追加後、または定期メンテ時。公開↔管理の連携が正しく動作しているか横断確認するとき。
---

# 公開↔管理連携監査

公開ページ・マイページと管理画面の連携を4つの観点から並行検証する。

## 監査観点

### 1. キャッシュ無効化の一貫性

全書き込み系 Server Action の `afterSuccess` / `invalidateCache` を走査し、タグ漏れを検出する。

**検出パターン:**

- 予約アクション: `RESERVATIONS` + `detail(id)` + `calendar()` の3点セット欠落
- 顧客統計変更時: `CUSTOMERS` タグ欠落
- お問い合わせ作成時: `INQUIRIES` + `inquiries.list()` 欠落
- 公開フォーム送信時: 管理画面キャッシュの無効化漏れ

```bash
# 全 updateTag 呼び出しをアクション別に集計
grep -rn "updateTag\|revalidateTag" src/app/ --include="*.ts" | grep -v node_modules | sort
```

### 2. 認証パターン準拠

| 層                        | 正しいパターン                       |
| ------------------------- | ------------------------------------ |
| 管理 Server Actions       | `executeAdminMutationResult`         |
| マイページ Server Actions | `getSession()` + `MutationResult<T>` |
| 公開 Server Actions       | Turnstile + Zod（認証なし）          |
| マイページページ          | `verifyCustomerSession()`            |

```bash
# マイページアクションが executeAdminMutationResult を使っていないか
grep -rn "executeAdminMutationResult" 'src/app/(public)/' --include="*.ts"

# 公開アクションに認証漏れがないか
grep -rn "getSession\|verifySession" 'src/app/(public)/_shared/actions/' --include="*.ts"
```

### 3. Customer 紐づけの完全性

- Inquiry: `customerId` FK + メール一致自動紐づけ
- Reservation: `customerId` FK + `resolveOrCreateCustomer`
- マイページクエリ: `customerId` フィルタによる所有者チェック

```bash
# customerId を持つモデルの紐づけ漏れ
grep -rn "customerId" src/shared/domain/ --include="*.ts" | grep -v "node_modules\|.d.ts"
```

### 4. ロール分離の完全性

- 管理者→マイページ: `/admin` リダイレクト
- CUSTOMER→管理画面: `/admin/login` リダイレクト
- 公開ページ Settings クエリ: `admin-queries.ts` を import していないか

```bash
# 公開ページが admin クエリを import していないか
grep -rn "from.*admin.*queries\|from.*admin.*actions" 'src/app/(public)/' --include="*.ts" --include="*.tsx" | grep -v "_components\|_shared"
```

## 実行手順

1. 各観点を controller 直接実行で調査（grep + Read）。**4 並列 Agent dispatch は実環境で thrashing 実績あり** — path-scoped rule auto-load の累積が subagent context を爆発させ、generic "ready to continue" / "Prompt is too long" / hallucinated report で全 agent が失敗する（2026-05-10 セッションで実観測）。`claude-code-patterns.md` §"Implementer subagent thrashing 後は fresh subagent 再 dispatch ではなく controller 直接続行が canonical" と同根
2. 結果をテーブル形式で統合レポート出力
3. 発見された問題を重要度別に分類（🔴 CRITICAL / 🟡 HIGH / 🟢 LOW）
4. ユーザー承認後に修正を適用
