# セクションテンプレート完全リファレンス

> 各タイプの完全テンプレートコード + ムードバリアント表

全テンプレートは `gsap.matchMedia()` パターン準拠（GSAP 公式推奨）。
→ `.claude/rules/frontend/gsap/matchmedia.md` §reduced-motion 対応 参照。

## hero テンプレート（5層パララックス）

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger } from '../../lib/gsap-config'

export function {SectionName}Hero() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    const section = sectionRef.current

    const mm = gsap.matchMedia()
    mm.add({
      isDesktop: '(min-width: 800px) and (prefers-reduced-motion: no-preference)',
      isMobile: '(max-width: 799px) and (prefers-reduced-motion: no-preference)',
    }, (context) => {
      const { isDesktop } = context.conditions!
      const layers = [
        { sel: '.hero-layer-1', y: isDesktop ? 30 : 10 },
        { sel: '.hero-layer-2', y: isDesktop ? 15 : 5 },
        { sel: '.hero-layer-3', y: isDesktop ? 8 : 0 },
        { sel: '.hero-layer-5', y: isDesktop ? -50 : -20 },
      ]

      layers.forEach(({ sel, y }) => {
        gsap.to(sel, {
          yPercent: y,
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        })
      })

      gsap.to('.hero-content', {
        opacity: 0,
        y: -50,
        scrollTrigger: {
          trigger: section,
          start: '20% top',
          end: '60% top',
          scrub: true,
        },
      })

      gsap.fromTo(
        section.querySelectorAll('.hero-fade-up'),
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: 'power3.out',
        }
      )

      gsap.fromTo(
        section.querySelectorAll('.hero-char'),
        { opacity: 0, y: 30, rotateX: 40 },
        {
          opacity: 1, y: 0, rotateX: 0,
          duration: 0.6,
          stagger: 0.03,
          ease: 'power3.out',
          delay: 0.3,
        }
      )
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="relative h-[200svh]">
      <div className="hero-layer-1 absolute inset-0 z-0">
        <div className="h-full w-full bg-gradient-to-b from-primary/10 to-transparent" />
      </div>
      <div className="hero-layer-2 absolute inset-0 z-[1]">{/* SVGパターン */}</div>
      {/* hero-layer-3: z-[1] — Three.js Canvas が z-[2] を使用するため衝突回避 */}
      <div className="hero-layer-3 absolute inset-0 z-[1]">{/* ドットパターン */}</div>
      <div className="hero-content sticky top-0 z-10 flex h-svh items-center justify-center">
        <div className="text-center">
          <h1 className="hero-fade-up text-4xl font-bold md:text-6xl">{/* SplitChars */}</h1>
          <p className="hero-fade-up mt-4 text-lg text-muted-foreground">サブテキスト</p>
          <button className="hero-fade-up mt-8">CTA</button>
        </div>
      </div>
      <div className="hero-layer-5 absolute inset-0 z-[5] pointer-events-none">
        {/* 浮遊アクセント */}
      </div>
    </section>
  )
}
```

### hero ムードバリアント

| パラメータ               | ドラマチック   | エレガント       | プレイフル            |
| ------------------------ | -------------- | ---------------- | --------------------- |
| レイヤー数               | 5              | 3                | 5                     |
| 背景 yPercent            | 40             | 15               | 25                    |
| 前景 yPercent            | -60            | -20              | -40                   |
| 入場 duration            | 1.2s           | 0.9s             | 0.6s                  |
| 入場 stagger             | 0.20           | 0.15             | 0.08                  |
| 入場 ease                | `expo.out`     | `power2.out`     | `back.out(1.7)`       |
| テキスト分割             | char + rotateX | line mask reveal | char + scale + bounce |
| コンテンツフェード start | 15% top        | 25% top          | 20% top               |
| スクロール高さ           | 250svh         | 180svh           | 200svh                |

---

## content テンプレート（3層 + clipPath）

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '../../lib/gsap-config'

export function {SectionName}Content() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    const section = sectionRef.current

    const mm = gsap.matchMedia()
    mm.add({
      isDesktop: '(min-width: 800px) and (prefers-reduced-motion: no-preference)',
      isMobile: '(max-width: 799px) and (prefers-reduced-motion: no-preference)',
    }, (context) => {
      const { isDesktop } = context.conditions!

      section.querySelectorAll<HTMLElement>('.content-image-inner').forEach((img) => {
        gsap.fromTo(img,
          { yPercent: isDesktop ? -12 : -6, scale: 1.15 },
          {
            yPercent: isDesktop ? 12 : 6,
            scrollTrigger: {
              trigger: img.closest('.content-image-wrap'),
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          }
        )
      })

      section.querySelectorAll<HTMLElement>('.content-image-wrap').forEach((wrap) => {
        gsap.fromTo(wrap,
          { clipPath: isDesktop
            ? 'inset(30% 20% 30% 20% round 24px)'
            : 'inset(10% round 16px)' },
          {
            clipPath: 'inset(0% 0% 0% 0% round 16px)',
            duration: 1.2,
            ease: 'power3.inOut',
            scrollTrigger: {
              trigger: wrap,
              start: 'top 75%',
              end: 'top 30%',
              scrub: true,
            },
          }
        )
      })

      gsap.fromTo(
        section.querySelectorAll('.content-text > *'),
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
        }
      )
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div className="content-image-wrap overflow-hidden rounded-2xl">
            <img className="content-image-inner h-full w-full object-cover" src="" alt="" />
          </div>
          <div className="content-text">
            <h2 className="text-3xl font-bold">見出し</h2>
            <p className="mt-4 text-muted-foreground">本文テキスト</p>
          </div>
        </div>
      </div>
    </section>
  )
}
```

