# Section System Architecture Research

> **Snapshot: 2026-03-12** — Component-Driven Sections を使用していた頃の分析。VisualEffectsProvider / Three.js / PixiJS は 2026-03-18 以降に削除済み。Page-First Architecture (ADR 0016/0017/0021) が現状。

**Research Date**: 2026-03-12  
**Scope**: Complete survey of section system for migration planning

## 1. Prisma Schema (DB Layer)

**File**: `prisma/schema.prisma` (1000+ lines total)

### SectionType Enum (17 types)
```
HERO, HERO_PARALLAX, CUSTOM, CONCEPT, SPACE_LIST, SPACE_SHOWCASE, NEWS_LIST,
POST_LIST, FAQ_LIST, FEATURES, TESTIMONIAL, GALLERY, CTA, CONTACT_FORM, MAP,
EMBED, INSTAGRAM
```

### Core Models
- **Section** (base model): `id, pageId (FK), homepageId (FK), type (enum SectionType)`
  - `title, config (Json), design (Json), contentHtml, contentJson, order, isActive`
  - `createdAt, updatedAt`
- **HomepageSection** — static sections on homepage
- **PageSection** — custom page sections (managed via `/admin/.../[slug]/sections/` route)
- **Related tables**: `FAQ, News, Post, Space` (data sources for list sections)

## 2. Section Validation Schema (1544 lines)

**File**: `src/shared/lib/validations/section.ts`

### 17 Type-Specific Config Schemas (Zod)
Each SectionType has dedicated Zod schema:
- **Hero variants**: `HeroConfig, HeroParallaxConfig`
- **Content**: `CustomConfig (Lexical), ConceptConfig`
- **Lists**: `SpaceListConfig, SpaceShowcaseConfig, NewsListConfig, PostListConfig, FaqListConfig`
- **Social proof**: `FeaturesConfig, TestimonialConfig, GalleryConfig`
- **Functional**: `CtaConfig, ContactFormConfig, MapConfig, EmbedConfig, InstagramConfig`

### Unified Schemas (All 17 types)
```typescript
createSectionSchema(CreateSectionInput)
updateSectionSchema(UpdateSectionInput)
updateSectionOrderSchema(UpdateSectionOrderInput)
sectionDesignSchema(SectionDesign) ← shared across all 17 types
```

### Design Configuration (Unified)
**SectionDesign fields** — identical for all 17 section types:
- **Spacing**: `paddingTop, paddingBottom` (none/sm/md/lg/xl)
- **Background**: `backgroundColor, backgroundImage, backgroundGradient`
- **Layout**: `maxWidth (sm/md/lg/xl/full), containerWidth`
- **Text**: `titleSize, titleAlign, textColor`
- **Animation**: `sectionAnimation (none/fade/slide-up/parallax)`
- **Visual**: `showBorder, borderColor, borderWidth`

### Option Sets
Values exported: `heroHeightValues, imageAspectValues, cardStyleValues, containerWidthValues, gapSizeValues, contentPositionValues, overlayStyleValues, heroParallaxHeightValues, featuresLayoutValues, faqInitialOpenValues, galleryHoverEffectValues, conceptLayoutValues, etc.`

## 3. SectionRenderer (Dispatch Layer)

**File**: `src/app/(public)/_shared/components/sections/SectionRenderer.tsx` (256 lines)

### Architecture
- **Server Component** — async, performs DB queries for list sections
- **Switch-case dispatcher** — 17 cases on `section.type`
- **Unified design normalization**: `parseSectionDesign(section.design)` passed to all component types

### Data Flow Pattern (Example: SPACE_LIST)
```
SectionType.SPACE_LIST
  ↓ getSpaceListConfig(section.config)     [Zod parse + extract]
  ↓ getShowcaseSpaces(maxItems, showOnlyPublished)  [async DB query]
  ↓ map → SpaceListData[] (id, slug, name, description, capacity, hourlyPrice, area, mainImageUrl)
  ↓ <SpaceListSection config={} spaces={} design={} />
```

Similar patterns for: NEWS_LIST, POST_LIST, FAQ_LIST, SPACE_SHOWCASE

### Special Cases
- **CUSTOM**: Renders managed Lexical HTML + title + config
- **FAQ_LIST**: Dual source — `config.items` (inline JSON) OR `faqItems` DB table

## 4. Admin Config Forms (17 Components)

**Directory**: `src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/config-forms/`

