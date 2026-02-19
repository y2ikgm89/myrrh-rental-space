# コード品質リファクタリング 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 破壊的変更を伴うクリーンリファクタリング — `SectionEditor.tsx`（3,222行）分割・`google-calendar` Actions の `ActionResult` 統一・`reservation.ts` 分割・`google-calendar` lib 分割

**Architecture:**

- `SectionEditor.tsx` → 17 セクションフォームコンポーネント + 1 フック（各ファイル ~200 行）
- `google-calendar.ts` Actions → 全 5 関数を `ActionResult<TData>` 型に統一、`checkWritePermission` を `withPermission` HOF に置換
- `reservation.ts` → `reservation/queries.ts` / `mutations.ts` / `admin.ts` + barrel に分割
- `src/shared/lib/google-calendar.ts` → `google-calendar/` ディレクトリ（8 ファイル）に分割（外部 import パス変更なし）

**Tech Stack:** Next.js 16, React 19, TypeScript 6.0-beta, React Compiler 1.0, `withPermission` HOF, `ActionResult<TData>`, `createSuccess`/`createFailure`, Zod 4

---

## 事前確認コマンド

```bash
bun run validate
```

Expected: type-check + lint が通過していること

---

## Phase 1: google-calendar Actions — ActionResult 統一

### Task 1-1: `testGoogleCalendarConnectionAction` を `ActionResult` 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:119-178`

**変更内容:**

```typescript
// Before（直接オブジェクト返却）
export async function testGoogleCalendarConnectionAction(params: {
  serviceAccountJson: string;
  calendarId: string;
}): Promise<{
  success: boolean;
  error?: string;
  calendarName?: string;
  accountEmail?: string;
}>;

// After（ActionResult + withPermission）
export const testGoogleCalendarConnectionAction = withPermission<
  [params: { serviceAccountJson: string; calendarId: string }],
  { calendarName: string; accountEmail: string }
>(
  "settings",
  "update",
)(async (_user, params) => {
  if (!isValidCalendarId(params.calendarId)) {
    return createFailure("カレンダーIDの形式が無効です");
  }

  const result = await testServiceAccountConnection({
    serviceAccountJson: params.serviceAccountJson,
    calendarId: params.calendarId,
  });

  if (!result.success) {
    await prisma.settings.update({
      where: { id: "singleton" },
      data: { googleCalendarConnectionStatus: "error" },
    });
    return createFailure(result.error ?? "接続テストに失敗しました");
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarLastTestedAt: new Date(),
      googleCalendarConnectionStatus: "connected",
    },
    update: {
      googleCalendarLastTestedAt: new Date(),
      googleCalendarConnectionStatus: "connected",
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("接続テストに成功しました", {
    calendarName: result.calendarName ?? "",
    accountEmail: result.accountEmail ?? "",
  });
});
```

**Step 1:** google-calendar.ts を Read して現在のコードを確認

**Step 2:** `testGoogleCalendarConnectionAction` 関数全体を上記パターンに置換

**Step 3:** `bun run type-check` で型エラーがないか確認

---

### Task 1-2: `testGoogleCalendarOAuthAction` を `ActionResult` 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:183-221`

```typescript
// After
export const testGoogleCalendarOAuthAction = withPermission<
  [],
  { calendarName: string }
>(
  "settings",
  "update",
)(async (user) => {
  const result = await testOAuthConnection(user.id);

  if (!result.success) {
    return createFailure(result.error ?? "OAuth接続テストに失敗しました");
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleCalendarOAuthEnabled: true },
    update: { googleCalendarOAuthEnabled: true },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("OAuth接続テストに成功しました", {
    calendarName: result.calendarName ?? "",
  });
});
```

**Step 1:** 関数全体を置換

**Step 2:** `bun run type-check`

---

### Task 1-3: `setupCalendarWebhook` を `ActionResult` 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:316-361`

