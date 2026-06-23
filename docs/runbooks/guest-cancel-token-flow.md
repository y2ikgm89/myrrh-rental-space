# Guest Cancel Token — フロー & 運用 Runbook

## 概要

予約確認 / リマインダーメール内の「予約をキャンセルする」リンクから、**ゲスト顧客が
ログインなしで自分の予約をキャンセル**できる仕組み。トークンはステートレス
（DB 保存なし）で、暗号文に予約 ID + 有効期限を封入し AES-256-GCM で認証する。

## アーキテクチャ

```
[メール送信]                          [キャンセル受付]
sendReservationConfirmationEmail
  └─ createCancelToken               middleware (proxy.ts)
       (rid, exp, iat)                └─ ?token= を HttpOnly cookie
       → AES-256-GCM(v2)                  へ転写し ?token を URL 除去
       → base64url 包装                ↓
       → メール本文の cancelUrl       page.tsx
                                       ├─ publicQueryRateLimiter (30/min/IP)
                                       ├─ cookies().get("cancel-token")
                                       ├─ verifyCancelToken(token, now)
                                       ├─ 状態分岐 (invalid / expired
                                       │   / 既キャンセル / 期限超過 / 正常)
                                       └─ GuestCancelForm + Turnstile

                                      action: cancelGuestReservationAction
                                       ├─ formSubmitRateLimiter (5/min/IP)
                                       ├─ Turnstile validate
                                       ├─ cookies().get("cancel-token")
                                       ├─ verifyCancelToken
                                       ├─ Zod (UUID, reason ≤500)
                                       ├─ cancelByReservationRateLimiter (3/h/予約)
                                       ├─ ownership ガード (session 一致)
                                       ├─ cancelReservationByToken
                                       │   └─ applyCancellation (atomic claim)
                                       └─ applyCancellationSideEffects
                                            ├─ Stripe refund (PAID のみ)
                                            ├─ deleteCalendarSync
                                            ├─ sendReservationCancelledEmail
                                            ├─ sendReservationAdminNotification
                                            ├─ createNotificationCommand
                                            └─ createAuditLogRecord
```

## トークン

### 形式

```
v2:<kid>:reservation-cancel:<iv_b64>:<authTag_b64>:<ct_b64>   ← base64url で包装
```

- `kid`: `ENCRYPTION_KEY_ID`（デフォルト `v1`）
- `purpose`: `reservation-cancel`（他用途トークンの流用を拒否）
- payload: `{ rid: <UUID>, exp: <ms epoch>, iat: <ms epoch> }`

### 有効期限

確認メール送信時に `min(startTime - cancellationDeadlineHours, now + 7日)` 等で決まる
（実装は [`reservation-emails.ts`](../../src/shared/lib/email/reservation-emails.ts) の
`cancelDeadline` 計算ロジック）。`exp` 経過で `expired`、改ざんで `invalid` を返す。

### サーバ側の追加検証

- `exp` 期限内
- `purpose === "reservation-cancel"`（HKDF+AAD で派生鍵が異なる + decrypt 前の文字列一致でも検証）
- 予約が CANCELLABLE_STATUSES に該当（PENDING / CONFIRMED）
- 予約開始時刻が `cancellationDeadlineHours` 以内（現在の DB 設定値を再評価）
- session ありの場合、`session.customerId === reservation.customerId`
- IP 単位 5/min + 予約単位 3/hour レートリミット
- Turnstile 検証

## URL 漏洩面と緩和

| 経路                                 | 漏洩リスク                         | 緩和                                                                             |
| ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| メール受信箱の本文                   | mailbox 侵害時に exp まで悪用可能  | exp を業務要件最小に + ownership ガードで session 違いを遮断                     |
| Cloud Run / CF アクセスログ          | URL に `?token=` が残るとログ蓄積  | middleware で cookie へ転写し ?token を即時除去                                  |
| ブラウザ履歴 / autocomplete          | 同上                               | 同上（cookie 化で URL に残らない）                                               |
| 同一オリジン Link クリックの Referer | エラー画面の `/contact` リンク等   | `rel="noreferrer"` を付与（実装済）+ token は cookie 経由のため URL 不在         |
| サポート/問い合わせ転送              | mailbox 持ち主が共有して他人が使う | ownership ガード（session ありなら一致確認）。session 無しは正規ゲスト想定で許容 |

## 監視 / フォレンジック

### AuditLog

`applyCancellationSideEffects` がキャンセル成功時に `AuditLog` に書き込む。
metadata に `channel: "customer-token" | "customer-mypage" | "admin"`、IP、UserAgent、
tokenFingerprint (SHA-256(token) の先頭 16 文字) を残す。

### WARNING ログ

`logError(severity: LOW, category: AUTHORIZATION)` で観測する経路:

