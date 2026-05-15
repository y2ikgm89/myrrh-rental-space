# Reservation & Customer System - Complete Architecture

> ⚠️ **Snapshot: 2026-03-24** — 当時の構造分析。以下の path 参照は現在 stale:
> - `src/shared/domain/reservations/commands.ts` → `admin-commands.ts` / `customer-commands.ts` / `public-commands.ts` / `lifecycle-commands.ts` / `payment-commands.ts` に分割済
>
> schema.prisma の行番号も現状と乖離している可能性あり。現在の `src/shared/domain/reservations/` 配下を直接参照すること。

## 1. DATABASE MODELS

### Customer Model
**Location**: `prisma/schema.prisma` (lines 529-559)

**Fields**:
- `id` (UUID, PK)
- `lastName`, `firstName` (required strings)
- `lastNameKana`, `firstNameKana` (optional strings)
- `email` (unique string)
- `phoneNumber` (optional)
- `address` (optional, text)
- `status` (enum: NEW, REGULAR, VIP, INACTIVE, BLACKLIST) — **default: NEW**
- `notes` (optional, text)
- `totalReservations` (int, default: 0) — incremented on reservation creation/updates
- `totalSpent` (optional Decimal 10,2)
- `lastReservationAt` (optional DateTime)
- `firstReservationAt` (optional DateTime)
- `isActive` (boolean, default: true)
- `createdAt`, `updatedAt` (timestamps)

**Unique Constraints**:
- `email` (UNIQUE) — **KEY: Email is the unique identifier for customer lookup**

**Indexes**:
- `lastName`, `firstName`, `phoneNumber`, `status`, `isActive`, `lastReservationAt`, `(lastName, firstName)`

**Relations**:
- `reservations: Reservation[]` (one-to-many, cascade on delete)

---

### Reservation Model
**Location**: `prisma/schema.prisma` (lines 477-527)

**Fields**:
- `id` (UUID, PK)
- `spaceId` (UUID, FK → Space, cascade delete)
- `userId` (optional UUID, FK → User, set null on delete)
- `customerId` (UUID, FK → Customer, cascade delete) — **REQUIRED: links to customer**
- `startTime`, `endTime` (DateTime)
- `status` (enum: PENDING, CONFIRMED, CANCELLED) — **default: PENDING**
- `totalPrice` (optional Decimal 10,2)
- `notes` (optional text)

**Discount & Pricing**:
- `couponId` (optional UUID, FK → Coupon)
- `couponDiscountAmount` (optional Decimal 10,2)
- `durationDiscountAmount` (optional Decimal 10,2)
- `spaceDiscountAmount` (optional Decimal 10,2)
- `basePrice` (optional Decimal 10,2) — **price before discounts**

**Tax Info**:
- `taxRateType` (optional enum)
- `taxRate` (optional Decimal 5,2)
- `taxAmount` (optional Decimal 10,2)
- `totalPriceWithTax` (optional Decimal 10,2)

**Google Calendar Sync**:
- `googleCalendarEventId` (optional string)
- `googleCalendarOAuthEventId` (optional string)
- `calendarSyncedAt` (optional DateTime)
- `calendarSyncError` (optional text)

**Timestamps**: `createdAt`, `updatedAt`

**Indexes**:
- `spaceId`, `customerId`, `userId`, `startTime`, `endTime`, `status`, `createdAt`
- Composite: `(spaceId, startTime, endTime)`, `(customerId, startTime)`, `couponId`

**Relations**:
- `space: Space` (required)
- `user: User?` (optional)
- `customer: Customer` (required)
- `coupon: Coupon?` (optional)
- `termsAgreements: TermsAgreement[]` (one-to-many)

---

## 2. COMMAND LAYER (Write Operations)

### File: `src/shared/domain/reservations/commands.ts`

#### **`createAdminReservationCommand(input)`**
Creates reservation from admin dashboard.

**Input**:
```typescript
{
  spaceId: string;
  date: string;              // YYYY-MM-DD format
  startTime: string;         // HH:MM format
  endTime: string;           // HH:MM format
  customerId?: string;       // Option 1: existing customer ID
  customerData?: {           // Option 2: create/update customer by email
    lastName: string;
    firstName: string;
    email: string;
    phoneNumber?: string | null;
  };
  totalPrice?: number;       // Manual override
  couponCode?: string | null;
  manualDiscountAmount?: number;
  manualDiscountReason?: string | null;
  status: ReservationStatus;
  notes?: string | null;
}
```

**Process**:
1. Build start/end DateTime from date + time strings
2. Fetch space (must be `isActive: true`)
3. Check for overlaps via `checkReservationOverlap()`
4. Calculate basePrice = `space.hourlyPrice * hours`
5. Validate coupon if provided (check code, dates, limits, min amount)
6. Calculate final price with `calculateReservationPrice()`
7. **Transaction**:
   - Recheck overlap (race condition prevention)
   - **Customer resolution**:
     - If `customerId` provided: use directly
     - Else if `customerData` provided:
       - Try find by email
       - If not found: **CREATE** new customer
       - If found: **UPDATE** customer (lastName, firstName, phoneNumber)
   - Create Reservation with all pricing fields
   - Increment coupon `usageCount` if applied
   - Update customer fields:
     - `totalReservations: { increment: 1 }`
     - `lastReservationAt: new Date()`
     - `firstReservationAt: customer?.firstReservationAt ?? new Date()` (preserve if exists)

