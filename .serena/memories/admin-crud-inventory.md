# Admin CRUD Resources Inventory

**Generated**: 2026-03-13

## Summary

- **Total resources**: 16 (in `src/app/(admin)/admin/(dashboard)/`)
- **Resources with page.tsx**: 14 (audit-logs, coupons, customers, faq, inquiries, media, news, pages, posts, reservations, settings, spaces, staff, terms)
- **Resources without page.tsx**: 2 (locations, space-categories) — no root list page, only detail + create
- **ActionCell components**: 10 files
- **Files > 500 lines**: 34 in admin area (excluding lexical)
- **loading.tsx files**: 3 (all in /admin tree, none in individual resources)
- **error.tsx files**: 15 (14 resource-level + 1 dashboard-level)

## Resource Breakdown

| Resource | page.tsx | loading.tsx | error.tsx | new/ | [id]/ | [slug]/ | _components | Comments |
|----------|----------|-------------|-----------|------|-------|---------|-------------|----------|
| audit-logs | ✓ | - | ✓ | - | - | - | 3 | Read-only list |
| coupons | ✓ | - | ✓ | ✓ | ✓ | - | 5 | Full CRUD |
| customers | ✓ | - | ✓ | ✓ | ✓ | - | 5 | Full CRUD |
| faq | ✓ | - | ✓ | - | - | - | 3 | Complex tree (categories/, items/) |
| inquiries | ✓ | - | ✓ | - | ✓ | - | 3 | Read-only + detail |
| locations | - | - | - | ✓ | ✓ | - | 4 | No root page (detail + create only) |
| media | ✓ | - | ✓ | - | - | - | 8 | Gallery grid, no detail route |
| news | ✓ | - | ✓ | ✓ | ✓ | - | 5 | Full CRUD |
| pages | ✓ | - | ✓ | - | - | ✓ | 7 | Dynamic pages (no [id], has [slug]) |
| posts | ✓ | - | ✓ | ✓ | ✓ | - | 5 | Complex (categories/, comments/, tags/, taxonomy/) |
| reservations | ✓ | - | ✓ | ✓ | ✓ | - | 8 | Full CRUD, includes calendar/ |
| settings | ✓ | - | ✓ | - | - | - | 5 | Singleton (announcement-bar/, api/, business/, navigation/, notify/, site/, system/) |
| space-categories | - | - | - | - | - | - | 7 | No root page (inline dialogs in _components) |
| spaces | ✓ | - | ✓ | ✓ | ✓ | - | 8 | Full CRUD, includes category/location tabs |
| staff | ✓ | - | ✓ | ✓ | ✓ | - | 9 | Full CRUD + invitations (index.ts barrel) |
| terms | ✓ | - | ✓ | ✓ | ✓ | - | 5 | Full CRUD |

## ActionCell Components (10 files)

Line counts:

```
122 | space-categories: CategoryActionCell.tsx
 68 | terms: TermsActionCell.tsx
 63 | posts: PostActionCell.tsx
 60 | news: NewsActionCell.tsx
 31 | spaces: SpaceActionCell.tsx
 31 | locations: LocationActionCell.tsx
 31 | customers: CustomerActionCell.tsx
 25 | reservations: ReservationActionCell.tsx
 20 | inquiries: InquiryActionCell.tsx
 20 | coupons: CouponActionCell.tsx
```

Total ActionCell lines: ~472 lines across 10 files

## Top 34 Files > 500 Lines (Non-Lexical)

```
 1407 src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx
 1009 src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx
  889 src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/TaxonomyEditor.tsx
  643 src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx
  601 src/app/(admin)/admin/(dashboard)/settings/_components/homepage/HomepageTab.tsx
  543 src/app/(admin)/admin/(dashboard)/settings/_components/sections/InstagramSection.tsx
  531 src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/CategoryManager.tsx
  529 src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas.ts
  525 src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx
  518 src/app/(admin)/admin/(dashboard)/settings/_components/sections/ICalFeedSection.tsx
  514 src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemInlineEditor.tsx
  487 src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/TagManager.tsx
  476 src/app/(admin)/admin/(dashboard)/settings/site/_components/announcement-bar/CarouselSettings.tsx
  474 src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts
  473 src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts
  464 src/app/(admin)/admin/(dashboard)/_shared/lib/instagram.ts
  463 src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx
  452 src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx
  450 src/app/(admin)/admin/(dashboard)/settings/_components/sections/StripeSection.tsx
  419 src/app/(admin)/admin/(dashboard)/settings/_components/sections/GoogleCalendarSection.tsx
  418 src/app/(admin)/admin/(dashboard)/settings/_components/homepage/DesignPanel.tsx
  407 src/app/(admin)/admin/(dashboard)/settings/_components/sections/MeoSection.tsx
  405 src/app/(admin)/admin/(dashboard)/settings/_components/homepage/SectionEditor.tsx
  395 src/app/(admin)/admin/(dashboard)/settings/_components/sections/GoogleCalendarSection.tsx
  383 src/app/(admin)/admin/(dashboard)/coupons/_components/CouponForm.tsx
  378 src/app/(admin)/admin/(dashboard)/settings/site/_components/announcement-bar/AnnouncementBarManager.tsx
  375 src/app/(admin)/admin/(dashboard)/reservations/_components/CustomerSelector.tsx
  374 src/app/(admin)/admin/(dashboard)/_shared/components/cta-button-editor/CTAButtonEditor.tsx
  364 src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx
  356 src/app/(admin)/admin/(dashboard)/settings/_components/sections/TwoWaySyncSection.tsx
  349 src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx
  349 src/app/(admin)/admin/(dashboard)/pages/[slug]/seo/_components/PageSeoForm.tsx
  348 src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionMasterDetail.tsx
  346 src/app/(admin)/admin/(dashboard)/_shared/lib/ical.ts
```

