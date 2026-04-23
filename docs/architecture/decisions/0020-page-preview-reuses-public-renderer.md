# 20. 固定ページプレビューは公開レンダラを再利用する

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: @y2ikgm89
- **Tags**: pages, preview, admin-ui, clean-break
- **Supersedes**: (なし)
- **Related**:
  - [0016 PageHero first-class field](./0016-page-hero-first-class-field.md)
  - [0017 SectionStyle cascade](./0017-section-style-cascade.md)

## Context and Problem Statement

`/admin/pages/[slug]/edit` は構造化フォームとしては安全だが、初心者には「今の入力が公開ページでどう見えるか」が分かりにくかった。外部タブで公開 URL を開く方式では、編集中の認知負荷が高く、以下の問題が残る:

1. **文脈切替コスト**: 管理画面と公開ページを往復しないと完成形が見えない
2. **実装ドリフト**: 管理画面専用の擬似プレビューを別実装すると、公開レンダラとの乖離が起きる
3. **初心者 UX の限界**: 「フォーム入力」と「結果確認」が同一画面でつながらない

完全なドラッグ&ドロップ型ビジュアルエディタも検討したが、このプロジェクトは予約導線・固定ページ・スタイルカスケードを持つため、自由編集を強めるより **構造化編集を維持したまま実レンダラのプレビューを統合する** 方が適切だった。

## Decision Drivers

- **公開結果との一致**: preview と production で renderer が分岐しないこと
- **clean-break**: 既存の「別 UI で似た見た目を再現する」方向は採らない
- **保守性**: `SectionRenderer` / `HomepageSections` / `ManagedPageSections` を単一の正本にする
- **管理画面 UX**: 編集しながら同一画面で保存済み結果を確認できること

## Decision

### D1. 固定ページ preview は専用 root layout に分離する

`/preview/pages/[slug]` を `src/app/(preview)/...` 配下に新設し、公開サイトの header / footer / analytics とは分離した軽量 preview layout で描画する。

- URL は公開系に近いが、root layout は公開本番用とは分ける
- `robots: noindex, nofollow`
- 管理画面権限付き query を使い、未公開ページも preview 可能にする

### D2. preview 本体は公開レンダラをそのまま使う

- ホーム: `HomepageSections`
- 固定ページ: `ManagedPageSections`
- 汎用 section: `SectionRenderer`

つまり preview 用の独自テンプレートは作らず、**公開コンポーネントをそのまま再利用** する。

### D3. 管理画面は split view を標準とする

`/admin/pages/[slug]/edit` は右ペインに iframe preview を常設し、保存成功時に再読込する。

- セクション追加 / 並び替え / 複製 / 削除 / 表示切替
- ホームヒーロー保存
- ページ既定スタイル保存

これらの操作はすべて preview refresh のトリガーに含める。

## Consequences

### Positive

- preview と production の見た目差分が原理的に起きにくい
- 初心者でも「保存したら右で確認」が成立する
- `Page.pageStyle` / `Section.style` / `styleOverride` を含む cascade の確認が即座にできる
- 公開本番レイアウトを汚さずに preview 専用 UX を追加できる

### Negative / Trade-offs

- iframe 再読込ベースなので、未保存ドラフトは表示されない
- preview 用 root layout に public CSS / font / provider の一部を複製する必要がある
- posts / news の旧 sessionStorage preview とは方式が揃わない
- split view は viewport `xl` 以上でのみ表示される。lg 以下（タブレット・モバイル）では preview パネルは非表示で、編集者は別タブボタン（`IconExternalLink`）経由で preview を開く

## Follow-up

- 必要になれば `selected section -> preview scroll` を追加する
- posts / news も将来的に「保存済み preview route + shared renderer」へ寄せる余地がある
- 未保存ドラフトの preview 反映は将来検討枠（`postMessage` で RHF / useState 由来の draft を iframe に push する案、または Next.js Draft Mode を組み合わせた approach）。本 ADR 時点では対象外
- split view のブレイクポイントを lg（1024px）以上に下げるかは UX 検証後に判断する
