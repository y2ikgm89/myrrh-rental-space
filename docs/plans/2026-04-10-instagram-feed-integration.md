# Instagram フィード公開表示 + 同期 cron 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の Instagram 管理画面基盤（トークン管理、OAuth、API クライアント）を活かし、公開ページでの実データ表示とフィード同期 cron を完成させる

**Architecture:** バックエンド（Graph API クライアント、ドメイン commands/queries、管理画面 UI、トークンリフレッシュ cron）は実装済み。残りは: (1) フィード同期 cron、(2) 公開 InstagramSection の実データ化、(3) CSP/remotePatterns

**Tech Stack:** Next.js 16, Instagram Graph API, Prisma 7, `'use cache'`

**Status:** 実装中

---

## 既存実装（変更不要）

- `src/shared/lib/instagram/index.ts` — Graph API クライアント（`fetchInstagramFeed`, `testInstagramConnection`, `refreshLongLivedToken` 等）
- `src/shared/domain/instagram/commands.ts` — `saveInstagramToken`, `disconnectInstagram`, `addInstagramPost`, `removeInstagramPost`, `reorderInstagramPosts`
- `src/shared/domain/instagram/queries.ts` — `getInstagramConfig`, `getInstagramPosts`, `getDecryptedInstagramToken`
- `src/shared/domain/instagram/types.ts` — `InstagramConfig`, `InstagramPostData`
- `src/app/(admin)/.../actions/instagram.ts` — Server Actions
- `src/app/(admin)/.../settings/_components/sections/InstagramSection.tsx` — 管理画面 UI
- `src/app/api/cron/instagram-refresh/route.ts` — トークンリフレッシュ cron
- `src/app/api/instagram/oauth/` — OAuth authorize + callback
- `src/shared/lib/constants/cache.ts` — `CACHE_TAGS.INSTAGRAM_FEED` 定義済み

---

### Task 1: フィード同期 cron（`/api/cron/instagram-sync`）

**Files:**

- Create: `src/app/api/cron/instagram-sync/route.ts`
- Modify: `src/shared/domain/instagram/commands.ts` — `syncInstagramFeed` 追加

- [ ] **Step 1: `syncInstagramFeed` コマンド追加**

`src/shared/domain/instagram/commands.ts` 末尾に追加:

```typescript
import type { InstagramMediaItem } from "@/shared/lib/instagram";

export async function syncInstagramFeed(
  items: InstagramMediaItem[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.instagramPost.deleteMany({});
    if (items.length === 0) return;

    await tx.instagramPost.createMany({
      data: items.map((item, index) => ({
        postId: item.id,
        postUrl: item.permalink,
        mediaUrl: item.mediaUrl,
        caption: item.caption ?? null,
        mediaType:
          item.mediaType === "IMAGE"
            ? InstagramMediaType.IMAGE
            : item.mediaType === "VIDEO"
              ? InstagramMediaType.VIDEO
              : InstagramMediaType.CAROUSEL_ALBUM,
        permalink: item.permalink,
        thumbnailUrl: item.thumbnailUrl ?? null,
        sortOrder: index,
      })),
    });
  });
}
```

- [ ] **Step 2: cron route 作成**

`src/app/api/cron/instagram-sync/route.ts`:

```typescript
import { revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { serverEnv } from "@/shared/lib/env/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { getDecryptedInstagramToken } from "@/shared/domain/instagram/queries";
import { syncInstagramFeed } from "@/shared/domain/instagram/commands";
import { fetchInstagramFeed } from "@/shared/lib/instagram";

export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "instagramFeedSync",
    });
    if (authResult) return authResult;

    const token = await getDecryptedInstagramToken();
    if (!token) {
      return jsonSuccess({ skipped: true, reason: "No Instagram token" });
    }

    const items = await fetchInstagramFeed(token, 12);
    await syncInstagramFeed(items);

    revalidateTag(CACHE_TAGS.INSTAGRAM_FEED, CACHE_LIFE.PUBLIC_CONTENT);

    return jsonSuccess({
      synced: items.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "instagramFeedSync" },
    });
    return jsonError("Instagram feed sync failed", 500);
  }
}
```

- [ ] **Step 3: type-check**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```
feat(instagram): add feed sync cron route
```

---

### Task 2: 公開 InstagramSection を実データ表示に書き換え

**Files:**

