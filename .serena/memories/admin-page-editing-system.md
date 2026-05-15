> **Snapshot: 2026-04-10**
> Pre-ADR-0018 state (field-helpers.ts API). Superseded by field-registry.ts migration (Zod 4 `.meta()` + `z.registry<T>()`).
> Preserved for historical reference only — do NOT treat as current-state documentation.

# Admin Page/Section Editing System — Complete Architecture

**Date**: 2026-04-10
**Focus**: How admins edit public page content via master-detail interface with schema-driven forms

## OVERVIEW

The system uses a **unified section-based editing model**:
- **22 section types** defined via Zod schemas with embedded field metadata
- **Master-detail UI** for page editing (left: section list + DnD, right: content/design panels)
- **Schema-driven form generation** (Zod introspection → auto-form rendering)
- **Data flow**: Admin Editor → Server Actions → Domain Commands → Prisma → DB → Public Page Renderer

---

## DATA MODEL (Prisma)

### Core Tables

#### `Page` (pages)
- `id`, `slug`, `title`
- `description`, `metaDescription`, `metaKeywords`
- `ogpTitle`, `ogpDescription`, `ogpImageUrl`
- `isPublished`, `publishedAt`
- `isActive`, `isSystemPage` (about, faq, contact → no content editing, SEO only)
- `contentWidth`, `contentWidthCustom`, `showSidebar`
- Relations: `sections[]`, `assignments[]` (UserPageAssignment)

#### `Section` (sections)
- `id`, `pageId` (null for homepage)
- `type` (string, e.g., "hero", "space-list", "features", "custom")
- `order` (display order, changeable via DnD)
- `isActive` (ON/OFF toggle)
- `title` (optional, admin display name for section)
- **`config` (JSON)** — type-specific settings validated by Zod schema
- **`design` (JSON)** — visual settings (shared across types): backgroundColor, padding, containerWidth
- **`contentJson` (JSON)** — Lexical EditorState (custom type only)
- **`contentHtml` (TEXT)** — rendered HTML cache (for display/search)
- `createdAt`, `updatedAt`

**Key constraint**: `type` field determines which Zod schema validates `config`.

---

## SECTION REGISTRY & DEFINITIONS

### 22 Section Types (in `src/shared/lib/sections/registry.ts`)

#### Hero/Layout (2)
- `hero` — Standard hero with buttons, overlay
- `hero-parallax` — Parallax background effect

#### Content (2)
- `custom` — Lexical editor + config (rich text)
- `concept` — Concept/showcase section

#### Lists (5)
- `space-list` — Dynamic space grid (queries DB)
- `space-showcase` — Feature space carousel (queries DB)
- `news-list` — Latest news cards (queries DB)
- `post-list` — Blog post grid (queries DB, category filter)
- `faq-list` — FAQ accordion (inline items OR DB categories)

#### Features/Social Proof (3)
- `features` — Icon + title + description grid
- `testimonial` — Testimonial cards
- `gallery` — Image gallery with lightbox

#### Functional (5)
- `cta` — Call-to-action button/banner
- `contact-form` — Embedded contact form
- `map` — Google Maps embed
- `embed` — Generic iframe embed
- `instagram` — Instagram feed widget

#### Event (1)
- `event-calendar` — Event calendar (not rendered via SectionRenderer)

#### Homepage-Specific (3)
- `homepage-hero`, `homepage-how-it-works`, `homepage-spaces`, `homepage-features`, `homepage-cta`

### Section Definition Pattern

Each type has:
```
definitions/<type>/
  ├── schema.ts      — Zod schema with embedded FieldMeta
  ├── metadata.ts    — Label, description, icon, category
```

Example: `hero/schema.ts`
```typescript
export const heroConfigSchema = z.object({
  title: field.text("タイトル").pipe(z.string().max(100)),
  subtitle: field.textarea("サブタイトル").pipe(z.string().max(300)),
  backgroundImageUrl: field.image("背景画像"),
  buttons: field.array("ボタン", {
    fields: {
      text: field.text("テキスト"),
      url: field.url("リンク先"),
      variant: field.select("スタイル", { options: ["primary", "secondary", "outline"], default: "primary" }),
      openInNewTab: field.boolean("新しいタブで開く"),
    },
  }),
  height: field.select("高さ", { options: ["sm", "md", "lg", "full", "custom"], default: "md" }),
  // ... more fields
});
```

