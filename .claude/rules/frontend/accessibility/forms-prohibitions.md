---
description: Accessibility — フォーム a11y / 禁止事項 / ファイル配置 / 参照
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
  - "src/shared/contexts/**"
---

# Accessibility — フォーム / 禁止事項 / 配置 / 参照

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