**Returns**:
```typescript
{
  id: string;
  notification: ReservationNotificationPayload;
  calendar: ReservationCalendarPayload;
}
```

#### **`updateAdminReservationCommand(id, input)`**
Updates existing reservation.

**Input**:
```typescript
{
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  customerId: string;        // Customer is fixed (no update)
  totalPrice?: number;
  couponCode?: string | null;
  status: ReservationStatus;
  notes?: string | null;
}
```

**Process**:
- Similar validation & pricing as create
- **Coupon handling**:
  - If coupon changed: decrement old coupon usageCount, increment new coupon usageCount
  - Handles null → id and id → null transitions
- Updates reservation in transaction
- Returns notification payload for email/calendar sync

#### **`updateReservationStatusCommand(id, status)`**
Simple status update (PENDING → CONFIRMED → CANCELLED).

**Returns** previous status + notification payload for sync.

#### **`updateReservationNotesCommand(id, notes)`**
Updates notes field only.

#### **`deleteReservationCommand(id)`**
Deletes reservation, returns googleCalendarEventId for cleanup.

#### **`createPublicReservationCommand(input)`**
Public form submission (no admin, no coupon, auto-set PENDING).

**Input**:
```typescript
{
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;    // Captured but not stored in Reservation model
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null;
  notes?: string | null;
}
```

**Process**:
- Space must be `isActive: true` AND `isPublished: true`
- No coupon validation
- `basePrice` = hourly price × hours (no discounts)
- **Customer handling** (same as admin):
  - Find by email
  - If not found: create
  - If found: update with provided data
- Create Reservation with `status: PENDING`, `totalPrice: basePrice`
- Update customer stats (totalReservations, lastReservationAt, firstReservationAt)

---

### File: `src/shared/domain/customers/commands.ts`

#### **`createCustomer(data: CustomerFormData)`**
**Process**:
1. Check email not already in use via `ensureEmailAvailable()`
2. Create customer with `status: "NEW"`, `isActive: true`
3. Return `{ id }`

#### **`updateCustomer(id, data: CustomerFormData)`**
1. Verify customer exists
2. Verify email not taken by another customer
3. Update all form fields (lastName, firstName, kanas, email, phoneNumber, address, notes)

#### **`updateCustomerStatus(id, status: CustomerStatus)`**
Update status enum only (NEW → REGULAR → VIP, etc).

#### **`updateCustomerNotes(id, notes)`**
Update notes field only.

#### **`toggleCustomerActive(id)`**
Flip `isActive` boolean.

#### **`deleteCustomer(id)`**
Delete customer (no cascade on Reservations — will fail if customer has reservations due to FK constraint).

---

## 3. QUERY LAYER (Read Operations)

### File: `src/shared/domain/reservations/admin-queries.ts`

#### **`getReservationsQuery(filters?, pagination?)`**
List reservations with filtering & pagination.

**Filters**:
- `status: ReservationStatus | "ALL"`
- `search: string` (searches customer name/email OR space name)
- `startDate, endDate: string` (date range for startTime)
- `spaceId: string`

**Pagination**: `{ page, limit, sortBy: "startTime" | "createdAt", sortOrder: "asc" | "desc" }`

**Returns**: customers array + total, page, limit, totalPages

**Selected fields**: id, spaceId, customerId, startTime/endTime, status, totalPrice, basePrice, couponId, couponDiscountAmount, durationDiscountAmount, notes, createdAt, updatedAt, space.{id, name}, customer.{id, firstName, lastName, email, phoneNumber}

#### **`getReservationByIdQuery(id)`**
Single reservation detail with coupon info.

#### **`getReservationsForCalendarQuery(startDate, endDate, spaceId?, status?)`**
Fetch reservations for calendar view (date range + optional space/status filter).

#### **`getReservationStatsQuery()`**
Dashboard stats: total, pending, confirmed, cancelled, todayCount, thisWeekCount.

#### **`getSpacesForReservationQuery()`**
List active, published spaces for dropdown (id, name, hourlyPrice).

---

### File: `src/shared/domain/customers/queries.ts`

#### **`getCustomers(filters?, pagination?)`**
List customers with filtering.

**Filters**:
- `status: CustomerStatus | "ALL"`
- `isActive: boolean`
- `search: string` (firstName, lastName, email, phoneNumber)

**Pagination**: `{ page, limit, sortBy, sortOrder }`

**Returns**: customers array + pagination metadata

#### **`getCustomerById(id)`**
Single customer with last 20 reservations (includes space name).

#### **`getCustomerStats()`**
Groupby status: total, new, regular, vip, inactive, blacklist.

