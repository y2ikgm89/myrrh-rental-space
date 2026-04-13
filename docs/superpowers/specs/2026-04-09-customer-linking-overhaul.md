# Customer Linking System Overhaul

> Shopify 型ベストプラクティスに準拠した顧客紐づけシステムの刷新

## 背景

現行実装に3つの致命的問題がある:

1. **データ上書き**: `resolveOrCreateCustomer` の upsert がリンク済み顧客の名前・電話番号を無条件に上書き
2. **userId 破壊**: `userId: data.userId || null` でゲスト予約時に既存の userId リンクが null に上書き
3. **乗っ取り可能**: `ensureCustomerLinked` が userId が既に別ユーザーに設定されている顧客でもリンクを上書き

## 設計原則

業界標準（Shopify/Booking.com）に基づく3つの不変条件:

1. **リンク済み顧客の保護**: `userId` が設定されている Customer のデータは、ゲスト予約で一切変更しない
2. **userId リンクの不可侵性**: `userId` はゲスト予約で触らない。設定は `ensureCustomerLinked` のみ
3. **メール所有権の信頼チェーン**: ソーシャルログイン = プロバイダー検証済み = 信頼。ゲスト予約のメール = 未検証 = 書き込み権限なし

## 変更対象

| ファイル                                                             | 変更                                              |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `src/shared/domain/reservations/commands.ts`                         | `resolveOrCreateCustomer` 全面書き直し            |
| `src/shared/domain/customers/link.ts`                                | `ensureCustomerLinked` に userId 競合チェック追加 |
| `__tests__/unit/shared/domain/customers/link.test.ts`                | テスト更新                                        |
| `__tests__/unit/shared/domain/reservations/resolve-customer.test.ts` | 新規テスト                                        |

## resolveOrCreateCustomer 新設計

upsert を廃止し、明示的な3段階ロジック:

```
入力: { email, lastName, firstName, phoneNumber?, companyName?, userId? }

Step 1: userId が提供されている場合
  → userId で Customer 検索
  → 見つかれば customerId を返す（データ変更なし）

Step 2: email で Customer 検索
  → 見つかった場合:
    A. リンク済み (userId != null) → customerId だけ返す（データ変更一切なし）
    B. 未リンク (userId == null) → 名前・電話を更新 + ログインユーザーなら userId 設定
  → 見つからない場合:
    → 新規 Customer 作成

Step 3: customerId を返す
```

userId の設定権限:

- ゲスト予約 (userId 未提供): update 時に userId フィールドに触れない
- ログイン済み予約 (userId 提供): 未リンク Customer にのみ userId を設定

## ensureCustomerLinked 新設計

```
入力: user { id, email, name }

Step 1: userId で検索 → 見つかればそのまま返す

Step 2: email で検索
  → userId が null → userId を設定してリンク
  → userId が別ユーザー → リンクしない、Step 3 へ

Step 3: 新規 Customer 作成（P2002 競合対策維持）
```

## テストマトリクス

### resolveOrCreateCustomer

| #   | シナリオ                             | 期待動作                                      |
| --- | ------------------------------------ | --------------------------------------------- |
| 1   | 新規メール + ゲスト                  | Customer 新規作成、userId = null              |
| 2   | 新規メール + ログイン済み            | Customer 新規作成、userId = user.id           |
| 3   | 既存メール + 未リンク + ゲスト       | 名前・電話更新、userId 変更なし (null のまま) |
| 4   | 既存メール + 未リンク + ログイン済み | 名前・電話更新、userId を設定                 |
| 5   | 既存メール + リンク済み + ゲスト     | データ変更なし、customerId のみ返す           |
| 6   | 既存メール + リンク済み + 同ユーザー | Step 1 で解決、データ変更なし                 |
| 7   | 既存メール + リンク済み + 別ユーザー | データ変更なし、customerId のみ返す           |

### ensureCustomerLinked

| #   | シナリオ                         | 期待動作             |
| --- | -------------------------------- | -------------------- |
| 1   | userId で既存リンクあり          | そのまま返す         |
| 2   | email 一致 + userId = null       | リンク設定           |
| 3   | email 一致 + userId = 別ユーザー | 新規 Customer 作成   |
| 4   | email 一致なし                   | 新規 Customer 作成   |
| 5   | P2002 競合 (並行リクエスト)      | フォールバッククエリ |

## 破壊的変更

- ゲスト予約でリンク済み顧客の名前・電話番号が更新されなくなる
- 同メールで既に別ユーザーにリンク済みの場合、ensureCustomerLinked が新規 Customer を作成する

## 変更不要

- Prisma スキーマ（Customer モデル変更なし）
- マイページ全ページ・アクション（getCustomerByUserId パターン維持）
- 公開予約フォーム（submitReservation 引数同一）
- inquiry.ts（getCustomerByUserId で既に安全）
- event-registration.ts（同上）
