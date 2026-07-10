# BLACKLIST顧客の新規予約/申込ブロック 設計

- 日付: 2026-07-11
- ステータス: 承認待ち(brainstorming完了、writing-plans前)

## 背景

予約荒らし対策の調査(8エージェント並列調査)で判明した4つの穴のうち、実装が最も小さく設計判断も少ない項目に着手する。管理者が顧客を`CustomerStatus.BLACKLIST`に手動設定しても、その顧客本人(ログイン済み)や同じメールのゲストは新規の空間予約・イベント申込を通常通り作成できてしまう。`resolveOrCreateCustomer`(空間予約の顧客解決)と`createEventRegistrationCommand`(イベント申込)のいずれも`CustomerStatus`を一切参照しないためである。「荒らしに気づいて手動でブラックリスト化しても、同じメールで何度でも予約を作り直せる」という運用上の穴を塞ぐ。

他の3項目(bot対策強化・レート制限強化・不審検知/アラート)は規模・技術判断が異なる独立サブプロジェクトとして扱い、この設計には含めない。

## 調査で確定した事実(前提)

- `CustomerStatus` enum: `NEW / REGULAR / VIP / INACTIVE / BLACKLIST`(`prisma/schema.prisma:51-57`)。
- `isActive`は`CustomerStatus`とは独立した別のBooleanフィールド。`toggleCustomerActive`という汎用ON/OFFトグル(`src/shared/domain/customers/commands.ts:126-140`)で、admin UI上も「有効化/無効化」としか表現されておらず、意図(退会/一時停止/その他)が明文化されていない。`BLACKLIST`と異なり「拒否したい」という専用の意図を持つフィールドではないため、今回の拒否判定には使わない(非ゴール参照)。
- 空間予約(`createPublicReservationCommand`、`src/shared/domain/reservations/public-commands.ts`): ログイン済みでもゲストでも必ず`resolveOrCreateCustomer`(tx内、`lockReservationSpaceForTransaction`取得後)で`Customer`行を解決/作成し、`Reservation.customerId`(NOT NULL)に設定する。
- イベント申込(`createEventRegistrationCommand`、`src/shared/domain/events/registration-commands.ts`): ログイン済みならaction層(`event-registration.ts`)が`getCustomerByUserId`で`customerId`を解決して渡すが、ゲストは`customerId: null`のまま登録し、`Customer`行を検索も作成もしない(`registration-commands.ts:362`のコメントに「会員紐付け UI は Phase 1 では持たない」と明記された意図的な設計)。空間予約とは非対称。
- `resolveOrCreateCustomer`の単一責任コメント(`resolve-customer.ts:31-37`)は「Submitted email is contact data, not proof of account ownership.」と明示。この境界(=emailの一致だけでは他人のアカウントに自動リンクしない)は本設計でも変更しない。

## 外部検証

Square / Boulevard / Phorestなど主要な予約プラットフォームの「顧客ブロック」機能を調査した(WebSearch)。ブロック済み顧客がメール/電話番号ベースで新規オンライン予約を拒否されるのは業界共通の標準機能。一方、共通の既知の限界としてPhorestサポート文書が「別のメール/電話で登録すれば新規プロフィールとして予約できてしまう」ことを明記している。この限界は本設計でも解消しない(email一致の範囲でのみ機能する)ため、非ゴールに明記する。

## ゴール

1. `CustomerStatus.BLACKLIST`の顧客本人(`userId`でログイン済み)による新規の空間予約・イベント申込を拒否する。
2. `BLACKLIST`判定済みの既存の未紐付けゲスト`Customer`(`emailCanonical`一致)による新規の空間予約・イベント申込を拒否する。
3. 空間予約・イベント申込の両経路に対称的に適用する。
4. 拒否理由をエンドユーザーに開示しない(汎用エラーメッセージ)。

## 非ゴール(スコープ外)