### Registry Pattern (index.ts, 54 lines)
```typescript
export const configFormRegistry: Record<SectionType, ComponentType<ConfigFormProps>> = {
  [SectionType.HERO]: lazy(() => import("./HeroConfigForm")),
  [SectionType.HERO_PARALLAX]: lazy(() => import("./HeroParallaxConfigForm")),
  [SectionType.CUSTOM]: lazy(() => import("./CustomConfigForm")),
  [SectionType.CONCEPT]: lazy(() => import("./ConceptConfigForm")),
  // ... 13 more types (all lazy-loaded for code splitting)
}
```

### Form Components (17 files, 2.5–9.7 KB each)
- **HeroConfigForm.tsx** (8.1 KB)
- **HeroParallaxConfigForm.tsx** (9.7 KB)
- **CustomConfigForm.tsx** (4.9 KB)
- **ConceptConfigForm.tsx** (8.0 KB)
- **SpaceListConfigForm.tsx** (7.3 KB)
- **SpaceShowcaseConfigForm.tsx** (5.1 KB)
- **FeaturesConfigForm.tsx** (6.2 KB)
- **TestimonialConfigForm.tsx** (8.1 KB)
- **GalleryConfigForm.tsx** (8.7 KB)
- **FaqListConfigForm.tsx, NewsListConfigForm.tsx, PostListConfigForm.tsx** (5–6.3 KB)
- **CtaConfigForm.tsx, ContactFormConfigForm.tsx, MapConfigForm.tsx, EmbedConfigForm.tsx, InstagramConfigForm.tsx** (2.5–5.5 KB)

### Shared Pattern (shared.tsx, 1.4 KB)
```typescript
export interface ConfigFormProps {
  config: SectionConfig;
  onSave: (payload: ConfigFormSavePayload) => void;
}

export interface ConfigFormSavePayload {
  config: SectionConfig;
  design?: SectionDesign;  // optional design updates within form
}

export const FormActions = (...)  // shared Save/Cancel button layout
```

### All Forms Use
- React Hook Form + `standardSchemaResolver(Zod)`
- Input, Select, Textarea, Switch UI components
- Type-safe validation via Zod schemas

## 5. Server Actions (Admin Writing)

**File**: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts` (219 lines)

### Action Functions
```typescript
createPageSection(input: CreateSectionInput) → Promise<MutationResult>
updatePageSection(id: string, input: UpdateSectionInput) → Promise<MutationResult>
togglePageSection(id: string, isActive: boolean) → Promise<MutationResult>
updatePageSectionOrder(pageId: string, input: UpdateSectionOrderInput) → Promise<MutationResult>
deletePageSection(id: string) → Promise<MutationResult>
duplicatePageSection(id: string) → Promise<MutationResult<PageSectionData>>
```

### Pattern (All Actions)
1. Parse input with Zod schema
2. If `contentJson` present → render to HTML via `renderEditorStateToHtmlLazy`
3. Execute domain command (`createPageSectionCommand`, etc.)
4. Call `executeAdminMutationResult` (handles auth + audit log + error handling)
5. Revalidate cache tags on success

### Cache Management
```typescript
function revalidatePages(pageId?: string) {
  updateTag(CACHE_TAGS.SECTIONS);           // all sections
  updateTag(CACHE_TAGS.PAGE_SECTIONS);      // page sections only
  updateTag(CACHE_TAGS.PAGES);              // all pages
  if (pageId) updateTag(getCacheTag.pages.detail(pageId));  // specific page
}
```

### Export Types for Admin
```typescript
export type PageSectionData = {
  id, pageId, type, title, config, design, contentHtml, contentJson, order, isActive, createdAt, updatedAt
}

export type PageWithSections = { id, slug, title, sections: PageSectionData[] }

