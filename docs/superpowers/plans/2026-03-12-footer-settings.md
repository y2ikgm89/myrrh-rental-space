# フッター設定の管理画面化 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開フッターのハードコードテキスト・SNSリンク・themeColor を管理画面から設定可能にする

**Architecture:** Settings singleton テーブルにフッター設定フィールドを追加。既存の `getHeaderSettings` / `updateHeaderSettings` パターンを踏襲し、`getFooterSettings` / `updateFooterSettings` で対称的に実装。SNSリンクは既存 `SocialLink` モデル + `getSocialLinks()` クエリをフッターに統合。`themeColor` は `viewport` の static export → `generateViewport()` に変更してDB値を動的に反映。

**Tech Stack:** Prisma 7.4 / Next.js 16.1 (generateViewport) / Zod 4.3 (`{ error: }`) / React 19.2

---

## File Structure

### 新規作成ファイル

| ファイル                                                                            | 責務                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/FooterSection.tsx` | フッター設定 管理UI（Client Component） |
| `src/app/(public)/_shared/components/layouts/SocialLinks.tsx`                       | SNSアイコンリスト（Server Component）   |

### 変更ファイル

| ファイル                                                                   | 変更内容                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `prisma/schema.prisma`                                                     | Settings モデルにフッター設定フィールド追加             |
| `src/shared/domain/settings/queries.ts`                                    | `getFooterSettings()` クエリ追加                        |
| `src/shared/domain/settings/commands.ts`                                   | `updateFooterSettings()` コマンド追加                   |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas.ts`    | `footerSettingsSchema` 追加                             |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`      | `updateFooterSettings` Server Action 追加               |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`      | barrel export 追加                                      |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts` | `FooterSection` export 追加                             |
| `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx`                 | レイアウトタブに `FooterSection` 追加                   |
| `src/app/(public)/_shared/components/layouts/Footer.tsx`                   | DB設定値を使用、SNSリンク統合                           |
| `src/app/(public)/layout.tsx`                                              | `viewport` → `generateViewport()` + `getFooterSettings` |
| `src/shared/domain/settings/queries.ts`                                    | `getSocialLinksForFooter()` 追加（platform付き）        |

---

## Chunk 1: DB スキーマ + ドメイン層

### Task 1: Prisma スキーマにフッター設定フィールド追加

**Files:**

- Modify: `prisma/schema.prisma` (Settings モデル、`headerScrollBehavior` 付近)

- [ ] **Step 1: schema.prisma にフィールド追加**

`headerBackgroundMode` の直後に以下を追加:

```prisma
  // Footer Settings
  footerTagline           String?   // ブランド説明文（null = デフォルト使用）
  footerNavigationLabel   String    @default("Navigation")
  footerContactLabel      String    @default("Contact")
  footerHoursLabel        String    @default("Hours")
  footerShowSocialLinks   Boolean   @default(true)

  // Theme
  themeColor              String    @default("#fafafa")
```

- [ ] **Step 2: マイグレーション実行**

```bash
bunx --bun prisma migrate dev --name add_footer_settings_and_theme_color
```

Expected: Migration created and applied successfully

- [ ] **Step 3: Prisma Client 再生成確認**

```bash
bun run db:generate
```

- [ ] **Step 4: 型チェック**

```bash
bun run type-check
```

Expected: PASS（新フィールドはデフォルト値ありのため既存コードに影響なし）

- [ ] **Step 5: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add footer settings and themeColor to Settings model"
```

---

### Task 2: ドメインクエリ — getFooterSettings + getSocialLinksForFooter

**Files:**

- Modify: `src/shared/domain/settings/queries.ts`

- [ ] **Step 1: FooterSettings インターフェース + getFooterSettings クエリ追加**

`getHeaderSettings()` の直後に追加。パターンは `getHeaderSettings` と完全一致:

```typescript
export interface FooterSettings {
  tagline: string | null;
  navigationLabel: string;
  contactLabel: string;
  hoursLabel: string;
  showSocialLinks: boolean;
  themeColor: string;
}

export async function getFooterSettings(): Promise<FooterSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          footerTagline: true,
          footerNavigationLabel: true,
          footerContactLabel: true,
          footerHoursLabel: true,
          footerShowSocialLinks: true,
          themeColor: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getFooterSettings",
  });

  return {
    tagline: result?.footerTagline ?? null,
    navigationLabel: result?.footerNavigationLabel ?? "Navigation",
    contactLabel: result?.footerContactLabel ?? "Contact",
    hoursLabel: result?.footerHoursLabel ?? "Hours",
    showSocialLinks: result?.footerShowSocialLinks ?? true,
    themeColor: result?.themeColor ?? "#fafafa",
  };
}
```

- [ ] **Step 2: getSocialLinksForFooter クエリ追加**

