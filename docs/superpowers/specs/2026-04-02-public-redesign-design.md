# 公開ページデザイン大幅刷新 — デザインスペック

> Luxury White × Bronze / Cormorant Garamond + Noto Sans JP / リッチモーション

## 概要

Myrrh Rental Space の公開ページを「Luxury White × Bronze（ホワイトベース + ブロンズアクセント）」テーマで運用する。可読性を重視したホワイト基調に、ブランド名「Myrrh（没薬）」の温もり・希少性をブロンズアクセントで表現するラグジュアリー・プレミアム路線。

### 実装アプローチ

**トークン・ファースト**: @theme トークン一括差し替え → Primitives 調整 → セクション個別磨き上げ → モーション強化 → ページ統合

既存アーキテクチャ（SectionRenderer / SectionWrapper / 10 Primitives）は構造的に優秀なため維持。見た目のみ刷新。

---

## 1. カラーパレット

OKLCH形式。全トークン名は維持し、値のみ差し替え。

### メインカラー

| トークン                   | 値                         | 用途                             |
| -------------------------- | -------------------------- | -------------------------------- |
| `--color-background`       | oklch(0.985 0.005 60)      | ページ背景（ウォームホワイト）   |
| `--color-surface`          | oklch(0.96 0.008 60)       | カード・セクション背景           |
| `--color-surface-light`    | oklch(0.975 0.006 60)      | ホバー・サブ背景                 |
| `--color-foreground`       | oklch(0.18 0.015 60)       | メインテキスト（ダークブラウン） |
| `--color-muted-foreground` | oklch(0.45 0.02 60)        | 補助テキスト                     |
| `--color-accent`           | oklch(0.55 0.09 60)        | CTA・ラベル・リンク（ブロンズ）  |
| `--color-accent-light`     | oklch(0.62 0.08 60)        | ホバー時アクセント               |
| `--color-border`           | oklch(0.88 0.01 60)        | ボーダー・ディバイダー           |
| `--color-overlay`          | oklch(0.18 0.015 60 / 0.5) | モーダル・オーバーレイ           |

### ステータスカラー（ダーク背景最適化）

success / warning / destructive / info の各色は明度を引き上げてダーク背景でのコントラスト比 4.5:1 以上を確保。具体的な OKLCH 値は Phase 1 実装時に Chrome DevTools のコントラストチェッカーで算出・確定する。

### カラー比率

- Dominant 70%: ウォームホワイト（background）
- Support 20%: ライトサーフェス（surface）
- Accent 10%: ブロンズ（accent）— 15%以下ルール維持

### シャドウ

ホワイトベースのためシャドウは控えめ: rgba(0,0,0, 0.04-0.08)

### 削除

- `@layer compat` — 旧トークン互換レイヤー完全削除
- `--color-primary` / `--color-brand-primary` — 旧トークン名完全削除

---

## 2. タイポグラフィ

### フォント構成

| 用途                              | 現行          | 新                                  |
| --------------------------------- | ------------- | ----------------------------------- |
| `--font-serif`（Hero/H1/H2）      | Noto Serif JP | Cormorant Garamond（Light/Regular） |
| `--font-sans`（H3/Body/Label/UI） | Noto Sans JP  | Noto Sans JP（維持）                |
| 和文見出し補助                    | Noto Serif JP | Noto Sans JP Light                  |

**Noto Serif JP は完全削除**。Cormorant Garamond（Latin subset ≈ 80KB）+ 既存 Noto Sans JP の2書体体制。

### タイプスケール

| レベル        | フォント           | Weight           | Letter-spacing |
| ------------- | ------------------ | ---------------- | -------------- |
| Hero          | Cormorant Garamond | 300 (Light)      | 0.08em         |
| H1            | Cormorant Garamond | 300 (Light)      | 0.06em         |
| H2            | Cormorant Garamond | 400 (Regular)    | 0.06em         |
| H3            | Noto Sans JP       | 500 (Medium)     | 0.02em         |
| Section Label | Noto Sans JP       | 400 + 装飾ライン | 0.2em          |
| Body          | Noto Sans JP       | 300 (Light)      | 0              |

### 和文見出しの扱い

Hero/H1/H2 の日本語サブタイトルは Noto Sans JP Light + やや広めの letter-spacing で、欧文セリフとの対比を作る。