#### **`searchCustomers(query)`**
Auto-complete search (min 2 chars, returns top 10, isActive only).

---

## 4. SERVER ACTIONS (HTTP Endpoints)

### Public Form
**File**: `src/app/(public)/_shared/actions/reservation.ts`

#### **`submitReservation(input: PublicReservationInput)`**
1. Validate input schema
2. Verify Turnstile token
3. Verify space belongs to location (security check)
4. Call `createPublicReservationCommand()`
5. Invalidate cache: RESERVATIONS, CUSTOMERS
6. Fire-and-forget: send admin notification email
7. Return `{ id }`

### Admin CRUD
**File**: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts`

#### **`createAdminReservation(input: AdminReservationInput)`**
Wraps `createAdminReservationCommand()` with:
- Validation via `adminReservationSchema`
- Audit logging (`executeAdminMutationResult`)
- Post-task: send emails, sync calendar (if `sendEmail: true`)
- Cache invalidation: RESERVATIONS, calendar cache

#### **`updateAdminReservation(id, input: UpdateReservationInput)`**
Wraps `updateAdminReservationCommand()` with:
- Validation
- Audit logging
- Post-task: calendar sync, optional notification email
- Cache invalidation

**File**: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`

#### **`updateReservationStatus(id, status)`**
- Validate status
- Call command
- **Smart post-tasks**:
  - If → CONFIRMED: send confirmation email, sync/update calendar
  - If → CANCELLED: send cancellation email, delete calendar event
- Cache invalidation

#### **`updateReservationNotes(id, notes)`**
Simple update + cache bust.

#### **`deleteReservation(id)`**
- Delete via command
- Fire-and-forget: delete calendar event if synced
- Cache invalidation

**File**: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts`

#### **`createCustomer(input)`**
#### **`updateCustomer(id, input)`**
#### **`updateCustomerStatus(id, status)`**
#### **`updateCustomerNotes(id, notes)`**
#### **`toggleCustomerActive(id)`**
#### **`deleteCustomer(id)`**

All wrapped with validation, audit logging, cache invalidation (CUSTOMERS tag).

---

## 5. KEY BUSINESS LOGIC

### Customer Lookup/Creation Strategy
**Pattern**: Email-based uniqueness

```
In both `createAdminReservationCommand` and `createPublicReservationCommand`:
1. If customerData.email provided:
   - Find customer by email
   - If exists: UPDATE (lastName, firstName, phoneNumber) — preserve other fields
   - If not exists: CREATE with provided data
2. Status always NEW for new customers
3. Customer stats auto-tracked: totalReservations, lastReservationAt, firstReservationAt
```

**Implication**: Two users with same email → **single customer record**. Phone/address updates only happen on explicit admin/form input, not merge-by-lookup.

### Pricing Pipeline
```
1. Base: hourlyPrice × hours
2. Discounts:
   - Coupon: validateCoupon() → amount capped by maxDiscountAmount
   - Duration: parseDurationDiscountRules() if enabled
   - Manual (admin only): stored in notes, not as separate field
   - Space: field exists but no command to set it
3. Combination: discountCombinationMode (likely SUM or MAX)
4. Final: calculateReservationPrice() → totalPrice, couponDiscount, durationDiscount
5. Storage: basePrice (before any discount) + couponDiscountAmount + durationDiscountAmount stored separately
```

### Coupon Tracking
- `usageCount` incremented on reservation create
- Decremented if changed during update
- Limits enforced: `usageLimit` (max total uses), `minReservationAmount` (base price threshold)
- Date range: `validFrom` ≤ now ≤ `validUntil`
- Can combine with duration discount: `canCombineWithDurationDiscount` flag

### Calendar Sync
- Triggered on: create (if admin), update, status change to CONFIRMED
- Deletes on: delete, status change to CANCELLED
- Handles OAuth (admin personal) + shared calendar events
- Fire-and-forget with error handling

### Customer Stats Auto-Update
**Always incremented on reservation creation**:
- `totalReservations++`
- `lastReservationAt = now`
- `firstReservationAt = now` (only if null before)

**Not auto-decremented on deletion** (audit trail preserved).

---

## 6. CACHE INVALIDATION TAGS
- `CACHE_TAGS.RESERVATIONS` — all reservation data
- `getCacheTag.reservations.list()` — paginated list
- `getCacheTag.reservations.calendar()` — calendar view
- `getCacheTag.reservations.detail(id)` — single reservation
- `CACHE_TAGS.CUSTOMERS` — all customer data
- `getCacheTag.customers.list()` — paginated list
- `getCacheTag.customers.detail(id)` — single customer

---

## 7. VALIDATION SCHEMAS

**Public Reservation**: `publicReservationSchema` — date, time, space, customer name/email, phone, Turnstile token

**Admin Reservation Create**: `adminReservationSchema` — all fields + customerData union + sendEmail flag

**Admin Reservation Update**: `updateReservationSchema` — space, date/time, customerId, status, optional notes, optional sendNotificationEmail

**Customer Form**: `customerFormSchema` — lastName, firstName, kanas, email, phone, address, notes