# Terms Management Clean-Break Rebuild

> **Snapshot: 2026-05-02** — Pre-launch clean-break rebuild with no backwards compatibility.
> **Completed: 2026-05-05** — Terms rebuild closeout integrated into main; related WCAG / admin-table / lexical-storage / publish SSoT commits (`f9f803ba` / `f1d2d6b1` / `1116a1dd` / `fe7f6a09` / `b25b82a3`).

## Goal

Rebuild terms-of-service management with a simple UI aligned to Editorial Magazine. Remove the complex version state machine (`TermsVersion` table plus `TermsType` / `TermsStatus` enums, etc.) and replace it with a straightforward model: **store the latest version directly on `TermsDocument` and persist a snapshot on consent records** (same pattern as Stripe / Notion).

## Why

- Pre-launch: breaking changes are acceptable.
- Existing `TermsInlineEditorEdit.tsx` (~607 lines) mixes versioning, form, dialog, and delete flows—hard to maintain.
- Operators struggle to see what changed because edit vs preview look too different.
- Prisma `TermsType` enum forces migrations and is inflexible.

## Schema Design

### Old (remove)

- `Terms` + `TermsVersion` + `TermsAgreement` (three tables)
- `TermsType` (eight values) / `TermsStatus` (DRAFT / PUBLISHED / ARCHIVED) enums

### New (adopt)

```prisma
model TermsDocument {
  id        String   @id @default(uuid()) @db.Uuid
  type      String   @db.VarChar(64)        // VARCHAR for flexibility
  slug      String   @unique @db.VarChar(50)
  title     String   @db.VarChar(100)
  contentJson  Json                         // Lexical EditorState (latest only)
  contentHtml  String  @db.Text             // For SSR
  isPublished  Boolean @default(false)      // DRAFT/PUBLISHED/ARCHIVED -> boolean
  publishedAt  DateTime?
  requiredAtReservation Boolean @default(false)
  requiredAtInquiry     Boolean @default(false)  // New
  showInFooter Boolean @default(true)
  footerOrder  Int     @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?
  agreements   TermsAgreement[]
  @@index([type])
  @@index([deletedAt, isPublished])
}

model TermsAgreement {
  id        String   @id @default(uuid()) @db.Uuid
  termsId   String   @db.Uuid
  customerId   String? @db.Uuid
  guestEmail   String? @db.VarChar(255)
  contentSnapshot String @db.Text         // Full HTML at consent time (audit trail)
  contentHash     String @db.VarChar(64)  // sha256
  agreedAt   DateTime @default(now())
  context    String   @db.VarChar(64)    // "reservation"/"inquiry"/"signup"
  resourceId String?  @db.Uuid           // Reservation ID, etc.
  ipAddress  String?  @db.VarChar(45)
  userAgent  String?  @db.Text
  terms      TermsDocument @relation(fields: [termsId], references: [id], onDelete: Restrict)
  customer   Customer?     @relation(fields: [customerId], references: [id], onDelete: SetNull)
  @@index([termsId])
  @@index([customerId])
  @@index([resourceId])
  @@index([agreedAt])
}
```

## UI Design

| Page                      | Structure                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `/admin/terms`            | Master–detail (FAQ-style): terms list on the left, edit form + Lexical editor on the right |
| `/admin/terms/[id]/edit`  | Full-screen Lexical editor + Editorial Magazine prose (SSoT applied)                       |
| `/admin/terms/agreements` | Consent log list, CSV export, audit-oriented                                               |
| `/terms` (public)         | Index                                                                                      |
| `/terms/[slug]` (public)  | Detail                                                                                     |

Remove `/privacy` and consolidate under `/terms/privacy` (slug-based routing only).

## Phases

| #   | Phase                                                                                                                  | Files affected                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Delete legacy code + stub references + schema model drop migration                                                     | ~30 deletes + ~15 updates + 1 migration |
| 2   | New schema migration (`TermsDocument` + `TermsAgreement`) + `prisma generate`                                          | 1 migration                             |
| 3   | Rebuild domain (`validations/terms.ts` + `domain/terms/{admin-queries,public-queries,commands}.ts` + agreement helper) | ~5 new                                  |
| 4   | Admin UI (master–detail + edit + agreements audit page + actions)                                                      | ~10 new                                 |
| 5   | Public pages (`/terms` index + `/terms/[slug]` detail) + footer / cookie banner / sitemap integration                  | ~5 new + 5 updates                      |
| 6   | Wire `recordTermsAgreement()` into reservation / inquiry / signup forms                                                | ~5 updates                              |
| 7   | Seed + template rebuild (VARCHAR migration, simplification)                                                            | 2 updates                               |
| 8   | Tests + validate + build                                                                                               | Recreate tests                          |

## Notes

- Parallelism: Phases 4, 5, and 7 can run in parallel after Phase 3 completes.
- Prefer one commit per 2–1 step; bundle tightly coupled work.
- When using subagent dispatch, go through the `subagent-dispatch-template` skill.
