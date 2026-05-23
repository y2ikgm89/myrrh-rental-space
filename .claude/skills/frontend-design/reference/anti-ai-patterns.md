# Anti-AI パターン詳細カタログ

> `anti-ai-design.md` の拡張版。Myrrh Rental Space v3 の実装を基にした具体例。

---

## 1. Layout

### AI Default（禁止）

```
┌─────┐ ┌─────┐ ┌─────┐
│Card │ │Card │ │Card │   ← 等幅 3 カラム、全カード同高さ
│     │ │     │ │     │
└─────┘ └─────┘ └─────┘
```

- 全セクション同じ `py-16` padding
- 中央揃えタイトル → サブテキスト → グリッド の繰り返し

### Myrrh パターン（推奨）

**ConceptSection 型（非対称 2 カラム）:**

```tsx
<section className="py-24 md:py-32 lg:py-40">
  <div className="mx-auto max-w-6xl px-5 md:px-8">
    <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-20">
      <div>
        <ScrollReveal>
          <SectionLabel>Our Philosophy</SectionLabel>
        </ScrollReveal>
        <h2 className="mt-6 font-heading text-2xl font-bold leading-[1.2] tracking-tight md:text-3xl lg:text-4xl">
          <SplitText variant="lines">{heading}</SplitText>
        </h2>
        <ScrollReveal delay={0.2}>
          <p className="mt-6 text-sm leading-[1.9] text-muted-foreground md:text-base">
            {body}
          </p>
        </ScrollReveal>
      </div>
      <ScrollReveal delay={0.1}>
        <ParallaxImage
          src={url}
          alt={alt}
          className="relative aspect-[4/5] rounded-lg"
        />
      </ScrollReveal>
    </div>
  </div>
</section>
```

特徴:

- テキスト列 vs 画像列の非対称（視覚的重さのバランス）
- gap が `12 → 16 → 20` とレスポンシブで拡大
- 画像 `aspect-[4/5]`（縦長）でカード `aspect-[4/3]`（横長）と差別化

---

## 2. Typography

### AI Default（禁止）

- Sans 1 フォント、均等ステップ: 14/16/18/20/24px
- 全見出し `font-bold` 統一、letter-spacing デフォルト

### Myrrh パターン（推奨）

**3 層ヒエラルキー:**

| 層      | フォント                       | サイズ                             | tracking            |
| ------- | ------------------------------ | ---------------------------------- | ------------------- |
| Label   | Noto Sans JP                   | 11px uppercase                     | `tracking-[0.25em]` |
| Heading | Noto Serif JP (`font-heading`) | `text-2xl md:text-3xl lg:text-4xl` | `tracking-tight`    |
| Body    | Noto Sans JP                   | `text-sm md:text-base`             | normal              |

**Hero スケール差（4x+）:**

```tsx
<p className="text-[11px] uppercase tracking-[0.3em] text-primary-dark">Luxury Rental Space</p>
<h1 className="font-heading text-3xl font-bold leading-[1.15] tracking-tight
  sm:text-4xl md:text-5xl lg:text-7xl">
  <SplitText variant="words" trigger={false} delay={0.5}>
    洗練された空間で 特別なひとときを
  </SplitText>
</h1>
<p className="text-sm text-muted-foreground md:text-base">説明テキスト</p>
```

body 16px → h1 72px = **4.5x スケール差**

---

## 3. Color

### AI Default（禁止）

- 3 色均等配分、全面グラデーション
- アクセント色が散乱

### Myrrh パターン（推奨）

**60-30-10 実装:**

| 配分 | 色                                     | 用途                             |
| ---- | -------------------------------------- | -------------------------------- |
| 70%  | `bg-background` (white)                | セクション背景                   |
| 20%  | `bg-surface` / `text-muted-foreground` | 交互セクション背景、補助テキスト |
| 10%  | `text-primary-dark` / `gold-line`      | SectionLabel、CTA、価格          |

