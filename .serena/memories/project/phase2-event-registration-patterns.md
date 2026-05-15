# Phase 2 イベント申込機能 — 既存パターン調査

> **Snapshot: 2026-04-01** — Investigation completed before EventRegistration implementation. File paths reflect tree state at investigation time (e.g. `src/shared/emails/` was later consolidated into `src/shared/lib/email/`).

2026-04-01 調査完了。以下は Event Registration 実装に必須の既存パターン。

## 1. 公開フォーム完全実装例（公開予約）

**ファイル**: `src/app/(public)/_shared/actions/reservation.ts`

パターン:
- Rate Limit チェック: `checkActionRateLimit(formSubmitRateLimiter)`
- Turnstile 検証: `validateTurnstile(token)`
- ドメインコマンド: `createPublicReservationCommand()`
- キャッシュ無効化: `updateTag(CACHE_TAGS.RESERVATIONS)` + detail + calendar タグ
- メール: `fireAndForget(sendReservationAdminNotification())`
- エラーハンドリング: `DomainError` で `createMutationError(error.message)`

重要: userId は `getCurrentUser()` で取得（login 不要）。getCustomerByUserId で Customer 検索→なければ `ensureCustomerLinked` で自動作成。

## 2. usePublicForm フック

**ファイル**: `src/app/(public)/_shared/hooks/use-public-form.ts`

```typescript
function usePublicForm<TInput, TOutput>(
  schema: StandardSchemaV1,
  action: (data: TInput) => Promise<MutationResult<TOutput>>,
  options?: { defaultValues?: DefaultValues<TInput> }
) => { form, isPending, onSubmit }
```

- react-hook-form + standard-schema resolver
- server error → form.setError(field, { type: "server", message })
- isPending は useTransition ベース

## 3. React Email テンプレート例

**ファイル**: `src/shared/emails/reservation-confirmation.tsx`

構造:
- Props 型定義（customerName, spaceName, startTime, endTime, totalPrice, reservationId, notes, addToCalendarLinks）
- @react-email/components: Html, Head, Body, Container, Heading, Text, Section, Hr
- スタイルオブジェクト（inline CSS）
- カレンダー追加リンク生成は reservation-emails.ts で実施

## 4. fireAndForget パターン

**ファイル**: `src/shared/lib/async-utils.ts`

```typescript
fireAndForget(promise, {
  operation: "sendReservationAdminNotification",
  category: ErrorCategory.EXTERNAL_API,
  severity: ErrorSeverity.LOW,
  context: { reservationId: "..." }
})
```

Promise 結果を待たず、error は `logError()` で記録。unhandled rejection を防ぐ。

## 5. マイページ予約一覧

**ファイル**: `src/app/(public)/mypage/page.tsx`

パターン:
- `verifyCustomerSession()` で認証
- `getCustomerByUserId(user.id)` で Customer 取得
- `getCustomerReservations(customer.id)` で予約一覧取得
- `getReservationDeadlineSettings()` で期限設定取得
- `buildReservationListItems()` で構造化
- `toPlainArray()` で Date → ISO 文字列変換

## 6. ensureCustomerLinked パターン

**ファイル**: `src/shared/domain/customers/link.ts`

```typescript
async function ensureCustomerLinked(user: { id, email, name }) {
  // 1. userId で紐づけ確認
  // 2. email で既存 Customer 検索 → userId 紐づけ
  // 3. 新規作成（P2002 競合対策）
  // 4. Welcome メール送信（fireAndForget）
}
```

CUSTOMER_PLACEHOLDER_NAME = "未設定"（LINE ログイン時に name がない場合）。

## 7. Event モデル（最新スキーマ）

**ファイル**: `prisma/schema.prisma`

