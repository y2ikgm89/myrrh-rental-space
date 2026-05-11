---
description: 管理画面 Button variant の role-based 適用ルール SSoT
paths:
  - src/app/(admin)/**/*.tsx
  - src/app/(admin)/**/*.ts
---

# 管理画面 Button variant — Role-Based マッピング SSoT

> **業界調査ベース** (2026-05-12): shadcn-ui canonical (destructive solid 1 種) + Carbon Design System (primary/tertiary/ghost danger 3 階層) + Material Design 3 emphasis hierarchy + Apple HIG destructive guidelines を統合。
> 本プロジェクトは clean break で **2 階層構成**を採用: `destructive` (solid) で destructive intent を一貫表現 + `destructive-ghost` を高密度 UI 用に保持。`destructive-outline` は廃止済 (2026-05-12)。

## Variant 7 種

| variant             | 視覚                                   | 用途                                                                                                                |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `default`           | primary 塗りつぶし (青)                | 主要 affordance: 保存 / 作成 / 送信 / 招待 / 公開 / 承認 / 接続                                                     |
| `destructive`       | destructive 塗りつぶし (赤)            | **全 destructive アクション canonical**: 削除 / ゴミ箱遷移 / disconnect / clear / 解除 / リセット / 退会 / 予約取消 |
| `destructive-ghost` | 赤テキスト + transparent + hover bg/10 | 高密度 UI 専用: Inspector 内の削除アイコン / ボタンが多数並ぶ list 内 (警告疲労回避)                                |
| `outline`           | 中立 border + transparent bg           | キャンセル / 戻る / 閉じる / プレビュー / エクスポート / インポート / コピー / 接続テスト                           |
| `secondary`         | muted 塗りつぶし                       | 強調を下げた代替アクション                                                                                          |
| `ghost`             | bg なし + hover accent                 | toolbar / ActionDropdown trigger / 装飾的 icon button (destructive 系は除く)                                        |
| `link`              | text-primary underline                 | 文中の inline 遷移                                                                                                  |

## 設計判断の根拠 (業界調査結果)

| Reference                      | パターン                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **shadcn-ui canonical**        | destructive solid のみ。outline/ghost の destructive 派生は公式に存在しない                                                                                 |
| **Carbon Design System** (IBM) | `primary-danger` / `tertiary-danger` / `ghost-danger` の 3 階層 (大規模 SaaS パターン)                                                                      |
| **Material Design 3**          | Destructive emphasis = Filled。"Avoid using multiple emphasized buttons in close proximity" だが destructive は一貫した識別性が優先                         |
| **Apple HIG**                  | "Use a destructive style for buttons that perform... that the user can't easily undo"。Cancel は destructive にしない                                       |
| **本プロジェクト方針**         | **solid 1 種で destructive を一貫表現** (shadcn canonical 寄り) + Inspector 高密度 UI のみ ghost (Carbon の妥協点)。primary (青 solid) との視覚対称性を維持 |

## Role → variant 対応表

### 主要 affordance（`default`）

- フォーム submit (保存 / 更新 / 作成 / 送信)
- 招待を送る / 接続する (OAuth / API key 設定)
- 公開 / 承認 / 適用 / 反映 / 復元 (ゴミ箱から戻す)

### 破壊的アクション（`destructive` solid）

**全 destructive intent を solid red で統一**:

- AlertDialog の confirm button (`DeleteConfirmDialog` 実装済)
- 詳細ページの「削除」(`DetailDeleteButton` 実装済)
- BulkActions の「選択した N 件を削除」/ 「一括キャンセル」(不可逆)
- 「完全削除」(ゴミ箱からの hard delete)
- 「予約を取消」「退会する」等の不可逆操作
- ゴミ箱一覧へ遷移 (IconTrash + 「ゴミ箱」)
- 接続を解除 / disconnect / OAuth revoke
- API key を削除 / クリア (settings の個別 key カード)
- リセット / 初期化 / 切断
- ソフトデリート系のカード内「-」ボタン

### 高密度 destructive（`destructive-ghost`）— Inspector 限定

Inspector パネルや list 行内など、複数の削除アイコンが密集する UI 専用。warning fatigue を回避するため solid の赤塗りを避けたい場合のみ:

- Lexical Inspector の削除アイコン (Cover / Testimonial / Image 等の単一値クリア)
- BlockTemplatePlugin の hover-only 削除ボタン
- list 行内の `IconTrash` 単独ボタン (group-hover で表示)

新規実装で迷ったら `destructive` solid を採用 (canonical)。ghost は Inspector など UI 密度が高い場所での例外手段。

### 中立アクション（`outline`）

- Dialog の「キャンセル」(`AlertDialogCancel` は標準で outline スタイル)
- 「戻る」「閉じる」「プレビュー」
- 「エクスポート」「インポート」「コピー」「接続テスト」
- ページネーション / フィルター切替

### tertiary ghost（`ghost`）