export type PageForEdit = {
  id, slug, title, isPublished, isSystem, metaDescription, metaKeywords,
  ogpTitle, ogpDescription, ogpImageUrl, sections: PageSectionData[]
}
```

## 6. Effects System (Experience Shell)

**Directory**: `src/app/(public)/_shared/components/effects/`

### ExperienceShell.tsx (23 lines)
Nested provider structure for scroll orchestration + visual effects:
```typescript
export function ExperienceShell({ children }: { children: ReactNode }) {
  return (
    <SmoothScrollProvider>                    {/* Lenis smooth scroll */}
      <ScrollOrchestratorProvider>            {/* scroll event coordination */}
        <VisualEffectsProvider>               {/* GSAP/Three.js/Pixi context */}
          {children}
          <PerformanceMonitor />              {/* web vitals tracking */}
        </VisualEffectsProvider>
      </ScrollOrchestratorProvider>
    </SmoothScrollProvider>
  );
}
```

### Provider Responsibilities
- **SmoothScrollProvider** — wraps Lenis for smooth scrolling
- **ScrollOrchestratorProvider** — centralizes scroll event listeners
- **VisualEffectsProvider** — provides GSAP/Three.js/Pixi instance context
- **PerformanceMonitor** — tracks Core Web Vitals

### Effect Subdirectories
- `effects/core/` — provider implementations + orchestration logic
- `effects/three/` — Three.js scene integrations
- `effects/pixi/` — PixiJS canvas integrations

## 7. Public Layout Usage

**File**: `src/app/(public)/layout.tsx` (200+ lines)

### Root Layout Structure
```
<html> <body>
  <SkipLink />
  <Header ... />
  <AriaLiveRegion />
  <NuqsAdapter>
    <AriaLiveProvider>
      <Suspense fallback={null}>
        <ExperienceShell>  {/* all below wrapped in single effect context */}
          {children}
        </ExperienceShell>
      </Suspense>
    </AriaLiveProvider>
  </NuqsAdapter>
  <Suspense fallback={null}> <Footer /> </Suspense>
  <Suspense fallback={null}> <DynamicContent /> </Suspense>
  <GraphJsonLd />
</body> </html>
```

### Key Points
- **ExperienceShell wraps `{children}`** — all sections render under unified effect providers
- **Suspense at layout level** — PPR environment requires async boundaries
- **DynamicContent** — Cookie banner, Analytics (deferred Suspense)
- **Fonts**: Noto Sans JP (body), Noto Serif JP (heading)

## 8. Section Components (Public Rendering)

**Directory**: `src/app/(public)/_shared/components/sections/`

### Files
- **SectionRenderer.tsx** (256 lines) — async dispatch layer
- **SectionWrapper.tsx** (5.6 KB) — reusable styling shell (margins, backgrounds, animation triggers)

### SectionWrapper Pattern
Wraps individual section components with:
- Background styling from `design.backgroundColor`
- Padding/spacing from `design.paddingTop/Bottom`
- Container max-width management
- Animation/scroll reveal effects triggered by ScrollOrchestratorProvider

## 9. Design Panel (Admin Editor)

**File**: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/DesignPanel.tsx` (150+ lines)

### Purpose
Edit `sectionDesignSchema` fields — unified editor for all 17 section types

### Props Pattern
```typescript
// Backward compat: homepage sections
interface HomepageDesignPanelProps {
  section: Serialized<HomepageSectionData>;
  onSave: () => void;
}

// Generic: page sections, future types
interface GenericDesignPanelProps {
  section: SectionDesignTarget;  // { id, type, design: unknown }
  onDesignSave: (design: SectionDesign) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
```

### Form Handling
- React Hook Form + `standardSchemaResolver(sectionDesignSchema)`
- `useWatch` for reactive updates
- `useTransition` for pending state during save
- Option inputs: paddingOptions, backgroundOptions, maxWidthOptions, titleSizeOptions, textAlignOptions, animationOptions

## 10. Existing Tests

**Files in `__tests__/`**:
1. `__tests__/unit/lib/validations/section.test.ts` — all 17 config schema + design schema validation
2. `__tests__/unit/lib/validations/section-design.test.ts` — SectionDesign parsing + defaults
3. `__tests__/unit/lib/validations/homepage-section.test.ts` — legacy HomepageSection schema compat
4. `__tests__/integration/actions/admin/page-section.test.ts` — Server Action integration tests

## Key File Paths (Quick Reference)

| Component      | File Path                                                    | Lines | Type         |
| -------------- | ------------------------------------------------------------ | ----- | ------------ |
| DB Schema      | `prisma/schema.prisma`                                       | 1000+ | Prisma       |
| Validation     | `src/shared/lib/validations/section.ts`                      | 1544  | Zod schemas  |
| Dispatch       | `src/app/(public)/_shared/components/sections/SectionRenderer.tsx` | 256 | Server Comp  |
| Form Registry  | `src/app/(admin)/.../sections/_components/config-forms/index.ts` | 54 | Type map     |
| Config Forms   | `src/app/(admin)/.../sections/_components/config-forms/*.tsx` | 17 × (2.5–9.7KB) | Form comps |
| Server Actions | `src/app/(admin)/.../_shared/actions/page-section.ts`        | 219   | Server funcs |
| Effects Shell  | `src/app/(public)/_shared/components/effects/ExperienceShell.tsx` | 23 | Wrapper      |
| Public Layout  | `src/app/(public)/layout.tsx`                                | 200+  | Root layout  |
| Design Panel   | `src/app/(admin)/...settings/.../DesignPanel.tsx`            | 150+  | Client comp  |
| Wrapper        | `src/app/(public)/_shared/components/sections/SectionWrapper.tsx` | 5.6KB | Styling     |

