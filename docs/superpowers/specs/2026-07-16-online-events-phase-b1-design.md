# オンライン開催イベント (Phase B.1) 設計

- 日付: 2026-07-16
- ステータス: 承認待ち (brainstorming 完了、writing-plans 前)
- 対象 Phase: **B.1 = オンライン開催** (B.2 = RRULE 繰返し予約は別 spec で後回し)

## 背景

現状、`Event` model は物理会場 (`locationId` / `spaceId` / `addressDetail`) 前提の設計で、オンライン会議 URL を保持する field が皆無である。`EventJsonLd` の `eventAttendanceMode` は `OfflineEventAttendanceMode` ハードコード、Google Meet URL 自動発行は `Settings.googleCalendarMeetEnabled` (site-wide toggle) だけで per-event 制御不可、iCal 出力の `LOCATION` は物理会場文字列のみ。schema.org / RFC 5545 / Google Calendar API / Eventbrite / Meetup / Cal.com の 5 大公式実装を徹底検証した結果、業界標準は「physical location + meeting URL/conference の 2 系統 flat」で、本 project の relational FK (`locationId` / `spaceId`) と自然に共存する。

本設計は Event に 3 列 (`format` / `meetingUrl` / `meetingProvider`) を add-only で足し、`Settings.googleCalendarMeetEnabled` を per-event `meetingProvider` で完全置換する形で 1 件のみ破壊的に DROP する。ユーザーは「破壊的変更 OK、公式推奨で後方互換性なしでクリーンな実装、業界水準・推奨」を明言している。

Phase B の 2 topic (オンライン開催 + RRULE 繰返し予約) はスコープ差が桁違い (5-8 file vs 30-50 file) かつ独立機能 (Cal.com / Calendly / Eventbrite ともに独立リリース) のため、B.1 = オンライン開催を先行、B.2 = RRULE を別セッションで別 spec としてブレストする。

## 調査で確定した事実 (前提)

### 現状 schema (`prisma/schema.prisma`)

- `Event` model (line 1843-1913): 会場系は `addressDetail String?` + `locationId String?` + `spaceId String?` の 3 本。`isOnline` / `meetingUrl` / `videoConferenceUrl` / `format` / `meetingProvider` 列は**存在しない**。
- `EventScheduleMode` enum (line 191-196): `SINGLE_OCCURRENCE` / `TIMED_ENTRY` のみ。オンライン開催に絡む値は無い (無関係)。
- `EventTimeSlot` (line 1815-1837): `startAt` / `endAt` / `capacity` / `googleCalendarEventId`。オンライン URL 列無し。
- `Settings.googleCalendarMeetEnabled Boolean @default(false)` (line 1401-1402): 全 GCal event に Meet URL 強制付与する site-wide toggle。per-event 制御は不可。
- `Settings.googleCalendarReminderMinutes Int?` (line 1403): reminder 分単位、オンライン開催と無関係で維持。

### 現状 domain (`src/shared/domain/events/`)

- `venue.ts` `formatEventVenue()` / `formatEventAddress()`: 3 ソース (`location.name` / `space.name` / `addressDetail`) を優先順位で結合。online / hybrid の概念無し。
- `calendar-sync.ts` `getEventSlotsForCalendarSync()`: slot 単位 GCal 同期。会場は `formatEventVenue()` 結果を GCal `location` field に投入。`recurrence` (RRULE) は未指定 (B.2 マター)。
- `public-queries.ts` `publicEventSelect`: `format` / `meetingUrl` / `meetingProvider` 列は select 対象外 (追加が必要)。
- `commands.ts` `createEventCommand` / `updateEventCommand`: 会場入力を `locationId` / `spaceId` / `addressDetail` のみで validate。format / meetingUrl の validation 無し。

### 現状 UI

- admin: `src/app/(admin)/admin/(dashboard)/events/_components/EventLocationSpaceSelector.tsx` — location / space / addressDetail (外部会場) の入力 UI。オンライン URL 入力欄無し。
- public: `src/app/(public)/events/[slug]/page.tsx` — `EventJsonLd` (line 200-201) で `eventAttendanceMode="OfflineEventAttendanceMode"` ハードコード。`location.VirtualLocation` 出力経路無し。

### 現状 email

- `src/shared/email/templates/EventRegistrationConfirmation/`: 会場情報は `formatEventVenue()` 結果を差込。参加 URL section 無し (schema に無いので当然)。

### 現状 iCal (`src/shared/lib/ical/`)

- `index.ts` `buildEventCalendar()`: `LOCATION` field に `formatEventVenue()` 結果、`URL` field 未使用。REQUEST/CANCEL の 2 method 対応。RFC 5545 の `URL` プロパティは仕様上追加可能 (RFC 5545 §3.8.4.6)。

### 現状 GCal (`src/shared/lib/google-calendar/events.ts`)