```typescript
// After
export const setupCalendarWebhook = withPermission<
  [],
  { expiration: Date | undefined }
>(
  "settings",
  "update",
)(async () => {
  const baseUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ?? serverEnv.BETTER_AUTH_URL;
  if (!baseUrl) {
    return createFailure("APP_URLが設定されていません");
  }

  const webhookUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`;
  const result = await setupWebhookWatch(webhookUrl);

  if (!result.success || !result.channelId || !result.resourceId) {
    return createFailure(result.error ?? "Webhook設定に失敗しました");
  }

  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarWebhookChannelId: result.channelId,
      googleCalendarWebhookResourceId: result.resourceId,
      googleCalendarWebhookExpiration: result.expiration,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Webhookを設定しました", {
    expiration: result.expiration,
  });
});
```

**Step 1:** 関数全体を置換

**Step 2:** `bun run type-check`

---

### Task 1-4: `stopCalendarWebhook` を `ActionResult` 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:366-414`

```typescript
// After
export const stopCalendarWebhook = withPermission<[], void>(
  "settings",
  "update",
)(async () => {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookResourceId: true,
    },
  });

  if (
    !settings?.googleCalendarWebhookChannelId ||
    !settings.googleCalendarWebhookResourceId
  ) {
    return createFailure("Webhookが設定されていません");
  }

  const result = await stopWebhookWatch(
    settings.googleCalendarWebhookChannelId,
    settings.googleCalendarWebhookResourceId,
  );

  if (!result.success) {
    return createFailure(result.error ?? "Webhook停止に失敗しました");
  }

  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarWebhookChannelId: null,
      googleCalendarWebhookResourceId: null,
      googleCalendarWebhookExpiration: null,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Webhookを停止しました");
});
```

**Step 1:** 関数全体を置換

**Step 2:** `bun run type-check`

---

### Task 1-5: `triggerManualSync` を `ActionResult` 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts:420-453`

```typescript
// After
export const triggerManualSync = withPermission<
  [],
  { processed: number; deleted: number; updated: number; errors: string[] }
>(
  "settings",
  "update",
)(async () => {
  const result = await syncFromCalendar();

  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.RESERVATIONS);

  return createSuccess("同期が完了しました", {
    processed: result.processed,
    deleted: result.deleted,
    updated: result.updated,
    errors: result.errors,
  });
});
```

**Step 1:** 関数全体を置換

**Step 2:** `checkWritePermission` ヘルパー関数（L42-62）と不要になった import（`getSession`, `getRoleFromSession`, `hasPermission`, `canAccessAdmin`, `logPermissionDenied`）を削除

**Step 3:** `bun run type-check`

---

### Task 1-6: クライアント側コンポーネントの消費パターン更新

**Files:**

- Find and modify all UI components that call the 5 updated actions

変更前後のパターン:

```typescript
// Before: 直接プロパティアクセス
const result = await testGoogleCalendarConnectionAction(params);
if (result.success) {
  setCalendarName(result.calendarName ?? "");
  setAccountEmail(result.accountEmail ?? "");
} else {
  setError(result.error ?? "エラー");
}

// After: ActionResult パターン
const result = await testGoogleCalendarConnectionAction(params);
if (result.success) {
  setCalendarName(result.data.calendarName);
  setAccountEmail(result.data.accountEmail);
} else {
  toast.error(result.error);
}
```

**Step 1:** `Grep` で `testGoogleCalendarConnectionAction|testGoogleCalendarOAuthAction|setupCalendarWebhook|stopCalendarWebhook|triggerManualSync` を使っているファイルを特定

**Step 2:** 各ファイルで `result.calendarName`, `result.accountEmail`, `result.expiration`, `result.processed` 等を `result.data.xxx` に更新

**Step 3:** `bun run validate`

---

### Task 1-7: Phase 1 コミット

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/settings/google-calendar.ts
git add $(git diff --name-only -- 'src/app/(admin)/**/*.tsx')
git commit -m "refactor(calendar): unify google-calendar actions to ActionResult<T> pattern

- testGoogleCalendarConnectionAction: ActionResult<{calendarName, accountEmail}>
- testGoogleCalendarOAuthAction: ActionResult<{calendarName}>
- setupCalendarWebhook: ActionResult<{expiration}>
- stopCalendarWebhook: ActionResult<void>
- triggerManualSync: ActionResult<{processed, deleted, updated, errors}>
- Remove checkWritePermission helper, use withPermission HOF throughout
- Update client consumers to result.data.xxx access pattern

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: `src/shared/lib/google-calendar.ts` 分割

