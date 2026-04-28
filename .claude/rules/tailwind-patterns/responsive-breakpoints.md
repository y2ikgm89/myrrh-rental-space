---
paths:
  - src/**/*.tsx
  - src/**/*.css
---

# Tailwind レスポンシブ Breakpoints

> Tailwind CSS 4.2 / viewport breakpoint 使用基準

## breakpoint policy

default breakpoint（sm/md/lg/xl/2xl）を維持しつつ `--breakpoint-3xl: 120rem` を追加する **6 段階構成**。完全リセット（`--breakpoint-*: initial`）は shadcn/ui・Radix エコシステム互換性を損なうため不採用。

```css
@theme {
  /* Tailwind v4 default + 3xl 追加 */
  --breakpoint-3xl: 120rem; /* 1920px — ultra wide / 2K-4K monitor */
}
```

| bp  | 値       | px   | semantic 用途                                       |
| --- | -------- | ---- | --------------------------------------------------- |
| sm  | `40rem`  | 640  | large phone                                         |
| md  | `48rem`  | 768  | tablet portrait                                     |
| lg  | `64rem`  | 1024 | tablet landscape / laptop（admin サイドバー出現点） |
| xl  | `80rem`  | 1280 | desktop                                             |
| 2xl | `96rem`  | 1536 | large desktop                                       |
| 3xl | `120rem` | 1920 | ultra wide / 2K-4K                                  |

## 採用方針（マクロ vs マイクロレイアウト）

- **マクロレイアウト**（Hero split, 2 カラム text+image, フォームグリッド）: **viewport breakpoint**（`md:grid-cols-2` / `lg:grid-cols-[1fr_320px]`）
- **カードグリッド / ダッシュボード widget**: **Container Queries**（`@container` + `@md:grid-cols-2 @3xl:grid-cols-3`）
- **管理画面 dashboard**: **named container**（`@container/main` on `MainContent.tsx` → children で `@md/main:` / `@3xl/main:`）— サイドバー折りたたみ時の適応に必須

詳細は [`container-queries.md`](./container-queries.md) を参照。

---

## 禁止事項（breakpoint 系）

3.5. **`start-*` / `end-*` 配置ユーティリティ禁止**（v4.2 廃止予定）

- `start-4` / `end-4` 等（`inset-inline-start` / `inset-inline-end` のショートハンド）は v4.2 で deprecated
- `inset-s-4` / `inset-e-4` を使用（`justify-start` / `text-end` 等は対象外）

4. **`@apply` 乱用禁止**
   - インライン Tailwind ユーティリティを優先
   - `@apply` は `@layer utilities` 内のユーティリティクラス定義のみ

5. **ハードコード値禁止**
   - `text-[#ff0000]` → `@theme` にカラートークンを追加して使用
   - `p-[13px]` → spacing scale を使用（`p-3` = 12px、`p-3.5` = 14px）
   - **例外**: 意図的なピクセル精度調整（`top-[1px]` 等）は許可
