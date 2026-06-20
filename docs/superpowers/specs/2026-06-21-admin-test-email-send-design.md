# Admin Test Email Send — Design Spec

**Date**: 2026-06-21
**Author**: Claude (Opus 4.7) + user (y2ikgm89)
**Status**: Approved for implementation

## 1. Background

Admin が `/admin/settings` のメールタブで送信元・通知先・確認メールトグルを設定できる現状の UI には「設定が実際に Resend まで通って配信されるかを確認する手段」が無い。Resend ダッシュボード Logs で観測する方法はあるが、ローカル DB の送信元設定が正しく解決され、`validateSenderDomain` を通過し、Resend 5/sec quota の範囲内で実 send が成立するかを admin 自身が UI 上で 1 クリック検証できる動線が必要。

## 2. Goal

メール設定タブに「テスト送信」機能を追加し、admin が任意宛先（自分のメールボックスまたは Resend simulator）に test email を送信して送信パイプライン全段（API key 解決 → sender 解決 → domain 検証 → tags/headers 付与 → idempotency → Resend `/emails` 呼び出し → response messageId 取得）を end-to-end で検証できるようにする。

## 3. Non-Goals

- 本番メールテンプレ（reservation/event/contact 等）の preview や per-template test 送信 — 別 feature の `/admin/settings/email/preview` で別途扱う
- Webhook 経由の delivery 状態追跡（`email.delivered` / `email.bounced` の受信）— v2 候補、本 spec の scope 外
- スケジュール送信、bulk 送信、複数宛先送信 — 本機能の主旨と矛盾
- Marketing 用ヘッダ（`List-Unsubscribe` 等）の付与 — operator 1 通の diagnostic に不要

## 4. Official Recommendations Applied

Resend 公式ドキュメント（context7 検証済）に基づき、以下を全採用：

| 機能                               | 採否 | 仕様                                                                                                                                                          |
| ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Email JSX template           | ✅   | `payload.react = TestEmail({...})`。`@react-email/render` 依存追加なし（Resend SDK が内部 SSR）                                                               |
| `tags`                             | ✅   | `[{name:"category",value:"test"},{name:"source",value:"admin_settings"}]` — Resend dashboard で本番トラフィックから分離可能                                   |
| `headers`                          | ✅   | `{"X-Test-Email":"true"}` — 受信側 grep 用                                                                                                                    |
| `Idempotency-Key`                  | ✅   | per-click unique: `test-email/${staffId}/${Date.now()}-${randomUUID().slice(0,6)}`（同一クリックの Server Action retry を吸収、連続クリックは別 ID で別送信） |
| Simulator addresses                | ✅   | UI dropdown で `delivered@/bounced@/complained@/suppressed@resend.dev` を選択肢提示。Resend 公式：「Do not set up testing flows with fake email addresses」   |
| `validateSenderDomain` pre-check   | ✅   | 既存関数を hard gate 再利用（settings 保存と同 SSoT）                                                                                                         |
| Friendly From + Reply-To           | ✅   | `sendEmail()` が既存処理（`getFromAddress("Name <email>")` + `delivery.replyToEmail` 注入）                                                                   |
| Resend messageId 返却              | ✅   | `sendEmail()` 返却型を refactor して messageId を surface、UI 上 monospace で表示                                                                             |
| Rate limit                         | ✅   | 既存 `authMutationRateLimiter`（20/15min/IP） — Resend team 5 req/sec quota 防御                                                                              |
| Audit log                          | ✅   | `executeAdminMutationResult` 自動 + `metadata.{recipient, messageId, simulatorAddress}`                                                                       |
| Labeled variants（`delivered+x@`） | ❌   | admin 単独利用で価値なし                                                                                                                                      |
| `scheduled_at`                     | ❌   | テスト主旨と矛盾                                                                                                                                              |
| Webhook event consumer             | ❌   | 別 feature scope（v2 候補）                                                                                                                                   |

## 5. Architecture

### 5.1 Component diagram