### Task 2-1: ディレクトリ作成とファイル構造準備

**Files to create:**

- `src/shared/lib/google-calendar/types.ts`
- `src/shared/lib/google-calendar/service-account.ts`
- `src/shared/lib/google-calendar/oauth.ts`
- `src/shared/lib/google-calendar/events.ts`
- `src/shared/lib/google-calendar/webhook.ts`
- `src/shared/lib/google-calendar/sync.ts`
- `src/shared/lib/google-calendar/settings.ts`
- `src/shared/lib/google-calendar/helpers.ts`
- `src/shared/lib/google-calendar/index.ts`

**重要:** `src/shared/lib/google-calendar.ts` → `src/shared/lib/google-calendar/index.ts` 移行後、元ファイルを削除

**Step 1:** 元ファイルの全体構造（行番号・関数名）を Read で確認

---

### Task 2-2: `types.ts` 作成（全型定義を移動）

```typescript
// src/shared/lib/google-calendar/types.ts
import "server-only";

// CalendarEventParams, CalendarEventResult,
// CalendarConnectionTestResult, GoogleCalendarSettings,
// CalendarChange, SyncChangesResult,
// WebhookSetupResult, WebhookRenewalResult, TwoWaySyncSettings
// を元ファイルから移動
```

**Step 1:** 元ファイルの型定義部分（L25-61）を Read

**Step 2:** `types.ts` を Write

---

### Task 2-3: `service-account.ts` 作成

```typescript
// src/shared/lib/google-calendar/service-account.ts
import "server-only";
// getServiceAccountClient, encryptServiceAccountJson, extractServiceAccountEmail
```

**Step 1:** 該当関数を Read

**Step 2:** `service-account.ts` を Write

---

### Task 2-4: `oauth.ts` 作成

```typescript
// src/shared/lib/google-calendar/oauth.ts
import "server-only";
// getOAuthClient, testOAuthConnection
```

---

### Task 2-5: `events.ts` 作成

```typescript
// src/shared/lib/google-calendar/events.ts
import "server-only";
// createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
// createOAuthCalendarEvent, getCalendarEvent
```

---

### Task 2-6: `webhook.ts` 作成

```typescript
// src/shared/lib/google-calendar/webhook.ts
import "server-only";
// setupWebhookWatch, stopWebhookWatch, renewWebhookIfNeeded
```

---

### Task 2-7: `sync.ts` 作成

```typescript
// src/shared/lib/google-calendar/sync.ts
import "server-only";
// fetchCalendarChanges
```

---

### Task 2-8: `settings.ts` 作成

```typescript
// src/shared/lib/google-calendar/settings.ts
import "server-only";
// getGoogleCalendarSettings, isGoogleCalendarEnabled,
// getTwoWaySyncSettings, isTwoWaySyncEnabled,
// testServiceAccountConnection, isValidCalendarId
```

---

### Task 2-9: `helpers.ts` 作成

```typescript
// src/shared/lib/google-calendar/helpers.ts
import "server-only";
// formatGoogleApiError
```

---

### Task 2-10: `index.ts` barrel 作成（外部 API 変更なし）

```typescript
// src/shared/lib/google-calendar/index.ts
// 全ファイルから全 export を re-export
// 外部からの import パスは '@/shared/lib/google-calendar' のまま変更なし
export * from "./types";
export * from "./service-account";
export * from "./oauth";
export * from "./events";
export * from "./webhook";
export * from "./sync";
export * from "./settings";
export * from "./helpers";
```

**Step 1:** `index.ts` を Write

**Step 2:** `git rm` で元ファイルを削除

```bash
git rm 'src/shared/lib/google-calendar.ts'
```

**Step 3:** `bun run validate` — 外部 import が index.ts を参照するため変更なしで通過するはず

---

### Task 2-11: Phase 2 コミット