## Component Naming Patterns

### Form Components (single-purpose input forms)
- `CouponForm.tsx` (coupons)
- `CustomerForm.tsx` (customers)
- `InviteForm.tsx` (staff)
- `LocationForm.tsx` (locations)
- `CategoryForm.tsx` (space-categories)
- `UserForm.tsx` (staff)
- `FaqCategoryForm.tsx` (faq)

### EditForm Components (update mode for existing records)
- `CustomerEditForm.tsx` (customers)
- `ReservationEditForm.tsx` (reservations)
- `SpaceEditForm.tsx` (spaces) — **1407 lines** ⚠️ needs split

### Editor Components (complex nested edit UI, often with inline state)
- `NewsEditor.tsx` (news)
- `PostEditor.tsx` (posts)
- `TermsInlineEditor.tsx` (terms) — **1009 lines** ⚠️ needs split
- `FaqItemInlineEditor.tsx` (faq) — **514 lines**
- `TaxonomyEditor.tsx` (posts/taxonomy) — **889 lines** ⚠️ needs split
- `CategoryEditor.tsx` (posts/categories)
- `TagEditor.tsx` (posts/tags)

### Detail Components (read-only + action layouts)
- `SpaceDetail.tsx` (spaces/[id])
- `ReservationDetail.tsx` (reservations/[id])
- `InquiryDetail.tsx` (inquiries/[id])
- `CustomerDetail.tsx` (customers/[id])
- `LocationDetail.tsx` (locations/[id])
- `SectionDetailHeader.tsx` (pages/[slug]/edit)
- `SectionDetailPanel.tsx` (pages/[slug]/edit)
- `SectionMasterDetail.tsx` (pages/[slug]/edit) — **348 lines**

### Dialog/Inline Components (inline UI, not full page)
- `CreateCategoryDialog.tsx` (space-categories)
- `EditCategoryDialog.tsx` (space-categories)
- `DeleteCategoryButton.tsx` (space-categories)
- `MediaDetailDialog.tsx` (media) — **364 lines**
- `MediaUploadDialog.tsx` (media) — **308 lines**

## Loading & Error Boundary Coverage

### loading.tsx (3 total)
- `src/app/(admin)/admin/loading.tsx` — outer boundary
- `src/app/(admin)/admin/(auth)/loading.tsx` — auth routes
- `src/app/(admin)/admin/(dashboard)/loading.tsx` — dashboard boundary
- **None at individual resource level** (relies on dashboard-level loading)

### error.tsx (15 total)
- `src/app/(admin)/admin/(dashboard)/error.tsx` — dashboard boundary
- Per-resource: audit-logs, coupons, customers, faq, inquiries, media, news, pages, posts, reservations, settings, spaces, staff, terms (14 resources)
- **audit-logs has no [id] route but has error.tsx** (read-only list)

## Files in _components Directories (Component Counts)

| Resource | Count | Files |
|----------|-------|-------|
| staff | 9 | InvitationActions, InvitationTable, InviteForm, index, StaffFilters, StaffStats, StaffTable, UserActions, UserForm |
| spaces | 8 | CategoryTabContent, LocationTabContent, SpaceActionCell, SpaceEditForm, SpaceFilters, SpaceManagementTabs, SpaceTabContent, SpaceTable |
| media | 8 | constants, hooks, MediaDetailDialog, MediaFilters, MediaGrid, MediaListWrapper, MediaTable, MediaUploadDialog |
| reservations | 8 | CustomerSelector, ReservationActionCell, ReservationEditForm, ReservationFilters, ReservationForm, ReservationStatusSelect, ReservationTable, TimeSlotSelector |
| space-categories | 7 | CategoryActionCell, CategoryFilters, CategoryForm, CategoryTable, CreateCategoryDialog, DeleteCategoryButton, EditCategoryDialog |
| pages | 7 | BulkActions, CreatePageDialog, DeletedPagesDialog, index, PageActions, PageFilters, PageListTable |
| coupons | 5 | CouponActionCell, CouponFilters, CouponForm, CouponStatusBadge, CouponTable |
| customers | 5 | CustomerActionCell, CustomerEditForm, CustomerFilters, CustomerForm, CustomerTable |
| news | 5 | NewsActionCell, NewsEditor, NewsFilters, NewsManagementTabs, NewsTable |
| posts | 5 | PostActionCell, PostEditor, PostFilters, PostsManagementTabs, PostTable |
| terms | 5 | TermsActionCell, TermsActiveSwitch, TermsAgreementsTab, TermsInlineEditor, TermsTable |
| settings | 5 | BusinessHoursSection, BusinessInfoSection, SettingsCard, SettingsLayout, SettingsTabs |
| audit-logs | 3 | AuditLogFilters, AuditLogStats, AuditLogTable |
| faq | 3 | FaqCategoryForm, FaqCategoryList, FaqItemInlineEditor |
| inquiries | 3 | InquiryActionCell, InquiryFilters, InquiryTable |
| locations | 4 | LocationActionCell, LocationFilters, LocationForm, LocationTable |

## Files Requiring Split (>500 lines)

**Critical candidates for refactoring** (component decomposition):

1. `SpaceEditForm.tsx` — **1407 lines** (40%+ over limit, multi-tab form)
2. `TermsInlineEditor.tsx` — **1009 lines** (2x limit, nested list + inline edit)
3. `TaxonomyEditor.tsx` — **889 lines** (77% over limit, tree + edit UI)
4. `FaqItemInlineEditor.tsx` — **514 lines** (3% over, can stay but borderline)
5. `LocationForm.tsx` — **525 lines** (5% over)
6. `BusinessHoursSection.tsx` — **643 lines** (29% over, settings tab)
