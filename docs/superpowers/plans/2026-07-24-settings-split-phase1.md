# Settings schema split — Phase 1 plan

- Branch: `feat/settings-split-phase1-announcement-system`
- Spec: [2026-07-24-settings-schema-split-design.md](../specs/2026-07-24-settings-schema-split-design.md)
- Strategy: clean-break (CREATE + COPY + code switch + DROP). No dual-read/write.

## Scope

Move from `settings` singleton to:

1. `SettingsAnnouncementCarousel` (`settings_announcement_carousels`) — all `announcementBar*` carousel columns with clean names
2. `SettingsSystem` (`settings_systems`) — `maintenance*` + `cookieConsent*`

## Tasks

### 1. Prisma schema

- Add both models near `Settings` with `id @default("singleton")`, `createdAt`, `updatedAt`
- Remove moved columns from `Settings`

### 2. Migration (`settings_announcement_system_split`)

1. CREATE both tables (reuse `AnnouncementBarAnimation` / `AnnouncementBarDesignStyle` enums)
2. INSERT … SELECT from `settings` WHERE `id = 'singleton'` with column renames
3. INSERT default singleton rows if missing
4. DROP moved columns from `settings` (squawk `ban-drop-column` ignores)

### 3. Domain

| File                  | Change                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `announcement-bar.ts` | R/W `prisma.settingsAnnouncementCarousel`; map clean columns ↔ `announcementBar*` DTO                      |
| `commands.ts`         | `updateMaintenanceSettings` / `updateCookieConsentSettings` → `settingsSystem`; add `ensureSettingsSystem` |
| `queries/site.ts`     | cookie / maintenance reads → `settingsSystem`                                                              |
| `admin-queries.ts`    | assemble carousel + system from new models                                                                 |
| `types.ts`            | keep public DTO keys unchanged                                                                             |
| `prisma/seed.ts`      | upsert both new singletons                                                                                 |

### 4. Architecture test

`__tests__/unit/architecture/settings-phase1-split.test.ts`:

- `Settings` model must not contain `announcementBar`, `cookieConsent`, or `maintenanceMode`
- `src/` must not `prisma.settings` select old field names

### 5. Verify

```sh
bun run db:generate
bun run db:migrate --create-only --name settings_announcement_system_split  # edit SQL, then apply
bun scripts/run-tests.ts __tests__/unit/architecture/settings-phase1-split.test.ts
bun scripts/run-tests.ts __tests__/unit/domain/settings/announcement-bar.test.ts
bun scripts/run-tests.ts __tests__/unit/forms/settings-form-empty-optional.test.ts
bun run test:db:migrate
bun run validate
```

## Commits

1. `docs: add settings schema split design and phase 1 plan [ai-gen]`
2. `feat(db): settings announcement/system singleton split [ai-gen]`

## Deploy

Breaking migration → planned downtime mode on merge to main.
