# Webhook 境界から金額書込 mock を外す

> 2026-08-15。監査 Hole A の公式推奨（金が動く経路に domain mock を挟まない）を、後方互換なしで完遂する。

## 問題

Stripe 決済 webhook の unit（`stripe-webhook*.test.ts`）は route を叩くが、domain を `mock.module` で全置換する。assertion は「どの mock がどの引数で呼ばれたか」であり、Refund 行も `paymentStatus` も見ない。監査で見つかった F-54 / F-55 は、この形のせいで既存テストが緑のまま本番に入った。

書込本体の実 DB 層は既にある（`charge-refunded-settlement.test.ts` / `event-charge-refunded-settlement.test.ts`）。残っているのは attribution（`metadata.initiator` → `refundedByType`）が実 DB で未固定なことと、配線 unit が同じ経路を mock 引数で二重固定していること。

## 方針（アプローチ A）

波で置換する。最終形は「金額・状態を書く関数を実行するテストに domain mock が無い」。route の署名 / 400 / 503 / 未知 event / PI 欠落は薄い unit のまま残す。

壊れた挙動を固定していた wiring assert は消す。弱めない。互換シムは置かない。

## 波

1. **Stripe `charge.refunded` 書込** — 済。
2. **Stripe reservation / event checkout 書込** — 済。
3. **他 webhook** — GCal / Resend / SwitchBot に決済金額・paymentStatus 書込は無い。書き換えない。
4. **残りの payment unit** — settlement と重複する claim/save where 写経を削除。cancelled orphan と Stripe 変換は残す。
5. **Approach A leftover** — 済。routing / orphan-claim の金額書込 mock 引数を呼出有無にした。イベント `finalizeSettledEventRegistrationRefund` の正本は実 DB。予約・イベントの finalize where 写経 unit は削除。cancelled orphan と Stripe 変換 unit は残す。

## 完了条件

決済金額・paymentStatus を書く経路の正本は実 DB settlement。webhook unit は route 契約だけ。GCal / Resend / SwitchBot は対象外（決済を書かない）。

## 第 5 波の契約

- waitlist / mismatch / orphan-claim の金額書込 mock 引数は呼出有無にする。シナリオ unit は残す。
- `finalizeSettledEventRegistrationRefund` の正本は実 DB 累積判定。
- 予約・イベントの finalizeSettled where 写経 unit は削除する。cancelled orphan と USD 変換は残す。

## 第 4 波の契約

- soft-delete 済み UNPAID は `claimReservationAsPaid` しない。
- payment-queries unit の claim/save/failed where 写経は削除する。
- `refund.updated` / orphan の金額書込 mock 引数は呼出有無にする。USD 1250 CRITICAL と cents→app 変換は残す。

## 第 3 波の契約

- `claimEventRegistrationAsPaid` は CONFIRMED+UNPAID を PAID にし PI を書く。既に PAID なら false。
- `saveEventRegistrationPaymentIntentId` は PENDING だけ PI を書き、PAID は動かさない。
- `claimEventRegistrationAsFailed` は session 一致時だけ FAILED。不一致と既 PAID は no-op。
- routing unit は claim/save の引数 assert を削除し、分岐・呼出有無・メールを残す。

## 第 2 波の契約

- `claimReservationAsPaid` は UNPAID 予約を PAID にし `stripePaymentIntentId` を書く。既に PAID なら `null` で上書きしない。
- `savePaymentIntentId` は session 一致時だけ PI を書き、`paymentStatus` は PENDING のまま。
- `claimReservationAsFailed` は session 一致時だけ FAILED + `paymentFailedAt`。不一致と既 PAID は no-op。
- `stripe-webhook.test.ts` の checkout / async / expired は route 副作用だけ残し、claim/save の引数 assert は削除する。

## 第 1 波の契約

- `applyChargeRefundIdempotent` / `applyEventChargeRefundIdempotent` に `metadata.initiator: "ADMIN"` を渡すと、Refund 行の `refundedByType` が `ADMIN` になる。
- initiator が無い / 未知なら `STRIPE_DASHBOARD`。
- `stripe-webhook.test.ts` の charge.refunded は route 契約だけ残す（PI null、予約なし、200）。全額 / 部分 / 空 data / USD / ADMIN の mock 引数テストは削除する。それらの振る舞いは settlement テストが正本。

## 非目標

- Stripe SDK や署名検証を実ネットワークで叩かない。
- AuditLog hash-chain は共有 test-db 汚染のため mock のまま。
- 本番の webhook handler 実装を「動かすため」に変えない。テストが実装の欠落を見つけたときだけ直す。
