# 予約詳細ハブ本拡張 / SwitchBot 暗証番号 Web / イベント薄い詳細（clean-break）

- 起票: 2026-07-26
- 方針: 公式・本リポジトリ推奨に沿い、後方互換 shim なし
- 破壊的変更: 許可済み
- 前提: ゲスト `/reservation/status` と領収書通知が先行して実装済みであること

## 1. 目標

1. **予約詳細ハブ** — ゲスト `/reservation/status` と会員 `/mypage/reservations/[id]` を、予約に関する再確認の SSoT にする
2. **SwitchBot 暗証番号の Web 表示** — メール本文への平文依存をやめ、ハブ上で条件付き表示（タップで開示）
3. **イベント薄い詳細の対称化** — ゲスト `/events/registrations/status` + 会員 `/mypage/events/[id]`。領収書通知 `detailUrl` を予約と同型にする

## 2. 非目標

- SwitchBot リモート lock/unlock・admin 通知（既存方針どおりアプリ側）
- イベントへのスマートロック
- オフライン振込案内マスタの厚塗り

> **注（2026-07 更新）:** ゲスト予約変更は `#1524` guest-edit-parity により
> status token 経路で許可済み。以下 §3 の表は現行仕様を反映する。

## 3. 予約ハブ

### 3.1 共有して載せるもの

| 要素                                | ゲスト status                                                          | 会員 mypage 詳細        |
| ----------------------------------- | ---------------------------------------------------------------------- | ----------------------- |
| スペース・日時・金額・支払/予約状態 | ✅                                                                     | ✅（既存＋状態明示）    |
| 領収書 DL                           | ✅（既存）                                                             | ✅（既存）              |
| カレンダー追加                      | ✅（新規、非 CANCELLED）                                               | ✅（既存）              |
| キャンセル導線                      | ✅ → 既存 `/reservation/cancel`（cancel token 発行）                   | ✅（既存）              |
| 変更                                | ✅ → `/reservation/status/edit`（status token、会員 edit と同一 gate） | ✅（既存）              |
| Checkout                            | ❌（ゲストはメール/管理）                                              | ✅（payment ON 時既存） |
| 暗証番号                            | ✅（§4）                                                               | ✅（§4）                |
| Claim                               | ✅（既存）                                                             | —                       |

### 3.2 UI

- ゲスト・会員で可能な範囲、presentational 部品を共有（copy / 状態ラベル / PasscodeReveal）
- ゲスト編集は status token 経路（`UNPAID`・割引なし・変更期限内・空きあり）。Claim は任意

## 4. 暗証番号 Web（clean-break）

### 4.1 原則

- **再確認の SSoT はハブ**。確認／更新／status-changed メールから **平文パスコードブロックを削除**し、「予約詳細で確認」CTA（ゲスト status URL / 会員 mypage）に置換する
- 発行失敗時の fallback 連絡先案内はメールに残してよい（番号自体は出さない）

### 4.2 表示条件（すべて満たす）

1. `switchbotEnabled` かつ対象 Pad デバイスがスペースに紐づく
2. 予約 `status === CONFIRMED`（CANCELLED / PENDING は出さない）
3. `SmartLockPasscode.status === CONFIRMED`（PENDING は「発行手続き中」）
4. 現在時刻が SwitchBot 有効窓内: `[start - buffer, end + buffer]`（`switchbotPasscodeBufferMinutes`）

窓外・失効後は「この予約の解錠番号の表示期間外です」等。平文は返さない。

### 4.3 取得 API（新）

- Domain: `getCustomerVisibleSmartLockPasscodesForReservation(reservationId, auth)`
- Auth:
  - 会員: Better Auth session + reservation.customerId ownership
  - ゲスト: 有効な `reservation-status` token（rid 一致）
  - ログイン中でも status token 経路では member-ownership を強制（別会員の cookie 誤操作を遮断）
- 平文は **Server Action の開示要求時のみ** decrypt（初回 HTML に埋め込まない）
- purpose 既存 `switchbot-guest-passcode` を流用
- rate-limit: 開示 action に per-IP（＋会員なら per-user）制限

### 4.4 UI

- `<PasscodeReveal />`: 「解錠番号を表示」→ action → 番号表示（コピー可）
- 複数デバイスは deviceName 付きリスト
- 発行中 / 期間外 / 非対応スペースはそれぞれの静的メッセージ

## 5. イベント薄い詳細（対称化）

### 5.1 新設

| 面     | 経路                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------ |
| ゲスト | `/events/registrations/status` + `event-registration-status` token（90 日、cookie 転写は proxy） |
| 会員   | `/mypage/events/[id]`（一覧カードから遷移）                                                      |

### 5.2 載せるもの（予約ハブの薄い版）

- イベント名・日時・会場/オンライン・チケット・支払状態
- 領収書 DL CTA（既存安全フロー）
- キャンセル導線（会員: 既存 action、ゲスト: `/events/cancel`）
- 参加 URL（オンライン・確定済みのみ、既存方針）
- Checkout（会員・payment ON・未払い時）
- **暗証番号なし**

### 5.3 破壊的変更

- `notifyReceiptIssuedForEventRegistration` / manual・webhook の `detailUrl`:
  - ゲスト: status token URL（receipt download 直リンクを表導線にしない）
  - 会員: `/mypage/events/{registrationId}`
- 確認メール等に残る receipt 直リンク表導線があれば削除（予約側と同一契約）

## 6. データ / セキュリティ

- ゲスト token purpose 分離（予約 status / イベント status / cancel / claim を混同しない）
- crypto purpose registry + SERIAL_DB_TESTS / public-route-gates を同時更新
- passcode 開示の AuditLog は必須にしない（高頻度）。異常（連打）は rate-limit + 既存 error log
- 平文 passcode を client bundle / RSC payload の初期 props に載せない

## 7. テスト

- unit: 表示条件（status / passcode status / 時間窓）
- unit: auth 拒否（他人の予約、無効 token）
- unit: メールテンプレに平文 passcode ブロックが無い（grep gate）
- unit: イベント detailUrl が status / mypage 詳細を指す
- component: PasscodeReveal の pending / revealed / error
- architecture: public-route-gates に `/events/registrations/status`、`/mypage/events/[id]`

## 8. ロールアウト

- 同一 topic で段階 commit / 必要なら PR 分割可。挙動は clean-break（メール平文廃止と Web 開示を同 PR 系列で揃える）
- 本番デプロイは手動（リポジトリ方針）
