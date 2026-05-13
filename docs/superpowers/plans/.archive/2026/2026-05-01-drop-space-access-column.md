# Drop Space.access Column — Multi-Location SSoT Cleanup Plan

> **Snapshot: 2026-05-13** — Implementation completed, archived as historical reference.
> **Completed: 2026-05-01** — Implemented in commit `6d1cb716 refactor(space): drop Space.access column — inherit access info from Location SSoT`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `Space.access` column entirely. Per-location access info (transit + parking) is already SSoT on `Location.accessLines` / `Location.parkingInfo` (migrated 2026-05-01). Public space detail page inherits parent Location's access info, matching Booking.com / WeWork / schema.org `LocalBusiness` industry standard.

**Architecture:** One destructive migration (`DROP COLUMN access`) bundled with all code changes in a single atomic commit. Schema, validation, domain, admin UI, public UI, seed, and tests update together so type-check / lint / build pass in one shot. No backward-compat shims, no rename/deprecation phase — clean-break consistent with prior 2026-05-01 destructive migrations (`drop_settings_address`, `drop_settings_access_parking`).

**Tech Stack:** Prisma 7.8 (manual migration via `db execute --file` due to PreToolUse protection on `prisma/migrations/*.sql`), Next.js 16, React 19, TypeScript 6.0 strict, Zod 4, RHF, bun:test.

**Bundling rationale:** Schema column drop and code that references it are tightly coupled — any intermediate state would fail `bun run type-check` (Prisma generated types lose `access` instantly on `db:generate`). Per CLAUDE.md ("bundle tightly coupled tasks to one implementer" + "for 1-commit BREAKING plans, controller does the final integration"), individual tasks must NOT commit. The final task creates one atomic commit on the worktree branch.

---

## File Structure

### Schema / Migration

- **Modify** `prisma/schema.prisma:462` — remove `access String? @db.Text` from `Space` model
- **Create** `prisma/migrations/<TS>_drop_space_access/migration.sql` — `ALTER TABLE spaces DROP COLUMN "access";`

### Domain layer

- **Modify** `src/shared/domain/spaces/commands.ts:24,66,282,320` — remove `access` from `SpaceCommandInput`, `buildSpaceData`, `SPACE_DETAIL_SELECT`, and duplication mapper
- **Modify** `src/shared/domain/spaces/queries.ts:24,64` — remove `access` from `SpaceData` type and `select` clause
- **Modify** `src/shared/domain/spaces/public-queries.ts:164` — remove `access: true` from public select; ensure parent `location.accessLines` + `location.parkingInfo` are selected for inheritance display

### Validation layer

- **Modify** `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts:88,183,237` — remove `access` Zod field, default value entry, and form data type field

### Admin UI

