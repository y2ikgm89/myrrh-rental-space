# イベント申込セルフ編集パリティ（clean-break）

- 起票: 2026-07-29
- 方針: 予約 guest-edit-parity（#1524）と同型。後方互換 shim なし
- 前提: `guest-reservation-edit-parity-design.md` のイベント版

## 1. 目標

ゲスト（status token）と会員（mypage）が、イベント申込の連絡先・参加人数を自己編集できる。

## 2. 非目標

- `slotId` / `ticketId` の変更（キャンセル + 再申込に誘導）
- PAID 後のセルフ編集・差額精算・領収書再発行
- admin 向け更新メール（in-app 通知 + audit のみ）
- email 変更時の旧 token 無効化（stateless token、90 日 TTL）

## 3. 編集可能フィールド

`name` / `email` / `phone` / `note` / `quantity`（admin 編集と同一集合）

## 4. ゲート

| 条件                       | 可否                                      |
| -------------------------- | ----------------------------------------- |
| CONFIRMED                  | 全フィールド（quantity は 728350 + 残枠） |
| WAITLISTED                 | 全フィールド（枠未消費）                  |
| WAITLISTED_OFFERED         | 連絡先のみ（quantity 禁止）               |
| CANCELLED / EXPIRED        | 不可                                      |
| payment UNPAID / FAILED    | 可                                        |
| payment PENDING            | 不可                                      |
| payment PAID / REFUNDED 等 | 不可                                      |
| 期限                       | `now < slot.startAt`                      |

## 5. 認可

- ゲスト: 既存 `event-status-token`（90 日）を status hub / edit で共用。proxy が `?token=` → cookie 転写
- 会員: Better Auth session + `customerId` ownership
- Turnstile + rate-limit（予約 edit と同型）

## 6. 副作用

- `invalidateEventCaches()`
- 参加者向け `event-registration-updated` メール（更新後 email 宛）
- in-app 通知 `EVENT_REGISTRATION_UPDATE`
- audit log（channel: `customer-token` | `customer-mypage`）

## 7. 実装参照

- Domain: `edit-eligibility.ts`, `registration-customer-update-commands.ts`
- Guest: `/events/registrations/status/edit`
- Mypage: `/mypage/events/[id]/edit`