```
EmailSection.tsx (admin settings tab)
  └─ TestEmailCard.tsx ←─ new client component
        ├─ Recipient <Input type="email"> (prefill: current admin email)
        ├─ Simulator <Select> (delivered/bounced/complained/suppressed)
        ├─ <Button>送信</Button>
        ├─ <StatusBanner success={...} message="..."/> (inline messageId)
        └─ uses useTransition + sendTestEmailAction
                ↓ Server Action
sendTestEmailAction (_shared/actions/settings/test-email.ts) ←─ new
  ├─ Zod validate recipient (z.email().max(100))
  ├─ executeAdminMutationResult({resource:"settings",action:"update", execute, auditMetadata})
  │     └─ execute:
  │           ├─ assertActionRateLimit(authMutationRateLimiter)
  │           ├─ getEmailDeliverySettings() → senderEmail
  │           ├─ validateSenderDomain(senderEmail) → gate
  │           └─ sendTestEmail({to, triggeredBy, ...}) (lib wrapper)
                       ↓
sendTestEmail (src/shared/lib/email/test-email.ts) ←─ new
  └─ sendEmail({
        payload: {
          to, subject: "【Myrrh Rental Space】テスト送信",
          react: TestEmail({recipientLabel, siteName, timestamp, triggeredBy}),
          tags: [{name:"category",value:"test"},{name:"source",value:"admin_settings"}],
          headers: {"X-Test-Email":"true"},
        },
        idempotencyKey: `test-email/${staffId}/${ts}-${rnd6}`,
        operation: "settings.test_email_send",
        context: {recipient, simulatorAddress},
      })
        ↓
sendEmail (src/shared/lib/email/send.ts) ←─ MODIFIED return type
  └─ EmailResult discriminated union (clean break, see §6)
        ↓ Resend SDK
TestEmail (src/shared/emails/test-email.tsx) ←─ new
  └─ React Email JSX, house pattern (Html lang="ja"/Head/Preview/Body/Container)
```

### 5.2 Boundary discipline

- Server Action は thin — Zod validate + delegate to lib wrapper
- `sendTestEmail` lib wrapper は domain commands を呼ばない（DB write なし、純粋 side-effect）
- `TestEmail` component は `src/shared/emails/` に配置（既存 17 templates と同階層・house style）
- `(admin)` から `@/shared/lib/email` を import するのは既存パターン通り許可

## 6. Clean Refactor of `sendEmail()` Return Type

### 6.1 Motivation

現在の `sendEmail()` は `{ success: true } | { success: false; error: string }` を返す。問題:

1. **messageId を捨てている** — `resend.emails.send()` の response から `{ id }` を取れるのに使っていない。テスト送信機能では cross-reference のため必須
2. **`RESEND_API_KEY` 未設定時の silent success** — `{ success: true }` を返すため、UI 上「緑バナー出たのに実 send されていない」誤認を招く。テスト送信機能の主旨と真っ向衝突

ユーザ指示「後方互換性のないクリーンな実装」に従い、ここで返却型を refactor する。

### 6.2 New `EmailResult` type

```ts
// src/shared/lib/email/types.ts
export type EmailResult =
  | { ok: true; messageId: string } // 実送信成功
  | { ok: false; reason: "disabled" } // RESEND_API_KEY 未設定（明示）
  | { ok: false; reason: "error"; error: string }; // Resend API エラー（retry 尽きた後）
```

### 6.3 Migration

`sendEmail()` 戻り値を消費する全 caller を新型に追随させる（9 ファイル）:

```
src/shared/lib/email/{reservation,event,contact,welcome,inquiry,system,reminder,password-reset,review}-emails.ts
```

既存パターン `if (!result.success) { ... }` を `if (!result.ok) { ... }` に置換。`disabled` を意識しない既存 caller は `.ok === false` 全体を「失敗」として扱えば従前通りの挙動（fire-and-forget log だけ）になる。disabled を特別扱いする必要がある caller は今のところ無い（テスト送信のみが新規要件）。

### 6.4 Test plan for the refactor

