# Public-to-Admin Data Flow Analysis

**Analysis Date**: 2026-03-19

## Summary

Three primary data entry points exist on public pages, with significant gaps in two of them:

1. **Contact Form** — DUMMY (no persistence)
2. **Inquiry Form** — MISSING CREATE ACTION (can view but cannot submit)
3. **Reservation Form** — DUMMY (no persistence)

The admin can only create reservations/customers manually through `/admin/customers` and `/admin/reservations`.

---

## Form Analysis

### 1. Contact Form (`/contact`)

**Location**: `src/app/(public)/contact/_components/ContactForm.tsx`

**Type**: Dummy form (no submission)

**Current State**:
- Hard-coded fields: name, email, subject, message
- Submit button has `onSubmit={(e) => e.preventDefault()}`
- Shows "※ これはデモページです。実際の送信は行われません。"
- Form is also available as configurable section (`ContactFormSection`) in custom pages

**Database Model**: NO MODEL for contact submissions
- Inquiry model exists (id, name, email, subject, message, status, createdAt, updatedAt)
- But no `createInquiry` command exists in `src/shared/domain/inquiries/commands.ts`

**Admin View**: `/admin/inquiries` exists but purely read-only
- Can view inquiries (if they existed)
- Can change status (NEW → IN_PROGRESS → RESOLVED → CLOSED)
- Can delete inquiries
- No way to create them through public form

**Gap**: 
- ❌ Forms do NOT submit to DB
- ❌ No `createInquiry()` Server Action
- ❌ No API endpoint `/api/contact` or similar
- ❌ No email to admin on form submission

---

### 2. Reservation Form (`/reservation`)

**Location**: `src/app/(public)/reservation/_components/ReservationForm.tsx`

**Type**: Dummy 3-step form (no persistence)

**Current State**:
- Step 1: Date/time/capacity selection (hardcoded timeslots)
- Step 2: Customer info (name, email, phone, notes)
- Step 3: Confirmation (read-only summary with hardcoded ¥32,000 price)
- Final button: "予約を確定する" but no submit logic
- Shows "※ これはデモページです。実際の予約は行われません。"

**Database Model**: Reservation exists with full fields
- spaceId, customerId, startTime, endTime, status, totalPrice, notes
- Discount fields, tax fields, Google Calendar sync fields
- Has full relational integrity

**Admin View**: `/admin/reservations` exists with full CRUD
- List page with filters (status, date range, space, search)
- Can create, read, update, delete reservations
- Calendar view with month/week/day views
- Links to customer (customerId)

**Admin Actions**:
- `createAdminReservation()` — server action to create
- `updateAdminReservation()` — server action to update
- `updateReservationStatus()` — update status + send emails + sync Google Calendar
- `updateReservationNotes()` — update notes
- `deleteReservation()` — delete + remove from Google Calendar

**Admin Notifications**:
- `sendReservationConfirmationEmail()` — to customer
- `sendReservationCancelledEmail()` — to customer
- `sendReservationAdminNotification(reservation, type: 'new'|'update'|'cancel')` — to admin

**Gap**:
- ❌ Public form does NOT submit to DB
- ❌ No `createPublicReservation()` Server Action
- ❌ No `/api/reservations` endpoint
- ❌ Customers cannot make reservations online
- ❌ Google Calendar sync only works for admin-created reservations

---

### 3. Inquiry (Contact) Form via Sections

**Location**: `src/app/(public)/_components/ContactFormSection.tsx`

**Type**: Dummy form (same as ContactForm) used in custom pages via `SectionRenderer`

**Current State**:
- Configurable variant (default, split, minimal)
- Field toggles: showNameField, showPhoneField, showSubjectField
- Email + message always shown
- Same `e.preventDefault()` no-op submission

