# Hero 背景スライドショー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `hero` セクションと `page-hero` の `media` variant の全面背景メディアを、単一 → 複数（画像・動画混在）の自動スライドショーに拡張する。

**Architecture:** 共有ファクトリ `createMediaGroupSchema`（単一 group）を `createMediaArraySchema`（配列）にクリーンブレイクし、消費者 2 箇所（`hero.backgroundMedia` / `page-hero.mediaSchema.media`）を同時に配列化。描画は共有 client component `HeroBackgroundSlideshow`（GSAP Pattern C）で画像=固定秒・R2動画=`onEnded`・YouTube/Vimeo=固定秒フォールバックで送り、スライドショー全体でループ。既存 DB データは一度きりの冪等な移行スクリプトで変換（コードに互換シムを残さない）。

**Tech Stack:** Zod 4 (field-registry), Next.js 16 / React 19, GSAP 3 + @gsap/react, Bun Test, Prisma (Section.config JSON).

**PR 粒度:** 共有ファクトリ変更が 2 消費者を同時に破壊するため**単一 PR（atomic）**。分割すると build が壊れる（schema 変更の rollback 単位として 1 PR が正当、PR 粒度表「schema 変更は必ず別 PR」に従い独立 PR）。

**前提知識（参照ファイル）:**

- 配列フィールド + uniqueness refine の先行例: `src/shared/lib/sections/definitions/gallery/schema.ts`
- crossfade/ken-burns スライドショーの GSAP Pattern C 実装: `src/app/(public)/_shared/components/page-hero/EditorialSplitHero.tsx`
- reduced-motion ref: `src/app/(public)/_shared/hooks/use-motion-preference.ts`
- media 種別判定: `src/shared/lib/media/detect-media-type.ts`（`detectMediaSourceType`）+ `src/shared/lib/video/url-detect.ts`（`detectVideoProvider`）
- 移行スクリプト bootstrap: `scripts/backfill-oauth-token-encryption.ts`
- schema test パターン: `__tests__/unit/domain/sections/value-props-schema.test.ts`
- field helper 仕様: `src/shared/lib/sections/field-registry.ts`（`field.array` / `field.media` / `field.select` / `field.number`）

**重要な不変条件:**

- section schema は `safeParse({})` 成功が契約（`field.array(...)` は `.default([])` を内蔵するため自動的に満たす）
- AutoSectionForm は field-registry を読んで自動描画する。`field.array` 化により管理画面 UI は **追加実装不要**（gallery と同じく add/remove UI が自動生成される）
- `registry.test.ts` のセクション数 **22** は不変（新規 type ではない）

---

### Task 1: 共有ファクトリを配列化（`createMediaArraySchema`）

**Files:**

- Modify: `src/shared/lib/sections/definitions/_shared/media.ts`

- [ ] **Step 1: ファクトリを配列化し、transition 定数を追加**

`src/shared/lib/sections/definitions/_shared/media.ts` の**全文を以下で置換**:

```ts
/**
 * 共通メディア（画像 / 動画）配列 factory
 *
 * Hero 系 section の背景メディア SSoT。画像 / 動画どちらも受け付ける
 * `{ url, alt, caption }` を **複数登録**できる配列フィールドを返す。
 * 1 件なら単一背景（動画は loop / 画像は静止）、複数件なら
 * `HeroBackgroundSlideshow` が自動スライドショー描画する。
 *
 * 公開側は各 item の `detectMediaSourceType(url)` で runtime に image / video を
 * 派生し、`<Image>` / `<VideoPlayer>` を出し分ける。
 *
 * 2026-05-31 PR: 単一 group (`createMediaGroupSchema`) からクリーンブレイクで配列化。
 * 旧形式 `{ url, alt, caption }` の既存 DB データは
 * `scripts/migrate-hero-background-media-to-array.ts` で配列へ一括変換する
 * （コードに互換シムは残さない）。
 *
 * `createImageGroupSchema` (image 単独・単一) との使い分け:
 * - `createMediaArraySchema`: hero 系（背景に動画も許容 + スライドショー）
 * - `createImageGroupSchema`: editorial / content section（静止画固定の場面）
 */

import { field } from "../../field-registry";

/** 背景スライドショーのトランジション種別 SSoT（全面背景 hero 用、画像のみ ken-burns 有効） */
export const HERO_BG_TRANSITIONS = ["crossfade", "ken-burns"] as const;
export type HeroBgTransition = (typeof HERO_BG_TRANSITIONS)[number];

/** 背景メディア配列の最大件数（運用上の上限） */
export const HERO_BG_MEDIA_MAX = 12;

export function createMediaArraySchema(label = "背景メディア（画像 / 動画）") {
  return field.array(label, {
    subGroup: "media",
    max: HERO_BG_MEDIA_MAX,
    helpText:
      "画像 (JPEG/PNG/WebP/GIF) または動画 (R2 mp4 / YouTube / Vimeo URL)。複数登録するとスライドショーになります",
    fields: {
      url: field.media("メディア", {
        accept: "image-or-video",
      }),
      alt: field.text("代替テキスト（a11y / SEO）", {
        maxLength: 200,
        helpText: "画像が読み込めない場合や読み上げ時に使用",
      }),
      caption: field.text("キャプション（任意）", {
        maxLength: 300,
        helpText: "画像下部やオーバーレイ内に表示する説明文",
      }),
    },
  });
}
```

