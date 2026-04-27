---
description: Accessibility — セマンティック HTML / aria-* 属性
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
  - "src/shared/contexts/**"
  - "src/public/components/a11y/**"
  - "src/public/lib/a11y/**"
---

# Accessibility — セマンティック HTML / aria-\*

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
