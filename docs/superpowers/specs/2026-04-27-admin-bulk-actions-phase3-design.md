# P19 Phase 3 — Admin Bulk Actions (status 一括変更 + メール通知)

> **Snapshot: 2026-04-27** — P19 (admin バルク操作網羅) の Phase 3。
> Phase 1 spec (`2026-04-27-admin-bulk-actions-phase1-design.md`) と Phase 2 spec (`2026-04-27-admin-bulk-actions-phase2-design.md`) を ground truth として、差分のみ記述。

## Why

Phase 1/2 で対称化した `bulkDelete*` / `bulkToggleActive*` パターンに加え、**ステータス遷移を伴う bulk 操作**を Phase 3 で扱う。Phase 2 で持ち越した「Customer status 変更 (BLACKLIST/VIP)」「Inquiry RESOLVED 一括 + 自動通知メール」「Event 一括 CANCEL + 参加者通知メール」の 3 領域を完成させ、`RESERVATION_STATUS_TRANSITIONS` 同型の遷移マップを `enums/helpers.ts` に追加する。

## How to apply

Phase 1/2 spec のアーキテクチャ・規律・禁止事項を継承し、本ドキュメントは差分のみ記述する。

---

## 対象範囲（Phase 3）

### 領域別アクション

| 領域          | アクション                           | 状態遷移マップ                | メール通知                                                        |
| ------------- | ------------------------------------ | ----------------------------- | ----------------------------------------------------------------- |
| **customers** | 一括 status 変更 (5 状態任意遷移)    | `CUSTOMER_STATUS_TRANSITIONS` | **なし** (internal CRM status のため)                             |
| **inquiries** | 一括 status 変更 (RESOLVED / CLOSED) | `INQUIRY_STATUS_TRANSITIONS`  | 新規テンプレ `InquiryStatusNotificationEmail` (RESOLVED のみ送信) |
| **events**    | 一括 CANCEL                          | `EVENT_STATUS_TRANSITIONS`    | 既存 `sendEventCancelledToAllParticipants(eventId)` 流用          |

Phase 1/2 で実装済みの `bulkDelete*` / `bulkToggleActive*` には**触らない**。新規 `bulkSetStatus*Command` のみ追加する。

---

## 状態遷移マップ詳細

### `CUSTOMER_STATUS_TRANSITIONS` (任意遷移、internal CRM)

5 状態 (NEW / REGULAR / VIP / INACTIVE / BLACKLIST) は**全状態間で自由遷移**を許可する。理由: BLACKLIST 化と REGULAR 復活、休眠 (INACTIVE) と再開、VIP 昇格と降格はすべて運用上必要。同一 status への変更は no-op (`count: 0` で affectedIds 空)。

定義: `enums/helpers.ts` に追加。型は `Readonly<Record<CustomerStatus, readonly CustomerStatus[]>>`。各エントリは「自分以外の 4 状態」を許可。

### `INQUIRY_STATUS_TRANSITIONS` (forward only)

```
NEW         → IN_PROGRESS, RESOLVED, CLOSED
IN_PROGRESS → RESOLVED, CLOSED
RESOLVED    → CLOSED
CLOSED      → (terminal — 戻し不可)
```

backward (RESOLVED → NEW 等) は `DomainError("VALIDATION")` で reject。

### `EVENT_STATUS_TRANSITIONS`

```
DRAFT     → PUBLISHED, CANCELLED, ARCHIVED
PUBLISHED → CANCELLED, ARCHIVED
CANCELLED → ARCHIVED
ARCHIVED  → (terminal)
```

Phase 3 の bulk action は CANCELLED への遷移に絞るが、マップは将来 `bulkPublishEvents` / `bulkArchiveEvents` で再利用可能なよう完全形で定義する。

---

## メールテンプレ仕様

### 新規テンプレ: `InquiryStatusNotificationEmail`

ファイル: `src/shared/emails/inquiry-status-notification.tsx`

Props:

```typescript
type Props = {
  customerName: string;
  inquirySubject: string;
  newStatus: "RESOLVED" | "CLOSED";
  siteName: string;
};
```

仕様:

- `EventCancelledNotificationEmail` の構造を踏襲 (Heading + Section + Text + Hr + footer)
- `RESOLVED`: 「お問い合わせの対応が完了しました」見出し、「ご対応ありがとうございました」本文
- `CLOSED`: 同テンプレ流用 (見出し「お問い合わせを終了いたしました」、本文「再度お問い合わせの際は新規としてご連絡ください」)
- inline CSS のみ (`@react-email/components` 標準パターン)
- `siteName` は `getSeoSettings()` 経由で取得 (`sendInquiryReplyEmail` 同パターン)

### Email send helper: `sendInquiryStatusNotificationToAll`

ファイル: `src/shared/lib/email/inquiry-emails.ts` に追記

シグネチャ:

```typescript
export async function sendInquiryStatusNotificationToAll(
  inquiryIds: string[],
  newStatus: "RESOLVED" | "CLOSED",
): Promise<void>;
```

仕様:

- `prisma.inquiry.findMany({ where: { id: { in } }, select: { id, name, email, subject } })` で対象取得
- `Promise.allSettled(items.map((inquiry) => sendEmail({ ... idempotencyKey: `inquiry-status/${inquiry.id}/${newStatus}` })))` で並列送信
- 失敗は `logError`（category: `EXTERNAL_API`, severity: `MEDIUM`）で個別記録、bulk 自体は成功扱い

### Event CANCELLED 通知 (既存流用)

`bulkSetStatusEventsCommand(ids, EventStatus.CANCELLED)` の Server Action `afterSuccess` 内で、affectedIds をループして既存 `sendEventCancelledToAllParticipants(eventId)` を `Promise.allSettled` で並列実行。新規テンプレ作成不要。