- Rewrite: `src/app/(public)/_components/InstagramSection.tsx`
- Modify: `src/app/(public)/_shared/components/sections/section-renderer.tsx`

- [ ] **Step 1: InstagramSection を Server Component に書き換え**

プレースホルダーを削除し、DB から投稿を取得して表示。`"use client"` を削除、GSAP を ScrollReveal のみに簡素化:

```typescript
/**
 * InstagramSection — Instagram フィード表示
 *
 * Server Component。DB にキャッシュされた投稿を表示。
 * 管理画面でトークン設定 + cron で自動同期。
 */

import type { ReactElement } from "react";
import Image from "next/image";
import { IconBrandInstagram, IconPlayerPlay } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { getGridColsClass, GAP_MAP } from "@/public/lib/section-style-maps";
import type { InstagramConfig } from "@/shared/lib/validations/section";
import { parseGapSize } from "@/shared/lib/validations/section-parsers";
import type { SectionDesign } from "@/shared/lib/validations/section-design";
import type { InstagramPostData } from "@/shared/domain/instagram/types";

interface InstagramSectionProps {
  readonly config: InstagramConfig;
  readonly design: SectionDesign;
  readonly posts: InstagramPostData[];
}

export function InstagramSection({
  config,
  design,
  posts,
}: InstagramSectionProps): ReactElement {
  const displayPosts = posts.slice(0, config.count);

  return (
    <SectionWrapper design={design}>
      <div className="mb-10 text-center md:mb-14">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>
        <div style={getTitleStyle(design)}>
          <Heading
            level={2}
            className={cn("mt-4 tracking-tight", getTitleClasses(design))}
          >
            {config.title}
          </Heading>
        </div>
      </div>

      {displayPosts.length > 0 ? (
        <div
          className={cn(
            "grid grid-cols-2",
            getGridColsClass(config.columns),
            GAP_MAP[parseGapSize(config.gap)],
          )}
        >
          {displayPosts.map((post, i) => (
            <ScrollReveal key={post.id} delay={i * 0.05}>
              <a
                href={post.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden bg-surface"
              >
                {post.mediaUrl ? (
                  <Image
                    src={post.mediaUrl}
                    alt={post.caption?.slice(0, 100) ?? "Instagram post"}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    className="object-cover transition-opacity duration-300 group-hover:opacity-85"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <IconBrandInstagram className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                {/* VIDEO overlay */}
                {post.mediaUrl && (post as Record<string, unknown>)["mediaType"] === "VIDEO" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <IconPlayerPlay className="h-10 w-10 text-background/80" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors duration-300 group-hover:bg-foreground/10">
                  <IconBrandInstagram className="h-6 w-6 text-background opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
              </a>
            </ScrollReveal>
          ))}
        </div>
      ) : (
        <ScrollReveal>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <IconBrandInstagram className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              投稿を準備中です
            </p>
          </div>
        </ScrollReveal>
      )}
    </SectionWrapper>
  );
}
```

- [ ] **Step 2: SectionRenderer で posts を渡す**

`section-renderer.tsx` の Instagram case を更新:

```typescript
// import 追加
import { getInstagramPosts } from "@/shared/domain/instagram/queries";

// case 更新
case SectionType.INSTAGRAM: {
  const config = getInstagramConfig(section.config);
  const posts = await getInstagramPosts();
  return <InstagramSection config={config} design={design} posts={posts} />;
}
```

- [ ] **Step 3: type-check**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```
feat(instagram): replace placeholder with real feed display
```

---

### Task 3: CSP + remotePatterns に Instagram CDN 追加

**Files:**

- Modify: `src/proxy.ts` — `img-src` に Instagram CDN ドメイン追加
- Modify: `next.config.ts` — `remotePatterns` に Instagram CDN 追加

- [ ] **Step 1: proxy.ts の img-src 更新**

`img-src` に `https://*.cdninstagram.com https://*.fbcdn.net` を追加。

- [ ] **Step 2: next.config.ts の remotePatterns 更新**

```typescript
{
  protocol: "https",
  hostname: "*.cdninstagram.com",
},
{
  protocol: "https",
  hostname: "*.fbcdn.net",
},
```

- [ ] **Step 3: validate + build**

Run: `bun run validate && bun run build`

- [ ] **Step 4: Commit**

```
feat(instagram): add CDN domains to CSP and remotePatterns
```
