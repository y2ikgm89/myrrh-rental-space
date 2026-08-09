# ゲスト予約変更パリティ（clean-break）

- 起票: 2026-07-26
- 方針: 公式・本リポジトリ推奨に沿い、後方互換 shim なし
- 破壊的変更: 許可（「ゲスト変更は claim 必須」を廃止）

## 1. 目標

1回きり／アカウント登録したくないゲストも、会員 mypage と**同じ変更ゲート**で日時・スペースを変更できる。

## 2. 非目標

- ゲスト専用の緩いゲート
- 決済済み予約の差額精算付き変更
- ~~イベント申込のゲスト編集（本件は予約のみ）~~ → **後日、別途実施済み**
- claim 導線の削除（一覧管理したい人向けに残す）

## 3. 認可

- **status token**（既存 `reservation-status`、90 日）で本人確認
- cookie `status-token`（proxy 転写済み）または `?token=`
- Turnstile + IP rate-limit（ゲスト cancel と同型）
- ログイン済み会員が他人の status token で変更しようとした場合は、会員 ownership を優先して拒否（cancel と同型の防御）

専用 edit token は作らない（ハブ SSoT。cancel だけ別短命 token の既存方針は維持）。

## 4. ゲート（会員と同一）

Domain SSoT。満たさない場合は UI でも CTA 非表示／ページ redirect。

| Gate       | 条件                                             |
| ---------- | ------------------------------------------------ |
| Feature    | `reservation` ON                                 |
| Status     | PENDING / CONFIRMED（ACTIVE）                    |
| Payment    | `UNPAID` のみ                                    |
| Discount   | coupon / duration / space 割引額すべて 0         |
| Deadline   | `modificationDeadlineHours` 内                   |
| 在庫・営業 | create と同ルール（空き・営業時間・BlockedDate） |

会員 mypage の `canEdit` / edit page にも **UNPAID** を揃える（現状 UI 欠落の clean-break 修正）。

## 5. UX

| 面           | 内容                                                              |
| ------------ | ----------------------------------------------------------------- |
| Guest status | 変更可なら「予約を変更する」→ `/reservation/status/edit`          |
| Guest edit   | 会員 edit と同型フォーム（共有コンポーネント）                    |
| 成功後       | status ハブへ戻る（token cookie 維持）                            |
| 不可時       | reason 付きで status へ（status / deadline / discount / payment） |

Claim CTA は変更の前提にしない。

## 6. Domain / Action

- `updateCustomerReservation` のゲート本体を共有可能な形に寄せる（ownership だけ差し替え）
- ゲスト: `updateGuestReservationByStatusToken`（token → reservationId、gates 同一、`applyReservationEditSideEffects` も同一）
- Action: `updateGuestReservationAction`（cookie status-token + Turnstile）
- 変更通知メールは既存 `sendReservationUpdatedEmail` を流用（`buildBookingHubUrl` でゲスト status）

## 7. テスト

- Domain: guest update が会員と同ゲート
- Action: token 無効 / Turnstile / UNPAID / 成功
- View helper: `buildGuestEditHref` / canEdit 相当
- mypage `canEdit` に UNPAID を含む回帰

## 8. AGENTS.md

「ゲスト変更は claim → mypage」を撤回し、「ゲストは status token で会員と同ゲートの edit」に更新。
