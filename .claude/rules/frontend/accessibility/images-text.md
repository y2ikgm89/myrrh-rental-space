---
description: Accessibility — 画像 alt / 画像上テキスト 3 層可読性保証 (scrim + paint-order stroke + text-shadow)
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
---

# Accessibility — 画像 alt / 画像上テキスト

## 画像 alt テキスト

```tsx
// NG: alt 省略
<Image src={url} width={800} height={600} />

// NG: ファイル名や技術的な説明
<img src="hero.jpg" alt="hero.jpg" />
<img src="photo.jpg" alt="640x480の写真" />

// OK: 意味のある説明
<Image src={url} alt="シンプルで広々としたレンタルスペース、自然光が入る会議室" width={800} height={600} />

// OK: 装飾目的の画像は空文字（スクリーンリーダーがスキップ）
<Image src={decorativePattern} alt="" width={100} height={100} aria-hidden="true" />

// OK: アイコンは aria-hidden（ラベルをボタン側に付与）
<SearchIcon aria-hidden="true" />
```

---

## 画像上テキストの 3 層可読性保証（editorial mobile hero）

画像 overlay text は背景画像の明度・彩度・柄により可読性が変動する。**どの画像でも読める** ようにするには 3 層防御:

### レイヤー構成

1. **Gradient scrim** — readable zone を作る（画像中央は透明維持で visual が生きる）

   ```tsx
   <div
     aria-hidden="true"
     className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-foreground/90 via-foreground/45 to-transparent"
   />
   ```

2. **`paint-order: stroke fill` + `-webkit-text-stroke`** — 文字に絶対的輪郭を焼き込む（背景色に非依存、WebKit / Blink 両対応）

   ```tsx
   <h1
     className={cn(
       "text-background",
       "[paint-order:stroke_fill]",
       "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
     )}
   >
   ```

3. **Layered `text-shadow`** — edge + 中距離分離 + diffuse glow で背景の複雑さを吸収

   ```tsx
   "[text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_2px_12px_rgb(0_0_0/0.5),0_0_24px_rgb(0_0_0/0.3)]";
   ```

### パラメータ目安

| 要素                            | stroke 幅          | text-shadow 強度         |
| ------------------------------- | ------------------ | ------------------------ |
| Hero title（40-64px）           | 0.5px opacity 0.45 | 3 層（edge/mid/diffuse） |
| Label / eyebrow（12px）         | 0.4px opacity 0.5  | 単層（edge のみ）        |
| Pagination / caption（10-12px） | 0.4px opacity 0.5  | 単層                     |

### 禁止パターン

- **`backdrop-blur-2xl` (40px) で画像全体をぼかす** — 画像がモザイク化して visual が失われる。`backdrop-blur-md` (12px) 以下で局所適用のみ許容
- **inline style で stroke / shadow を書く** — `md:` reset が効かない（specificity 衝突）。必ず Tailwind arbitrary class で書く（→ `tailwind-patterns/inline-style-vs-arbitrary.md`）
- **白画像に white text + scrim なし** — 白 on 白で読めない。scrim `foreground/80` 以上 + stroke 併用で担保

### Desktop の扱い

desktop で overlay しない split レイアウト（text が右カラム white bg）では stroke / shadow を reset:

```tsx
"md:text-foreground md:[paint-order:normal] md:[-webkit-text-stroke:0px_transparent] md:[text-shadow:none]";
```

参照実装: `_components/homepage/hero-section.tsx` の label / h1、`hero-demo/_components/variant-k-photo-overlay-landscape.tsx`