既存統合テスト `__tests__/integration/` のうち `sendEmail` を mock しているテストは type 更新で機械的修正。失敗するテストがあれば caller 側のロジックバグを暴いた可能性が高いので個別検査。

## 7. Files

### 7.1 Added (5)

| File                                                                                | Purpose                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/emails/test-email.tsx`                                                  | React Email JSX component。Props: `{ recipientLabel, siteName, timestamp, triggeredBy }`。house pattern 準拠（`<Html lang="ja">/<Head/>/<Preview>テスト送信 - {siteName}</Preview>/<Body style={main}>/<Container style={container}>`、system font、`#0066cc` accent、`maxWidth:560px`） |
| `src/shared/lib/email/test-email.ts`                                                | `sendTestEmail({to, staffId, triggeredByEmail, triggeredByName, siteName, simulatorAddress})` ラッパー。`sendEmail()` を呼び、Resend tags/headers/idempotencyKey を組み立てる                                                                                                            |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/test-email.ts`          | Server Action `sendTestEmailAction(recipient: string)`。Zod validate → `executeAdminMutationResult(resource:"settings", action:"update", execute, auditMetadata)`                                                                                                                        |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/TestEmailCard.tsx` | Client component。recipient input + simulator dropdown + 送信ボタン + StatusBanner。`useTransition` で action 呼び出し                                                                                                                                                                   |
| `__tests__/integration/actions/admin/test-email.test.ts`                            | `coupon-bulk.test.ts` pattern で `sendEmail` mock。9 ケース（§9 参照）                                                                                                                                                                                                                   |

### 7.2 Modified (12)

| File                                                                               | Change                                                                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/shared/lib/email/send.ts`                                                     | 戻り値を新 `EmailResult` に refactor、`resend.emails.send()` response から `id` を抽出して返す |
| `src/shared/lib/email/types.ts`                                                    | `EmailResult` 型を新形に差し替え                                                               |
| `src/shared/lib/email/reservation-emails.ts`                                       | `.success` → `.ok`                                                                             |
| `src/shared/lib/email/event-emails.ts`                                             | 同上                                                                                           |
| `src/shared/lib/email/contact-emails.ts`                                           | 同上                                                                                           |
| `src/shared/lib/email/welcome-emails.ts`                                           | 同上                                                                                           |
| `src/shared/lib/email/inquiry-emails.ts`                                           | 同上                                                                                           |
| `src/shared/lib/email/system-emails.ts`                                            | 同上                                                                                           |
| `src/shared/lib/email/reminder-emails.ts`                                          | 同上                                                                                           |
| `src/shared/lib/email/password-reset-emails.ts`                                    | 同上                                                                                           |
| `src/shared/lib/email/review-emails.ts`                                            | 同上                                                                                           |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/EmailSection.tsx` | `<TestEmailCard staffEmail={...} />` を CardContent 末尾に追加                                 |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`              | `export { sendTestEmailAction }` 追加                                                          |

### 7.3 Untouched (deliberately)

- `executeAdminMutationResult` — 既存パターン完全準拠
- `validateSenderDomain` — 既存関数再利用
- `authMutationRateLimiter` / `assertActionRateLimit` — 既存
- RBAC matrix — `settings:update` 既存スロット
- AuditLog Prisma schema — `metadata` Json で十分
- Zod helper utilities — 既存

## 8. UX Specification

### 8.1 Layout（EmailSection.tsx CardContent 末尾に追加）

```
┌─────────────────────────────────────────────────┐
│ Card: メール設定                                  │
│ ─────────────────────                            │
│ ... (既存：送信元/返信先/通知先/送信設定) ...      │
│ ─────────────────────                            │
│ Card: 設定の動作確認 ← 新規 fieldset             │
│                                                   │
│ 宛先メールアドレス *                              │
│ ┌───────────────────────────────────────────┐   │
│ │ admin@example.com                          │   │ ← prefill: current admin
│ └───────────────────────────────────────────┘   │
│ 自分のメールアドレスが入っています。              │
│                                                   │
│ または Resend テスト用アドレスから選択             │
│ ┌───────────────────────────────────────────┐   │
│ │ delivered@resend.dev (配信成功シミュレート) ▼│   │
│ └───────────────────────────────────────────┘   │
│                                                   │
│ [テスト送信]                                      │
│                                                   │
│ ┌─ (success state) ──────────────────────────┐  │
│ │ ✓ 送信しました                              │  │
│ │ 送信ID: re_abc123...  (monospace, copyable)│  │
│ │ 受信箱を確認してください。simulator アドレスの │  │
│ │ 場合は Resend ダッシュボードで確認できます。   │  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 8.2 States

