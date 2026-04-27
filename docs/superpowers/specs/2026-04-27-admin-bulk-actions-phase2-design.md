# P19 Phase 2 — Admin Bulk Actions (customers / inquiries / coupons)

> **Snapshot: 2026-04-27** — P19 (admin バルク操作網羅) の Phase 2。
> Phase 1 spec (`2026-04-27-admin-bulk-actions-phase1-design.md`) を ground truth として、差分のみ記述。
> Phase 3 (一括ステータス変更 + 参加者通知メール / 顧客 status 遷移) は別 spec で扱う。

## Why

Phase 1 (spaces / events / news) で `PostBulkActions` パターンを 3 領域に拡張完了。Phase 2 では運用系リソース (customers / inquiries / coupons) に同パターンを適用する。

ただし **status 遷移系の bulk 操作 (顧客 BLACKLIST 化 / inquiry RESOLVED / メール通知付き) は Phase 3 持ち越し**とし、Phase 2 は **一括削除 + 一括 isActive toggle (該当時)** の最小セットに絞る。理由: status 遷移は「Customer.status 変更時のメール通知」「Inquiry RESOLVED 時の自動返信」等のサイドエフェクトが絡むため、Phase 3 で「メール通知 / 状態遷移マップ整備」とまとめて扱う方が clean。

## How to apply

Phase 1 spec のアーキテクチャ・規律・禁止事項を引き継ぎ、本ドキュメントは差分のみ記述する。

---

## 対象範囲（Phase 2）

### 領域別アクション

| 領域          | アクション                      | 戦略                                                                                                     | Phase 3 持ち越し                  |
| ------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **customers** | 一括削除 + 一括 isActive toggle | hard delete (FK Reservation.customerId は SetNull で衝突なし)、`isActive` Boolean toggle                 | status 変更 (BLACKLIST / VIP 等)  |
| **inquiries** | 一括削除のみ                    | hard delete (`Inquiry` に isActive なし)                                                                 | `status: NEW → RESOLVED` 一括変更 |
| **coupons**   | 一括削除 + 一括 isActive toggle | hard delete (`Reservation.couponId` は SetNull、`Coupon.usageCount` のみ参照)、`isActive` Boolean toggle | クーポン期限の bulk 延長          |

### 領域固有の差分

#### customers

- **状態フィールド**: `status: CustomerStatus` enum (NEW/REGULAR/VIP/INACTIVE/BLACKLIST) + `isActive: Boolean`
- **削除戦略**: hard delete (`prisma.customer.deleteMany`)。`Reservation.customerId` は `onDelete: SetNull` のため FK skip 不要
- **isActive toggle**: spaces の publish/unpublish パターン同様 `updateMany({ data: { isActive: true/false } })`
- **キャッシュ無効化**: `CACHE_TAGS.CUSTOMERS` + 各 customer ID ごと `getCacheTag.customers.detail(id)` cascade
- **監査ログ**: `resource: "customer"`, `action: "delete" | "update"`

#### inquiries

- **状態フィールド**: `status: InquiryStatus` (NEW/IN_PROGRESS/RESOLVED) のみ、`isActive` なし
- **削除戦略**: hard delete (`prisma.inquiry.deleteMany`)
- **キャッシュ無効化**: `CACHE_TAGS.INQUIRIES` + per-id detail tag
- **監査ログ**: `resource: "inquiry"`, `action: "delete"`
- **Phase 2 では status 変更を実装しない** — RESOLVED 一括設定は管理者の運用主軸だが、自動返信メール送信を伴うため Phase 3 へ

#### coupons

- **状態フィールド**: `isActive: Boolean` + `validFrom/validUntil`
- **削除戦略**: hard delete (`prisma.coupon.deleteMany`)。`Reservation.couponId` は `onDelete: SetNull` で衝突なし
- **isActive toggle**: spaces 同パターン
- **キャッシュ無効化**: `CACHE_TAGS.COUPONS` + per-id detail tag
- **監査ログ**: `resource: "coupon"`, `action: "delete" | "update"`

---

## アーキテクチャ

Phase 1 と完全同型。差分:

- **customers / coupons の isActive toggle**: Phase 1 の `bulkTogglePublishedXxxCommand(ids, publish)` のシグネチャを `bulkToggleActiveXxxCommand(ids, isActive)` にリネーム (`isPublished` → `isActive`)。戻り値型は `{ count: number; isActive: boolean; affectedIds: string[] }`
- **inquiries は delete のみ**: `bulkDeleteInquiriesCommand(ids)` のみ。toggle command は不要

UI / Table / test 層は Phase 1 と同パターン。`Phase1BulkActions.tsx` を参照実装として複製。

---

## test 戦略

Phase 1 と同型。新規ファイル:

- `__tests__/unit/domain/{customers,inquiries,coupons}/bulk-commands.test.ts`
- `__tests__/integration/actions/admin/{customer,inquiry,coupon}-bulk.test.ts`

**重要**: cloudflare mock の partial declaration による batch pollution を **Phase 1 で発生させた経緯あり** (`commit aebc3052`)。Phase 2 では最初から **全 11 export を stub 化** したテンプレで実装する (`purgeCustomerCache` / `purgeInquiryCache` / `purgeCouponCache` の存在は実装ファイル要確認)。

---

## 禁止事項（Phase 1 から継承 + Phase 2 固有）

Phase 1 spec の 7 項目に加えて:

8. **Phase 2 で status 遷移系 bulk 操作実装禁止** — `Customer.status` 変更 / `Inquiry.status` 変更 / メール通知伴う変更は Phase 3
9. **削除戦略の選択ルール** — soft delete モデル (`Customer` 不採用、`Inquiry` 不採用、`Coupon` 不採用) のため全て hard delete。FK `onDelete: SetNull` を schema で確認済みのもののみ実装
10. **cloudflare mock は最初から全 11 export stub 化** — Phase 1 fix commit `aebc3052` の reactive fix を回避

---

## Out of scope

- Phase 3: 一括ステータス変更 (Customer BLACKLIST / Inquiry RESOLVED) + メール通知 + 状態遷移マップ整備
- 一括ロール変更 (User の admin → editor 等)
- 一括 CSV エクスポート連携

---

## 参考実装

| 領域                                 | Phase 1 ベース実装                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| domain bulk command (publish/delete) | `src/shared/domain/spaces/bulk-commands.ts`                                     |
| admin Server Action                  | `src/app/(admin)/admin/(dashboard)/_shared/actions/space/bulk.ts`               |
| BulkActions UI                       | `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceBulkActions.tsx`     |
| Table 改修                           | `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx`           |
| cloudflare mock 全 stub テンプレ     | `__tests__/integration/actions/admin/space-bulk.test.ts` (commit `aebc3052` 後) |

---

## ADR 採番

Phase 1 同様、純粋な対称化のため新 ADR 不要。
