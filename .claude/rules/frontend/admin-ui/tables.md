---
paths:
  - src/app/(admin)/**/*Table*.tsx
  - src/app/(admin)/**/*Filters.tsx
  - src/app/(admin)/**/*ActionCell.tsx
  - src/app/(admin)/**/*BulkActions.tsx
  - src/app/(admin)/**/*Sortable*.tsx
---

# 管理画面テーブル・フィルターパターン

> ページネーション + Status / Type Badge への icon prefix + サブルール一覧。

## ページネーションコンポーネント

共通コンポーネント `Pagination` (`@/admin/components/ui/Pagination`) を使用（Carbon Design 準拠、range text + perPage Select + Prev/番号/Next の 3 ゾーン）。required props は `currentPage` / `totalPages` / `total` / `perPage` の 4 つ（`perPage` は表示テキスト `start-end / 全 N 件` 算出に必須）。

**タブ系ページ（prefix 付き URL キー）の落とし穴**:

`SpaceTabContent` / `ReviewTabContent` 等が `adminSpaceSearchParamsCache` 経由で `rvPage` / `spPage` / `catPage` / `locPage` を読む場合、`<Pagination>` には対応する `pageUrlKey` + `perPageUrlKey` を**必ずペアで**渡す。片方欠落で書込先（デフォルト `?page=N`）と読込元（`?rvPage=N` 等）が drift する silent bug（実例: 2026-05-12 `ReviewTabContent.tsx` で `pageUrlKey="rvPage"` 欠落を発見・修正）。

**`defaultPerPage` の妥当性チェック**: 共通デフォルトは 10。例外として `pages` / `faq` / `notifications` は 20、`media` は 24（`perPageOptions={[24, 48, 96]}` も併用）。`<Pagination defaultPerPage={N}>` の値は対応する nuqs parser (`parseAsPerPage.withDefault(N)` 相当) と必ず一致させる（不一致だと初回ロード時に Select の active option が外れる）。

ページネーションは必ず `<nav>` 要素にアクセシビリティ属性を付与する:

```tsx
// OK: アクセシブルなページネーション
<nav aria-label="ページネーション" className="flex items-center gap-2">
  <button
    onClick={() => void setPage(page - 1)}  // void で Promise を明示
    disabled={page <= 1}
  >
    前へ
  </button>
</nav>

// NG: bare div + Promise 放置
<div className="flex items-center gap-2">
  <button onClick={() => setPage(page - 1)}>前へ</button>  // setPage は Promise を返す
</div>
```

**`void` キーワードの必要性**:

`nuqs` の `setPage()` / `setParams()` は `Promise<void>` を返す。
`onClick` ハンドラ内で `void` をつけずに呼ぶと `no-floating-promises` lint エラー。

```tsx
// NG: lint エラー（floating promise）
onClick={() => setPage(page + 1)}

// OK
onClick={() => void setPage(page + 1)}
```

## Status / Type Badge への icon prefix（WCAG 1.4.1 + Material Design 準拠）

Status / Type Badge は **icon prefix で意味補強**が業界標準（Stripe Dashboard / Linear / Shopify Admin / GitHub）。color のみは **WCAG 1.4.1 違反**（色覚特性ユーザーへの情報伝達不足）。

canonical pattern:

```tsx
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { RESERVATION_STATUS_ICONS } from "@/shared/lib/validations/enums/helpers";

// SSoT 経由で固定マッピングを取得
const iconName = RESERVATION_STATUS_ICONS[status];
// または NOTIFICATION_TYPE_ICONS[type] 等

<Badge variant={badgeVariant} className="inline-flex items-center gap-1.5">
  <CuratedIcon name={iconName} className="h-3 w-3" />
  <span>{label}</span>
</Badge>;
```

**ルール**:

- `<Badge>` 自体を拡張せず、**SSoT (`*_ICONS`) + `<CuratedIcon>` の組み合わせ**で配線（`<Badge>` は variant のみで責務分離）
- 共通コンポーネント（`<ReservationStatusBadge>` 等の `_shared/components/status-badges.tsx`）が SSoT consumer になる場合、**1 箇所更新で全消費者に伝播**（admin / customer / mypage / dashboard）
- icon は `aria-hidden="true"`（NN/g — SR は併記 label のみ読む）、`<CuratedIcon>` がデフォルトで自動付与
- 公開（顧客マイページ）の独自 Badge 描画でも同 SSoT を共有 — admin と顧客で icon が一致
- **新 status enum 追加時は 3 SSoT 同時更新必須**: `*_LABELS` + `*_BADGE_VARIANTS` + `*_ICONS`（どれか欠けると silent fallback で UX 劣化）
- icon は curation list (`@/shared/lib/icon-curation`) に存在必須（未登録は `<CuratedIcon>` で no-op fallback だが UI に icon 表示されない silent bug）

**業界 reference**: Stripe Dashboard / Linear / Shopify Admin / GitHub notification list（PR=git-pull-request、issue=alert-circle、comment=message 等）。NN/g Menu Design Checklist Guideline 10「icon は supplementary signals only、text label が primary」。
