# Homepage Visual Restore — Design Spec

> **Date**: 2026-05-07
> **Status**: Approved (proceed)
> **Architecture**: Page Template Architecture (Phase 2+) — section variant pattern
> **Stance**: Destructive OK / no backward compatibility / official best practices

## §1 Context

### 1.1 What happened

Page Template Architecture **Phase 2** (commit `6236b514`, 2026-05-05) was a clean-break refactor that removed homepage 特例 — `getHomepagePublicData()` / `HomepageSections.tsx` / 4 `homepage-*` section types — and migrated `/` to the unified `getPageSectionsWithFallback("home")` + `<SectionRenderer>` template. Spec §11 explicitly accepted **valueProps band loss + carousel autoplay loss** as a regression.

### 1.2 What it cost visually

| Old (≤2026-05-04)                                                                        | New (2026-05-05〜) — current                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `EditorialSplitHero` (Page.pageHero)                                                     | **kept** — `Page.pageHero`                              |
| `HowItWorksSection` (3 numbered steps + 4 value props band)                              | `features` standard grid (3 items, no numbers, no band) |
| `SpacesCarousel` (autoplay overlapping cards, 536 LOC)                                   | `space-showcase` standard grid (featured + remaining)   |
| `FeaturesSection` (numbered editorial 4 items, `divide-y` structured list, italic 01–04) | `features` standard grid (4 items)                      |
| `CTASection`                                                                             | `cta` standard                                          |

Concretely: every body section below the hero was visually downgraded to a flat grid.

### 1.3 Today's silent throw (resolved in commit `d85b8b95`)

Independent issue surfaced 2026-05-07: `ctaConfigSchema.title` was `.min(1)` without `.default()`, so the `createTypedConfigGetterFromSchema` fallback `safeParse({})` failed and `SectionRenderer` threw, hiding the home CTA section behind the public ErrorBoundary. Combined with stale DB `layout.animateOnScroll: true` (legacy boolean) vs canonical enum, the home was crippled further. **Fixed in Step 0** (committed before this spec lands). Carries forward as a `safeParse({})` invariant for all section schemas.

---

## §2 Goals

1. **Restore the editorial visual quality** of the old homepage **without re-introducing homepage 特例**. All restoration lives inside the unified template + standard section types (variant pattern, Phase 4 precedent).
2. **Carousel pattern** for `space-showcase` — overlapping center-stage cards with **autoplay + prefers-reduced-motion auto-pause** + manual prev/next + touch swipe.
3. **Numbered editorial pattern** for `features` — italic `01` `02` `03` numbers with `divide-y` structured list; usable for both "ご利用の流れ" (3 steps) and "選ばれる理由" (4 features).
4. **Value props band** as a first-class standard section type (`value-props`) — usable on home **and** any other page (not embedded inside `features`).
5. **Destructive migration**: reseed `home` page Section rows to the new variant config. No data preservation.
6. `validate` + `build` exit 0 + manual smoke test of `/` confirms all 5 sections render.

## §3 Non-Goals

- **Not** re-introducing `homepage-*` section types or `HomepageSections.tsx`.
- **Not** restoring the `Settings.homepageSpacesAutoPlayInterval`–style global setting (autoplay interval lives inside `space-showcase` config).
- **Not** consolidating the legacy `validations/section.ts` schemas with `definitions/<type>/schema.ts` canonical (acknowledged ssot-singletons drift, separate ticket — too large for this PR).
- **Not** migrating non-home pages — `space-showcase` / `features` on other pages keep their current grid output by default.

---

## §4 Design Decisions

### 4.1 `features.displayLayout` — discriminated variant

Add a `displayLayout` field (Phase 4 precedent: `space-list.displayLayout` / `news-list.displayLayout` / `post-list.displayLayout`):

```ts
// definitions/features/schema.ts
const displayLayouts = ["grid", "numbered-steps", "numbered-editorial"] as const;

displayLayout: field.select("レイアウト", {
  options: displayLayouts,
  default: "grid",
  group: "design",
  helpText:
    "grid: カードグリッド / numbered-steps: 番号付き 3 ステップ + アイコン / numbered-editorial: 番号付き構造化リスト",
}),
```

Each variant renders inside the same `<FeaturesSection>` component via `switch (config.displayLayout)`.

| variant              | use case                         | layout                                                                                                                      |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `grid` (default)     | About / generic feature listings | Current `getCardGridColsClass(columns)` grid (kept as-is — back-compat for non-home pages)                                  |
| `numbered-steps`     | "ご利用の流れ" 3 ステップ        | Tabler Icon + 2.5rem italic 01/02/03 + step title + description (centered)                                                  |
| `numbered-editorial` | "選ばれる理由" structured list   | `divide-y border-y border-border` container + `grid-cols-[3rem_1fr]` (md: `grid-cols-[6rem_1fr]`) + 2rem/7xl italic numbers |

### 4.2 `space-showcase.displayLayout` — discriminated variant

