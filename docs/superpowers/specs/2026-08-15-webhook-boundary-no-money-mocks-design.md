# Webhook 境界から金額書込 mock を外す

> 2026-08-15。監査 Hole A の公式推奨（金が動く経路に domain mock を挟まない）を、後方互換なしで完遂する。

## 問題

Stripe 決済 webhook の unit（`stripe-webhook*.test.ts`）は route を叩くが、domain を `mock.module` で全置換する。assertion は「どの mock がどの引数で呼ばれたか」であり、Refund 行も `paymentStatus` も見ない。監査で見つかった F-54 / F-55 は、この形のせいで既存テストが緑のまま本番に入った。

書込本体の実 DB 層は既にある（`charge-refunded-settlement.test.ts` / `event-charge-refunded-settlement.test.ts`）。残っているのは attribution（`metadata.initiator` → `refundedByType`）が実 DB で未固定なことと、配線 unit が同じ経路を mock 引数で二重固定していること。

## 方針（アプローチ A）

波で置換する。最終形は「金額・状態を書く関数を実行するテストに domain mock が無い」。route の署名 / 400 / 503 / 未知 event / PI 欠落は薄い unit のまま残す。

壊れた挙動を固定していた wiring assert は消す。弱めない。互換シムは置かない。

## 波

1. **Stripe `charge.refunded` 書込** — attribution を実 DB で固定。配線 unit の mock 引数テストを削除。
2. **Stripe checkout / async / expired 書込** — `claimReservationAsPaid` 等を実 DB で固定し、対応する配線 assert を削除。
3. **他 webhook** — GCal / Resend / SwitchBot の金額・状態書込を同じ規則へ。
4. **残りの payment unit** — webhook 以外で domain を全置換している金額書込を実 DB または注入可能な純関数テストへ移す。

## 第 1 波の契約

- `applyChargeRefundIdempotent` / `applyEventChargeRefundIdempotent` に `metadata.initiator: "ADMIN"` を渡すと、Refund 行の `refundedByType` が `ADMIN` になる。
- initiator が無い / 未知なら `STRIPE_DASHBOARD`。
- `stripe-webhook.test.ts` の charge.refunded は route 契約だけ残す（PI null、予約なし、200）。全額 / 部分 / 空 data / USD / ADMIN の mock 引数テストは削除する。それらの振る舞いは settlement テストが正本。

## 非目標

- Stripe SDK や署名検証を実ネットワークで叩かない。
- AuditLog hash-chain は共有 test-db 汚染のため mock のまま。
- 本番の webhook handler 実装を「動かすため」に変えない。テストが実装の欠落を見つけたときだけ直す。