- `buildEventBody({ params, settings, options })` (line 43-80):
  - `withMeet = options.withMeet === true && settings.meetEnabled && params.startTime` — 3 条件 AND。`options.withMeet` は callsite で `true` 固定、実質 `settings.meetEnabled` gate のみ。
  - `conferenceData: withMeet ? { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } : undefined`
  - 応答の `event.hangoutLink` は現状どこにも write-back されない (Reservation/Event.meetingUrl 列無し)。

## 外部検証 (業界標準・公式仕様)

### schema.org Event.eventAttendanceMode (W3C 標準)

- 3 値: `OfflineEventAttendanceMode` / `OnlineEventAttendanceMode` / `MixedEventAttendanceMode` (https://schema.org/EventAttendanceModeEnumeration)
- Google 検索 Event rich result で virtual event 表示に必須 (Google Developers "Add markup to your online events", 2020-06 導入)
- `location` field は `Place | VirtualLocation | PostalAddress | Text` の polymorphic。HYBRID では `location: [{ '@type': 'Place', ... }, { '@type': 'VirtualLocation', url }]` の array。

### RFC 5545 iCalendar (IETF 標準)

- `LOCATION` (§3.8.1.7): 自由記述テキスト。物理住所を入れる想定だが URL テキストも許容。
- `URL` (§3.8.4.6): 別プロパティで event 関連 URL を expose。iCal 対応クライアントは calendar UI で「URL を開く」ボタンを表示。
- online 会議 URL は `LOCATION` に埋込 or `URL` プロパティで併記が両方観測される (Google Calendar 生成 ics は `LOCATION` に URL、Outlook は `URL` プロパティ併用)。

### Google Calendar API v3 conferenceData

- `event.conferenceData.createRequest` + `conferenceSolutionKey.type: "hangoutsMeet"` を投げると Meet URL 自動発行 (https://developers.google.com/calendar/api/v3/reference/events)。
- 応答の `event.conferenceData.entryPoints[].uri` または `event.hangoutLink` に発行済 URL が入る。
- Google Workspace 未契約 (個人 GMail) の環境では Meet URL 発行が API level で失敗する。

### 5 大実装の会場モデル比較

| 実装                    | 会場モデル                                                        | 判定                                          |
| ----------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| **schema.org**          | `location: Array<Place \| VirtualLocation>` polymorphic           | JSON-LD 出力層で採用 (storage 層には強制せず) |
| **RFC 5545 iCalendar**  | `LOCATION: text` + `URL: uri` の 2 flat field                     | RFC 5545 準拠で iCal 出力                     |
| **Google Calendar API** | `location: string` (freetext) + `conferenceData: {}` (structured) | 2 系統 flat                                   |
| **Eventbrite API**      | `Event.is_online_event: bool` + `online_event_url: string`        | Event 本体に flat                             |
| **Meetup API**          | `Event.is_online_event: bool` + `online_event_url: string`        | Event 本体に flat                             |
| **Cal.com (OSS)**       | `EventType.locations: JSON[]` polymorphic array                   | 唯一の JSON array 実装                        |

本 project は既に `Event.locationId → Location → Space` の relational FK を持ち、Space は Reservation の billable unit として core dependency のため、Cal.com 型 JSON array への移行は「Reservation ドメインも巻き込む 80+ file 大改修 + 相互 relational integrity 喪失」となり、ROI がマイナス。**RFC 5545 / GCal / Eventbrite / Meetup の 4 実装が採用する「physical location + meeting URL の 2 系統 flat」**が最もクリーンかつ本 project の relational モデルと整合する。

### 参加 URL 開示ポリシー (Eventbrite / Meetup 標準)

- Eventbrite: online event の participation URL は **登録完了時にメール + 参加者ダッシュボード** で開示。公開ページには「Registered attendees will receive online event details」と表示のみ。
- Meetup: 同上。公開ページには「Online event details will be sent to attendees.」ラベルのみ。
- rationale: URL を公開すると非登録者が参加でき、Zoom raid / capacity 越え / spam 招待の温床になる。

## ゴール

1. Event ごとに開催形態 (offline / online / hybrid) を管理者が指定でき、public ページ・JSON-LD・iCal・GCal・登録完了メールすべてで正しく表現される。
2. Meet URL は「管理者手入力」または「Google Meet 自動発行 (per-event opt-in)」のどちらかで管理でき、Workspace 権限失敗は admin UI で fail-fast に surface される。
3. 参加 URL は Eventbrite / Meetup 業界標準に従い**登録完了者のみ**に開示 (登録完了メール + マイページ)。公開ページには「登録後にメールで配信」ラベルのみ表示。
4. schema.org JSON-LD は `eventAttendanceMode` の 3 値と `location: VirtualLocation | Place | [Place, VirtualLocation]` の polymorphic array を完全出力し、Google 検索 Event rich result で virtual/hybrid event として認識される。
5. iCal 出力は RFC 5545 準拠で `LOCATION` (物理会場 or "オンライン開催") + `URL` (meetingUrl) を併記。
6. GCal 同期は per-event 判定 (`Event.meetingProvider === "GOOGLE_MEET"` のときのみ `conferenceData.createRequest` を送出)。発行された URL は callback で `Event.meetingUrl` に write-back。
7. `Settings.googleCalendarMeetEnabled` (site-wide toggle) を破壊的に DROP し、per-event `meetingProvider` に一本化する。冗長 gate を排除。
8. DB level の CHECK 制約で「ONLINE/HYBRID かつ MANUAL provider かつ meetingUrl 未入力」を禁止し、business-domain rule の DB 側担保を強化。
9. **Reservation ドメインの Google Meet URL 自動発行を廃止** (`Settings.googleCalendarMeetEnabled` 削除に伴う一貫改修)。物理 space の予約に Meet URL 付与は業界標準 (Cal.com / Calendly) では非対応、意味論的にも過剰。既存 Reservation の GCal event に付与済 Meet URL は次回 GCal 側 modify 時に自然消滅 (backfill 削除は不要)。

## 非ゴール (スコープ外)

- **RRULE 繰返し予約** (Phase B.2): 独立 spec で別セッションブレスト。
- **Zoom / Teams / その他 provider の API integration**: `meetingProvider` enum を最小の `MANUAL | GOOGLE_MEET` 2 値に絞る (YAGNI)。Zoom/Teams は MANUAL カテゴリで URL 手入力扱い。将来 provider 増設は enum 値追加 + integration 実装で非破壊拡張。
- **参加 URL の開示タイミング細分化** (登録直後 / 24h 前 / 1h 前 の 3 段階等): Eventbrite / Meetup は「登録完了時開示」の 1 タイミングのみ、業界標準に従う。将来必要なら追加。
- **オンライン Reservation** (物理 space ではなくオンラインミーティング枠の予約): 本 project の Reservation は物理 Space 予約が core。Event 側のみに online 対応を入れる。
- **Meet 以外の GCal conference (Webex / Zoom Add-on / etc.)**: Google Meet Add-on のみ本 project は Workspace 前提。他 Add-on は Workspace 個別購入が必要で本 project の scope 外。
- **参加 URL の暗号化保存**: 会議 URL は「知られたら誰でも入れる」性質だがパスワード等 secret ではない。Zoom passcode を分けて保存する需要が出たら別 spec で `meetingPassword` 列追加 (今回は YAGNI)。
- **既存 event の backfill migration**: 既存 event は全て `format = OFFLINE` default で埋まり、UI から明示的に ONLINE/HYBRID に変更したイベントのみ format が変わる。既存データを online 化する自動 backfill は不要。

## アーキテクチャ設計

### 1. Data model (Prisma DSL)

```prisma
// prisma/schema.prisma に追加
enum EventFormat {
  OFFLINE  // schema.org OfflineEventAttendanceMode
  ONLINE   // schema.org OnlineEventAttendanceMode
  HYBRID   // schema.org MixedEventAttendanceMode
}

enum MeetingProvider {
  MANUAL       // 管理者手入力の URL (Zoom / Teams / Whereby / 独自 URL 等)
  GOOGLE_MEET  // GCal API 経由で自動発行、URL は write-back
}

model Event {
  // ... existing fields ...

  format          EventFormat      @default(OFFLINE)
  meetingUrl      String?          @db.VarChar(500)
  meetingProvider MeetingProvider  @default(MANUAL)
}

model Settings {
  // DROP: googleCalendarMeetEnabled  Boolean  @default(false)
  // 理由: per-event Event.meetingProvider === GOOGLE_MEET で完全置換。
  //       Workspace 権限失敗は per-event GCal API 呼出時に surface され、admin UI に表示。
  //       site-wide gate は冗長で「per-event で ON にしても発行されないケース」の混乱源。

  googleCalendarReminderMinutes  Int?  // 維持 (無関係)
}
```

### 2. Migration 戦略

**単一 migration ファイル** `prisma/migrations/YYYYMMDDHHMMSS_add_event_online_format/migration.sql`:

```sql
-- add enums
CREATE TYPE "EventFormat" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');
CREATE TYPE "MeetingProvider" AS ENUM ('MANUAL', 'GOOGLE_MEET');

-- add columns to Event (NOT NULL with DEFAULT so existing rows fill safely)
ALTER TABLE "Event"
  ADD COLUMN "format" "EventFormat" NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN "meetingUrl" VARCHAR(500),
  ADD COLUMN "meetingProvider" "MeetingProvider" NOT NULL DEFAULT 'MANUAL';

-- CHECK: ONLINE/HYBRID + MANUAL provider は meetingUrl 必須
ALTER TABLE "Event" ADD CONSTRAINT "event_online_meeting_url_required"
CHECK (
  ("format" = 'OFFLINE')
  OR ("meetingProvider" = 'GOOGLE_MEET')
  OR ("meetingUrl" IS NOT NULL)
);

-- DROP: Settings.googleCalendarMeetEnabled (BREAKING)
ALTER TABLE "Settings" DROP COLUMN "googleCalendarMeetEnabled";
```

**deploy impact**: `DROP COLUMN` を含むため CLAUDE.md rule により **breaking migration = 計画ダウンタイム deploy** が自動発動。deploy-production.yml が maintenance page 表示 → migrate → new revision の順序で無停止に近い切替を実施 (実測 5-10 分)。CHECK 制約は既存行が全て `format = OFFLINE` になるため validation 失敗しない (safe)。

**squawk lint 通過性**:

- `ADD COLUMN ... NOT NULL DEFAULT`: safe pattern (default があるので既存行を lock せず追加可能。ただし PostgreSQL 12+ の fast default 前提)
- `ADD CONSTRAINT CHECK`: 既存行全て条件満たすため safe
- `DROP COLUMN`: **breaking** (これが計画ダウンタイムのトリガー)

### 3. Enum SSoT (`src/shared/lib/validations/enums/prisma-types.ts`)

```ts
export const EVENT_FORMAT = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  HYBRID: "HYBRID",
} as const;
export type EventFormatValue = (typeof EVENT_FORMAT)[keyof typeof EVENT_FORMAT];
export const EVENT_FORMAT_VALUES = Object.values(
  EVENT_FORMAT,
) as EventFormatValue[];

export const MEETING_PROVIDER = {
  MANUAL: "MANUAL",
  GOOGLE_MEET: "GOOGLE_MEET",
} as const;
export type MeetingProviderValue =
  (typeof MEETING_PROVIDER)[keyof typeof MEETING_PROVIDER];
export const MEETING_PROVIDER_VALUES = Object.values(
  MEETING_PROVIDER,
) as MeetingProviderValue[];

// schema.org mapping (JSON-LD 出力で使用)
export const EVENT_FORMAT_TO_SCHEMA_ORG = {
  OFFLINE: "OfflineEventAttendanceMode",
  ONLINE: "OnlineEventAttendanceMode",
  HYBRID: "MixedEventAttendanceMode",
} as const satisfies Record<EventFormatValue, string>;
```

### 4. Domain layer

#### 4.1 `src/shared/domain/events/venue.ts`

追加 export:

```ts
export function formatEventVenueDisplay(
  event: Pick<Event, "format" | "meetingUrl"> & {
    location?: { name: string } | null;
    space?: { name: string } | null;
    addressDetail?: string | null;
  },
): { primary: string | null; secondary: string | null } {
  const physical = formatEventVenue(event); // 既存 helper
  switch (event.format) {
    case "OFFLINE":
      return { primary: physical, secondary: null };
    case "ONLINE":
      return { primary: "オンライン開催", secondary: null };
    case "HYBRID":
      return { primary: physical, secondary: "オンラインでも参加可" };
  }
}

export function isEventVirtualAccessible(
  event: Pick<Event, "format">,
): boolean {
  return event.format === "ONLINE" || event.format === "HYBRID";
}
```

#### 4.2 `src/shared/domain/events/commands.ts`

`createEventCommand` / `updateEventCommand` の Zod schema に `format` / `meetingUrl` / `meetingProvider` を追加。refine で「ONLINE/HYBRID + MANUAL provider → meetingUrl 必須」「meetingUrl は URL format」「HTTPS のみ許容」を検証。

```ts
const eventInputSchema = z
  .object({
    // ... existing fields
    format: z.enum(EVENT_FORMAT_VALUES).default("OFFLINE"),
    meetingUrl: z
      .string()
      .url()
      .startsWith("https://")
      .max(500)
      .nullable()
      .optional(),
    meetingProvider: z.enum(MEETING_PROVIDER_VALUES).default("MANUAL"),
  })
  .refine(
    (data) => {
      if (data.format === "OFFLINE") return true;
      if (data.meetingProvider === "GOOGLE_MEET") return true;
      return data.meetingUrl != null && data.meetingUrl.length > 0;
    },
    {
      message:
        "オンライン開催・ハイブリッド開催で MANUAL provider の場合は会議 URL が必須です",
      path: ["meetingUrl"],
    },
  );
```

**write path**:

- `create` / `update` command 実行時、`format ∈ {ONLINE, HYBRID} && meetingProvider === GOOGLE_MEET && meetingUrl === null` の場合は **Meet URL は GCal callback で write-back** されるため、この時点では DB に null で保存 (CHECK 制約は `provider === GOOGLE_MEET` を許容する形で書いてある)。
- `format === "OFFLINE"` に更新される場合、`meetingUrl` を null にリセット、`meetingProvider` を `MANUAL` にリセット (validation ではなく domain 側で明示クリア)。

#### 4.3 `src/shared/domain/events/calendar-sync.ts`

追加 export:

```ts
export async function writeBackMeetingUrl({
  eventId,
  meetingUrl,
}: {
  eventId: string;
  meetingUrl: string;
}): Promise<void> {
  await prisma.event.update({
    where: { id: eventId },
    data: { meetingUrl },
  });
}
```

呼出元: `src/shared/lib/calendar-sync/outbound` の event sync 側で、GCal API 応答から `hangoutLink` を抜いて write-back。

`getEventSlotsForCalendarSync()` の select に `format` / `meetingUrl` / `meetingProvider` を追加、caller に渡す payload に含める。

#### 4.4 `src/shared/domain/events/public-queries.ts`

`publicEventSelect` に 3 列追加:

```ts
export const publicEventSelect = {
  // ... existing
  format: true,
  meetingUrl: true, // 公開ページでは表示しない (登録済ユーザーのみ表示)
  meetingProvider: true,
} satisfies Prisma.EventSelect;
```

**注意**: `meetingUrl` は `publicEventSelect` で **select はする** (server 側で `isEventVirtualAccessible()` 判定に必要、future の admin preview 経路にも流用) が、**public ページの JSX / JSON-LD には render しない** (business rule: 登録完了者のみ開示)。この invariant は下記 2 方法で担保:

1. public page component は `event.format` と `event.meetingProvider` のみ参照、`event.meetingUrl` は destructure しない
2. `EventJsonLd` component の props 型定義から `meetingUrl` を除外 (build 時 TS エラーで gate)

#### 4.5 `src/shared/domain/events/registration-queries.ts`

登録済ユーザー (customer 認証済 or guest claim token 検証済) 向けの `getRegistrationDetailForCustomer()` / `getRegistrationByToken()` の返却型に `event.meetingUrl` を含める (登録完了者は URL 閲覧可)。

### 5. Google Calendar sync 改修 (`src/shared/lib/google-calendar/events.ts`)

`buildEventBody()` を per-event 判定に:

```ts
export function buildEventBody(
  params: EventBodyParams,
  settings: Pick<Settings, "googleCalendarReminderMinutes">, // meetEnabled 削除
  options?: { withMeet?: boolean },
): CalendarEventBody {
  const withMeet = options?.withMeet === true;
  return {
    summary: params.title,
    description: params.description,
    location: params.location,
    start: { dateTime: params.startTime, timeZone: JST },
    end: { dateTime: params.endTime, timeZone: JST },
    attendees: params.attendees,
    reminders: buildReminders(settings.googleCalendarReminderMinutes),
    conferenceData: withMeet
      ? {
          createRequest: {
            requestId: params.requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        }
      : undefined,
  };
}
```

**callsite の変更**:

- Event slot sync: `options.withMeet = event.meetingProvider === "GOOGLE_MEET"` (per-event 判定)。
- Reservation sync: `options.withMeet = false` 固定 (物理 space 予約は Meet 不要、既存挙動と同じ)。
  - **注意**: 現状 Reservation 側は `settings.googleCalendarMeetEnabled === true` のとき全予約に Meet URL 付与していたが、本改修で完全に無効化される (**Reservation ドメインの Meet URL 付与機能を廃止**、これは意図的な業界標準化: Cal.com / Calendly も room 予約に Meet URL 自動付与はしない)。

**write-back**:

- GCal API 応答から `event.hangoutLink` (deprecated) または `event.conferenceData.entryPoints[?type=='video'].uri` を抽出。
- `writeBackMeetingUrl({ eventId, meetingUrl })` で `Event.meetingUrl` に保存。
- Meet URL 発行失敗 (Workspace 権限無し等) は GCal API がエラー応答。catch して `Event.calendarSyncError` に記録、UI で表示。

### 6. iCal 出力改修 (`src/shared/lib/ical/`)

`buildEventCalendar()` の `location` / `url` field 設定:

```ts
function toIcsEvent(params: EventCalendarParams) {
  const { primary: locationPrimary } = formatEventVenueDisplay(params.event);
  const url = params.event.meetingUrl; // ONLINE/HYBRID のみ non-null 想定
  return {
    id: buildEventUid(params.event.id),
    start: params.event.startAt,
    end: params.event.endAt,
    summary: params.event.title,
    description: params.event.description,
    location: locationPrimary, // "オンライン開催" / 物理会場文字列 / ハイブリッド時は物理
    url: url ?? undefined, // RFC 5545 URL プロパティ
    // ...
  };
}
```

`ical-generator@11` の `ICalEventData.url` field を使用 (実装済みの API、追加 dependency 不要)。

### 7. Public ページ改修

#### 7.1 `src/app/(public)/events/[slug]/page.tsx`

```tsx
// 会場表示 (public、URL は非表示)
const { primary, secondary } = formatEventVenueDisplay(event);
{
  primary && <div>{primary}</div>;
}
{
  secondary && <div className="text-sm text-muted-foreground">{secondary}</div>;
}

// online/hybrid 時は「参加 URL は登録完了メールで配信」ラベル
{
  isEventVirtualAccessible(event) && (
    <p className="text-sm text-muted-foreground">
      参加 URL は登録完了時にメールでお送りします
    </p>
  );
}
```

#### 7.2 EventJsonLd (JSON-LD) 出力

```tsx
function eventJsonLd(event: EventForJsonLd) {
  const attendanceMode = EVENT_FORMAT_TO_SCHEMA_ORG[event.format]
  const physicalLocation = /* 既存の Place 生成 */
  const virtualLocation = isEventVirtualAccessible(event)
    ? { '@type': 'VirtualLocation', name: 'オンライン開催 (登録完了時に URL をお送りします)' }
    : null
  // 注意: 公開ページの JSON-LD では VirtualLocation.url を出力しない (Meetup も同様)
  //       Google 検索 rich result は VirtualLocation の存在で virtual event と判定するが、
  //       url が無くても pass する (Google Developers ドキュメントで url は recommended、required ではない)

  const location = (() => {
    switch (event.format) {
      case "OFFLINE": return physicalLocation
      case "ONLINE": return virtualLocation
      case "HYBRID": return [physicalLocation, virtualLocation].filter(Boolean)
    }
  })()

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    eventAttendanceMode: attendanceMode,
    location,
    // ... existing fields
  }
}
```

### 8. Admin UI 改修

#### 8.1 `EventLocationSpaceSelector.tsx`

上部に「開催形態」ToggleGroup を追加:

```tsx
<ToggleGroup type="single" value={format} onValueChange={setFormat}>
  <ToggleGroupItem value="OFFLINE">会場のみ</ToggleGroupItem>
  <ToggleGroupItem value="ONLINE">オンラインのみ</ToggleGroupItem>
  <ToggleGroupItem value="HYBRID">ハイブリッド</ToggleGroupItem>
</ToggleGroup>;

{
  format === "OFFLINE" && <PhysicalVenueFields />;
}
{
  format === "ONLINE" && <OnlineMeetingFields />;
}
{
  format === "HYBRID" && (
    <>
      <PhysicalVenueFields />
      <OnlineMeetingFields />
    </>
  );
}
```

`OnlineMeetingFields` サブコンポーネント:

```tsx
<RadioGroup value={meetingProvider} onValueChange={setMeetingProvider}>
  <RadioGroupItem value="MANUAL">
    手入力 (Zoom / Teams / 独自 URL)
  </RadioGroupItem>
  <RadioGroupItem value="GOOGLE_MEET">Google Meet で自動作成</RadioGroupItem>
</RadioGroup>;

{
  meetingProvider === "MANUAL" && (
    <Input
      type="url"
      name="meetingUrl"
      placeholder="https://..."
      required
      pattern="https://.*"
    />
  );
}

{
  meetingProvider === "GOOGLE_MEET" && (
    <Alert>公開時に Google Meet URL が自動発行されます</Alert>
  );
}
```

#### 8.2 Settings admin (`src/app/(admin)/admin/(dashboard)/settings/`)

`googleCalendarMeetEnabled` チェックボックスを含む section を **削除** (DROP に対応)。他の `googleCalendarReminderMinutes` は維持。

### 9. Email template 改修

#### 9.1 `EventRegistrationConfirmation` template

online / hybrid 時に参加 URL section を追加:

```tsx
{
  isEventVirtualAccessible(event) && event.meetingUrl && (
    <Section>
      <Heading as="h3">オンライン参加 URL</Heading>
      <Link href={event.meetingUrl}>{event.meetingUrl}</Link>
      <Text>開始時刻の 5 分前に上記 URL からご参加ください</Text>
    </Section>
  );
}
```

fixture の props に `meetingUrl: "https://meet.google.com/example"` / `format: "ONLINE"` を追加した preview を用意。

### 10. マイページ改修

登録済 event の詳細ページ (`/mypage/events/[registrationId]`) で `event.meetingUrl` を表示。ゲスト = claim token 経由の閲覧も同様。

### 11. Feature module gate

既存 `events` feature module gate に依存 (追加 gate なし)。`events` OFF の環境ではオンライン開催機能も自動的に利用不可 (公開ページ 404、admin メニュー非表示)。

## テスト戦略

### unit test

- `__tests__/unit/domain/events/venue.test.ts`: `formatEventVenueDisplay()` / `isEventVirtualAccessible()` の 3 format × 3 physical venue 組合せ
- `__tests__/unit/domain/events/commands.test.ts`: create/update command の Zod refine (format × provider × meetingUrl の全組合せ、CHECK 制約 mirror)
- `__tests__/unit/lib/google-calendar/events.test.ts`: `buildEventBody()` の `withMeet` per-event 判定 (meetEnabled 削除の影響確認)
- `__tests__/unit/lib/ical/index.test.ts`: `buildEventCalendar()` の URL / LOCATION field (OFFLINE / ONLINE / HYBRID)
- `__tests__/unit/architecture/enum-ssot.test.ts`: EVENT_FORMAT / MEETING_PROVIDER が prisma-types 経由でのみ import されているか (grep gate)

### integration test

- `__tests__/integration/events/online-format.test.ts`: 実 DB に対して migration 適用 → create / update / CHECK 制約違反 (MANUAL + URL 未入力) が DB 側で reject されることを確認
- `__tests__/integration/lib/google-calendar/meet-writeback.test.ts`: mocked GCal API に対して `withMeet: true` で create → 応答から Meet URL 抽出 → `writeBackMeetingUrl()` で Event.meetingUrl に保存されるフロー

### E2E (Playwright)

- `e2e/tests/admin-authenticated/events-create-online.spec.ts`: admin が「開催形態: ONLINE + provider: MANUAL + URL」を入力 → 公開 → 公開ページで JSON-LD `eventAttendanceMode: OnlineEventAttendanceMode` が出ることを確認
- `e2e/tests/public/event-detail-online.spec.ts`: 公開 event detail ページで「オンライン開催」ラベルは見えるが URL は見えない (a11y label 検証)
- 既存 event registration 完了 E2E に「登録完了メールに meetingUrl が入っていること」の assertion 追加

### architecture-boundaries

- CHECK 制約が migration に必ず含まれること (grep gate)
- `publicEventSelect` から `meetingUrl` を出力しないこと (公開 JSX で `event.meetingUrl` を直接参照する箇所は architecture rule で禁止)

## リスク & 未解決事項

### risk-1: Reservation ドメインの Meet URL 廃止による regression

**影響**: 現状 `Settings.googleCalendarMeetEnabled = true` の環境では**全 Reservation の GCal event に Meet URL 付与**されている。本改修で Reservation 側の Meet URL 発行を停止するため、物理 space 予約に Meet URL 発行を頼っていた運用フローがあれば regression。

**対策**:

- 実装前に本番 Settings 値を確認する pre-migration audit を writing-plans phase の Step 0 に含める。
  - Cloud SQL 経由: `bunx prisma studio` で `Settings` テーブル 1 行の `googleCalendarMeetEnabled` を目視、または `gcloud sql connect <instance> --database=... --user=...` + `SELECT "googleCalendarMeetEnabled" FROM "Settings";`
- `true` の場合の判断: 業界標準 (Cal.com / Calendly も room 予約に Meet 自動付与はしない) を踏襲するのが本質的解決。運用ヒアリングで「実質使っていない」なら計画通り廃止 (goal-9)。「毎回 Meet 付き予約を作る運用が定着している」なら「Reservation 側は `Settings.reservationMeetEnabled Boolean` を新設して分離維持」に fallback (spec の goal-9 を修正、その場合は spec 再ブレスト)。
- 検証タイミング: writing-plans skill 呼出前の user check-in で「本番 Settings.googleCalendarMeetEnabled は false ですか？」を確認。

### risk-2: 既存 event が全て OFFLINE で初期化される

**影響**: 既存イベントの format が全て `OFFLINE` に自動 backfill される。もし過去にオンラインで開催されたイベント (freetext addressDetail に URL 記述) があれば「format = OFFLINE + addressDetail に URL」の状態が残る。

**対策**:

- 実装前に `SELECT * FROM "Event" WHERE "addressDetail" ILIKE '%http%'` で検出。
- 該当があれば手動で `format = ONLINE, meetingProvider = MANUAL, meetingUrl = <extracted URL>` に backfill する SQL を migration に含めるか、事後手動 update。
- 該当なしなら特別な対応不要。

### risk-3: Google Meet 発行失敗の UX

**影響**: `meetingProvider = GOOGLE_MEET` に設定した event で、Workspace 権限が無く GCal API が Meet 発行失敗する場合、`Event.meetingUrl` は null のまま publish される可能性。

**対策**:

- `Event.calendarSyncError` field (既存) に error 内容記録 → admin UI で警告 badge 表示。
- 公開ページの「参加 URL は登録完了時にメールで」表示は維持 (登録完了時にも URL が無ければ「準備中」表示に fallback)。
- 業務 escalation: admin UI で「手動で URL を入力」ボタン → provider を MANUAL に切替 + meetingUrl 手入力を促す UX。

### risk-4: JSON-LD `VirtualLocation.url` 欠落による Google 検索 rich result 影響

**影響**: 業界標準 (Eventbrite / Meetup) に従い公開ページの JSON-LD で `VirtualLocation.url` を出力しない選択をしたが、Google 検索の Event rich result は url を **recommended** としており、無くても pass するが表示品質が落ちる可能性。

**対策**:

- 実装後 Google Search Console の「拡張」→「Event」レポートで警告有無を確認。
- 警告が出れば「登録完了ページの URL」等の placeholder URL (実際の Meet URL ではない landing page) を出力する fallback を追加検討。

## PR 分割案

Phase B.1 全体を **2 PR** で分割。各 PR は soft limit 300 行 / 10 file を目安に、CLAUDE.md の PR 粒度 rule に従う。

### PR 1: schema + domain + iCal / GCal

**対象ファイル**:

- `prisma/schema.prisma` (3 列追加 + 1 列 DROP + 2 enum 追加)
- `prisma/migrations/YYYYMMDDHHMMSS_add_event_online_format/migration.sql` (新規)
- `src/shared/lib/validations/enums/prisma-types.ts` (enum SSoT 追加)
- `src/shared/domain/events/venue.ts` (`formatEventVenueDisplay` / `isEventVirtualAccessible` 追加)
- `src/shared/domain/events/commands.ts` (Zod schema 拡張 + refine)
- `src/shared/domain/events/calendar-sync.ts` (`writeBackMeetingUrl` 追加、`getEventSlotsForCalendarSync` select 拡張)
- `src/shared/domain/events/public-queries.ts` / `admin-queries.ts` / `registration-queries.ts` (select 拡張)
- `src/shared/lib/google-calendar/events.ts` (`buildEventBody` per-event 判定、`settings.meetEnabled` 削除)
- `src/shared/lib/ical/index.ts` (`URL` field 追加)
- `src/shared/lib/calendar-sync/outbound` (Meet URL write-back callback)
- unit test (venue / commands / google-calendar / ical / enum-ssot)
- integration test (online-format DB / meet-writeback)

**サイズ見積り**: 400-500 行、13-15 file。soft limit 越えるが「schema + domain + integration」の 1 論理単位のため分割は逆に破綻的。

### PR 2: UI + JSON-LD + email + マイページ + E2E

**対象ファイル**:

- `src/app/(admin)/admin/(dashboard)/events/_components/EventLocationSpaceSelector.tsx` (ToggleGroup + OnlineMeetingFields)
- `src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx` (form field 追加)
- `src/app/(admin)/admin/(dashboard)/settings/_components/*` (googleCalendarMeetEnabled 削除)
- `src/app/(public)/events/[slug]/page.tsx` (会場表示 + 「URL はメールで」ラベル + EventJsonLd 3 値化)
- `src/app/(public)/mypage/events/[registrationId]/*` (meetingUrl 表示)
- `src/shared/email/templates/EventRegistrationConfirmation/` (URL section 追加 + fixture)
- E2E (admin-authenticated / public / email 確認)

**サイズ見積り**: 300-400 行、10-12 file。

## Rollout

1. **PR 1 merge** → main → 自動 deploy (breaking migration により計画ダウンタイム 5-10 分発生)
2. **既存 event の状態確認**: 全 event が `format = OFFLINE` になっていること、public ページで表示崩れが無いこと
3. **PR 2 merge** → main → 自動 deploy (通常 deploy)
4. **admin で試験 online event 作成** → JSON-LD 検証ツール (Google Rich Results Test) で `OnlineEventAttendanceMode` / `VirtualLocation` が拾われること確認
5. **登録完了メール** の meetingUrl 差込を実際の受信で確認
6. **Google Search Console** の Event 拡張レポート監視 (2-3 日以内)

## Phase B.2 (RRULE 繰返し予約) との関係

Phase B.1 で追加する `Event.meetingUrl` / `format` / `meetingProvider` は Phase B.2 で導入予定の `ReservationSeries` / `RecurrenceRule` と直交する。B.1 完了後、B.2 の brainstorming で以下を再設計:

- `Reservation.seriesId String?` + `Reservation.recurrenceRule String?` (RRULE text)
- 新規 `ReservationSeries` template model (`rrule`, `startAt`, `endAt`, template fields)
- iCal `.repeating(rrule)` + GCal `event.recurrence: string[]` の連携
- キャンセル 3 分岐 UI (this-only / this-and-following / series-all)
- EXCLUDE 制約 + advisory lock 新設 (`728357` 予約)
- SwitchBot passcode の per-instance 発行

**B.1 の設計判断は B.2 に影響しない** (Event と Reservation が独立、format は Event のみ)。
