---
description: shadcn/ui コンポーネント実装規約 — React import、Radix UI namespace、SelectItem 空文字禁止
paths:
  - src/**/components/**/*.tsx
  - src/**/_components/**/*.tsx
---

# shadcn/ui コンポーネント

- **`import * as React from "react"` 禁止** — shadcn/ui 再生成時に混入する。`import type { ComponentProps } from "react"` 等の個別 import に変換。`React.ComponentProps` → `ComponentProps`、`React.HTMLAttributes` → `HTMLAttributes`
- **`<SelectItem value="">` 禁止** — Radix UI Select は空文字列をプレースホルダー表示用に予約しており、`value=""` はランタイムエラー。nullable 選択にはセンチネル値パターンを使用: `const NONE_VALUE = "__none__"` → `<SelectItem value={NONE_VALUE}>なし</SelectItem>` → `onValueChange` で `value === NONE_VALUE ? null : value` にマップ
- **個別 `@radix-ui/react-*` パッケージ禁止 — `radix-ui ^1.4.x` 集約のみ** — `import { Dialog as DialogPrimitive } from "radix-ui"` で namespace import（`import * as DialogPrimitive from "@radix-ui/react-dialog"` は廃止形式、再導入禁止）。`Slot` は v1 で構造変更済 — `import { Slot as SlotPrimitive } from "radix-ui"` + 本文 `<SlotPrimitive.Slot ...>` で書き換え（トップレベル `Slot` export なし）
