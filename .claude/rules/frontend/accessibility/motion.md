---
description: Accessibility — prefers-reduced-motion (GSAP matchMedia パターン A/B/C)
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
  - "src/app/(public*)/_shared/hooks/use-motion-preference.ts"
---

# Accessibility — prefers-reduced-motion

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