---

## FIELD METADATA SYSTEM

### FieldMeta (Embedded in Zod `.describe()`)

Each field helper wraps the Zod schema with JSON-encoded metadata:
```typescript
interface FieldMeta {
  fieldType: "text" | "textarea" | "richtext" | "number" | "boolean" | 
             "select" | "color" | "image" | "url" | "icon" | "array" | "group";
  label: string;
  placeholder?: string;
  suffix?: string;
  helpText?: string;
}
```

### Field Helpers (`src/shared/lib/sections/field-helpers.ts`)

```typescript
field.text(label, opts)              // Single-line text
field.textarea(label, opts)          // Multi-line text
field.number(label, opts)            // Number with min/max
field.boolean(label, opts)           // Toggle/checkbox
field.select(label, opts)            // Dropdown enum
field.color(label, opts)             // Color picker
field.image(label, opts)             // Image URL
field.url(label, opts)               // URL validation
field.icon(label, opts)              // Icon name (Tabler Icons)
field.array(label, opts)             // Repeating object array
field.group(label, fields)           // Nested object
```

Example:
```typescript
field.text("Title", { placeholder: "Enter title", helpText: "Max 100 chars", default: "" })
  .pipe(z.string().max(100))
```

---

## ADMIN UI ARCHITECTURE

### Page Editing Screen (`pages/[slug]/edit/page.tsx`)

**Route**: `/admin/pages/[slug]/edit`

**Layout**: Master-detail (responsive flex/grid)
- **Left**: SectionSidebar + DnD reorder + section toggle/delete/duplicate
- **Right**: SectionDetailPanel with tabs (Content / Design)

### SectionMasterDetail Component

**State management**:
- `sections` — List of PageSectionData (from API fetch)
- `selectedId` — URL state (nuqs `?section=<id>`)
- `showAddDialog` — Add section dialog toggle

**Actions**:
- `handleSelect(id)` — Switch detail panel
- `handleToggle(id, isActive)` — Toggle section visibility
- `handleDelete(id)` — Remove section (with undo toast)
- `handleDuplicate(id)` — Clone section to end
- `handleReorder(reordered)` — Update display order
- `handleAddSection(type)` — Create new section

**Data flow**:
1. Load page + sections via `getPageForEdit(slug)`
2. Fetch section list: `fetchPageSections(pageId)` (API route)
3. On mutation → optimistic update → `updateTag(CACHE_TAGS.SECTIONS)`

### SectionDetailPanel

**Two tabs**:

#### Content Tab
- **Section Title** (admin name, optional, auto-filled by type)
- **AutoSectionForm** (schema-driven)
  - If `type === "custom"`: Lexical editor + config fields
  - Otherwise: Config fields only

#### Design Tab
- **DesignPanel** — Visual settings (shared across types)
  - `backgroundColor` (color picker)
  - `padding` (spacing presets)
  - `containerWidth` (width mode: xs/sm/md/lg/xl/full/custom)

### AutoSectionForm (`auto-section-form.tsx`)

**Input**: `section` (id, type, config, contentJson)

**Process**:
1. Get section definition via `getSectionDefinition(type)`
2. Extract Zod schema from registry
3. Parse schema → extract fields via `extractSchemaFields(schema)` (Zod introspection)
4. For each field, render appropriate component:
   - `text` → `<Input type="text">`
   - `textarea` → `<Textarea>`
   - `number` → `<Input type="number">` with suffix
   - `boolean` → `<Switch>`
   - `select` → `<Combobox>` (via AutoSelectField)
   - `color` → Color picker + input
   - `image` / `url` → URL input
   - `array` → AutoArrayField (repeating with add/remove)
   - `group` → AutoGroupField (nested fields)

**Submission**:
- Form data validated by Zod schema (via react-hook-form standardSchemaResolver)
- Save: `updatePageSection(sectionId, { config, contentJson? })`
- For custom type: include rendered Lexical editor JSON

