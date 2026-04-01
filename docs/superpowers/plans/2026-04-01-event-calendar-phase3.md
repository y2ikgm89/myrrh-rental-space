# イベントカレンダー Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google Calendar からイベントを取り込み、Event モデルに upsert する機能を実装する。管理画面の設定でオン/オフ切替可能。

**Architecture:** 既存の `fetchCalendarChanges()` (sync.ts) を活用し、新たに `importCalendarEventsToEvents()` を作成。既存の予約同期フィルター（"予約ID:" を含むイベントのみ）を逆転させ、予約以外のカレンダーイベントを Event モデルに取り込む。Event.googleCalendarEventId で重複チェック。設定は Settings テーブルに `eventImportEnabled` フィールドを追加。

**Tech Stack:** Google Calendar API v3, Prisma 7, Next.js 16 CRON

---

## File Structure

### 新規作成ファイル

```
src/shared/lib/calendar-sync/
  event-inbound.ts                 — GCal → Event 取り込みロジック

src/app/api/cron/event-import/
  route.ts                         — CRON ジョブ（定期取り込み）
```

### 変更するファイル

```
prisma/schema.prisma               — Settings に eventImportEnabled フィールド追加
src/shared/domain/settings/queries/ — 設定取得クエリに新フィールド追加
src/shared/domain/events/commands.ts — importEventFromCalendar コマンド追加
src/app/(admin)/.../actions/settings/google-calendar.ts — トグル設定アクション追加
src/app/(admin)/.../settings/_components/sections/ — UI にトグル追加
src/app/(admin)/.../events/[id]/page.tsx — GCal 連携バッジ表示
```

---

## Task 1: Settings フィールド追加 + マイグレーション

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Settings モデルに eventImportEnabled フィールド追加**

Settings モデルに追加:

```prisma
eventImportEnabled    Boolean   @default(false)
eventImportSyncToken  String?   @db.Text
```

- [ ] **Step 2: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add-event-import-settings`

- [ ] **Step 3: 型確認 + コミット**

---

## Task 2: イベント取り込みロジック

**Files:**

- Create: `src/shared/lib/calendar-sync/event-inbound.ts`
- Modify: `src/shared/domain/events/commands.ts`

- [ ] **Step 1: importEventFromCalendar コマンド追加**

`commands.ts` に追加:

```typescript
export async function upsertEventFromCalendar(data: {
  googleCalendarEventId: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  location?: string | null;
}) {
  const existing = await prisma.event.findFirst({
    where: { googleCalendarEventId: data.googleCalendarEventId },
    select: { id: true },
  });

  if (existing) {
    // 更新（手動編集されたフィールドは上書きしない方針も可能だが、シンプルに上書き）
    await prisma.event.update({
      where: { id: existing.id, deletedAt: null },
      data: {
        title: data.title,
        description: data.description ?? null,
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location ?? null,
      },
    });
    return { id: existing.id, action: "updated" as const };
  }

  // 新規作成（DRAFT で取り込み、管理者が PUBLISHED に変更）
  const slug = await ensureUniqueSlug(generateSlug(data.title, "event"));
  const event = await prisma.event.create({
    data: {
      title: data.title,
      slug,
      description: data.description ?? null,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location ?? null,
      status: "DRAFT",
      googleCalendarEventId: data.googleCalendarEventId,
    },
    select: { id: true },
  });
  return { id: event.id, action: "created" as const };
}
```

- [ ] **Step 2: event-inbound.ts 作成**

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { getServiceAccountClient } from "@/shared/lib/google-calendar/service-account";
import { upsertEventFromCalendar } from "@/shared/domain/events/commands";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/logger";

export async function importCalendarEvents(): Promise<{
  imported: number;
  updated: number;
  errors: number;
}> {
  const settings = await prisma.settings.findFirstOrThrow({
    select: {
      eventImportEnabled: true,
      googleCalendarCalendarId: true,
      eventImportSyncToken: true,
    },
  });

  if (!settings.eventImportEnabled || !settings.googleCalendarCalendarId) {
    return { imported: 0, updated: 0, errors: 0 };
  }

  const calendar = await getServiceAccountClient();
  const calendarId = settings.googleCalendarCalendarId;

  let imported = 0,
    updated = 0,
    errors = 0;
  let pageToken: string | undefined;
  let newSyncToken: string | undefined;

  // syncToken ベースの差分取得（初回は timeMin/timeMax）
  const params: Record<string, unknown> = {
    calendarId,
    maxResults: 250,
    singleEvents: true,
  };

  if (settings.eventImportSyncToken) {
    params.syncToken = settings.eventImportSyncToken;
  } else {
    // 初回: 過去1ヶ月〜将来6ヶ月
    const now = new Date();
    params.timeMin = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    params.timeMax = new Date(
      now.getTime() + 180 * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  do {
    if (pageToken) params.pageToken = pageToken;

    const response = await calendar.events.list(params);
    const events = response.data.items ?? [];
    newSyncToken = response.data.nextSyncToken ?? undefined;
    pageToken = response.data.nextPageToken ?? undefined;

    for (const gcalEvent of events) {
      // 予約イベント（"予約ID:" を含む）はスキップ
      if (gcalEvent.description?.includes("予約ID:")) continue;
      // キャンセル済みイベントはスキップ
      if (gcalEvent.status === "cancelled") continue;
      if (!gcalEvent.id || !gcalEvent.summary) continue;

      const startTime = gcalEvent.start?.dateTime ?? gcalEvent.start?.date;
      const endTime = gcalEvent.end?.dateTime ?? gcalEvent.end?.date;
      if (!startTime || !endTime) continue;

      try {
        const result = await upsertEventFromCalendar({
          googleCalendarEventId: gcalEvent.id,
          title: gcalEvent.summary,
          description: gcalEvent.description ?? null,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          location: gcalEvent.location ?? null,
        });

        if (result.action === "created") imported++;
        else updated++;
      } catch (error) {
        errors++;
        logError(error, {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: "importCalendarEvent", eventId: gcalEvent.id },
        });
      }
    }
  } while (pageToken);

  // syncToken を保存
  if (newSyncToken) {
    await prisma.settings.updateMany({
      data: { eventImportSyncToken: newSyncToken },
    });
  }

  logger.info("Calendar event import completed", { imported, updated, errors });
  return { imported, updated, errors };
}
```