### content ムードバリアント

| パラメータ                | ドラマチック   | エレガント     | プレイフル         |
| ------------------------- | -------------- | -------------- | ------------------ |
| clipPath初期 inset        | 30% 20%        | 10% 5%         | 20% 15% round 32px |
| clipPath ease             | `power3.inOut` | `power2.inOut` | `back.out(1.4)`    |
| 画像パララックス yPercent | ±15            | ±8             | ±12                |
| テキスト入場 y            | 50px           | 25px           | 35px               |
| テキスト stagger          | 0.15           | 0.12           | 0.08               |
| 画像 scale初期            | 1.20           | 1.10           | 1.15               |

---

## cta テンプレート（3層 + グラデーション）

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '../../lib/gsap-config'

export function {SectionName}CTA() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    const section = sectionRef.current

    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        section.querySelector('.cta-content'),
      { scale: 0.92, opacity: 0 },
      {
        scale: 1, opacity: 1,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 70%',
          toggleActions: 'play none none none',
        },
      }
    )

    section.querySelectorAll<HTMLElement>('.cta-accent').forEach((dot, i) => {
      gsap.to(dot, {
        yPercent: i % 2 === 0 ? -30 : 30,
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      })
    })
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/5 to-primary/15" />
      <div className="cta-content relative z-10 mx-auto max-w-2xl px-4 text-center">
        <h2 className="text-3xl font-bold md:text-4xl">CTA見出し</h2>
        <p className="mt-4 text-muted-foreground">説明テキスト</p>
        <button className="mt-8 w-full md:w-auto">ボタン</button>
      </div>
      <div className="cta-accent absolute right-[10%] top-[20%] hidden h-3 w-3 rounded-full bg-primary/30 md:block" />
      <div className="cta-accent absolute left-[15%] bottom-[25%] hidden h-2 w-2 rounded-full bg-primary/20 md:block" />
    </section>
  )
}
```

### cta ムードバリアント

| パラメータ        | ドラマチック       | エレガント           | プレイフル             |
| ----------------- | ------------------ | -------------------- | ---------------------- |
| 入場 scale        | 0.85               | 0.95                 | 0.90                   |
| 入場 ease         | `expo.out`         | `power2.out`         | `elastic.out(1, 0.5)`  |
| 入場 duration     | 1.2s               | 0.8s                 | 0.7s                   |
| 背景              | 強いグラデーション | 微細なグラデーション | カラフルグラデーション |
| 浮遊装飾 yPercent | ±40                | ±15                  | ±30 (回転付き)         |
| 装飾数            | 4-6個              | 2個                  | 5-8個                  |

---

## stacking テンプレート（セクション重なり）

→ 参考: [tomore.jp](https://www.tomore.jp/)

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger } from '../../lib/gsap-config'

interface StackItem {
  readonly title: string
  readonly description: string
  readonly imageSrc: string
  readonly bgClass: string
}

export function {SectionName}Stacking({ items }: { items: readonly StackItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const sections = gsap.utils.toArray<HTMLElement>('.stacking-section', container)

    const mm = gsap.matchMedia()
    mm.add({
      isDesktop: '(min-width: 800px) and (prefers-reduced-motion: no-preference)',
      isMobile: '(max-width: 799px) and (prefers-reduced-motion: no-preference)',
    }, (context) => {
      const { isDesktop } = context.conditions!

      if (isDesktop) {
        sections.forEach((section, i) => {
          if (i < sections.length - 1) {
            ScrollTrigger.create({
              trigger: section,
              start: 'top top',
              pin: true,
              pinSpacing: false,
            })
          }

          if (i < sections.length - 1) {
            gsap.to(section, {
              opacity: 0.3,
              scale: 0.95,
              scrollTrigger: {
                trigger: sections[i + 1],
                start: 'top bottom',
                end: 'top top',
                scrub: true,
              },
            })
          }
        })
      }

      sections.forEach((section) => {
        gsap.fromTo(
          section.querySelectorAll('.stacking-reveal-inner'),
          { yPercent: 100 },
          {
            yPercent: 0,
            duration: 0.8,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: section,
              start: isDesktop ? 'top 20%' : 'top 80%',
              toggleActions: 'play none none none',
            },
          }
        )
      })
    })
  }, { scope: containerRef })

  return (
    <div ref={containerRef}>
      {items.map((item, i) => (
        <section key={i} className={`stacking-section h-svh ${item.bgClass}`}>
          <div className="flex h-full items-center justify-center px-4">
            <div className="max-w-4xl">
              <div className="stacking-reveal overflow-hidden">
                <h2 className="stacking-reveal-inner text-4xl font-bold">{item.title}</h2>
              </div>
              <div className="stacking-reveal mt-4 overflow-hidden">
                <p className="stacking-reveal-inner text-lg text-muted-foreground">{item.description}</p>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
```