- [ ] **Step 2: 型チェックで旧 export 参照の破綻を確認**

Run: `bun run type-check 2>&1 | grep -E "createMediaGroupSchema|media.ts" | head`
Expected: `createMediaGroupSchema` を参照している `hero/schema.ts` と `page-hero/schema.ts` で「has no exported member」エラー（Task 2 / 3 で解消する）。この時点でエラーが出るのは正常。

- [ ] **Step 3: コミット**

```bash
git add src/shared/lib/sections/definitions/_shared/media.ts
git commit -m "refactor(sections): 背景メディア factory を配列化 (createMediaArraySchema)"
```

---

### Task 2: hero スキーマを配列 + transition/autoPlayInterval に更新

**Files:**

- Modify: `src/shared/lib/sections/definitions/hero/schema.ts`
- Test: `__tests__/unit/domain/sections/hero-schema.test.ts` (Create)

- [ ] **Step 1: 失敗するテストを書く**

Create `__tests__/unit/domain/sections/hero-schema.test.ts`:

```ts
/**
 * hero セクション schema ユニットテスト（背景スライドショー対応）
 *
 * - safeParse({}) 成立契約（fallback chain 互換）
 * - backgroundMedia の配列化（default []）
 * - 同一 URL 重複の refine（admin write-side）
 * - transition / autoPlayInterval の default
 */

import { describe, expect, test } from "bun:test";

import { heroConfigSchema } from "@/shared/lib/sections/definitions/hero/schema";

describe("heroConfigSchema（背景スライドショー）", () => {
  test("空 config でも safeParse 成功し backgroundMedia は []", () => {
    const result = heroConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundMedia).toEqual([]);
      expect(result.data.transition).toBe("crossfade");
      expect(result.data.autoPlayInterval).toBe(5);
    }
  });

  test("複数メディアでバリデーション成功", () => {
    const result = heroConfigSchema.safeParse({
      backgroundMedia: [
        { url: "https://cdn.example.com/a.jpg", alt: "A", caption: "" },
        { url: "https://cdn.example.com/b.mp4", alt: "B", caption: "" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backgroundMedia).toHaveLength(2);
    }
  });

  test("同一 URL の重複は refine で失敗", () => {
    const result = heroConfigSchema.safeParse({
      backgroundMedia: [
        { url: "https://cdn.example.com/a.jpg", alt: "A", caption: "" },
        { url: "https://cdn.example.com/a.jpg", alt: "A2", caption: "" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("autoPlayInterval は 2-20 の範囲外で失敗", () => {
    const tooFast = heroConfigSchema.safeParse({ autoPlayInterval: 1 });
    expect(tooFast.success).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/domain/sections/hero-schema.test.ts`
Expected: FAIL（`backgroundMedia` がまだ単一 group のため `toEqual([])` で失敗、または import エラー）

- [ ] **Step 3: hero スキーマを更新**

`src/shared/lib/sections/definitions/hero/schema.ts` の import と `backgroundMedia` 行、および新フィールドを更新する。

import 行を置換:

```ts
import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { createMediaArraySchema, HERO_BG_TRANSITIONS } from "../_shared/media";
import { sectionLayoutSchema } from "../_shared/layout";
```

`backgroundMedia: createMediaGroupSchema("背景メディア（画像 / 動画）"),` の行を以下に置換:

```ts
  backgroundMedia: createMediaArraySchema("背景メディア（画像 / 動画）"),
  transition: field.select("切り替え演出", {
    options: HERO_BG_TRANSITIONS,
    default: "crossfade",
    group: "design",
    helpText: "背景メディアが複数のときのスライドショー切り替え方法",
  }),
  autoPlayInterval: field.number("自動切り替え間隔", {
    min: 2,
    max: 20,
    default: 5,
    suffix: "秒",
    group: "design",
    helpText: "画像スライドの表示秒数（動画は再生完了で切り替わります）",
  }),
```

`heroConfigSchema` 末尾（`z.object({...})` を閉じた直後）に uniqueness refine を追加する。現状:

```ts
  layout: sectionLayoutSchema,
});
```

を以下に置換:

```ts
  layout: sectionLayoutSchema,
}).refine(
  (data) =>
    new Set(data.backgroundMedia.map((m) => m.url)).size ===
    data.backgroundMedia.length,
  {
    error: "同じメディアを複数登録することはできません",
    path: ["backgroundMedia"],
  },
);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/domain/sections/hero-schema.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/sections/definitions/hero/schema.ts __tests__/unit/domain/sections/hero-schema.test.ts
git commit -m "feat(hero): 背景メディアを配列化しスライドショー設定を追加"
```