### Inline Editor Components (`_shared/components/editor/inline/`)

Used for **News, Posts, FAQ** content with side panel metadata:
- `EditorHeader` — Title/status bar
- `SidePanelShell` — Layout wrapper
- `UnifiedSidePanel` — Tab-based side panel
- Side panel fields:
  - BasicInfoFields (title, slug, status)
  - ImageFields (thumbnail, OGP image)
  - SEOFields (meta description, keywords)
  - CategoryFields / TagFields (taxonomy)
  - OGPFields (preview data)
  - LayoutFields (content width, sidebar toggle)

---

## SERVER ACTIONS & MUTATIONS

### Main Server Actions (`_shared/actions/page-section.ts`)

```typescript
// Create new section
createPageSection(input: CreateSectionInput) 
  → createPageSectionCommand(input, contentHtml)
  → prisma.section.create()
  → updateTag(CACHE_TAGS.SECTIONS)

// Update section config/design/contentJson
updatePageSection(id, input: UpdateSectionInput)
  → updatePageSectionCommand(id, input, contentHtml?)
  → prisma.section.update()

// Toggle section visibility
togglePageSection(id, isActive)
  → togglePageSectionCommand()

// Reorder sections
updatePageSectionOrder(pageId, { sections: [{id, order}, ...] })
  → updatePageSectionOrderCommand()
  → prisma.$transaction() — atomic update all orders

// Delete section
deletePageSection(id)
  → deletePageSectionCommand()
  → prisma.section.delete()

// Duplicate section
duplicatePageSection(id)
  → duplicatePageSectionCommand()
  → prisma.section.create() with cloned config
```

### Validation & Error Handling

```typescript
// Input validation
createSectionSchema.safeParse(input)
updateSectionSchema.safeParse(input)

// Schema validation
validateSectionConfig(type, config) → ZodResult

// Error response
isMutationError(result) → boolean
createValidationMutationError(error)
```

### Caching Strategy

**Tags invalidated on mutation**:
- `CACHE_TAGS.SECTIONS` — All sections
- `CACHE_TAGS.PAGE_SECTIONS` — Page sections list
- `CACHE_TAGS.PAGES` — All pages
- `getCacheTag.pages.detail(pageId)` — Specific page detail

---

## DOMAIN LAYER (Commands)

### `src/shared/domain/sections/commands.ts`

**Command pattern** — All mutations go through domain commands:

1. **Validation** — Check page/section exists, validate config
2. **Transformation** — Convert contentJson → contentHtml (Lexical render)
3. **Persistence** — Execute Prisma operation
4. **Return** — Result with affected IDs for cache invalidation

**Key helpers**:
- `parseSectionConfig()` — Validate + fallback to default
- `parseJsonValue()` — Handle JSON field serialization
- `cloneJsonValue()` — Deep clone JSON for Prisma
- `ensurePageExists()` / `ensurePageSectionExists()` — Existence checks

---

## PUBLIC PAGE RENDERING

### SectionRenderer (`_shared/components/sections/section-renderer.tsx`)

**Input**: `PublicSection` from DB

**Process** (Phase B 以降):
1. Resolve style via `getDefaultSectionStyle(section.type)` — code-owned section render style SSoT（ADR 0021 で 4-tier cascade を撤回し、section type ごとの fixed style を返す pure function に集約。ADR 0017 は Superseded）。旧 `Section.design` / `parseSectionDesign` も廃止済み
2. Get default config via `getSectionDefinition(type).configSchema.safeParse(config)`
3. Switch on `section.type` → render appropriate component

**Component mapping**:
- `hero` → `StandardHeroSection`
- `hero-parallax` → `HeroSection`
- `space-list` → `SpaceListSection` (fetches spaces via `getShowcaseSpaces()`)
- `space-showcase` → `SpaceShowcaseSection`
- `features` → `FeaturesSection`
- `custom` → `CustomSection` (renders `contentHtml` as Prose)
- `news-list` → `NewsListSection` (fetches news via `getPublishedNews()`)
- `post-list` → `PostListSection` (fetches posts via `getPublishedPosts()`)
- `faq-list` → `FaqListSection` (uses inline config OR DB FAQ items)
- etc.

