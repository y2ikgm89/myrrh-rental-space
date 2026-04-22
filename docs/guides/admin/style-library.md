# Style Library 運用ガイド

`/admin/styles` — ページ・セクションのデザイン（spacing / background / container / typography / animation）を
再利用可能な「Style」として登録・編集し、複数ページや複数セクションに一括適用するための管理画面です。

## 何ができるか

- **Style の登録・編集・削除**: Editorial Standard / CTA / Compact などの共通デザインを名前付きで保存
- **Style の派生**: 既存 Style をベースに一部を変更した新しい Style を作成（例: 「CTA - Dark」から「CTA - Dark Compact」を派生）
- **使用箇所の一覧**: どの Section / Page / グローバル設定でこの Style が使われているかを確認
- **プレビュー**: 編集中に右側パネルで spacing / background / typography の変化をリアルタイム確認

## Scope の使い分け

Style は `scope` で用途を分けます。

| scope     | 意味                                                                  | 選び方                                                                         |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `global`  | 全ページのデフォルトとして 1 件のみ `Settings` が参照                 | サイト全体の「標準の余白・配置」を決めるとき                                   |
| `page`    | `Page.pageStyle` として複数 page から参照可能                         | 「ブログ記事ページはコンパクトに」等、ページ種別ごとのデフォルトを決めるとき   |
| `section` | `Section.styleId` として複数 section から参照可能（最も再利用される） | 個別セクション（Hero / CTA / Features 等）の再利用可能なスタイルを定義するとき |

## Cascade の仕組み

Section が実際に描画されるときの Style は、以下 4 段の cascade で解決されます（上から下の順に上書き）。

1. **DEFAULT_SECTION_STYLE** — ハードコードされたシステムデフォルト
2. **Global style** — `Settings.globalSectionStyle`
3. **Page style** — `Page.pageStyle`
4. **Section preset** — `Section.style`（このセクション用の preset）
5. **Section override** — `Section.styleOverride`（このセクション固有の微調整）

上位の層で指定された値のみが下位を上書きし、未指定のフィールドは下位の値がそのまま残ります（deep merge）。

たとえば `Section.styleOverride.spacing.paddingTop = "lg"` だけ指定すれば、その他（paddingBottom / background / container / typography / animation）は preset または page / global の値が適用されます。

## よくあるワークフロー

### 新しい共通スタイルを作る

1. `/admin/styles` → 右上の「新規作成」
2. 名前と scope を決める（例: 「Editorial - Standard」 / scope: `section`）
3. spacing / background / container / typography / animation を設定
4. プレビューで確認して「作成」
5. セクション編集画面で Style を選択して適用

### 既存 Style を元に亜種を作る

1. `/admin/styles/[id]` → 右上の「派生」
2. 名前を決めて、必要なフィールドだけ変更
3. 親 Style の値は自動的に継承される

### Style を削除するときの注意

Style を削除すると、使用中の Section / Page / Settings は `null`（= DEFAULT_SECTION_STYLE にフォールバック）になります。
削除前に詳細ページで「使用箇所」を確認し、影響範囲を把握してください。

## 権限

- **SUPER_ADMIN / ADMIN**: Style の作成・編集・削除が可能
- **EDITOR / VIEWER**: Style の閲覧のみ可能（編集・削除不可）