---

### Task 3: page-hero media variant スキーマを配列に更新

**Files:**

- Modify: `src/shared/lib/sections/definitions/page-hero/schema.ts`
- Test: `__tests__/unit/domain/sections/page-hero-media-schema.test.ts` (Create)

> **注意:** `mediaSchema` は `z.discriminatedUnion` のメンバーのため `.refine`（ZodEffects 化）を**付けられない**（discriminatedUnion は ZodObject variant を要求し、ZodEffects 化すると introspection の variant select が壊れる既知の silent bug）。したがって page-hero media variant の **uniqueness refine は付けない**（hero セクション側のみ refine、page-hero は管理 UI の運用で重複回避。重複しても描画は動作する）。

- [ ] **Step 1: 失敗するテストを書く**

Create `__tests__/unit/domain/sections/page-hero-media-schema.test.ts`:

```ts
/**
 * page-hero media variant schema ユニットテスト（背景スライドショー対応）
 */

import { describe, expect, test } from "bun:test";

import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero/schema";

describe("pageHeroConfigSchema media variant（背景スライドショー）", () => {
  test("media variant 空でも safeParse 成功し media は []", () => {
    const result = pageHeroConfigSchema.safeParse({ variant: "media" });
    expect(result.success).toBe(true);
    if (result.success && result.data.variant === "media") {
      expect(result.data.media).toEqual([]);
      expect(result.data.transition).toBe("crossfade");
      expect(result.data.autoPlayInterval).toBe(5);
    }
  });

  test("複数メディアでバリデーション成功", () => {
    const result = pageHeroConfigSchema.safeParse({
      variant: "media",
      media: [
        { url: "https://cdn.example.com/a.jpg", alt: "A", caption: "" },
        { url: "https://cdn.example.com/b.mp4", alt: "B", caption: "" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.variant === "media") {
      expect(result.data.media).toHaveLength(2);
    }
  });

  test("editorial-split variant は従来通り（回帰なし）", () => {
    const result = pageHeroConfigSchema.safeParse({
      variant: "editorial-split",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/domain/sections/page-hero-media-schema.test.ts`
Expected: FAIL（`media` がまだ単一 group / `transition` 未定義）

- [ ] **Step 3: page-hero スキーマを更新**

`src/shared/lib/sections/definitions/page-hero/schema.ts` の import を更新:

```ts
import { createMediaArraySchema, HERO_BG_TRANSITIONS } from "../_shared/media";
```

（`import { createMediaGroupSchema } from "../_shared/media";` を上記に置換）

`mediaSchema` 内の `media: createMediaGroupSchema("背景メディア（画像 / 動画）"),` を以下に置換:

```ts
  media: createMediaArraySchema("背景メディア（画像 / 動画）"),
  transition: field.select("切り替え演出", {
    options: HERO_BG_TRANSITIONS,
    default: "crossfade",
    group: "design",
    helpText: "背景メディアが複数のときのスライドショー切り替え方法",
  }),
  autoPlayInterval: field.number("自動切り替え間隔", {
    min: 2,
    max: 20,
    default: 5,
    suffix: "秒",
    group: "design",
    helpText: "画像スライドの表示秒数（動画は再生完了で切り替わります）",
  }),
```

