---
paths:
  - src/app/(public*)/**
---

# Project Design Config（プロジェクト固有）

> 顧客ブランド固有のデザイン値を一箇所に集約。他のルールファイル・スキルはここを参照する。
> 別プロジェクトへ移植時はこのファイルのみ書き換える。

## ブランド

Myrrh Rental Space — Editorial Magazine

Kinfolk / Cereal 誌を参考にした雑誌的レイアウト。大量の余白、セリフイタリック見出し、控えめなインタラクション。ブロンズアクセントは継続使用するが装飾は最小限。

## カラーパレット

OKLCH形式。Luxury White × Bronze。

| ロール   | 配分 | 値                                   | メモ                            |
| -------- | ---- | ------------------------------------ | ------------------------------- |
| Dominant | 70 % | `oklch(0.985 0.005 60)` Warm White   | ページ背景                      |
| Support  | 20 % | `oklch(0.96 0.008 60)` Light Surface | カード・セクション背景          |
| Accent   | 10 % | `oklch(0.62 0.07 60)` Soft Bronze    | ラベル・CTA・価格のみ（≤ 15 %） |

## タイポグラフィ

- Serif heading: Cormorant Garamond（欧文 Hero/H1/H2）
- Sans body: Noto Sans JP（日本語全般、H3以下、UI）
- Fallback: Cormorant Garamond → Noto Sans JP → serif（日本語グリフ自動フォールバック）
- スケール比: 1:4.5（Fluid clamp()）

## セクション設計

| 要素              | 値                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Section padding   | Content ページ: `py-[var(--spacing-section)]` = `clamp(7rem, 12vw, 11rem)`                                                                      |
| Homepage padding  | `py-[var(--spacing-section-compact)]` = `clamp(5rem, 8vw, 7rem)`                                                                                |
| Homepage 背景     | 全セクション `bg-background`（白）統一。視覚変化は余白・タイポグラフィ・画像で確保                                                              |
| Block padding     | Form/Auth/Dashboard: `py-[var(--spacing-block)]` = `clamp(2.5rem, 5vw, 4rem)`                                                                   |
| Hero              | `min-h-[85vh]` split layout（左画像 + 右テキスト）                                                                                              |
| Container         | `mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]`                                                                            |
| Container padding | Fluid: `clamp(1.5rem, 3vw, 3rem)`                                                                                                               |
| Container max     | `80rem` (1280px)                                                                                                                                |
| セクション分離    | 余白 `--spacing-section` + 必要時 `border-t border-border`。背景色切替は使わない                                                                |
| Grid 傾向         | Container Queries: `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`                                                                            |
| border-radius     | コンテナ/画像=`rounded-lg`, 全ボタン=sharp（editorial 統一）, セクション境界=sharp。`rounded-full` はバッジ・タグ・アイコンボタン・スピナーのみ |

## コンポーネント規約

| コンポーネント         | スタイル                                                                                                                                                      | 備考                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| カード（カタログ）     | `border border-border` シャープエッジ（rounded-lg/shadow 禁止）                                                                                               | hover: image opacity                            |
| カード（ショーケース） | 枠なし、ずらしグリッド + `group-hover:opacity-85`                                                                                                             | トップページのみ                                |
| カード画像             | カタログ: `aspect-[3/2]`、ショーケース: `aspect-[3/2]` or auto                                                                                                | —                                               |
| カード情報             | Label(11px Gold) → Heading(serif light) → Body(muted) → Metadata(inline)                                                                                      | —                                               |
| カタロググリッド       | 2列固定（`sm:grid-cols-2`）+ ページネーション                                                                                                                 | 3列禁止、件数増=ページ分割                      |
| CTA ボタン             | `Button variant="editorial"`: シャープエッジ + bronze hover（`hover:bg-accent`）                                                                              | 全ページ統一                                    |
| Secondary ボタン       | テキスト + 下線 reveal                                                                                                                                        | —                                               |
| Form ボタン            | `bg-accent text-accent-foreground hover:bg-accent/90`（シャープエッジ — `rounded-full` 禁止）                                                                 | フォーム内 CTA（primary）                       |
| Button editorial       | `border border-foreground hover:bg-accent hover:text-accent-foreground`（シャープエッジ）                                                                     | 全ページ CTA 統一                               |
| セクションタイトル     | `text-center`、label(`0.8rem` uppercase tracking-[0.18em]) → `mt-4` heading(`clamp(2rem,4vw,3rem) font-light`) → description(muted)。accent line は Hero のみ | ホームページ全セクション統一                    |
| 画像                   | `object-cover`, hover で `opacity-85` 遷移                                                                                                                    | —                                               |
| ヘッダーブランド       | `font-heading font-light italic tracking-[0.08em]`                                                                                                            | セリフイタリック                                |
| ナビリンク             | `text-[0.75rem] uppercase tracking-[0.18em]`                                                                                                                  | hover:text-foreground                           |
| 番号付きリスト         | `font-heading font-light italic text-accent/50`（HowItWorks: 2.5rem / Features: 2rem）                                                                        | 01, 02, 03 形式                                 |
| PageLayout             | content: hero+sections+CTA / form: hero+centered / dashboard: container                                                                                       | —                                               |
| PageHero               | editorial: スプリット / compact: bg-surface+heading / minimal: heading のみ                                                                                   | —                                               |
| SiteCTA                | bg-background + border-t、editorial ボタン（余白で分離）                                                                                                      | content ページ末尾                              |
| Section                | 全セクション白背景統一、border-top/accent 装飾で分離                                                                                                          | セクション間の分離                              |
| EditorialCard          | featured: 横��割5:4 / default: 縦積みカード                                                                                                                   | hover:shadow-lg                                 |
| Divider                | subtle: border / accent: 中央4rem / fade: gradient                                                                                                            | セクション内の区切り                            |
| ImageFrame             | デフォルト `rounded-lg`。editorial カード内では `rounded={false}`                                                                                             | sharp edge 統一                                 |
| ボタンテキスト最小値   | editorial/CTA: `text-xs`（12px）、secondary リンク: `text-[0.7rem]`（11.2px）。`text-[0.65rem]` 以下禁止                                                      | uppercase + tracking で体感さらに小さくなるため |
| 選択カード（radio）    | `border-accent bg-accent/5`（ring/shadow なし）。未選択: `border-border hover:border-foreground/30`                                                           | 予約フォーム                                    |
| 選択コントロール（小） | `bg-accent text-accent-foreground`（塗りつぶし）。時間/日付/利用時間                                                                                          | 明確なフィードバック                            |
| フォーム枠             | `border border-border p-6 sm:p-8`（1枠で全フィールド囲む。個別枠・区切り線禁止）                                                                              | space-y-6 で間隔統一                            |
| StepIndicator          | active: outline（`border-accent text-accent`）/ completed: fill（`bg-accent`）/ pending: muted                                                                | 現在地 vs 完了の区別                            |

## ホームページ構成（Editorial Magazine）

1. **Hero** — 雑誌カバー風スプリット（左画像 + 右セリフイタリック見出し）
2. **HowItWorks** — ご利用の流れ3ステップ + バリュープロップ帯（1セクションに統合）
3. **Spaces** — Center Stage Carousel（重なりカードスタック、無限スクロール、detail パネル + ドットナビ）
4. **Features** — 番号付き editorial リスト（01, 02, ...）
5. **CTA** — 日本語見出し + ボーダーボタン

## モーション設計

| 役割   | コンポーネント                       | 定数                               |
| ------ | ------------------------------------ | ---------------------------------- |
| 主役   | `SplitText` (words/lines/chars)      | `STAGGER.char/word/line`           |
| 脇役   | `ScrollReveal` (y:40 + opacity)      | `DURATION.normal`, `EASE.outQuart` |
| 背景   | `ParallaxImage` (subtle: 0.3)        | `PARALLAX.subtle/normal`           |
| CTA    | `MagneticButton` (elastic snap-back) | `EASE.outElastic`                  |
| ヒント | `ScrollIndicator`                    | Hero 下部                          |

- **Easing**: `animations.ts` の `EASE` / `DURATION` / `STAGGER` 定数を使用（マジックナンバー禁止）
- **Duration**: fast=0.3, normal=0.6, slow=0.8, hero=1.2
- **入場順序**: SplitText → ScrollReveal → ParallaxImage
- **制約**: 1セクションで動く要素は最大3箇所

## UX 定数

| 定数                     | 値           | 根拠                                                                                            |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------- |
| ホバープレビューディレイ | 500ms        | 意図的ホバーと通過を区別する最短値。2秒は遅すぎ、即時はチラつく                                 |
| 料金表記                 | `/h`, `/day` | 英語略記で統一。`/時間` `/日` は使用しない。「日本語メイン + 英語アクセント」デザイン言語に準拠 |

## 管理画面テーマ

- **テーマ名**: Swiss Industrial Admin（全顧客共通・固定）
- **Primary**: Trust Blue `oklch(0.55 0.20 260)`
- **Background**: `oklch(0.98 0.005 250)`
- **Sidebar**: bg `oklch(0.18 0.03 260)`, accent `oklch(0.55 0.20 260)`

## 参照ファイル

| ファイル                                           | 内容                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| `(public*)/_styles/public*.css`                    | 公開ページテーマ変数                                   |
| `(public*)/_shared/lib/animations.ts`              | DURATION / EASE / STAGGER / PARALLAX 定数              |
| `(public*)/_shared/components/animations/`         | SplitText, ParallaxImage, MagneticButton, ScrollReveal |
| `(public*)/_shared/components/ui/SectionLabel.tsx` | ゴールドライン付きラベル                               |
| `(admin)/_styles/admin.css`                        | 管理画面テーマ変数                                     |

## Editorial デザイン Gotchas（gotchas.md より移動）

- **editorial ボタンは全箇所 `Button variant="editorial"` で統一** — raw `<Link>` + インラインスタイルで editorial ボタンを実装しない。`button.tsx` の editorial variant（シャープエッジ + bronze hover）が Single Source of Truth。site-header / cta-section / site-cta すべてで Button コンポーネントを使用
- **公開ページで `bg-foreground`（ダーク反転セクション）禁止** — Editorial Magazine（Kinfolk/Cereal）は全コンテンツセクション白背景が基本。ダーク全幅セクションは Accent 10% 制約を超え、トーンが崩れる。SiteCTA は `bg-background` + `border-t border-border`（余白で分離）
- **`editorial-border-accent` CSS クラスは Divider 専用** — `width: 4rem` を持つ短い装飾線。`Section border="accent"` 等の全幅要素に使うとレイアウトが 4rem 幅に潰れる。Section の accent border は `border-t-2 border-accent`（Tailwind ユーティリティ）を使用
- **Button editorial に色反転 override を書かない** — ダーク背景用の `className="border-background text-background hover:bg-background hover:text-accent"` は Button の variant 設計を迂回するハック。背景を `bg-background`（白）にし、editorial variant をそのまま使う
- **`section-design.ts` の値配列変更時は DesignFields + 型ガードも同期必須** — `DesignFields.tsx` の `backgroundOptions`/`paddingOptions`/`maxWidthOptions` + Set-based 型ガード（`isBgValue` 等）が `sectionBgValues`/`sectionSpacingValues`/`sectionMaxWidthValues` と 1:1 対応
