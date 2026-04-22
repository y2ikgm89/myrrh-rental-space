---
paths:
  - src/app/(public*)/**
  - src/app/(admin)/**
---

# アクセシビリティ（a11y）ルール

> WCAG 2.2 AA / React 19 / GSAP prefers-reduced-motion / SkipLink / AriaLiveRegion 対応

## 概要

公開ページはアニメーションが多い（GSAP / Lenis）。すべてのエフェクトに `prefers-reduced-motion` 対応が必須。
管理画面（Lexical エディタ含む）でも基本的な a11y 規則を守る。

本プロジェクトの a11y インフラ:

- `SkipLink` — キーボードナビゲーション（`@/public/components/a11y`）
- `AriaLiveRegion` — 動的コンテンツ通知（`@/public/components/a11y`）
- `AriaLiveProvider` — コンテキスト管理（`@/shared/contexts`）

---

## セマンティック HTML

### 見出し階層

ページ内に `<h1>` は1つのみ。スキップしない（`h1` → `h3` は禁止）:

```tsx
// NG: 見出しスキップ
<h1>ページタイトル</h1>
<h3>セクション</h3>  // h2 が抜けている

// NG: デザイン目的でのみ heading タグ使用
<h2 className="text-sm text-muted-foreground">ラベル</h2>  // h2 のセマンティクスが必要か確認

// OK: 正しい階層
<h1>スペース一覧</h1>
<section>
  <h2>エリアで探す</h2>
  <h3>渋谷エリア</h3>
</section>
```

### ランドマーク

必須ランドマークを1ページに1つずつ配置（公開ページ layout.tsx で実装済み）:

```tsx
<header role="banner">...</header>
<nav aria-label="メインナビゲーション">...</nav>
<main id="main-content">...</main>  {/* SkipLink のターゲット */}
<footer role="contentinfo">...</footer>
```

補助ナビゲーション（パンくず等）は `aria-label` で区別:

```tsx
<nav aria-label="パンくずリスト">
  <ol>
    <li>
      <a href="/">ホーム</a>
    </li>
    <li aria-current="page">スペース一覧</li>
  </ol>
</nav>
```

### ボタン vs リンク

| 用途                                          | 要素                     |
| --------------------------------------------- | ------------------------ |
| ページ遷移・URL変化                           | `<a href="...">`         |
| JavaScript アクション（モーダル開閉、送信等） | `<button type="button">` |

```tsx
// NG: div/span にクリックイベント（スクリーンリーダー・キーボード不可）
<div onClick={openModal}>開く</div>

// NG: リンク要素でアクション（URL変化がないのにリンク）
<a href="#" onClick={openModal}>開く</a>

// OK:
<button type="button" onClick={openModal}>開く</button>
<Link href="/spaces">スペース一覧</Link>
```

### クリッカブルカード — Block Link / Card Overlay パターン

カード全体がクリック可能で、かつ内部にアクションボタン（URLコピー / 削除 / シェア等）を持つ UI は、**ARIA First Rule（"native HTML > ARIA role"）** に従い native `<button>` / `<a>` を `absolute inset-0` で重ねる。業界標準（GitHub リポジトリカード / YouTube サムネ / Shopify Files / Adrian Roselli "Block Links" / Heydon Pickering _Inclusive Components_）。

```tsx
<article className="group relative ... focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
  <Thumbnail />

  {/* ① Primary target: native <button>, カード全体を覆う */}
  <button
    type="button"
    onClick={openDetail}
    aria-label={`${item.title} の詳細を表示`}
    className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none"
  />

  {/* ② Action layer: pointer-events-none で透過、各 <button> のみ pointer-events-auto */}
  <div className="absolute inset-0 z-20 ... pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
    <button
      type="button"
      onClick={handleCopy}
      className="pointer-events-auto ..."
      aria-label="URLをコピー"
    >
      <IconCopy />
    </button>
    <button
      type="button"
      onClick={handleDelete}
      className="pointer-events-auto ..."
      aria-label="削除"
    >
      <IconTrash />
    </button>
  </div>