**Admin Editor**: Settings for contact form section
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/config-forms/ContactFormConfigForm.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/section-editor/ContactFormConfigForm.tsx`

**Gap**: Same as Contact form above

---

## Customer Data Entry

**Location**: `src/app/(admin)/admin/(dashboard)/customers/page.tsx`

**Type**: Admin-only CRUD

**Current State**:
- Customers can ONLY be created by admin through `/admin/customers/new`
- Customer form: `CustomerForm.tsx` (create) + `CustomerEditForm.tsx` (edit)
- Fields: lastName, firstName, email, phone, address, status (NEW/REGULAR/VIP/INACTIVE/BLACKLIST), notes

**No public customer registration**:
- No `/register` page
- No public form to create customer account
- No email verification flow
- Admin must manually add customers before they can make reservations

**Integration with Reservations**:
- Every reservation requires a `customerId`
- Admin must create customer first, then create reservation linked to them

**Gap**:
- ❌ No public customer registration flow
- ❌ Reservation form doesn't link to customer creation
- ❌ Requires manual admin intervention for every reservation

---

## Email/Notification System

**Location**: `src/shared/lib/email-service.ts`

**Current Email Functions**:
- `sendReservationConfirmationEmail(reservation)` — triggered when admin CONFIRMS reservation
- `sendReservationCancelledEmail(reservation)` — triggered when admin CANCELS reservation
- `sendReservationAdminNotification(reservation, type)` — notifies admin of status changes
- `sendWebhookRenewalNotification()` — for Google Calendar webhook renewals

**Current Email Triggers**:
- ✅ Reservation status change to CONFIRMED (sends to customer + admin)
- ✅ Reservation status change to CANCELLED (sends to customer + admin)
- ❌ NO email on contact form submission
- ❌ NO email on inquiry submission
- ❌ NO email on public reservation request

---

## Google Calendar Integration

**Location**: `src/shared/lib/calendar-sync.ts`

**Current Sync Points**:
- ✅ Admin creates/updates/deletes reservation → syncs to Google Calendar
- ✅ Webhook from Google Calendar → syncs back to DB
- ✅ Cron job for polling sync option

**Sync Methods**:
- Two-way sync (webhook + polling)
- One-way sync options

**Gap**:
- ❌ NO Google Calendar sync for public reservations (because they don't exist)

---

## Summary of Gaps & Inconsistencies

### Critical Gaps (No Implementation)

| Feature | Current State | Should Be | Impact |
|---------|---------------|-----------|--------|
| Public Contact Submission | Dummy form → no DB | → Create Inquiry | Customers can't contact |
| Public Reservation | Dummy form → no DB | → Create Reservation | Customers can't book |
| Customer Registration | Admin-only | → Public signup or form | Requires manual admin work |
| Contact Form Email | No email | → Email to admin | Admin unaware of inquiries |
| Inquiry Admin View | View-only | → No create, create needs action | Can't process submissions |

### Architecture Inconsistencies

1. **Inquiry Model Exists But Unused**
   - Schema has full Inquiry model (id, name, email, subject, message, status, createdAt)
   - Admin panel has full CRUD for inquiries
   - **But**: No way to create inquiries (no public form submission, no `createInquiry()` command)
   - Orphaned model: can only be viewed/managed, never created through normal flow

2. **Reservation Model Fully Implemented But Public Form Dummy**
   - Admin can create/manage all reservations
   - Full Google Calendar sync, email notifications, status workflow
   - **But**: Public form is dummy (no submission)
   - Customers must go through admin to make reservations

3. **Customer Model Requires Manual Admin**
   - Every reservation links to customer
   - Admin CRUD for customers exists
   - **But**: No public registration flow
   - Admin must create customer before customer can have reservations

4. **Email Service Ready But Unused**
   - Resend integration is set up
   - Functions exist for reservation emails
   - **But**: Not triggered by public form submissions

### Files to Review Before Implementation

1. **Inquiry Creation**: 
   - Need to add `createInquiry()` to `src/shared/domain/inquiries/commands.ts`
   - Need to add Server Action in admin actions (or public API route)

2. **Reservation Creation**:
   - Might use existing `createAdminReservation()` pattern
   - Or create public variant `createPublicReservation()`
   - Would need customer lookup/creation as part of flow

3. **Customer Registration**:
   - Decide: form on reservation page or separate `/register` page?
   - Need public Server Action to create customer
   - Email verification required?

4. **Form Submission Handlers**:
   - Add Server Actions in `src/app/(public)/_shared/actions/` directory
   - Or create API routes in `src/app/api/`

---

## Reservation Data Model (Complete)

```
Reservation {
  id, spaceId, userId?, customerId (required)
  startTime, endTime
  status (PENDING|CONFIRMED|CANCELLED)
  totalPrice, basePrice (before discounts)
  couponId?, couponDiscountAmount, durationDiscountAmount, spaceDiscountAmount
  taxRateType?, taxRate, taxAmount, totalPriceWithTax
  googleCalendarEventId, googleCalendarOAuthEventId
  calendarSyncedAt, calendarSyncError
  notes
  createdAt, updatedAt
}
```

All fields present to support full reservation lifecycle.