- `isActive=false`による拒否。意味が曖昧な汎用トグルであり、休眠顧客を誤って拒否するリスクがあるため今回は対象としない。
- イベント申込の「ゲストは`customerId: null`のまま`Customer`行を作らない」というPhase 1運用方針そのものの変更。read-onlyのemail検索を追加するのみで、新規`Customer`作成のトリガーにはしない。
- 新規メール/別人を騙る荒らしへの対策。これは別項目(レート制限強化)で扱う。
- 既存の未来予約の扱い。`BLACKLIST`化した顧客が既に持っている予約を自動キャンセルする機能は作らない(新規作成のブロックのみ)。
- `BLACKLIST`設定/解除UIの変更。既存の`CustomerDetail.tsx`手動ステータス変更フローをそのまま使う。

## アーキテクチャ設計

### 1. 新規ガード関数

`src/shared/domain/customers/guard.ts`(新規、`import "server-only"`必須):

```ts
export async function ensureCustomerNotBlacklisted(
  params: { customerId?: string | null; email?: string },
  tx?: GuardTx,
): Promise<void>;
```

- `customerId`が渡されれば、それで`Customer.status`を`findUnique`で検索する。
- `customerId`が無く`email`があれば、`normalizeEmailForIdentity`で正規化した`emailCanonical`と`userId: null`で未紐付けゲスト`Customer`のみを`findFirst`で検索する(新規作成はしない、read-only)。
- どちらの検索でも該当`Customer`が見つからなければno-op(素通り)。
- `status === CustomerStatus.BLACKLIST`なら`DomainError(<汎用メッセージ>, "FORBIDDEN")`をthrowする。

`GuardTx`は`resolve-customer.ts`の`ResolveCustomerTx`と同様、`findUnique`/`findFirst`のみを持つミニマルインターフェースとして定義し、tx注入と単体テストのモック容易性を両立する。

### 2. 呼び出し箇所

- 空間予約: `public-commands.ts:143`の`resolveOrCreateCustomer`呼び出し直後、`tx.reservation.create`の前に`await ensureCustomerNotBlacklisted({ customerId }, tx)`を追加。
- イベント申込: `registration-commands.ts:44`のadvisory lock取得後、`tx.eventRegistration.create`の前に`await ensureCustomerNotBlacklisted({ customerId: data.customerId, email: data.email }, tx)`を追加。

いずれも既存のtx境界・advisory lock順序を変えず、既存クエリの間に1行挿入するのみ。

### 3. エラーメッセージ

「現在このご予約を承ることができません。お手数ですがお問い合わせフォームよりご連絡ください。」のような、拒否理由を伏せた汎用文言にする。既存のServer Action層の`catch (error) { if (error instanceof DomainError) return { ok: false, error: error.message } }`パターンでそのまま表示されるため、action層(`reservation.ts`/`event-registration.ts`)の変更は不要。

## テスト方針

- unit: `guard.ts`の`ensureCustomerNotBlacklisted`について、`customerId`指定でBLACKLIST/非BLACKLIST、`email`指定でBLACKLIST/非BLACKLIST/該当`Customer`なしの5パターン。
- integration: 既存の予約・イベント申込作成テストに以下を追加。
  - ログイン済み`BLACKLIST`顧客による予約/申込が`FORBIDDEN`で拒否される。
  - `BLACKLIST`済み既存ゲスト`Customer`と同じメールでの新規ゲスト予約/申込が拒否される。
  - 通常顧客(NEW/REGULAR/VIP/INACTIVE)・新規メールのゲストは通常通り成立する(regression防止)。

## 実装上の注意

- migrationは不要。既存の`CustomerStatus.BLACKLIST`enum値をそのまま使う。
- `guard.ts`は`src/shared/domain/customers/`配下に置き、Prisma import境界規約(`db-domain.md`)に従う。
- `emailCanonical`に一意制約は無く(`@@index([emailCanonical, userId])`のみ、`prisma/schema.prisma:673`)、同一メールの未紐付けゲスト`Customer`が複数存在する可能性は理論上ある。`ensureCustomerNotBlacklisted`は`resolveOrCreateCustomer`と同じ`findFirst`(1件のみ取得)方針を継承する。この前提は本設計で新たに持ち込むものではなく既存の設計を引き継ぐだけであり、対処が必要になった場合は別途一意制約の追加を検討する(本設計のスコープ外)。
