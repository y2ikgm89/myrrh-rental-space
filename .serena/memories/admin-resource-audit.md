# Admin Resources Complete Audit

**Audit Date**: 2026-03-13

## Summary Statistics
- **Total Resources**: 19
- **Resources with UNIFIED forms**: 11
- **Resources with SEPARATE create/edit forms**: 6
- **Resources with INLINE EDITORS**: 3
- **Resources with SPECIAL PATTERNS**: 3
- **Resources with NO listing page**: 1 (locations, space-categories)

---

## RESOURCE BREAKDOWN

### 1. audit-logs
**Route Pattern**: List only (read-only)
**Files**:
- `page.tsx` (list)
- `error.tsx`

**Components**:
- `AuditLogTable.tsx` (Table)
- `AuditLogFilters.tsx` (Filters)
- `AuditLogStats.tsx` (Stats display)

**Notes**: No create/edit, read-only resource

---

### 2. coupons
**Route Pattern**: `/coupons` (list) + `/coupons/new` + `/coupons/[id]` (detail)
**Files**:
- `page.tsx` (list)
- `error.tsx`
- `new/page.tsx` (create form)
- `[id]/page.tsx` (detail)

**Components**:
- `CouponForm.tsx` (unified create/edit form)
- `CouponTable.tsx` (Table)
- `CouponFilters.tsx` (Filters)
- `CouponActionCell.tsx` (Row actions)
- `CouponStatusBadge.tsx` (Status badge)
- `[id]/_components/CouponDangerZone.tsx` (Delete danger zone)

**Pattern**: UNIFIED form (CouponForm handles both create and edit)

---

### 3. customers
**Route Pattern**: `/customers` (list) + `/customers/new` + `/customers/[id]` (detail) + `/customers/[id]/edit`
**Files**:
- `page.tsx` (list)
- `error.tsx`
- `new/page.tsx` (create form)
- `[id]/page.tsx` (detail)
- `[id]/edit/page.tsx` (edit form)

**Components**:
- `CustomerForm.tsx` (create form)
- `CustomerEditForm.tsx` (edit form)
- `CustomerTable.tsx` (Table)
- `CustomerFilters.tsx` (Filters)
- `CustomerActionCell.tsx` (Row actions)
- `[id]/_components/CustomerDetail.tsx` (Detail display)
- `[id]/_components/CustomerDangerZone.tsx` (Delete danger zone)

**Pattern**: SEPARATE create and edit forms (CustomerForm + CustomerEditForm)

---

### 4. faq
**Route Pattern**: Multi-section (Categories + Items)
**Files**:
- `page.tsx` (tab interface for categories/items)
- `error.tsx`
- `categories/new/page.tsx` (create category)
- `categories/[id]/edit/page.tsx` (edit category)
- `items/new/page.tsx` (create item)
- `items/[id]/edit/page.tsx` (edit item)

**Components**:
- `FaqCategoryForm.tsx` (create/edit category form)
- `FaqCategoryList.tsx` (categories list)
- `FaqItemInlineEditor.tsx` (inline editor for items)

**Pattern**: INLINE EDITOR (FaqItemInlineEditor in the list), separate category form

---

### 5. inquiries
**Route Pattern**: `/inquiries` (list) + `/inquiries/[id]` (read-only detail)
**Files**:
- `page.tsx` (list)
- `error.tsx`
- `[id]/page.tsx` (detail)

**Components**:
- `InquiryTable.tsx` (Table)
- `InquiryFilters.tsx` (Filters)
- `InquiryActionCell.tsx` (Row actions)
- `[id]/_components/InquiryDetail.tsx` (Read-only detail)

**Pattern**: Read-only, no edit capability

---

### 6. locations
**Route Pattern**: `/locations/new` + `/locations/[id]` + `/locations/[id]/edit`
**Files**:
- **MISSING** `page.tsx` (no list page)
- `new/page.tsx` (create)
- `[id]/page.tsx` (detail)
- `[id]/edit/page.tsx` (edit)

**Components**:
- `LocationForm.tsx` (unified create/edit form)
- `LocationTable.tsx` (Table)
- `LocationFilters.tsx` (Filters)
- `LocationActionCell.tsx` (Row actions)
- `[id]/_components/LocationDetail.tsx` (Detail display)

**Pattern**: UNIFIED form, NO LIST PAGE (only accessed via edit, or listing not implemented yet)

---

### 7. media
**Route Pattern**: List only with grid/table toggle
**Files**:
- `page.tsx` (list)
- `error.tsx`

