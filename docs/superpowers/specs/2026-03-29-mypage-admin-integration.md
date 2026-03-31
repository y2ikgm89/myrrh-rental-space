# マイページ・管理画面連携改善

> 2026-03-29 — 既存データ活用 + 認証強化 + キャンセル理由記録

## 背景

マイページと管理画面の連携を監査した結果、DB に存在するが表示されていないフィールド（決済ステータス・税額）、認証層の不備（停止顧客のログインブロック未実装）、顧客操作の追跡不足（キャンセル理由未記録）が判明。

## Phase 1: 既存データの表示改善（スキーマ変更なし）

### A. 決済ステータス表示

**変更対象:**

- `customer-queries.ts` — select に `paymentStatus`, `paidAt` 追加
- `reservation-detail.tsx` — DetailRow で決済ステータス Badge 表示
- `reservation-card.tsx` — カード上に決済ステータス小バッジ追加（PAID 以外のみ）

**表示マッピング:**
| PaymentStatus | ラベル | Badge variant |
|---|---|---|
| UNPAID | 未払い | warning |
| PENDING | 決済処理中 | warning |
| PAID | お支払い済み | success |
| REFUNDED | 返金済み | info |
| FAILED | 決済失敗 | default |

### B. 税額表示

**変更対象:**

- `customer-queries.ts` — select に `taxAmount`, `totalPriceWithTax`, `taxRateType`, `taxRate` 追加
- `reservation-detail.tsx` — 合計金額の下に税込金額を表示（税額が存在する場合のみ）

**表示:**

```
合計金額    ¥10,000
消費税(10%)  ¥1,000
税込合計    ¥11,000
```

### C. キャンセルポリシー表示

**変更対象:**

- `reservation-detail.tsx` — カード下部にポリシー情報セクション追加
- 予約詳細ページ (`reservations/[id]/page.tsx`) — deadlineSettings を props として渡す

**表示（PENDING/CONFIRMED のみ）:**

```
ご利用案内
・変更期限: ご利用日の○時間前まで
・キャンセル期限: ご利用日の○時間前まで
```

### D. 予約詳細→問い合わせ導線

**変更対象:**

- `reservation-detail.tsx` — フッターに「この予約について問い合わせる」リンク追加
- `/contact` ページに遷移（件名に予約IDプレフィックス）

## Phase 2: 認証強化（スキーマ変更なし）

### E. 停止顧客のログインブロック

**変更対象:**

- `mypage/layout.tsx` — `ensureCustomerLinked` 後に `customer.isActive` チェック追加
- `isActive === false` → `/login?error=account_suspended` にリダイレクト
- `login/page.tsx` — `error=account_suspended` 時にメッセージ表示

**判定ロジック:** Customer の `isActive` フィールド（既存）。管理画面で `toggleCustomerActive` 操作済みのフィールド。

## Phase 3: キャンセル理由記録（スキーマ変更）

### F. Reservation モデル拡張

**Prisma スキーマ追加:**

```prisma
model Reservation {
  // 既存フィールド...
  cancellationReason  String?   @db.Text
  cancelledAt         DateTime?
  cancelledByType     String?   @db.VarChar(20) // "CUSTOMER" | "ADMIN"
}
```

**変更対象:**

- マイページ `cancel-button.tsx` — キャンセル理由テキストエリア追加
- `cancelReservationAction` — reason を受け取り DB に保存、`cancelledByType: "CUSTOMER"` 設定
- 管理画面の予約キャンセル — `cancelledByType: "ADMIN"` 設定
- 管理画面の予約詳細 — キャンセル理由・キャンセル者表示
- `customer-queries.ts` — select に新フィールド追加
- マイページ予約詳細 — キャンセル理由表示（CANCELLED ステータス時）

## 見送り

| 項目                   | 理由               |
| ---------------------- | ------------------ |
| 予約変更履歴           | 監査ログで十分     |
| 問い合わせ既読確認     | コスト対効果低     |
| 領収書PDF              | Stripe 側で提供    |
| メール通知オプトアウト | メール種類が少ない |

## ファイル影響範囲

| ファイル                     | Phase | 変更内容               |
| ---------------------------- | ----- | ---------------------- |
| `customer-queries.ts`        | 1     | select 拡張            |
| `reservation-detail.tsx`     | 1     | 決済/税額/ポリシー表示 |
| `reservation-card.tsx`       | 1     | 決済ステータスバッジ   |
| `reservations/[id]/page.tsx` | 1     | deadlineSettings 渡し  |
| `mypage/layout.tsx`          | 2     | isActive チェック      |
| `login/page.tsx`             | 2     | エラーメッセージ       |
| `schema.prisma`              | 3     | 3フィールド追加        |
| `cancel-button.tsx`          | 3     | 理由入力UI             |
| `cancelReservationAction`    | 3     | reason 保存            |
| 管理予約詳細/キャンセル      | 3     | 理由表示・保存         |