```ts
// definitions/space-showcase/schema.ts
const displayLayouts = ["grid", "carousel"] as const;

displayLayout: field.select("レイアウト", {
  options: displayLayouts,
  default: "grid",
  group: "design",
}),
autoPlayInterval: field.number("オートプレイ間隔（秒）", {
  min: 0,
  max: 30,
  default: 5,
  suffix: "秒",
  group: "design",
  helpText: "0 で停止。3 秒以上推奨。reduced-motion 設定時は自動で停止します。",
}),
```

| variant          | layout                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grid` (default) | Current featured-first + remaining grid                                                                                                                                                |
| `carousel`       | Center-stage overlapping card carousel ported from old `spaces-carousel.tsx`. Autoplay (clamped min 3s, 0=off), pause on hover/focus, prev/next buttons, touch swipe, keyboard arrows. |

### 4.3 New section type: `value-props`

A new standalone section type in registry (21 → 22). Editorial flex-wrap band of icon + label pairs:

```ts
// definitions/value-props/schema.ts
const iconStyles = ["tabler", "none"] as const;

export const valuePropsConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "",
    maxLength: 50,
    subGroup: "text",
    helpText: "空のときラベル行を非表示",
  }),
  items: field.array("項目", {
    subGroup: "text",
    fields: {
      icon: field.icon("アイコン"),
      title: field.text("ラベル"),
    },
  }),
  iconStyle: field.select("アイコンスタイル", {
    options: iconStyles,
    default: "tabler",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});
```

Default content (matches old HowItWorks band):

```
items: [
  { icon: "IconClock",         title: "最短1時間から" },
  { icon: "IconCalendarCheck", title: "当日予約OK" },
  { icon: "IconWifi",          title: "Wi-Fi完備" },
  { icon: "IconCreditCard",    title: "オンライン決済" },
]
```

`<ValuePropsSection>` component renders flex-wrap centered with Tabler icons, no SectionLabel/heading by default (it's a band, not a section). Wrapped by `SectionWrapper` for padding/visibility/animate-on-scroll consistency.

**Why a new type, not a `features` variant**: value props serve a different rhetoric purpose (trust band / quick affordance) — having an independent type makes them composable on any page (e.g., between hero and content on /about, /access). Trying to share `items[]` shape with `features` would either bloat features (icon-only without description) or force awkward optional fields.

### 4.4 `DEFAULT_PAGE_SECTIONS.home` reseed

```
order  type            displayLayout         purpose
─────  ──────────────  ───────────────────   ───────────────────────────
0      features        numbered-steps        ご利用の流れ (3 steps)
1      value-props     —                     4 affordances band
2      space-showcase  carousel              厳選スペース
3      features        numbered-editorial    選ばれる理由 (4 items)
4      cta             —                     スペースを見る
```

`PAGE_TEMPLATES.home.allowedSectionTypes` adds `"value-props"`.

### 4.5 Migration strategy (destructive)

Drop and reseed all `Section` rows for the `home` Page in a single Prisma migration:

```sql
-- prisma/migrations/<TS>_reseed_home_sections/migration.sql
DELETE FROM "Section"
WHERE "pageId" = (SELECT "id" FROM "Page" WHERE "slug" = 'home');

-- Reinsert per DEFAULT_PAGE_SECTIONS.home (5 rows: features×2 / value-props / space-showcase / cta)
INSERT INTO "Section" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), (SELECT "id" FROM "Page" WHERE "slug" = 'home'), 'features', 'ご利用の流れ', '{...}'::jsonb, NULL, 0, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT "id" FROM "Page" WHERE "slug" = 'home'), 'value-props', NULL,        '{...}'::jsonb, NULL, 1, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT "id" FROM "Page" WHERE "slug" = 'home'), 'space-showcase', '厳選スペース', '{...}'::jsonb, NULL, 2, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT "id" FROM "Page" WHERE "slug" = 'home'), 'features', '選ばれる理由', '{...}'::jsonb, NULL, 3, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT "id" FROM "Page" WHERE "slug" = 'home'), 'cta', NULL,                '{...}'::jsonb, NULL, 4, true, NOW(), NOW());
```

Note: `Page.pageHero` (order=-1 hero) is untouched.

`prisma/seed.ts` (`seedPages` / `ensureSectionsForPage`) is updated alongside so a fresh DB seeds correctly without the migration.

---

## §5 Implementation Architecture

### 5.1 Schema variant pattern

Follows Phase 4 precedent (`space-list.displayLayout` / `news-list.displayLayout` / `post-list.displayLayout`). The `displayLayout` enum drives a `switch` inside the existing `<FeaturesSection>` / `<SpaceShowcaseSection>` Server Components. No new component file per variant — variants are sub-components inside the same module (e.g., `_features-numbered-steps.tsx` co-located).

### 5.2 Carousel port

Source: `spaces-carousel.tsx` from `git show 6236b514^`. Port as new file `_components/space-showcase/spaces-carousel.tsx` (Client Component).

**Improvements over old code**:

- **Reduced-motion**: old code used `useEffectEvent` for timer; preserved. Add explicit `useMotionPreference()` ref check before `setTimeout` to skip autoplay entirely under `prefers-reduced-motion: reduce`.
- **Pause on hover/focus**: WAI-ARIA APG carousel pattern requires this. Add `onPointerEnter` / `onFocusCapture` / `onPointerLeave` / `onBlurCapture` handlers.
- **Keyboard**: `ArrowLeft` / `ArrowRight` on the role="region" container.
- **`aria-roledescription="carousel"`** + `aria-live="polite"` per APG.
- **`autoPlayInterval: 0`** disables autoplay (config-driven, no settings dependency).
- All `scale` / `opacity` / `zIndex` distance-based logic (3 levels deep × 2 sides) ported as-is.

### 5.3 Numbered variants

`features` config `displayLayout` switch dispatches to:

- `<FeaturesGrid config style />` — current implementation extracted unchanged
- `<FeaturesNumberedSteps config style />` — port of `HowItWorksSection` step-grid logic. **No** value-props band (that's now `value-props` section).
- `<FeaturesNumberedEditorial config style />` — port of old `FeaturesSection` `divide-y` structured list.

Co-locate as `_components/features/_features-grid.tsx` / `_features-numbered-steps.tsx` / `_features-numbered-editorial.tsx`. Public export remains `<FeaturesSection>` from `_components/FeaturesSection.tsx`.

### 5.4 Value-props rendering

`<ValuePropsSection>` Server Component (`_components/ValuePropsSection.tsx`):

- Wrapped by `<SectionWrapper>` (consistent padding/visibility/animation).
- Optional `sectionLabel` (rendered as `<SectionLabel>` if non-empty).
- `items.map` → flex-wrap centered:

```tsx
<ScrollRevealGroup
  className="flex flex-wrap justify-center gap-x-10 gap-y-6 md:gap-x-16"
  stagger={0.08}