既存の `getSocialLinkUrls()` はURLのみ返すため、platform情報付きの新クエリを追加:

```typescript
export interface SocialLinkForFooter {
  platform: string;
  url: string;
}

export async function getSocialLinksForFooter(): Promise<
  SocialLinkForFooter[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SOCIAL_LINKS, CACHE_TAGS.SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.socialLink.findMany({
        where: { isActive: true },
        select: { platform: true, url: true },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSocialLinksForFooter",
  });

  return result.map((link) => ({
    platform: link.platform,
    url: link.url,
  }));
}
```

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/settings/queries.ts
git commit -m "feat(domain): add getFooterSettings and getSocialLinksForFooter queries"
```

---

### Task 3: ドメインコマンド — updateFooterSettings

**Files:**

- Modify: `src/shared/domain/settings/commands.ts`

- [ ] **Step 1: FooterSettingsInput 型 + updateFooterSettings コマンド追加**

`updateHeaderSettings` の直後に追加:

```typescript
export type FooterSettingsInput = {
  footerTagline: string | null;
  footerNavigationLabel: string;
  footerContactLabel: string;
  footerHoursLabel: string;
  footerShowSocialLinks: boolean;
  themeColor: string;
};

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/shared/domain/settings/commands.ts
git commit -m "feat(domain): add updateFooterSettings command"
```

---

### Task 4: SettingsData 型に新フィールド追加（管理画面クエリ）

**Files:**

- Modify: `src/shared/domain/settings/types.ts`

**背景**: `getAdminSettings()` → `getOrCreateSettings()` は `prisma.settings.upsert()` を `select` なしで実行し全カラムを返す。`toSettingsData()` は `...settings` スプレッドで新フィールドを自動伝播するため、必要な作業は **`SettingsData` 型への追加のみ**。

- [ ] **Step 1: SettingsData 型に新フィールド追加**

`src/shared/domain/settings/types.ts` の `SettingsData` 型に追加:

```typescript
// Footer Settings
footerTagline: string | null;
footerNavigationLabel: string;
footerContactLabel: string;
footerHoursLabel: string;
footerShowSocialLinks: boolean;
themeColor: string;
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/shared/domain/settings/types.ts
git commit -m "feat(admin): add footer settings fields to SettingsData type"
```

---

## Chunk 2: Server Action + 管理画面 UI

### Task 5: Zod スキーマ + Server Action

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`

- [ ] **Step 1: schemas.ts に footerSettingsSchema 追加**

`headerSettingsSchema` の直後に追加:

```typescript
export const footerSettingsSchema = z.object({
  footerTagline: z
    .string()
    .max(200, { error: "200文字以内で入力してください" })
    .nullable(),
  footerNavigationLabel: z
    .string()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerContactLabel: z
    .string()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerHoursLabel: z
    .string()
    .min(1, { error: "必須です" })
    .max(50, { error: "50文字以内で入力してください" }),
  footerShowSocialLinks: z.boolean(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
    error: "有効なHEXカラーコードを入力してください",
  }),
});

export type FooterSettingsInput = z.infer<typeof footerSettingsSchema>;
```

- [ ] **Step 2: other.ts に updateFooterSettings Server Action 追加**

import に `footerSettingsSchema` と `updateFooterSettings as updateFooterSettingsCommand` を追加:

```typescript
import {
  // ...existing imports...
  updateFooterSettings as updateFooterSettingsCommand,
} from "@/shared/domain/settings/commands";

// import追加
import {
  // ...existing...
  footerSettingsSchema,
} from "./schemas";
import type { FooterSettingsInput } from "./schemas";

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<MutationResult> {
  const parsed = footerSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateFooterSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateLayoutCache,
  });
}
```

- [ ] **Step 3: index.ts の barrel export 更新**

`Other Actions` セクションの export リストに追加:

```typescript
export {
  // ...existing...
  updateFooterSettings,
} from "./other";
```

`Schemas` セクションにも追加:

```typescript
export type {
  // ...existing...
  FooterSettingsInput,
} from "./schemas";
```

- [ ] **Step 4: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/'
git commit -m "feat(admin): add updateFooterSettings server action with Zod schema"
```

---

### Task 6: 管理画面 FooterSection コンポーネント

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/FooterSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx`

- [ ] **Step 1: FooterSection.tsx 作成**

`HeaderSection.tsx` のパターンを踏襲:

```typescript
"use client";

/**
 * フッター設定セクション
 *
 * フッターの表示テキスト・SNSリンク表示・テーマカラーを設定
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { updateFooterSettings } from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

interface FooterSectionProps {
  settings: {
    footerTagline: string | null;
    footerNavigationLabel: string;
    footerContactLabel: string;
    footerHoursLabel: string;
    footerShowSocialLinks: boolean;
    themeColor: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_TAGLINE = "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。";

// =============================================================================
// Component
// =============================================================================

export function FooterSection({ settings }: FooterSectionProps) {
  const [isPending, startTransition] = useTransition();

  const [tagline, setTagline] = useState(settings.footerTagline ?? "");
  const [navigationLabel, setNavigationLabel] = useState(settings.footerNavigationLabel);
  const [contactLabel, setContactLabel] = useState(settings.footerContactLabel);
  const [hoursLabel, setHoursLabel] = useState(settings.footerHoursLabel);
  const [showSocialLinks, setShowSocialLinks] = useState(settings.footerShowSocialLinks);
  const [themeColor, setThemeColor] = useState(settings.themeColor);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateFooterSettings({
        footerTagline: tagline.trim() || null,
        footerNavigationLabel: navigationLabel,
        footerContactLabel: contactLabel,
        footerHoursLabel: hoursLabel,
        footerShowSocialLinks: showSocialLinks,
        themeColor,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("フッター設定を保存しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>フッター設定</CardTitle>
        <CardDescription>
          フッターの表示テキスト、SNSリンク表示、ブラウザテーマカラーを設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="footer-tagline">ブランド説明文</Label>
          <Textarea
            id="footer-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder={DEFAULT_TAGLINE}
            rows={3}
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            空欄の場合はデフォルトの説明文が表示されます
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="footer-nav-label">ナビゲーション見出し</Label>
            <Input
              id="footer-nav-label"
              value={navigationLabel}
              onChange={(e) => setNavigationLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-contact-label">連絡先見出し</Label>
            <Input
              id="footer-contact-label"
              value={contactLabel}
              onChange={(e) => setContactLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-hours-label">営業時間見出し</Label>
            <Input
              id="footer-hours-label"
              value={hoursLabel}
              onChange={(e) => setHoursLabel(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="footer-social-links">SNSリンクを表示</Label>
            <p className="text-xs text-muted-foreground">
              ナビゲーション設定で登録したSNSリンクをフッターに表示します
            </p>
          </div>
          <Switch
            id="footer-social-links"
            checked={showSocialLinks}
            onCheckedChange={setShowSocialLinks}
          />
        </div>

        <div className="space-y-3">
          <Label htmlFor="footer-theme-color">ブラウザテーマカラー</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="footer-theme-color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-input"
            />
            <Input
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#fafafa"
              className="max-w-[10rem]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            モバイルブラウザのアドレスバーの色に反映されます
          </p>
        </div>

        <SubmitButton isPending={isPending} onClick={handleSave} label="保存" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: sections/index.ts に FooterSection export 追加**

`HeaderSection` の直後に追加:

```typescript
export { FooterSection } from "./FooterSection";
```

- [ ] **Step 3: site/page.tsx のレイアウトタブに FooterSection 追加**

import に `FooterSection` を追加し、レイアウトタブの `HeaderSection` の直後に配置:

```typescript
import {
  // ...existing...
  FooterSection,
} from "../_components/sections";

// tabs 配列の layout タブ内:
{
  value: "layout",
  label: "レイアウト",
  content: (
    <div className="space-y-6">
      <HeaderSection settings={settings} />
      <FooterSection settings={settings} />
      <SidebarSection settings={settings} />
      <LayoutSection settings={settings} />
    </div>
  ),
},
```

- [ ] **Step 4: 型チェック**

```bash
bun run type-check
```

**注意**: `settings` オブジェクトに新しいフィールドが必要。`getSettings()` が返す `SettingsData` 型に `footerTagline` 等が含まれているか確認し、必要なら `admin-queries.ts` の select に追加する。

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/settings/'
git commit -m "feat(admin): add FooterSection to site settings layout tab"
```

---

## Chunk 3: 公開ページ統合

### Task 7: SNSリンクコンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/SocialLinks.tsx`

- [ ] **Step 1: SocialLinks.tsx 作成**

プラットフォーム別のSVGアイコンを表示する Server Component:

```typescript
import type { ReactElement } from "react";
import type { SocialLinkForFooter } from "@/shared/domain/settings/queries";

// =============================================================================
// Platform Icons（SVG inline — Lucide にないブランドアイコン）
// =============================================================================

const PLATFORM_ICONS: Record<string, (props: { className?: string }) => ReactElement> = {
  TWITTER: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  FACEBOOK: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
    </svg>
  ),
  INSTAGRAM: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  ),
  YOUTUBE: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  LINE: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  ),
  TIKTOK: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
};

const PLATFORM_LABELS: Record<string, string> = {
  TWITTER: "X (Twitter)",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  LINE: "LINE",
  TIKTOK: "TikTok",
  OTHER: "外部サイト",
};

// =============================================================================
// Component
// =============================================================================

interface SocialLinksProps {
  links: SocialLinkForFooter[];
}

export function SocialLinks({ links }: SocialLinksProps): ReactElement | null {
  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {links.map((link) => {
        const Icon = PLATFORM_ICONS[link.platform];
        const label = PLATFORM_LABELS[link.platform] ?? link.platform;

        return (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={label}
          >
            {Icon ? (
              <Icon className="h-5 w-5" />
            ) : (
              <span className="text-xs">{label}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/layouts/SocialLinks.tsx'
git commit -m "feat(public): add SocialLinks component with platform icons"
```

