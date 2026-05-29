---
description: GSAP ScrollTrigger パターン（入場アニメーション・スクラブパララックス・ピン固定）
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_shared/components/providers/lenis-provider*"
  - "src/app/(public*)/_shared/lib/a11y/motion*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP ScrollTrigger パターン

> GSAP 3 / ScrollTrigger 対応

## ScrollTrigger パターン

### 基本スクロールアニメーション（入場系）

`SCROLL_TRIGGER.reveal` プリセットを使用:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        ".item",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.slow,
          ease: EASE.outQuart,
          stagger: STAGGER.element,
          scrollTrigger: {
            trigger: containerRef.current,
            ...SCROLL_TRIGGER.reveal,
            // start: 'top 85%'
            // end: 'top 20%'
            // toggleActions: 'play none none none'
          },
        },
      );
    });
  },
  { scope: containerRef },
);
```

### スクラブ（scrub）パララックス

`SCROLL_TRIGGER.scrub` プリセットを使用。**ease は必ず `'none'`**:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(imageRef.current, { scale: 1.15 }); // parallax 分の余裕を作る

      gsap.fromTo(
        imageRef.current,
        { y: -50 },
        {
          y: 50,
          ease: "none", // scrub アニメーションに custom ease 禁止
          scrollTrigger: {
            trigger: containerRef.current,
            ...SCROLL_TRIGGER.scrub,
            // start: 'top bottom'
            // end: 'bottom top'
            // scrub: 1
          },
        },
      );
    });
  },
  { scope: containerRef, dependencies: [speed] },
);
```

### ピン固定（pin）

`pin: true` 使用時は **`invalidateOnRefresh: true` が必須**:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        isDesktop: "(min-width: 800px)",
        noPreference: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { isDesktop, noPreference } = ctx.conditions ?? {};
        if (!noPreference || !isDesktop) return; // モバイルではピン固定回避

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 1,
            pin: true,
            invalidateOnRefresh: true, // 必須: リサイズ時に再計算
          },
        });
        tl.to(".layer-1", { yPercent: -30 }).to(
          ".title",
          { opacity: 0, y: -50 },
          "<",
        );
      },
    );
  },
  { scope: containerRef },
);
```

### ScrollTrigger 3 パターン要約

| パターン                 | 主要設定                                                               | 用途                                       |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------ |
| **入場アニメーション**   | `toggleActions: 'play none none none'`, `start: 'top 85%'`             | 要素がビューポートに入った時に1回再生      |
| **スクラブパララックス** | `scrub: 1`, `start: 'top bottom'`, `end: 'bottom top'`, `ease: 'none'` | スクロール位置に連動する連続アニメーション |
| **ピン固定**             | `pin: true`, `scrub: 1`, `invalidateOnRefresh: true`                   | 横スクロール、ステップ進行（モバイル禁止） |
