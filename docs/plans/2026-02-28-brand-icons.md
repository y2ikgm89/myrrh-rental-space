# Brand Icons 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `@icons-pack/react-simple-icons` を導入し、Lexical エディタのツールバー/ピッカーのブランドアイコン（X・Instagram・YouTube・Figma）を本物のブランドロゴに置き換える。公開ページでも直接 import できるようにする。

**Architecture:** ミニマル・ダイレクト使用。ラッパー/バレルなし。`InsertItemBase.icon` の型を `LucideIcon` から汎用 `IconComponent` に変更し、Simple Icons を直接割り当てる。

**Tech Stack:** `@icons-pack/react-simple-icons`（CC0 + MIT）、TypeScript、React 19

**Design Doc:** `docs/plans/2026-02-28-brand-icons-design.md`

---

## Task 1: パッケージインストール

**Files:**

- Modify: `package.json`（自動）、`bun.lock`（自動）

**Step 1: インストール**

```bash
bun add @icons-pack/react-simple-icons
```

Expected output: `bun add v1.3.x [...] + @icons-pack/react-simple-icons@x.x.x`

**Step 2: インストール確認**

```bash
node -e "const { SiX } = require('@icons-pack/react-simple-icons'); console.log(typeof SiX)"
```

Expected: `function`

**Step 3: コミット**

```bash
git add package.json bun.lock
git commit -m "chore(deps): add @icons-pack/react-simple-icons"
```

---

## Task 2: `InsertItemBase.icon` 型を汎用 `IconComponent` に変更

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts`

**背景:**

- 現在 `icon: LucideIcon`（lucide-react 固有型）
- Simple Icons は `FC<{ color?: string; size?: number | string; className?: string }>` — 型互換
- `ComponentType<{ size?: number | string; color?: string; className?: string }>` は両ライブラリに代入可能

**Step 1: ファイルを確認**

```bash
# 現在の LucideIcon import と icon 型の行を確認
grep -n "LucideIcon" src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/config/insert-items.ts
```

Expected: 2行（import 行と `icon: LucideIcon` 行）

**Step 2: 型変更を実装**

`insert-items.ts` の先頭 import ブロックを以下のように変更する:

```typescript
// 削除する行:
// import type { LucideIcon } from 'lucide-react'

// 追加する行（react は既に import 済みでなければ追加）:
import type { ComponentType } from "react";

// 追加する型エクスポート（InsertItemBase の前）:
export type IconComponent = ComponentType<{
  size?: number | string;
  color?: string;
  className?: string;
}>;
```

`InsertItemBase` の `icon` フィールドを変更:

```typescript
// Before:
icon: LucideIcon;

// After:
icon: IconComponent;
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし（`LucideIcon` の各アイコンはすべて `IconComponent` に代入可能）

---

## Task 3: Lexical ブランドアイコンを Simple Icons に置き換え

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/insert-items.ts`

**置き換えマッピング:**

| 削除（Lucide） | 追加（Simple Icons） | 対象アイテム ID |
| -------------- | -------------------- | --------------- |
| `Twitter`      | `SiX`                | `x`             |
| `Instagram`    | `SiInstagram`        | `instagram`     |
| `Youtube`      | `SiYoutube`          | `youtube`       |
| `Figma`        | `SiFigma`            | `figma`         |

**Step 1: Lucide brand imports を削除**

`insert-items.ts` の lucide-react import から以下を削除:

```typescript
// 削除:
  Twitter,
  Instagram,
  Youtube,
  Figma,
```

残す（非ブランド Lucide アイコン）: `Pilcrow`, `Heading1-4`, `TextQuote`, `List`, `ListOrdered`, `ListChecks`, `Image`, `Video`, `Table`, `Minus`, `Code`, `Columns`, `CaseLower`, `CaseUpper`, `CaseSensitive`, `Scissors`, `AlertCircle`, `ChevronsDownUp`, `MousePointerClick`, `Quote`, `Link2`, `Footprints`, `PanelTop`, `ListTree`, `Blocks`, `Save`, `Map`, `Volume2`, `Paperclip`, `Music`, `LayoutGrid`, `Clock`, `Table2`

**Step 2: Simple Icons import を追加**

`insert-items.ts` の import ブロックに追加（`'react'` import の直後あたり）:

```typescript
import {
  SiX,
  SiInstagram,
  SiYoutube,
  SiFigma,
} from "@icons-pack/react-simple-icons";
```

**Step 3: INSERT_ITEMS 内のアイコンを置き換え**

```typescript
// youtube アイテム（約 289 行目）:
// Before: icon: Youtube,
// After:  icon: SiYoutube,

// x アイテム（約 308 行目）:
// Before: icon: Twitter,
// After:  icon: SiX,

// instagram アイテム（約 319 行目）:
// Before: icon: Instagram,
// After:  icon: SiInstagram,

// figma アイテム（約 363 行目）:
// Before: icon: Figma,
// After:  icon: SiFigma,
```

**Step 4: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 5: lint チェック**

```bash
bun run lint
```

Expected: エラーなし（未使用 import が消えている）

**Step 6: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/config/insert-items.ts
git commit -m "feat(lexical): replace Lucide brand icons with Simple Icons (X/Instagram/YouTube/Figma)"
```

---

## Task 4: 最終検証

**Step 1: フル検証**

```bash
bun run validate
```

Expected: `type-check` と `lint` が両方パス

**Step 2: ビルド確認**

```bash
bun run build
```

Expected: エラーなし、bundle size の増加は Simple Icons の tree-shaking により最小限（4アイコン分のみ）

**Step 3: 動作確認（開発サーバー）**

```bash
bun dev
```

1. `http://localhost:3000/admin` にアクセス
2. 記事エディタを開く
3. 「/」でコンポーネントピッカーを開く → YouTube・X・Instagram・Figma のアイコンが本物のブランドロゴになっていることを確認
4. ツールバーの Insert メニューを開く → 同様に確認

**Step 4: 最終コミット（変更がある場合）**

変更があればコミット。なければスキップ。

---

## 完了後の利用ガイド

### 公開ページでの使用方法

```tsx
// 例: Footer.tsx への SNS リンク追加（将来タスク）
import { SiInstagram, SiX, SiLine } from "@icons-pack/react-simple-icons";

// Tailwind カラートークンで制御
<a href={instagramUrl}>
  <SiInstagram
    size={20}
    color="currentColor"
    className="text-muted-foreground hover:text-foreground"
  />
</a>;
```

### アイコン名の調べ方

- サイト: https://simpleicons.org/
- コンポーネント名は `Si` + PascalCase（例: `X` → `SiX`、`LINE` → `SiLine`、`TikTok` → `SiTiktok`）

---

## Notes

- `SettingsCard.tsx` と `SectionTypeIcon.tsx` の `LucideIcon` 型は変更不要（これらは Lucide 専用で問題なし）
- `Vimeo` は Simple Icons に存在するが（`SiVimeo`）、現在 `Video`（汎用）で代替中。スコープ外
- `ComponentPickerPlugin` の `<item.icon className="h-4 w-4" />` は変更不要（型が緩くなることで互換性が保たれる）