- `ActionDropdown` trigger (IconDots)
- Toolbar icon button (編集 / 装飾系、destructive 以外)
- Tab trigger / accordion trigger

### inline link（`link`）

- prose 内の deep link
- breadcrumb 中の親リンク

## 禁止パターン

1. **削除/破棄/解除アクションに `outline` / `default` 使用禁止**

   ```tsx
   // NG: 削除アクションが中立 outline → 警告色なし、役割不明
   <Button variant="outline" size="sm">
     <IconTrash /> 削除
   </Button>

   // NG: 手書き text-destructive で「outline + 赤文字」を再現
   <Button variant="outline" className="text-destructive hover:text-destructive">
     削除
   </Button>

   // OK: 全 destructive intent は solid に統一
   <Button variant="destructive" size="sm">
     <IconTrash /> 削除
   </Button>

   // OK: Inspector 高密度 UI のみ ghost
   <Button variant="destructive-ghost" size="icon" aria-label="削除">
     <IconTrash />
   </Button>
   ```

2. **キャンセル/戻るに `destructive` 使用禁止** (Apple HIG / Material 共通)
   - `AlertDialogCancel` は標準で中立スタイル維持
   - 「キャンセル」は安全な離脱操作

3. **`text-destructive` を手書きで class に書き加えない**
   - `<Button variant="ghost" className="text-destructive">` 禁止 → `variant="destructive-ghost"` を使う
   - `<Button variant="outline" className="text-destructive">` 禁止 → `variant="destructive"` を使う
   - 例外: ActionDropdown 内の `DropdownMenuItem` は shadcn 標準パターンとして `className="text-destructive focus:text-destructive"` 適用 (`ActionDropdown.tsx:71` 参照実装)
   - 例外: Lexical Toolbar の `DropdownMenuItem` (`TableActionMenuPlugin.tsx`) も同パターン

4. **AlertDialog の confirm に `buttonVariants` 経由必須**
   - `<AlertDialogAction className="bg-destructive text-destructive-foreground...">` 直書き禁止
   - `<AlertDialogAction className={buttonVariants({ variant: "destructive" })}>` を使う
   - 参照実装: `DeleteConfirmDialog.tsx:67`

5. **`destructive-outline` 復活禁止**
   - 2026-05-12 に clean break で廃止済。outline + 赤テキストの中間階層は本プロジェクトでは使わない
   - "secondary destructive" 概念は `destructive` solid に統合 (新規作成・保存と同じ視覚重み)
   - 警告疲労が問題になる場合は `destructive-ghost` を使う

## 参照実装

| パターン                        | ファイル                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| destructive solid (主要)        | `_shared/components/DetailDeleteButton.tsx` / `_shared/components/DeleteConfirmDialog.tsx` |
| destructive solid (disconnect)  | `settings/_components/sections/GoogleBusinessProfileSection.tsx`「連携を解除」             |
| destructive solid (trash 遷移)  | `terms/page.tsx` の「ゴミ箱」リンク                                                        |
| destructive-ghost (Inspector)   | `lexical/inspector/panels/CoverInspectorPanel.tsx` の背景画像削除ボタン                    |
| destructive-ghost (list 内)     | `settings/_components/sections/DiscountSection.tsx` の useFieldArray remove                |
| ActionDropdown destructive item | `_shared/components/ActionDropdown.tsx`                                                    |

## 監査 grep

```bash
# 削除系で variant=outline / default になっていないか (destructive intent 検出)
grep -rnE 'variant="(outline|default)"' src/app/\(admin\) --include="*.tsx" -A2 \
  | grep -E '(IconTrash|削除|破棄|解除|disconnect)'

# 手書き text-destructive on Button (許可例外を除外)
grep -rn 'text-destructive' src/app/\(admin\) --include="*.tsx" \
  | grep -v 'ActionDropdown\|DropdownMenuItem\|FormMessage\|FormLabel\|testResult\|<div\|<p\|<span\|<Badge\|<h4'

# キャンセル/閉じる/戻るに destructive 適用していないか
grep -rnE 'variant="destructive(-ghost)?"' src/app/\(admin\) --include="*.tsx" -A1 \
  | grep -E '(キャンセル|閉じる|戻る)'

# destructive-outline の復活禁止 (ゼロ件であること)
grep -rn 'destructive-outline' src/app/\(admin\) --include="*.tsx"
```

## 公式準拠根拠

- [shadcn-ui Button](https://ui.shadcn.com/docs/components/button) — canonical 6 variants (default / destructive / outline / secondary / ghost / link)
- [Carbon Design System — Button](https://carbondesignsystem.com/components/button/usage/) — Primary/Secondary/Tertiary danger hierarchy
- [Material Design 3 — Common buttons](https://m3.material.io/components/buttons/guidelines) — Filled emphasis for destructive
- [Apple Human Interface Guidelines — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) — Destructive style + Cancel neutrality
- [WAI-ARIA APG — Button](https://www.w3.org/WAI/ARIA/apg/patterns/button/) — semantic role consistency