```prisma
model Event {
  id                    String      @id @default(cuid()) @db.VarChar(30)
  title                 String      @db.VarChar(200)
  slug                  String      @unique @db.VarChar(100)
  description           String?     @db.Text
  contentJson           Json?
  thumbnailUrl          String?
  startTime             DateTime
  endTime               DateTime
  capacity              Int?
  price                 Int?
  location              String?     @db.VarChar(200)
  spaceId               String?     @db.Uuid
  status                EventStatus @default(DRAFT)
  registrationOpen      Boolean     @default(true)
  googleCalendarEventId String?     @unique
  publishedAt           DateTime?
  deletedAt             DateTime?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  space                 Space?      @relation(...)
  @@index([startTime, endTime])
  @@index([status])
  @@index([spaceId])
  @@index([deletedAt])
}

enum EventStatus { DRAFT, PUBLISHED, CANCELLED, ARCHIVED }
```

注: EventRegistration モデルは Phase 1 時点では未作成。

## 8. Turnstile Widget

**ファイル**: `src/app/(public)/_shared/components/ui/turnstile-widget.tsx`

```typescript
function TurnstileWidget({
  siteKey,         // null なら何も描画しない
  onVerify,        // (token) => void
  onExpire?,
  onError?,
  ref?
})
```

options: theme: "auto", size: "flexible", language: "ja", refreshExpired/refreshTimeout: "auto"

## 9. メール送信フロー

**ファイル**: `src/shared/lib/email/send.ts` + `contact-emails.ts` + `reservation-emails.ts`

```typescript
async function sendEmail(
  fn: (resend, from) => Promise<{ error: ... | null }>,
  context: Record<string, unknown>
): Promise<EmailResult>
```

- isEmailEnabled() と getResendClient() でグレースフルデグラデーション
- エラーは logError で記録（severity: MEDIUM）
- fireAndForget で呼び出し

contact-confirmation メールは name + subject + message。
reservation-confirmation メールは reservation-emails.ts で addToCalendarLinks（設定ベース）と iCal 添付を生成。

## 10. 検証スキーマ

publicReservationSchema:
- locationId, spaceId: uuid
- date: YYYY-MM-DD, startTime/endTime: HH:MM
- numberOfGuests: 1-500
- customerType, companyName, lastName, firstName, email, phoneNumber（optional）, notes（optional）
- agreeToTerms: true
- turnstileToken: optional
- refine: endTime > startTime, requireCompanyNameForCorporate

publicInquirySchema:
- customerType, companyName, lastName, firstName, email, subject, message, turnstileToken
- no customerType/companyName 検証

## 11. 公開コマンド/クエリ

**Events**: `src/shared/domain/events/commands.ts` + `public-queries.ts`

Commands:
- createEventCommand(EventFormInput) → { id, slug }
- updateEventCommand(id, EventFormInput)
- deleteEventCommand(id) → soft delete
- publishEventCommand(id)
- cancelEventCommand(id)

Public Queries (use cache):
- getPublishedEvents() → plain array
- getPublishedEventBySlug(slug) → plain object | null

## 12. キャッシュ構造

**ファイル**: `src/shared/lib/constants/cache.ts`

CACHE_TAGS: RESERVATIONS, INQUIRIES, CUSTOMERS, EVENTS
getCacheTag.reservations.detail(id), getCacheTag.customers.detail(id), getCacheTag.events.slug(slug)

Phase 2 は EVENTS キャッシュ追加、EVENT_REGISTRATIONS キャッシュ新規作成が必要。

---

## 実装フェーズ 2 チェックリスト

- [ ] EventRegistration モデル追加 (Prisma)
- [ ] createEventRegistrationCommand() 作成
- [ ] getCustomerEventRegistrations() 作成（マイページ用）
- [ ] submitEventRegistration() Server Action 作成（reservation.ts パターン参照）
- [ ] useEventRegistrationForm フック（usePublicForm をラップ）
- [ ] eventRegistrationSchema 作成
- [ ] EventRegistrationConfirmationEmail テンプレート作成
- [ ] EventRegistrationAdminNotificationEmail テンプレート作成
- [ ] sendEventRegistrationConfirmationEmail() 作成
- [ ] sendEventRegistrationAdminNotification() 作成
- [ ] マイページ event-registrations セクション作成
