---
name: audit-cache
description: Server Action のキャッシュ無効化の網羅性をチェックする。updateTag/revalidateTag の漏れ、不整合、3点セット欠落を検出。Server Action ファイルを編集した後に使用。
when_to_use: Server Action ファイル（actions.ts / mutations.ts）を編集した後、または定期メンテ時に使用。
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/api/**/route.ts
---

# キャッシュ無効化監査

全 Server Action の `afterSuccess` コールバックと `invalidateCache` 関数を走査し、`updateTag` / `revalidateTag` の漏れを検出する。

## チェックルール

### 予約アクション（3点セット必須）

予約を変更する全アクションに以下の3つが必要:

```typescript
updateTag(CACHE_TAGS.RESERVATIONS);
updateTag(getCacheTag.reservations.detail(id));
updateTag(getCacheTag.reservations.calendar());
```

**追加条件**: 顧客統計（`totalReservations`, `lastReservationAt` 等）が変わる操作は `updateTag(CACHE_TAGS.CUSTOMERS)` も必須。

対象ファイル:

- `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`
- `src/app/(public)/_shared/actions/reservation.ts`
- `src/app/(public)/mypage/_shared/actions/reservation.ts`

### その他のリソース（リスト + 詳細タグ）

リソースを変更するアクションに以下が必要:

```typescript
updateTag(CACHE_TAGS.<RESOURCE>);           // コレクション
updateTag(getCacheTag.<resource>.detail(id)); // 個別（更新・削除時）
```

### クーポン関連

予約削除・キャンセル時にクーポン `usageCount` をデクリメントしている場合、`CACHE_TAGS.COUPONS` も必要。

## 検出コマンド

```bash
# 全アクションファイルの updateTag 呼び出しを一覧
grep -rn "updateTag\|revalidateTag" src/app/ --include="*.ts" | \
  grep -v "node_modules\|import\|//" | \
  awk -F: '{print $1}' | sort -u | while read f; do
    echo "=== $f ==="
    grep -n "updateTag\|revalidateTag" "$f"
    echo
  done

# afterSuccess 内で updateTag を呼んでいないアクションを検出
grep -rn "afterSuccess" src/app/ --include="*.ts" | \
  awk -F: '{print $1}' | sort -u | while read f; do
    if ! grep -q "updateTag\|revalidateTag" "$f"; then
      echo "⚠️  キャッシュ無効化なし: $f"
    fi
  done
```

## 出力形式

テーブル形式でアクション別のタグ使用状況を出力:

| ファイル     | アクション | RESOURCE | detail(id) | calendar() | CUSTOMERS | 判定 |
| ------------ | ---------- | -------- | ---------- | ---------- | --------- | ---- |
| admin.ts     | create     | ✓        | -          | ✓          | ✓         | OK   |
| mutations.ts | delete     | ✓        | ✓          | ✓          | ✓         | OK   |
