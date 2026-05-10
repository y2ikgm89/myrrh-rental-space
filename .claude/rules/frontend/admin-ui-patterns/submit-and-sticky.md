---
description: SubmitButton 統一パターン (pendingLabel / onClick / 複合条件) + Sticky 子サイドバー (grid + items-start + dock 位置)
paths:
  - src/app/(admin)/**/*Form*.tsx
  - src/app/(admin)/**/*Section*.tsx
  - src/app/(admin)/**/page.tsx
  - src/admin/components/ui/submit-button.tsx
---

# SubmitButton + Sticky 子サイドバー

> SubmitButton 統一 (`isPending` + `pendingLabel`) + 非フォーム用途 + Sticky 子サイドバーの 3 点セット (grid `items-start` / dock `top-[calc(--header-height+1rem)]` / 内部 scroll)。

## フォーム送信ボタン（SubmitButton）

フォームの送信ボタンは `SubmitButton` コンポーネントに統一する。インラインの `isPending ? "X中..." : "X"` パターンは禁止:

```tsx
import { SubmitButton } from "@/admin/components/ui";

// OK: SubmitButton（Loader2 スピナー + disabled 自動管理）
<SubmitButton isPending={isPending} label="保存" />
<SubmitButton isPending={isPending} label="予約を作成" pendingLabel="作成中..." />
<SubmitButton isPending={isPending} label="削除" variant="destructive" pendingLabel="削除中..." />

// NG: インライン isPending パターン（禁止）
<Button type="submit" disabled={isPending}>
  {isPending ? "保存中..." : "保存"}
</Button>
```

**`pendingLabel` ルール**:

- 単純ラベル（「保存」「更新」「削除」「作成」）→ 省略可（デフォルト: `label + "中..."`）
- 複合ラベル（「予約を作成」「顧客情報を更新」）→ `pendingLabel` 明示指定（デフォルトだと「予約を作成中...」になる）

**適用対象外**（以下は SubmitButton に置換**しない**）:

- `DeleteConfirmDialog`（内部 isPending 管理）
- カスタムアイコン付きボタン（`Loader2` / `Save` 切替等）

**`onClick` + 複合条件は SubmitButton で表現可能**（適用対象外ではない）:

- `SubmitButton` は `onClick` prop を受け取ると `type="button"` に自動切替する（`SubmitButton.tsx:38-40`）— 非フォーム用途（設定パネル等の状態管理 + 個別保存、Dialog の作成/追加ボタン、接続テストボタン等）にも使える
- `disabled` prop は内部で `isPending || disabled` を OR する — 追加条件（`!isDirty` / `!form.formState.isDirty` / `!value` 等）はそのまま渡す。`isPending` を `disabled` 式に含める必要なし

```tsx
// OK: 非フォーム + 複合条件も SubmitButton で統一
<SubmitButton
  isPending={isPending}
  label="サイドバー設定を保存"
  onClick={handleSave}
  disabled={!isDirty}
/>

// OK: 接続テスト + 保存の 2 ボタン（複数 pending 状態）
<SubmitButton
  isPending={isTesting}
  label="接続テスト"
  pendingLabel="テスト中..."
  variant="outline"
  onClick={handleTest}
  disabled={!value || isPending}
/>
<SubmitButton
  isPending={isSaving}
  label="保存"
  onClick={handleSave}
  disabled={!value || isPending}
/>
```

## Sticky 子サイドバー（grid 内 + sticky TopBar 配下）

管理画面 edit / detail ページで grid layout 内に sticky な sub-sidebar を配置するパターン。`PageEditor` の `SectionListSidebar` が canonical 参照実装。

**3 点セット必須**:

```tsx
<div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:items-start">
  <aside className="flex flex-col gap-2 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:max-h-[calc(100svh-var(--header-height)-2rem)]">
    <div className="...">{/* 固定ヘッダー */}</div>
    <div className="lg:flex-1 lg:overflow-y-auto">
      {/* 内部 scroll するリスト */}
    </div>
  </aside>
  <PrimaryPanel />
</div>
```

1. **grid 親に `lg:items-start`** — `align-self: stretch` デフォルトで aside が右カラム高さに引き伸ばされ sticky containing block が cell 全高化 → sticky が機能しない silent bug 防止
2. **dock 位置は `lg:top-[calc(var(--header-height)+1rem)]`** — TopBar (`sticky top-0 h-16`) の直下 16px に正確 dock。`--header-height` (mobile 56px / tablet+ 64px) に responsive 追従
3. **`lg:max-h-[calc(100svh-var(--header-height)-2rem)]` + 内部 `lg:flex-1 lg:overflow-y-auto`** — viewport 内に aside 全体を収め、長いリストは内部 scroll。`100svh` (small viewport height) で mobile dynamic chrome 対応

**禁止パターン**:

- `lg:top-6` 等 TopBar 高さ未満の dock 値 → aside が TopBar 背後に隠れる silent bug
- `lg:items-start` 不在で `lg:sticky` 配置 → 死に体 sticky（追尾しないように見える）
- `100vh` 利用 → mobile address bar 高さ不安定

業界標準: WordPress Gutenberg / Notion / Linear / Stripe Dashboard と同等パターン。

参照実装: `pages/[slug]/edit/_components/{PageEditor,SectionListSidebar}.tsx`
