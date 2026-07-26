# Stripe 未使用 UX / 手動入金領収書 / ゲスト薄い予約詳細（clean-break）

- 起票: 2026-07-26
- 方針: 公式・本リポジトリ推奨に沿い、後方互換 shim なしのクリーン実装
- 破壊的変更: 許可済み
- 後方互換: なし（旧導線の残置・dual-path・「後で消す」フラグは置かない）

## 1. 背景

オンライン決済 ON/OFF の SSoT は Feature Module `payment`（旧 `stripeEnabled` は廃止済み）。
Stripe 採用は未定で、採用後に OFF する可能性もある。現状は:

- 公開: Checkout 非表示 / 「事前決済不要」は概ね実装済み
- 管理: 決済リンクは disabled だが、返金 UI が feature OFF で一律封鎖（ドメインは credentials があれば精算可）
- 手動入金: PAID にするのみで領収書即時発行・通知なし（backfill 依存）
- ゲスト: 恒久の予約詳細がなく、領収書は専用 DL ページ＋再送が主
- Stripe webhook: 既に CONFIRMED な予約では確認メールを skip し、領収書 CTA メールが届かない穴がある

## 2. 目標 / 非目標

### 目標

1. `payment` OFF でも公開・管理が自然に動く（Stripe の匂いを公開に出さない）
2. オフライン運用の主導線は手動入金
3. 入金確定（手動 / Stripe）→ 領収書即時発行 → **ゲストも会員も**発行通知メール
4. メール CTA は **予約詳細で DL**（会員: mypage、ゲスト: トークン付き薄い詳細）
5. `payment` OFF 後も、Stripe 決済履歴がある予約だけ管理から返金可能
6. 失敗時は既存 `receipt-backfill` で救済（即時発行の backstop）

### 非目標（次フェーズ）

- SwitchBot 暗証番号の Web 表示
- ゲスト詳細のフルハブ化（編集・高機能キャンセル UI 等）
- 振込案内マスタやオフライン会計フィールドの厚塗り
- イベント申込の薄い詳細（予約と対称化は follow-up。イベントは当面「発行メール + 既存専用 DL / mypage」を維持し、予約で確立した通知 SSoT だけ共有）

## 3. 決定事項（対話で確定）

| 項目             | 決定                                                      |
| ---------------- | --------------------------------------------------------- |
| 運用モデル       | Stripe 未定。後から OFF もあり得る                        |
| OFF 時返金       | Stripe 決済履歴があるときだけ管理 UI で返金可             |
| 公開 OFF 時 copy | 静かに消す（「事前決済不要」）                            |
| 管理オフライン   | 手動入金を主導線                                          |
| 領収書           | 入金確定で即時発行。失敗時 backfill                       |
| 通知             | ゲスト・会員の両方に発行通知メール                        |
| DL 入口          | 予約詳細（ゲストは薄いトークン詳細を今回新設）            |
| 暗証番号 Web     | 次フェーズ                                                |
| 互換             | clean-break。旧「ゲストは専用 DL 直リンクが表導線」は廃止 |

## 4. 二層ゲート（変更なし・明示）

| 層   | SSoT                     | 役割                               |
| ---- | ------------------------ | ---------------------------------- |
| 業務 | `featureModules.payment` | 新規 Checkout を提供するか         |
| 技術 | Stripe credentials       | webhook / 返金 / backfill 等の精算 |

- 新規 checkout: `assertOnlinePaymentAvailable()`（feature + credentials）
- 精算: `assertStripeCredentialsConfigured()`（credentials のみ）

## 5. 公開 UI

### 5.1 `payment` OFF

- Checkout ボタン非表示
- スペース詳細: 「事前決済不要」
- Stripe / オンライン決済導線を出さない
- 予約・イベントの申込・閲覧は通常どおり

### 5.2 ゲスト薄い予約詳細（新設・clean-break）

