---
paths:
  [
    "__tests__/unit/architecture-boundaries.test.ts",
    "__tests__/unit/architecture/**",
    "src/shared/lib/**",
    "src/shared/domain/**",
  ]
---

# Architecture allowlist policy

Mechanical SSoT for allowlist **contents** lives in
`__tests__/unit/architecture-boundaries.test.ts` and focused tests under
`__tests__/unit/architecture/`. This document describes **policy only** — do not
duplicate allowlist arrays here.

## Ratchet rules

1. **No growth** — adding a new allowlist entry requires removing another entry in
   the same PR, unless the test explicitly allows net-new debt (rare).
2. **Serial PRs** — allowlist-editing PRs that touch `LIB_TO_DOMAIN_IMPORT_ALLOWLIST`
   or `DOMAIN_ENUM_IMPORT_ALLOWLIST` should stay **one OPEN at a time**. After each
   merge, rematch `origin/main` and resolve conflicts as the **union of deletions**
   (never resurrect cleared entries).
3. **No DI shims to clear debt** — prefer moving code to the correct layer or a thin
   `*-server.ts` wrapper over adapter injection solely to satisfy the gate.

## Permanent exceptions

| Allowlist                        | Entry              | Reason                                                                     |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `LIB_TO_DOMAIN_IMPORT_ALLOWLIST` | `customer-auth.ts` | Better Auth `beforeDelete` adapter; intentional permanent cross-layer hook |

Do not force this allowlist to zero or add compatibility shims to remove it.

## Integration adapters (LIB_TO_DOMAIN session-lock)

These `shared/lib` modules **intentionally** read domain settings or orchestrate
cross-surface infrastructure. They stay on the allowlist permanently; the ratchet
only blocks **new** lib → domain imports, not removal of documented exceptions.

| Category              | Files                                                                                | Reason                                                         |
| --------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Admin auth            | `admin-auth.ts`, `admin-resource-access.ts`                                          | IAP admin surface; shared lib is the facade entry              |
| Email                 | `email/*` (10 files)                                                                 | Template dispatch reads domain for settings / entity context   |
| Calendar / GBP / iCal | `calendar-sync/*`, `google-calendar/*`, `google-business-profile/*`, `ical/index.ts` | External sync adapters gated by domain settings                |
| Lexical embeds        | `lexical/resolve-internal-link-cards.ts`, `lexical/resolve-space-card-embeds.ts`     | Rich-text resolve paths need domain queries                    |
| Feature gate          | `features/check.ts`                                                                  | Cross-surface feature module check; admin + public both import |
| Turnstile             | `turnstile.ts` (+ `action-helpers.ts` if listed)                                     | Reads decrypted Turnstile settings from domain                 |
| Pages                 | `pages/require-published.ts`                                                         | Published-page guard for lib callers                           |
| Reservation slots     | `reservation/time-slots.ts`                                                          | Public availability helper; domain-backed                      |
| Sections              | `section-defaults.ts`                                                                | Page builder defaults tied to domain registry                  |
| Customer auth         | `customer-auth.ts`                                                                   | Better Auth `beforeDelete` hook (see above)                    |

Do **not** clear these via DI shims. New integration adapters must be added to the
allowlist **and** documented in this table in the same PR.

## Active allowlist categories

| Category                         | Test location                                  | Goal                                                                                       |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `LIB_TO_DOMAIN_IMPORT_ALLOWLIST` | `architecture-boundaries.test.ts`              | Eliminate undocumented `shared/lib` → `shared/domain` imports                              |
| `DOMAIN_ENUM_IMPORT_ALLOWLIST`   | `architecture-boundaries.test.ts`              | Route domain enums through `@/shared/lib/validations/enums/prisma-types` (currently empty) |
| Prisma placement ALLOWLIST       | `architecture-boundaries.test.ts`              | `shared/lib` files that call `prisma.*` directly (currently 2)                             |
| Auth legacy allowlists           | `auth-gate-ssot.test.ts`                       | Migrate app pages to gate facades                                                          |
| CDN / cache drift                | `type-safety-cast-and-cache-tag-drift.test.ts` | Document invalidation-only tags                                                            |

## Verification

After allowlist edits:

```sh
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture/auth-gate-ssot.test.ts
bun run validate
```
