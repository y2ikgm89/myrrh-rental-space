# Brand Icons 導入設計

**日付**: 2026-02-28
**ステータス**: 承認済み

## 概要

`@icons-pack/react-simple-icons`（3,300+ ブランドアイコン、CC0 + MIT）を導入し、
Lexical エディタのツールバー/ピッカーアイコンと公開ページでブランドアイコンを使用できるようにする。

## ライセンス

- **アイコンデータ**: CC0 1.0（パブリックドメイン）— 商用利用完全無料
- **React ラッパー**: MIT
- **トレードマーク**: ブランド各社が保持。フォロー/シェアリンク等の公正使用の範囲内で使用する

## アプローチ

**ミニマル・ダイレクト使用**（Approach A）:

- 新規ラッパー/バレルファイルなし
- 各使用箇所で直接 import
- YAGNI 原則準拠

## 変更スコープ

### 1. パッケージインストール

```bash
bun add @icons-pack/react-simple-icons
```

### 2. `insert-items.ts` の型変更

`LucideIcon`（lucide-react 固有型）を汎用 `IconComponent` 型に変更。
Lucide・Simple Icons どちらでも割り当て可能になる。

```typescript
// Before
import type { LucideIcon } from "lucide-react";
icon: LucideIcon;

// After
import type { ComponentType } from "react";
export type IconComponent = ComponentType<{
  size?: number | string;
  color?: string;
  className?: string;
}>;
icon: IconComponent;
```

### 3. Lexical insert-items.ts のブランドアイコン置き換え

| 現在（Lucide） | 置き換え後（Simple Icons） | 対象アイテム         |
| -------------- | -------------------------- | -------------------- |
| `Twitter`      | `SiX`                      | X (Twitter) 埋め込み |
| `Instagram`    | `SiInstagram`              | Instagram 埋め込み   |
| `Youtube`      | `SiYoutube`                | YouTube 埋め込み     |
| `Figma`        | `SiFigma`                  | Figma 埋め込み       |

`Vimeo` は Lucide に存在しないため `Video`（代替アイコン）のまま。

### 4. 影響を受ける型参照の更新

`icon: LucideIcon` を参照しているファイルがあれば `IconComponent` に更新する。

### 5. 公開ページでの使用パターン

追加設定不要。各ファイルで直接 import する:

```tsx
import { SiInstagram, SiX, SiLine } from "@icons-pack/react-simple-icons";

// Tailwind テキストカラーで制御
<SiInstagram size={20} color="currentColor" className="text-foreground" />;
```

## 非スコープ

- Footer への SNS リンク追加（別タスク）
- BrandIcon ラッパーコンポーネント（YAGNI）
- バレルエクスポートファイル（YAGNI）

## 検証

```bash
bun run validate   # type-check + lint
bun run build      # ビルド確認
```