**Data fetching** (for list sections):
- Queries use `'use cache'` + `revalidateTag()` for updates
- No N+1: fetch all data in one query per section type

---

## FORM PATTERNS OBSERVED

### 1. Unified Form (config fields only)
- `hero`, `features`, `gallery`, `cta`, `map`, `embed`, `instagram`
- Config schema validates all user inputs
- Save: single mutation with updated config

### 2. Custom Type (Lexical + config)
- `custom` section
- Lexical editor state → JSON → contentJson field
- Config fields for additional options
- Save: both contentJson and config

### 3. List Sections (config for filtering/display)
- `space-list`, `news-list`, `post-list`, `faq-list`
- Config: maxItems, categoryId, showOnlyPublished, etc.
- Data loaded at render time (SectionRenderer)
- No storage of list items in DB (generated dynamically)

---

## CONTENT TYPES EDITABLE

### Text Content
- **Single-line**: Hero title, feature title, button text
- **Multi-line**: Subtitle, description
- **Rich text**: Custom section (Lexical editor)

### Media
- **Images**: Background images, thumbnails, gallery items (URLs)
- **Video**: Video embeds (URLs)

### Layout
- **Height/Width**: Predefined options + custom value
- **Spacing**: Padding presets
- **Columns**: Grid column count

### Data Relationships
- **Categories**: Select category for post/faq lists
- **Spaces**: Query all/published spaces (via config)
- **News/Posts**: Query published items (via config)

### Buttons/Links
- **Text**: Button label
- **URL**: Link destination
- **Style**: Variant (primary/secondary/outline)
- **Behavior**: Open in new tab toggle

### Colors
- **Color picker**: Hex input + visual picker
- **Background**: Overlay opacity

---

## KEY ARCHITECTURAL PATTERNS

### 1. Schema-Driven UI
- Zod schema = source of truth for field types
- Metadata embedded in `.describe()` JSON
- Introspection extracts fields → renders forms automatically
- No hand-coded form components per section type (except special cases)

### 2. Optimistic Updates
- Update UI immediately, show toast
- Background mutation via Server Action
- On error: reload data via fetch
- Undo toast for delete operations

### 3. Master-Detail Navigation
- Left sidebar selectable, drag-reorderable list
- Right detail panel with tabs
- URL state sync (`nuqs` → `?section=<id>`)
- Mobile responsive (toggleable list/detail)

### 4. Dirty State Guard
- Block navigation if form has unsaved changes
- Confirmation dialog before switching sections

### 5. Type-Safe Config Validation
- Zod schema defined alongside section type
- Runtime validation at every mutation boundary
- Fallback to defaults if config is invalid

### 6. Cache Invalidation Strategy
- Update tags on all mutations
- Tag revalidation targets multiple caches
- Ensures public page reflects editor changes immediately

---

## KNOWN LIMITATIONS & GAPS

1. **No visual preview during editing** — Config changes shown only on public page
2. **No collaborative editing** — Single admin at a time per section
3. **No version history** — No rollback to previous section configs
4. **No audit trail for sections** — AuditLog records page creation, not section edits
5. **list sections (faq-list) support dual source** — Inline items in config OR DB items. Mixing both unsupported.
6. **event-calendar section** — Not rendered via SectionRenderer, only `/events` page uses it directly
7. **No drag-drop file upload** — Image URLs must be entered manually or pre-uploaded to media library

---

## DATA FLOW SUMMARY

```
Admin Editor UI
    ↓
AutoSectionForm (schema-driven)
    ↓
React Hook Form (RHF) + Zod validation
    ↓
Server Action (updatePageSection)
    ↓
Domain Command (updatePageSectionCommand)
    ↓
Prisma update
    ↓
Database (sections.config, sections.design, sections.contentJson)
    ↓
Cache invalidation (updateTag)
    ↓
Public page revalidation
    ↓
SectionRenderer reads config from cache
    ↓
Component renders with updated values
```