---

### Task 8: Footer.tsx をDB設定値に移行

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/Footer.tsx`

- [ ] **Step 1: import 追加 + データ取得を拡張**

```typescript
// 追加 import
import {
  getFooterSettings,
  getSocialLinksForFooter,
} from "@/shared/domain/settings/queries";
import { SocialLinks } from "./SocialLinks";
```

`Footer()` 関数内のデータ取得を更新:

```typescript
export async function Footer(): Promise<ReactElement> {
  const [info, footerNav, footerSettings, socialLinks] = await Promise.all([
    getBusinessInfo(),
    getFooterNavigation(),
    getFooterSettings(),
    getSocialLinksForFooter(),
  ]);
  const brandShort = (info.name.split(" ")[0] ?? "MYRRH").toUpperCase();
  const hoursDisplay = parseFooterHours(info.businessHours);
```

- [ ] **Step 2: ハードコードテキストをDB値に置換**

タグライン:

```typescript
<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
  {(footerSettings.tagline ?? "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。")
    .split("\n")
    .map((line, i) => (
      <span key={i}>
        {i > 0 && <br />}
        {line}
      </span>
    ))}
</p>
```

SNSリンク（タグライン直後）:

```typescript
{footerSettings.showSocialLinks && socialLinks.length > 0 && (
  <div className="mt-4">
    <SocialLinks links={socialLinks} />
  </div>
)}
```

セクション見出し（3箇所）:

```typescript
// Navigation セクション
<h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
  {footerSettings.navigationLabel}
</h3>

// Contact セクション
<h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
  {footerSettings.contactLabel}
</h3>

// Hours セクション
<span className="block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
  {footerSettings.hoursLabel}
</span>
```

- [ ] **Step 3: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/layouts/Footer.tsx'
git commit -m "feat(public): use DB settings for footer text and social links"
```

---

### Task 9: themeColor を動的に — generateViewport

**Files:**

- Modify: `src/app/(public)/layout.tsx`

- [ ] **Step 1: static viewport export → generateViewport に変更**

```typescript
// 削除:
// export const viewport: Viewport = {
//   width: "device-width",
//   initialScale: 1,
//   themeColor: "#fafafa",
// };

// 追加:
import {
  getFooterSettings,
  type FooterSettings,
} from "@/shared/domain/settings/queries";

export async function generateViewport(): Promise<Viewport> {
  const footerSettings = await getFooterSettings();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: footerSettings.themeColor,
  };
}
```

**注意**: `generateViewport` は async 関数のため動的レンダリングを引き起こすが、`getFooterSettings()` 内部の `"use cache"` により実質的にはキャッシュからの読み取りとなる。layout.tsx 自体は既に `getHeaderSettings()` / `getMaintenanceSettings()` で動的データにアクセスしており、既に動的ルート。ビルド時に `Static` → `Dynamic` への変更が出る可能性があるため、`bun run build` の出力で確認すること。

- [ ] **Step 2: import 整理**

`getFooterSettings` の import が `getHeaderSettings` と同じモジュールから来るため、既存の import 文にマージ:

```typescript
import {
  getHeaderSettings,
  getFooterSettings,
  type HeaderSettings,
} from "@/shared/domain/settings/queries";
```

- [ ] **Step 3: 型チェック + ビルド**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/layout.tsx'
git commit -m "feat(public): dynamic themeColor via generateViewport with DB settings"
```

---

## Chunk 4: 検証

### Task 10: 全体検証

**Files:** なし（検証のみ）

- [ ] **Step 1: validate**

```bash
bun run validate
```

Expected: PASS

- [ ] **Step 2: build**

```bash
bun run build
```

Expected: PASS

- [ ] **Step 3: 動作確認（dev server）**

1. `bun dev` で開発サーバー起動
2. `/admin/settings/site` → レイアウトタブ → フッター設定セクションを確認
3. タグラインを変更して保存 → 公開ページのフッターに反映されるか確認
4. SNSリンク表示トグルの動作確認
5. themeColor 変更 → `<meta name="theme-color">` が更新されるか確認

- [ ] **Step 4: 最終コミット（lint fix 等があれば）**

```bash
bun run validate && bun run build
```