**Components**:
- `MediaGrid.tsx` (grid view)
- `MediaTable.tsx` (table view)
- `MediaListWrapper.tsx` (view switcher)
- `MediaFilters.tsx` (Filters)
- `MediaUploadDialog.tsx` (upload dialog)
- `MediaDetailDialog.tsx` (detail dialog)

**Pattern**: No create/edit pages, upload via dialog, details via dialog

---

### 8. news
**Route Pattern**: `/news` (list) + `/news/new` + `/news/[id]` (detail)
**Files**:
- `page.tsx` (tab interface)
- `error.tsx`
- `new/page.tsx` (create editor)
- `[id]/page.tsx` (detail)

**Components**:
- `NewsEditor.tsx` (Lexical editor for create/edit)
- `NewsTable.tsx` (Table)
- `NewsFilters.tsx` (Filters)
- `NewsActionCell.tsx` (Row actions)
- `NewsManagementTabs.tsx` (tab switcher)

**Pattern**: Lexical editor (NewsEditor), tab interface

---

### 9. pages
**Route Pattern**: Special - split between homepage (special) and custom pages ([slug])
**Files**:
- `page.tsx` (page listing)
- `error.tsx`
- `homepage/edit/page.tsx` (homepage editor)
- `homepage/edit/sections/[sectionId]/page.tsx` (section detail)
- `[slug]/edit/page.tsx` (custom page editor)
- `[slug]/sections/...` (section management routes)
- `[slug]/seo/...` (SEO management routes)

**Components** (homepage):
- `HomepageEditTabs.tsx` (tab switcher)
- `homepage/section-editor/*ConfigForm.tsx` (multiple section config forms)

**Components** ([slug]):
- `SectionMasterDetail.tsx` (master-detail layout)
- `SectionEditWrapper.tsx` (section editor wrapper)
- `SectionDetailHeader.tsx`
- `SectionDetailPanel.tsx`
- `SectionSidebar.tsx`
- `SectionSidebarItem.tsx`
- `SectionEmptyState.tsx`
- `AddSectionDialog.tsx`
- `config-forms/*ConfigForm.tsx` (section config forms)

**Pattern**: SPECIAL - master-detail architecture, section-based, inline section editors

---

### 10. posts
**Route Pattern**: Complex multi-section (Posts + Categories + Tags + Comments)
**Files**:
- `page.tsx` (tab interface)
- `error.tsx`
- `new/page.tsx` (create post)
- `[id]/page.tsx` (detail post)
- `categories/[id]/page.tsx` (edit category)
- `tags/[id]/page.tsx` (edit tag)
- `taxonomy/page.tsx` (manage categories & tags)
- `comments/page.tsx` (comments list)

**Components** (posts):
- `PostEditor.tsx` (Lexical editor)
- `PostTable.tsx` (Table)
- `PostFilters.tsx` (Filters)
- `PostActionCell.tsx` (Row actions)
- `PostsManagementTabs.tsx` (tab switcher)

**Components** (taxonomy):
- `CategoryEditor.tsx` (inline editor for categories)
- `TagEditor.tsx` (inline editor for tags)
- `CategoryManager.tsx` (category manager)
- `TagManager.tsx` (tag manager)
- `TaxonomyEditor.tsx` (wrapper)

**Components** (comments):
- `CommentTable.tsx` (Table)
- `CommentFilters.tsx` (Filters)
- `CommentStats.tsx` (Stats)

**Pattern**: INLINE EDITORS (CategoryEditor, TagEditor), Lexical editor (PostEditor), complex taxonomy management

---

### 11. reservations
**Route Pattern**: `/reservations` (table list) + `/reservations/calendar` (calendar view) + `/reservations/new` + `/reservations/[id]` + `/reservations/[id]/edit`
**Files**:
- `page.tsx` (list)
- `error.tsx`
- `new/page.tsx` (create)
- `[id]/page.tsx` (detail)
- `[id]/edit/page.tsx` (edit)
- `calendar/page.tsx` (calendar view)

**Components**:
- `ReservationForm.tsx` (create form)
- `ReservationEditForm.tsx` (edit form)
- `ReservationTable.tsx` (Table)
- `ReservationFilters.tsx` (Filters)
- `ReservationActionCell.tsx` (Row actions)
- `[id]/_components/ReservationDetail.tsx` (Detail display)
- `[id]/_components/ReservationDangerZone.tsx` (Delete)
- `calendar/CalendarViewWrapper.tsx` (calendar wrapper)
- `calendar/CalendarToolbar.tsx` (toolbar)
- `calendar/EventCell.tsx` (event cell)
- `calendar/EventDetailDialog.tsx` (event detail dialog)
- `calendar/views/MonthView.tsx` (month view)
- `calendar/views/WeekView.tsx` (week view)
- `calendar/views/DayView.tsx` (day view)
- `calendar/views/TimeColumn.tsx` (time column)
- `CustomerSelector.tsx` (customer picker)
- `TimeSlotSelector.tsx` (time slot picker)
- `ReservationStatusSelect.tsx` (status selector)