**Heading コンポーネントの実装方針**: `--font-serif` は Cormorant Garamond に変更するため、Heading コンポーネント（`.font-heading`）は自動的に欧文セリフを使用する。日本語テキストは Cormorant Garamond にグリフがないため、ブラウザの font-family フォールバックで Noto Sans JP にフォールバックする。つまり Heading コンポーネントの実装変更は不要 — CSS変数の差し替えのみで欧文はセリフ、和文はサンセリフの対比が自然に実現される。

### Fluid Typography

既存の `clamp()` ベースを維持。`--text-hero` 〜 `--text-h4` の値は据え置き。

---

## 3. レイアウト

### 変更点

| 要素                | 現行                     | 新                      |
| ------------------- | ------------------------ | ----------------------- |
| セクション間padding | clamp(5rem, 8vw, 7.5rem) | clamp(6rem, 10vw, 9rem) |
| カードborder-radius | rounded-lg               | rounded-xl              |
| Container最大幅     | 80rem (1280px)           | 維持                    |
| Container padding   | clamp(1.5rem, 3vw, 3rem) | 維持                    |

### Header

- Top: 透明グラデーション（Hero画像の上に重なる）
- Scrolled: ダーク半透明 + backdrop-filter: blur(12px) + ブロンズ下線
- スクロール時に「ご予約」CTAボタンがヘッダー内に出現（ブロンズアウトラインpill）
- 既存の GSAP scroll-hide 挙動は維持

### Footer

- ダークテーマ統一
- ナビゲーション: news/posts → journal に反映

### セクション背景パターン

background（ダークブラウン）と surface（やや明るいダーク）を交互に切替。CTA セクションはグラデーション + ブロンズアクセント。

---

## 4. モーション

### アニメーション階層

| 役割 | 演出                                                             | 適用箇所                     | パラメータ                                      |
| ---- | ---------------------------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| 主役 | SplitText（文字分割 stagger入場）/ Image Reveal（clip-path展開） | Hero見出し、セクションH2     | duration: 1.2s, stagger: 0.03, ease: power3.out |
| 脇役 | ScrollReveal（y:40 + opacity）/ Card Stagger（順次出現）         | 本文ブロック、カード、画像   | duration: 0.8s, stagger: 0.12, ease: power2.out |
| 背景 | ParallaxImage（微移動）/ Ambient Glow（ブロンズ微発光）          | Hero背景画像、セクション装飾 | speed: 0.3, scrub: true                         |
| CTA  | MagneticButton（カーソル追従）/ Bronze Shimmer（ホバー光沢走査） | 予約ボタン、主要CTA          | magnetic: 0.3, shimmer: 0.6s                    |

### 新規演出

**Bronze Shimmer**: ボタンホバー時にブロンズグラデーション光が左→右に走る。CSS background-position アニメーション。`linear-gradient(105deg, transparent 40%, oklch(0.65 0.09 60 / 0.15) 50%, transparent 60%)` + background-size: 200%。

**Image Reveal**: スクロール連動でクリップパスが展開。GSAP ScrollTrigger + `clip-path: inset(0 100% 0 0)` → `inset(0 0% 0 0)`。

### アクセシビリティ

すべてのアニメーションは `prefers-reduced-motion: reduce` 時に無効化（GSAP matchMedia）。既存パターンを踏襲。

---

## 5. ページ構成

### 刷新レベル

| ページ        | URL                  | レベル     | 主な変更                                         |
| ------------- | -------------------- | ---------- | ------------------------------------------------ |
| ホーム        | `/`                  | フル刷新   | フルスクリーンHero + Image Reveal + 全セクション |
| スペース一覧  | `/spaces`            | フル刷新   | ダークカードグリッド + ホバーエフェクト          |
| スペース詳細  | `/spaces/[slug]`     | フル刷新   | フルブリード画像 + ストーリー型                  |
| 予約          | `/reservation`       | フル刷新   | ダークフォームUI + ステッパー洗練                |
| About         | `/about`             | 大幅刷新   | ブランドストーリー型スクロール演出               |
| お問い合わせ  | `/contact`           | 大幅刷新   | ミニマルフォーム + マップ                        |
| イベント      | `/events`            | 大幅刷新   | ダークカレンダーUI + カードリスト                |
| Journal（新） | `/journal`           | 新設       | news+posts統合フィード                           |
| マイページ    | `/mypage/*`          | テーマ適用 | ダークテーマ統一 + UI磨き上げ                    |
| FAQ           | `/faq`               | テーマ適用 | アコーディオンUI刷新                             |
| 認証系        | `/login`等           | テーマ適用 | ダークテーマのみ                                 |
| 法的ページ    | `/terms`, `/privacy` | テーマ適用 | ダークテーマのみ                                 |

