# Navigation Submenu Design

**日付**: 2026-03-20
**種別**: 新機能
**ステータス**: 設計承認済み

---

## 概要

公開ヘッダーに WordPress 風のサブメニュー（ドロップダウン）を実装する。
DB / クエリ / Server Action は既に2階層対応済みのため、UI のみの変更。

## 技術選定

**Radix NavigationMenu** (`@radix-ui/react-navigation-menu`) を直接使用。

- WCAG 2.1 AA 準拠（aria-expanded, keyboard navigation, focus management）
- ホバー / クリック / キーボードで自然に動作
- shadcn/ui 経由ではなく `@radix-ui/react-navigation-menu` を直接インストール（公開ページは admin の components/ui を使わない）

**理由**: shadcn/ui の NavigationMenu は `@/admin/components/ui` にインストールされるが、公開ページは admin の UI コンポーネントを import しない設計（別 Root Layout）。Radix を直接使い、公開ページのデザインシステムに合わせてスタイリングする。

## 変更スコープ

### 変更するファイル

| ファイル                                                      | 変更内容                               |
| ------------------------------------------------------------- | -------------------------------------- |
| `package.json`                                                | `@radix-ui/react-navigation-menu` 追加 |
| `src/app/(public)/_shared/components/layouts/site-header.tsx` | 全面書き直し — NavigationMenu ベースに |

### 変更しないファイル

- `prisma/schema.prisma` — NavigationItem モデルは変更不要
- `src/shared/domain/navigation/queries.ts` — 既に2階層取得済み
- `src/shared/domain/navigation/commands.ts` — 変更不要
- `src/app/(admin)/**/navigation/` — 管理画面は全て現状維持
- `src/app/(public)/_shared/components/layouts/site-footer.tsx` — フッターはフラットのまま

## デスクトップ（md 以上）

```
[MYRRH]   Home   Spaces ▾   About   Contact   [予約する]
                  ┌──────────────────┐
                  │ 個室スペース      │
                  │ 会議室            │
                  │ イベントスペース   │
                  └──────────────────┘
```

### 構造

```tsx
<NavigationMenu>
  <NavigationMenuList>
    {/* 子なし: 直接リンク */}
    <NavigationMenuItem>
      <NavigationMenuLink asChild>
        <Link href="/about">About</Link>
      </NavigationMenuLink>
    </NavigationMenuItem>

    {/* 子あり: トリガー + ドロップダウン */}
    <NavigationMenuItem>
      <NavigationMenuTrigger>Spaces</NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul>
          {item.children.map((child) => (
            <li key={child.id}>
              <NavigationMenuLink asChild>
                <Link href={child.url}>{child.label}</Link>
              </NavigationMenuLink>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>
```

### スタイリング

- ドロップダウン: `bg-background border border-border rounded-md shadow-lg p-2`
- アイテムホバー: `hover:bg-surface rounded-sm transition-colors`
- トリガー: 既存の `text-xs uppercase tracking-[0.2em] text-muted-foreground` を維持
- ChevronDown アイコン（4px、muted-foreground）でサブメニュー有無を視覚表示
- Radix のデフォルトアニメーション（slide-down + fade）を採用

## モバイル（md 未満）

既存のフルスクリーンオーバーレイ内でアコーディオン展開:

```
[MYRRH]                    [×]

          [予約する]

          Home
          Spaces            ▾
            個室スペース
            会議室
            イベントスペース
          About
          Contact
```

### 実装

- 子メニュー持ちアイテム: タップで `useState` トグル → 子リストを slide-down 表示
- GSAP stagger アニメーションは親アイテムのみ（既存挙動維持）
- 子アイテム: 展開時に opacity fade-in（軽量）
- インデント: `pl-6 text-xl`（親は `text-2xl`）
- ChevronDown アイコンを回転（`rotate-180` on open）

## アクセシビリティ

| 要件                   | 実装                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| キーボードナビ         | Radix NavigationMenu がデフォルト対応（Arrow keys, Enter, Escape） |
| aria-expanded          | NavigationMenuTrigger が自動管理                                   |
| aria-label             | `<nav aria-label="メインナビゲーション">` 維持                     |
| focus trap             | ドロップダウン内で Tab 循環（Radix デフォルト）                    |
| Escape で閉じる        | Radix デフォルト対応                                               |
| モバイルアコーディオン | `aria-expanded` + `aria-controls` を手動付与                       |

## 既存機能との共存

- **GSAP スクロール制御**: `useGSAP` + `ScrollTrigger` は `headerRef` に紐づいており、内部の NavigationMenu と競合しない
- **transparent/solid モード**: ヘッダー背景の制御ロジックは変更なし
- **auto_hide/hide_on_scroll**: スクロール挙動は変更なし
- **FALLBACK_NAV**: 子なしフォールバックを維持

## デザイン方針

- ブランドの warm-minimal + elegant に合わせ、ドロップダウンは最小限の装飾
- ボーダー + シャドウのみ、グラデーションやアイコン装飾なし
- アニメーション: Radix デフォルトの slide + fade（GSAP 不使用 — ドロップダウンは軽量で十分）
