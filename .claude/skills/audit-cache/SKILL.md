---
name: audit-cache
description: Server Action / Route Handler のキャッシュ戦略監査。updateTag vs revalidateTag の使い分け、CACHE_TAGS 定数欠落、'use cache' 関数の safeFetch + toPlainObject パターン、予約 3 点セット網羅性を検出する。
when_to_use: Server Action / Route Handler / 'use cache' 関数を編集した後、または定期メンテ時に使用。
paths:
  - src/**/actions.ts
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/**/api/**/route.ts
---

# キャッシュ戦略監査

## 用語定義

| API                                       | 用途                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| `updateTag(CACHE_TAGS.X)`                 | Server Actions 専用（即時・同期）                     |
| `revalidateTag(CACHE_TAGS.X)`             | Route Handlers / 外部 Webhook 専用（遅延・非同期）    |
| `cacheTag(CACHE_TAGS.X)`                  | `'use cache'` 関数の先頭                              |
| `cacheLife('hours' \| 'days' \| 'weeks')` | キャッシュ有効期間                                    |
| `CACHE_TAGS.*`                            | `@/shared/lib/constants` の定数（マジック文字列禁止） |
| `getCacheTag.*.detail(id)`                | 動的タグ（リソース単体の per-id 無効化用）            |

## ワークフロー

1. `git diff --cached HEAD 2>/dev/null || git diff HEAD~1` で変更差分取得
2. キャッシュ関連コード（`updateTag` / `revalidateTag` / `'use cache'` / `cacheTag` / `safeFetch`）を抽出
3. 以下 5 項目をチェック
4. テーブル形式で報告

## チェック項目

### 1. updateTag vs revalidateTag の使い分け（Critical）

**Server Actions** (`'use server'`):

```typescript
// NG
"use server";
import { revalidateTag } from "next/cache";
revalidateTag(CACHE_TAGS.POSTS); // ← Server Action では updateTag

// OK
import { updateTag } from "next/cache";
updateTag(CACHE_TAGS.POSTS);
```

**Route Handlers** (`src/app/api/`):

```typescript
// NG
import { updateTag } from "next/cache";
updateTag(CACHE_TAGS.POSTS); // ← Route Handler では revalidateTag

// OK
import { revalidateTag } from "next/cache";
revalidateTag(CACHE_TAGS.POSTS);
```

### 2. CACHE_TAGS 定数の欠落（Warning）

```typescript
// NG: マジック文字列
updateTag("posts");

// OK: 定数
import { CACHE_TAGS } from "@/shared/lib/constants";
updateTag(CACHE_TAGS.POSTS);
```

新規タグは `src/shared/lib/constants.ts` の `CACHE_TAGS` に追加。

### 3. 'use cache' 関数での safeFetch パターン（Critical）

```typescript
// NG: await なし
export async function getItems() {
  "use cache";
  return safeFetch({ fetch: () => prisma.item.findMany(), fallback: [] });
}

// NG: await あり・toPlainObject なし（Symbol プロパティ残存）
export async function getItems() {
  "use cache";
  const result = await safeFetch({
    fetch: () => prisma.item.findMany(),
    fallback: [],
  });
  return result;
}

// OK
export async function getItems() {
  "use cache";
  const result = await safeFetch({
    fetch: () => prisma.item.findMany(),
    fallback: [],
  });
  return toPlainArray(result);
}
```

### 4. 'use cache' 関数での cacheTag 設定漏れ（Warning）

```typescript
// NG: cacheTag なし
export async function getPosts() {
  'use cache'
  cacheLife('hours')
  return await safeFetch({ ... })
}

// OK: cacheTag + cacheLife セット
export async function getPosts() {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.POSTS)
  return toPlainArray(await safeFetch({ ... }))
}
```

### 5. 予約アクションの 3 点セット（Critical）

予約を変更する全アクションに必須:

```typescript
updateTag(CACHE_TAGS.RESERVATIONS);
updateTag(getCacheTag.reservations.detail(id));
updateTag(getCacheTag.reservations.calendar());
```

顧客統計（`totalReservations` / `lastReservationAt` 等）が変わる操作は `updateTag(CACHE_TAGS.CUSTOMERS)` も必須。

対象:

- `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`
- `src/app/(public)/_shared/actions/reservation.ts`
- `src/app/(public)/mypage/_shared/actions/reservation.ts`

### 6. その他リソース（リスト + 詳細タグ）

```typescript
updateTag(CACHE_TAGS.<RESOURCE>);              // コレクション
updateTag(getCacheTag.<resource>.detail(id));  // 個別（更新・削除時）
```

クーポン: 予約削除・キャンセル時に `usageCount` をデクリメントしている場合、`CACHE_TAGS.COUPONS` も必要。

## False positive 防止

違反を報告する前に、該当 rule（`.claude/rules/**/*.md`）の例外節を確認:

```bash
grep -n "例外\|EXCEPTION\|sanctioned\|許可\|除外" <rule-file>
```

例外節に記載されていれば Critical / High で報告しない。例:

- `revalidateTag` の第 2 引数 — `gotchas.md` / `server-actions/use-cache.md` で Next.js 16 API として明示

## 検出コマンド

```bash
# 全アクションファイルの updateTag/revalidateTag 一覧
grep -rn "updateTag\|revalidateTag" src/app/ --include="*.ts" | \
  grep -v "node_modules\|import\|//" | \
  awk -F: '{print $1}' | sort -u | while read f; do
    echo "=== $f ==="
    grep -n "updateTag\|revalidateTag" "$f"
  done

# afterSuccess 内で updateTag を呼んでいないアクションを検出
grep -rn "afterSuccess" src/app/ --include="*.ts" | \
  awk -F: '{print $1}' | sort -u | while read f; do
    if ! grep -q "updateTag\|revalidateTag" "$f"; then
      echo "⚠️ キャッシュ無効化なし: $f"
    fi
  done
```

## 出力形式

```
## キャッシュ戦略監査結果

### Critical（必ず修正）
- [file:line] 説明 — ルール: [チェック項目番号]

### Warning（修正推奨）
- [file:line] 説明 — ルール: [チェック項目番号]

### Reservation 3点セット網羅性
| ファイル | アクション | RESOURCE | detail(id) | calendar() | CUSTOMERS | 判定 |
| -------- | ---------- | -------- | ---------- | ---------- | --------- | ---- |

### OK
変更なし or 問題なし
```

変更ファイルにキャッシュ関連コードが含まれない場合は「キャッシュ関連の変更なし — スキップ」で終了。