（`posterImage` 以降はそのまま残す）

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/domain/sections/page-hero-media-schema.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/sections/definitions/page-hero/schema.ts __tests__/unit/domain/sections/page-hero-media-schema.test.ts
git commit -m "feat(page-hero): media variant 背景を配列化しスライドショー設定を追加"
```

---

### Task 4: VideoPlayer に loop / onEnded / videoRef を追加

**Files:**

- Modify: `src/app/(public)/_shared/components/design-system/video-player.tsx`

- [ ] **Step 1: VideoPlayer に optional props を追加**

`video-player.tsx` の `VideoPlayerProps` と R2 `<video>` 分岐、iframe loop param を更新する。

`import` 行に `Ref` を追加:

```ts
import type { Ref } from "react";
import { detectVideoProvider } from "@/shared/lib/video/url-detect";
import { cn } from "@/shared/lib/cn";
```

`VideoPlayerProps` を置換:

```ts
interface VideoPlayerProps {
  readonly url: string;
  readonly title?: string;
  readonly poster?: string;
  readonly variant?: VideoPlayerVariant;
  readonly className?: string;
  /** background variant のみ — false で `<video loop>` を外し `onEnded` を発火させる（default true） */
  readonly loop?: boolean;
  /** R2 mp4 の `<video>` のみ — 再生完了で発火（iframe provider では発火しない） */
  readonly onEnded?: () => void;
  /** R2 mp4 の `<video>` 要素 ref（スライドショーの先頭巻き戻し制御用） */
  readonly videoRef?: Ref<HTMLVideoElement>;
}
```

`buildYouTubeEmbedSrc` の `loop` を引数化（slideshow で loop=false を反映）:

```ts
function buildYouTubeEmbedSrc(
  videoId: string,
  variant: VideoPlayerVariant,
  loop: boolean,
): string {
  const base = `https://www.youtube.com/embed/${videoId}`;
  if (variant !== "background") return base;
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: loop ? "1" : "0",
    controls: "0",
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    playlist: videoId,
  });
  return `${base}?${params.toString()}`;
}
```

`buildVimeoEmbedSrc` も同様:

```ts
function buildVimeoEmbedSrc(
  videoId: string,
  variant: VideoPlayerVariant,
  loop: boolean,
): string {
  const base = `https://player.vimeo.com/video/${videoId}`;
  if (variant !== "background") return base;
  const params = new URLSearchParams({
    autoplay: "1",
    muted: "1",
    loop: loop ? "1" : "0",
    background: "1",
  });
  return `${base}?${params.toString()}`;
}
```

関数本体のシグネチャと分岐を更新:

```ts
export function VideoPlayer({
  url,
  title,
  poster,
  variant = "controls",
  className,
  loop = true,
  onEnded,
  videoRef,
}: VideoPlayerProps) {
  if (url.length === 0) return null;

  const detection = detectVideoProvider(url);

  if (detection.provider === "youtube" && detection.videoId) {
    return (
      <iframe
        src={buildYouTubeEmbedSrc(detection.videoId, variant, loop)}
        title={title ?? "YouTube 動画"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className={cn("h-full w-full border-0", className)}
      />
    );
  }

  if (detection.provider === "vimeo" && detection.videoId) {
    return (
      <iframe
        src={buildVimeoEmbedSrc(detection.videoId, variant, loop)}
        title={title ?? "Vimeo 動画"}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className={cn("h-full w-full border-0", className)}
      />
    );
  }

  // R2 self-host または任意 mp4 URL
  if (variant === "background") {
    return (
      <video
        ref={videoRef}
        src={url}
        autoPlay
        muted
        loop={loop}
        playsInline
        {...(onEnded !== undefined && { onEnded })}
        {...(poster !== undefined && { poster })}
        className={cn("h-full w-full object-cover", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <video
      src={url}
      controls
      preload="metadata"
      {...(poster !== undefined && { poster })}
      className={cn("h-full w-full bg-foreground", className)}
      {...(title !== undefined && { "aria-label": title })}
    />
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check 2>&1 | grep -i "video-player" | head`
Expected: 出力なし（既存呼び出しは optional props 未指定で互換）

- [ ] **Step 3: コミット**

```bash
git add "src/app/(public)/_shared/components/design-system/video-player.tsx"
git commit -m "feat(video-player): loop/onEnded/videoRef を追加（スライドショー制御用）"
```

---

### Task 5: 共有 HeroBackgroundSlideshow コンポーネントを作成

**Files:**

- Create: `src/app/(public)/_shared/components/page-hero/hero-background-slideshow.tsx`

> **配置理由:** `StandardHeroSection`（`(public)/_components/`）と `MediaHero`（`(public)/_shared/components/page-hero/`）の双方から import する共有 client component。既存 hero 群と同じ `_shared/components/page-hero/` に置く。

- [ ] **Step 1: コンポーネントを作成**

Create `src/app/(public)/_shared/components/page-hero/hero-background-slideshow.tsx`:

```tsx
"use client";

/**
 * HeroBackgroundSlideshow — 全面背景メディアの自動スライドショー
 *
 * hero セクション / page-hero media variant の共有背景描画。複数の画像・動画を
 * クロスフェード（または ken-burns）で切り替える。
 *
 * - 画像スライド: autoPlayInterval 秒で次へ
 * - R2 mp4 スライド: loop を外し再生完了 (onEnded) で次へ + 切替時に先頭巻き戻し
 * - YouTube / Vimeo スライド: 終了検知不可のため autoPlayInterval 秒フォールバック
 * - スライドショー全体でループ（最後 → 最初）
 * - メディア 1 件: 自動送りなし（動画は loop 背景 / 画像は静止）
 * - prefers-reduced-motion: 先頭スライドのみ静止表示、自動送りなし
 * - GSAP Pattern C（ref + gsap.to + useMotionPreference + killTweensOf cleanup）
 */

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactElement,
} from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { VideoPlayer } from "@/public/components/design-system/video-player";
import { DURATION, EASE } from "@/public/lib/animations";
import { cn } from "@/shared/lib/cn";
import { detectMediaSourceType } from "@/shared/lib/media/detect-media-type";
import { detectVideoProvider } from "@/shared/lib/video/url-detect";
import type { HeroBgTransition } from "@/shared/lib/sections/definitions/_shared/media";

export interface HeroSlideItem {
  readonly url: string;
  readonly alt: string;
  readonly caption: string;
}

interface HeroBackgroundSlideshowProps {
  readonly items: readonly HeroSlideItem[];
  readonly transition: HeroBgTransition;
  readonly autoPlayInterval: number;
  readonly sizes?: string;
  readonly priority?: boolean;
}

type SlideKind = "image" | "video-file" | "video-embed";

function slideKind(url: string): SlideKind {
  if (detectMediaSourceType(url) !== "video") return "image";
  return detectVideoProvider(url).provider === undefined
    ? "video-file"
    : "video-embed";
}

export function HeroBackgroundSlideshow({
  items,
  transition,
  autoPlayInterval,
  sizes = "100vw",
  priority = false,
}: HeroBackgroundSlideshowProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionOkRef = useMotionPreference();

  const count = items.length;
  const hasMultiple = count > 1;
  const [activeIndex, setActiveIndex] = useState(0);

  const kinds = items.map((it) => slideKind(it.url));

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const goTo = (nextIndex: number) => {
    const prevIndex = activeIndexRef.current;
    if (prevIndex === nextIndex) return;

    const prevEl = layerRefs.current[prevIndex];
    const nextEl = layerRefs.current[nextIndex];
    if (!prevEl || !nextEl) return;

    if (motionOkRef.current) {
      gsap.to(prevEl, {
        opacity: 0,
        duration: DURATION.hero,
        ease: EASE.inOut,
      });
      gsap.to(nextEl, {
        opacity: 1,
        duration: DURATION.hero,
        ease: EASE.inOut,
      });
      if (transition === "ken-burns" && kinds[nextIndex] === "image") {
        const img = nextEl.firstElementChild;
        if (img) {
          gsap.fromTo(
            img,
            { scale: 1, x: "0%", y: "0%" },
            {
              scale: 1.08,
              x: "2%",
              y: "1%",
              duration: autoPlayInterval,
              ease: EASE.none,
            },
          );
        }
      }
    } else {
      gsap.set(prevEl, { opacity: 0 });
      gsap.set(nextEl, { opacity: 1 });
    }

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  const advance = () => {
    goTo((activeIndexRef.current + 1) % count);
  };

  // アクティブスライドが変わるたびに送りタイミングを再スケジュール
  const scheduleActive = useEffectEvent(() => {
    clearTimer();
    if (!hasMultiple || !motionOkRef.current) return;

    const index = activeIndexRef.current;
    const kind = kinds[index];

    if (kind === "video-file") {
      // R2 mp4: 先頭から再生し直す。onEnded（JSX 側）で advance する
      const video = videoRefs.current[index];
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => {
          // autoplay 失敗時は interval フォールバック
          timerRef.current = setTimeout(advance, autoPlayInterval * 1000);
        });
      }
      return;
    }

    // 画像 / YouTube・Vimeo 埋込: 固定秒で送る
    timerRef.current = setTimeout(advance, autoPlayInterval * 1000);
  });

  useEffect(() => {
    scheduleActive();
    return clearTimer;
    // activeIndex 変化で再スケジュール
  }, [activeIndex, hasMultiple, autoPlayInterval]);

  // アンマウント時の GSAP cleanup（Pattern C 要件）
  useEffect(() => {
    const layers = layerRefs.current;
    return () => {
      for (const el of layers) {
        if (el) {
          gsap.killTweensOf(el);
          if (el.firstElementChild) gsap.killTweensOf(el.firstElementChild);
        }
      }
    };
  }, []);

  // ken-burns の初期スライド（最初の画像）のズーム開始（タイマー駆動は mount 時発火しないため）
  useGSAP(
    () => {
      if (transition !== "ken-burns" || !hasMultiple) return;
      if (kinds[0] !== "image") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const img = layerRefs.current[0]?.firstElementChild;
        if (img) {
          gsap.fromTo(
            img,
            { scale: 1, x: "0%", y: "0%" },
            {
              scale: 1.08,
              x: "2%",
              y: "1%",
              duration: autoPlayInterval,
              ease: EASE.none,
            },
          );
        }
      });
    },
    {
      scope: containerRef,
      dependencies: [transition, hasMultiple, autoPlayInterval],
    },
  );

  const handleVideoEnded = (index: number) => {
    if (index === activeIndexRef.current) advance();
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
      {items.map((item, i) => {
        const kind = kinds[i];
        const isFirst = i === 0;
        return (
          <div
            key={item.url}
            ref={(el) => {
              layerRefs.current[i] = el;
            }}
            className="absolute inset-0"
            style={{ opacity: isFirst ? 1 : 0 }}
          >
            {kind === "image" ? (
              <Image
                src={item.url}
                alt={i === activeIndex ? item.alt : ""}
                fill
                sizes={sizes}
                className="object-cover"
                priority={priority && isFirst}
              />
            ) : (
              <VideoPlayer
                url={item.url}
                variant="background"
                loop={kind === "video-embed" ? true : !hasMultiple}
                {...(kind === "video-file" && {
                  videoRef: (el: HTMLVideoElement | null) => {
                    videoRefs.current[i] = el;
                  },
                  onEnded: () => handleVideoEnded(i),
                })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック + lint**

Run: `bun run validate 2>&1 | grep -iE "hero-background-slideshow" | head`
Expected: 出力なし（エラーなし）

- [ ] **Step 3: コミット**

```bash
git add "src/app/(public)/_shared/components/page-hero/hero-background-slideshow.tsx"
git commit -m "feat(hero): 背景スライドショー共有コンポーネントを追加"
```

---

### Task 6: StandardHeroSection を配列 + スライドショーに配線

**Files:**

- Modify: `src/app/(public)/_components/StandardHeroSection.tsx`

- [ ] **Step 1: import を追加**

`StandardHeroSection.tsx` の import 群に追加:

```ts
import { HeroBackgroundSlideshow } from "@/public/components/page-hero/hero-background-slideshow";
```

（`@/public/components/page-hero/` は `src/app/(public)/_shared/components/page-hero/` の alias。既存 import で確認すること。`MediaHero` 等と同じ alias を使う）

- [ ] **Step 2: backgroundMedia 参照を配列前提に書き換え**

`const mediaUrl = config.backgroundMedia.url;` 付近（124-126 行）を以下に置換:

```ts
const mediaItems = config.backgroundMedia;
const hasMedia = mediaItems.length > 0;
const isSingleImage =
  mediaItems.length === 1 &&
  mediaItems[0] !== undefined &&
  detectMediaSourceType(mediaItems[0].url) === "image";
const firstItem = mediaItems[0];
```

`const mediaType = hasMedia ? detectMediaSourceType(mediaUrl) : "image";` は削除する（上記に統合）。

parallax 分岐の `if (variant !== "parallax" || mediaType !== "image") return;`（158 行付近）を以下に置換（単一画像のときのみ scrub）:

```ts
if (variant !== "parallax" || !isSingleImage) return;
```

- [ ] **Step 3: split variant のメディア描画を置換**

split variant の `{hasMedia && (...)}`（314-331 行付近）内の中身を以下に置換:

```tsx
{
  hasMedia && (
    <div className="relative flex-1">
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <HeroBackgroundSlideshow
          items={mediaItems}
          transition={config.transition}
          autoPlayInterval={config.autoPlayInterval}
          sizes="50vw"
          priority
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: default/parallax の全面背景描画を置換**

default/parallax variant の背景描画ブロック（350-369 行付近、`{hasMedia && (mediaType === "video" ? ... : ...)}`）を以下に置換:

```tsx
{
  /* Background media: 単一画像 + parallax は scrub、それ以外はスライドショー */
}
{
  hasMedia &&
    (variant === "parallax" && isSingleImage && firstItem ? (
      <div className="absolute inset-0">
        <div ref={imageRef} className="relative h-full w-full">
          <Image
            src={firstItem.url}
            alt={firstItem.alt}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      </div>
    ) : (
      <HeroBackgroundSlideshow
        items={mediaItems}
        transition={config.transition}
        autoPlayInterval={config.autoPlayInterval}
        sizes="100vw"
        priority
      />
    ));
}
```

- [ ] **Step 5: 型チェック + lint + build**

Run: `bun run validate 2>&1 | grep -iE "StandardHeroSection" | head`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add "src/app/(public)/_components/StandardHeroSection.tsx"
git commit -m "feat(hero): StandardHeroSection を背景スライドショーに配線"
```

---

### Task 7: MediaHero（page-hero media variant）を配線

**Files:**

- Modify: `src/app/(public)/_shared/components/page-hero/MediaHero.tsx`

- [ ] **Step 1: import を追加し media 参照を配列前提に書き換え**

`MediaHero.tsx` の import に追加:

```ts
import { HeroBackgroundSlideshow } from "./hero-background-slideshow";
```

`detectMediaSourceType` の import は背景描画から不要になるが、`posterImage` 判定では使わないため削除してよい（lint で未使用検出される場合は削除）。

`MediaHeroProps` は変更不要（`media` は `PageHeroConfig` の `media` variant 由来で自動的に配列型になる）。

本体冒頭の派生値（55-57 行付近）を以下に置換:

```ts
const hasMedia = media.length > 0;
const hasPoster = posterImage.url.length > 0;
const hasLabel = label.length > 0;
const hasTitle = title.length > 0;
const hasDescription = description.length > 0;
const hasButtons = buttons.length > 0;
```

- [ ] **Step 2: 背景描画ブロックを置換**

`{/* Background: video > image > poster image > solid foreground fallback */}` から始まる三項ブロック（93-136 行付近）全体を以下に置換:

```tsx
{
  /* Background: メディアあればスライドショー、なければ poster / solid fallback */
}
{
  hasMedia ? (
    <HeroBackgroundSlideshow
      items={media}
      transition={transition}
      autoPlayInterval={autoPlayInterval}
      sizes="100vw"
      priority
    />
  ) : hasPoster ? (
    <div className="absolute inset-0">
      <Image
        src={posterImage.url}
        alt={posterImage.alt}
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
    </div>
  ) : null;
}
```

- [ ] **Step 3: 分割代入に transition / autoPlayInterval を追加**

`MediaHero` の props 分割代入（42-51 行付近）に `transition` と `autoPlayInterval` を追加:

```tsx
export function MediaHero({
  label,
  title,
  description,
  media,
  transition,
  autoPlayInterval,
  posterImage,
  overlay,
  overlayOpacity,
  buttons,
}: MediaHeroProps): ReactElement {
```

- [ ] **Step 4: 型チェック + lint + build**

Run: `bun run validate && bun run build 2>&1 | tail -20`
Expected: exit 0、build 成功

- [ ] **Step 5: コミット**

```bash
git add "src/app/(public)/_shared/components/page-hero/MediaHero.tsx"
git commit -m "feat(page-hero): MediaHero を背景スライドショーに配線"
```

---

### Task 8: 既存 DB データの移行スクリプト

**Files:**

- Create: `scripts/migrate-hero-background-media-to-array.ts`
- Test: `__tests__/unit/scripts/migrate-hero-background-media.test.ts` (Create — 純粋変換関数のみ)

> **設計:** 変換ロジックを純粋関数 `toMediaArray(value): unknown[]` に切り出し、unit test する。スクリプト本体（DB I/O）は `backfill-oauth-token-encryption.ts` の bootstrap を踏襲し `--dry-run` 対応。

- [ ] **Step 1: 純粋変換関数のテストを書く**

Create `__tests__/unit/scripts/migrate-hero-background-media.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { toMediaArray } from "@/shared/lib/sections/migrations/media-array";

describe("toMediaArray", () => {
  test("単一オブジェクト { url, alt, caption } を配列に変換", () => {
    expect(
      toMediaArray({ url: "https://x/a.jpg", alt: "A", caption: "C" }),
    ).toEqual([{ url: "https://x/a.jpg", alt: "A", caption: "C" }]);
  });

  test("url 空のオブジェクトは [] に変換", () => {
    expect(toMediaArray({ url: "", alt: "", caption: "" })).toEqual([]);
  });

  test("url 不在のオブジェクトは [] に変換", () => {
    expect(toMediaArray({})).toEqual([]);
  });

  test("既に配列なら no-op（冪等）", () => {
    const arr = [{ url: "https://x/a.jpg", alt: "A", caption: "" }];
    expect(toMediaArray(arr)).toEqual(arr);
  });

  test("null / undefined は []", () => {
    expect(toMediaArray(null)).toEqual([]);
    expect(toMediaArray(undefined)).toEqual([]);
  });

  test("alt / caption 欠落は空文字で補完", () => {
    expect(toMediaArray({ url: "https://x/a.jpg" })).toEqual([
      { url: "https://x/a.jpg", alt: "", caption: "" },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/scripts/migrate-hero-background-media.test.ts`
Expected: FAIL（`media-array` モジュール未作成）

- [ ] **Step 3: 純粋変換関数を実装**

Create `src/shared/lib/sections/migrations/media-array.ts`:

```ts
/**
 * 旧形式の単一メディア group `{ url, alt, caption }` を配列形式に正規化する純粋関数。
 *
 * hero / page-hero の背景メディアを単一 → 配列にクリーンブレイクした際の
 * 一度きり DB 移行（`scripts/migrate-hero-background-media-to-array.ts`）で使う。
 * コード（schema）側には互換シムを持たないため、この変換は移行スクリプト専用。
 */

import { isRecord } from "@/shared/lib/serialize";

interface MediaItem {
  url: string;
  alt: string;
  caption: string;
}

export function toMediaArray(value: unknown): MediaItem[] {
  if (Array.isArray(value)) return value as MediaItem[];
  if (!isRecord(value)) return [];

  const url = typeof value["url"] === "string" ? value["url"] : "";
  if (url.length === 0) return [];

  const alt = typeof value["alt"] === "string" ? value["alt"] : "";
  const caption = typeof value["caption"] === "string" ? value["caption"] : "";
  return [{ url, alt, caption }];
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/scripts/migrate-hero-background-media.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: 移行スクリプト本体を実装**

Create `scripts/migrate-hero-background-media-to-array.ts`:

```ts
/**
 * hero / page-hero 背景メディア 単一 → 配列 移行スクリプト（一度きり・冪等）
 *
 * `Section.config` JSON の以下を単一オブジェクト → 配列に変換する:
 *   - type = "hero"      の `backgroundMedia`
 *   - type = "page-hero" (variant = "media") の `media`
 *
 * 使用方法:
 *   bun scripts/migrate-hero-background-media-to-array.ts            # 実移行
 *   bun scripts/migrate-hero-background-media-to-array.ts --dry-run  # 集計のみ（書込なし）
 *
 * 冪等: 既に配列の config は skip する。
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { isRecord } from "@/shared/lib/serialize";
import { toMediaArray } from "@/shared/lib/sections/migrations/media-array";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("❌ DATABASE_URL が設定されていません");
  process.exit(1);
}

const isDryRun = process.argv.slice(2).includes("--dry-run");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

/** type に応じた背景メディアフィールド名 */
function mediaKey(type: string): "backgroundMedia" | "media" | null {
  if (type === "hero") return "backgroundMedia";
  if (type === "page-hero") return "media";
  return null;
}

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: { in: ["hero", "page-hero"] } },
    select: { id: true, type: true, config: true },
  });

  let converted = 0;
  let skipped = 0;

  for (const section of sections) {
    const key = mediaKey(section.type);
    if (key === null) continue;
    if (!isRecord(section.config)) {
      skipped++;
      continue;
    }

    const current = section.config[key];
    // page-hero は variant=media のときのみ media を持つ
    if (current === undefined) {
      skipped++;
      continue;
    }
    if (Array.isArray(current)) {
      skipped++;
      continue; // 冪等
    }

    const nextValue = toMediaArray(current);
    const nextConfig = { ...section.config, [key]: nextValue };

    console.log(
      `${isDryRun ? "[dry-run] " : ""}convert section ${section.id} (${section.type}.${key}) → ${nextValue.length} item(s)`,
    );

    if (!isDryRun) {
      await prisma.section.update({
        where: { id: section.id },
        data: { config: nextConfig },
      });
    }
    converted++;
  }

  console.log(
    `\n${isDryRun ? "[dry-run] " : ""}done: ${converted} converted, ${skipped} skipped (already array / no media)`,
  );
  await prisma.$disconnect();
}

void main();
```

- [ ] **Step 6: 型チェック + dry-run（ローカル DB 接続時のみ）**

Run: `bun run type-check 2>&1 | grep -iE "migrate-hero|media-array" | head`
Expected: 出力なし

（ローカル DB がある場合のみ）Run: `bun scripts/migrate-hero-background-media-to-array.ts --dry-run`
Expected: 対象 section の変換プレビューが出力され、DB は書き換わらない

- [ ] **Step 7: コミット**

```bash
git add scripts/migrate-hero-background-media-to-array.ts src/shared/lib/sections/migrations/media-array.ts __tests__/unit/scripts/migrate-hero-background-media.test.ts
git commit -m "feat(hero): 背景メディア 単一→配列 の冪等移行スクリプトを追加"
```

---

### Task 9: 既存テスト追従 + 全体検証

**Files:**

- 既存テストの fixture drift 修正（必要時）

- [ ] **Step 1: 既存セクション関連テストの drift を確認**

Run: `bun run test:unit 2>&1 | tail -15`
Expected: `done: X passed, 0 failed`。fail があれば内容を確認。

特に確認すべき既存テスト:

- `__tests__/integration/sections/hero-video-migration.test.ts` — 旧 `backgroundMedia` 単一 group 前提なら配列前提に更新が必要
- `__tests__/integration/sections/page-defaults.test.ts` — hero / page-hero の default が `backgroundMedia: []` / `media: []` になることに追従
- `__tests__/unit/domain/sections/registry.test.ts` — セクション数 22 不変（変更不要のはず）

- [ ] **Step 2: drift があれば fixture を schema に追従させる**

`hero-video-migration.test.ts` / `page-defaults.test.ts` で `backgroundMedia` / `media` を単一オブジェクトで期待している箇所を配列 `[]` または `[{...}]` に更新する。**schema 側は変更しない**（fixture 側のみ追従、test-quality fixture drift 規律）。

- [ ] **Step 3: integration テストも全走**

Run: `bun run test:integration 2>&1 | tail -15`
Expected: `done: X passed, 0 failed`

- [ ] **Step 4: 最終検証（validate + build）**

Run: `bun run validate && bun run build 2>&1 | tail -25`
Expected: exit 0、ビルド成功（全ルート生成）

- [ ] **Step 5: コミット（drift 修正があれば）**

```bash
git add __tests__/
git commit -m "test(sections): 背景メディア配列化に伴う fixture 追従"
```

---

## デプロイ後の運用手順（PR merge とは別）

- デプロイ後に既存 DB を移行: `bun scripts/migrate-hero-background-media-to-array.ts --dry-run` で対象確認 → `bun scripts/migrate-hero-background-media-to-array.ts` で実行（冪等のため複数回実行可）。`Section.config` は `Json` 列のため Prisma migration は不要。

## 動作確認（手動 / dev server）

- `/admin/pages/<slug>/edit` で hero セクションの「背景メディア」に複数の画像/動画を追加 → add/remove UI が自動描画されることを確認
- 公開ページで複数背景がクロスフェードで自動切替し、R2 動画は再生完了で次へ進むことを確認
- 「切り替え演出」を ken-burns にして画像のズームを確認
- OS の「視差効果を減らす」を ON にして自動送りが止まり先頭のみ表示されることを確認
