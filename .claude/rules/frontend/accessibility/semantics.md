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
