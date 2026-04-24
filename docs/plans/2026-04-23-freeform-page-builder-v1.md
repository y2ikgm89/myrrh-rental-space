# 2026-04-23 Freeform Page Builder V1

## 概要

`docs/architecture/freeform-page-builder-design.md` と `docs/superpowers/specs/2026-04-23-freeform-page-builder-v1.md` を正本として、この案件向けの自由配置サイト builder を段階実装する。

ゴールは「完全汎用 no-code」ではなく、custom page をノーコードで制作・公開できる製品レベルの builder を導入すること。後方互換性は持たず、custom page は clean-break で freeform builder へ寄せる。

## 実装内容

- `PageFreeformState` を追加し、draft / published document を分離する
- `/admin/pages/[slug]/builder` の編集画面を新設する
- public / preview / admin canvas が同じ freeform renderer を使うようにする
- text / image / button / frame / stack を中心に V1 を構成する

## 新規ファイル

- `docs/architecture/freeform-page-builder-design.md` - 高レベル設計
- `docs/superpowers/specs/2026-04-23-freeform-page-builder-v1.md` - V1 プロダクト仕様

## Phase 1

- Prisma schema に `PageFreeformState`, `PageFreeformRevision` を追加
- `src/shared/lib/page-builder/schema.ts` を追加
- `src/shared/lib/page-builder/schema.ts` は `schemaVersion: 4` のみを受け付ける
- `src/shared/domain/page-builder/queries.ts` を追加
- `src/shared/domain/page-builder/commands.ts` を追加
- custom page 作成フローを freeform 前提に切り替える
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/builder/page.tsx` に shell を追加

### 成果物

- 空 document を読み書きできる
- admin 側で builder shell に入れる
- custom page 作成後に旧 `/edit` へ行かない

## Phase 2

- `src/shared/page-builder/renderer/*` を追加
- `root`, `frame`, `stack`, `text`, `image`, `button` node を実装
- builder canvas 上で選択、移動、リサイズを実装
- layer panel と inspector を実装

### 成果物

- 主要ノードを配置して見た目を作れる
- admin canvas で最低限の編集が成立する

## Phase 3

- autosave 実装
- save status 実装
- undo / redo 実装
- preview route で draft 表示
- publish action と published renderer 接続

### 成果物

- draft / preview / publish が分離される
- public page に published document が出る

## Phase 4

- breakpoint 切り替え実装
- desktop / tablet / mobile override 実装
- responsive inspector 実装
- mobile / tablet の canvas 表示調整

### 成果物

- 3 breakpoint で調整できる
- mobile だけの修正が desktop を壊さない

## Phase 5

- `embed`, `divider`, `spacer`, `form` node を追加
- alignment guide / snap line を追加
- publish validation を強化
- E2E を追加
- builder UI を専用 fullscreen shell に切り替える

### 成果物

- custom page 制作に必要な実用機能が一通り揃う
- 回帰検知ができる

## Phase 6

- `AdminDetailLayout` 依存を外した fullscreen builder shell へ整理
- topbar / left rail / left panel / center stage / right inspector へ再構成
- admin Toaster を bottom-right に変更し、topbar 操作と重ならないようにする
- v1-v3 document migration を削除し、v4 schema only にする

### 成果物

- Wix / Studio 型の制作アプリに近い UI 構造になる
- clean-break 方針に反する runtime 互換コードが残らない

## Phase 7

- 親枠内の left / center / right / top / middle / bottom 整列を domain operation と inspector UI に追加
- Shift 押下中は canvas snap を一時無効化し、細かい移動・リサイズを可能にする
- 8px grid snap を追加し、canvas 上に grid 表示トグルを追加

### 成果物

- absolute 配置の精密編集が mouse / keyboard / inspector のどれでも成立する
- snap / grid / align の仕様が shared logic と unit test に固定される
- 公開 renderer に編集補助 UI を混ぜず、builder canvas だけに閉じる

## Phase 8

- `grid` node を document schema に追加し、Insert / Layers / Inspector / renderer で扱えるようにする
- `gridMinColumnWidth` を node style に追加し、CSS Grid の `auto-fit` 列として公開 renderer へ反映する
- `service-list` preset のカード群を grid node 配下へ整理する

### 成果物

- UI で選べる Grid が、公開 renderer / preview / admin canvas で同じ見た目として描画される
- 案件向けのカード型セクションを、手作業で横並び調整せずにレスポンシブ化できる
- Grid node の描画と preset 親子関係が unit test に固定される

## Phase 9

- 案件向けの実用 preset として `pricing-grid`, `access-map`, `faq-list`, `reservation-cta` を追加
- `access-map` は許可済み provider の `google-maps` embed node を使い、任意 HTML を使わない
- 料金カード、FAQ、予約CTA は text / frame / grid / button の既存安全nodeだけで構成する

### 成果物

- レンタルスペースの custom page 制作で頻出する料金、アクセス、FAQ、予約導線を Insert から即配置できる
- 追加 preset はすべて schemaVersion 4 document として unit test で検証される
- clean-break 方針を崩す旧 Section 依存や任意 HTML を増やさない

## Phase 10

- 案件向けの実用 preset として `photo-hero`, `amenity-grid`, `usage-steps` を追加
- `photo-hero` は grid 配下にコピー枠と image placeholder を並べ、画像差し替え前提の hero として構成する
- `amenity-grid` は設備カードを grid node 配下へ配置し、レスポンシブ列数を node style で制御する
- `usage-steps` は3ステップの利用手順を text / frame / grid の既存安全nodeだけで構成する

### 成果物

- レンタルスペースの custom page 制作で頻出する写真付き導入、設備一覧、利用手順を Insert から即配置できる
- 追加 preset は schemaVersion 4 document として unit test で検証される
- preset 拡充は legacy section や任意 HTML を増やさず、freeform document 一本に閉じる

## Phase 11

- 複数選択を builder canvas / layer tree へ追加し、Ctrl/Cmd/Shift クリックで選択集合を切り替えられるようにする
- `frame` を group の実体として使い、同じ absolute 親枠内の固定サイズ要素を group / ungroup できるようにする
- 同じ absolute 親枠内の固定サイズ要素を横 / 縦に等間隔分布できるようにする
- group / ungroup / distribute は shared document operation に置き、locked node、親違い、寸法不明の拒否条件を unit test で固定する

### 成果物

- Wix / Studio 型の編集操作で必須になる複数選択、グループ、分布が V4 document のまま成立する
- 新 node type や legacy 互換分岐を増やさず、公開 renderer は既存の `frame` / absolute layout のまま描画できる
- UI 操作と keyboard shortcut は domain operation に委譲し、ロック済みノードの安全性を崩さない

## Phase 12

- 複数選択した absolute 兄弟ノードをまとめて canvas drag できるようにする
- 複数選択した absolute 兄弟ノードを `Ctrl/Cmd+D` と Alt+drag でまとめて複製できるようにする
- 複数選択した absolute 兄弟ノードを Arrow / Shift+Arrow でまとめて nudge できるようにする
- 複数drag中は renderer に node別 layout preview を渡し、選択中の各ノードが移動後の位置で描画されるようにする
- multi move / duplicate は shared document operation に置き、locked node を含む選択を拒否する

### 成果物

- グループ化しなくても、複数オブジェクトをまとめて微調整・移動・複製できる
- canvas preview / commit / undo stack の経路が単一ノード操作と同じになり、UIだけの暫定状態を残さない
- clean-break 方針を維持し、新しい互換schemaやlegacy editor依存を増やさない

## Phase 13

- builder canvas の空白部分をドラッグして、矩形範囲内のノードをまとめて選択できるようにする
- Ctrl/Cmd/Shift + 範囲選択は既存選択に追加し、通常の範囲選択は選択集合を置き換える
- 範囲内に親子ノードが同時に入った場合は子ノードを優先し、巨大な親 frame が意図せず混ざる状態を避ける
- 範囲選択 UI は admin canvas に閉じ、公開 renderer には選択矩形や編集補助 UI を混ぜない

### 成果物

- クリック選択だけではなく、Wix / Studio 型の矩形選択で複数要素を素早く選べる
- 範囲選択後の group / distribute / multi move / multi duplicate は既存の shared operation safety をそのまま使う
- legacy section editor や互換 schema を増やさず、V4 freeform document 一本の編集体験を強化する

## Phase 14

- marquee selection の矩形・候補解決を `src/shared/lib/page-builder/selection.ts` へ切り出し、canvas DOM 依存と pure selection logic を分離する
- tiny drag、親子同時 hit 時の leaf 優先、additive selection を unit test で固定する
- 既存 custom page の clean-break 可否を判定する読み取り専用 audit helper / CLI を追加する
- `bun run audit:freeform-pages` は `PageFreeformState` がない custom page を検出した場合に exit code 1 を返す

### 成果物

- selection 仕様が builder component 内の暫定実装ではなく shared logic として検証される
- 既存 custom page の作り直し / one-off migration 判断を、手作業確認ではなく DB 監査結果で行える
- 後方互換 runtime 分岐を追加せず、リリース前の clean-break 移行リスクだけを可視化する

## Phase 15

- Browser Use で `/admin/pages/[slug]/builder` を実画面確認し、topbar / left rail / workspace / canvas / inspector の desktop editor shell を視認する
- 狭い viewport でも制作アプリ全体が潰れないよう、fullscreen shell に最小作業幅と横スクロールを追加する
- inspector から text node を編集し、autosave、draft preview、publish 後の public 反映を実ブラウザで確認する
- desktop / tablet / mobile breakpoint 切替を Browser Use で確認する
- Next.js 公式推奨に合わせ、Multiple Root Layouts の public / admin / preview metadata に `metadataBase` を明示する

### 成果物

- 画像の方向性に近い制作アプリ UI が実ブラウザ上で確認できる
- draft と published の分離が、E2E だけでなく Browser Use の目視でも確認できる
- Next.js の metadata warning を解消し、相対 OGP/Twitter image の URL 解決を root layout で安定させる

## Phase 16

- Browser Use で media picker を開き、fullscreen builder 上で Dialog が body Portal のまま背面に隠れる z-index 競合を確認する
- admin 共通 Dialog / AlertDialog を z-index token に接続し、Dialog layer を fullscreen editor より上に固定する
- MediaPickerDialog に Radix 推奨の `DialogDescription` を追加し、説明欠落 warning を解消する
- シードDBが参照する `/images/seed/*.svg` の不足分を補完し、media picker / site brand / OGP の seed asset が 404 HTML を返さないようにする
- Freeform image node を Next.js 公式推奨の fixed wrapper + `next/image fill` に変更し、CSS リサイズ時の画像比率 warning を避ける
- Browser Use とHTTP/HTML確認で、Access Map、Contact Form、Image node が publish 後の public page に出ることを確認する

### 成果物

- fullscreen builder 内でも media picker が前面に表示され、画像選択から draft autosave まで通る
- seed media のURLと静的ファイル実体が一致し、選択した画像が builder / public の双方で壊れずに表示される
- Freeform renderer の image node が Next.js 公式の responsive image pattern に寄り、公開ページの画像警告を再発しにくい構造になる

## Phase 17

- media picker から image node に seed画像を選択し、draft save / publish / public 表示まで通す E2E を追加する
- E2E では Radix Dialog の sr-only description と可視タブ文言が衝突しないよう、可視タブは `role=button` のアクセシブル名で検証する
- Browser Use で admin builder を開き、image node の `next/image fill` DOM と media picker Dialog の `z-index: 90` 前面表示を確認する
- Next dev の古い HMR 状態で hydration mismatch が出たため、dev server を再起動して生成済み client chunk が新renderer構造へ更新されることを確認する

### 成果物

- fullscreen builder 上の media picker と image publish 導線が手動QAだけでなく E2E 回帰テストでも固定される
- Dialog 前面表示の z-index token と image node の fill 描画が、実ブラウザ上のDOM/視覚確認でも検証される
- dev server の stale HMR による一時的な hydration mismatch を切り分け、ソース実装では旧 image renderer が残っていないことを確認済み

## 残タスク

- in-app browser で builder の fullscreen shell / grid / snap / inspector 密度を視認確認済み
- 複数選択、グループ化、等間隔分布、multi duplicate、multi drag、marquee selection は実装済み
- template / preset の主要案件向け構成は追加済み。次に増やすなら「キャンペーンLP」「ギャラリー」「利用規約・注意事項」など実運用ページ単位で判断する
- 公開前 QA として preview / public の画像・フォーム・embed 表示を実データで確認済み
- 既存 custom page データは `bun run audit:freeform-pages` で `PageFreeformState` 欠落と legacy sections 残存を検出し、対象が出た場合のみ作り直しまたは one-off migration を確定する

## 変更ファイル

- `prisma/schema.prisma` - freeform builder 用 schema 追加
- `src/app/(public)/[...segments]/page.tsx` - custom page を freeform renderer に接続
- `src/app/(preview)/preview/pages/[slug]/page.tsx` - freeform preview 対応
- `src/app/(admin)/admin/(dashboard)/pages/_components/CreatePageDialog.tsx` - custom page を freeform 前提で作成
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/page.tsx` - custom page は builder へ誘導
- `src/shared/lib/page-builder/selection.ts` - marquee selection の pure logic
- `src/shared/lib/page-builder/audit.ts` - freeform 移行監査の pure logic
- `src/shared/page-builder/renderer/FreeformPageRenderer.tsx` - freeform renderer と image node 描画
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/dialog.tsx` - admin Dialog の z-index token 接続
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/alert-dialog.tsx` - admin AlertDialog の z-index token 接続
- `src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/MediaPickerDialog.tsx` - media picker の a11y description
- `e2e/authenticated/admin/page-builder.spec.ts` - media picker / image publish のE2E回帰テスト
- `scripts/audit-freeform-pages.ts` - DB 上の custom page 移行状態を読み取り専用で監査
- `public/images/seed/*.svg` - seed media が参照する静的画像

## 削除ファイル

- なし

## 検証

- [x] Prisma migrate 成功
- [x] page-builder unit tests 通過
- [x] `bun run validate` 通過
- [x] builder E2E 通過
- [x] `bun run build` 通過
- [x] group / ungroup / distribute の unit tests 通過
- [x] multi move / duplicate の unit tests 通過
- [x] marquee selection の validate 通過
- [x] marquee selection shared logic の unit tests 通過
- [x] freeform audit helper の unit tests 通過
- [x] Browser Use で builder 本体 / preview / public を視認確認
- [x] Browser Use で desktop / tablet / mobile breakpoint 切替を視認確認
- [x] Browser Use で media picker の前面表示と画像選択を確認
- [x] Browser Use で Access Map / Contact Form / Image node の public 表示を確認
- [x] Browser Use で admin builder 上の media picker Dialog が `z-index: 90` で前面表示されることを確認
- [x] HTTP/HTML で image node が `next/image fill` として公開描画されることを確認
- [x] E2E で image node の media picker 選択、draft save、publish、public image 表示を確認
- [x] custom freeform page を作成できる
- [x] draft autosave が動く
- [x] preview で draft を確認できる
- [x] publish 後に public page に反映される
- [x] published でない draft が public に出ない

## マイグレーション

必要。想定コマンド:

```bash
bunx --bun prisma migrate dev --name add_freeform_page_builder
```

## 環境変数

なし

## 補足

- system page は当面既存管理面を維持
- custom page の旧 `sections` editor は廃止対象
- 必要な既存 custom page は one-off migration か作り直しで対応する