</article>
```

**このパターンの利点**:

- **ARIA 第一ルール準拠**: native `<button>` のキーボード・focus・`disabled`・form submission 契約を全部利用（`role="button"` + 自前 `onKeyDown`/`onKeyUp` が不要）
- **HTML 仕様準拠**: primary と secondary は兄弟関係のため button ネスト違反が物理的に起きない
- **`stopPropagation()` 不要**: `pointer-events-none/auto` の z-layer 分離で click 伝播が届かない
- **キーボード可視性**: `focus-within:ring-*` でコンテナに focus ring、`group-focus-within:opacity-100` で overlay も表示

**ARIA First Rule の優先順位**:

1. **第一推奨（default）**: Block Link / Card Overlay（上記 = native button + z-layer）
2. **第二推奨（ニッチ）**: `<div role="button" tabIndex={0} aria-pressed>` + `onKeyDown`（Enter）/ `onKeyUp`（Space、preventDefault でスクロール抑止）— 第一推奨が構造上使えない場合のみ
3. **選択リスト UI（別カテゴリ）**: `role="radio"`（単一選択）/ `role="checkbox"`（複数選択）+ `aria-checked`

参照実装: `src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx`（Card Overlay）、`src/app/(public)/reservation/_components/space-selector.tsx`（`role="radio"` + 内部 button）

### ナビゲーション vs タブの WAI-ARIA 区別

ページ遷移は **tab パターンではない**。`role="tab"` は同一ページ内で `tabpanel` を切り替える（=URL は変わらない）インタラクション専用:

```tsx
// NG: ページ遷移リンクに role="tab"（WAI-ARIA 誤用 — tab は tabpanel 切替用）
<div role="tablist">
  <Link href="/mypage/events" role="tab" aria-selected={isActive}>イベント</Link>
</div>

// OK: ページ遷移は nav + aria-current="page"
<nav aria-label="マイページナビゲーション">
  <ul>
    <li>
      <Link
        href="/mypage"
        aria-current={isActive ? "page" : undefined}
      >
        予約一覧
      </Link>
    </li>
  </ul>
</nav>

// OK: 同一ページ内で tabpanel 切替なら Radix Tabs primitive
<Tabs.Root value={view} onValueChange={setView}>
  <Tabs.List>
    <Tabs.Trigger value="list">一覧</Tabs.Trigger>
    <Tabs.Trigger value="calendar">カレンダー</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="list" forceMount className="data-[state=inactive]:hidden">
    {listView}
  </Tabs.Content>
</Tabs.Root>
```

---

## aria-\* 属性

### aria-label / aria-labelledby

視覚的テキストがないインタラクティブ要素には必ず aria-label を付与:

```tsx
// NG: アイコンのみのボタン
<button onClick={close}><XIcon /></button>

// OK:
<button type="button" onClick={close} aria-label="閉じる">
  <XIcon aria-hidden="true" />
</button>

// OK: aria-labelledby でテキストを参照
<section aria-labelledby="section-heading">
  <h2 id="section-heading">料金プラン</h2>
</section>
```

### aria-expanded / aria-controls（アコーディオン・ドロップダウン）

```tsx
function FaqAccordion({ question, answer }: Props) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
      >
        {question}
      </button>
      <div id={contentId} role="region" aria-label={question} hidden={!open}>
        {answer}
      </div>
    </div>
  );
}
```

### aria-live（動的コンテンツ）

`AriaLiveProvider` + `AriaLiveRegion`（実装済み）を使用。ページ内に手動で `aria-live` を追加しない:

```tsx
// NG: 独自 aria-live を追加（AriaLiveRegion と競合）
<div aria-live="polite">{statusMessage}</div>;

// OK: announce 関数を使用
import { useAriaLive } from "@/shared/contexts";

function ReservationForm() {
  const { announce } = useAriaLive();

  const handleSubmit = async () => {
    const result = await submitReservation(data);
    if (result.success) {
      announce("予約が完了しました", "polite");
    } else {
      announce("予約に失敗しました。内容を確認してください", "assertive");
    }
  };
}
```

---

## フォーカス管理

### フォーカスリング

`outline: none` は禁止。`focus-visible` で視覚的フォーカスを提供:

```tsx
// NG: フォーカスリング除去
<button className="outline-none focus:outline-none">送信</button>

// OK: focus-visible でキーボードユーザーのみ表示
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
  送信
</button>
```

public.css / admin.css の `@layer base` で全体フォーカスリングを定義済み。コンポーネント個別に override する場合は `focus-visible:` を使用する。

### フォーカストラップ（モーダル）

モーダル・ダイアログ表示中はフォーカスをトラップ。Radix UI Dialog・SheetはTab/Escape対応済みのため、カスタム実装では同等の対応が必要:

```tsx
// OK: Radix UI Dialog（フォーカストラップ自動対応）
import * as Dialog from "@radix-ui/react-dialog";