### stacking ムードバリアント

| パラメータ               | ドラマチック   | エレガント   | プレイフル          |
| ------------------------ | -------------- | ------------ | ------------------- |
| フェード opacity         | 0.2            | 0.4          | 0.3                 |
| フェード scale           | 0.90           | 0.97         | 0.93                |
| テキストリビール ease    | `expo.out`     | `power2.out` | `back.out(1.7)`     |
| テキストリビール stagger | 0.18           | 0.12         | 0.08                |
| 背景遷移                 | 色相回転       | 明度変化     | 彩度変化            |
| セクション間効果         | blur(4→0) 追加 | なし         | rotate(2deg→0) 追加 |

---

## gallery テンプレート（ブロークングリッド + batch入場）

→ 参考: [mizota-ks.com](https://mizota-ks.com/)

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger } from '../../lib/gsap-config'

interface GalleryItem {
  readonly imageSrc: string
  readonly alt: string
  readonly title: string
}

function deterministicOffset(index: number): number {
  const hash = ((index * 2654435761) >>> 0) % 100
  return (hash / 100) * 60 - 30
}

export function {SectionName}Gallery({ items }: { items: readonly GalleryItem[] }) {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    const section = sectionRef.current

    const mm = gsap.matchMedia()
    mm.add({
      isDesktop: '(min-width: 800px) and (prefers-reduced-motion: no-preference)',
      isMobile: '(max-width: 799px) and (prefers-reduced-motion: no-preference)',
    }, (context) => {
      const { isDesktop } = context.conditions!

      gsap.set('.gallery-item', { opacity: 0, y: 60 })

      ScrollTrigger.batch('.gallery-item', {
        onEnter: (batch) => gsap.to(batch, {
          opacity: 1, y: 0,
          stagger: 0.15,
          duration: 0.8,
          ease: 'power2.out',
          overwrite: true,
        }),
        start: 'top 90%',
      })

      if (isDesktop) {
        section.querySelectorAll<HTMLElement>('.gallery-image-inner').forEach((img, i) => {
          const yAmount = ((i % 3) - 1) * 8
          gsap.to(img, {
            yPercent: yAmount,
            scrollTrigger: {
              trigger: img.closest('.gallery-item'),
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          })
        })

        section.querySelectorAll<HTMLElement>('.gallery-image-wrap').forEach((wrap) => {
          gsap.fromTo(wrap,
            { clipPath: 'inset(20% round 16px)' },
            {
              clipPath: 'inset(0% round 8px)',
              scrollTrigger: {
                trigger: wrap,
                start: 'top 80%',
                end: 'top 50%',
                scrub: true,
              },
            }
          )
        })
      }
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="gallery-item"
              style={{ transform: `translateY(${deterministicOffset(i)}px)` }}
            >
              <div className="gallery-image-wrap overflow-hidden rounded-lg">
                <img
                  className="gallery-image-inner aspect-[3/4] w-full object-cover md:aspect-auto"
                  src={item.imageSrc}
                  alt={item.alt}
                />
              </div>
              <p className="mt-3 text-sm font-medium">{item.title}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

### gallery ムードバリアント

| パラメータ                | ドラマチック   | エレガント     | プレイフル       |
| ------------------------- | -------------- | -------------- | ---------------- |
| batch入場 y               | 80px           | 40px           | 60px             |
| batch stagger             | 0.20           | 0.12           | 0.08             |
| batch ease                | `power3.out`   | `power2.out`   | `back.out(1.4)`  |
| clipPath初期 inset        | 25% round 20px | 10% round 12px | 15% round 24px   |
| 画像パララックス yPercent | ±12            | ±5             | ±10              |
| グリッド offset範囲       | ±50px          | ±15px          | ±40px (+ rotate) |

---

## zoom テンプレート（Perspective Z軸ズーム）

→ 参考: Codrops Layered Zoom Effect

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger } from '../../lib/gsap-config'

const LAYER_SCALES = [1.0, 0.85, 0.6, 0.45, 0.3, 0.15] as const

export function {SectionName}Zoom() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const images = gsap.utils.toArray<HTMLElement>('.zoom-layer', container)

    const mm = gsap.matchMedia()
    mm.add({
      isDesktop: '(min-width: 800px) and (prefers-reduced-motion: no-preference)',
      isMobile: '(max-width: 799px) and (prefers-reduced-motion: no-preference)',
    }, (context) => {
      const { isDesktop } = context.conditions!

      if (isDesktop) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: container,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
            pin: true,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const eased = gsap.parseEase('power1.inOut')(self.progress)
              container.style.setProperty('--progress', String(eased))
            },
          },
        })

        tl.to(images, {
          z: '100vh',
          duration: 1,
          ease: 'power1.inOut',
          stagger: { amount: 0.2, from: 'center' },
        })
      } else {
        images.slice(0, 3).forEach((img, i) => {
          gsap.fromTo(img,
            { scale: 0.8, opacity: 0 },
            {
              scale: 1, opacity: 1,
              scrollTrigger: {
                trigger: img,
                start: 'top 80%',
                toggleActions: 'play none none none',
              },
              delay: i * 0.15,
            }
          )
        })
      }
    })
  }, { scope: containerRef })

  return (
    <div
      ref={containerRef}
      className="relative h-[300svh] md:h-auto"
      style={{ perspective: '100vh' }}
    >
      {LAYER_SCALES.map((scale, i) => (
        <div
          key={i}
          className="zoom-layer absolute inset-0 flex items-center justify-center"
          style={{ transform: `scale(${scale})` }}
        >
          <img
            className="h-full w-full object-cover"
            src={`/images/zoom-layer-${i + 1}.webp`}
            alt=""
            style={{
              maskImage: i > 0 ? `url('/masks/layer-${i + 1}.svg')` : undefined,
              maskSize: 'cover',
            }}
          />
        </div>
      ))}
      <div className="absolute inset-0 z-10 flex items-center justify-between px-[10%] pointer-events-none">
        <span className="text-4xl font-bold" style={{ transform: 'translate3d(calc(var(--progress, 0) * -30vw), 0, 0)' }}>
          LEFT
        </span>
        <span className="text-4xl font-bold" style={{ transform: 'translate3d(calc(var(--progress, 0) * 30vw), 0, 0)' }}>
          RIGHT
        </span>
      </div>
    </div>
  )
}
```

### zoom ムードバリアント

| パラメータ      | ドラマチック   | エレガント     | プレイフル               |
| --------------- | -------------- | -------------- | ------------------------ |
| z距離           | 120vh          | 80vh           | 100vh                    |
| stagger amount  | 0.25           | 0.15           | 0.20                     |
| stagger from    | 'end'          | 'center'       | 'random' (deterministic) |
| --progress ease | `power2.inOut` | `power1.inOut` | `back.inOut(1.4)`        |
| テキスト分離量  | ±40vw          | ±20vw          | ±30vw (+ rotate)         |
| レイヤー数      | 6              | 4              | 6                        |

---

## sequence テンプレート（Canvas イメージシーケンス）

→ 参考: Apple製品ページ風スクロール動画

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '../../lib/gsap-config'

const DESKTOP_FRAMES = 120
const MOBILE_FRAMES = 60

function getFrameSrc(index: number, isMobile: boolean): string {
  const frameIndex = isMobile ? index * 2 : index
  return `/sequences/frame-${String(frameIndex).padStart(4, '0')}.webp`
}

export function {SectionName}Sequence() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imagesRef = useRef<HTMLImageElement[]>([])

  useGSAP(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const isMobile = window.innerWidth < 800
    const frameCount = isMobile ? MOBILE_FRAMES : DESKTOP_FRAMES

    canvas.width = isMobile ? 960 : 1920
    canvas.height = isMobile ? 540 : 1080

    const images: HTMLImageElement[] = []
    for (let i = 0; i < frameCount; i++) {
      const img = new Image()
      img.src = getFrameSrc(i, isMobile)
      images.push(img)
    }
    imagesRef.current = images

    images[0].onload = () => {
      ctx.drawImage(images[0], 0, 0, canvas.width, canvas.height)
    }

    const playhead = { frame: 0 }
    gsap.to(playhead, {
      frame: frameCount - 1,
      snap: 'frame',
      ease: 'none',
      scrollTrigger: {
        trigger: canvas,
        start: 'top top',
        end: '+=3000',
        pin: true,
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        const img = images[Math.round(playhead.frame)]
        if (img?.complete) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
      },
    })
    })
  })

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-svh w-full object-cover" />
    </div>
  )
}
```

