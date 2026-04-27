---
description: Accessibility — フォーカス管理 / キーボードナビゲーション
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
  - "src/public/components/a11y/**"
---

# Accessibility — フォーカス / キーボードナビ

## フォーカス管理

### フォーカスリング

`outline: none` は禁止。`focus-visible` で視覚的フォーカスを提供:

```tsx
// NG: フォーカスリング除去
<button className="outline-none focus:outline-none">送信</button>

// OK: focus-visible でキーボードユーザーのみ表示
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
  送信
</button>
```

public.css / admin.css の `@layer base` で全体フォーカスリングを定義済み。コンポーネント個別に override する場合は `focus-visible:` を使用する。

### フォーカストラップ（モーダル）

モーダル・ダイアログ表示中はフォーカスをトラップ。Radix UI Dialog・SheetはTab/Escape対応済みのため、カスタム実装では同等の対応が必要:

```tsx
// OK: Radix UI Dialog（フォーカストラップ自動対応）
import * as Dialog from "@radix-ui/react-dialog";

<Dialog.Root>
  <Dialog.Trigger>開く</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>予約確認</Dialog.Title>
      {/* Tabキーがここに閉じ込められる */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>;
```

### スキップリンク

`SkipLink` は公開ページ layout.tsx に実装済み。ターゲットの `id="main-content"` を `<main>` に付与する:

```tsx
// layout.tsx（実装済み）
<SkipLink />  // "メインコンテンツへスキップ" リンク

// page.tsx
<main id="main-content">
  {/* コンテンツ */}
</main>
```

---

## キーボードナビゲーション

### Tab 順序

論理的な Tab 順序を維持する。`tabIndex` でむやみに順序を変えない:

```tsx
// NG: tabIndex で順序を強制変更（DOM順と一致させるべき）
<button tabIndex={3}>第3</button>
<button tabIndex={1}>第1</button>

// OK: DOM 順に従う
<button>第1</button>
<button>第2</button>
<button>第3</button>

// OK: フォーカスを受け取らせたくない場合のみ
<div tabIndex={-1} ref={focusRef}>...</div>
```

### Escape キー（モーダル・ドロップダウン）

Radix UI コンポーネントは Escape キー対応済み。カスタム実装では必ず対応する:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [onClose]);
```