<Dialog.Root>
  <Dialog.Trigger>開く</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>予約確認</Dialog.Title>
      {/* Tabキーがここに閉じ込められる */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>;
```

### スキップリンク

`SkipLink` は公開ページ layout.tsx に実装済み。ターゲットの `id="main-content"` を `<main>` に付与する:

```tsx
// layout.tsx（実装済み）
<SkipLink />  // "メインコンテンツへスキップ" リンク

// page.tsx
<main id="main-content">
  {/* コンテンツ */}
</main>
```

---

## タッチターゲット（WCAG 2.5.5 Enhanced — AAA 準拠）

**本プロジェクトは WCAG 2.2 AA + 2.5.5 Enhanced (AAA) 採用**。全 interactive 要素は **44×44 CSS px 以上**を保証する（[WCAG 2.2 SC 2.5.5 公式](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)）。

### 要素別サイズ基準

| 要素                           | 最小サイズ                   | 実装                                                                  |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------- |
| Button（public Design System） | `min-h-11`（44px）           | `button.tsx` の sm/md/lg 全 size で `min-h-11` 以上                   |
| Button（admin shadcn）         | `h-11` (44px) / lg は `h-12` | tailwind-variants `size` の default/sm/lg/icon 全て 44px 以上         |
| checkbox / radio               | wrapper に `min-h-11`        | native 要素は 16px だが、`<label>` / wrapper で 44px ヒットエリア確保 |
| inline link（pagination 等）   | `min-block-size: 44px`       | `<a>` に `min-block-size / min-inline-size: 44px` + padding           |
| Icon-only button               | `h-11 w-11`                  | `<button aria-label="...">` にサイズ明示                              |
| Mobile nav / hamburger         | `h-11 w-11`                  | ヘッダーの menu trigger 等                                            |

### token

`@theme --touch-target-min: 2.75rem;`（public.css / admin.css 両方）— `min-h-[var(--touch-target-min)]` / `min-w-[var(--touch-target-min)]` で参照可能。

### WCAG 2.5.5 の例外条項

以下のみ 44px 未達が許容される（[公式](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced#exceptions)）:

- **Equivalent**: 同一ページに 44×44 の equivalent control がある場合
- **Inline**: テキスト段落内のインライン link（文字サイズに従う — Prose 内の `<a>` は例外）
- **User Agent Control**: ブラウザがサイズを制御する要素（native `<select>` dropdown 項目等）
- **Essential**: 情報伝達のため意図的に小さいプレゼンテーション（カラースウォッチ・タイムライン上の点等）

### 禁止パターン

```tsx
// NG: Button sm が min-h-10（40px）— WCAG 2.5.5 Enhanced 未達
const sm = "px-3 py-2 text-sm min-h-10";

// NG: icon-only button にサイズ指定なし（native button は browser default で ~24-30px）
<button aria-label="閉じる"><IconX className="h-4 w-4" /></button>

// NG: checkbox を裸配置（native 16px でヒットエリア不足）
<input type="checkbox" />テキスト
```

### OK パターン

```tsx
// OK: Button sm が min-h-11（44px）
const sm = "px-3 py-2 text-sm min-h-11";

// OK: icon-only button に h-11 w-11
<button type="button" aria-label="閉じる" className="h-11 w-11 inline-flex items-center justify-center">
  <IconX className="h-4 w-4" />
</button>

// OK: checkbox は label wrapper で 44px
<label className="flex min-h-11 items-center gap-2 cursor-pointer">
  <input type="checkbox" />
  <span>同意する</span>
</label>
```

---

## prefers-reduced-motion

### GSAP matchMedia 必須パターン（パターン A）

アニメーションをスキップする場合（reduce 時は GSAP 不介入 → 要素は CSS デフォルトで表示）:

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";

function AnimatedSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // NG: mm を使わず直接アニメーション（reduced-motion 無視）
      // gsap.from(containerRef.current, { opacity: 0, y: 50 })

      // OK: matchMedia でラップ
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          containerRef.current,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            scrollTrigger: { trigger: containerRef.current, start: "top 85%" },
          },
        );
      });
    },
    { scope: containerRef },
  );

  return <div ref={containerRef}>...</div>;
}
```

`ScrollReveal` コンポーネントはパターン A 実装済み。直接使用可能:

```tsx
// OK: ScrollReveal は gsap.matchMedia 対応済み
<ScrollReveal delay={0.2}>
  <p>このテキストはスクロールで出現</p>
</ScrollReveal>
```

### GSAP matchMedia — conditions 分岐（パターン B）

reduce 時も軽量アニメーションを実行する場合:

```tsx
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        reduce: "(prefers-reduced-motion: reduce)",
        noPreference: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { reduce } = ctx.conditions ?? {};
        gsap.to(el, {
          y: reduce ? 4 : 20, // reduce 時は小さな値
          repeat: -1,
          yoyo: true,
          duration: reduce ? 2 : 0.8,
        });
      },
    );
  },
  { scope: ref },
);
```

### イベントハンドラでの reduced-motion（パターン C）

```tsx
import { useMotionPreference } from "@/public/hooks/use-motion-preference";

function MagneticButton() {
  const motionOk = useMotionPreference(); // gsap.matchMedia ベースの ReactiveRef

  // useCallback 不要（React Compiler 自動メモ化。ref は依存配列と衝突する）
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!motionOk.current) return;
    gsap.to(buttonRef.current, { x: delta.x * 0.3, y: delta.y * 0.3 });
  };
}
```

---

## フォームアクセシビリティ

### label と input の関連付け

```tsx
// NG: label なし / placeholder のみ
<input type="email" placeholder="メールアドレス" />

// NG: label と input が未関連
<label>メールアドレス</label>
<input type="email" />

// OK: htmlFor で関連付け
<label htmlFor="email">メールアドレス</label>
<input id="email" type="email" />

// OK: React Hook Form + register（id 自動付与）
<label htmlFor="email">メールアドレス</label>
<input {...register('email')} id="email" type="email" />
```

### エラーメッセージの aria-describedby

```tsx
function FormField({ id, label, error }: Props) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? "true" : undefined}
      />
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
```

### 必須フィールド

```tsx
<label htmlFor="name">
  お名前
  <span aria-hidden="true" className="text-destructive"> *</span>
</label>
<input
  id="name"
  required
  aria-required="true"
/>
```

---

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
- **inline style で stroke / shadow を書く** — `md:` reset が効かない（specificity 衝突）。必ず Tailwind arbitrary class で書く（→ `tailwind-patterns.md` §インラインスタイル vs Tailwind arbitrary properties）
- **白画像に white text + scrim なし** — 白 on 白で読めない。scrim `foreground/80` 以上 + stroke 併用で担保

### Desktop の扱い

desktop で overlay しない split レイアウト（text が右カラム white bg）では stroke / shadow を reset:

```tsx
"md:text-foreground md:[paint-order:normal] md:[-webkit-text-stroke:0px_transparent] md:[text-shadow:none]";
```

参照実装: `_components/homepage/hero-section.tsx` の label / h1、`hero-demo/_components/variant-k-photo-overlay-landscape.tsx`

---

## キーボードナビゲーション

### Tab 順序

論理的な Tab 順序を維持する。`tabIndex` でむやみに順序を変えない:

```tsx
// NG: tabIndex で順序を強制変更（DOM順と一致させるべき）
<button tabIndex={3}>第3</button>
<button tabIndex={1}>第1</button>

// OK: DOM 順に従う
<button>第1</button>
<button>第2</button>
<button>第3</button>

// OK: フォーカスを受け取らせたくない場合のみ
<div tabIndex={-1} ref={focusRef}>...</div>
```

### Escape キー（モーダル・ドロップダウン）

Radix UI コンポーネントは Escape キー対応済み。カスタム実装では必ず対応する:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [onClose]);
```

---

## 禁止事項

1. **`outline: none` / `focus:outline-none` の単独使用禁止**
   - `focus-visible:ring-2 focus-visible:ring-ring` で代替

2. **クリック可能な `div` / `span` 禁止**
   - `<button>` または `<a>` を使用

3. **`alt=""` の濫用禁止**
   - 意味のある画像には必ず説明テキストを付与
   - `alt=""` は純粋な装飾画像のみ

4. **見出しレベルのスキップ禁止**
   - `h1` → `h3` はNG。`h1` → `h2` → `h3` の順序を守る

5. **GSAP アニメーションの `gsap.matchMedia()` 省略禁止**
   - `useGSAP` 内では必ず `mm.add('(prefers-reduced-motion: no-preference)', ...)` でラップ

6. **`AriaLiveRegion` の重複配置禁止**
   - `layout.tsx` に実装済み。個別コンポーネント内に追加しない

7. **フォーム `input` の `label` 省略禁止**
   - `placeholder` のみはNG。`<label>` と `htmlFor` / `id` で関連付け

## ファイル配置

| パス                                               | 内容                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `@/public/components/a11y/SkipLink.tsx`            | キーボードナビゲーション用スキップリンク                       |
| `@/public/components/a11y/AriaLiveRegion.tsx`      | スクリーンリーダー向け動的通知リージョン                       |
| `@/shared/contexts`                                | `AriaLiveProvider`, `useAriaLive`, `useAriaLiveOptional`       |
| `@/public/lib/a11y/`                               | `skip-link.ts`, `aria-live.ts`, `motion-utils.ts`              |
| `@/public/hooks/use-motion-preference.ts`          | `gsap.matchMedia` ベースの reduced-motion フック（パターン C） |
| `@/public/components/animations/scroll-reveal.tsx` | matchMedia 対応済みスクロールアニメーション                    |

## 参照

- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [GSAP Accessibility Guide](https://gsap.com/resources/a11y)
- `.claude/rules/frontend/gsap-patterns.md` §reduced-motion 対応（パターン A/B/C）
