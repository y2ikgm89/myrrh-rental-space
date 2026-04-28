# マイクロインタラクション リファレンス

> Myrrh Rental Space 公開ページ向け。CSS 優先、GSAP は orchestrated sequence のみ。
> `animations.ts` 定数を基盤とする。

## Duration & Easing 標準（`animations.ts` 準拠）

### GSAP 定数（`(public-v3)/_shared/lib/animations.ts`）

| 定数              | 値   | 用途                             |
| ----------------- | ---- | -------------------------------- |
| `DURATION.fast`   | 0.3s | hover、toggle、micro interaction |
| `DURATION.normal` | 0.6s | ScrollReveal、dropdown           |
| `DURATION.slow`   | 0.8s | SplitText、card stagger          |
| `DURATION.xslow`  | 1.2s | ページ遷移                       |
| `DURATION.hero`   | 1.5s | Hero 入場アニメーション          |

| 定数              | 値                    | 用途                                       |
| ----------------- | --------------------- | ------------------------------------------ |
| `EASE.outExpo`    | `expo.out`            | 一般的な入場（Hero content）               |
| `EASE.outQuart`   | `power4.out`          | テキスト reveal（SplitText, ScrollReveal） |
| `EASE.inOutQuart` | `quart.inOut`         | スクロール連動                             |
| `EASE.outElastic` | `elastic.out(1, 0.3)` | MagneticButton snap-back                   |
| `EASE.none`       | `none`                | ParallaxImage scrub                        |

### Stagger 定数

| 定数              | 値    | 用途                         |
| ----------------- | ----- | ---------------------------- |
| `STAGGER.char`    | 0.03s | SplitText variant="chars"    |
| `STAGGER.word`    | 0.08s | SplitText variant="words"    |
| `STAGGER.line`    | 0.15s | SplitText variant="lines"    |
| `STAGGER.card`    | 0.12s | SpaceShowcase カードグリッド |
| `STAGGER.element` | 0.1s  | FeaturesSection アイテム     |

### CSS 用カスタムプロパティ（`public-v3.css` に追加推奨）

```css
@theme {
  --ease-micro: cubic-bezier(0.33, 1, 0.68, 1);
  --ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);

  --duration-micro: 200ms;
  --duration-small: 300ms;
  --duration-medium: 500ms;
}
```

---

## 確立済みパターン（v3 実装から抽出）

### MagneticButton（CTA 専用）

マウス追従 + elastic snap-back。`(public-v3)/_shared/components/animations/MagneticButton.tsx` で実装済み。

```tsx
// 使用例（HeroSection, CTASection）
<MagneticButton href="/v3/reservation">Reserve Now</MagneticButton>
```

- hover: マウス位置に追従（strength=0.3）
- leave: `EASE.outElastic` で原点に復帰
- スタイル: `rounded-full border border-primary-dark` + Gold テキスト
- **CTA 以外で使用しない**

### SplitText（テキスト reveal）

文字/単語/行単位の stagger reveal。`SplitText.tsx` で実装済み。

```tsx
// Hero: 単語単位、即時発火
<SplitText variant="words" trigger={false} delay={0.5}>見出し</SplitText>

// セクション: 行単位、スクロールトリガー
<SplitText variant="lines">見出し</SplitText>
```

| variant | stagger | 用途                                       |
| ------- | ------- | ------------------------------------------ |
| `chars` | 0.03s   | ContactHero、ReservationHero（短い見出し） |
| `words` | 0.08s   | HeroSection、CTASection（中程度の見出し）  |
| `lines` | 0.15s   | ConceptSection（長い見出し）               |

### ScrollReveal（汎用入場）

`y: 40` + `opacity: 0` → スクロールでフェードイン。`ScrollReveal.tsx` で実装済み。

```tsx
// 単一要素
<ScrollReveal><SectionLabel>Our Philosophy</SectionLabel></ScrollReveal>

// 遅延付き（前の要素との時差）
<ScrollReveal delay={0.2}><p>説明テキスト</p></ScrollReveal>

// 子要素 stagger（data-reveal 属性）
<ScrollReveal stagger={STAGGER.element}>
  {items.map(item => <div key={item.id} data-reveal>{item.name}</div>)}
</ScrollReveal>
```

### ParallaxImage（スクロール連動画像移動）

画像を `scale: 1.15` で拡大し、スクロールで `y` 移動。`ParallaxImage.tsx` で実装済み。