## Architecture Insights

### Data Flow (Public Page Render)
```
Database (Section + config JSON + design JSON)
    ↓
SectionRenderer.tsx (async Server Component)
    ├─ parseSectionDesign(section.design)
    ├─ switch(section.type)
    └─ getShowcaseSpaces() / getPublishedNews() / ... (async DB queries)
    ↓
Type-specific Component (SpaceShowcase, ConceptSection, FeaturesSection, etc.)
    ↓
SectionWrapper (spacing, background, animation context)
    ↓
ExperienceShell (scroll orchestration + effect providers)
    ↓
Page render (Header + sections + Footer)
```

### Admin Flow
```
Form Load → configFormRegistry lookup by SectionType
    ↓
React.lazy(ConfigForm) mounted
    ↓
useForm + sectionDesignSchema + config-type schema
    ↓
User edits config + optional design
    ↓
Server Action (createPageSection / updatePageSection)
    ↓
executeAdminMutationResult (auth + audit + command)
    ↓
Revalidate cache + Toast feedback
```

### Decoupling Points (Migration Candidates)
1. **Type enum + schema binding** — `SectionType` ↔ config schema (tight coupling by design)
2. **Config form registry** — lazy-loaded forms by type (extensible)
3. **Effect providers** — ExperienceShell (effect-agnostic, can add new providers)
4. **Design config** — SectionDesign (shared, but can extend with new fields)
5. **SectionRenderer dispatch** — pure switch-case (can add new types without touching existing cases)

## Migration Strategies

### Strategy A: Add New SectionType (Low Risk)
1. Add enum variant: `CUSTOM_VIDEO = "CUSTOM_VIDEO"` (example)
2. Create Zod schema: `CustomVideoConfig` 
3. Create form: `CustomVideoConfigForm.tsx`
4. Add to registry: `configFormRegistry[SectionType.CUSTOM_VIDEO] = lazy(...)`
5. Add case in SectionRenderer
6. Create component: `<CustomVideoSection config={} design={} />`
7. **Impact**: Isolated, no changes to existing types

### Strategy B: Extend SectionDesign (Medium Risk)
1. Expand `SectionDesign` schema with new fields
2. Update `DesignPanel.tsx` to render new controls
3. Update all 17 config forms (or auto-template generation)
4. **Impact**: Affects all section types, but pattern is consistent

### Strategy C: New Effect Provider (Medium-High Risk)
1. New provider in `effects/<domain>/`
2. Wrap sections conditionally in ExperienceShell
3. **Impact**: May conflict with existing scroll orchestration, needs testing

### Strategy D: Unified Animation System (High Risk)
1. Replace hardcoded GSAP patterns with config schema
2. New animation schema layer
3. Update all section components
4. **Impact**: Large surface area, extensive testing required

## Naming Conventions

- **Types**: `*Config`, `*Data`, `*Payload` (suffixes denote purpose)
- **Functions**: `get*Config`, `create*Command`, `update*Command`, `parse*`, `is*`
- **Schemas**: `*Schema`, `default*` (Zod patterns)
- **Props**: `config`, `design`, `spaces`/`news`/`posts`/`items` (consistent collections)
- **React components**: `<*Section>`, `<*ConfigForm>`, `*ActionCell`, etc.
- **Classes**: Tailwind + semantic tokens (`bg-background`, `text-primary`, `gap-6`)

## Critical Notes for Migration

1. **17-type binding** — Each config is unique, but all share `SectionDesign`
2. **Lazy loading strategy** — Forms lazy-loaded for admin code splitting
3. **Server Component dispatch** — SectionRenderer must remain async (DB queries)
4. **Dual source FAQ** — Supports inline + DB-driven config (unique edge case)
5. **Cache invalidation** — Multiple tags ensure consistency (`SECTIONS`, `PAGE_SECTIONS`, `PAGES`)
6. **Effects are layout-level** — ExperienceShell wraps entire public render tree
7. **Design decoupled** — DesignPanel generic, works for any section type
8. **Zod-first validation** — All configs use `standardSchemaResolver` for form safety