### news/posts → journal 統合方針

- DBモデル変更なし（News, Post モデルはそのまま）
- 表示統合のみ: `/journal` で両モデルを日付順に混合表示、タブ切替（すべて/ニュース/コラム）
- 既存URLリダイレクト: `/news` → `/journal?tab=news`, `/posts` → `/journal?tab=posts`（301）
- 詳細ページは維持: `/news/[slug]`, `/posts/[...segments]`（SEO既存URL保全）
- 管理画面は変更なし

---

## 6. デザインシステム Primitives 変更

### 全10コンポーネント影響分析

| コンポーネント | 変更内容                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Button         | variant カラー差し替え（トークン経由で自動）。Bronze Shimmer エフェクト追加（primary variant） |
| Heading        | font-family を Cormorant Garamond に変更（`--font-serif` 経由で自動）。H1/H2 は欧文主役        |
| Container      | 変更なし（トークン経由で背景色自動適用）                                                       |
| Stack          | 変更なし                                                                                       |
| Badge          | 変更なし（トークン経由で自動）                                                                 |
| Input          | ダーク背景用のフォーカスリングをブロンズに。背景色 surface                                     |
| Textarea       | Input 同様                                                                                     |
| Select         | ダーク背景対応（ドロップダウンの背景色）                                                       |
| Dialog         | オーバーレイ色調整（トークン経由で自動）                                                       |
| ImageFrame     | 変更なし                                                                                       |
| Prose          | ダーク背景でのリンク色（ブロンズ）・コードブロック背景色（surface）・引用ボーダー色調整        |
| Prose          | ダーク背景でのリンク色・コード背景色調整                                                       |

### 新規コンポーネント

なし。既存 Primitives で充足。Bronze Shimmer は Button の内部実装として追加。

---

## 7. 実装フェーズ

### Phase 1: トークン基盤（全体ダーク化）

- public.css `@theme` ブロック全面書き換え
- `@layer compat` 削除
- Cormorant Garamond フォント追加、Noto Serif JP 削除
- project-design-config.md 更新
- anti-ai-design.md 更新

### Phase 2: Header / Footer / Primitives

- Header: 透明→ダーク遷移、スクロール時CTA出現
- Footer: ダークテーマ、journal ナビ反映
- 10 Primitives のダーク対応微調整（Input/Select/Button）

### Phase 3: コアセクション刷新（17セクション）

- Hero セクション: フルスクリーン + Image Reveal
- Space カード: ダークカード + ホバーエフェクト
- CTA セクション: Bronze Shimmer ボタン
- その他セクション: トークン適用 + 個別磨き上げ

### Phase 4: モーション強化

- SplitText 演出追加（Hero/H2）
- Image Reveal 実装
- Bronze Shimmer 実装
- Card Stagger 強化
- Ambient Glow 装飾

### Phase 5: ページ統合・仕上げ

- `/journal` ページ新設（news+posts統合表示）
- `/news`, `/posts` → `/journal` リダイレクト設定
- 旧 news/posts ページコンポーネント削除
- 全ページ最終確認・磨き上げ

---

## 8. 技術的制約・前提

- **既存アーキテクチャ維持**: SectionRenderer / SectionWrapper / Dynamic Section Architecture
- **後方互換性ハックなし**: @layer compat 削除、旧トークン名削除
- **パフォーマンス**: Cormorant Garamond（Latin subset ≈ 80KB）+ Noto Sans JP の2書体。Noto Serif JP 削除でフォント総量削減
- **アクセシビリティ**: WCAG 2.2 AA 準拠。ダーク背景でのコントラスト比 4.5:1 以上。prefers-reduced-motion 対応
- **SEO**: 既存URL保全（/news/[slug], /posts/[...segments]）。リダイレクト301
- **管理画面**: 変更なし（admin.css は独立Root Layout）
