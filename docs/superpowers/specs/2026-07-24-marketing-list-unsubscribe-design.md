# Marketing List-Unsubscribe Design (2026-07-24)

> Status: approved (推奨 + マイページトグル)  
> Scope: Gmail/Yahoo/Resend 公式 one-click unsubscribe 要件

## Goal

管理者一斉配信（顧客 / イベント）に RFC 8058 one-click unsubscribe を実装し、
`marketingOptIn` をメール経由・マイページ経由の両方で自己管理できるようにする。

## Non-goals

- トランザクションメール（予約確認・領収書等）への List-Unsubscribe
- throw 系リトライ / お問い合わせ honeypot（公式必須ではないため別 PR）
- 新規 env / schema migration（既存 `marketingOptIn` + `ENCRYPTION_KEY` で足りる）

## Locked decisions

| #   | 論点          | 決定                                                             |
| --- | ------------- | ---------------------------------------------------------------- |
| D1  | 対象          | `sendCustomerBroadcast` + `sendEventBroadcast`                   |
| D2  | UX            | POST one-click + GET 確認 HTML + マイページトグル                |
| D3  | トークン      | purpose-bound AES-GCM（`marketing-unsubscribe`）+ `exp`（90 日） |
| D4  | 解除効果      | `Customer.marketingOptIn = false`（冪等）                        |
| D5  | Customer なし | イベント walk-in 等で Customer 解決不可ならヘッダ/本文リンク省略 |
| D6  | URL           | 同一 URL で GET/POST: `/api/email/unsubscribe?token=...`         |

## Surfaces

1. `src/shared/lib/tokens/marketing-unsubscribe-token.ts`
2. `POST|GET /api/email/unsubscribe`
3. broadcast send paths + email templates（本文「配信停止」リンク）
4. mypage settings「お知らせメールを受け取る」トグル → profile update