>
  {items.map((item) => (
    <div key={item.title} className="flex items-center gap-3">
      {item.icon && config.iconStyle === "tabler" && (
        <DynamicTablerIcon
          name={item.icon}
          className="text-accent"
          size={28}
          strokeWidth={1.2}
          aria-hidden="true"
        />
      )}
      <span className="text-[0.95rem] tracking-[0.02em] text-foreground/70">
        {item.title}
      </span>
    </div>
  ))}
</ScrollRevealGroup>
```

`DynamicTablerIcon` already exists for icon-name → component lookup (used by `features` items).

### 5.5 SectionRenderer dispatch

Add `case SectionType.VALUE_PROPS` (after `FEATURES`):

```ts
case SectionType.VALUE_PROPS: {
  const config = getValuePropsConfig(section.config);
  return <ValuePropsSection config={config} style={resolved} />;
}
```

`SectionType.VALUE_PROPS = "value-props"` constant in `validations/section.ts`. `section-defaults.ts` adds `getValuePropsConfig` via `createTypedConfigGetterFromSchema`. Both files are touched in lockstep (the canonical `definitions/<type>/schema.ts` is always the source of truth).

---

## §6 Testing strategy

| Layer       | What                                                                                                                  | Tool                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Unit        | Each new schema's `safeParse({})` returns full defaults (createTypedConfigGetterFromSchema fallback contract)         | `bun:test` (`__tests__/unit/domain/sections/registry.test.ts`)       |
| Unit        | Registry size 21 → 22, `value-props` exists, category placement                                                       | `bun:test` (existing registry test — update expected count)          |
| Unit        | Carousel index math (wrap-around, bounds, transition lock) extracted to pure function and unit-tested                 | `bun:test` (new `__tests__/unit/components/spaces-carousel.test.ts`) |
| Integration | `/` SSR returns 200 + 5 expected section markers (per type) in HTML                                                   | Playwright `e2e/public/homepage.spec.ts` (existing or new)           |
| Manual      | Carousel autoplay → pause on hover → resume on leave; `prefers-reduced-motion: reduce` disables autoplay; touch swipe | Manual smoke (Chrome DevTools)                                       |

## §7 Acceptance criteria

- `bun run validate && bun run build` exit 0
- `bun test __tests__/unit/domain/sections` exit 0 (size = 22, value-props category = "content")
- Fresh `prisma migrate dev` + `db:seed` produces a `/` page that renders all 5 sections (visual diff acceptable)
- Carousel: autoplay starts after mount, pauses on hover, resumes on leave, disabled under `prefers-reduced-motion: reduce`
- `value-props` is selectable in `/admin/pages/home/edit` AddSectionDialog (PAGE_TEMPLATES.home.allowedSectionTypes includes it)
- No `as` casts, no `useCallback` for ref-handlers (React Compiler), no `globals.css`, no `homepage-*` symbols re-introduced

## §8 Out of scope (followups)

- Legacy `validations/section.ts` ↔ `definitions/<type>/schema.ts` consolidation (separate ticket — ~17 component refactor)
- `value-props` migration to existing About/Access pages (use as-needed, content team decision)
- Carousel `<picture>` art-direction for low-bandwidth mobile (next/image already responsive — not blocking)