| イベント                         | 場所          | context                                    |
| -------------------------------- | ------------- | ------------------------------------------ |
| rate-limit hit (form/IP)         | cancel.ts:73  | `limiter: "formSubmit"`                    |
| rate-limit hit (per-reservation) | cancel.ts:135 | `limiter: "perReservation"`, reservationId |
| Turnstile failure                | cancel.ts:79  | ip                                         |
| Token verify fail (action)       | cancel.ts:96  | reason, ip, tokenFingerprint               |
| Token verify fail (page render)  | page.tsx:67   | reason, ip, tokenFingerprint               |

Cloud Logging で `severity>=WARNING category=AUTHORIZATION operation=guestCancel*` を
フィルタすれば、ブルートフォース / メール大量転送の兆候が観測できる。

## サポート対応 FAQ

### Q. お客様から「キャンセルリンクが無効と言われる」と問い合わせ

確認順:

1. メール送信ログ（Resend dashboard）で当該予約の `cancelUrl` 生成時刻と `exp` を確認
2. 現在時刻が `exp` 超過していないか
3. `ENCRYPTION_KEY` がローテーションされた直後でないか（旧鍵が legacy に無いと全 token 失効）
4. 当該予約のステータスが既に CANCELLED / COMPLETED / NO_SHOW でないか
5. 顧客が別ユーザーとしてログイン中で、ownership ガードに弾かれていないか

対応:

- 期限内 → 新しいキャンセル URL をリマインダーメール再送（自動次回 cron で発行される）
- 期限切れ → admin から手動キャンセル（管理画面の予約詳細から `updateReservationStatus(id, "CANCELLED")`）

### Q. 「キャンセルしていないのにキャンセルされている」

1. `AuditLog` で当該 reservationId の最新エントリを参照
2. metadata の `channel` / `ip` / `tokenFingerprint` を確認
3. `channel: "customer-token"` で見覚えのない IP / UA なら、お客様メールアカウントの侵害可能性
4. `channel: "admin"` ならどのスタッフが実行したかを `userId` で特定

復旧:

- admin パスから `restoreReservationCommand(id)` で復元（実装あり、決済済みは別途要返金確認）

### Q. 「ENCRYPTION_KEY をローテーションしたい」

→ [`encryption-key-rotation.md`](./encryption-key-rotation.md) を参照。

## 既知の運用ギャップ

1. **明示的 token revocation 不可（ステートレス）**
   - 現状: 鍵ローテーション以外に「漏洩 token を即座に殺す」手段は無い
   - 緩和: `exp` 短く + 漏洩疑い時は当該予約を admin から手動 CANCELLED にすると後続の token 検証で「既キャンセル」として弾かれる
   - 将来: `Reservation.cancelTokenSequence` + `iat >= cancelTokenRevokedAt` 検査の DB-backed revocation を入れる構想あり（schema 変更を伴うため別 PR）

2. **`cancellationDeadlineHours` 延長時のトークン exp ロック**
   - 確認メール送信時の `exp` は当時の deadline で焼かれる
   - 後で deadline 延長しても古いメールのトークンは旧 exp のまま
   - 緩和: admin が「お問い合わせ → 手動キャンセル」誘導 / 新リマインダーで上書き

## 設計判断（再 litigate 禁止）

- **DB persistence は不要**: AES-GCM authTag + exp claim で stateless 検証が完結。漏洩面は受信者メールボックス + Resend ログのみ
- **cancellation reason は任意・サーバ側 500 文字制限**: client は維持 + server で Zod 再検証（バイパス対策）
- **invalid / expired を UI で同一文言**: 漏洩済みトークンが「正規形式である」ことの弱オラクル化を防ぐ
- **purpose binding は 2 重防御**: HKDF info + AAD に purpose を混入 + verify 前にも平文 purpose 文字列を比較
- **iframe sandbox は preview UI 側で対応**: 本ページは通常の Server Component で出力されメール HTML を含まない

## 関連ファイル

- [`src/shared/lib/reservation-cancel-token.ts`](../../src/shared/lib/reservation-cancel-token.ts) — トークン生成・検証
- [`src/shared/lib/crypto.ts`](../../src/shared/lib/crypto.ts) — AES-256-GCM + HKDF + kid
- [`src/app/(public)/reservation/cancel/page.tsx`](<../../src/app/(public)/reservation/cancel/page.tsx>) — キャンセル確認画面
- [`src/app/(public)/reservation/cancel/_actions/cancel.ts`](<../../src/app/(public)/reservation/cancel/_actions/cancel.ts>) — キャンセル実行 Server Action
- [`src/shared/domain/reservations/cancel-core.ts`](../../src/shared/domain/reservations/cancel-core.ts) — atomic claim ロジック
- [`src/shared/domain/reservations/cancellation-side-effects.ts`](../../src/shared/domain/reservations/cancellation-side-effects.ts) — refund/GCal/メール/通知/監査統合
- [`src/proxy.ts`](../../src/proxy.ts) — `?token=` → HttpOnly cookie 転写