| State                                     | UI                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Idle                                      | recipient prefilled, dropdown closed, submit enabled                                                                 |
| Submitting                                | button disabled, label "送信中..."                                                                                   |
| Success                                   | green StatusBanner with messageId; toast "テスト送信しました"                                                        |
| Validation error                          | red StatusBanner with field error; toast "入力を確認してください"                                                    |
| Domain unverified                         | red StatusBanner "送信元ドメインが Resend で未検証です。検証済み: {verifiedDomains.join(',') or 'なし'}"; toast 失敗 |
| Rate limit                                | red StatusBanner "リクエストが多すぎます。しばらくしてからお試しください"; toast                                     |
| Resend disabled (`RESEND_API_KEY` 未設定) | yellow StatusBanner "メール送信機能が無効です（RESEND_API_KEY 未設定）"; toast                                       |
| Resend API error                          | red StatusBanner with error.message; toast 失敗                                                                      |

### 8.3 Simulator dropdown content

```
- (選択なし)
- delivered@resend.dev — 配信成功
- bounced@resend.dev — バウンス（受信拒否）
- complained@resend.dev — 苦情（スパム報告）
- suppressed@resend.dev — 配信抑制
```

選択時、recipient input は dropdown 値に置換され、prefill フラグはクリア。input を再編集すると dropdown は「選択なし」に戻る。

## 9. Test Plan

### 9.1 Integration tests (`__tests__/integration/actions/admin/test-email.test.ts`)

`__tests__/integration/actions/admin/coupon-bulk.test.ts` pattern を踏襲、`mock.module()` で `sendEmail` + `executeAdminMutationResult` + Resend client を差し替え：

1. **未認証**: `executeAdminMutationResult` が unauth error 返却、`sendEmail` 呼ばれない
2. **権限不足（VIEWER）**: forbidden error、`sendEmail` 呼ばれない
3. **rate-limit 超過（21st call）**: too many requests error、`sendEmail` 呼ばれない
4. **invalid recipient（"not-an-email"）**: Zod field error、`sendEmail` 呼ばれない
5. **sender domain 未検証**: `validateSenderDomain` mock `{ ok: false, verifiedDomains: ["other.com"] }` → readable error、`sendEmail` 呼ばれない
6. **happy path 実宛先**: `sendEmail` mock `{ ok: true, messageId: "re_x" }` → action returns `{ messageId: "re_x" }`、audit `metadata.simulatorAddress = false`
7. **happy path simulator 宛先**: 同上 + `metadata.simulatorAddress = true`
8. **RESEND_API_KEY 未設定**: `sendEmail` mock `{ ok: false, reason: "disabled" }` → action returns disabled error、UI が黄色バナー
9. **Resend API error**: `sendEmail` mock `{ ok: false, reason: "error", error: "Invalid API key" }` → action surfaces error 文言

assertion 共通項:

- `sendEmail.mock.calls[0][0].payload.to` is the recipient
- `payload.tags` includes both `category=test` と `source=admin_settings`
- `payload.headers["X-Test-Email"] === "true"`
- `idempotencyKey` matches `/^test-email\/[a-z0-9-]+\/\d+-[a-z0-9]{6}$/`
- `operation === "settings.test_email_send"`

### 9.2 Unit tests

- `src/shared/lib/email/__tests__/test-email.test.ts` — `sendTestEmail` payload composition（tags/headers/idempotency 形状）
- `src/shared/emails/__tests__/test-email.test.tsx` — `TestEmail` component が `<Preview>` テキストとタイムスタンプを含む（React Email の `render()` で HTML 抽出 ... ただしプロジェクトは `@react-email/render` 未導入なので、JSX tree の snapshot test に留める）