```bash
git add src/shared/lib/google-calendar/
git commit -m "refactor(lib): split google-calendar.ts into responsibility-based modules

Splits 1017-line file into 8 focused modules:
- types.ts: all type/interface definitions
- service-account.ts: SA auth + encryption
- oauth.ts: OAuth client + token management
- events.ts: Calendar CRUD operations
- webhook.ts: webhook setup/stop/renew
- sync.ts: two-way sync (fetchCalendarChanges)
- settings.ts: settings retrieval + connection testing
- helpers.ts: formatGoogleApiError
- index.ts: barrel (external import paths unchanged)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 3: `reservation.ts` 分割

### Task 3-1: `reservation/queries.ts` 作成（読み取り系）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/queries.ts`

```typescript
"use server";

// 以下を reservation.ts から移動:
// - ReservationWithRelations 型
// - GetReservationsResult 型
// - ReservationFilters 型
// - ReservationPagination 型
// - getReservations(filters, pagination)
// - getReservationById(id)
// - getReservationsForCalendar(...)
// - getSpacesForCalendar()
// - getReservationStats()
// - getSpacesForReservation()
// - checkReadPermission（内部 helper、export しない）
```

**Step 1:** `reservation.ts` の先頭 240 行を Read して型・読み取り関数を確認

**Step 2:** `queries.ts` を Write（型定義 + 読み取り関数）

**Step 3:** `bun run type-check`

---

### Task 3-2: `reservation/mutations.ts` 作成（更新・削除系）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`

```typescript
"use server";

// 以下を reservation.ts から移動:
// - updateStatusSchema
// - updateNotesSchema
// - updateReservationStatus(id, status)
// - updateReservationNotes(id, notes)
// - deleteReservation(id)
```

**Step 1:** 該当部分を Read

**Step 2:** `mutations.ts` を Write

**Step 3:** `bun run type-check`

---

### Task 3-3: `reservation/admin.ts` 作成（管理者専用 create/update）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts`

```typescript
"use server";

// 以下を reservation.ts から移動:
// - createAdminReservation(input) — 料金計算・クーポン・トランザクション・メール・カレンダー同期
// - updateAdminReservation(id, input) — 全項目更新・重複チェック・クーポン調整・同期
```

**Step 1:** `reservation.ts` の後半部分を Read

**Step 2:** `admin.ts` を Write

**Step 3:** `bun run type-check`

---

### Task 3-4: `reservation/index.ts` barrel 作成

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/index.ts
// 'use server' なし — barrel のみ
export * from "./queries";
export * from "./mutations";
export * from "./admin";
```

---

### Task 3-5: 元 `reservation.ts` を削除、インポートを更新

**Step 1:** `reservation.ts` を import しているファイルを Grep で特定

**Step 2:** 各インポートパスを確認（barrel が同じ名前なら変更不要の場合もある）

- `from '../_shared/actions/reservation'` → `from '../_shared/actions/reservation/index'` または `from '../_shared/actions/reservation'`（ディレクトリ名と同じなら自動解決）

**Step 3:** 元ファイルを削除

```bash
git rm 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation.ts'
```

**Step 4:** `bun run validate`

---

### Task 3-6: Phase 3 コミット

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/'
git commit -m "refactor(reservations): split reservation.ts into domain modules

Splits 1280-line file into 3 focused server action files:
- queries.ts: read operations (getReservations, getReservationById, etc.)
- mutations.ts: simple updates (updateStatus, updateNotes, delete)
- admin.ts: complex admin operations (createAdminReservation, updateAdminReservation)
- index.ts: barrel re-export (external import paths unchanged)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 4: `SectionEditor.tsx` 分割

### Task 4-1: 共通フック `useSectionFormSubmit` 作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_hooks/useSectionFormSubmit.ts`

```typescript
"use client";

import { useTransition } from "react";
import { toast } from "sonner";

/**
 * セクション設定フォームの送信ロジック共通フック
 *
 * 各セクションフォームで繰り返される useTransition + toast パターンを共通化。
 * React Compiler が自動メモ化するため useCallback / useMemo は不要。
 */
export function useSectionFormSubmit(
  onSave: (config: Record<string, unknown>, contentJson?: string) => void,
) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (
    config: Record<string, unknown>,
    contentJson?: string,
  ) => {
    startTransition(() => {
      onSave(config, contentJson);
    });
  };

  return { isPending, handleSubmit };
}
```

**Step 1:** ファイルを Write

**Step 2:** `bun run type-check`

---