```tsx
// Gold アクセントの限定使用
<SectionLabel>Spaces</SectionLabel>                           {/* gold-line */}
<p className="text-primary-dark">{space.name}</p>             {/* 英語名 */}
<span className="text-primary-dark">¥{price}/h</span>        {/* 価格 */}
<MagneticButton href="/reservation">Reserve Now</MagneticButton> {/* CTA */}
// ↑ これ以外に Gold を使わない
```

---

## 4. Motion

### AI Default（禁止）

```tsx
// NG: 全要素が同じ fade-in-up
{
  items.map((item, i) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.1 }}
    />
  ));
}
```

### Myrrh パターン（推奨）

**入場ヒエラルキー（ConceptSection を例に）:**

```
Time →
|0.0s       |0.2s       |0.4s       |0.6s       |0.8s
|──────────SectionLabel ScrollReveal────────────|
            |────────SplitText(lines) stagger 0.15s────|
                        |──────body ScrollReveal delay=0.2──────|
                |──────ParallaxImage ScrollReveal delay=0.1──────|
```

- **主役**: `SplitText variant="lines"` (heading) — `DURATION.slow` (0.8s) + `EASE.outQuart`
- **脇役**: `ScrollReveal` (label, body) — `DURATION.normal` (0.6s) + 遅延
- **静止 or スクロール連動**: `ParallaxImage` — `PARALLAX.subtle` (0.3)

**SpaceShowcase カード stagger:**

```typescript
gsap.fromTo(
  cards,
  { y: 50, opacity: 0 },
  {
    y: 0,
    opacity: 1,
    duration: DURATION.slow, // 0.8s
    ease: EASE.outQuart, // power4.out
    stagger: STAGGER.card, // 0.12s
    scrollTrigger: {
      trigger: grid,
      start: "top 80%",
      toggleActions: "play none none none",
    },
  },
);
```

---

## 5. Corners（border-radius）

### AI Default（禁止）

全要素 `rounded-lg` 統一

### Myrrh パターン（推奨）

| 要素               | radius        | 理由                                                                                         |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------- |
| カード container   | `rounded-lg`  | コンテンツを包むコンテナ                                                                     |
| 画像（standalone） | `rounded-lg`  | ConceptSection ParallaxImage                                                                 |
| ボタン（CTA）      | sharp（なし） | editorial 統一（`Button variant="editorial"` / `MagneticButton` 共に rounded なし、PR #193） |
| フォーム input     | `rounded-lg`  | 一貫性                                                                                       |
| セクション         | なし (sharp)  | セクション区切りは余白で表現                                                                 |

**混合のルール**: コンテナ/画像 = `rounded-lg`、全ボタン = sharp（editorial 統一）、セクション境界 = sharp。`rounded-full` はバッジ・タグ・アイコンボタン・スピナーのみ

---

## 6. Buttons

### AI Default（禁止）

全ボタン pill gradient、hover で opacity 変化だけ

### Myrrh パターン（推奨）

**3 層ボタンヒエラルキー:**

```tsx
// 1. CTA（ページに 1-2 個）— MagneticButton
<MagneticButton href="/v3/reservation">Reserve Now</MagneticButton>

// 2. テキストリンク（ナビゲーション、もっと見る）
<a className="group relative inline-flex items-center gap-1 text-foreground">
  詳しく見る
  <span className="absolute bottom-0 left-0 h-px w-0 bg-current
    transition-all duration-200 ease-out group-hover:w-full" />
</a>

// 3. フォーム送信（Contact / Reservation）
<button className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-medium
  text-primary-foreground transition-all duration-200
  hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]">
  送信する
</button>
```

---

## 7. Cards（SpaceShowcase パターン）

### AI Default（禁止）

全カード `shadow-md rounded-lg p-6`、hover で shadow 強化のみ

### Myrrh パターン（推奨）