**低性能デバイスのフォールバック**: effectLevel L1 の場合、Canvas の代わりに静止画 3〜5 枚を CSS transition で切り替え。

---

## split テンプレート（data-speed 宣言的パララックス）

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger } from '../../lib/gsap-config'

export function {SectionName}Split() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    const section = sectionRef.current

    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const isMobile = window.innerWidth < 800

    gsap.utils.toArray<HTMLElement>('[data-speed]', section).forEach((el) => {
      const rawSpeed = parseFloat(el.getAttribute('data-speed') ?? '1')
      const speed = isMobile
        ? 1 + (rawSpeed - 1) * 0.3
        : rawSpeed

      gsap.to(el, {
        y: () => (1 - speed) * ScrollTrigger.maxScroll(window) * 0.5,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'max',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
    })

    ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => {
        section.style.setProperty('--progress', String(self.progress))
      },
    })

    section.querySelectorAll<HTMLElement>('.split-reveal').forEach((el) => {
      gsap.fromTo(
        el.querySelector('.split-reveal-inner'),
        { yPercent: 100 },
        {
          yPercent: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        }
      )
    })
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-12 md:grid-cols-2">
          <div data-speed="0.8" className="split-reveal overflow-hidden">
            <h2 className="split-reveal-inner text-4xl font-bold">見出し</h2>
          </div>
          <div data-speed="1.2">
            <img className="rounded-lg" src="" alt="" />
          </div>
        </div>
      </div>
      <div
        className="absolute inset-0 -z-10 opacity-10"
        style={{ transform: 'scale(calc(1 + var(--progress, 0) * 0.1))' }}
      />
    </section>
  )
}
```

### split ムードバリアント

| パラメータ            | ドラマチック | エレガント   | プレイフル          |
| --------------------- | ------------ | ------------ | ------------------- |
| data-speed 範囲       | 0.5〜1.5     | 0.8〜1.2     | 0.6〜1.4            |
| テキストリビール ease | `expo.out`   | `power2.out` | `back.out(1.7)`     |
| --progress scale      | ×0.15        | ×0.05        | ×0.10               |
| レイアウト            | 非対称 (7:3) | 対称 (5:5)   | 壊れたグリッド      |
| 装飾                  | 背景スケール | 微細ライン   | 回転要素 + カラフル |