### Task 4-2: `HeroConfigForm.tsx` 作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/HeroConfigForm.tsx`

```typescript
"use client";

// SectionEditor.tsx L1047-1281 の HeroConfigForm を移動
// - 必要な import を自己完結させる
// - props: { config: HeroConfig; onSave: (config: Record<string, unknown>) => void; isPending: boolean }
// - useForm、useSingleMediaPicker、各種 parseXxx 関数を import
// - React Compiler 対応: useCallback/useMemo 不使用、プレーン関数で記述
```

**Step 1:** SectionEditor.tsx の L1047-1281 を Read

**Step 2:** 独立した HeroConfigForm.tsx として Write（import パスを適切に設定）

**Step 3:** `bun run type-check`

---

### Task 4-3: `HeroParallaxConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/HeroParallaxConfigForm.tsx`

- SectionEditor.tsx L213-463 から移動

---

### Task 4-4: `ConceptConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/ConceptConfigForm.tsx`

- SectionEditor.tsx L464-705 から移動

---

### Task 4-5: `SpaceShowcaseConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/SpaceShowcaseConfigForm.tsx`

- SectionEditor.tsx L706-841 から移動

---

### Task 4-6: `FeaturesConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/FeaturesConfigForm.tsx`

- SectionEditor.tsx L853-1046 から移動

---

### Task 4-7: `SpaceListConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/SpaceListConfigForm.tsx`

- SectionEditor.tsx L1282-1473 から移動

---

### Task 4-8: `NewsListConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/NewsListConfigForm.tsx`

- SectionEditor.tsx L1474-1611 から移動

---

### Task 4-9: `PostListConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/PostListConfigForm.tsx`

- SectionEditor.tsx L1612-1769 から移動

---

### Task 4-10: `FaqListConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/FaqListConfigForm.tsx`

- SectionEditor.tsx L1770-1950 から移動

---

### Task 4-11: `CtaConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/CtaConfigForm.tsx`

- SectionEditor.tsx L1951-2055 から移動

---

### Task 4-12: `CustomConfigForm.tsx` 作成（Lexical エディタ含む）

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/CustomConfigForm.tsx`

- SectionEditor.tsx L2056-2131 から移動
- `LexicalEditor` dynamic import も移動

---

### Task 4-13: `InstagramConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/InstagramConfigForm.tsx`

- SectionEditor.tsx L2132-2235 から移動

---

### Task 4-14: `TestimonialConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/TestimonialConfigForm.tsx`

- SectionEditor.tsx L2236-2335 から移動

---

### Task 4-15: `GalleryConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/GalleryConfigForm.tsx`

- SectionEditor.tsx L2336-2502 から移動

---

### Task 4-16: `ContactFormConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/ContactFormConfigForm.tsx`

- SectionEditor.tsx L2503-2637 から移動

---

### Task 4-17: `MapConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/MapConfigForm.tsx`

- SectionEditor.tsx L2638-2796 から移動

---

### Task 4-18: `EmbedConfigForm.tsx` 作成

`src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_section-forms/EmbedConfigForm.tsx`

- SectionEditor.tsx L2797-2927 から移動

---

### Task 4-19: `TitleForm.tsx` を `_shared/` に移動

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/_shared/TitleForm.tsx`

- SectionEditor.tsx L3167-3222 から移動（既に独立した関数コンポーネント）

---

### Task 4-20: `SectionEditor.tsx` をスリム化（メインコンポーネントのみ残す）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/SectionEditor.tsx`

完成後の構造（~150行）:

```typescript
'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { updateHomepageSection, type HomepageSectionData } from '@/admin/actions/homepage-settings'
import { SectionType, sectionTypeLabels } from '@/admin/lib/validations/homepage-section'
import { ArrowLeft, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, ... } from '@/admin/components/ui'
import { DesignPanel } from './DesignPanel'
import { TitleForm } from './_shared/TitleForm'

// 17 フォームコンポーネントの import
import { HeroConfigForm } from './_section-forms/HeroConfigForm'
import { HeroParallaxConfigForm } from './_section-forms/HeroParallaxConfigForm'
// ... 他15ファイル

// get*Config、type *Config を @/admin/lib/validations/homepage-section から import

interface SectionEditorProps {
  section: HomepageSectionData
  onBack: () => void
  onSave: () => void
  showHeader?: boolean
}

export function SectionEditor({ section, onBack, onSave, showHeader = true }: SectionEditorProps) {
  const [isPending, startTransition] = useTransition()
  const label = sectionTypeLabels[section.type]

  const handleConfigSave = (config: Record<string, unknown>, contentJson?: string) => {
    startTransition(async () => {
      const result = await updateHomepageSection(section.id, { config, contentJson })
      if (result.success) {
        toast.success(result.message)
        onSave()
      } else {
        toast.error(result.error)
      }
    })
  }

  const renderConfigForm = () => {
    const { config } = section
    switch (section.type) {
      case SectionType.HERO:
        return <HeroConfigForm config={getHeroConfig(config)} onSave={handleConfigSave} isPending={isPending} />
      // ... 他16ケース
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onBack}><ArrowLeft /> 戻る</Button>
        </div>
      )}
      <TitleForm section={section} onSave={onSave} />
      {renderConfigForm()}
      <DesignPanel section={section} />
    </div>
  )
}
```

**Step 1:** 移動済みの全関数を SectionEditor.tsx から削除

**Step 2:** 新規 import を追加（17 フォームコンポーネント）

**Step 3:** `bun run validate`

---

### Task 4-21: Phase 4 コミット

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/settings/_components/homepage/
git commit -m "refactor(section-editor): split 3222-line SectionEditor into 17 focused components

Each section type now has its own self-contained form component:
- _section-forms/: 17 form components (HeroConfigForm, etc.)
- _shared/TitleForm.tsx: common title editor
- _hooks/useSectionFormSubmit.ts: shared form submission logic
- SectionEditor.tsx: reduced to ~150 lines (dispatch only)

React Compiler compatible: no manual memoization, plain functions throughout

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 5: 最終検証

### Task 5-1: 全体 validate

```bash
bun run validate
```

Expected: type-check + lint 全通過

---

### Task 5-2: ビルド確認

```bash
bun run build
```

Expected: ビルド成功

---

### Task 5-3: React Compiler 互換性チェック

`react-compiler-reviewer` サブエージェントを起動:

- 対象: 全 `_section-forms/` ファイル + `SectionEditor.tsx`
- `useCallback`/`useMemo`/`React.memo` の残留確認
- `watch()` の使用確認（→ `useWatch()` に置換）

---

### Task 5-4: `docs/plans/README.md` スコア更新

コード品質スコアを **75 → 100** に更新（SectionEditor.tsx 分割完了、エラーハンドリング統一完了）。

---

### Task 5-5: 最終コミット（README 更新）

```bash
git add docs/plans/README.md
git commit -m "docs: update code quality score to 100 after refactoring

- SectionEditor.tsx split: 3222 lines -> 17 focused components
- google-calendar actions: ActionResult<T> unified
- reservation.ts split: queries/mutations/admin modules
- google-calendar lib split: 8 responsibility-based modules

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 実装時の注意事項

### React Compiler 互換性

```typescript
// NG: 手動メモ化（React Compiler が処理できない）
const handleSubmit = useCallback(() => { ... }, [deps])

// OK: プレーン関数（Compiler が自動最適化）
const handleSubmit = () => { ... }
```

### withPermission の型引数

```typescript
// 引数なし: withPermission<[], ReturnData>
// 引数あり: withPermission<[arg1: Type1, arg2: Type2], ReturnData>
// データなし: withPermission<[id: string], void>
```

### 'use server' ファイル分割時の注意

各分割ファイルの先頭に `'use server'` ディレクティブが必要。barrel（index.ts）には不要。

### パスエイリアス

- `@/admin/*` → `src/app/(admin)/admin/(dashboard)/_shared/*`
- `@/shared/*` → `src/shared/*`
- `SectionEditor` 内フォームは相対パスで import

### セクションフォームの型付け

```typescript
// 各フォームの props 型（破壊的変更: isPending を各フォームが受け取る）
interface XxxConfigFormProps {
  config: XxxConfig; // Zod inferred
  onSave: (config: Record<string, unknown>, contentJson?: string) => void;
  isPending: boolean;
}
```