### 9.3 Manual E2E checklist（実装後 admin で確認）

1. `/admin/settings` メールタブを開く → カード末尾に「設定の動作確認」セクションが表示される
2. recipient input が現在 admin のメールアドレスで prefill されている
3. [テスト送信] クリック → 数秒で緑バナー + messageId 表示、自分の受信箱にテストメール到着
4. simulator dropdown から `bounced@resend.dev` 選択 → recipient が置換される → 送信 → 緑バナー（Resend 受理成功）、Resend ダッシュボードで bounce イベントが ~30 秒後に観測可能
5. recipient を `not-an-email` に書き換えて送信 → 赤バナー（validation error）、ネットワークタブで Resend 呼び出し無し確認
6. 設定タブで送信元を未検証ドメインに変更し保存（保存自体は availability-first で通る）→ テスト送信 → 赤バナー「検証済みドメイン: …」
7. [テスト送信] を 25 回連続クリック → 21 回目以降赤バナー rate limit
8. ローカルで `RESEND_API_KEY` 未設定 → 黄色バナー（false-green でない）
9. AuditLog テーブル参照 → `resource=settings, action=UPDATE, metadata.recipient, metadata.messageId, metadata.simulatorAddress` 記録
10. [テスト送信] 連打 → 各クリックで異なる messageId（per-click idempotency 確認）

## 10. Risks and Mitigations

### 10.1 In-scope changes

| Risk                                                 | Mitigation                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sendEmail()` 返却型 refactor が既存 9 caller を壊す | 機械的置換（`.success` → `.ok`）+ 既存統合テスト全実行 + `bun run validate && bun run build` で type 整合確認 |
| Idempotency key 衝突（同 ms 連打）                   | `Date.now() + randomUUID().slice(0,6)` で衝突確率を 16^6 分の 1 まで低減                                      |
| Rate-limit が IP 単位（NAT 配下複数 admin で共有）   | acceptable、PR description に明記                                                                             |

### 10.2 Out-of-scope but flagged

| Issue                                                    | Action                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `email.delivered` / `email.bounced` webhook 受信が未実装 | spawn_task で別 feature 化（テスト送信が定着したら delivery 状態追跡を本機能とリンク）                |
| 本番テンプレ毎の preview/test 送信                       | 別 spec（`/admin/settings/email/preview` ページ案）                                                   |
| `@react-email/components` の caret range（^1.0.12）      | v2 で `render()` async breaking change の歴史あり。本機能は `render()` 未使用なので影響なし、現状維持 |

## 11. Migration / Rollback

- DB migration なし
- Feature flag なし（admin RBAC `settings:update` が既存 gate）
- Rollback = revert commit のみ（環境変数・schema 変更ゼロ）

## 12. Open Questions

なし。研究フェーズで上がった 2 つの open question は spec で決定済み：

- Resend disabled UI: card 表示・送信ボタン disabled・黄色バナー説明
- Simulator dropdown 可視性: 全 admin 常時表示

ユーザレビュー時に追加質問が出れば本 spec を更新。

## 13. References

- Resend API Send Email: https://resend.com/docs/api-reference/emails/send-email
- Resend Idempotency-Key: https://resend.com/docs/api-reference/idempotency-keys
- Resend Test addresses: https://resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing
- Resend Rate limits: https://resend.com/docs/api-reference/introduction
- React Email components: https://react.email/docs/introduction
- 既存類似パターン: [testResendConnectionAction](<src/app/(admin)/admin/(dashboard)/_shared/actions/settings/api-keys/index.ts:83>)
- 既存テンプレ canonical: [ReservationConfirmationEmail](src/shared/emails/reservation-confirmation.tsx)
- 既存メール送信基盤: [sendEmail](src/shared/lib/email/send.ts)
- プロジェクトルール: [admin-server-actions.md](.claude/rules/admin-server-actions.md), [react-components.md](.claude/rules/react-components.md)