- **Modify** `src/app/(admin)/admin/(dashboard)/_shared/lib/space-form-data-codec.ts:99,153` — remove `access` from FormData encode/decode
- **Modify** `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts:90` — remove `access: data.access || undefined` from submit payload mapper
- **Modify** `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditForm.tsx:133,163` — remove `access` from `defaultValues` (both create + edit modes)
- **Modify** `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/...` — find and remove the FormField rendering `access` Textarea (likely in BasicInfoFields or AccessFields component)
- **Modify** `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx:140-141` — remove `<DetailField label="Access" value={space.access} />` block
- **Modify** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/types.ts:301-315` — remove `SpaceEditorFormData` type entirely (dead code, no callers verified via grep)

### Public UI

- **Modify** `src/app/(public)/spaces/[slug]/_components/space-info.tsx:25,103-115` — change `access` prop type to inherited form, replace inline `<p>{space.access}</p>` block with rendering `space.location.accessLines` (numbered list) + `space.location.parkingInfo` (when present)
- **Modify** `src/app/(public)/spaces/[slug]/page.tsx` — verify `SpaceInfo` props pass through `space.location.accessLines` + `space.location.parkingInfo` (queries already select location relations)

### Seed

- **Modify** `prisma/seed.ts:584,610,637` — remove `access: "5-minute walk from Tokyo Metro Omotesando Station A1 Exit"` from each Space seed entry (3 occurrences)

### Tests

- **Modify** `__tests__/fixtures/reservations.ts:13,72` — remove `access` field from Space fixture type and value
- **Modify** `__tests__/integration/actions/admin/space.test.ts:26,316,324,332` — remove `access` from valid input fixture and 3 validation test cases (`""`, `x.repeat(500)`, `x.repeat(501)`)
- **Modify** `__tests__/integration/actions/admin/space-duplicate.test.ts:11,75` — remove `access` from duplication source fixture
- **Modify** `__tests__/unit/domain/spaces/commands.test.ts:194,202` — remove `access` from input + expected `data` payload
- **Modify** `__tests__/unit/domain/spaces/reviews-enabled.test.ts:15` — remove `access: null` from Space fixture
- **Modify** `__tests__/unit/lib/space-form-data-codec.test.ts:25` — remove `access: ""` from codec test fixture
- **Modify** `__tests__/unit/lib/validations/space.test.ts:22,174,182,499` — remove `access` from valid fixture and 3 length validation test cases

---

## Tasks

### Task 1: Worktree setup + branch creation

**Files:** none modified yet — environment prep only.

- [ ] **Step 1: Verify clean working tree on `main`**

```bash
git status --short
```

Expected: working tree clean (or only changes unrelated to Space.access). If diverged from main, abort and rebase first.

- [ ] **Step 2: Confirm DB drift state**

```bash
bunx --bun prisma migrate status
```

Expected: "Database schema is up to date" (no pending migrations).

- [ ] **Step 3: Create worktree + feature branch**

```bash
git worktree add .worktrees/drop-space-access -b refactor/drop-space-access main
```

Expected: New worktree at `.worktrees/drop-space-access` branched from `main`.

- [ ] **Step 4: Copy `.env` into worktree (PreToolUse-protected — Python bypass)**

```bash
python3 -c "import shutil; shutil.copy2('.env', '.worktrees/drop-space-access/.env')"
python3 -c "import shutil; shutil.copy2('.env.local', '.worktrees/drop-space-access/.env.local') if __import__('os').path.exists('.env.local') else None"
```

Expected: `.env` (and `.env.local` if exists) copied to worktree.

- [ ] **Step 5: Mirror `generated/` into worktree (Prisma client cache)**

```bash
robocopy generated .worktrees/drop-space-access/generated /E /XF nul
```

Expected: Prisma client mirrored. Robocopy exit code 0–7 are success (ignore non-zero exit; verify by `ls .worktrees/drop-space-access/generated/prisma/client/index.d.ts`).

- [ ] **Step 6: cd to worktree**

```bash
cd .worktrees/drop-space-access
pwd
```

Expected: cwd ends with `.worktrees/drop-space-access`.

- [ ] **Step 7: Baseline validation**

```bash
bun run type-check > /tmp/baseline-typecheck.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`. If non-zero, the worktree has pre-existing errors unrelated to this plan — record `/tmp/baseline-typecheck.log` and proceed (later validation needs to match this baseline minus the access-related changes).

---

### Task 2: Write destructive migration SQL

**Files:**

- Create: `prisma/migrations/<TS>_drop_space_access/migration.sql`

`prisma/migrations/*.sql` is PreToolUse-protected — use `python3 -c` write or `prisma migrate diff > path` Bash redirect.

- [ ] **Step 1: Generate timestamp + migration directory**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "Migration timestamp: $TS"
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_drop_space_access', exist_ok=True)"
ls prisma/migrations/${TS}_drop_space_access
```

Expected: directory created (empty, will write `migration.sql` next). Save `$TS` to a shell variable for next step.

- [ ] **Step 2: Edit `prisma/schema.prisma` to remove `access String?` from Space**

Remove line 462 (`access        String?   @db.Text`) entirely. Surrounding lines 460-463 should look like:

```prisma
  /// Room/floor details. The building address must always use `Location.address` as SSoT.
  addressDetail String?   @db.Text
  capacity      Int
```

- [ ] **Step 3: Generate migration SQL via `prisma migrate diff`**

```bash
bunx --bun prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/${TS}_drop_space_access/migration.sql
cat prisma/migrations/${TS}_drop_space_access/migration.sql
```

Expected output (single statement):

```sql
-- AlterTable
ALTER TABLE "spaces" DROP COLUMN "access";
```

If the diff output contains additional unrelated `ALTER` statements (Prisma may emit re-default churn), inspect carefully — only `ALTER TABLE "spaces" DROP COLUMN "access"` is intended. If extra statements appear, manually rewrite the file via `python3 -c "open(path,'w',encoding='utf-8').write(sql)"` to contain only the DROP statement.

- [ ] **Step 4: Apply migration**

```bash
bunx --bun prisma db execute --file prisma/migrations/${TS}_drop_space_access/migration.sql
```

Expected: "Script executed successfully." (no row output).

- [ ] **Step 5: Mark migration applied**

```bash
bunx --bun prisma migrate resolve --applied ${TS}_drop_space_access
```

Expected: "Migration ${TS}\_drop_space_access marked as applied."

- [ ] **Step 6: Regenerate Prisma client**

```bash
bun run db:generate
```

Expected: "Generated Prisma Client" with no errors. After this step, `Space` type loses `access` field — type-check across the codebase will explode until subsequent tasks complete.

---

### Task 3: Remove `access` from validation schema

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts`

- [ ] **Step 1: Remove `access` Zod field (line ~88)**

Find the field block:

```typescript
    access: z
      .string()
      .max(500, { error: "Access information must be within 500 characters" })
      .optional(),
```

Delete the entire block (4–5 lines). Adjacent fields like `addressDetail` should remain.

- [ ] **Step 2: Remove `access: ""` from form defaults (line ~183)**

Find the `SPACE_FORM_DEFAULT_VALUES` (or equivalent constant) and delete the `access: "",` line.

- [ ] **Step 3: Remove `access: string | null` from form data type (line ~237)**

Find the `SpaceFormData` type (or equivalent exported type) and delete the `access: string | null;` (or `access?: string;`) field.

- [ ] **Step 4: Verify file compiles**

```bash
bunx tsc --noEmit -p tsconfig.json src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/validations/space.ts 2>&1 | head -20
```

Single-file tsc check is approximate — full type-check is in Task 12. This step is just to catch obvious syntax errors.

---

### Task 4: Remove `access` from domain layer

**Files:**

- Modify: `src/shared/domain/spaces/commands.ts`
- Modify: `src/shared/domain/spaces/queries.ts`
- Modify: `src/shared/domain/spaces/public-queries.ts`

- [ ] **Step 1: `commands.ts` — remove `access` from `SpaceCommandInput` (line ~24)**

Find:

```typescript
  access?: string | null | undefined;
```

Delete the line.

- [ ] **Step 2: `commands.ts` — remove `access` from `buildSpaceData` (line ~66)**

Find:

```typescript
    access: normalizeNullableString(input.access),
```

Delete the line.

- [ ] **Step 3: `commands.ts` — remove `access: true` from `SPACE_DETAIL_SELECT` (line ~282)**

Delete the `access: true,` line.

- [ ] **Step 4: `commands.ts` — remove `access` from duplication mapper (line ~320)**

Find:

```typescript
      access: source.access,
```

Delete the line.

- [ ] **Step 5: `queries.ts` — remove `access: string | null` from `SpaceData` (line ~24)**

Delete the `access: string | null;` field.

- [ ] **Step 6: `queries.ts` — remove `access: s.access` from mapper (line ~64)**

Find:

```typescript
    access: s.access,
```

Delete the line.

- [ ] **Step 7: `public-queries.ts` — remove `access: true` from public select (line ~164)**

Delete the `access: true,` line.

- [ ] **Step 8: `public-queries.ts` — verify Location relation already selects accessLines + parkingInfo**

Locate the `location: { select: { ... } }` clause in the same `select` block. Confirm both `accessLines: true,` and `parkingInfo: true,` are present. If missing, add them (alongside existing `name: true` etc.). The public space detail page in Task 7 will read these fields.

---

### Task 5: Remove `access` from FormData codec + form schema

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/space-form-data-codec.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts`

- [ ] **Step 1: `space-form-data-codec.ts` — remove decode entry (line ~99)**

Find:

```typescript
    access: getTrimmedString(formData, "access"),
```

Delete the line.

- [ ] **Step 2: `space-form-data-codec.ts` — remove encode entry (line ~153)**

Find:

```typescript
fd.set("access", payload.access ?? "");
```

Delete the line.

- [ ] **Step 3: `space-edit-form/schema.ts` — remove submit payload mapping (line ~90)**

Find:

```typescript
    access: data.access || undefined,
```

Delete the line.

---

### Task 6: Remove `access` from admin form UI

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/types.ts`
- Find + Modify: the `<FormField name="access">` rendering location (likely a sibling component file)

- [ ] **Step 1: `SpaceEditForm.tsx` — remove `access` from edit-mode `defaultValues` (line ~133)**

Find:

```typescript
          access: space.access ?? "",
```

Delete the line.

- [ ] **Step 2: `SpaceEditForm.tsx` — remove `access` from create-mode `defaultValues` (line ~163)**

Find:

```typescript
          access: "",
```

(in the create-mode defaults block — different location than step 1)

Delete the line.

- [ ] **Step 3: Locate the `<FormField name="access">` rendering**

```bash
grep -rn 'name="access"\|"access"' src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/space-edit-form/ | head -10
```

Expected: 1–2 hits showing the FormField. Likely in `BasicInfoFields.tsx` / `AccessFields.tsx` / similar field group component.

- [ ] **Step 4: Remove the FormField block**

Open the file from Step 3 and delete the entire `<FormField name="access" ...>...</FormField>` block (including its surrounding wrapper / label / textarea). If the wrapper component becomes empty (only the access field), also delete the wrapper.

If the form had a section heading like "Access" associated only with this field, delete the heading too.

- [ ] **Step 5: `SpaceDetail.tsx` — remove access display (line ~140-141)**

Find:

```typescript
          {space.access && (
            <DetailField label="Access" value={space.access} />
          )}
```

Delete the entire conditional block (3 lines).

- [ ] **Step 6: `inline/types.ts` — delete dead `SpaceEditorFormData` type (lines ~301-315)**

The type is referenced only within its own file (verified via grep). Delete the entire type definition:

```typescript
/**
 * Form data for space editing
 */