- [ ] **Step 3: 型確認 + コミット**

---

## Task 3: CRON ジョブ

**Files:**

- Create: `src/app/api/cron/event-import/route.ts`

- [ ] **Step 1: CRON Route Handler 作成**

既存の `src/app/api/cron/calendar-sync/route.ts` パターンに従う:

```typescript
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { revalidateTag } from "next/cache";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { importCalendarEvents } from "@/shared/lib/calendar-sync/event-inbound";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest(request);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.reason }, { status: 401 });
    }

    const result = await importCalendarEvents();

    if (result.imported > 0 || result.updated > 0) {
      revalidateTag(CACHE_TAGS.EVENTS, CACHE_LIFE.PUBLIC_CONTENT);
    }

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "cronEventImport" },
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 2: 型確認 + コミット**

---

## Task 4: 管理画面設定 UI + Server Action

**Files:**

- Modify: 管理画面の Google Calendar 設定セクション
- Modify: 設定 Server Action

- [ ] **Step 1: 設定 Server Action にトグル追加**

既存の Google Calendar 設定アクションに `toggleEventImport` 関数を追加。`executeAdminMutationResult` パターンで `eventImportEnabled` を更新。

- [ ] **Step 2: 設定 UI にトグル追加**

Google Calendar 設定セクションに「イベント取り込み」トグルスイッチを追加。

- ラベル: "Google Calendar からイベントを取り込む"
- 説明: "有効にすると、Google Calendar のイベントを自動的にイベント管理に取り込みます（下書き状態で作成）"
- Google Calendar 接続済みの場合のみ表示

- [ ] **Step 3: 型確認 + コミット**

---

## Task 5: 管理画面 GCal 連携バッジ + 全体検証

**Files:**

- Modify: `src/app/(admin)/.../events/[id]/page.tsx`

- [ ] **Step 1: GCal 連携バッジ表示**

イベント詳細ページで `googleCalendarEventId` がある場合、タイトル横に「GCal 連携中」バッジを表示。

- [ ] **Step 2: 全体検証**

```bash
bun run validate
bun run build:skip-env
```

- [ ] **Step 3: コミット**
