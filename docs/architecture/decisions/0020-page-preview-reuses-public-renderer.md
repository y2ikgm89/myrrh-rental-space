# 20. 固定ページプレビューは公開レンダラを再利用する

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: @y2ikgm89
- **Tags**: pages, preview, admin-ui, clean-break
- **Supersedes**: (なし)
- **Related**:
  - [0016 PageHero first-class field](./0016-page-hero-first-class-field.md)
  - [0021 Remove SectionStyle library](./0021-remove-section-style-library.md)

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

## Considered Options

### Option A: Next.js `draftMode()` + cookie で公開ページ URL を流用

[公式 Draft Mode](https://nextjs.org/docs/app/guides/draft-mode) の canonical パターン。Route Handler で `(await draftMode()).enable()` を呼び、そのまま `/`, `/about` 等の公開ページに redirect して preview 扱いにする。

- **Pro**: Next.js 公式推奨パターンに合致し、headless CMS 等との整合も取りやすい
- **Pro**: 公開 URL をそのまま使うため URL 生成の SSoT を追加する必要がない
- **Con**: 公開 layout（header / footer / analytics / `LenisProvider` / `MobileNav`）がそのまま載るため、管理者向けの軽量 preview UX（右ペイン iframe split）に不向き
- **Con**: 未公開ページ（`Page.isPublished = false`）を出すには `getPublicPage` 等の公開 query が `draftMode()` を見る obligation を負う。admin クエリと公開クエリの分離境界が崩れる
- **Con**: preview と本番の URL が同一のため、視覚的な区別がバナーにしか依存できない

### Option B: 管理画面内で preview UI を独自に再実装

admin 側の React コンポーネントでセクション JSON を直接レンダリングする。

- **Pro**: 未保存ドラフトも即時反映できる
- **Con**: 公開 renderer（`HomepageSections` / `SectionRenderer`）と**ダブルメンテ**。style / hero / cascade の変更ごとに乖離リスクが発生する
- **Con**: admin CSS と public CSS の分離原則（Multiple Root Layouts）と矛盾する
- **Rejected**: 「clean-break」「保守性」ドライバと真っ向から衝突するため不採択

### Option C: 専用 `/preview/pages/[slug]` route + 公開 renderer 再利用 ★採択

`(preview)/` という第 3 の root layout を新設し、`HomepageSections` / `ManagedPageSections` を `_shared/components/{homepage,pages}/` に抽出して公開 / preview 両方から参照する。

- **Pro**: 公開 renderer は 1 正本で維持される（ダブルメンテなし）
- **Pro**: 管理者向け軽量 preview layout（analytics / Lenis / MobileNav なし）を独立制御可能
- **Pro**: 未公開ページは `getPageForEdit`（admin 権限 required）で取得し、公開 query を汚染しない
- **Pro**: URL が公開本番と明確に分離され（`/preview/pages/<slug>`）preview banner と 2 層で誤認を防げる
- **Con**: iframe 再読込ベースのため未保存ドラフトは対象外（Follow-up 参照）
- **Con**: `(preview)/layout.tsx` で public CSS / font / `TaxSettingsProvider` を複製する必要がある

## Decision

**Option C を採択**する。未保存ドラフト反映が必要になった時点で Option A（Draft Mode）を重ねる余地は残す（Follow-up 参照）。

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
- コード所有の固定 section style を含む公開レンダリング結果を即座に確認できる
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