**Pattern**: SEPARATE forms, CALENDAR view with multiple views (month/week/day)

---

### 12. settings
**Route Pattern**: Multi-page settings hub with subtabs
**Files**:
- `page.tsx` (settings index/redirect)
- `error.tsx`
- `announcement-bar/page.tsx`
- `api/page.tsx`
- `business/page.tsx`
- `navigation/page.tsx`
- `notify/page.tsx`
- `site/page.tsx`
- `system/page.tsx`

**Components** (_components):
- `BusinessHoursSection.tsx`
- `BusinessInfoSection.tsx`
- `homepage/HomepageTab.tsx` (settings-specific homepage editor)
- `homepage/DesignPanel.tsx`
- `homepage/section-editor/*ConfigForm.tsx`

**Components** (site):
- `announcement-bar/AnnouncementBarManager.tsx`
- `announcement-bar/BarDialog.tsx`
- `announcement-bar/BarList.tsx`
- `announcement-bar/CarouselSettings.tsx`
- `announcement-bar/DesignPreview.tsx`
- `navigation/NavigationManager.tsx`
- `navigation/NavigationDialog.tsx`
- `navigation/NavigationList.tsx`
- `navigation/SortableNavItem.tsx`

**Pattern**: SPECIAL - settings hub with multiple independent pages, dialog-based editors for announcement bar and navigation

---

### 13. space-categories
**Route Pattern**: List only (inline editing via dialog)
**Files**:
- **MISSING** `page.tsx` (no list page)

**Components**:
- `CategoryForm.tsx` (form for create/edit)
- `CategoryTable.tsx` (Table)
- `CategoryFilters.tsx` (Filters)
- `CategoryActionCell.tsx` (Row actions)
- `CreateCategoryDialog.tsx` (create dialog)
- `EditCategoryDialog.tsx` (edit dialog)
- `DeleteCategoryButton.tsx` (delete button)

**Pattern**: No listing page, all management via dialogs, inline editors

---

### 14. spaces
**Route Pattern**: `/spaces` (tabbed list) + `/spaces/new` + `/spaces/[id]` + `/spaces/[id]/edit`
**Files**:
- `page.tsx` (tabbed interface)
- `error.tsx`
- `new/page.tsx` (create)
- `[id]/page.tsx` (detail)
- `[id]/edit/page.tsx` (edit)

**Components**:
- `SpaceEditForm.tsx` (unified create/edit form - used for both new and [id]/edit)
- `SpaceTable.tsx` (Table)
- `SpaceFilters.tsx` (Filters)
- `SpaceActionCell.tsx` (Row actions)
- `SpaceManagementTabs.tsx` (tab switcher)
- `SpaceTabContent.tsx` (spaces tab content)
- `CategoryTabContent.tsx` (categories tab content - reuses space-categories)
- `LocationTabContent.tsx` (locations tab content)
- `[id]/_components/SpaceDetail.tsx` (Detail display)

**Pattern**: UNIFIED form (SpaceEditForm), tabbed interface combining spaces + categories + locations

---

### 15. staff
**Route Pattern**: `/staff` (users + invitations) + `/staff/new` (invite) + `/staff/[id]` + `/staff/[id]/edit` (edit user)
**Files**:
- `page.tsx` (tabbed interface)
- `error.tsx`
- `new/page.tsx` (invite form)
- `[id]/page.tsx` (detail)
- `[id]/edit/page.tsx` (edit)

**Components**:
- `InviteForm.tsx` (invitation form)
- `UserForm.tsx` (user edit form)
- `StaffTable.tsx` (users table)
- `InvitationTable.tsx` (invitations table)
- `StaffFilters.tsx` (Filters)
- `UserActions.tsx` (user row actions)
- `InvitationActions.tsx` (invitation row actions)
- `StaffStats.tsx` (stats display)

**Pattern**: SEPARATE forms (InviteForm vs UserForm), tabbed interface (users + invitations)

---

