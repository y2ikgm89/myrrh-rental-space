# Customer Management Features Design

> 顧客紐づけシステム刷新の延長 — 管理機能4件

## 機能1: 予約詳細「顧客情報を更新」ボタン

### 概要

予約詳細の差分アラート内に「顧客情報を更新」ボタンを追加。ゲスト入力値で Customer レコードを上書き。

### Server Action

`updateCustomerFromReservation(reservationId: string)` — `executeAdminMutationResult` パターン:

1. 予約を取得（guestLastName, guestFirstName, guestPhone, guestCompanyName, customerId）
2. Guest フィールドが null なら早期リターン
3. Customer の該当フィールドを更新
4. キャッシュ無効化: `CUSTOMERS` + `customers.detail(customerId)` + `RESERVATIONS`

### ドメインコマンド

`updateCustomerFromGuestData(customerId, guestData)` in `src/shared/domain/customers/commands.ts`

### UI

ReservationDetail.tsx の差分アラート内:

- 「顧客情報を更新」ボタン（`variant="outline" size="sm"`）
- DeleteConfirmDialog パターン（title: "顧客情報をゲスト入力値で更新しますか？"）
- 成功時: toast + 差分アラートが消える（revalidation で再描画）

## 機能2: 顧客マージ（Square MergeCustomers 型）

### 概要

管理画面の顧客詳細ページに「他の顧客とマージ」機能。マージ元の全リレーションをマージ先に移管し、マージ元を削除。

### ドメインコマンド

`mergeCustomerCommand(sourceId, targetId)` in `src/shared/domain/customers/commands.ts`:

```
$transaction:
  1. Reservation: UPDATE SET customerId = targetId WHERE customerId = sourceId AND deletedAt IS NULL
  2. Inquiry: UPDATE SET customerId = targetId WHERE customerId = sourceId
  3. SpaceReview: UPDATE SET customerId = targetId WHERE customerId = sourceId
  4. EventRegistration: UPDATE SET customerId = targetId WHERE customerId = sourceId
  5. Customer stats recalculation (target): totalReservations, totalSpent, firstReservationAt, lastReservationAt
  6. DELETE source Customer
```

### Server Action

`mergeCustomers(sourceId, targetId)` — `executeAdminMutationResult` パターン。resource: "customer", action: "delete"（マージ元を削除するため）。

### UI

顧客詳細ページにマージボタン:

1. 「他の顧客とマージ」ボタン → ダイアログ表示
2. ダイアログ内: 顧客検索（searchCustomers クエリ使用）→ マージ先選択
3. 確認ダイアログ: 移管内容サマリー表示（「予約 N 件、問い合わせ N 件をマージ先に移管します」）
4. 実行 → 成功時はマージ先の顧客詳細にリダイレクト

### 制約

- email unique 制約: マージ元の email が残ると制約違反。source を DELETE するので問題なし
- userId unique 制約: source に userId がある場合、source 削除で解消
- 自分自身へのマージ禁止（sourceId === targetId チェック）

## 機能3: 顧客一覧「名前不一致」フラグ

### 概要

顧客一覧テーブルで、直近の予約のゲスト名が Customer 名と異なる場合にアイコン表示。

### クエリ変更

顧客一覧クエリに最新予約の guest 名を include:

```prisma
reservations: {
  select: { guestLastName: true, guestFirstName: true },
  where: { deletedAt: null, guestLastName: { not: null } },
  orderBy: { createdAt: "desc" },
  take: 1,
}
```

### UI

CustomerTable の名前列に、不一致がある場合 `IconAlertTriangle` (size=14, className="text-warning") を名前の右に表示。hover で tooltip: "最新予約のゲスト名と異なります"。

## 機能4: 管理者通知メールに差分表示

### 概要

新規予約の管理者通知メールで、ゲスト名が顧客名と異なる場合に差分を表示。

### 変更

1. `ReservationPayload` type に `guestName?: string`, `guestPhone?: string` を追加
2. `buildPayload` で guest フィールドを payload に含める
3. メールテンプレート: 差分がある場合のみ追加行を表示

### メール表示例

```
顧客: 田中花子 (tanaka@example.com)
⚠ 予約時入力: 山田太郎 / 090-1234-5678
```

## 変更不要

- resolve-customer.ts（変更なし）
- ensureCustomerLinked（変更なし）
- Prisma スキーマ（変更なし — guest フィールドは追加済み）
- 公開ページ（変更なし）