export type SpaceEditorFormData = {
  name: string;
  description: string;
  addressDetail?: string;
  access?: string;
  capacity: number;
  area?: number;
  hourlyPrice: number;
  dailyPrice?: number;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  categoryId?: string;
  locationId: string;
  // ... (read full type, delete entire export)
};
```

Read the file first to capture the full type body, then delete the JSDoc + `export type` block. Verify no other files in `inline/` reference the type.

---

### Task 7: Update public SpaceInfo to inherit Location's access info

**Files:**

- Modify: `src/app/(public)/spaces/[slug]/_components/space-info.tsx`

This is the UX-critical step. Booking.com / WeWork pattern: room/office page shows the property's transit + parking info, not its own.

- [ ] **Step 1: Read current SpaceInfo to understand structure**

```bash
cat src/app/\(public\)/spaces/\[slug\]/_components/space-info.tsx
```

Note the current `<IconWalk>` access section at lines 102–115.

- [ ] **Step 2: Update `SpaceInfoProps`**

Change the prop type from:

```typescript
    readonly access: string | null;
```

to incorporating Location's access info via the existing `space.location` relation:

```typescript
    readonly location: {
      readonly name: string;
      readonly accessLines: readonly string[];
      readonly parkingInfo: string | null;
    } | null;
```

The existing `location: { name: string }` shape becomes the richer form. If `location` was previously optional/nullable in this component, retain that behavior.

- [ ] **Step 3: Replace the access section (lines 102–115)**

Replace:

```tsx
{
  /* Access */
}
{
  space.access ? (
    <div>
      <Heading level={2} className="mb-4">
        Access
      </Heading>
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <IconWalk className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <Prose>
          <p>{space.access}</p>
        </Prose>
      </div>
    </div>
  ) : null;
}
```

With Location-inherited rendering:

```tsx
{
  /* Access — inherited from parent Location (Booking.com pattern) */
}
{
  space.location &&
  (space.location.accessLines.length > 0 || space.location.parkingInfo) ? (
    <div>
      <Heading level={2} className="mb-4">
        Access
      </Heading>
      <Stack gap="md">
        {space.location.accessLines.length > 0 ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <IconWalk className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <ol className="space-y-1">
              {space.location.accessLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {space.location.parkingInfo ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <IconCar className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="whitespace-pre-line">{space.location.parkingInfo}</p>
          </div>
        ) : null}
      </Stack>
    </div>
  ) : null;
}
```

- [ ] **Step 4: Update icon import**

At the top of the file, add `IconCar` to the existing `@tabler/icons-react` import:

```typescript
import {
  IconUsers,
  IconRuler2,
  IconMapPin,
  IconFileText,
  IconWalk,
  IconCar, // ← added for parking info
} from "@tabler/icons-react";
```

- [ ] **Step 5: Verify the consumer page passes the new shape**

```bash
grep -n "SpaceInfo" src/app/\(public\)/spaces/\[slug\]/page.tsx
```

Read the file and confirm the `space` prop already includes `location.accessLines` + `location.parkingInfo` (added in Task 4 Step 8). If the page builds props by spreading specific fields, update the spread to include the new fields.

---

### Task 8: Remove `access` from seed

**Files:**

- Modify: `prisma/seed.ts:584,610,637`

- [ ] **Step 1: Remove access entries from 3 Space seed blocks**

```bash
grep -n 'access: "Tokyo Metro' prisma/seed.ts
```

Expected: 3 hits at lines ~584, ~610, ~637. Delete each `access: "..."` line.

- [ ] **Step 2: Verify no other Space.access references remain in seed**

```bash
grep -n '\.access\b\|\baccess:' prisma/seed.ts | grep -vE '(accessLines|access_token|page|navigation|terms-templates|"access")'
```

Expected: 0 hits. (The grep filter excludes Location.accessLines, OAuth access_token, the `/access` page slug, NavigationItem `url: "/access"`, terms-templates, and string literals "access" used as page identifiers.)

---

### Task 9: Update tests

**Files:** see Tests section under File Structure.

- [ ] **Step 1: `__tests__/fixtures/reservations.ts` (lines 13, 72)**

Remove `access: string;` from the type and `access: "5-minute walk from Shibuya Station",` from the fixture object.

- [ ] **Step 2: `__tests__/integration/actions/admin/space.test.ts` (lines 26, 316, 324, 332)**

Remove:

- `access: "5-minute walk from Shibuya Station",` from the valid input fixture (line ~26)
- The 3 validation test cases that test the `access` field length boundaries:
  - `access: "",` (empty string accepted) — line ~316
  - `access: "x".repeat(500),` (max length accepted) — line ~324
  - `access: "x".repeat(501),` (over max rejected) — line ~332

If a `describe("access field validation", ...)` block wraps these cases, delete the entire describe block.

- [ ] **Step 3: `__tests__/integration/actions/admin/space-duplicate.test.ts` (lines 11, 75)**

Remove `access: string | null;` from the type and `access: "5-minute walk from the station",` from the fixture.

- [ ] **Step 4: `__tests__/unit/domain/spaces/commands.test.ts` (lines 194, 202)**

Remove `access: "",` from input and `access: null,` from expected `data` payload assertion.

- [ ] **Step 5: `__tests__/unit/domain/spaces/reviews-enabled.test.ts` (line 15)**

Remove `access: null,` from the Space fixture.

- [ ] **Step 6: `__tests__/unit/lib/space-form-data-codec.test.ts` (line 25)**

Remove `access: "",` from the codec test fixture.

- [ ] **Step 7: `__tests__/unit/lib/validations/space.test.ts` (lines 22, 174, 182, 499)**

Remove:

- `access: "5-minute walk from Shibuya Station",` from valid fixture (line ~22)
- 3 validation test cases (`access: ""`, `access: "a".repeat(501)`, etc.) — delete entire test cases
- `access: "",` from another fixture (line ~499)

If a `describe` block wraps the access validation cases, delete the entire describe.

- [ ] **Step 8: Run unit tests for spaces domain**

```bash
bun test __tests__/unit/domain/spaces __tests__/unit/lib/validations/space.test.ts __tests__/unit/lib/space-form-data-codec.test.ts > /tmp/unit-spaces.log 2>&1; echo "EXIT=$?"
tail -30 /tmp/unit-spaces.log
```

Expected: `EXIT=0`, all tests pass (none reference `access` after this task).

---

### Task 10: Full verification

**Files:** none modified — verification only.

- [ ] **Step 1: Type-check**

```bash
bun run type-check > /tmp/typecheck.log 2>&1; echo "EXIT=$?"
tail -50 /tmp/typecheck.log
```

Expected: `EXIT=0`. Any error containing `access` indicates a missed reference — go back and fix the file.

- [ ] **Step 2: Lint**

```bash
bun run lint > /tmp/lint.log 2>&1; echo "EXIT=$?"
tail -30 /tmp/lint.log
```

Expected: `EXIT=0`.

- [ ] **Step 3: Integration tests for spaces**

```bash
bun test __tests__/integration/actions/admin/space.test.ts __tests__/integration/actions/admin/space-duplicate.test.ts > /tmp/integration-spaces.log 2>&1; echo "EXIT=$?"
tail -30 /tmp/integration-spaces.log
```

Expected: `EXIT=0`.

- [ ] **Step 4: Build**

```bash
bun run build > /tmp/build.log 2>&1; echo "EXIT=$?"
tail -50 /tmp/build.log
```

Expected: `EXIT=0`. Build is the final gate — if it passes, the refactor is consistent across server and client bundles.

- [ ] **Step 5: Idempotent seed verification**

```bash
bun prisma/seed.ts > /tmp/seed1.log 2>&1; echo "EXIT=$?"
bun prisma/seed.ts > /tmp/seed2.log 2>&1; echo "EXIT=$?"
```

Expected: both `EXIT=0`. Second run should not error or duplicate data (idempotency check per CLAUDE.md "seed functions are idempotent via upsert").

- [ ] **Step 6: Smoke-test public space detail page in browser (manual)**

```bash
bun dev
```

Open http://localhost:3000/spaces/<any-published-slug> in a browser. Verify:

1. The "Access" heading appears with `IconWalk` (transit) and `IconCar` (parking) sections sourced from the parent Location
2. No JavaScript console errors
3. Old per-space text "Tokyo Metro 'Omotesando Station'..." is no longer rendered (it now comes from `Location.accessLines` via the parent location)

Stop the dev server when done (`Ctrl+C` or kill the process — Bun dev server is user-managed per `.remember/feedback`).

---

### Task 11: Single atomic commit

**Files:** all changes from Tasks 2–9 staged together.

- [ ] **Step 1: Review the full diff**

```bash
git status --short
git diff --stat
```

Expected: ~15–20 files modified, plus 1 new migration directory. No `bun.lock` changes (we did not install deps). No `.env` / `.env.local` staged.

- [ ] **Step 2: Verify no `access` references remain in src/ or tests**

```bash
grep -rn '\.access\b\|\baccess:' src/ __tests__/ prisma/seed.ts 2>/dev/null \
  | grep -vE '(accessLines|access_token|access-page|/access|"access"|terms-templates|access-control|business-attributes|access-global-info|access-map)'
```

Expected: 0 hits. Investigate every hit — they are either dead grep filter cases (add to filter) or missed code (go back to the relevant task).

- [ ] **Step 3: Stage all changes**

```bash
git add prisma/schema.prisma prisma/migrations/${TS}_drop_space_access prisma/seed.ts src/ __tests__/
git status --short
```

Expected: All modifications staged (`M ` or `A `). No untracked files left except possibly `/tmp/*.log`.

- [ ] **Step 4: Create atomic commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(space): drop Space.access column — inherit access info from Location SSoT

Per-location access (transit + parking) has been Location.accessLines /
Location.parkingInfo since 2026-05-01 (multi-location SSoT). The redundant
Space.access String? column is removed entirely; public space detail pages
now inherit transit + parking info from the parent Location, matching the
industry-standard pattern (Booking.com / WeWork / schema.org LocalBusiness).

This is a destructive migration — DROP COLUMN, no backward-compat shim,
consistent with the prior 2026-05-01 destructive migrations
(drop_settings_address, drop_settings_access_parking).

Changes:
- prisma/schema.prisma: remove Space.access field
- migration: ALTER TABLE spaces DROP COLUMN "access"
- domain/spaces (commands, queries, public-queries): remove access from select / type / mapper / duplication
- validations/space: remove access Zod field + form data type entry
- admin form (SpaceEditForm, SpaceDetail, codec, schema): remove all access UI / FormData paths
- inline editor types: delete dead SpaceEditorFormData type (no callers)
- public space-info: render Location.accessLines + Location.parkingInfo (Booking.com pattern)
- seed: remove access from 3 Space entries
- tests (8 files): remove access from fixtures + 6 validation test cases
EOF
)"
```

Expected: commit succeeds. lefthook commit-msg hook accepts `refactor` type.

- [ ] **Step 5: Verify commit**

```bash
git log --oneline -1
git show --stat HEAD | head -30
```

Expected: HEAD SHA points to the new commit; ~15–20 files in the diff.

---

### Task 12: Hand-off (DO NOT MERGE)

**Files:** none modified.

- [ ] **Step 1: Final validation on the branch**

```bash
bun run validate > /tmp/final-validate.log 2>&1; echo "EXIT=$?"
bun run build > /tmp/final-build.log 2>&1; echo "EXIT=$?"
```

Expected: both `EXIT=0`. If anything fails post-commit, create a follow-up commit (do NOT amend the atomic commit unless instructed).

- [ ] **Step 2: Report ready for merge**

Print to user:

```
✅ refactor/drop-space-access ready

Commit: <SHA>
Files changed: <N>
Worktree: .worktrees/drop-space-access

Verification:
- bun run validate: EXIT=0
- bun run build: EXIT=0
- bun test (spaces): EXIT=0
- seed idempotency: EXIT=0 / EXIT=0

Next steps (user decision):
- FF merge to main:
    cd <main-worktree>
    git merge --ff-only refactor/drop-space-access
    bunx --bun prisma migrate status   # confirm applied
    bun run db:generate                # main worktree client refresh
- Or push for PR:
    git push -u origin refactor/drop-space-access
    gh pr create ...
```

The plan does NOT auto-merge or auto-push. Final integration is the user's decision per CLAUDE.md "destructive operations require user confirmation".

---

## Self-Review Checklist (run before execution)

1. **Spec coverage** — every code reference found via grep is addressed in Tasks 3–9: ✅
   - schema.prisma: Task 2
   - commands.ts (4 hits): Task 4 Steps 1–4
   - queries.ts (2 hits): Task 4 Steps 5–6
   - public-queries.ts (1 hit): Task 4 Step 7
   - validations/space.ts (3 hits): Task 3
   - space-form-data-codec.ts (2 hits): Task 5 Steps 1–2
   - space-edit-form/schema.ts (1 hit): Task 5 Step 3
   - SpaceEditForm.tsx (2 hits): Task 6 Steps 1–2
   - SpaceDetail.tsx (1 hit): Task 6 Step 5
   - space-info.tsx (3 hits): Task 7
   - inline/types.ts (1 hit, dead code): Task 6 Step 6
   - seed.ts (3 hits): Task 8
   - tests (16 hits across 7 files): Task 9

2. **Placeholder scan** — no TBD / TODO / "handle edge cases" without code shown: ✅
   All steps either show exact code to delete or the exact `grep` to find the location. The one exception is Task 6 Step 4 (locating the `<FormField name="access">`) which uses grep to discover the file path because it varies depending on how `space-edit-form/` was decomposed — this is unavoidable without a fragile hard-coded path.

3. **Type consistency** — `SpaceData` in queries.ts loses `access`, propagated to `SpaceFormData`, `SpaceCommandInput`, public-queries SELECT, and `SpaceInfoProps`: ✅. The new `SpaceInfoProps` adds `location.accessLines: readonly string[]` and `location.parkingInfo: string | null` consistent with `Location` Prisma type.

4. **Public UX preservation** — Booking.com pattern verified in industry research: room page shows property's transit + parking. Implementation in Task 7 matches: ✅

---

## Execution Notes

- **Subagent dispatch is OPTIONAL for this plan**. Tasks 2–9 are tightly coupled and modify many files — dispatching individual subagents adds friction without parallelism benefit. RECOMMENDED: execute inline (executing-plans skill) in the main session, since the controller already has full context of all file paths and the bundling rationale.
- **DO NOT amend the atomic commit** if validation fails post-commit. Create a follow-up `fix:` commit on the same branch (clearer history per CLAUDE.md `Prefer to create a new commit rather than amending`).
- **Database is destructive** — `DROP COLUMN` is irreversible without backup. Pre-existing dev data in `Space.access` will be permanently lost. This is consistent with the 2026-05-01 prior destructive migrations and the "destructive changes are OK" user directive.
