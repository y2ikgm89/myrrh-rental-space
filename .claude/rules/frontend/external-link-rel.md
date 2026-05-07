---
paths:
  - src/app/**
---

# 外部リンク `rel` 属性ルール

> `<a target="_blank">` / `window.open(url, "_blank", ...)` の rel 属性方針 SSoT。
> HTML Living Standard / MDN / OWASP（2025-2026）公式準拠の最新ベストプラクティス。

## 仕様の前提（公式準拠の根拠）

- **HTML Living Standard**: `<a target="_blank">` は default で noopener-like 保護を発動（[whatwg.org §link-type-noopener](https://html.spec.whatwg.org/multipage/links.html#link-type-noopener)）
- **Browser support**: Safari 2018 末 / Chromium 2020 末 / Firefox 2020 中盤 で実装済み（このプロジェクトの最低サポート Safari 16.4+ / Chrome 111+ / Firefox 128+ で完全動作保証）
- **MDN 推奨**: 「`target="_blank"` is implicitly providing the same `rel` behavior as setting `rel="noopener"`」明示は不要
- **`noreferrer` の意味論**: `noreferrer` は `noopener` を内包する（仕様で両方の効果を持つ）。`noopener noreferrer` の冗長指定は dead code

## 統一ガイドライン

| シナリオ                                             | 推奨パターン                                     |
| ---------------------------------------------------- | ------------------------------------------------ |
| 1. `<a target="_blank">` + **内部 app route**        | `rel` なし（HTML 標準の暗黙 noopener 任せ）      |
| 2. `<a target="_blank">` + **外部 URL**              | `rel="noreferrer"` のみ（noopener は冗長）       |
| 3. `<a target="_blank">` + **動的判定（内/外混在）** | `rel={isExternal ? "noreferrer" : undefined}`    |
| 4. `window.open(url, "_blank", windowFeatures)`      | `windowFeatures = "noreferrer"` のみ             |
| 5. Lexical Node DOM 直接書込（`link.rel = ...`）     | `link.rel = "noreferrer"`（任意 URL = 外部想定） |

### `noopener noreferrer` 併記禁止

冗長記述で 9 文字節約 + 可読性向上 + 意図が明確になる。`noopener` 単独も非推奨（HTML 標準の暗黙挙動と二重で意味なし、`noreferrer` の方が privacy 保護も含むため上位互換）。

## 内部/外部の判定基準

### 内部 app route 確定（`rel` なし）

- `next/link` の `<Link href={appRoute}>` (`AppRoute` 型 / `createInternalAppRouteSchema` 由来)
- `/posts/...` / `/spaces/...` / `/terms/...` 等のリテラル内部パス
- 管理画面から公開ページへの target="\_blank" プレビュー
- `toAppRoute(url)` でラップされた URL

### 外部 URL 確定（`rel="noreferrer"`）

- SNS シェア URL（Twitter / Facebook 等）
- 公式 SNS リンク（Instagram / YouTube 等）
- Google Maps / Google Calendar / Outlook
- OAuth プロバイダ
- R2 / 任意 CDN URL
- ユーザー入力の任意 URL（コメント / タクソノミー / 埋め込み等）
- Lexical Bookmark / Button / Embed Node のリンク先

### 動的判定（既存実装パターン）

- `item.isExternal`（DB の NavigationItem 等）
- `linkUrl.startsWith("http")`（announcement-bar / sidebar widget 等）

## 禁止パターン

```tsx
// NG: 冗長な noopener noreferrer 併記
<a target="_blank" rel="noopener noreferrer">外部</a>

// NG: 内部リンクに rel を付ける（意味なし、自サイト→自サイト遷移で referrer 抑制不要）
<Link href="/posts" target="_blank" rel="noreferrer">記事</Link>

// NG: noopener 単独（noreferrer の方が上位互換）
<a target="_blank" rel="noopener">外部</a>

// NG: window.open に "noopener,noreferrer" 併記
window.open(url, "_blank", "noopener,noreferrer")
```

## OK パターン

```tsx
// OK: 内部 app route + target="_blank" → rel なし
<Link href="/spaces/x" target="_blank">公開ページを見る</Link>

// OK: 外部 URL → noreferrer のみ
<a href="https://twitter.com/share?..." target="_blank" rel="noreferrer">

// OK: 動的判定
<a
  href={item.url}
  target={item.isExternal ? "_blank" : undefined}
  rel={item.isExternal ? "noreferrer" : undefined}
>

// OK: window.open
window.open(url, "_blank", "noreferrer")

// OK: Lexical DOM 直接書込
link.target = "_blank";
link.rel = "noreferrer";
```

## 禁止事項

1. **`rel="noopener noreferrer"` 併記禁止** — `noreferrer` は `noopener` を内包する仕様
2. **`rel="noopener"` 単独禁止** — HTML 標準の `target="_blank"` 暗黙挙動と意味重複
3. **内部 app route で `rel` 指定禁止** — referrer 抑制が無意味で dead code
4. **`window.open(url, "_blank")` で windowFeatures 省略禁止** — `window.open` には HTML 標準の暗黙 noopener が**ない**ため、第 3 引数 `"noreferrer"` 必須

## 検出 grep（監査用）

```bash
# noopener 残存確認（ゼロが正常）
grep -rn "noopener" src/

# 内部 app route で rel が付いている箇所（要削除）
grep -rn 'href="/[^"]*"' src/ -B1 -A2 | grep -A2 'target="_blank"' | grep "rel="

# noopener,noreferrer の冗長な併記（要簡略化）
grep -rn '"noopener,noreferrer"' src/
```

## 参照

- [HTML Living Standard — link types](https://html.spec.whatwg.org/multipage/links.html#link-type-noopener)
- [MDN — rel="noopener"](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener)
- [OWASP — Reverse Tabnabbing](https://owasp.org/www-community/attacks/Reverse_Tabnabbing)
- [Caniuse — implicit noopener](https://caniuse.com/mdn-html_elements_a_implicit_noopener)