```tsx
<div
  data-space-card=""
  className="group overflow-hidden rounded-lg border border-border bg-card
    transition-shadow duration-300 hover:shadow-lg"
>
  {/* 画像: hover で scale */}
  <div className="aspect-[4/3] overflow-hidden">
    <Image
      className="h-full w-full object-cover transition-transform duration-500
        group-hover:scale-105"
      sizes="(max-width: 768px) 100vw, 33vw"
    />
  </div>

  {/* 情報 */}
  <div className="p-5 md:p-6">
    <p className="text-[11px] uppercase tracking-[0.15em] text-primary-dark">
      {englishName}
    </p>
    <h3 className="mt-1 font-heading text-lg tracking-tight">{japaneseName}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{tagline}</p>

    {/* メタデータ区切り線 */}
    <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
      <span className="text-xs text-muted-foreground">
        {capacity}名 / {area}m²
      </span>
      <span className="text-sm font-medium text-primary-dark">¥{price}/h</span>
    </div>
  </div>
</div>
```

特徴:

- `border border-border`（常時）+ `hover:shadow-lg`（hover のみ）
- 英語名 Label → 日本語名 Heading → tagline Body の 3 層
- 画像 `duration-500`、container `duration-300` で速度差

---

## 8. Hero Section

### AI Default（禁止）

```
        [Title centered]
     [Subtitle centered]
   [Button 1]  [Button 2]
```

### Myrrh パターン（推奨）

**HeroSection 型（フルビューポート + パララックス）:**

```
┌──────────────────────────────────────────┐
│  [パララックス背景画像 scale:1.15]        │
│  [gradient overlay: from-bg/70 to-bg]    │
│                                          │
│        Luxury Rental Space               │  ← 11px uppercase Gold
│                                          │
│     洗練された空間で                      │  ← SplitText(words) 7xl Serif
│     特別なひとときを                      │
│                                          │
│     説明テキスト                          │  ← sm Sans muted
│                                          │
│        [ Reserve Now ]                   │  ← MagneticButton（1個のみ）
│                                          │
│          ↓ Scroll                        │  ← ScrollIndicator
└──────────────────────────────────────────┘
```

- 2 ボタン並列禁止 → CTA 1 個に集中
- gradient overlay で背景画像の上にテキスト配置
- SplitText `trigger={false}` でページロード時に即時 reveal

**Mini Hero 型（Contact / Reservation）:**

- `min-h-[40vh]`
- gradient 背景（画像なし）
- SplitText `variant="chars"` + `trigger={false}`

---

## 9. セクション間の余白と背景

### AI Default（禁止）

全セクション `py-16` 統一 + 区切り線

### Myrrh パターン（推奨）

| セクション    | padding                   | 背景                      |
| ------------- | ------------------------- | ------------------------- |
| Hero          | `h-screen`                | 画像 + gradient overlay   |
| Concept       | `py-24 md:py-32 lg:py-40` | `bg-background` (white)   |
| SpaceShowcase | `py-24 md:py-32 lg:py-40` | `bg-surface` (light gray) |
| Features      | `py-24 md:py-32 lg:py-40` | `bg-background` (white)   |
| CTA           | `py-16 md:py-20`          | `bg-accent` (gold tint)   |

- 区切り線なし — **背景色の交互切替** で視覚的に分離
- CTA セクションのみ padding を小さく + accent 背景で差別化

---

## セルフチェック早見表

| #   | 質問                                        | yes / no |
| --- | ------------------------------------------- | -------- |
| 1   | Serif/Sans の対比があるか？                 |          |
| 2   | Gold アクセントが控えめ（15% 以下）か？     |          |
| 3   | セクション間で padding/背景に変化があるか？ |          |
| 4   | アニメーションに主役/脇役の差があるか？     |          |
| 5   | カードに hover インタラクションがあるか？   |          |
| 6   | SectionLabel コンポーネントを使っているか？ |          |

**3/6 以上 yes → PASS**