### Customer status 変更通知

**送信しない** (internal CRM status の業界標準)。VIP 昇格を顧客に通知すると spam 性が高く、BLACKLIST 化は通知すべきでない。

---

## アーキテクチャ

Phase 1/2 と完全同型。差分:

- domain command: `bulkSetStatus<Entity>Command(ids, newStatus)` を新規追加
  - 戻り値型: `{ count: number; newStatus: <Status>; affectedIds: string[]; rejectedIds?: string[] }`
  - `rejectedIds`: 状態遷移マップ違反で拒否された ID（UI で「N 件は遷移不可のためスキップしました」表示用）
- 状態遷移検証は **command 層内部で個別チェック** (Reservation の `validateStatusTransition` と異なり bulk のため early throw せず収集する)
- Server Action: `bulkSetStatus<Entity>(ids, newStatus)` で `executeAdminMutationResult` 経由
- UI: 既存 `<Entity>BulkActions.tsx` (Phase 1/2 で作成済み) に **status 変更 dropdown + DropdownMenu** を追加
- `afterSuccess` で cache invalidation + メール送信 (該当 entity のみ) を `fireAndForget` で実行

### Customer の `isActive` と `status` の関係

Phase 2 で `bulkToggleActiveCustomers` (boolean toggle) を実装済み。Phase 3 の `bulkSetStatusCustomers` は **status enum 変更のみ**。両者は独立したフィールドとして共存する (silent bug 防止)。

---

## test 戦略

Phase 1/2 と同型。新規ファイル:

- `__tests__/unit/domain/{customers,inquiries,events}/bulk-status-commands.test.ts` (既存 `bulk-commands.test.ts` を拡張する形でも可)
- `__tests__/integration/actions/admin/{customer,inquiry,event}-bulk-status.test.ts` (既存 `*-bulk.test.ts` 拡張も可)

**重要**:

- cloudflare mock は Phase 1/2 と同じ全 11 export stub テンプレを継続適用 (mock pollution 回避)
- Bundle H (inquiry) は `mock.module("@/shared/lib/email/inquiry-emails", () => ({ sendInquiryStatusNotificationToAll: mock(() => Promise.resolve()), sendInquiryReplyEmail: mock(() => Promise.resolve({ success: true })) }))` で email 全 export 網羅 (Phase 1 の cloudflare 学習と同じ)
- Bundle I (event) は `mock.module("@/shared/lib/email/event-emails", () => ({ sendEventCancelledToAllParticipants: mock(() => Promise.resolve()), ...他 5 export }))` で全 6 export 網羅
- 実 args 検証する mock は `mock<(args: T) => Promise<...>>` 型で書く (CLAUDE.md learning「Bun test `mock<() => ...>` は引数を捨てる silent bug」)

---

## 禁止事項（Phase 1/2 から継承 + Phase 3 固有）

Phase 1 spec の 7 項目 + Phase 2 spec の 3 項目に加えて:

11. **状態遷移マップに該当しない遷移の bulk 許可禁止** — 例: Inquiry RESOLVED → NEW のような backward は `rejectedIds` に積んでスキップ、bulk 自体は他の valid な ID のみ処理する (early throw で全体停止しない)
12. **Customer status 変更時のメール通知禁止** — internal CRM status のため。プロジェクト独自厳格化
13. **Phase 1/2 の `bulkDelete*` / `bulkToggleActive*` 改修禁止** — Phase 3 は新規 `bulkSetStatus*` のみ追加。既存実装には一切触らない
14. **新規メールテンプレは `EventCancelledNotificationEmail` を構造踏襲** — heading 色・section 配置・footer 形式を統一 (UI 一貫性)
15. **status 変更 dropdown は既存 `<Entity>BulkActions.tsx` に追加** — 新規 component file 作成禁止 (UI 散在防止)

---

## Out of scope

- 一括ロール変更 (User の admin → editor 等) — Phase 4 として後日検討
- 一括 CSV エクスポート連携
- カスタマイズ可能なメッセージ付き bulk RESOLVED (admin が個別メッセージ入力する UI) — 現スコープは定型テンプレのみ
- Customer status 変更時のスタッフ間通知 (AdminNotification 生成)

---

## 参考実装

| 領域                                      | Phase 1/2 ベース実装                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| domain bulk command                       | `src/shared/domain/customers/bulk-commands.ts` (Phase 2 Bundle D)                                    |
| status 遷移検証 helper                    | `src/shared/domain/reservations/status.ts` の `validateStatusTransition`                             |
| 状態遷移マップ                            | `src/shared/lib/validations/enums/helpers.ts` の `RESERVATION_STATUS_TRANSITIONS`                    |
| Inquiry email send helper                 | `src/shared/lib/email/inquiry-emails.ts` の `sendInquiryReplyEmail`                                  |
| Event 一括メール送信                      | `src/shared/lib/email/event-emails.ts` の `sendEventCancelledToAllParticipants`                      |
| Email template                            | `src/shared/emails/event-cancelled-notification.tsx` (構造踏襲)                                      |
| BulkActions UI (status dropdown 追加対象) | `src/app/(admin)/admin/(dashboard)/{customers,inquiries,events}/_components/<Entity>BulkActions.tsx` |
| cloudflare mock 全 stub テンプレ          | `__tests__/integration/actions/admin/customer-bulk.test.ts` (Phase 2 commit `4ef4f6ab`)              |

---

## ADR 採番

Phase 1/2 同様、純粋な対称化 + パターン拡張のため新 ADR 不要。状態遷移マップは既存 `RESERVATION_STATUS_TRANSITIONS` パターンの cascade。