```tsx
<ParallaxImage
  src="/image.jpg"
  alt="説明"
  className="relative aspect-[4/5] rounded-lg"
  speed="subtle" // 0.3 or "normal" 0.5
/>
```

---

## 新規コンポーネント実装時のインタラクションパターン

### ボタン

| 種類        | スタイル                                        | hover                                    | active                |
| ----------- | ----------------------------------------------- | ---------------------------------------- | --------------------- |
| CTA         | `MagneticButton`                                | マウス追従                               | elastic snap-back     |
| Secondary   | テキスト + 下線 reveal                          | `width: 0→100%` (200ms)                  | —                     |
| Form submit | `bg-primary text-primary-foreground rounded-lg` | `hover:-translate-y-0.5 hover:shadow-md` | `active:scale-[0.98]` |

```tsx
// Secondary: テキストリンク + 下線 reveal
<a className="group relative inline-flex items-center gap-1 text-foreground">
  詳しく見る
  <span
    className="absolute bottom-0 left-0 h-px w-0 bg-current
    transition-all duration-200 ease-out group-hover:w-full"
  />
</a>
```

### カード（SpaceShowcase パターン）

```tsx
<div
  className="group overflow-hidden rounded-lg border border-border bg-card
  transition-shadow duration-300 hover:shadow-lg"
>
  <div className="aspect-[4/3] overflow-hidden">
    <Image
      className="h-full w-full object-cover transition-transform
      duration-500 group-hover:scale-105"
    />
  </div>
  <div className="p-5 md:p-6">
    <p className="text-[11px] uppercase tracking-[0.15em] text-primary-dark">
      {english}
    </p>
    <h3 className="mt-1 font-heading text-lg tracking-tight">{japanese}</h3>
    {/* ... */}
  </div>
</div>
```

- container: `border border-border` → `hover:shadow-lg` (duration-300)
- image: `scale-100` → `group-hover:scale-105` (duration-500)
- **shadow-md 常時表示禁止** — hover 時のみ浮上

### フォーム（Contact / Reservation パターン）

```tsx
// Input スタイル
<input className="w-full rounded-lg border border-border bg-background px-4 py-3
  text-sm transition-colors duration-200
  focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />

// Label スタイル
<label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
  お名前
</label>
```

### モーダル / ダイアログ

```css
/* open */
.modal-overlay { opacity: 0 → 1; transition: 350ms var(--ease-enter); }
.modal-content { scale: 0.95, y: 8px → scale: 1, y: 0; transition: 350ms var(--ease-enter); }

/* close */
.modal-content { opacity → 0, y: -8px; transition: 200ms var(--ease-exit); }
```

### ナビゲーション（Header パターン）

- **スクロール連動**: transparent → `bg-background/90 shadow-sm backdrop-blur` at 80px scroll
- **モバイルメニュー**: fullscreen overlay + GSAP stagger on menu items
- **Desktop nav hover**: `transition-colors hover:text-primary-dark`

### ScrollIndicator

- `sine.inOut` で上下にバウンス
- Gold グラデーションライン
- Hero 下部に配置（`bottom-8`）
- `prefers-reduced-motion` で非表示

---

## prefers-reduced-motion 対応（必須）

**GSAP**: `gsap.matchMedia()` パターン A（`gsap-patterns.md` 参照）
**CSS**: `public-v3.css` に定義済み:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## GSAP vs CSS 使い分け（v3 基準）

| パターン             | CSS | GSAP                     | v3 実装例                       |
| -------------------- | --- | ------------------------ | ------------------------------- |
| hover/focus          | YES | —                        | カード shadow、ボタン translate |
| 単一要素入場         | —   | ScrollReveal             | SectionLabel、テキスト          |
| テキスト分割         | —   | SplitText                | 見出し words/lines/chars        |
| 画像パララックス     | —   | ParallaxImage            | ConceptSection 右カラム         |
| カード stagger       | —   | `data-space-card` + GSAP | SpaceShowcase 3 枚              |
| scroll-linked header | —   | useScrollState           | Header bg 切替                  |
| マウス追従           | —   | MagneticButton           | CTA ボタン                      |

## 参照

- `(public-v3)/_shared/lib/animations.ts` — 定数ソース
- `(public-v3)/_shared/components/animations/` — 実装済みアニメーションコンポーネント
- `.claude/rules/anti-ai-design.md` — Anti-AI デザイン強制ルール
- `.claude/rules/gsap-patterns.md` — GSAP / ScrollTrigger / Lenis