- 経路: `/reservation/status`（proxy で `?token=` → HttpOnly cookie 転写。`complete` / `cancel` と同型）
- 新トークン: `reservation-status-token`（purpose 分離。complete トークンの流用禁止）
- TTL: 予約終了後も領収書 DL できるよう、少なくとも領収書再送と整合する長め（例: 発行から 90 日、または利用終了 + 90 日）。正確な値は実装プランで既存 token TTL 規約に合わせて固定
- 表示（最小）: スペース名、日時、金額、支払状態、領収書 DL CTA、claim / 問い合わせへの導線
- 非表示（次フェーズ）: SwitchBot 暗証番号、編集フォーム
- 領収書 DL: 詳細上のボタン → 既存の安全な取得フロー（確認ページ POST または会員同等の所有権付き GET）。**メールから PDF API 直リンクは表導線にしない**

### 5.3 会員

- 既存 `/mypage/reservations/[id]` で DL（現状維持＋発行通知メール追加）
- メール CTA は mypage 予約詳細 URL

### 5.4 発行通知メール（双方）

- トリガ: 領収書の **新規発行成功時**（手動入金・Stripe webhook・将来ハブからも同じ SSoT）
- 再発行（admin reissue）は別契約（既存 reissue / resend を維持）。本仕様の「発行通知」は初回発行
- ゲスト: ステータス詳細 URL（status token）
- 会員 (`userId` あり): mypage 予約詳細 URL
- 既存の「確認メールに receiptDownloadUrl を埋め込む」表導線は **廃止**（clean-break）。確認メールは予約確認専用に戻す

## 6. 管理 UI

### 6.1 `payment` OFF

- 「決済リンクを作成」: 非表示（disabled 残置しない）
- 「返金する」: **その予約に Stripe payment intent / 返金可能な Stripe 履歴があるときだけ表示**。feature OFF でも credentials があれば実行可（ドメインは `assertStripeCredentialsConfigured`）
- 手動入金: UNPAID かつ Stripe session なしのときの主導線（予約・イベントとも）。コピーでオフライン運用であることが分かるようにする
- `/admin/settings/billing`: 残す。Stripe は「将来接続 / credentials」。`payment` OFF でもキー設定可
- nav「課金・決済」: 既存どおり feature badge（非公開）可。ページ 404 にはしない

### 6.2 手動入金成功時

1. PAID claim（既存）
2. `issueReceiptFor*` を await（VALIDATION は業務 skip + log、それ以外は action エラー）
3. 発行成功時のみ通知メール（双方ルールは §5.4）
4. 発行失敗で PAID だけ残った場合: UI で警告＋ backfill が救済

## 7. Stripe ON 時

- webhook で PAID claim → 即時 `issueReceiptFor*` → 発行通知メール（§5.4）
- **破壊的変更:** 「既に CONFIRMED だから確認メール skip → 領収書 CTA も送らない」をやめる。確認メールの二重送信回避は維持しつつ、**領収書発行通知は別メールとして必ず送る**
- 公開 Checkout は従来どおり `payment` ON 時のみ

## 8. ドメイン SSoT

新ヘルパー（名前は実装時に既存ディレクトリへ合わせる）例:

- `notifyReceiptIssuedForReservation(receipt)` / event 対称
- 手動入金 command または admin action の afterSuccess から呼ぶ
- Stripe webhook からも同じ関数を呼ぶ（経路分岐でメール文面を増やさない）

冪等: 同一 Receipt に対する通知の二重送信は idempotency key（`receipt-issued/{serialNo}` 等）で抑止。

## 9. テスト

- unit: availability / admin ボタン出し分け / status token / メール CTA 分岐（guest vs member）
- unit/integration: 手動入金 → receipt row + 通知呼び出し
- unit: Stripe webhook 経路が CONFIRMED でも発行通知を呼ぶ
- architecture/grep: 確認メールへの `receiptDownloadUrl` 埋め込みが復活していないこと（禁止）

## 10. ロールアウト

- 単一論理変更として PR 分割可（token+page / notify SSoT / admin UI / webhook）だが、マージ後の挙動は clean-break 一式
- 本番デプロイは手動（リポジトリ方針どおり自動完遂に含めない）

## 11. 次フェーズ（予約詳細ハブ）

- ゲスト詳細をフルハブへ拡張（暗証番号の条件付き表示、操作の集約）
- 発行通知メールの CTA はハブ URL のまま（専用 PDF 直リンクには戻さない）
- イベント申込の対称ステータス詳細