### 16. terms
**Route Pattern**: `/terms` (list) + `/terms/new` + `/terms/[id]` + `/terms/[id]/edit`
**Files**:
- `page.tsx` (list)
- `error.tsx`
- `new/page.tsx` (create)
- `[id]/page.tsx` (detail)
- `[id]/edit/page.tsx` (edit)

**Components**:
- `TermsInlineEditor.tsx` (inline editor)
- `TermsTable.tsx` (Table)
- `TermsActionCell.tsx` (Row actions)
- `TermsActiveSwitch.tsx` (active toggle)
- `TermsAgreementsTab.tsx` (agreements display)

**Pattern**: INLINE EDITOR (TermsInlineEditor)

---

## COMPONENT NAMING PATTERNS SUMMARY

| Pattern | Count | Resources |
|---------|-------|-----------|
| **Unified Form** | 11 | coupons, customers(special), locations, spaces, reservations(special), faq(special), news(Lexical), posts(Lexical), staff(special), terms(special), media(n/a) |
| **Separate Create/Edit Forms** | 6 | customers, reservations, staff, [others combine in unified] |
| **Inline Editors** | 3 | faq (FaqItemInlineEditor), posts (CategoryEditor, TagEditor), terms (TermsInlineEditor) |
| **Lexical Editors** | 2 | news (NewsEditor), posts (PostEditor) |
| **Table Pattern** | All resources | [Table]Table.tsx |
| **Filters Pattern** | All resources | [Table]Filters.tsx |
| **ActionCell Pattern** | Most resources | [Table]ActionCell.tsx |
| **Detail Display** | Status-specific | [Table]Detail.tsx (inquiries, customers, reservations, locations, spaces) |
| **Dialog Pattern** | Media, space-categories, settings | [Resource]Dialog.tsx |

---

## SPECIAL PATTERNS BY RESOURCE

| Resource | Special Pattern | Description |
|----------|-----------------|-------------|
| **pages** | Master-Detail + Section Editors | Complex section-based page management with inline editors per section |
| **reservations** | Multi-view Calendar | Table list + Calendar (month/week/day views) + event dialogs |
| **settings** | Settings Hub | 7 independent sub-pages with modal dialogs for nested editors |
| **posts** | Taxonomy Management | Post + Categories (inline) + Tags (inline) + Comments |
| **news** | Lexical Editor | Rich text editor for news articles |
| **media** | Grid/Table Toggle + Dialog Dialogs | Upload via dialog, details via dialog, view toggle |
| **space-categories** | Dialog-only CRUD | All CRUD via dialogs, no dedicated list page |
| **locations** | No List Page | Missing listing page, only accessible via detail/edit routes |

---

## MISSING PAGES / INCONSISTENCIES

1. **locations**: No `page.tsx` (root list) - users must navigate via [id]/edit or external link
2. **space-categories**: No `page.tsx` (root list) - managed entirely via dialogs on spaces/categories pages

---

## FORM REUSE PATTERNS

| Form | Used in | Notes |
|------|---------|-------|
| `CouponForm.tsx` | `/coupons/new`, `/coupons/[id]` | Unified (create + edit via same form) |
| `CustomerForm.tsx` | `/customers/new` | Create only |
| `CustomerEditForm.tsx` | `/customers/[id]/edit` | Edit only |
| `LocationForm.tsx` | `/locations/new`, `/locations/[id]/edit` | Unified |
| `SpaceEditForm.tsx` | `/spaces/new`, `/spaces/[id]/edit` | Unified (name is "EditForm" but used for both) |
| `ReservationForm.tsx` | `/reservations/new` | Create only |
| `ReservationEditForm.tsx` | `/reservations/[id]/edit` | Edit only |
| `InviteForm.tsx` | `/staff/new` | Invite new staff |
| `UserForm.tsx` | `/staff/[id]/edit` | Edit user |

---

## ADMIN FORM BEST PRACTICES OBSERVATIONS

### Unified Forms (Better pattern):
- **coupons**: CouponForm handles both create and edit
- **locations**: LocationForm handles both
- **spaces**: SpaceEditForm (misnomer - actually unified)

### Separate Forms (When useful):
- **customers**: CustomerForm (create) + CustomerEditForm (edit) — allows UI variation
- **reservations**: ReservationForm (create) + ReservationEditForm (edit) — different fields/flows
- **staff**: InviteForm (send invitation) + UserForm (edit existing) — fundamentally different operations

### Lexical Editors:
- **news**: NewsEditor wraps Lexical
- **posts**: PostEditor wraps Lexical

### Inline Editors:
- **faq**: FaqItemInlineEditor in list
- **posts**: CategoryEditor, TagEditor in list
- **terms**: TermsInlineEditor in list
